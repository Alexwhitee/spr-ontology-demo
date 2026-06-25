# SPR Anomaly Detection

![alt text](figures/overview.png)

这个仓库目前同时保留了两条线：

- `MARPP_legacy/`：项目早期代码，只用于复现历史 baseline。
- 当前主流程：围绕可复现数据集构建、无泄漏评估、MARPP 打分改造和 CNN baseline 展开。

更细的技术背景、实验细节和设计讨论已经拆到 [`docs/legacy_baseline_and_limitations.md`](/home/ljt/projects/MARPP/docs/legacy_baseline_and_limitations.md)、[`docs/dataset_pipeline.md`](/home/ljt/projects/MARPP/docs/dataset_pipeline.md)、[`docs/marpp_and_cnn_workflows.md`](/home/ljt/projects/MARPP/docs/marpp_and_cnn_workflows.md)、[`docs/results.md`](/home/ljt/projects/MARPP/docs/results.md)。原始长版内容也已归档到 [`docs/README_archive_before_reorg.md`](/home/ljt/projects/MARPP/docs/README_archive_before_reorg.md)。

## Legacy 局限性

`MARPP_legacy` 只能作为历史参考，不能作为严格泛化性能结论，主要原因有：

- legacy 使用的异常样本并不完备（仅使用 Pegasus 的400条异常样本，没有包括 Orion），且原始伙伴流程没有被完整文档化，历史结果更适合看成“旧流程上的参考数值”，不适合看成最终数据定义。
- legacy dataloader 在阈值校准时使用了一部分异常样本，而同一批异常样本随后又被拼回测试集，存在 test set leakage。
- legacy 还会直接根据测试分数分布选阈值，这会进一步抬高测试指标。

当前仓库已经把这些问题显式拆开：

- 数据集构建由 [`build_spr_dataset.py`](/home/ljt/projects/MARPP/build_spr_dataset.py) 负责。
- 默认 MARPP 主流程把阈值校准集和最终测试集分开。
- 若为了公平对照而复刻旧 split，会通过 [`create_shared_split.py`](/home/ljt/projects/MARPP/create_shared_split.py) 显式生成共享划分文件。

更完整的 leakage 说明、legacy 代码路径和后续优化讨论见 [`docs/legacy_baseline_and_limitations.md`](/home/ljt/projects/MARPP/docs/legacy_baseline_and_limitations.md)。

## 当前主流程的数据集构建

我们所能获得的原始数据放在 `NIO_dataset` 下，目录结构大致如下：

```text
NIO_dataset/
  Anomaly/
    Orion/
      翻钉/
      铆钉屈服/
    Pegasus/
      翻钉/
      铆钉屈服/
      铆模开裂/
  Nolabel/
    Orion/Unlabeled/
    Pegasus/Unlabeled/
```

其中 `Anomaly` 是已标注异常数据，按车型和异常类型分目录；目录内的 CSV 文件是异常曲线数据，PNG 和统计表用于人工查看与汇总。`Nolabel` 是未标注候选正常数据，按车型放在 `Unlabeled/*.xlsx` 中，构建脚本会从中筛选与异常点位匹配的曲线并做 normal 清洗。

当前推荐先从原始 `NIO_dataset` 构建一版带 metadata 的 `clean-all`，写到新的目录：

```bash
python build_spr_dataset.py \
  --input-root NIO_dataset \
  --output-dir spr_dataset_clean_all_both_with_metadata \
  --force
```

这条命令默认同时包含 `Pegasus` 和 `Orion` 两个车型，当前构建结果为：

```text
abnormal: 1154
normal:   103802
```

构建脚本同时保存 abnormal 元数据，供异常类型识别使用：

```text
abnormal_type_labels.npy
abnormal_vehicle_labels.npy
abnormal_vehicle_type_labels.npy
abnormal_label_names.json
abnormal_metadata.csv
```

主流程里的构建原则是：

- 异常样本来自 `NIO_dataset/Anomaly/**/*.csv`，每一行曲线解析成一条异常样本。
- normal 候选来自 `NIO_dataset/Nolabel/**/Unlabeled/*.xlsx`。
- 只保留与异常样本“完整点位”匹配的 normal 文件。
- normal 清洗分两步：先做 coarse clean，再做 `IsolationForest(contamination=0.1, random_state=42)`。
- 默认保留所有匹配点位下清洗后的 normal，不在构建阶段做 normal 下采样。

当前 MARPP 默认划分由 [`Detectors/dataloader.py`](/home/ljt/projects/MARPP/Detectors/dataloader.py) 完成：

```text
normal train/dev/test = 80% / 10% / 10%
abnormal train/dev/test = 0% / 50% / 50%

train = normal_train
val   = normal_dev
thre  = normal_dev + abnormal_dev
test  = normal_test + abnormal_test
```

在 `sjtu_dataset_clean_all_both` 上对应为：

```text
train: 83041 normal
val:   10380 normal
thre:  10380 normal + 577 abnormal = 10957
test:  10381 normal + 577 abnormal = 10958
```

完整构建逻辑、清洗规则、可选采样参数和 shared split 生成方式见 [`docs/dataset_pipeline.md`](/home/ljt/projects/MARPP/docs/dataset_pipeline.md)。

## Usage

MARPP 主流程示例：

```bash
python main.py \
  --data_path spr_dataset_clean_all_both_with_metadata \
  --target_recall 0.9 \
  --score_mode topk_mean_mse \
  --topk_ratio 0.3
```

批量扫描不同 score 配置：

```bash
python sweep_marpp_scores.py \
  --data-path spr_dataset_clean_all_both_with_metadata \
  --include-mean \
  --topk-ratios 0.15,0.2,0.25,0.3,0.4,0.5 \
  --target-recalls 0.85,0.88,0.9
```

如果想按目标 precision 选阈值：

```bash
python main.py \
  --data_path spr_dataset_clean_all_both_with_metadata \
  --target_precision 0.9 \
  --score_mode topk_mean_mse \
  --topk_ratio 0.3
```

CNN baseline 示例：

```bash
python cnn_baseline.py \
  --data-path spr_dataset_clean_all_both_with_metadata \
  --threshold-mode target_recall \
  --target-recall 0.9
```

异常类型识别 CNN 示例：

```bash
python abnormal_type_cnn.py \
  --data-path spr_dataset_clean_all_both_with_metadata \
  --split-file results/spr_dataset_clean_all_both_with_metadata_shared_split.npz \
  --label-mode anomaly_type
```

`--label-mode anomaly_type` 是 3-class 任务：翻钉、铆钉屈服、铆模开裂。若要把车型也合并进类别，可用 `--label-mode vehicle_type`，对应 Orion/翻钉、Orion/铆钉屈服、Pegasus/翻钉、Pegasus/铆钉屈服、Pegasus/铆模开裂。

如需让 MARPP 与 CNN 共享完全一致的 final test set，先生成 shared split：

```bash
python create_shared_split.py \
  --data-path spr_dataset_clean_all_both_with_metadata \
  --output results/spr_dataset_clean_all_both_with_metadata_shared_split.npz \
  --legacy-marpp-split \
  --legacy-abnormal-calibration-train-ratio 0.5 \
  --seed 2024
```

然后：

```bash
python main.py \
  --data_path spr_dataset_clean_all_both_with_metadata \
  --split_file results/spr_dataset_clean_all_both_with_metadata_shared_split.npz \
  --include_abnormal_train_in_calibration \
  --save_suffix legacy_marpp_shared_split_topk03 \
  --target_recall 0.9 \
  --score_mode topk_mean_mse \
  --topk_ratio 0.3
```

```bash
python cnn_baseline.py \
  --data-path spr_dataset_clean_all_both_with_metadata \
  --split-file results/spr_dataset_clean_all_both_with_metadata_shared_split.npz \
  --threshold-mode target_recall \
  --target-recall 0.9
```

## 模型训练方案

![alt text](figures/method-comparison.png)

### MARPP

当前 MARPP 是只用正常样本训练的重构式异常检测模型：

- 训练只看 `normal_train`。
- checkpoint 只看 `normal_dev` 的重构 loss。
- 阈值在 calibration set 上选取。
- 测试在 `normal_test + abnormal_test` 上完成。

当前支持两种 anomaly score：

- `mean_mse`：整条 256 点曲线的平均重构误差。
- `topk_mean_mse`：只取误差最高的一部分点做平均，更适合局部异常。

`topk_mean_mse` 是当前主流程里最值得优先尝试的配置，命令行通过 `--score_mode topk_mean_mse --topk_ratio <ratio>` 控制。

### CNN baseline

[`cnn_baseline.py`](/home/ljt/projects/MARPP/cnn_baseline.py) 提供了一个独立的轻量 1D CNN 有监督 baseline：

- 输入为 `1 x 256` 曲线。
- 默认划分为 `normal 8/1/1` 与 `abnormal 0.5/0.5/1`。
- 训练时默认使用 `WeightedRandomSampler`，避免极端类不平衡导致“全判正常”。
- dev 集负责选阈值，test 集保持真实比例。

更完整的训练流、shared split 对照实验、模型优缺点和后续优化路线见 [`docs/marpp_and_cnn_workflows.md`](/home/ljt/projects/MARPP/docs/marpp_and_cnn_workflows.md)。

## 代表性结果

### MARPP 主流程代表结果

来源：

```text
results/sjtu_dataset_clean_all_both_20260422_160216_score_sweep.json
```

最佳代表行对应：

```text
dataset       = sjtu_dataset_clean_all_both
score_mode    = topk_mean_mse
topk_ratio    = 0.3
target_recall = 0.88
```

结果：

| Test AUC | Precision | Recall | F1 | FP |
|---:|---:|---:|---:|---:|
| 0.9754 | 0.5235 | 0.9081 | 0.6641 | 477 |

这说明当前 MARPP 在 `test recall >= 0.9` 的目标下，`topk_mean_mse` 明显优于原始 mean MSE，但 precision 仍然受 false positive 限制。

### Shared split 下的 MARPP vs CNN

共享 split：

```text
results/sjtu_dataset_clean_all_both_legacy_marpp_shared_split.npz
```

代表性结果：

| 方法 | 配置 | Test AUC | Precision | Recall | F1 | FP |
|---|---|---:|---:|---:|---:|---:|
| MARPP | `topk_mean_mse`, `topk=0.3`, `target_recall=0.9` | 0.9754 | 0.4778 | 0.9324 | 0.6318 | 588 |
| CNN baseline | `target_recall=0.9` | 1.0000 | 0.9983 | 0.9896 | 0.9939 | 1 |

CNN 的确认版结果文件为：

```text
results/sjtu_dataset_clean_all_both_20260423_160503_cnn_baseline.json
```

这套对照表明：在当前数据分布下，少量异常样本进入监督训练后，最终诊断性能显著强于纯重构式 MARPP。

### Abnormal-only 异常类型识别

异常类型识别实验使用新构建的带 metadata 数据集：

```text
spr_dataset_clean_all_both_with_metadata
```

该实验只输入 abnormal 样本，在“样本已知为异常”的前提下做 3-class 分类：

```text
翻钉 / 铆模开裂 / 铆钉屈服
```

对应结果文件：

```text
results/spr_dataset_clean_all_both_with_metadata_20260427_153218_abnormal_type_cnn.json
```

代表性结果：

| 集合 | Accuracy | Balanced Accuracy | Macro F1 | Weighted F1 |
|---|---:|---:|---:|---:|
| dev | 0.9792 | 0.9091 | 0.9435 | 0.9777 |
| test | 0.9879 | 0.9111 | 0.9442 | 0.9873 |

test 逐类结果：

| 类型 | Precision | Recall | F1 | Support |
|---|---:|---:|---:|---:|
| 翻钉 | 0.9600 | 0.8000 | 0.8727 | 30 |
| 铆模开裂 | 1.0000 | 0.9333 | 0.9655 | 15 |
| 铆钉屈服 | 0.9888 | 1.0000 | 0.9944 | 532 |

这说明已知异常样本内部的类型边界相对清楚，但小类仍然是主要风险；尤其是 `翻钉` 的 recall 低于大类。这个结果不能直接等同于端到端质量偏离诊断结果，因为它不包含 normal/abnormal 第一阶段检测。

更多 sweep 表格、precision-oriented 结果、异常类型识别配置、legacy 历史数值和结果解读见 [`docs/results.md`](/home/ljt/projects/MARPP/docs/results.md)。

## 文档导航

- [`docs/legacy_baseline_and_limitations.md`](/home/ljt/projects/MARPP/docs/legacy_baseline_and_limitations.md)：legacy baseline、test leakage、当前实现局限和优化路线。
- [`docs/dataset_pipeline.md`](/home/ljt/projects/MARPP/docs/dataset_pipeline.md)：数据集构建、清洗、采样、当前实验划分和 shared split。
- [`docs/marpp_and_cnn_workflows.md`](/home/ljt/projects/MARPP/docs/marpp_and_cnn_workflows.md)：MARPP 主流程、CNN baseline、训练与阈值方案、方法对比。
- [`docs/anomaly_type_identification_design.md`](/home/ljt/projects/MARPP/docs/anomaly_type_identification_design.md)：异常类型识别任务、MARPP/分类模型路线和多分类指标说明。
- [`docs/results.md`](/home/ljt/projects/MARPP/docs/results.md)：已有结果、代表性 sweep、shared split 对照实验和结果说明。
