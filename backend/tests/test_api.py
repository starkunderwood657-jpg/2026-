"""业务闭环 + 上传去雾 + 流端点测试。

本环境下 TestClient 在 pytest 进程内会挂起(手动同代码直跑正常),
故默认 pytest 跳过、通过 `python tests/test_api.py` 直跑验证;
设 WUXUN_API_TEST=1 可在 pytest 中强制启用。
"""
from __future__ import annotations

import io
import os
import tempfile
import time
from pathlib import Path

import cv2
import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[2]
FOG_VIDEO = ROOT / "data" / "fog_struct.avi"

# 独立临时数据目录(必须在 import app.main 之前设置):
# 避免与运行中的 uvicorn 服务共享 SQLite 文件导致跨进程写锁挂起。
_TMP = tempfile.mkdtemp(prefix="wuxun-test-")
os.environ["WUXUN_DATA_DIR"] = _TMP
os.environ["WUXUN_BIZ_DB"] = str(Path(_TMP) / "biz.db")

_RUN = os.environ.get("WUXUN_API_TEST") == "1"
pytestmark = pytest.mark.skipif(not _RUN, reason="TestClient 在 pytest 内挂起,用 python tests/test_api.py 直跑")


def _client():
    from fastapi.testclient import TestClient

    from app.main import app

    return TestClient(app)


def _wait_frames(client, seconds: float = 4.0):
    """等待流水线产出首帧(复用同一 TestClient;嵌套实例的 shutdown 会停掉全局线程)。"""
    deadline = time.time() + seconds
    m: dict = {}
    while time.time() < deadline:
        m = client.get("/api/metrics").json()
        if m.get("frames", 0) > 0:
            return m
        time.sleep(0.3)
    return m


def test_full_business_loop():
    client = _client()
    client.__enter__()
    # 1) 打开视频源并等流水线出帧
    r = client.post("/api/source", json={"source": str(FOG_VIDEO)})
    assert r.json()["ok"]
    m = _wait_frames(client)
    assert m["frames"] > 0

    # 2) 杆塔台账 + 巡检任务
    tower = client.post("/api/towers", json={"code": "N07", "section": "甲乙线Ⅰ回"}).json()["tower"]
    task = client.post("/api/tasks", json={"name": "110kV 雾天特巡", "section": "N1—N15"}).json()["task"]

    # 3) 冻结取证 → 登记发现 → 审核
    cap = client.post("/api/freeze").json()
    assert cap["ok"], cap
    finding = client.post(
        "/api/findings",
        json={"task_id": task["id"], "tower_id": tower["id"], "capture_id": cap["id"], "kind": "defect", "note": "绝缘子疑似破损"},
    ).json()["finding"]
    reviewed = client.post(f"/api/findings/{finding['id']}/review?status=confirmed").json()["finding"]
    assert reviewed["status"] == "confirmed"

    # 4) 报告聚合 + 存档读取
    report = client.post(f"/api/tasks/{task['id']}/report", json={"fps": 10}).json()["report"]
    assert report["summary"]["findings_total"] == 1
    assert report["summary"]["by_status"]["confirmed"] == 1
    got = client.get(f"/api/tasks/{task['id']}/report").json()
    assert got["ok"] and got["report"]["summary"]["findings_total"] == 1

    # 5) 任务列表统计正确
    tasks = client.get("/api/tasks").json()["tasks"]
    assert tasks[0]["findings_confirmed"] == 1


def test_enhance_image_upload():
    client = _client()
    client.__enter__()
    # 合成一张雾图上传 → base64 增强 + 归档
    frame = np.full((180, 240, 3), 185, np.uint8)
    frame[60:100, 90:150] = 40
    ok, buf = cv2.imencode(".jpg", frame)
    assert ok
    r = client.post(
        "/api/enhance/image?save=true",
        files={"file": ("fog.jpg", io.BytesIO(buf.tobytes()), "image/jpeg")},
    )
    d = r.json()
    assert d["ok"], d
    assert len(d["image_b64"]) > 1000
    assert d["capture_id"] is not None

    # 档案图可取回
    img = client.get(f"/api/captures/{d['capture_id']}/image?kind=enhanced")
    assert img.status_code == 200 and img.headers["content-type"] == "image/jpeg"


def test_stream_endpoints_respond():
    client = _client()
    client.__enter__()
    """双路流能持续吐出 MJPEG 帧(async 生成器不占线程池)。"""
    for kind in ("raw", "enhanced"):
        with client.stream("GET", f"/stream/{kind}") as resp:
            assert resp.status_code == 200
            assert resp.headers["content-type"].startswith("multipart/x-mixed-replace")
            chunk = b""
            for piece in resp.iter_bytes(1024):
                chunk += piece
                if b"--frame" in chunk and len(chunk) > 200:
                    break
            assert b"--frame" in chunk


def main():
    """直跑入口:python tests/test_api.py"""
    failures = 0
    for fn in (test_full_business_loop, test_enhance_image_upload, test_stream_endpoints_respond):
        try:
            fn()
            print(f"PASS  {fn.__name__}")
        except Exception as exc:  # noqa: BLE001
            failures += 1
            print(f"FAIL  {fn.__name__}: {exc}")
    raise SystemExit(1 if failures else 0)


if __name__ == "__main__":
    main()
