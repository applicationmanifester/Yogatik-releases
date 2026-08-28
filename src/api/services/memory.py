import sqlite3
from datetime import datetime
from pathlib import Path
from typing import List, Tuple

DB_PATH = Path(__file__).resolve().parents[2] / "data" / "companion.db"
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

def _get_conn():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.execute(
        """CREATE TABLE IF NOT EXISTS messages (
               id INTEGER PRIMARY KEY AUTOINCREMENT,
               session_id TEXT NOT NULL,
               role TEXT NOT NULL,          -- 'user' or 'assistant'
               content TEXT NOT NULL,
               ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP
           )"""
    )
    return conn

def add_message(session_id: str, role: str, content: str):
    conn = _get_conn()
    conn.execute(
        "INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)",
        (session_id, role, content),
    )
    conn.commit()

def get_recent(session_id: str, limit: int = 20) -> List[Tuple[str, str]]:
    """Return list of (role, content) oldest→newest."""
    conn = _get_conn()
    cur = conn.execute(
        """SELECT role, content FROM messages
           WHERE session_id = ?
           ORDER BY ts DESC LIMIT ?""",
        (session_id, limit),
    )
    rows = cur.fetchall()
    return list(reversed(rows))  # oldest first