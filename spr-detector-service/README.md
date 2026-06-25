# spr-detector-service

SPR 本体 Demo 的本地异常检测服务（重构型，基于 MARPP）。

> 本服务用于替换原 `timesnet-service`（预测型 TimesNet）。
> 当前为 **M2 启发式占位版本**（`modelVersion=spr-marpp-heuristic-v1`，无 torch），
> M1 阶段将接入真 MARPP 推理，届时仅替换 `src/heuristic_reconstruction.py` 的实现，
> HTTP 契约保持不变。

## 架构

```
前端 ──► Worker(/api/detect/run) ──► spr-detector-service(/api/spr-detect/detect)
                                          │
                                          ├─ useCache=true → 读 artifacts/cache/<id>.json
                                          └─ useCache=false → heuristic_reconstruction.reconstruct()
```

源码结构：
- `src/app.py` — FastAPI 应用，定义请求/响应契约（§5.2）
- `src/heuristic_reconstruction.py` — 启发式重构打分（M2 占位）
- `src/curve_io.py` — 曲线输入校验 + 重采样到 256 点
- `src/demo_cache.py` — 预生成缓存读写
- `spr_anomaly_detection/` — 拷入的 SPR-Anomaly-Detection 源码（Detectors/、main.py 等，M1 启用）
- `scripts/serve.sh` — 启动服务
- `scripts/prepare_demo_cache.py` — 预生成 demo 缓存

## 快速开始

```bash
cd spr-detector-service
python3 -m venv .venv && source .venv/bin/activate
pip install fastapi uvicorn numpy pydantic pytest httpx   # 启发式阶段无需 torch

# 1. 预生成缓存（读取仓库内前端曲线数据）
python scripts/prepare_demo_cache.py

# 2. 启动服务（默认 127.0.0.1:8008）
bash scripts/serve.sh
# 或: SPR_DETECTOR_PORT=8008 uvicorn src.app:app --host 127.0.0.1 --port 8008

# 3. 验证
curl http://127.0.0.1:8008/health
```

## HTTP 契约（§5.2 ReconstructionPrediction）

`POST /api/spr-detect/detect`

请求：
```json
{ "recordId": "riprop-1", "curves": { "riveting": [400, 405, ...] }, "useCache": true }
```

响应：
```json
{
  "recordId": "riprop-1",
  "modelName": "MARPP",
  "modelVersion": "spr-marpp-heuristic-v1",
  "mode": "live | cache | fallback",
  "inputCurve": [256 个点],
  "reconstructionCurve": [256 个点],
  "pointError": [256 个点],
  "anomalyScore": 0.44,
  "threshold": 0.5,
  "riskCategory": "normal | abnormal | review",
  "confidence": 0.6,
  "evidence": ["..."],
  "durationMs": 3,
  "generatedAt": "2026-06-25T...Z"
}
```

> 注意：相比原 TimesNet 契约，已删除 `horizon`/`seqLen`/`envelopeCurve`/`predictedCurve`/
> `predictedEnvelope`/`predictedDelta`，新增 `reconstructionCurve`/`pointError`/`threshold`。
> Worker 侧 `normalizePrediction` 的 `modelName` 校验由 `"TimesNet"` 改为 `"MARPP"`。

## 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `SPR_DETECTOR_PORT` | `8008` | 服务端口 |
| `SPR_DETECTOR_HOST` | `127.0.0.1` | 监听地址 |
| `SPR_DETECTOR_CACHE_DIR` | `artifacts/cache` | 缓存目录 |

## 测试

```bash
pytest -q
```

## M1：接入真 MARPP（后续）

1. `pip install -e ".[marpp]"`（装 torch/scikit-learn/scipy/pywt/tqdm）
2. 在 `spr_anomaly_detection/` 上跑 `build_spr_dataset.py` + `main.py` 产出
   `artifacts/model/model.pkl` 与 `score_params.npy`（产物 gitignore）
3. 新增 `src/marpp_reconstruction.py` 包装 `Detectors.models.MARPP`，
   在 `app.py` 中按可用性优先真模型、回退启发式
4. `modelVersion` 改为 `spr-marpp-v1`
