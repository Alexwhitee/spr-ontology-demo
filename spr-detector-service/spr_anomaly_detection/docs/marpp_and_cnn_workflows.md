# MARPP 与 CNN 训练流程

## 当前 MARPP 主流程

当前主流程里，MARPP 本质上是一个只用正常样本训练的重构式异常检测模型。

数据流为：

```text
normal train/dev/test = 80% / 10% / 10%
abnormal train/dev/test = 0% / 50% / 50%

train = train_N
val   = dev_N
thre  = dev_N + dev_AN
test  = test_N + test_AN
```

换句话说：

- 模型训练：只看正常样本
- checkpoint 保存：只看 `dev_N` 的重构 loss
- 阈值选择：看 `dev_N + dev_AN`
- 最终测试：看 `test_N + test_AN`

模型的分类能力来自这样一个假设：

- 如果模型只学习正常曲线的重构规律，正常样本应当能够被较好重构。
- 异常样本偏离正常模式，因此重构误差更大。

## 当前 MARPP 的结构概况

当前实现大致是：

```text
输入 256 点曲线
-> GRU 残差层
-> MLP encoder: 256 -> 128 -> 64
-> Memory module
-> MLP decoder: 64 -> 128 -> 256
-> reconstruction error 作为 anomaly score
```

训练 loss 为：

- MSE reconstruction loss
- memory attention entropy term

其中 entropy 项的作用是鼓励 memory 使用更有区分度，避免所有样本都拥挤到同一团平均表示上。

## 从 mean MSE 到 top-k reconstruction error

初始 MARPP 的打分方式是整条 256 点曲线的平均重构误差，也就是 `mean_mse`。这会带来一个问题：

- 局部异常会被整条曲线平均稀释。
- 正常曲线只要局部有噪声，也可能被平均误差拖高。

因此当前主流程增加了：

- `mean_mse`
- `topk_mean_mse`

`topk_mean_mse` 的含义是：只取误差最高的一部分点做平均。

运行示例：

```bash
python main.py \
  --data_path sjtu_dataset_clean_all_both \
  --target_recall 0.9 \
  --score_mode topk_mean_mse \
  --topk_ratio 0.3
```

也可以用 sweep 一次性扫描多组 `topk_ratio` 和 `target_recall`：

```bash
python sweep_marpp_scores.py \
  --data-path sjtu_dataset_clean_all_both \
  --include-mean \
  --topk-ratios 0.15,0.2,0.25,0.3,0.4,0.5 \
  --target-recalls 0.85,0.88,0.9
```

如果反过来希望在 calibration set 上满足目标 precision，则可使用：

```bash
python main.py \
  --data_path sjtu_dataset_clean_all_both \
  --target_precision 0.9 \
  --score_mode topk_mean_mse \
  --topk_ratio 0.3
```

对应 sweep 示例：

```bash
python sweep_marpp_scores.py \
  --data-path sjtu_dataset_clean_all_both \
  --include-mean \
  --topk-ratios 0.15,0.2,0.25,0.3,0.4,0.5 \
  --target-recalls \"\" \
  --target-precisions 0.85,0.9,0.92,0.95 \
  --min-test-precision 0.9
```

## CNN baseline 能回答什么问题

分类模型的核心价值不是“理论上一定超过 MARPP”，而是帮助回答一个很实际的问题：

```text
当前这批异常样本是否已经具有足够稳定、可学习的判别特征？
```

如果把异常样本按 `0.5 : 0.5 : 1` 划分 train/dev/test，相当于异常样本总量的：

```text
train: 25%
dev:   25%
test:  50%
```

以 `sjtu_dataset_clean_all_both` 为例：

```text
abnormal train: 288
abnormal dev:   289
abnormal test:  577
```

而 normal 有 103802 条。如果训练时直接使用自然比例，训练集大约会变成：

```text
train normal ≈ 83041
train abnormal ≈ 288
```

这种极端不平衡会很容易把分类器训练成“全判正常”。因此当前 CNN baseline 默认采用：

- `WeightedRandomSampler`
- dev 集选阈值
- test 集维持真实比例

## CNN baseline 的当前设置

[`cnn_baseline.py`](/home/ljt/projects/MARPP/cnn_baseline.py) 是独立脚本，不依赖 `main.py`，也不会改动 MARPP 的训练逻辑。

默认划分为：

```text
normal train/dev/test = 8 / 1 / 1
abnormal train/dev/test = 0.5 / 0.5 / 1
```

运行示例：

```bash
python cnn_baseline.py \
  --data-path sjtu_dataset_clean_all_both \
  --threshold-mode target_recall \
  --target-recall 0.9
```

若想按 dev F1 自动选阈值：

```bash
python cnn_baseline.py \
  --data-path sjtu_dataset_clean_all_both \
  --threshold-mode best_f1
```

输出会保存到 `results/`：

```text
<dataset>_<timestamp>_cnn_baseline.pt
<dataset>_<timestamp>_cnn_baseline.json
```

## Shared split 下的 MARPP 与 CNN 对照

为了让两类方法在同一个 final test set 上比较，可以先生成 shared split：

```bash
python create_shared_split.py \
  --data-path sjtu_dataset_clean_all_both \
  --output results/sjtu_dataset_clean_all_both_legacy_marpp_shared_split.npz \
  --legacy-marpp-split \
  --legacy-abnormal-calibration-train-ratio 0.5 \
  --seed 2024
```

### 用 shared split 重跑 MARPP

```bash
python main.py \
  --data_path sjtu_dataset_clean_all_both \
  --split_file results/sjtu_dataset_clean_all_both_legacy_marpp_shared_split.npz \
  --include_abnormal_train_in_calibration \
  --save_suffix legacy_marpp_shared_split_topk03 \
  --target_recall 0.9 \
  --score_mode topk_mean_mse \
  --topk_ratio 0.3
```

此时：

- 训练仍然只用 `normal_train`
- checkpoint 仍然只看 `normal_dev`
- calibration set 变为 `normal_dev + abnormal_train + abnormal_dev`

这相当于显式复刻旧 MARPP 里的完整 threshold calibration abnormal 集合，但不再把它拼回最终测试集。

### 用 shared split 重跑 CNN

```bash
python cnn_baseline.py \
  --data-path sjtu_dataset_clean_all_both \
  --split-file results/sjtu_dataset_clean_all_both_legacy_marpp_shared_split.npz \
  --threshold-mode target_recall \
  --target-recall 0.9
```

## 为什么 README 仍然保留 MARPP

即使当前 CNN 在 shared split 上结果显著更强，MARPP 仍然有明确价值：

- 它不依赖异常样本参与训练。
- 它更适合未知异常、开放异常类型场景。
- 它能更充分地利用大规模 normal 数据。

因此当前仓库更像是在回答两个不同问题：

- MARPP：当异常定义不稳定或未来异常未知时，无监督重构式检测能做到什么水平？
- CNN：如果允许少量已标注异常进入训练，在当前异常分布下能提升到什么水平？
