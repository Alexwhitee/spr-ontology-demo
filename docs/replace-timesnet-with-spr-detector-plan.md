# 用 SPR-Anomaly-Detection（MARPP）替换 TimesNet 检测 —— 集成规划

> 状态：规划草案（待评审）
> 日期：2026-06-25
> 作者：ZCode
> 范围：`spr-ontology-demo`（主应用）+ `timesnet-service`（待移除）+ `SPR-Anomaly-Detection`（待集成）

---

## 0. 一句话目标

把主应用中"预测型"的 TimesNet 时序服务，整体替换为基于 **SPR-Anomaly-Detection / MARPP** 的"重构型"异常检测服务，并改造前后端与文档以适配新语义。

---

## 1. 现状梳理（已调研确认）

### 1.1 架构与接线点（TimesNet 现状）

主应用 `spr-ontology-demo` 是一个 Cloudflare Worker（TS）后端 + React/Vite 前端，本地演示时三进程：

```
前端(5173) ──► Worker(8787) ──► timesnet-service(8008, Python/FastAPI)
                    │
                    └─（mock/llm 规则检测，本地内置）
```

检测链路核心在 Worker `backend/src/index.ts`：
- `handleDetectionRun`（343）按 `modelMode` 分流：`timesnet` 走 `runTimesNetDetection`，否则走 shared 的 `runDetection`（mock/llm）。
- `runTimesNetDetection`（363）→ `callTimesNetForecast`（415）发起 `POST {apiBase}/api/timesnet/forecast`，再用 `normalizeTimesNetPrediction`（440）做严格 schema 校验。
- 契约类型 `TimeSeriesPrediction` 定义在 `shared/ontology-service.ts`（94）。

**TimesNet 的所有引用点（待剥离/改造）共 16 处**，分 6 层：

| 层 | 文件 | 说明 |
|---|---|---|
| 后端调用 | `backend/src/index.ts` | 4 个函数 + `/api/timesnet/forecast` 调用 |
| 后端配置 | `backend/src/types/demo.ts:27-29`、`backend/.dev.vars.example` | 3 个 env 变量 |
| 共享类型/逻辑 | `shared/ontology-service.ts` | `modelMode` 联合类型、`TimeSeriesPrediction`、本体类 |
| 前端 | `frontend/.../Owl2WorkbenchView.tsx`、`owl2WorkbenchState.ts`、`styles.css` | 模式选项、预测曲线图表、文案 |
| 测试 | `tests/ontology-worker-e2e.test.ts:121-227` | 断言 TimesNet 契约 |
| 文档/本体 | `docs/timesnet-*.md`、`ontology/model.owl`、`quality.owl` | 设计文档、OWL 类 |

### 1.2 timesnet-service（待整体移除）

`timesnet-service/` 是 FastAPI 服务：
- `POST /api/timesnet/forecast`：输入 `{recordId, curves:{riveting,envelope}, horizon=24, seqLen=96, useCache}`；输出 `TimeSeriesPrediction`（预测曲线 + 包络 + riskCategory）。
- `GET /health`。
- 实际跑的是启发式/缓存（`artifacts/cache/riprop-*.json` 共 177 个缓存结果，多含 `"No module named 'torch'"`），真 PyTorch 路径需 tslib + checkpoint。

### 1.3 SPR-Anomaly-Detection（待集成）

Python 项目，**无依赖清单文件**（需从 import 推断：torch/numpy/scikit-learn/scipy/tqdm/pywt 等）。
- **核心检测器 MARPP**：无监督重构型 AutoEncoder（GRU+Memory+MLP），只训练正常曲线，对每条 **256 点**整条曲线输出**一个重构异常分数**（`mean_mse` 或 `topk_mean_mse`）。
- 入口：`main.py`（训练+阈值标定+测试）、`valid.py`（加载已存 `model.pkl` + `score_params.npy` 对 `inference_samples.npy` 推理）。
- 数据格式：`.npy`，形状 `N x 1 x 256`，加载时 `/100` 归一化、转置为 `N x 256 x 1`。
- 注册机制：`Detectors/model_wrapper.py` 按 `run_{model_name}` 函数名分发，目前仅 `MARPP`。
- 已有产线脚本：`build_spr_dataset.py`（从 `NIO_dataset` 建 npy）、`create_shared_split.py`（可复现切分）。

### 1.4 关键契约差异（本规划的核心难点）

| 维度 | TimesNet（现状） | SPR-AD / MARPP（目标） |
|---|---|---|
| 范式 | 预测型（96→24 点） | 重构型（256 点整条） |
| 输出 | 预测曲线 + 预测包络 + riskCategory | **一个标量异常分数** + 可选重构曲线 |
| 判定 | 预测是否越出包络 | 分数是否过阈值（normal/abnormal） |
| 输入曲线长度 | seqLen=96 | **256**（与 Demo 曲线 250/256 天然匹配 ✅） |
| 标量输出语义 | `anomalyScore`（越界比例派生） | 重构 MSE 分（越大越异常） |
| horizon 概念 | 有（预测步数） | **无**（整条检测） |

> ⚠️ 前端图表当前是"预测曲线/预测包络"语义，替换后要么改为"原始曲线 vs 重构曲线 + 异常分高亮"，要么保留字段名但改语义——**这是必须在动工前敲定的产品决策**（见 §5.1）。

---

## 2. 集成总体方案

### 2.1 三种候选集成形态

**方案 A（推荐）：同构替换 —— 新建 `spr-detector-service`，复刻原服务边界**
- 新建 Python 服务（结构对齐原 `timesnet-service`），暴露同构的 `/api/spr-detect/detect`（或沿用 `/forecast` 路径）+ `/health`。
- 把 SPR-Anomaly-Detection 作为**子目录/子模块**引入服务内，服务只 import 其 `Detectors`，不暴露训练脚本。
- Worker 侧把"调用 timesnet"改为"调用 spr-detector"，契约字段从预测型映射为重构型。
- ✅ 改动可控、职责清晰、可独立测试、符合最小惊讶原则。

**方案 B：就地改造 timesnet-service**
- 直接把现有 `timesnet-service/src` 换成 MARPP 推理代码，保留 FastAPI 壳。
- 优点：壳子/缓存/脚本结构复用；缺点：命名仍叫 timesnet 易混淆，缓存等需重做。

**方案 C：把 SPR-AD 作为 git submodule 嵌入主仓库**
- 主仓库根目录新增 `spr-detector-service/`，把 `SPR-Anomaly-Detection` 作为子目录或子模块，服务层薄封装。
- 优点：版本可追溯；缺点：引入子模块管理复杂度。

> **推荐方案 A，并在主仓库内以普通子目录形式引入 SPR-Anomaly-Detection（非 submodule，保持简单）**，服务命名 `spr-detector-service`。

### 2.2 目标架构

```
前端(5173) ──► Worker(8787) ──► spr-detector-service(8008, FastAPI) ──► MARPP(SPR-Anomaly-Detection)
                    │                    │
                    └─（mock/llm 规则检测）└─ 加载 model.pkl + score_params.npy 推理
```

---

## 3. 剥离 TimesNet 清单（删除/替换）

按层列出，"剥离"指删除或替换为新检测：

### 3.1 Python 服务层
- [ ] 删除（或归档重命名）`timesnet-service/`（`src/`、`artifacts/cache/riprop-*.json` ×177、`scripts/`、`tests/`、`pyproject.toml`）。
- [ ] 评估 `scripts/prepare_demo_model.py` 的等价物——新服务需要"预生成缓存"脚本。

### 3.2 后端 Worker 层
- [ ] `backend/src/index.ts`：重写 `runTimesNetDetection` → `runSprDetection`；`callTimesNetForecast` → `callSprDetect`；`normalizeTimesNetPrediction` → `normalizeSprPrediction`；路径 `/api/timesnet/forecast` → 新路径。
- [ ] `backend/src/types/demo.ts:27-29`：env 变量 `TIMESNET_*` → `SPR_DETECTOR_*`（`SPR_DETECTOR_API_BASE_URL` / `_TIMEOUT_MS` / `_API_KEY`）。
- [ ] `backend/.dev.vars.example`：更新示例。

### 3.3 共享类型/本体层
- [ ] `shared/ontology-service.ts`：`modelMode` 联合类型 `"timesnet"` → `"spr"`（或 `"marpp"`）；重定义 `TimeSeriesPrediction` 为 `ReconstructionPrediction`（重构型契约，见 §5.2）；更新本体类名/标签（`TimeSeriesForecastModel` → 可保留或改 `AnomalyDetectionModel`）。

### 3.4 前端层
- [ ] `Owl2WorkbenchView.tsx`：`DetectionModelMode`、默认模式、`<select>` 选项、`TimesNetForecastChart` 组件 → `ReconstructionChart`（原始曲线 vs 重构曲线 + 异常分/阈值线）。
- [ ] `owl2WorkbenchState.ts`、`styles.css`：文案与样式类名 `.timesnet-*` → `.spr-*`。
- [ ] 默认 `modelMode` 由 `"timesnet"` 改为新模式。

### 3.5 测试层
- [ ] `tests/ontology-worker-e2e.test.ts:121-227`：重写为新服务的契约断言、缓存命中、降级路径。

### 3.6 文档层
- [ ] 删除/归档 `docs/timesnet-integration-deep-dive.md`、`docs/timesnet-local-demo.md`。
- [ ] 新增 `docs/spr-detector-integration.md`、`docs/spr-detector-local-demo.md`。
- [ ] 更新 `ontology/model.owl`、`quality.owl` 中的类/属性。

---

## 4. 集成 SPR-Anomaly-Detection 清单（新增）

### 4.1 服务封装（新建 `spr-detector-service/`）
- [ ] `pyproject.toml`：依赖 torch/numpy/scikit-learn/scipy/tqdm/pywt/fastapi/uvicorn/pydantic；Python ≥3.11。
- [ ] `src/app.py`：FastAPI，`GET /health` + `POST /api/spr-detect/detect`。
- [ ] `src/spr_detector.py`：薄封装，import `SPR-Anomaly-Detection/Detectors`，加载 `model.pkl` + `score_params.npy`，调用 `run_MARPP` / `decision_function`。
- [ ] `src/curve_io.py`：把前端曲线（riveting 250/256 点）适配为 MARPP 输入（`N x 256`，`/100`）。
- [ ] `src/scoring.py`：用 `score_params.npy`（min/max/threshold）把原始分 min-max 归一化到 [0,1] 并过阈值。
- [ ] `src/demo_cache.py`：缓存机制（沿用思路，键=recordId）。
- [ ] `scripts/serve.sh`、`scripts/prepare_demo_cache.py`、`tests/`。

### 4.2 模型与参数产物
- [ ] 在 `SPR-Anomaly-Detection` 上用真实数据跑 `main.py` 产出 `model.pkl` + `score_params.npy`（数据来自 `SPR异常检测数据集/`）。
- [ ] 把产物放入 `spr-detector-service/artifacts/model/`。

### 4.3 数据准备
- [ ] 用 `build_spr_dataset.py` 从 `SPR异常检测数据集/{Anomaly,Nolabel}/{Orion,Pegasus}` 构建 npy。
- [ ] 用 `create_shared_split.py` 生成可复现切分。
- [ ] （可选）把前端 `frontend/public/data/curves/riprop-*.json` 的 177 条曲线作为推理样本，预生成缓存。

### 4.4 依赖与环境
- [ ] 为 SPR-Anomaly-Detection 补一份 `requirements.txt`（当前缺失）。
- [ ] 统一 Python 虚拟环境，验证 MPS/CPU 推理。

---

## 5. 契约设计（已确认）

### 5.1 产品决策（已与用户确认）

| 决策 | 选择 |
|---|---|
| **D1 前端展示** | ① 原始曲线 vs 重构曲线 + 逐点误差 + 异常分 + 阈值线 |
| **D2 命名** | 新模式 `marpp`；服务名 `spr-detector-service`；端点路径改用 `/api/spr-detect/detect` |
| **D3 horizon/seqLen** | **删除**这两个字段（重构型无预测步长概念） |
| **D4 缓存** | 预生成缓存（沿用原 `prepare_demo_model` 思路，新写 `prepare_demo_cache.py`） |

### 5.2 目标响应契约（定稿）

```ts
// shared/ontology-service.ts
export type ReconstructionPrediction = {
  modelName: "MARPP";            // 原 "TimesNet"
  modelVersion: string;
  mode: "live" | "cache" | "fallback";
  inputCurve: number[];          // 输入铆接曲线（归一化前/后约定）
  reconstructionCurve: number[]; // 模型重构曲线（替代 predictedCurve）
  pointError: number[];          // 逐点 |input - reconstruction|（替代 predictedDelta）
  anomalyScore: number;          // 归一化后异常分 [0,1]
  threshold: number;             // 判定阈值
  riskCategory: "normal" | "abnormal" | "review";  // 重定义
  confidence: number;
  evidence: string[];
  durationMs?: number;
};
```
> 注意：原 `normalizeTimesNetPrediction` 有 `modelName !== "TimesNet"` 硬校验（index.ts:443），新契约必须同步更新该校验为 `"MARPP"`。
> horizon/seqLen 字段已按 D3 删除；envelopeCurve 在重构型下不再需要，前端图表改为 input/reconstruction/pointError + threshold 线。

### 5.3 Worker 侧映射（草案）
- `riskCategory === "abnormal"` → `category:"curve_above_envelope"|"abnormal"`, `severity:"warning"`。
- 分数 `anomalyScore` 直接用于前端仪表盘。
- 重构曲线 + 逐点误差用于图表。

---

## 6. 实施里程碑（建议顺序）

| # | 里程碑 | 交付物 | 验收 |
|---|---|---|---|
| M0 | **决策确认** ✅ | §5/§8 决策定稿 | 用户确认（2026-06-25） |
| M2 | **新服务雏形（启发式占位）** | `spr-detector-service`：`/health` + `/api/spr-detect/detect`，用轻量启发式重构打分（无 torch），含缓存读取 | curl/pytest 通过，返回符合 §5.2 契约 |
| M3 | **Worker 契约切换** | 后端调用切到新服务，env 改名 `SPR_DETECTOR_*`，新契约校验 | 后端单测绿 |
| M4 | **前端改造** | ReconstructionChart（原始/重构/逐点误差/阈值线）+ 文案 + 模式默认 `marpp` | 本地三进程联调可见 |
| M5 | **剥离 TimesNet** | 删除 `timesnet-service` 及 16 处残留引用 | 全局无 timesnet 引用、测试绿 |
| M6 | **文档与缓存** | 新文档、本体 `model.owl`/`quality.owl` 更新、预生成缓存 | runbook 可复现 |
| M1 | **真 MARPP 训练（增强项，后置）** | venv + torch/pywt/pandas + 数据集构建 + `main.py` 训练产出 `model.pkl`/`score_params.npy` | `valid.py` 推理通过，替换启发式 |

> **顺序说明（D7）**：先用启发式占位把 M2→M3→M4→M5 全链路打通（无需 torch，快速验证契约与 UI），再回头做 M1 真 MARPP 训练作为模型质量增强。这样前端/后端契约可尽早定型，不被训练耗时阻塞。
> 可并行：M5 的"删除"与 M2 早期可并行；M3/M4 为串行关键路径。

---

## 7. 风险与注意点

1. **契约语义差异最大**：预测型→重构型是范式转变，前端/本体/测试都要跟上，工作量集中在 M3/M4。
2. **MARPP 训练数据归属**：需确认 `SPR异常检测数据集/` 可用于训练，且产物可提交或需 gitignore。
3. **依赖缺失清单**：SPR-Anomaly-Detection 无 `requirements.txt`，需补齐并固定版本（torch/scipy/pywt 等）。
4. **设备/性能**：MARPP 推理用 MPS/CPU，单条曲线延迟需控制在 Worker 超时（默认 3000ms）内；否则依赖缓存。
5. **曲线长度 250 vs 256**：前端 riveting 是 250 点，MARPP 要 256 点，`curve_io.py` 需处理补齐/截断/重采样。
6. **本体内"TimesNet"硬标签**：`shared/ontology-service.ts:220` 等有中文字面量"…本地 TimesNet 服务"，剥离时一并更新。
7. **回归**：现有 e2e 测试断言了旧契约，剥离后必须重写，否则 CI 红。

---

## 8. 已确认决策（评审通过 2026-06-25）

| # | 问题 | 决策 |
|---|---|---|
| D1 | 前端展示形态 | ① 原始 vs 重构曲线 + 逐点误差 + 阈值线 |
| D2 | 命名 | 模式 `marpp`；服务 `spr-detector-service`；端点 `/api/spr-detect/detect` |
| D3 | horizon/seqLen | 删除 |
| D4 | 缓存 | 预生成缓存 |
| D5 | **SPR-AD 源码纳入方式** | **拷入主仓库作子目录**（删其 `.git`，统一管理，产物 gitignore） |
| D6 | **模型产物归属** | **放 `artifacts/` 并 gitignore**（runbook 记录重训方法） |
| D7 | **训练执行** | **M2 先跳过真模型用启发式占位**，全链路打通后再补真 MARPP 训练 |

**保留事项（沿用，无需变更）**：保留"服务不可用→降级到本体规则"行为（与原 timesnet 一致）；剥离后可移除对 `Time-Series-Library`（tslib）的依赖。

> ⚠️ D7 改变了里程碑顺序：M2（服务雏形，启发式占位）提前打通全链路，M1（真 MARPP 训练）后置为增强项。详见 §6 修订。

---

## 9. 文件影响清单（速查）

**删除/归档**
- `timesnet-service/`（整目录）
- `docs/timesnet-integration-deep-dive.md`、`docs/timesnet-local-demo.md`

**新增**
- `spr-detector-service/`（整目录；含拷入的 `SPR-Anomaly-Detection/` 子目录）
- `docs/spr-detector-integration.md`、`docs/spr-detector-local-demo.md`

**修改**
- `backend/src/index.ts`、`backend/src/types/demo.ts`、`backend/.dev.vars.example`
- `shared/ontology-service.ts`
- `frontend/src/features/owl2-workbench/Owl2WorkbenchView.tsx`、`owl2WorkbenchState.ts`、`styles.css`
- `tests/ontology-worker-e2e.test.ts`
- `ontology/model.owl`、`quality.owl`

**可能新增**
- `SPR-Anomaly-Detection/requirements.txt`（补齐缺失的依赖清单）
