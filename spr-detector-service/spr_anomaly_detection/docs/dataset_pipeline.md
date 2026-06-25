# 数据集构建与划分

## 数据现状

异常样本数量分布：

```text
Orion 翻钉:      20
Orion 铆钉屈服:  734
Pegasus 翻钉:    50
Pegasus 铆钉屈服: 318
Pegasus 铆模开裂: 32
total:          1154
```

## 当前推荐数据集

当前 README 推荐用下面这条命令构建一份带 metadata 的新数据集，避免覆盖先前实验使用的 `sjtu_dataset_clean_all_both`：

```bash
python build_spr_dataset.py \
  --input-root NIO_dataset \
  --output-dir spr_dataset_clean_all_both_with_metadata \
  --force
```

不传 `--vehicle` 时，会同时包含 `Pegasus` 和 `Orion` 两个车型。

当前构建结果为：

```text
数据集名: spr_dataset_clean_all_both_with_metadata
abnormal: 1154
normal:   103802
```

输出目录结构为：

```text
<output-dir>/
  abnormal_samples.npy
  abnormal_type_labels.npy
  abnormal_vehicle_labels.npy
  abnormal_vehicle_type_labels.npy
  abnormal_label_names.json
  abnormal_metadata.csv
  normal_samples.npy
  build_summary.json
  cleaned_nolabel/
```

其中 `abnormal_samples.npy` 和 `normal_samples.npy` 均为 `N x 1 x 256`。

abnormal metadata 的含义是：

- `abnormal_type_labels.npy`：异常类型标签，当前是翻钉、铆钉屈服、铆模开裂 3 类。
- `abnormal_vehicle_labels.npy`：车型标签，当前是 Orion、Pegasus。
- `abnormal_vehicle_type_labels.npy`：车型和异常类型的组合标签，当前最多 5 类。
- `abnormal_label_names.json`：上述标签 id 到名称的映射。
- `abnormal_metadata.csv`：每条 abnormal 样本对应的车型、异常类型、点位、来源文件和标签 id。

这些标签与 `abnormal_samples.npy` 的样本顺序一一对应。如果数据集是在该 metadata 功能加入前生成的，需要重新运行 `build_spr_dataset.py --force` 才能使用异常类型识别模型和 split 类型分布统计。

## 原始数据来源

### 异常样本

异常样本来自：

```text
NIO_dataset/Anomaly/**/*.csv
```

每个异常 CSV 文件中的每一行曲线都会被解析成一条异常样本。脚本当前支持的曲线字段为：

```text
曲线数据
ActualCurveData
```

脚本使用文件名 stem 作为完整点位，例如：

```text
MC040R01-33.csv -> MC040R01-33
```

### Normal 候选

normal 候选来自：

```text
NIO_dataset/Nolabel/**/Unlabeled/*.xlsx
```

当前主流程只保留与异常样本完整点位匹配的 normal 文件。也就是说，`clean_all` 的含义不是“所有 nolabel 全部保留”，而是：

- 与异常完整点位匹配的所有 nolabel 文件
- 这些文件中经过清洗后被保留的全部 normal 样本

## Normal 清洗逻辑

normal 清洗逻辑复刻 `clean.ipynb` 的默认配置，分两步执行。

### 第一步：coarse clean

规则为：

```text
前 5 个点均值与第 1 个点差值 < 0.0001
最后一个点 > 10
```

### 第二步：Isolation Forest

默认使用：

```text
IsolationForest(contamination=0.1, random_state=42)
```

只保留 `predict == 1` 的样本作为 clean normal。

默认行为是：

- 不启用 `--iforest-gradient`
- 不使用 `--disable-iforest`

## 可选采样参数

[`build_spr_dataset.py`](/home/ljt/projects/MARPP/build_spr_dataset.py) 也支持在构建阶段做采样：

```text
--normal-ratio
--normal-sample-size
--abnormal-sample-size
--vehicle
```

含义分别是：

- `--normal-ratio`：按点位控制 normal 数量，目标约为 `abnormal_count * ratio`
- `--normal-sample-size`：全局 normal 分层采样数量
- `--abnormal-sample-size`：全局 abnormal 分层采样数量
- `--vehicle`：只构建单一车型，如 `Pegasus` 或 `Orion`

当前主流程仍然建议优先构建 clean-all 数据集，再在训练和评估阶段控制 split、阈值和比较方案。

## 当前 MARPP 默认划分

当前默认划分由 [`Detectors/dataloader.py`](/home/ljt/projects/MARPP/Detectors/dataloader.py) 完成：

```text
normal train/dev/test = 80% / 10% / 10%
abnormal train/dev/test = 0% / 50% / 50%

train = normal_train
val   = normal_dev
thre  = normal_dev + abnormal_dev
test  = normal_test + abnormal_test
```

在 `sjtu_dataset_clean_all_both` 上，对应数量为：

```text
train: 83041 normal
val:   10380 normal
thre:  10380 normal + 577 abnormal = 10957
test:  10381 normal + 577 abnormal = 10958
```

这套划分用于当前主流程的 MARPP score sweep，例如：

```text
results/sjtu_dataset_clean_all_both_20260422_160216_score_sweep.json
results/sjtu_dataset_clean_all_both_20260422_172258_score_sweep.json
```

## Shared split：让 MARPP 与 CNN 在同一 final test set 上比较

为了让 MARPP 与 CNN 在完全相同的 `normal_train / normal_test / abnormal_test` 上做对照，仓库提供了 [`create_shared_split.py`](/home/ljt/projects/MARPP/create_shared_split.py)。

推荐命令：

```bash
python create_shared_split.py \
  --data-path spr_dataset_clean_all_both_with_metadata \
  --output results/spr_dataset_clean_all_both_with_metadata_shared_split.npz \
  --legacy-marpp-split \
  --legacy-abnormal-calibration-train-ratio 0.5 \
  --seed 2024
```

这份 split 的逻辑是：

1. normal split 完全复刻旧 MARPP dataloader。
2. abnormal 先复刻旧 MARPP 的 calibration/test 50/50 划分。
3. 再把旧 calibration abnormal 再切一半给 CNN 的 `abnormal_train`，剩余一半给 `abnormal_dev`。

因此得到：

```text
normal train/dev/test = 83041 / 10380 / 10381
abnormal train/dev/test = 288 / 289 / 577
```

对应使用方式是：

### MARPP

```text
train = normal_train
val   = normal_dev
thre  = normal_dev + abnormal_train + abnormal_dev
test  = normal_test + abnormal_test
```

其中 `abnormal_train` 会通过 `--include_abnormal_train_in_calibration` 显式加入 MARPP 的 threshold calibration。

### CNN

```text
train = normal_train + abnormal_train
dev   = normal_dev + abnormal_dev
test  = normal_test + abnormal_test
```

这使得：

- MARPP 和 CNN 共享同一个 final test set
- CNN 只比 MARPP 多使用了 `abnormal_train` 作为监督训练信号
- 当数据集中存在 abnormal metadata 时，split 文件的 `metadata` 字段还会保存 abnormal type、vehicle、vehicle/type 在 train/dev/test 中的分布。

## 为什么要区分默认主流程与 shared split

这两套划分服务于不同目的：

- 默认主流程：回答“当前无监督 MARPP 在 clean-all 数据集上能做到什么水平”。
- shared split：回答“在同一 final test set 上，MARPP 和轻量 CNN 谁更强”。

shared split 不是为了取代默认主流程，而是为了公平对照。
