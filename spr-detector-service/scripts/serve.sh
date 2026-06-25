#!/usr/bin/env bash
# 启动 SPR detector service。默认端口 8008（与原 timesnet-service 保持一致，
# 便于 Worker 侧 .dev.vars 端口不变）。环境变量 SPR_DETECTOR_PORT 可覆盖。
set -euo pipefail

cd "$(dirname "$0")/.."

PORT="${SPR_DETECTOR_PORT:-8008}"
HOST="${SPR_DETECTOR_HOST:-127.0.0.1}"

exec uvicorn src.app:app --host "$HOST" --port "$PORT"
