"""Curve input adaptation for the SPR detector service.

把前端传来的铆接曲线（riveting，约 250 点）适配为检测器所需的统一长度
序列。真 MARPP 训练于 256 点曲线，因此这里把任意长度重采样到 256。

启发式占位阶段（无 torch）同样使用此模块，保证 M1 替换真模型时输入管线
不变，前端契约无需改动。
"""
from __future__ import annotations

from typing import Iterable

import numpy as np

# 真模型与启发式统一使用的序列长度。
SEQUENCE_LENGTH = 256


class CurveInputError(ValueError):
    """曲线无法转换为检测器输入时抛出。"""


def prepare_input_curve(riveting: Iterable[object]) -> list[float]:
    """校验数值并把铆接曲线重采样到 SEQUENCE_LENGTH。

    返回长度恒为 SEQUENCE_LENGTH 的 float 列表（保留原始量纲，归一化交由
    具体检测器决定——启发式用 z-score，真 MARPP 用 /100）。
    """
    values = _numeric_array(riveting, "riveting")
    if values.size < 8:
        raise CurveInputError("riveting curve too short (need >= 8 points)")
    resampled = _resample(values, SEQUENCE_LENGTH)
    return [round(float(v), 6) for v in resampled.tolist()]


def _numeric_array(values: Iterable[object], label: str) -> np.ndarray:
    parsed: list[float] = []
    for value in values:
        if isinstance(value, bool) or value is None:
            raise CurveInputError(f"{label} curve must contain numeric values")
        try:
            number = float(value)
        except (TypeError, ValueError) as exc:
            raise CurveInputError(f"{label} curve must contain numeric values") from exc
        if not np.isfinite(number):
            raise CurveInputError(f"{label} curve must contain finite numeric values")
        parsed.append(number)
    if not parsed:
        raise CurveInputError(f"{label} curve is empty")
    return np.asarray(parsed, dtype=np.float64)


def _resample(values: np.ndarray, target_len: int) -> np.ndarray:
    if values.size == target_len:
        return values.astype(np.float64)
    source_x = np.linspace(0.0, 1.0, values.size)
    target_x = np.linspace(0.0, 1.0, target_len)
    return np.interp(target_x, source_x, values).astype(np.float64)
