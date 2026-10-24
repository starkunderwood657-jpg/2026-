"""视频批处理:上传视频 → 后台逐帧增强 → 导出增强视频。

任务为进程内管理(内存字典 + 输出文件落盘 data/batch/):
服务重启会丢失进行中任务的进度记录(输出文件保留),任务表不进数据库——
批处理是会话型能力,与巡检业务数据(任务/台账/发现)分离。
"""

from __future__ import annotations

import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path

import cv2


@dataclass
class BatchJob:
    id: str
    source_name: str
    output_path: Path
    status: str = "running"  # running | done | failed
    total_frames: int = 0
    processed: int = 0
    error: str | None = None
    started_at: float = field(default_factory=time.time)
    finished_at: float | None = None

    def snapshot(self) -> dict:
        return {
            "id": self.id,
            "source_name": self.source_name,
            "status": self.status,
            "total_frames": self.total_frames,
            "processed": self.processed,
            "progress": round(self.processed / self.total_frames, 3) if self.total_frames else 0.0,
            "error": self.error,
            "output": str(self.output_path),
        }


class BatchManager:
    def __init__(self, out_dir: Path) -> None:
        self.out_dir = out_dir
        self.out_dir.mkdir(parents=True, exist_ok=True)
        self._jobs: dict[str, BatchJob] = {}
        self._lock = threading.Lock()

    def get(self, job_id: str) -> BatchJob | None:
        with self._lock:
            return self._jobs.get(job_id)

    def list(self) -> list[dict]:
        with self._lock:
            return [j.snapshot() for j in self._jobs.values()]

    def submit(self, video_bytes: bytes, source_name: str, engine_factory) -> BatchJob:
        """engine_factory: () -> Engine,批处理用独立引擎实例,避免与实时流互扰。"""
        job_id = uuid.uuid4().hex[:12]
        out_path = self.out_dir / f"enhanced_{job_id}.avi"
        job = BatchJob(id=job_id, source_name=source_name, output_path=out_path)
        with self._lock:
            self._jobs[job_id] = job

        tmp_in = self.out_dir / f"input_{job_id}.avi"
        tmp_in.write_bytes(video_bytes)

        thread = threading.Thread(
            target=self._run, args=(job, tmp_in, engine_factory()), daemon=True, name=f"batch-{job_id}"
        )
        thread.start()
        return job

    def _run(self, job: BatchJob, input_path: Path, engine) -> None:
        cap = None
        writer = None
        try:
            cap = cv2.VideoCapture(str(input_path))
            if not cap.isOpened():
                raise ValueError("无法解析视频文件")
            job.total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)

            fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
            w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            writer = cv2.VideoWriter(
                str(job.output_path), cv2.VideoWriter_fourcc(*"MJPG"), fps, (w, h)
            )
            if not writer.isOpened():
                raise ValueError("输出视频初始化失败")

            while True:
                ok, frame = cap.read()
                if not ok:
                    break
                enhanced = engine(frame)
                writer.write(enhanced)
                job.processed += 1
        except Exception as exc:  # noqa: BLE001 后台线程兜底
            job.status = "failed"
            job.error = str(exc)
        else:
            job.status = "done"
        finally:
            if cap is not None:
                cap.release()
            if writer is not None:
                writer.release()
            job.finished_at = time.time()
            try:
                input_path.unlink(missing_ok=True)
            except OSError:
                pass
