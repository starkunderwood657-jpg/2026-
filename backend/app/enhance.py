"""增强引擎层。

Engine 协议:输入 uint8 BGR,输出同尺寸 uint8 BGR。
实验室模型交付后,在 models/ 目录放置权重并新增 ModelEngine 适配器即可热替换,
上层链路(采集/推流/指标)不做任何改动。
"""

from __future__ import annotations

from typing import Protocol

import cv2
import numpy as np


class Engine(Protocol):
    name: str

    def __call__(self, bgr: np.ndarray) -> np.ndarray: ...


class DarkChannelEngine:
    """占位引擎:暗通道先验去雾(He et al., CVPR 2009 的经典公开方法)。

    用途:在实验室自研模型就绪前打通并验证全链路;演示材料中必须如实标注为占位实现。
    """

    def __init__(self, patch: int = 15, omega: float = 0.95, t0: float = 0.1) -> None:
        self.name = "dark-channel(placeholder)"
        self.patch = patch
        self.omega = omega
        self.t0 = t0
        self._kernel = np.ones((patch, patch), np.uint8)

    def __call__(self, bgr: np.ndarray) -> np.ndarray:
        img = bgr.astype(np.float32) / 255.0

        # 1) 暗通道:通道最小值 → 最小值滤波
        dark = cv2.erode(img.min(axis=2), self._kernel)

        # 2) 大气光 A:暗通道最亮 0.1% 像素对应原图的中位颜色
        flat = dark.ravel()
        k = max(1, int(flat.size * 0.001))
        top_idx = np.argpartition(flat, -k)[-k:]
        a = np.percentile(img.reshape(-1, 3)[top_idx], 50, axis=0)
        a = np.clip(a, 0.05, 1.0)

        # 3) 透射率:先粗估计,再引导滤波细化(无 contrib 时退化为均值滤波)
        t = 1.0 - self.omega * dark / np.max(a)
        t = t.astype(np.float32)
        try:
            t = cv2.ximgproc.guidedFilter(guide=bgr, src=t, radius=30, eps=1e-3)
        except AttributeError:
            t = cv2.blur(t, (30, 30))

        # 4) 场景恢复
        t = np.clip(t, self.t0, 1.0)[..., None]
        out = (img - a) / t + a
        return np.clip(out * 255.0, 0, 255).astype(np.uint8)


class PassThroughEngine:
    """直通引擎(调试用):原样返回,验证链路时排除增强耗时。"""

    name = "pass-through"

    def __call__(self, bgr: np.ndarray) -> np.ndarray:
        return bgr
