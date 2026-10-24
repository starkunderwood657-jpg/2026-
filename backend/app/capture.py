"""视频采集源:支持本机摄像头 / RTSP 流 / 视频文件(文件播完自动循环,作演示兜底)。"""

from __future__ import annotations

import threading
import time

import cv2
import numpy as np


class CaptureSource:
    """后台线程持续读帧,始终保留最新一帧;上层按需取用。"""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._cap: cv2.VideoCapture | None = None
        self._source: int | str | None = None
        self._latest: tuple[np.ndarray, float] | None = None  # (BGR帧, 采集时间戳)
        self._running = False
        self._thread: threading.Thread | None = None
        self.frame_count = 0
        self.open_errors = 0

    @property
    def source(self) -> int | str | None:
        with self._lock:
            return self._source

    def open(self, source: int | str) -> None:
        """打开视频源;失败抛 ValueError。"""
        cap = cv2.VideoCapture(source)
        if not cap.isOpened():
            cap.release()
            raise ValueError(f"无法打开视频源: {source!r}")
        with self._lock:
            if self._cap is not None:
                self._cap.release()
            self._cap = cap
            self._source = source
            self._latest = None
            self.frame_count = 0
        self._ensure_thread()

    def read_latest(self) -> tuple[np.ndarray, float] | None:
        with self._lock:
            return self._latest

    def close(self) -> None:
        self._running = False
        with self._lock:
            if self._cap is not None:
                self._cap.release()
                self._cap = None

    # ── 内部 ──

    def _ensure_thread(self) -> None:
        if self._thread is None or not self._thread.is_alive():
            self._running = True
            self._thread = threading.Thread(target=self._loop, daemon=True, name="capture")
            self._thread.start()

    def _loop(self) -> None:
        while self._running:
            with self._lock:
                cap = self._cap
                source = self._source
            if cap is None:
                time.sleep(0.05)
                continue

            ok, frame = cap.read()
            if not ok:
                if isinstance(source, str) and not source.lower().startswith(("rtsp://", "http://")):
                    # 视频文件:播完回到开头循环
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    time.sleep(0.01)
                    continue
                # 摄像头/RTSP 瞬时失败:短暂等待重试
                self.open_errors += 1
                time.sleep(0.2)
                continue

            with self._lock:
                self._latest = (frame, time.time())
                self.frame_count += 1
            # 限制采集速率,避免文件源跑满 CPU
            time.sleep(1.0 / 60.0)
