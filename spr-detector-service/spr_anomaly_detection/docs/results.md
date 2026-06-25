# 实验结果与结果解释

## 已有历史结果

按较早版本代码的默认配置训练和测试，可以得到如下结果：

```text
Threshold: 0.33887964769267137
Accuracy: 0.9773, AUC : 0.9875, Precision : 0.8284, Recall : 0.8450, F-score : 0.8366
```

若调整决策阈值，令 `recall >= 0.9` 且尽可能提高 precision，可得到：

```text
threshold=0.230324
precision=0.6133
recall=0.9000
f1=0.7295
pred=587
fp=227
```

按 percentile 查看则有：

```text
percentile= 9%  precision=0.6813 recall=0.8925 f1=0.7727
percentile=10%  precision=0.6158 recall=0.8975 f1=0.7304
percentile=11%  precision=0.5647 recall=0.9050 f1=0.6955
```

这些数值仍可保留作为“历史上曾经观察到的现象”，但需要结合 legacy leakage 理解，不能和当前无泄漏主流程混为一谈。

## MARPP score sweep 代表结果

当前主流程支持 `mean_mse` 与 `topk_mean_mse`。在 README 中保留的代表结果如下：

| 数据集 | score | target recall | Test AUC | Precision | Recall | F1 | FP |
|---|---|---:|---:|---:|---:|---:|---:|
| `sjtu_dataset_clean_all_both` | `topk_mean_mse`, `topk=0.3` | 0.88 | 0.9754 | 0.5235 | 0.9081 | 0.6641 | 477 |
| `sjtu_dataset_clean_all_both` | `topk_mean_mse`, `topk=0.4` | 0.85 | 0.9757 | 0.5841 | 0.8544 | 0.6939 | 351 |
| `sjtu_dataset` | `topk_mean_mse`, `topk=0.5` | 0.85 | 0.9779 | 0.7454 | 0.8050 | 0.7740 | 55 |
| `sjtu_dataset` | `topk_mean_mse`, `topk=0.3` | 0.90 | 0.9812 | 0.6772 | 0.8600 | 0.7577 | 82 |

其中：

- `sjtu_dataset_clean_all_both` 上 `topk=0.3, target_recall=0.88` 是当前满足 `test recall >= 0.9` 时 precision 最高的组合。
- 之所以是 `0.88` 而不是 `0.90`，是因为 `best_row` 的筛选条件是“最终 `test recall >= 0.9`”，不是“命令行里写的 `target_recall` 最大”。

对应主结果文件为：

```text
results/sjtu_dataset_clean_all_both_20260422_160216_score_sweep.json
results/sjtu_dataset_clean_all_both_20260422_160216_score_sweep.csv
```

## precision-oriented MARPP 结果

如果反过来以 precision 为目标在 calibration set 上选阈值，主流程也支持：

```bash
python main.py \
  --data_path sjtu_dataset_clean_all_both \
  --target_precision 0.9 \
  --score_mode topk_mean_mse \
  --topk_ratio 0.3
```

对应 sweep 命令示例：

```bash
python sweep_marpp_scores.py \
  --data-path sjtu_dataset_clean_all_both \
  --include-mean \
  --topk-ratios 0.15,0.2,0.25,0.3,0.4,0.5 \
  --target-recalls \"\" \
  --target-precisions 0.85,0.9,0.92,0.95 \
  --min-test-precision 0.9
```

结果保存在：

```text
results/sjtu_dataset_clean_all_both_20260422_172258_score_sweep.json
results/sjtu_dataset_clean_all_both_20260422_172258_score_sweep.csv
```

代表性结果如下：

| score | target precision | Test AUC | Precision | Recall | F1 | FP |
|---|---:|---:|---:|---:|---:|---:|
| `topk_mean_mse`, `topk=0.3` | 0.90 | 0.9754 | 0.9130 | 0.5095 | 0.6541 | 28 |
| `topk_mean_mse`, `topk=0.4` | 0.90 | 0.9757 | 0.9074 | 0.5095 | 0.6526 | 30 |
| `topk_mean_mse`, `topk=0.25` | 0.90 | 0.9742 | 0.9281 | 0.4697 | 0.6237 | 21 |
| `topk_mean_mse`, `topk=0.3` | 0.92 | 0.9754 | 0.9340 | 0.4662 | 0.6220 | 19 |

这组结果说明：

- 当前模型可以通过提高阈值把 precision 推到 0.9 以上。
- 但代价是 recall 从约 0.9 显著下降到约 0.51。
- 如果目标是同时维持高 precision 和高 recall，仅靠阈值选择不够，还需要继续改进 score、训练目标或数据清洗策略。

## Shared split 下的 MARPP vs CNN

README 中与 MARPP/CNN 对比相关的唯一推荐结果如下。

### 1. MARPP 主流程 sweep 的代表性 best row

来源文件：

```text
results/sjtu_dataset_clean_all_both_20260422_160216_score_sweep.json
```

配置：

```text
dataset       = sjtu_dataset_clean_all_both
score_mode    = topk_mean_mse
topk_ratio    = 0.3
target_recall = 0.88
```

结果：

```text
Test AUC       = 0.9754
Test Precision = 0.5235
Test Recall    = 0.9081
Test F1        = 0.6641
FP             = 477
```

### 2. MARPP vs CNN 公平对比的 shared split 结果

共享 split 文件：

```text
results/sjtu_dataset_clean_all_both_legacy_marpp_shared_split.npz
```

MARPP 对应命令：

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

MARPP 对应结果：

```text
Threshold      = 0.15017896681623538
Test AUC       = 0.9754
Test Precision = 0.4778
Test Recall    = 0.9324
Test F1        = 0.6318
```

这个结果与旧主流程 sweep 中 `topk=0.3, target_recall=0.9` 那一行严格一致。

CNN 对应命令：

```bash
python cnn_baseline.py \
  --data-path sjtu_dataset_clean_all_both \
  --split-file results/sjtu_dataset_clean_all_both_legacy_marpp_shared_split.npz \
  --threshold-mode target_recall \
  --target-recall 0.9
```

CNN 的确认版主结果文件为：

```text
results/sjtu_dataset_clean_all_both_20260423_160503_cnn_baseline.json
```

结果：

```text
Threshold      = 0.610878050327301
Test AUC       = 0.999992988123049
Test Precision = 0.9983
Test Recall    = 0.9896
Test F1        = 0.9939
FP             = 1
FN             = 6
```

这份确认版结果是在删除旧 CNN 结果后，用同一份 `legacy_marpp_shared_split` 重新运行得到的，作为当前唯一保留的 CNN 主结果。

整体表格如下：

| 设置 | split 文件 | score / mode | Test AUC | Precision | Recall | F1 | FP |
|---|---|---|---:|---:|---:|---:|---:|
| MARPP | `results/sjtu_dataset_clean_all_both_legacy_marpp_shared_split.npz` | `topk_mean_mse`, `topk=0.3`, `target_recall=0.9` | 0.9754 | 0.4778 | 0.9324 | 0.6318 | 588 |
| CNN baseline | `results/sjtu_dataset_clean_all_both_legacy_marpp_shared_split.npz` | `target_recall=0.9` | 1.0000 | 0.9983 | 0.9896 | 0.9939 | 1 |

## Abnormal-only 异常类型分类 CNN

本节记录的是异常类型识别实验，不是 normal/abnormal 二分类实验。模型只输入 abnormal 样本，并在“样本已知为异常”的前提下预测异常类型：

```text
翻钉 / 铆模开裂 / 铆钉屈服
```

### 数据集构建命令

为了不覆盖历史实验使用的 `sjtu_dataset_clean_all_both`，本实验使用新目录：

```bash
python build_spr_dataset.py \
  --input-root NIO_dataset \
  --output-dir spr_dataset_clean_all_both_with_metadata \
  --force
```

构建配置：

```text
input_root             = NIO_dataset
vehicle                = all, Pegasus + Orion
curve_len              = 256
seed                   = 42
disable_iforest        = false
iforest_contamination  = 0.1
iforest_gradient       = false
abnormal_sample_size   = null
normal_sample_size     = null
normal_ratio           = null
```

构建后的总样本数：

```text
normal:   103802
abnormal: 1154
```

异常类型总分布：

| 类型 | 样本数 |
|---|---:|
| 翻钉 | 70 |
| 铆模开裂 | 32 |
| 铆钉屈服 | 1052 |

车型/异常类型总分布：

| 车型/类型 | 样本数 |
|---|---:|
| Orion/翻钉 | 20 |
| Orion/铆钉屈服 | 734 |
| Pegasus/翻钉 | 50 |
| Pegasus/铆模开裂 | 32 |
| Pegasus/铆钉屈服 | 318 |

### Split 生成命令

```bash
python create_shared_split.py \
  --data-path spr_dataset_clean_all_both_with_metadata \
  --output results/spr_dataset_clean_all_both_with_metadata_shared_split.npz \
  --legacy-marpp-split \
  --legacy-abnormal-calibration-train-ratio 0.5 \
  --seed 2024
```

split 总体数量：

| 集合 | normal | abnormal |
|---|---:|---:|
| train | 83041 | 288 |
| dev | 10380 | 289 |
| test | 10381 | 577 |

注意：abnormal-only 类型分类 CNN 只使用 abnormal 样本，normal 样本不进入该模型训练、验证或测试。

abnormal 类型分布：

| 集合 | 翻钉 | 铆模开裂 | 铆钉屈服 | 合计 |
|---|---:|---:|---:|---:|
| train | 18 | 6 | 264 | 288 |
| dev | 22 | 11 | 256 | 289 |
| test | 30 | 15 | 532 | 577 |

abnormal 车型/类型分布：

| 集合 | Orion/翻钉 | Orion/铆钉屈服 | Pegasus/翻钉 | Pegasus/铆模开裂 | Pegasus/铆钉屈服 |
|---|---:|---:|---:|---:|---:|
| train | 5 | 187 | 13 | 6 | 77 |
| dev | 7 | 189 | 15 | 11 | 67 |
| test | 8 | 358 | 22 | 15 | 174 |

### 训练与评估命令

```bash
python abnormal_type_cnn.py \
  --data-path spr_dataset_clean_all_both_with_metadata \
  --split-file results/spr_dataset_clean_all_both_with_metadata_shared_split.npz \
  --label-mode anomaly_type
```

结果文件：

```text
results/spr_dataset_clean_all_both_with_metadata_20260427_153218_abnormal_type_cnn.json
```

整体指标：

| 集合 | Accuracy | Balanced Accuracy | Macro F1 | Weighted F1 | Loss |
|---|---:|---:|---:|---:|---:|
| dev | 0.9792 | 0.9091 | 0.9435 | 0.9777 | 0.0734 |
| test | 0.9879 | 0.9111 | 0.9442 | 0.9873 | 0.0468 |

test 逐类指标：

| 类型 | Precision | Recall | F1 | Support |
|---|---:|---:|---:|---:|
| 翻钉 | 0.9600 | 0.8000 | 0.8727 | 30 |
| 铆模开裂 | 1.0000 | 0.9333 | 0.9655 | 15 |
| 铆钉屈服 | 0.9888 | 1.0000 | 0.9944 | 532 |

test confusion matrix，行是真实类型，列是预测类型，类别顺序为 `翻钉 / 铆模开裂 / 铆钉屈服`：

```text
[[ 24,   0,   6],
 [  1,  14,   0],
 [  0,   0, 532]]
```

### 结果是否合理

这个结果整体是合理的。理由是：

- dev/test 指标接近，未出现明显“dev 很好、test 崩掉”的现象。
- 大类 `铆钉屈服` 基本完全识别，符合它样本量最多、模式最稳定的预期。
- 小类指标没有被 accuracy 掩盖：`翻钉` test recall 为 0.8，仍是当前主要短板；这也解释了为什么 accuracy 接近 0.99，但 balanced accuracy 只有约 0.91。
- 混淆主要发生在 `翻钉 -> 铆钉屈服`，而不是所有类别互相混乱，说明模型确实学到了较稳定的异常类型边界。

需要谨慎解释的是：这不是端到端“质量偏离诊断”结果，而是 abnormal-only 类型识别结果。实际部署时仍需要先完成 normal/abnormal 检测，或者训练一个包含 normal 的 4-class/多阶段模型。此外，小类样本仍然很少，后续最好再做按点位、来源文件或工况分组的 group split 验证，检查是否存在样本级随机划分带来的泛化高估。

## 结果解释

这批结果支持几个结论：

1. `topk_mean_mse` 相比原始 `mean_mse` 更适合当前任务中的局部异常。
2. 当前 MARPP 的主要瓶颈不是 AUC，而是 false positive 导致的 precision 不足。
3. 当允许少量异常样本进入监督训练后，轻量 CNN 在当前数据分布下明显强于纯重构式 MARPP。
4. 这并不意味着 MARPP 没价值，而是说明“当前这批异常样本的判别边界已经足够稳定，监督学习能明显吃到红利”。
