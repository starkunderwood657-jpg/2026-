"""占位增强引擎单元测试:暗通道先验的输入输出契约与去雾效果方向性。"""

from __future__ import annotations

import numpy as np

from app.enhance import DarkChannelEngine, PassThroughEngine


def _hazy_frame() -> np.ndarray:
    """合成雾天画面:低对比度灰雾 + 一个深色目标。"""
    frame = np.full((240, 320, 3), 190, dtype=np.uint8)
    frame[100:140, 130:190] = 40  # 深色目标(如输电塔部件)
    noise = np.random.default_rng(7).integers(-6, 6, frame.shape, dtype=np.int16)
    return np.clip(frame.astype(np.int16) + noise, 0, 255).astype(np.uint8)


def test_dark_channel_preserves_shape_and_dtype():
    out = DarkChannelEngine()(_hazy_frame())
    assert out.shape == (240, 320, 3)
    assert out.dtype == np.uint8


def test_dark_channel_changes_image_and_boosts_contrast():
    src = _hazy_frame()
    out = DarkChannelEngine()(src)
    assert not np.array_equal(src, out), "增强输出不应与输入相同"
    # 去雾方向性:整体对比度(标准差)应上升,雾被压低
    assert float(out.std()) > float(src.std()) * 1.1


def test_pass_through_identity():
    src = _hazy_frame()
    assert np.array_equal(PassThroughEngine()(src), src)
