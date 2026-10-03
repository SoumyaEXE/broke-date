"""Glue used by CLI and API: load a subject's ledger from the DB."""

from __future__ import annotations

from brokedate.config import Config
from brokedate.db import DB
from brokedate.features.calendar import Calendar
from brokedate.features.daily import Ledger, build_ledger
from brokedate.ingest.cycles import Anchors, detect_anchors


class NoDataError(RuntimeError):
    pass


def load_anchors(db: DB, cfg: Config, subject: str) -> Anchors:
    df = db.load_txns(subject)
    sc = cfg.subject(subject)
    confirmed = db.get_setting(f"{subject}:anchors_confirmed")
    if confirmed:
        sel = df[df["id"].isin(confirmed)].sort_values("seq")
        return Anchors(sel["id"].tolist(), list(sel["date"]), sel["amount_paise"].astype(int).tolist(),
                       str(sel["merchant"].iloc[0]) if len(sel) else "", sc.anchor_mode)
    return detect_anchors(df, sc.anchor_mode, sc.anchor_sender_pattern, sc.irregular_min_income_rupees * 100)


def load_ledger(db: DB, cfg: Config, subject: str) -> Ledger:
    df = db.load_txns(subject)
    if df.empty:
        raise NoDataError(f"no transactions for subject {subject!r}; import a statement first")
    anchors = load_anchors(db, cfg, subject)
    cal = Calendar.load(cfg.festivals_file, cfg.subject(subject).exams)
    opening = db.get_setting(f"{subject}:opening_paise")
    if opening is None:
        first = df.iloc[0]
        opening = int(first["balance_after_paise"]) - (
            int(first["amount_paise"]) if first["direction"] == "CREDIT" else -int(first["amount_paise"]))
    return build_ledger(subject, df, anchors, cal, int(opening))
