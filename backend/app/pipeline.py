"""处理流水线:采集帧 → 增强引擎 → 双路 JPEG 缓存,供 MJPEG 推流与取证共用。"""

from __future__ import annotations

import asyncio
import logging
import threading
import time

import cv2
import numpy as np

from .capture import CaptureSource
from .enhance import DarkChannelEngine, Engine
from .metrics import Metrics

logger = logging.getLogger("pipeline")

STREAM_TARGET_FPS = 30


class Pipeline:
    def __init__(self, capture: CaptureSource, engine: Engine | None = None) -> None:
        self.capture = capture
        self.engine: Engine = engine or DarkChannelEngine()
        self.metrics = Metrics()
        self._lock = threading.Lock()
        self._raw_jpg: bytes | None = None
        self._enh_jpg: bytes | None = None
        self._last_meta: dict | None = None
        self._running = False
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        if self._thread is None or not self._thread.is_alive():
            self._running = True
            self._thread = threading.Thread(target=self._loop, daemon=True, name="pipeline")
            self._thread.start()

    def stop(self) -> None:
        self._running = False

    def set_engine(self, engine: Engine) -> None:
        """运行时替换引擎(参数调节用):整对象原子替换,避免逐字段竞态。"""
        self.engine = engine

    def engine_params(self) -> dict:
        params = getattr(self.engine, "__dict__", {})
        return {
            k: v for k, v in params.items()
            if isinstance(v, (int, float)) and not k.startswith("_")
        }

    def latest_jpegs(self) -> tuple[bytes | None, bytes | None, dict | None]:
        with self._lock:
            return self._raw_jpg, self._enh_jpg, self._last_meta

    async def mjpeg(self, kind: str):
        """MJPEG 帧生成器(async,不占线程池):kind = 'raw' | 'enhanced'。

        同步生成器会被逐帧丢进线程池执行,每条流独占一个线程,少量观看连接
        即耗尽默认 40 线程导致其余请求排队超时——因此必须为异步生成器。
        """
        while True:
            with self._lock:
                jpg = self._raw_jpg if kind == "raw" else self._enh_jpg
            if jpg is not None:
                yield (
                    b"--frame\r\nContent-Type: image/jpeg\r\nContent-Length: "
                    + str(len(jpg)).encode()
                    + b"\r\n\r\n"
                    + jpg
                    + b"\r\n"
                )
            await asyncio.sleep(1.0 / STREAM_TARGET_FPS)

    # ── 内部 ──

    def _loop(self) -> None:
        cycle = 1.0 / 60.0
        while self._running:
            item = self.capture.read_latest()
            if item is None:
                time.sleep(0.05)
                continue
            frame, cap_ts = item

            t0 = time.perf_counter()
            try:
                enhanced = self.engine(frame)
            except Exception:  # 引擎异常:跳过该帧,链路不中断
                logger.exception("enhance failed, frame skipped")
                time.sleep(cycle)
                continue
            t1 = time.perf_counter()

            ok_r, raw_jpg = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 82])
            ok_e, enh_jpg = cv2.imencode(".jpg", enhanced, [cv2.IMWRITE_JPEG_QUALITY, 82])
            if not (ok_r and ok_e):
                continue

            enhance_ms = (t1 - t0) * 1000
            e2e_ms = (time.time() - cap_ts) * 1000
            self.metrics.record(enhance_ms, e2e_ms)
            meta = {
                "engine": self.engine.name,
                "enhance_ms": round(enhance_ms, 2),
                "e2e_ms": round(e2e_ms, 2),
            }
            with self._lock:
                self._raw_jpg = raw_jpg.tobytes()
                self._enh_jpg = enh_jpg.tobytes()
                self._last_meta = meta

            time.sleep(cycle)
