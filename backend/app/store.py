"""取证存储:SQLite 索引 + 双路帧图落盘。"""

from __future__ import annotations

import sqlite3
import threading
import time
from pathlib import Path


class CaptureStore:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.img_dir = root / "captures"
        self.img_dir.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._db = sqlite3.connect(root / "captures.db", check_same_thread=False)
        self._db.execute(
            "CREATE TABLE IF NOT EXISTS captures ("
            " id INTEGER PRIMARY KEY AUTOINCREMENT,"
            " created_at REAL NOT NULL,"
            " note TEXT,"
            " raw_path TEXT NOT NULL,"
            " enhanced_path TEXT NOT NULL)"
        )
        self._db.commit()

    def save(self, raw: bytes, enhanced: bytes, note: str = "") -> dict:
        ts = time.time()
        stamp = time.strftime("%Y%m%d-%H%M%S", time.localtime(ts)) + f"-{int(ts*1000)%1000:03d}"
        raw_path = self.img_dir / f"{stamp}_raw.jpg"
        enh_path = self.img_dir / f"{stamp}_enhanced.jpg"
        raw_path.write_bytes(raw)
        enh_path.write_bytes(enhanced)
        with self._lock:
            cur = self._db.execute(
                "INSERT INTO captures (created_at, note, raw_path, enhanced_path) VALUES (?,?,?,?)",
                (ts, note, str(raw_path), str(enh_path)),
            )
            self._db.commit()
            cid = cur.lastrowid
        return {"id": cid, "saved_at": ts, "raw": str(raw_path), "enhanced": str(enh_path)}

    def list(self, limit: int = 50) -> list[dict]:
        with self._lock:
            rows = self._db.execute(
                "SELECT id, created_at, note FROM captures ORDER BY id DESC LIMIT ?",
                (limit,),
            ).fetchall()
        return [{"id": r[0], "created_at": r[1], "note": r[2]} for r in rows]

    def image_path(self, cid: int, kind: str) -> str | None:
        col = "raw_path" if kind == "raw" else "enhanced_path"
        if col not in ("raw_path", "enhanced_path"):
            return None
        with self._lock:
            row = self._db.execute(
                f"SELECT {col} FROM captures WHERE id = ?", (cid,)
            ).fetchone()
        return row[0] if row else None
