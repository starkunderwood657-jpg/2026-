"""巡检业务数据库:任务 / 杆塔台账 / 发现记录 / 报告。

与采集取证(store.py 的 captures)分离:captures 是"双路帧存档",
findings 是挂在任务与杆塔上的"巡检发现",带人工审核工作流。
"""

from __future__ import annotations

import sqlite3
import threading
import time

_SCHEMA = """
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  section TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',   -- open | closed
  note TEXT DEFAULT '',
  created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS towers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  section TEXT DEFAULT '',
  location TEXT DEFAULT '',
  note TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS findings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  tower_id INTEGER,
  capture_id INTEGER,
  kind TEXT NOT NULL DEFAULT 'other',    -- defect | foreign | other
  status TEXT NOT NULL DEFAULT 'pending', -- pending | confirmed | rejected
  note TEXT DEFAULT '',
  created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  payload TEXT NOT NULL,                  -- 聚合 JSON
  created_at REAL NOT NULL
);
"""


class BizDB:
    def __init__(self, path: str) -> None:
        self._lock = threading.Lock()
        self._db = sqlite3.connect(path, check_same_thread=False)
        self._db.row_factory = sqlite3.Row
        self._db.executescript(_SCHEMA)
        self._db.commit()

    def _rows(self, cur) -> list[dict]:
        return [dict(r) for r in cur.fetchall()]

    # ── 任务 ──

    def create_task(self, name: str, section: str = "", note: str = "") -> dict:
        with self._lock:
            cur = self._db.execute(
                "INSERT INTO tasks (name, section, note, created_at) VALUES (?,?,?,?)",
                (name, section, note, time.time()),
            )
            self._db.commit()
            # 注意:不可在本 with 块内调用带锁方法(self.get_task)——
            # threading.Lock 不可重入,同线程二次加锁会死锁。块内直接取行。
            row = self._db.execute("SELECT * FROM tasks WHERE id=?", (cur.lastrowid,)).fetchone()
        return dict(row)

    def get_task(self, tid: int) -> dict | None:
        with self._lock:
            r = self._db.execute("SELECT * FROM tasks WHERE id=?", (tid,)).fetchone()
        return dict(r) if r else None

    def list_tasks(self) -> list[dict]:
        with self._lock:
            cur = self._db.execute(
                "SELECT t.*, "
                " (SELECT COUNT(*) FROM findings f WHERE f.task_id=t.id) AS findings_total,"
                " (SELECT COUNT(*) FROM findings f WHERE f.task_id=t.id AND f.status='confirmed') AS findings_confirmed,"
                " (SELECT COUNT(*) FROM findings f WHERE f.task_id=t.id AND f.status='pending') AS findings_pending"
                " FROM tasks t ORDER BY t.id DESC"
            )
            return self._rows(cur)

    def close_task(self, tid: int, closed: bool = True) -> dict | None:
        with self._lock:
            self._db.execute(
                "UPDATE tasks SET status=? WHERE id=?", ("closed" if closed else "open", tid)
            )
            self._db.commit()
        return self.get_task(tid)

    # ── 杆塔台账 ──

    def create_tower(self, code: str, section: str = "", location: str = "", note: str = "") -> dict:
        with self._lock:
            cur = self._db.execute(
                "INSERT INTO towers (code, section, location, note) VALUES (?,?,?,?)",
                (code, section, location, note),
            )
            self._db.commit()
            r = self._db.execute("SELECT * FROM towers WHERE id=?", (cur.lastrowid,)).fetchone()
        return dict(r)

    def list_towers(self) -> list[dict]:
        with self._lock:
            cur = self._db.execute("SELECT * FROM towers ORDER BY code")
            return self._rows(cur)

    def delete_tower(self, tid: int) -> None:
        with self._lock:
            self._db.execute("DELETE FROM towers WHERE id=?", (tid,))
            self._db.commit()

    # ── 发现(登记 + 审核流) ──

    def add_finding(
        self,
        task_id: int,
        tower_id: int | None,
        capture_id: int | None,
        kind: str = "other",
        note: str = "",
    ) -> dict:
        with self._lock:
            cur = self._db.execute(
                "INSERT INTO findings (task_id, tower_id, capture_id, kind, note, created_at)"
                " VALUES (?,?,?,?,?,?)",
                (task_id, tower_id, capture_id, kind, note, time.time()),
            )
            self._db.commit()
            r = self._db.execute(
                "SELECT f.*, t.code AS tower_code FROM findings f"
                " LEFT JOIN towers t ON t.id=f.tower_id WHERE f.id=?",
                (cur.lastrowid,),
            ).fetchone()
        return dict(r)

    def list_findings(self, task_id: int | None = None, status: str | None = None) -> list[dict]:
        sql = (
            "SELECT f.*, t.code AS tower_code FROM findings f"
            " LEFT JOIN towers t ON t.id=f.tower_id WHERE 1=1"
        )
        args: list = []
        if task_id is not None:
            sql += " AND f.task_id=?"
            args.append(task_id)
        if status:
            sql += " AND f.status=?"
            args.append(status)
        sql += " ORDER BY f.id DESC"
        with self._lock:
            cur = self._db.execute(sql, args)
            return self._rows(cur)

    def review_finding(self, fid: int, status: str) -> dict | None:
        if status not in ("confirmed", "rejected", "pending"):
            raise ValueError("非法审核状态")
        with self._lock:
            self._db.execute("UPDATE findings SET status=? WHERE id=?", (status, fid))
            self._db.commit()
            r = self._db.execute(
                "SELECT f.*, t.code AS tower_code FROM findings f"
                " LEFT JOIN towers t ON t.id=f.tower_id WHERE f.id=?",
                (fid,),
            ).fetchone()
        return dict(r) if r else None

    # ── 报告 ──

    def save_report(self, task_id: int, payload_json: str) -> int:
        with self._lock:
            cur = self._db.execute(
                "INSERT INTO reports (task_id, payload, created_at) VALUES (?,?,?)",
                (task_id, payload_json, time.time()),
            )
            self._db.commit()
            return int(cur.lastrowid)

    def latest_report(self, task_id: int) -> dict | None:
        with self._lock:
            r = self._db.execute(
                "SELECT * FROM reports WHERE task_id=? ORDER BY id DESC LIMIT 1", (task_id,)
            ).fetchone()
        return dict(r) if r else None
