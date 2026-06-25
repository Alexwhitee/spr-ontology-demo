"""Pre-generated result cache for the SPR detector service (D4 决策：预生成缓存)。

键 = recordId，值 = 完整 DetectResponse 载荷。缓存文件由
scripts/prepare_demo_cache.py 预生成，命中时 mode 标记为 "cache"。

环境变量 SPR_DETECTOR_CACHE_DIR 可覆盖默认缓存目录。
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any


DEFAULT_CACHE_DIR = Path(__file__).resolve().parents[1] / "artifacts" / "cache"


def cache_dir() -> Path:
    return Path(os.environ.get("SPR_DETECTOR_CACHE_DIR", DEFAULT_CACHE_DIR))


def load_cached_detection(record_id: str) -> dict[str, Any] | None:
    path = cache_dir() / f"{_safe_id(record_id)}.json"
    if not path.exists():
        return None
    with path.open("r", encoding="utf-8") as handle:
        value = json.load(handle)
    if isinstance(value, dict):
        value["mode"] = "cache"
        return value
    return None


def write_cached_detection(record_id: str, payload: dict[str, Any]) -> Path:
    directory = cache_dir()
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"{_safe_id(record_id)}.json"
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
    return path


def _safe_id(value: str) -> str:
    return "".join(char if char.isalnum() or char in "-_" else "-" for char in value)
