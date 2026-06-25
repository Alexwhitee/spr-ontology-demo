# 异常类型识别设计方案

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

按 3-class 异常类型合并后：

```text
翻钉:      70
铆钉屈服: 1052
铆模开裂: 32
```

这个分布非常不均衡。尤其是翻钉和铆模开裂样本很少，所以异常类型识别不能只看整体 accuracy。

## 当前实现

[`build_spr_dataset.py`](/home/ljt/projects/MARPP/build_spr_dataset.py) 已在保存 `abnormal_samples.npy` 的同时保存异常元数据：

```text
abnormal_type_labels.npy
abnormal_vehicle_labels.npy
abnormal_vehicle_type_labels.npy
abnormal_label_names.json
abnormal_metadata.csv
```

[`create_shared_split.py`](/home/ljt/projects/MARPP/create_shared_split.py) 在这些 metadata 存在时，会把 abnormal type、vehicle、vehicle/type 在 train/dev/test 中的分布写入 split 文件的 `metadata` 字段。

新增的 [`abnormal_type_cnn.py`](/home/ljt/projects/MARPP/abnormal_type_cnn.py) 是 abnormal-only CNN：

```bash
python abnormal_type_cnn.py \
  --data-path spr_dataset_clean_all_both_with_metadata \
  --split-file results/spr_dataset_clean_all_both_with_metadata_shared_split.npz \
  --label-mode anomaly_type
```

`--label-mode anomaly_type` 是 3-class：

```text
翻钉
铆钉屈服
铆模开裂
```

`--label-mode vehicle_type` 是 5-class：

```text
Orion/翻钉
Orion/铆钉屈服
Pegasus/翻钉
Pegasus/铆钉屈服
Pegasus/铆模开裂
```

## 为什么多分类也用 Macro F1

precision、recall、F1 不是只能用于二分类。多分类里通常把每个类别当作 “one-vs-rest” 来计算一次 precision/recall/F1，然后再做平均。

几个常用口径：

- `accuracy`：所有样本中预测正确的比例。
- `macro F1`：每个类别的 F1 简单平均，每个类别权重相同。
- `balanced accuracy` / `macro recall`：每个类别 recall 的平均。
- `weighted F1`：按各类别样本量加权的 F1。
- `per-class precision/recall/F1`：逐类查看某个异常类型是否被识别出来。
- `confusion matrix`：查看模型把某类异常错成了哪一类。

在当前数据上，如果模型永远预测“铆钉屈服”，accuracy 也能达到：

```text
1052 / 1154 = 91.16%
```

但它对“翻钉”和“铆模开裂”的 recall 都是 0。这就是 accuracy 在强不均衡多分类任务中的主要问题：它会被大类支配，掩盖小类完全失败的情况。

因此异常类型识别建议同时报告：

```text
primary:   macro F1 + per-class recall/F1
secondary: accuracy + weighted F1 + confusion matrix
```

accuracy 当然能用，而且应该保留；只是它不适合作为唯一指标。

## 技术路线

### 路线一：MARPP + 类型识别

MARPP 仍然负责第一阶段异常检测：

```text
normal / abnormal
```

当样本被判为 abnormal 后，再进入异常类型识别器：

```text
abnormal curve -> 翻钉 / 铆钉屈服 / 铆模开裂
```

这种两阶段路线的优点是：

- 保留 MARPP 只用 normal 训练的能力，适合异常样本持续变化的场景。
- 第一阶段阈值仍可按业务目标调 recall 或 precision。
- 类型识别器只关注 abnormal 内部差异，任务边界更清楚。

主要风险是：

- 端到端召回会被第一阶段 MARPP 限制；MARPP 漏掉的异常不会进入类型识别。
- 如果 MARPP false positive 很多，第二阶段需要能处理“其实是 normal 的输入”，否则会产生误诊类型。

后续可以在第二阶段加入一个 `unknown/normal-like` 拒识机制，例如最大 softmax 概率低于阈值时不输出具体类型。

### 路线二：监督分类模型

监督 CNN 可以直接做两种任务：

```text
binary: normal / abnormal
type:   翻钉 / 铆钉屈服 / 铆模开裂
```

也可以做单阶段 4-class：

```text
0: normal
1: 翻钉
2: 铆钉屈服
3: 铆模开裂
```

优点是：

- 如果训练/测试分布一致，分类模型通常会显著强于纯重构式 MARPP。
- 可以直接输出异常类型，不需要再解释重构误差。
- 训练目标与最终诊断任务更一致。

主要风险是：

- 异常类型样本非常不均衡，小类泛化风险高。
- 如果未来出现新异常类型，闭集分类模型容易强行归到已知类别。
- 如果同一点位、同文件来源的曲线高度相似，随机样本级 split 可能高估泛化性能；更严格的 group split 仍然值得做。

当前仓库先实现 abnormal-only 3-class CNN，用于验证“已知异常内部能否分型”。确认这个任务稳定后，再考虑 4-class 端到端模型会更稳。
