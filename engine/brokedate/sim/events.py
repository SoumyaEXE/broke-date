"""Scheduled known events: recurring outflows (recharges, subscriptions) and user plans (SPEC 10.4)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

import numpy as np
import pandas as pd


@dataclass
class Recurring:
    name: str
    amount_paise: int
    period_days: int
    last_date: date
    txn_ids: list[str]

    def dates_between(self, start: date, end: date) -> list[date]:
        out = []
        d = self.last_date + timedelta(days=self.period_days)
        while d <= end:
            if d >= start:
                out.append(d)
            d += timedelta(days=self.period_days)
        return out


@dataclass
class Plan:
    id: str
    name: str
    amount_paise: int
    date: date
    active: bool = True


def detect_recurring(txns: pd.DataFrame, before: date | None = None) -> list[Recurring]:
    """Same merchant, ~same amount, regular 25..35 day gaps, >= 3 occurrences."""
    df = txns[(txns["direction"] == "DEBIT") & (txns["status"] == "SUCCESS")]
    if before is not None:
        df = df[df["date"] < before]
    out: list[Recurring] = []
    if df.empty:
        return out
    for key, g in df.groupby([df["merchant"].fillna("?"), "amount_paise"]):
        merchant, amount = str(key[0]), int(key[1])  # type: ignore[index,call-overload]
        if len(g) < 3 or amount < 5000:
            continue
        dates = sorted(g["date"])
        gaps = np.diff([d.toordinal() for d in dates])
        if len(gaps) and (np.abs(gaps - np.median(gaps)) <= 3).mean() >= 0.75 and 25 <= np.median(gaps) <= 35:
            out.append(Recurring(merchant, amount, int(round(float(np.median(gaps)))), dates[-1],
                                 g["id"].tolist()))
    return out


def scheduled_by_day(recurring: list[Recurring], plans: list[Plan], start: date, horizon: int,
                     include_plans: bool = True) -> np.ndarray:
    """Deterministic scheduled outflow per horizon day (paise), shape (horizon,)."""
    out = np.zeros(horizon, dtype=np.int64)
    end = start + timedelta(days=horizon - 1)
    for r in recurring:
        for d in r.dates_between(start, end):
            out[(d - start).days] += r.amount_paise
    if include_plans:
        for p in plans:
            if p.active and start <= p.date <= end:
                out[(p.date - start).days] += p.amount_paise
    return out
