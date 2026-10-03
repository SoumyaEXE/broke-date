"""Glue used by CLI and API: load a subject's ledger from the DB."""

from __future__ import annotations

import json
from datetime import date, timedelta
from typing import TYPE_CHECKING

from brokedate.config import Config
from brokedate.db import DB
from brokedate.features.calendar import Calendar
from brokedate.features.daily import Ledger, build_ledger
from brokedate.ingest.cycles import Anchors, detect_anchors
from brokedate.sim.events import Plan

if TYPE_CHECKING:
    from brokedate.forecast.build import ForecastBundle


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


def load_plans(db: DB, subject: str) -> list[Plan]:
    return [Plan(p["id"], p["name"], int(p["amount_paise"]), date.fromisoformat(p["date"]), bool(p["active"]))
            for p in db.plans(subject)]


def load_spread_k(subject: str) -> float:
    """Calibration k from the latest backtest of this subject (nested fit; 1.0 if none)."""
    from brokedate.cli import out_dir

    f = out_dir(subject) / "backtest" / subject / "summary.json"
    if f.is_file():
        k = json.loads(f.read_text(encoding="utf-8")).get("calibration", {}).get("k_last")
        if k:
            return float(k)
    return 1.0


def default_as_of(led: Ledger) -> date:
    return min(date.today(), led.last_day + timedelta(days=1))


def forecast_for(db: DB, cfg: Config, subject: str, as_of: date | None = None, n: int | None = None,
                 include_lattice: bool = False) -> ForecastBundle:
    from brokedate.forecast import engine as fe
    from brokedate.forecast.build import build_forecast

    led = load_ledger(db, cfg, subject)
    d = as_of or default_as_of(led)
    p = fe.prepare(led, cfg, d, n=n, k=load_spread_k(subject))
    return build_forecast(p, load_plans(db, subject), subject, include_lattice=include_lattice)
