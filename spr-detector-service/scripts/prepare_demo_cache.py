#!/usr/bin/env python3
"""预生成 demo 缓存（D4 决策）。

读取仓库前端的曲线数据 frontend/public/data/curves/riprop-*.json，
对每条铆接曲线运行启发式重构打分，把完整 DetectResponse 载荷写入
artifacts/cache/<recordId>.json。Worker 运行时 useCache=True 直接命中。

用法:
    python scripts/prepare_demo_cache.py [--curves-dir <path>]

默认 curves-dir 指向仓库根下的前端曲线目录（../frontend/public/data/curves）。
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

# 允许直接在仓库内 `python scripts/prepare_demo_cache.py` 运行
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.app import MODEL_VERSION, evidence_for, score_risk  # noqa: E402
from src.curve_io import prepare_input_curve  # noqa: E402
from src.demo_cache import write_cached_detection  # noqa: E402
from src.heuristic_reconstruction import reconstruct  # noqa: E402

DEFAULT_CURVES_DIR = (
    ROOT.parent  # spr-detector-service 的上一级即 spr-ontology-demo 仓库根
    / "frontend"
    / "public"
    / "data"
    / "curves"
)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def main() -> int:
    parser = argparse.ArgumentParser(description="Pre-generate SPR detector demo cache")
    parser.add_argument(
        "--curves-dir",
        default=str(DEFAULT_CURVES_DIR),
        help="demo 曲线目录（含 riprop-*.json）",
    )
    args = parser.parse_args()

    curves_dir = Path(args.curves_dir)
    if not curves_dir.is_dir():
        print(f"[ERROR] curves dir not found: {curves_dir}", file=sys.stderr)
        return 1

    files = sorted(curves_dir.glob("riprop-*.json"))
    if not files:
        print(f"[ERROR] no riprop-*.json under {curves_dir}", file=sys.stderr)
        return 1

    written = 0
    for path in files:
        with path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
        record_id = data.get("id") or path.stem
        riveting = data.get("curves", {}).get("riveting", [])
        if not riveting:
            print(f"[SKIP] {record_id}: empty riveting")
            continue
        try:
            input_curve = prepare_input_curve(riveting)
            result = reconstruct(input_curve)
        except Exception as exc:  # noqa: BLE001
            print(f"[SKIP] {record_id}: {exc}", file=sys.stderr)
            continue
        risk = score_risk(result.anomaly_score, result.threshold)
        payload = {
            "recordId": record_id,
            "modelName": "MARPP",
            "modelVersion": MODEL_VERSION,
            "mode": "live",
            "inputCurve": input_curve,
            "reconstructionCurve": result.reconstruction_curve,
            "pointError": result.point_error,
            "anomalyScore": risk["anomalyScore"],
            "threshold": result.threshold,
            "riskCategory": risk["riskCategory"],
            "confidence": risk["confidence"],
            "evidence": evidence_for(risk["riskCategory"], "cache", result.diagnostics),
            "durationMs": 0,
            "generatedAt": utc_now(),
        }
        write_cached_detection(record_id, payload)
        written += 1

    print(f"[OK] wrote {written}/{len(files)} cache entries")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
