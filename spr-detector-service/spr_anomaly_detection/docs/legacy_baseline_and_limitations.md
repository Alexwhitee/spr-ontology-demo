# Legacy Baseline 与当前局限

## Legacy baseline 的定位

`MARPP_legacy/` 目录保留的是项目早期源码，主要用于复现历史 baseline。它仍然有参考价值，但只能回答“旧流程当时大概跑到了什么数值”，不能回答“当前数据定义下模型的严格泛化能力如何”。

原因主要有三类：

- 数据集层面：legacy 使用的异常样本并不完备，且原始合作流程缺少完整可复现文档。
- 评估层面：legacy 的阈值校准和测试集之间存在交叉使用异常样本的问题。
- 阈值层面：legacy 还会直接从测试分数分布反推阈值，进一步引入乐观偏差。

## Legacy test leakage 说明

legacy dataloader 会先把异常样本划分为 `test_AN` 和 `val_AN`：

```python
test_AN, val_AN, test_AN_y, val_AN_y = getPercent(test_AN, test_AN_y, 0.1, 0)
```

其中 `val_AN` 进入阈值校准集：

```python
thre_data = np.concatenate((val_N, val_AN))
```

但随后同一批 `val_AN` 又被拼回最终测试集：

```python
test_data = np.concatenate([test_N, test_AN, val_AN])
```

这意味着部分异常样本同时参与了：

- 阈值校准
- 最终测试

因此 legacy 指标天然存在 test set leakage。

此外，legacy 版本还直接按测试分数分布取 percentile 阈值：

```text
thresh = np.percentile(output, 100 - args.threshold)
```

这种做法本身就利用了测试分布信息，所以 legacy 测试指标只能作为历史参考，不能作为无泄漏结论。

## 当前仓库如何处理这些问题

当前仓库通过三件事把旧问题尽量显式化：

1. 使用 [`build_spr_dataset.py`](/home/ljt/projects/MARPP/build_spr_dataset.py) 从 `NIO_dataset` 构建可复现数据集。
2. 使用当前 [`Detectors/dataloader.py`](/home/ljt/projects/MARPP/Detectors/dataloader.py) 将 MARPP 默认流程改成：

```text
train = normal_train
val   = normal_dev
thre  = normal_dev + abnormal_dev
test  = normal_test + abnormal_test
```

3. 如果需要做 MARPP 与 CNN 的公平对照，则通过 [`create_shared_split.py`](/home/ljt/projects/MARPP/create_shared_split.py) 先把 split 固定下来，再分别训练两类模型。

## 当前 MARPP 主流程的已知局限

即便移除了 legacy leakage，当前 MARPP 依然有几类需要正视的问题。

### 1. 当前 precision 仍然偏低

在 `sjtu_dataset_clean_all_both` 上，MARPP 即使通过 `topk_mean_mse` 改善了局部异常检测能力，在 `test recall >= 0.9` 的约束下，precision 仍然只有 0.52 左右。这说明 false positive 仍然是主矛盾。

### 2. GRU 的时间建模实现有问题

当前实现里，输入先被 flatten 成 `(batch, 256)`，随后：

```python
x_ = x.unsqueeze(0).permute(1, 0, 2)
```

这会形成：

```text
(seq_len=batch_size, batch=1, input_size=256)
```

也就是说，GRU 实际上沿 batch 维度建模，而不是沿单条曲线的 256 个时间点建模。结果是：

- 模型主要仍是一个带 memory 的 MLP autoencoder。
- GRU 可能引入 batch 依赖噪声。
- 这也是后续继续优化 MARPP 的最明确切入点之一。

### 3. 历史遗留特征分支没有真正进入主训练链路

代码中存在 SWT/DCT 相关逻辑，但当前实际训练时：

- DCT 特征基本没有真正参与主输入。
- SWT 更多只是中间变量，没有替代主输入曲线。

这些更像历史实验遗留，而不是当前主流程的关键部件。

### 4. 异常样本仍然不算完整

即使当前仓库已经重建了数据集构建流程，也不能把现有异常样本看作“完整覆盖所有异常模式”。因此：

- MARPP 结果反映的是当前异常集合下的可分性。
- CNN 的极高结果也首先说明“当前这批异常模式是可监督学习的”，而不自动代表未来所有未知异常都同样容易判别。

## 后续优化路线

### 1. 修正时间建模

优先级最高的是让模型真正沿单条曲线的 256 个时间点建模，例如：

```text
输入 shape: batch x 256 x 1
GRU / Conv1D / TCN 沿时间轴建模
每条曲线独立编码
```

### 2. 继续扩展 anomaly score

当前只有：

- `mean_mse`
- `topk_mean_mse`

后续可以尝试：

- 局部 top-k MSE
- 一阶差分重构误差
- 峰值位置附近加权误差
- latent distance / memory distance
- 重构误差 + memory attention 稀疏度或熵

例如：

```text
score = alpha * topk_mse
      + beta  * diff_topk_mse
      + gamma * memory_distance
```

### 3. 引入少量异常作为训练信号

不一定要完全转成纯分类器，也可以保留正常建模主体，再对异常加入 margin/ranking 约束。例如：

```text
loss = recon_loss_normal
     + lambda * max(0, margin + score_normal - score_abnormal)
```

这种半监督形式适合“异常样本有限，但又不想完全放弃开放集假设”的场景。

### 4. 继续做 normal 清洗和 hard negative 分析

当前 precision 低，说明 false positive 多。需要继续分析：

- false positive 是否来自 clean normal 中残留异常？
- 是否有某些点位天然噪声更高？
- 是否存在车型或工况分布不一致？

如果误报集中于少数点位，可继续尝试：

- 按点位建阈值
- 按点位或车型做 score normalization
- 做 point-specific / condition-specific calibration

### 5. 做模型集成

MARPP 和分类器并不一定是替代关系，也可以做互补：

- MARPP 更适合发现未见异常。
- 分类器更适合识别已知异常模式。

可以尝试：

```text
final score = calibrated weighted sum
```

## 两类方法的优劣

### MARPP 的优势

- 不需要异常样本参与训练。
- 更适合异常类型开放、未来异常形态未知的场景。
- 能充分利用大量 normal 样本。
- 对类别极不平衡天然友好。

### MARPP 的劣势

- 一旦异常和正常重构误差分布重叠，precision 很难靠阈值救回来。
- 正常样本尾部噪声会带来较多 false positive。
- 它学的是“不像正常”，不会直接学“哪些异常真的重要”。
- 局部异常容易被均值误差稀释。

### 分类模型的优势

- 可以直接学习异常与正常的判别边界。
- 如果异常模式稳定，precision 往往明显高于重构模型。
- 可以在 dev 上按目标 precision 或 target recall 做概率阈值校准。

### 分类模型的劣势

- 异常样本少时更容易过拟合。
- 对未来未见过的新异常类型，泛化风险更大。
- 如果训练异常分布与测试不一致，性能可能下降很快。
- 类别极不平衡，需要额外处理 sampler 和 loss。
