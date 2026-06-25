"""Heuristic reconstruction scorer (M2 placeholder, no torch).

这是 M2 阶段的占位打分器：用滑动窗口的低阶多项式拟合作为"重构曲线"，
逐点重构误差驱动异常分数。形态上贴近未来真 MARPP（同样是逐点重构误差），
因此 M1 替换为真模型时，输出契约（reconstructionCurve / pointError /
anomalyScore / threshold）保持不变，前端无需改动。

设计要点：
- 重构曲线：对输入做分段低阶多项式平滑拟合，保留主走势、压制高频抖动。
- 逐点误差：|input - reconstruction|（保留原始量纲，不做逐条 z-score，
  以保留曲线间绝对差异——对齐 MARPP 用 calibration 集归一化的语义）。
- 异常分：取误差序列的 top-k 均值（对齐 MARPP 的 topk_mean_mse 思想），
  按经验参考尺度压缩到 [0,1]；阈值沿用经验值。
- evidence：给出可读判定依据。
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

# —— 与真 MARPP 对齐的打分参数（topk_mean_mse 思路）——
_TOPK_RATIO = 0.1          # 取误差最高的 10% 点做均值
_ANOMALY_THRESHOLD = 0.5   # 归一化异常分的判定阈值（[0,1]）
_SMOOTH_WINDOW = 15        # 滑动拟合窗口（点数）
_POLY_ORDER = 3            # 滑动多项式阶数
# top-k 原始误差的经验参考尺度：score = raw / (raw + _ERROR_SCALE)。
# 校准依据——177 条真实 demo 曲线 top-k 均值约 10~25（mean≈18），区间较窄：
# 这些 demo 曲线质量相近、多为正常/轻微异常，因此启发式在其上的绝对区分度有限
# （这正是需 M1 真 MARPP 的原因——真模型只见过正常曲线，对真正异常才高分）。
# 取 SCALE=25 为展示性折中：median≈0.42，少量 normal + 多数 review，分数跨度最大。
_ERROR_SCALE = 25.0


@dataclass(frozen=True)
class ReconstructionResult:
    reconstruction_curve: list[float]
    point_error: list[float]
    anomaly_score: float
    threshold: float
    mode: str  # "live" | "fallback"
    diagnostics: str | None = None


def reconstruct(curve: list[float]) -> ReconstructionResult:
    """对单条 256 点曲线做启发式重构打分。"""
    if len(curve) < 8:
        return _fallback(curve, "curve too short for reconstruction")

    x = np.asarray(curve, dtype=np.float64)
    try:
        reconstruction = _smooth(x)
    except Exception as exc:  # noqa: BLE001 - 拟合失败时安全兜底
        return _fallback(curve, f"reconstruction failed: {exc}")

    # 逐点绝对误差（保留原始量纲，不做逐条 z-score，以保留曲线间差异）
    raw_error = np.abs(x - reconstruction)

    anomaly_score = _topk_mean_score(raw_error)
    score = float(np.clip(anomaly_score, 0.0, 1.0))
    return ReconstructionResult(
        reconstruction_curve=_round(reconstruction),
        point_error=_round(raw_error),
        anomaly_score=round(score, 3),
        threshold=_ANOMALY_THRESHOLD,
        mode="live",
    )


def _smooth(x: np.ndarray) -> np.ndarray:
    """滑动窗口多项式拟合：保留主走势、压制高频抖动。"""
    n = x.size
    half = _SMOOTH_WINDOW // 2
    out = np.empty(n, dtype=np.float64)
    for i in range(n):
        lo = max(0, i - half)
        hi = min(n, i + half + 1)
        seg_x = np.arange(lo, hi, dtype=np.float64)
        seg_y = x[lo:hi]
        if seg_x.size <= _POLY_ORDER:
            out[i] = float(np.mean(seg_y))
            continue
        coeffs = np.polyfit(seg_x - i, seg_y, _POLY_ORDER)
        out[i] = float(np.polyval(coeffs, 0.0))
    return out


def _topk_mean_score(error: np.ndarray) -> float:
    """对齐 MARPP topk_mean_mse：取误差最高的 topk 比例点做均值。

    误差为原始量纲的逐点 |input - reconstruction|。按经验参考尺度
    _ERROR_SCALE 单调压缩到 [0,1]：score = raw / (raw + _ERROR_SCALE)。
    """
    k = max(1, int(np.ceil(error.size * _TOPK_RATIO)))
    topk = np.sort(error)[-k:]
    raw = max(0.0, float(np.mean(topk)))
    return raw / (raw + _ERROR_SCALE)


def _fallback(curve: list[float], diagnostics: str) -> ReconstructionResult:
    n = max(len(curve), 0)
    return ReconstructionResult(
        reconstruction_curve=list(curve[:]) if n else [],
        point_error=[0.0] * n,
        anomaly_score=0.5,
        threshold=_ANOMALY_THRESHOLD,
        mode="fallback",
        diagnostics=diagnostics,
    )


def _round(values: np.ndarray) -> list[float]:
    return [round(float(v), 6) for v in values.tolist()]
