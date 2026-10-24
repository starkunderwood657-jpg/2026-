"""巡检业务路由:任务 / 杆塔台账 / 发现审核 / 报告。"""

from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from .bizdb import BizDB

router = APIRouter(prefix="/api")
_ROOT = Path(__file__).resolve().parents[2]
import os as _os

biz = BizDB(_os.environ.get("WUXUN_BIZ_DB", str(_ROOT / "data" / "biz.db")))


# ── 任务 ──

class TaskIn(BaseModel):
    name: str
    section: str = ""
    note: str = ""


@router.post("/tasks")
def create_task(body: TaskIn):
    if not body.name.strip():
        return JSONResponse({"ok": False, "error": "任务名不能为空"}, status_code=400)
    return {"ok": True, "task": biz.create_task(body.name.strip(), body.section, body.note)}


@router.get("/tasks")
def list_tasks():
    return {"ok": True, "tasks": biz.list_tasks()}


@router.get("/tasks/{tid}")
def task_detail(tid: int):
    task = biz.get_task(tid)
    if task is None:
        return JSONResponse({"ok": False, "error": "任务不存在"}, status_code=404)
    return {"ok": True, "task": task, "findings": biz.list_findings(task_id=tid)}


@router.post("/tasks/{tid}/close")
def close_task(tid: int, closed: bool = True):
    task = biz.close_task(tid, closed)
    if task is None:
        return JSONResponse({"ok": False, "error": "任务不存在"}, status_code=404)
    return {"ok": True, "task": task}


# ── 杆塔台账 ──

class TowerIn(BaseModel):
    code: str
    section: str = ""
    location: str = ""
    note: str = ""


@router.get("/towers")
def list_towers():
    return {"ok": True, "towers": biz.list_towers()}


@router.post("/towers")
def create_tower(body: TowerIn):
    if not body.code.strip():
        return JSONResponse({"ok": False, "error": "杆塔编号不能为空"}, status_code=400)
    return {"ok": True, "tower": biz.create_tower(body.code.strip(), body.section, body.location, body.note)}


@router.delete("/towers/{tid}")
def delete_tower(tid: int):
    biz.delete_tower(tid)
    return {"ok": True}


# ── 发现登记与审核 ──

class FindingIn(BaseModel):
    task_id: int
    tower_id: int | None = None
    capture_id: int | None = None
    kind: str = "other"  # defect | foreign | other
    note: str = ""


@router.post("/findings")
def add_finding(body: FindingIn):
    if biz.get_task(body.task_id) is None:
        return JSONResponse({"ok": False, "error": "任务不存在"}, status_code=404)
    if body.kind not in ("defect", "foreign", "other"):
        return JSONResponse({"ok": False, "error": "kind 须为 defect/foreign/other"}, status_code=400)
    f = biz.add_finding(body.task_id, body.tower_id, body.capture_id, body.kind, body.note)
    return {"ok": True, "finding": f}


@router.get("/findings")
def list_findings(task_id: int | None = None, status: str | None = None):
    return {"ok": True, "findings": biz.list_findings(task_id, status)}


@router.post("/findings/{fid}/review")
def review_finding(fid: int, status: str):
    try:
        f = biz.review_finding(fid, status)
    except ValueError as exc:
        return JSONResponse({"ok": False, "error": str(exc)}, status_code=400)
    if f is None:
        return JSONResponse({"ok": False, "error": "记录不存在"}, status_code=404)
    return {"ok": True, "finding": f}


# ── 报告 ──

@router.post("/tasks/{tid}/report")
def generate_report(tid: int, metrics: dict | None = None):
    """聚合任务信息、发现统计、取证图与性能指标,生成并存档报告。"""

    task = biz.get_task(tid)
    if task is None:
        return JSONResponse({"ok": False, "error": "任务不存在"}, status_code=404)
    from .main import store  # 取证存档实例在 main 创建;函数内延迟导入避免循环依赖

    findings = biz.list_findings(task_id=tid)
    by_kind: dict[str, int] = {}
    by_status: dict[str, int] = {}
    by_tower: dict[str, int] = {}
    for f in findings:
        by_kind[f["kind"]] = by_kind.get(f["kind"], 0) + 1
        by_status[f["status"]] = by_status.get(f["status"], 0) + 1
        key = f.get("tower_code") or "未指定"
        by_tower[key] = by_tower.get(key, 0) + 1

    captures = [c for c in store.list(limit=500) if any(x["capture_id"] == c["id"] for x in findings)]

    payload = {
        "task": task,
        "summary": {
            "findings_total": len(findings),
            "by_kind": by_kind,
            "by_status": by_status,
            "by_tower": by_tower,
            "captures_total": len(captures),
        },
        "findings": findings,
        "captures": captures,
        "metrics": metrics or {},
    }
    rid = biz.save_report(tid, json.dumps(payload, ensure_ascii=False))
    return {"ok": True, "report_id": rid, "report": payload}


@router.get("/tasks/{tid}/report")
def get_report(tid: int):
    row = biz.latest_report(tid)
    if row is None:
        return JSONResponse({"ok": False, "error": "尚未生成报告"}, status_code=404)
    return {"ok": True, "created_at": row["created_at"], "report": json.loads(row["payload"])}
