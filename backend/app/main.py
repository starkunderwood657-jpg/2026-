"""FastAPI 入口:双路 MJPEG 流、源切换、指标、取证、静态前端。"""

from __future__ import annotations

import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .capture import CaptureSource
from .pipeline import Pipeline
from .store import CaptureStore

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")

ROOT = Path(__file__).resolve().parents[2]

app = FastAPI(title="UAV Real-time Dehazing", version="0.1.0")
capture = CaptureSource()
store = CaptureStore(ROOT / "data")
pipeline = Pipeline(capture)


@app.on_event("startup")
def _startup() -> None:
    pipeline.start()
    try:
        capture.open(0)  # 默认尝试本机摄像头;失败不阻塞服务
    except ValueError:
        logging.getLogger("main").warning("未找到本机摄像头,请通过 /api/source 指定 RTSP 或视频文件")


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


# 前端静态页(最后挂载,避免覆盖 API 路由)
app.mount("/", StaticFiles(directory=ROOT / "web", html=True), name="web")
