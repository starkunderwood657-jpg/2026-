"""FastAPI 入口:双路 MJPEG 流、源切换、指标、取证、静态前端。"""

from __future__ import annotations

import base64
import logging
from pathlib import Path

import cv2
import numpy as np
from fastapi import FastAPI, File, UploadFile
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .batch import BatchManager
from .capture import CaptureSource
from .enhance import DarkChannelEngine
from .inspection import router as inspection_router
from .pipeline import Pipeline
from .store import CaptureStore

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")

ROOT = Path(__file__).resolve().parents[2]
import os

_DATA_DIR = Path(os.environ.get("WUXUN_DATA_DIR", ROOT / "data"))
_DATA_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="UAV Real-time Dehazing", version="0.4.0")
app.include_router(inspection_router)
capture = CaptureSource()
store = CaptureStore(_DATA_DIR)
pipeline = Pipeline(capture)
batch = BatchManager(_DATA_DIR / "batch")


@app.on_event("startup")
def _startup() -> None:
    # 只启动流水线;不自动抢占摄像头——视频源由用户显式连接(/api/source)。
    # (无头/服务环境与部分虚拟摄像头下,启动期打开设备可能阻塞 MSMF/COM 初始化。)
    pipeline.start()


@app.on_event("shutdown")
def _shutdown() -> None:
    pipeline.stop()
    capture.close()


class SourceIn(BaseModel):
    source: str  # "0"(摄像头序号) / rtsp 地址 / 视频文件路径


@app.post("/api/source")
def set_source(body: SourceIn):
    src: int | str = int(body.source) if body.source.isdigit() else body.source
    try:
        capture.open(src)
        return {"ok": True, "source": body.source}
    except ValueError as exc:
        return JSONResponse({"ok": False, "error": str(exc)}, status_code=400)


@app.get("/api/metrics")
def get_metrics():
    return {**pipeline.metrics.snapshot(), "engine": pipeline.engine.name}


@app.post("/api/freeze")
def freeze(note: str = ""):
    raw, enh, meta = pipeline.latest_jpegs()
    if raw is None or enh is None:
        return JSONResponse({"ok": False, "error": "暂无画面,请先打开视频源"}, status_code=409)
    saved = store.save(raw, enh, note)
    return {"ok": True, **saved, "meta": meta}


@app.get("/api/captures")
def list_captures():
    return {"captures": store.list()}


@app.get("/api/captures/{cid}/image")
def capture_image(cid: int, kind: str = "raw"):
    path = store.image_path(cid, kind)
    if path is None or not Path(path).exists():
        return JSONResponse({"ok": False, "error": "记录不存在"}, status_code=404)
    return FileResponse(path, media_type="image/jpeg")


@app.get("/stream/raw")
def stream_raw():
    return StreamingResponse(
        pipeline.mjpeg("raw"), media_type="multipart/x-mixed-replace; boundary=frame"
    )


@app.get("/stream/enhanced")
def stream_enhanced():
    return StreamingResponse(
        pipeline.mjpeg("enhanced"), media_type="multipart/x-mixed-replace; boundary=frame"
    )


class EnhanceImageOut(BaseModel):
    ok: bool
    image_b64: str
    capture_id: int | None = None


@app.post("/api/enhance/image", response_model=EnhanceImageOut)
async def enhance_image(file: UploadFile = File(...), save: bool = False):
    """单图去雾:上传图像 → 占位引擎增强 → base64 返回;save=true 时双图存入取证档案。"""
    raw_bytes = await file.read()
    if len(raw_bytes) > 20 * 1024 * 1024:
        return JSONResponse({"ok": False, "error": "图片超过 20MB"}, status_code=400)
    arr = np.frombuffer(raw_bytes, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        return JSONResponse({"ok": False, "error": "无法解析图片文件"}, status_code=400)

    enhanced = pipeline.engine(img)
    ok_r, raw_jpg = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 88])
    ok_e, enh_jpg = cv2.imencode(".jpg", enhanced, [cv2.IMWRITE_JPEG_QUALITY, 88])
    if not (ok_r and ok_e):
        return JSONResponse({"ok": False, "error": "图像编码失败"}, status_code=500)

    capture_id = None
    if save:
        saved = store.save(raw_jpg.tobytes(), enh_jpg.tobytes(), note=f"upload:{file.filename}")
        capture_id = saved["id"]

    return EnhanceImageOut(
        ok=True,
        image_b64=base64.b64encode(enh_jpg.tobytes()).decode(),
        capture_id=capture_id,
    )


# ── 引擎参数调节(占位引擎参数实时可调) ──

class EngineParamsIn(BaseModel):
    omega: float = 0.95   # 去雾强度(0–1)
    patch: int = 15       # 暗通道窗口(奇数, 3–51)
    t0: float = 0.1       # 透射率下限


@app.get("/api/engine/params")
def get_engine_params():
    return {"ok": True, "engine": pipeline.engine.name, "params": pipeline.engine_params()}


@app.post("/api/engine/params")
def set_engine_params(body: EngineParamsIn):
    omega = min(max(body.omega, 0.0), 1.0)
    patch = min(max(body.patch if body.patch % 2 == 1 else body.patch + 1, 3), 51)
    t0 = min(max(body.t0, 0.01), 0.5)
    pipeline.set_engine(DarkChannelEngine(patch=patch, omega=omega, t0=t0))
    return {"ok": True, "engine": pipeline.engine.name, "params": pipeline.engine_params()}


# ── 统计看板聚合 ──

@app.get("/api/stats")
def stats_overview():
    from .inspection import biz

    findings = biz.list_findings()
    by_status: dict[str, int] = {}
    by_kind: dict[str, int] = {}
    by_tower: dict[str, int] = {}
    timeline: list[dict] = []
    for f in findings:
        by_status[f["status"]] = by_status.get(f["status"], 0) + 1
        by_kind[f["kind"]] = by_kind.get(f["kind"], 0) + 1
        key = f.get("tower_code") or "未指定"
        by_tower[key] = by_tower.get(key, 0) + 1
        timeline.append({"id": f["id"], "kind": f["kind"], "status": f["status"], "created_at": f["created_at"]})
    timeline.reverse()  # 时间正序
    return {
        "ok": True,
        "tasks_total": len(biz.list_tasks()),
        "towers_total": len(biz.list_towers()),
        "captures_total": len(store.list(limit=1000)),
        "findings_total": len(findings),
        "by_status": by_status,
        "by_kind": by_kind,
        "by_tower": by_tower,
        "timeline": timeline[-60:],
        "metrics": pipeline.metrics.snapshot(),
    }


# ── 视频批处理 ──

@app.post("/api/batch/start")
async def batch_start(file: UploadFile = File(...), params: EngineParamsIn | None = None):
    video_bytes = await file.read()
    if len(video_bytes) > 500 * 1024 * 1024:
        return JSONResponse({"ok": False, "error": "视频超过 500MB"}, status_code=400)
    p = params or EngineParamsIn()
    patch = min(max(p.patch if p.patch % 2 == 1 else p.patch + 1, 3), 51)
    engine = DarkChannelEngine(
        patch=patch,
        omega=min(max(p.omega, 0.0), 1.0),
        t0=min(max(p.t0, 0.01), 0.5),
    )
    job = batch.submit(video_bytes, file.filename or "video", lambda: engine)
    return {"ok": True, "job": job.snapshot()}


@app.get("/api/batch/jobs")
def batch_jobs():
    return {"ok": True, "jobs": batch.list()}


@app.get("/api/batch/status/{job_id}")
def batch_status(job_id: str):
    job = batch.get(job_id)
    if job is None:
        return JSONResponse({"ok": False, "error": "任务不存在"}, status_code=404)
    return {"ok": True, "job": job.snapshot()}


@app.get("/api/batch/download/{job_id}")
def batch_download(job_id: str):
    job = batch.get(job_id)
    if job is None or job.status != "done":
        return JSONResponse({"ok": False, "error": "任务不存在或未完成"}, status_code=404)
    return FileResponse(job.output_path, media_type="video/x-msvideo", filename=job.output_path.name)


# 前端静态托管:优先 React 构建产物,旧单文件页兜底
_static_dir = ROOT / "frontend" / "dist"
if not _static_dir.exists():
    _static_dir = ROOT / "web"
app.mount("/", StaticFiles(directory=_static_dir, html=True), name="web")
