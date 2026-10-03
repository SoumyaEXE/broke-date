"""SQLite ledger (SPEC 5.1). Integer paise only."""

from __future__ import annotations

import json
import sqlite3
from collections.abc import Iterable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pandas as pd

SCHEMA = """
CREATE TABLE IF NOT EXISTS txn (
  id            TEXT PRIMARY KEY,
  subject       TEXT NOT NULL,
  ts            TEXT NOT NULL,
  seq           INTEGER NOT NULL,
  amount_paise  INTEGER NOT NULL CHECK (amount_paise >= 0),
  direction     TEXT NOT NULL CHECK (direction IN ('DEBIT','CREDIT')),
  status        TEXT NOT NULL DEFAULT 'SUCCESS',
  balance_after_paise INTEGER,
  raw_narration TEXT NOT NULL,
  ref_no        TEXT,
  merchant      TEXT,
  category      TEXT,
  counterparty  TEXT,
  label_source  TEXT,
  confidence    REAL,
  is_anchor_income INTEGER NOT NULL DEFAULT 0,
  source_file   TEXT,
  source_row    INTEGER
);
CREATE INDEX IF NOT EXISTS txn_subject_ts ON txn(subject, ts, seq);
CREATE TABLE IF NOT EXISTS label_cache (narration_key TEXT PRIMARY KEY, merchant TEXT, category TEXT,
                                        counterparty TEXT, source TEXT, confidence REAL, created_at TEXT);
CREATE TABLE IF NOT EXISTS plan (id TEXT PRIMARY KEY, subject TEXT, name TEXT, amount_paise INTEGER,
                                 date TEXT, active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
"""

TXN_COLS = ["id", "subject", "ts", "seq", "amount_paise", "direction", "status", "balance_after_paise",
            "raw_narration", "ref_no", "merchant", "category", "counterparty", "label_source", "confidence",
            "is_anchor_income", "source_file", "source_row"]


class DB:
    def __init__(self, path: Path | str) -> None:
        self.path = Path(path)
        if str(path) != ":memory:":
            self.path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(str(path), check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript(SCHEMA)

    def close(self) -> None:
        self.conn.close()

    # --- txns -----------------------------------------------------------------------------------------
    def existing_ids(self, subject: str) -> set[str]:
        return {r[0] for r in self.conn.execute("SELECT id FROM txn WHERE subject=?", (subject,))}

    def max_seq(self, subject: str) -> int:
        r = self.conn.execute("SELECT COALESCE(MAX(seq), -1) FROM txn WHERE subject=?", (subject,)).fetchone()
        return int(r[0])

    def insert_txns(self, rows: Iterable[dict[str, Any]]) -> int:
        rows = list(rows)
        for r in rows:
            if not isinstance(r["amount_paise"], int):
                raise TypeError("amount_paise must be int")
        q = f"INSERT OR IGNORE INTO txn ({','.join(TXN_COLS)}) VALUES ({','.join('?' * len(TXN_COLS))})"
        with self.conn:
            cur = self.conn.executemany(q, [tuple(r.get(c) for c in TXN_COLS) for r in rows])
        return cur.rowcount

    def update_labels(self, txn_id: str, merchant: str | None, category: str | None, counterparty: str | None,
                      source: str, confidence: float | None = None) -> None:
        with self.conn:
            self.conn.execute("UPDATE txn SET merchant=?, category=?, counterparty=?, label_source=?, confidence=? "
                              "WHERE id=?", (merchant, category, counterparty, source, confidence, txn_id))

    def set_anchor_flags(self, subject: str, ids: set[str]) -> None:
        with self.conn:
            self.conn.execute("UPDATE txn SET is_anchor_income=0 WHERE subject=?", (subject,))
            self.conn.executemany("UPDATE txn SET is_anchor_income=1, category='allowance' WHERE id=?",
                                  [(i,) for i in ids])

    def load_txns(self, subject: str) -> pd.DataFrame:
        df = pd.read_sql_query("SELECT * FROM txn WHERE subject=? ORDER BY seq", self.conn, params=(subject,))
        if not df.empty:
            df["ts"] = pd.to_datetime(df["ts"])
            df["date"] = df["ts"].dt.date
        return df

    def subjects(self) -> list[str]:
        return [r[0] for r in self.conn.execute("SELECT DISTINCT subject FROM txn ORDER BY subject")]

    def delete_subject(self, subject: str) -> None:
        with self.conn:
            self.conn.execute("DELETE FROM txn WHERE subject=?", (subject,))
            self.conn.execute("DELETE FROM plan WHERE subject=?", (subject,))
            self.conn.execute("DELETE FROM settings WHERE key LIKE ?", (f"{subject}:%",))

    # --- label cache ----------------------------------------------------------------------------------
    def cache_get(self, key: str) -> dict[str, Any] | None:
        r = self.conn.execute("SELECT * FROM label_cache WHERE narration_key=?", (key,)).fetchone()
        return dict(r) if r else None

    def cache_put(self, key: str, merchant: str | None, category: str | None, counterparty: str | None,
                  source: str, confidence: float | None) -> None:
        with self.conn:
            self.conn.execute("INSERT OR REPLACE INTO label_cache VALUES (?,?,?,?,?,?,?)",
                              (key, merchant, category, counterparty, source, confidence,
                               datetime.now(UTC).isoformat()))

    # --- plans ----------------------------------------------------------------------------------------
    def plans(self, subject: str) -> list[dict[str, Any]]:
        return [dict(r) for r in self.conn.execute("SELECT * FROM plan WHERE subject=? ORDER BY date, name",
                                                   (subject,))]

    def upsert_plan(self, subject: str, plan_id: str, name: str, amount_paise: int, date: str,
                    active: bool = True) -> None:
        with self.conn:
            self.conn.execute("INSERT OR REPLACE INTO plan VALUES (?,?,?,?,?,?)",
                              (plan_id, subject, name, int(amount_paise), date, int(active)))

    def set_plan_active(self, plan_id: str, active: bool) -> None:
        with self.conn:
            self.conn.execute("UPDATE plan SET active=? WHERE id=?", (int(active), plan_id))

    def delete_plan(self, plan_id: str) -> None:
        with self.conn:
            self.conn.execute("DELETE FROM plan WHERE id=?", (plan_id,))

    # --- settings -------------------------------------------------------------------------------------
    def get_setting(self, key: str, default: Any = None) -> Any:
        r = self.conn.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
        return json.loads(r[0]) if r else default

    def set_setting(self, key: str, value: Any) -> None:
        with self.conn:
            self.conn.execute("INSERT OR REPLACE INTO settings VALUES (?,?)", (key, json.dumps(value)))
