"""SPR detector service — FastAPI application.

暴露与主应用 Worker 对接的检测端点。响应契约 = 规划文档 §5.2 的
ReconstructionPrediction（重构型，modelName="MARPP"，无 horizon/seqLen）。

M2 阶段使用启发式重构占位（heuristic_reconstruction，无 torch）；
M1 替换为真 MARPP 时，仅替换 _run_reconstruction 的实现，契约不变。
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from fastapi import FastAPI
from pydantic import BaseModel, Field

from .curve_io import CurveInputError, prepare_input_curve
from .demo_cache import load_cached_detection
from .heuristic_reconstruction import reconstruct

MODEL_VERSION = "spr-marpp-heuristic-v1"  # M1 上线真模型后改为 "spr-marpp-v1"

RiskCategory = Literal["normal", "abnormal", "review"]
Mode = Literal["live", "cache", "fallback"]


class CurvePayload(BaseModel):
    riveting: list[float] = Field(default_factory=list)


class DetectRequest(BaseModel):
    recordId: str
    curves: CurvePayload
    useCache: bool = True


class DetectResponse(BaseModel):
    recordId: str
    modelName: Literal["MARPP"] = "MARPP"
    modelVersion: str = MODEL_VERSION
    mode: Mode
    inputCurve: list[float]
    reconstructionCurve: list[float]
    pointError: list[float]
    anomalyScore: float
    threshold: float
    riskCategory: RiskCategory
    confidence: float
    evidence: list[str]
    durationMs: int | None = None
    generatedAt: str


def create_app() -> FastAPI:
    app = FastAPI(title="SPR Detector Service", version="0.1.0")

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "modelVersion": MODEL_VERSION}

    @app.post("/api/spr-detect/detect", response_model=DetectResponse)
    def detect(request: DetectRequest) -> DetectResponse:
        if request.useCache:
            cached = load_cached_detection(request.recordId)
            if cached:
                return DetectResponse(**cached)

        started = datetime.now(timezone.utc)
        try:
            input_curve = prepare_input_curve(request.curves.riveting)
            result = reconstruct(input_curve)
        except CurveInputError as exc:
            return _fallback_response(request.recordId, f"曲线无法进入 MARPP 推理：{exc}", started)

        risk = score_risk(result.anomaly_score, result.threshold)
        return DetectResponse(
            recordId=request.recordId,
            mode=result.mode,  # type: ignore[arg-type]
            inputCurve=input_curve,
            reconstructionCurve=result.reconstruction_curve,
            pointError=result.point_error,
            anomalyScore=risk["anomalyScore"],
            threshold=result.threshold,
            riskCategory=risk["riskCategory"],  # type: ignore[arg-type]
            confidence=risk["confidence"],
            evidence=evidence_for(risk["riskCategory"], result.mode, result.diagnostics),
            durationMs=_elapsed_ms(started),
            generatedAt=utc_now(),
        )

    return app


def score_risk(anomaly_score: float, threshold: float) -> dict[str, float | str]:
    """归一化异常分 + 阈值 → riskCategory / confidence。"""
    if anomaly_score >= threshold:
        confidence = 0.82 if anomaly_score >= threshold + 0.2 else 0.74
        return {"riskCategory": "abnormal", "anomalyScore": round(anomaly_score, 3), "confidence": confidence}
    if anomaly_score >= threshold * 0.7:
        return {"riskCategory": "review", "anomalyScore": round(anomaly_score, 3), "confidence": 0.6}
    return {"riskCategory": "normal", "anomalyScore": round(anomaly_score, 3), "confidence": 0.72}


def evidence_for(risk_category: str, mode: str, diagnostics: str | None) -> list[str]:
    prefix = "MARPP 实时重构" if mode == "live" else ("MARPP 缓存结果" if mode == "cache" else "MARPP 兜底重构")
    if risk_category == "abnormal":
        msg = [f"{prefix}显示该曲线重构误差显著偏高，存在异常风险"]
    elif risk_category == "normal":
        msg = [f"{prefix}未发现明显重构异常"]
    else:
        msg = [f"{prefix}结果处于复核区间，建议人工确认"]
    if diagnostics:
        msg.append(f"实时模型未启用：{diagnostics}")
    return msg


def _fallback_response(record_id: str, reason: str, started: datetime) -> DetectResponse:
    return DetectResponse(
        recordId=record_id,
        mode="fallback",
        inputCurve=[],
        reconstructionCurve=[],
        pointError=[],
        anomalyScore=0.5,
        threshold=0.5,
        riskCategory="review",
        confidence=0.5,
        evidence=[reason, "已返回可复核兜底结果"],
        durationMs=_elapsed_ms(started),
        generatedAt=utc_now(),
    )


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _elapsed_ms(started: datetime) -> int:
    return max(0, int((datetime.now(timezone.utc) - started).total_seconds() * 1000))


app = create_app()
