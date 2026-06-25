from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from src.app import MODEL_VERSION, create_app
from src import demo_cache


@pytest.fixture()
def client(monkeypatch, tmp_path):
    # 每个测试隔离缓存目录，避免污染预生成缓存
    cache = tmp_path / "cache"
    monkeypatch.setenv("SPR_DETECTOR_CACHE_DIR", str(cache))
    demo_cache.DEFAULT_CACHE_DIR = cache
    return TestClient(create_app())


def _curve(n: int = 256) -> list[float]:
    # 一条单调上升、带轻微抖动的合成铆接曲线
    return [400 + 6.5 * i + (i % 7) for i in range(n)]


def test_health(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["modelVersion"] == MODEL_VERSION


def test_detect_live_contract(client):
    resp = client.post(
        "/api/spr-detect/detect",
        json={"recordId": "riprop-1", "curves": {"riveting": _curve()}, "useCache": False},
    )
    assert resp.status_code == 200
    body = resp.json()
    # §5.2 契约校验
    assert body["modelName"] == "MARPP"
    assert body["mode"] in {"live", "cache", "fallback"}
    assert body["riskCategory"] in {"normal", "abnormal", "review"}
    # 无 horizon/seqLen（D3 删除）
    assert "horizon" not in body
    assert "seqLen" not in body
    # 长度一致性
    assert len(body["inputCurve"]) == 256
    assert len(body["reconstructionCurve"]) == 256
    assert len(body["pointError"]) == 256
    assert 0.0 <= body["anomalyScore"] <= 1.0
    assert "evidence" in body and isinstance(body["evidence"], list)


def test_detect_short_curve_falls_back(client):
    resp = client.post(
        "/api/spr-detect/detect",
        json={"recordId": "bad", "curves": {"riveting": [1.0, 2.0, 3.0]}, "useCache": False},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["mode"] == "fallback"
    assert body["riskCategory"] == "review"


def test_detect_cache_hit(client, tmp_path):
    record_id = "riprop-cached"
    payload = {
        "recordId": record_id,
        "modelName": "MARPP",
        "modelVersion": MODEL_VERSION,
        "mode": "live",
        "inputCurve": _curve(),
        "reconstructionCurve": _curve(),
        "pointError": [0.0] * 256,
        "anomalyScore": 0.1,
        "threshold": 0.5,
        "riskCategory": "normal",
        "confidence": 0.72,
        "evidence": ["cached"],
        "durationMs": 5,
        "generatedAt": "2026-01-01T00:00:00Z",
    }
    demo_cache.write_cached_detection(record_id, payload)

    resp = client.post(
        "/api/spr-detect/detect",
        json={"recordId": record_id, "curves": {"riveting": _curve()}, "useCache": True},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["mode"] == "cache"  # 命中缓存后 mode 被强制改写
    assert body["anomalyScore"] == 0.1
