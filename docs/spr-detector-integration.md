# SPR 检测服务集成说明（MARPP 重构检测）

> 本文档描述 `spr-detector-service`（基于 MARPP 重构的异常检测服务）与
> `spr-ontology-demo` 主应用的集成方式。它替代了原 `timesnet-service`
> （TimesNet 预测型服务），设计文档见 `docs/archive/`。

## 1. 架构

```
前端(5173, Vite) ──► Worker(8787, /api/detect/run) ──► spr-detector-service(8008, /api/spr-detect/detect)
                          │                                    │
                          └─ mock/llm 本体规则（内置）          └─ MARPP 重构检测（启发式占位 / 真 MARPP）
```

- **范式转变**：原 TimesNet 是"预测型"（输入96点→预测24点→对比包络线判断越界）；
  现 MARPP 是"重构型"（输入整条256点曲线→重构→逐点误差→异常分数）。
- **降级**：服务不可用/超时/曲线缺失时，Worker 自动降级为 mock 本体规则（与原行为一致）。

## 2. 数据契约（ReconstructionPrediction）

`POST /api/spr-detect/detect` 请求：
```json
{ "recordId": "riprop-1", "curves": { "riveting": [256 个点...] }, "useCache": true }
```

响应（`shared/ontology-service.ts` 的 `ReconstructionPrediction`）：
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

**与原 TimesNet 契约的差异**：
- 删除：`horizon`、`seqLen`、`envelopeCurve`、`predictedCurve`、`predictedEnvelope`、`predictedDelta`
- 新增：`reconstructionCurve`、`pointError`、`threshold`
- `modelName`：`"TimesNet"` → `"MARPP"`
- `riskCategory`：`"forecast_curve_above_envelope"/"forecast_review"` → `"abnormal"/"review"`
- `DetectionResult.timeSeriesPrediction` 字段改名为 `reconstructionPrediction`

## 3. 本地启动 Runbook（三进程）

```bash
# 进程1：检测服务（端口 8008）
cd spr-detector-service
source .venv/bin/activate
python scripts/prepare_demo_cache.py   # 首次：预生成缓存（读取相邻前端曲线）
bash scripts/serve.sh                  # 或: uvicorn src.app:app --port 8008

# 进程2：Worker（端口 8787）
cd spr-ontology-demo
# 配置 backend/.dev.vars：
#   SPR_DETECTOR_API_BASE_URL=http://127.0.0.1:8008
#   SPR_DETECTOR_TIMEOUT_MS=3000
npm run worker:dev

# 进程3：前端（端口 5173）
VITE_DATA_MODE=api VITE_API_BASE_URL=http://127.0.0.1:8787 npm run dev
```

前端"检测流程"页默认选择 **MARPP 重构检测**模式。可中途关闭检测服务，
页面会降级为本体规则（与原 TimesNet 一致）。

## 4. 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `SPR_DETECTOR_API_BASE_URL` | — | 检测服务地址（不配则降级 mock） |
| `SPR_DETECTOR_TIMEOUT_MS` | `3000` | 调用超时 |
| `SPR_DETECTOR_API_KEY` | — | 可选 Bearer 鉴权 |
| `SPR_DETECTOR_PORT` | `8008` | 服务监听端口 |
| `SPR_DETECTOR_CACHE_DIR` | `artifacts/cache` | 预生成缓存目录 |

## 5. 关键代码位置

| 层 | 文件 | 说明 |
|---|---|---|
| 服务 | `spr-detector-service/src/app.py` | FastAPI，契约定义 |
| 服务 | `spr-detector-service/src/heuristic_reconstruction.py` | 启发式重构打分（M2 占位） |
| Worker | `backend/src/index.ts` | `runMarppDetection`、`callMarppDetect`、`normalizeMarppPrediction` |
| Worker | `backend/src/types/demo.ts` | `SPR_DETECTOR_*` env 声明 |
| 共享 | `shared/ontology-service.ts` | `ReconstructionPrediction` 类型、本体类标签 |
| 前端 | `frontend/.../Owl2WorkbenchView.tsx` | `ReconstructionChart`（双图：原始vs重构 + 逐点误差+阈值线） |
| 本体 | `ontology/model.owl` | `TimeSeriesForecastModel` 等类/属性标签 |

## 6. M1：升级为真 MARPP（后续增强）

当前 `modelVersion=spr-marpp-heuristic-v1` 为启发式占位。升级真 MARPP：
1. `pip install -e ".[marpp]"`（torch/scikit-learn/scipy/pywt/tqdm）
2. 在 `spr_anomaly_detection/` 上跑 `build_spr_dataset.py` + `main.py` 产出
   `artifacts/model/model.pkl` + `score_params.npy`（产物 gitignore）
3. 新增 `src/marpp_reconstruction.py` 包装 `Detectors.models.MARPP`，
   在 `app.py` 中按可用性优先真模型、回退启发式
4. `modelVersion` 改为 `spr-marpp-v1`，重新预生成缓存

契约保持不变，前端/Worker 无需改动。
