"""视频采集源:支持本机摄像头 / RTSP 流 / 视频文件(文件播完自动循环,作演示兜底)。

线程安全模型(设备单线程拥有):
- 只有采集线程对 cv2.VideoCapture 调用 read/release——主线程绝不触碰设备对象;
- open() 仅创建新 cap 并把旧 cap 移入待回收队列,由采集线程自行 release,
  避免跨线程释放一个正阻塞在 read() 上的捕获对象(Windows MSMF 下会永久卡死线程);
- 摄像头打开带 MSMF 超时(OPEN/READ),虚拟设备或无信号时 read 不会无限阻塞;
- 代际(epoch)校验:旧源的帧不会写进新源的统计。
"""

from __future__ import annotations

import logging
import threading
import time

import cv2
import numpy as np

logger = logging.getLogger("capture")

_CAM_READ_TIMEOUT_MS = 2000
_CAM_OPEN_TIMEOUT_MS = 3000
_MAX_CONSECUTIVE_ERRORS = 30  # 连续失败阈值:摄像头源自动重建捕获对象


class CaptureSource:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._cap: cv2.VideoCapture | None = None
        self._source: int | str | None = None
        self._epoch = 0
        self._retired: list[cv2.VideoCapture] = []
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
        """打开视频源;失败抛 ValueError。旧捕获对象交由采集线程回收。"""
        cap = self._open_device(source)
        try:
            opened = cap.isOpened()
        except Exception:
            opened = False
        if not opened:
            cap.release()
            raise ValueError(f"无法打开视频源: {source!r}")

        with self._lock:
            if self._cap is not None:
                self._retired.append(self._cap)  # 采集线程收尸,主线程不 release
            self._cap = cap
            self._source = source
            self._epoch += 1
            self._latest = None
            self.frame_count = 0
        self._ensure_thread()

    def read_latest(self) -> tuple[np.ndarray, float] | None:
        with self._lock:
            return self._latest

    def close(self) -> None:
        self._running = False

    # ── 内部 ──

    @staticmethod
    def _open_device(source: int | str) -> cv2.VideoCapture:
        """按源类型构造捕获对象;摄像头加 MSMF 超时防 read 无限阻塞。"""
        if isinstance(source, int) and hasattr(cv2, "CAP_PROP_OPEN_TIMEOUT_MSEC"):
            try:
                return cv2.VideoCapture(
                    source,
                    cv2.CAP_MSMF,
                    [
                        cv2.CAP_PROP_OPEN_TIMEOUT_MSEC,
                        _CAM_OPEN_TIMEOUT_MS,
                        cv2.CAP_PROP_READ_TIMEOUT_MSEC,
                        _CAM_READ_TIMEOUT_MS,
                    ],
                )
            except Exception:
                logger.warning("MSMF 超时打开失败,回退默认方式: %s", source)
        return cv2.VideoCapture(source)

    def _is_file(self, source: int | str | None) -> bool:
        return isinstance(source, str) and not source.lower().startswith(("rtsp://", "http://"))

    def _ensure_thread(self) -> None:
        if self._thread is None or not self._thread.is_alive():
            self._running = True
            self._thread = threading.Thread(target=self._loop, daemon=True, name="capture")
            self._thread.start()

    def _loop(self) -> None:
        consecutive_errors = 0
        while self._running:
            # 1) 回收旧捕获对象(本线程是设备唯一使用者,可安全 release)
            with self._lock:
                cap = self._cap
                source = self._source
                epoch = self._epoch
                retired = self._retired[:]
                self._retired.clear()
            for old in retired:
                try:
                    old.release()
                except Exception:
                    pass

            if cap is None:
                time.sleep(0.05)
                continue

            # 2) 读取一帧
            try:
                ok, frame = cap.read()
            except Exception:
                ok, frame = False, None

            if not ok:
                with self._lock:
                    self.open_errors += 1
                consecutive_errors += 1
                if self._is_file(source):
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)  # 文件:循环播放
                    time.sleep(0.01)
                elif consecutive_errors >= _MAX_CONSECUTIVE_ERRORS:
                    # 摄像头/流:连续失败 → 重建捕获对象(可能设备恢复或源失效)
                    logger.warning("连续 %d 次读取失败,重建捕获: %r", consecutive_errors, source)
                    consecutive_errors = 0
                    try:
                        new_cap = self._open_device(source)
                        if new_cap.isOpened():
                            with self._lock:
                                self._retired.append(cap)
                                self._cap = new_cap
                                self._epoch += 1
                            continue
                        new_cap.release()
                    except Exception:
                        logger.exception("重建捕获失败: %r", source)
                    time.sleep(1.0)
                else:
                    time.sleep(0.2)
                continue

            consecutive_errors = 0
            with self._lock:
                if epoch == self._epoch:  # 代际一致才计帧
                    self._latest = (frame, time.time())
                    self.frame_count += 1
            time.sleep(1.0 / 60.0)
