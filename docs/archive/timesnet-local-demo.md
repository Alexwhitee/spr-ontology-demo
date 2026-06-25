# Mac 本地 TimesNet 演示运行说明

本文档用于把 `spr-ontology-demo` 和本地 `timesnet-service` 跑成一个现场可演示闭环。现场点击检测时不训练模型，只做单条曲线推理、缓存读取或规则降级。

## 目录约定

- SPR Demo: `/Users/xi/hengxiang/spr/spr-ontology-demo`
- TimesNet 官方库: `/Users/xi/hengxiang/spr/Time-Series-Library`
- 本地模型服务: `/Users/xi/hengxiang/spr/timesnet-service`

## Conda 环境

```bash
cd /Users/xi/hengxiang/spr/Time-Series-Library

conda create -n tslib python=3.11 -y
conda activate tslib

pip install torch torchvision torchaudio
pip install fastapi uvicorn pydantic numpy pandas scikit-learn pytest httpx
pip install einops==0.8.1 local-attention==1.11.2 reformer-pytorch==1.4.4
```

MacBook Air M4 没有 CUDA，服务会优先尝试 `mps`，不可用时自动使用 CPU。演示配置是小模型和短窗口，目标是稳定展示链路，不追求论文级精度。

## 准备演示缓存

```bash
cd /Users/xi/hengxiang/spr/timesnet-service
conda activate tslib

python scripts/prepare_demo_model.py \
  --spr-demo-root /Users/xi/hengxiang/spr/spr-ontology-demo \
  --tslib-root /Users/xi/hengxiang/spr/Time-Series-Library \
  --device auto \
  --epochs 5 \
  --seq-len 96 \
  --pred-len 24
```

脚本会根据 `frontend/public/data/curves/riprop-*.json` 生成 TimesNet 演示缓存。即使现场实时模型加载失败，Worker 仍可拿到可解释的缓存或兜底结果。

## 启动三进程

### 1. TimesNet 服务

```bash
cd /Users/xi/hengxiang/spr/timesnet-service
conda activate tslib
uvicorn src.app:app --host 127.0.0.1 --port 8008
```

健康检查：

```bash
curl http://127.0.0.1:8008/health
```

### 2. Worker Dev

```bash
cd /Users/xi/hengxiang/spr/spr-ontology-demo
cp backend/.dev.vars.example backend/.dev.vars
npm run worker:dev
```

`backend/.dev.vars` 至少包含：

```env
TIMESNET_API_BASE_URL=http://127.0.0.1:8008
TIMESNET_TIMEOUT_MS=3000
```

### 3. Vite 前端

```bash
cd /Users/xi/hengxiang/spr/spr-ontology-demo
VITE_DATA_MODE=api VITE_API_BASE_URL=http://127.0.0.1:8787 npm run dev
```

演示地址：

```text
http://localhost:5173
```

## 现场演示步骤

1. 打开 `http://localhost:5173`。
2. 进入“检测模型”区域。
3. 模型选择保持默认 `TimesNet 时序预测`。
4. 选择一条 `RIP_ROP` 且故障代码包含“高于包络线”的记录，例如 `riprop-2`。
5. 点击“运行检测全流程”。
6. 展示 TimesNet 预测曲线、风险分数、置信度、本体路径、根因分析和预警报告。
7. 可关闭 TimesNet 服务后再运行一次，页面应显示降级为本体规则，检测、根因和报告流程不中断。

## 验收命令

Python 服务：

```bash
cd /Users/xi/hengxiang/spr/timesnet-service
conda activate tslib
pytest -q
```

SPR Demo：

```bash
cd /Users/xi/hengxiang/spr/spr-ontology-demo
npm test
npm run build
```

## 故障处理

- `/health` 不通：先确认 `uvicorn` 是否运行在 `127.0.0.1:8008`。
- 前端显示降级规则：检查 `backend/.dev.vars` 是否存在，Worker 是否重启，`TIMESNET_API_BASE_URL` 是否为 `http://127.0.0.1:8008`。
- TimesNet 实时模型不可用：演示不受阻，服务会返回缓存或兜底预测；若要启用真实模型，确认 `TSLIB_ROOT=/Users/xi/hengxiang/spr/Time-Series-Library` 且相关 PyTorch 依赖已安装。
- 点击检测很慢：现场优先使用已准备缓存；把 `useCache` 保持为默认 `true`。
