"""性能指标:每帧打点,滚动窗口汇总。答辩/论文共用的工程证据,第一天就建。"""

from __future__ import annotations

import threading
import time
from collections import deque


class Metrics:
    def __init__(self, window: int = 300) -> None:
        self._lock = threading.Lock()
        self._enhance_ms: deque[float] = deque(maxlen=window)
        self._e2e_ms: deque[float] = deque(maxlen=window)
        self._processed: deque[float] = deque(maxlen=window)  # 处理完成时间戳,用于算 FPS
        self.frames = 0

    def record(self, enhance_ms: float, e2e_ms: float) -> None:
        now = time.time()
        with self._lock:
            self._enhance_ms.append(enhance_ms)
            self._e2e_ms.append(e2e_ms)
            self._processed.append(now)
            self.frames += 1

    @staticmethod
    def _pct(values: list[float], pct: float) -> float:
        if not values:
            return 0.0
        values = sorted(values)
        idx = min(len(values) - 1, int(len(values) * pct))
        return round(values[idx], 2)

    def snapshot(self) -> dict:
        with self._lock:
            enhance = list(self._enhance_ms)
            e2e = list(self._e2e_ms)
            stamps = list(self._processed)

        fps = 0.0
        if len(stamps) >= 2 and stamps[-1] > stamps[0]:
            span = stamps[-1] - stamps[0]
            counted = len([s for s in stamps if s > stamps[-1] - 5.0])  # 最近5秒
            fps = round(counted / min(span, 5.0), 1) if span > 0 else 0.0

        return {
            "fps": fps,
            "frames": self.frames,
            "enhance_ms_p50": self._pct(enhance, 0.50),
            "enhance_ms_p95": self._pct(enhance, 0.95),
            "e2e_ms_p50": self._pct(e2e, 0.50),
        }
