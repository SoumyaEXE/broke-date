"""Anchor income detection and cycle segmentation (SPEC 6.4)."""

from __future__ import annotations

import calendar
import re
from dataclasses import dataclass
from datetime import date, timedelta

import numpy as np
import pandas as pd


@dataclass
class Anchors:
    ids: list[str]
    dates: list[date]
    amounts_paise: list[int]
    sender: str
    mode: str                      # allowance | irregular

    @property
    def typical_amount_paise(self) -> int:
        a = self.amounts_paise[-3:] or [1]
        return int(np.median(a))

    def gaps(self) -> list[int]:
        return [(b - a).days for a, b in zip(self.dates, self.dates[1:], strict=False)]


def _dom_dist(a: int, b: int) -> int:
    d = abs(a - b)
    return min(d, 31 - d)


def detect_anchors(txns: pd.DataFrame, mode: str = "allowance", sender_pattern: str = "",
                   irregular_min_paise: int = 0) -> Anchors:
    """txns: ledger frame with columns id, date, direction, amount_paise, merchant, counterparty, status."""
    cr = txns[(txns["direction"] == "CREDIT") & (txns["status"] == "SUCCESS")].copy()
    if cr.empty:
        return Anchors([], [], [], "", mode)
    if mode == "irregular":
        sel = cr[cr["amount_paise"] >= irregular_min_paise]
        sel = sel[sel["counterparty"] != "bank"]
        return Anchors(sel["id"].tolist(), sel["date"].tolist(), sel["amount_paise"].astype(int).tolist(),
                       "any income >= threshold", mode)
    cr["sender"] = cr["merchant"].fillna("").str.upper().str.strip()
    if sender_pattern:
        groups = {sender_pattern: cr[cr["sender"].str.contains(sender_pattern, flags=re.I, regex=True)]}
    else:
        cr = cr[cr["counterparty"].isin(["person", "unknown", "merchant"])]
        groups = {str(s): g for s, g in cr.groupby("sender") if s}

    best: tuple[float, str, pd.DataFrame] | None = None
    for sender, g in groups.items():
        if len(g) < 2:
            continue
        # keep the regular, large credits: within +-40% of the sender's top-half median amount
        big = g[g["amount_paise"] >= 0.5 * float(g["amount_paise"].max())]
        med_amt = float(big["amount_paise"].median())
        cand = g[(g["amount_paise"] >= 0.6 * med_amt) & (g["amount_paise"] <= 1.4 * med_amt)]
        if cand.empty:
            continue
        doms = [d.day for d in cand["date"]]
        med_dom = int(np.median(doms))
        cand = cand[[_dom_dist(d.day, med_dom) <= 5 for d in cand["date"]]]
        # one anchor per ~month: within 15 days keep the larger
        keep: list[pd.Series] = []
        for _, row in cand.sort_values("date").iterrows():
            if keep and (row["date"] - keep[-1]["date"]).days < 15:
                if row["amount_paise"] > keep[-1]["amount_paise"]:
                    keep[-1] = row
                continue
            keep.append(row)
        if len(keep) < 2:
            continue
        months = len({(r["date"].year, r["date"].month) for r in keep})
        score = months * 10 + float(sum(r["amount_paise"] for r in keep)) / 1e7
        if best is None or score > best[0]:
            best = (score, str(sender), pd.DataFrame(keep))
    if best is None:
        return Anchors([], [], [], "", mode)
    _, sender, sel = best
    sel = sel.sort_values("date")
    return Anchors(sel["id"].tolist(), list(sel["date"]), sel["amount_paise"].astype(int).tolist(), sender, mode)


def next_anchor_date(anchors: Anchors, as_of: date, quantile: float = 0.75) -> tuple[date, bool]:
    """Predicted next anchor after `as_of`. Returns (date, scheduled?)."""
    if not anchors.dates:
        return as_of + timedelta(days=30), False
    last = max(d for d in anchors.dates if d <= as_of) if any(d <= as_of for d in anchors.dates) else None
    if anchors.mode == "allowance" and last is not None:
        dom = int(np.median([d.day for d in anchors.dates[-6:]]))
        y, m = last.year, last.month
        for _ in range(3):
            m += 1
            if m > 12:
                y, m = y + 1, 1
            d = date(y, m, min(dom, calendar.monthrange(y, m)[1]))
            if d > as_of:
                return d, True
        return as_of + timedelta(days=30), True
    gaps = anchors.gaps()
    g = int(np.quantile(gaps, quantile)) if gaps else 30
    base = last or as_of
    nxt = base + timedelta(days=max(g, 1))
    while nxt <= as_of:
        nxt += timedelta(days=max(g, 1))
    return nxt, False


@dataclass
class Cycle:
    cycle_id: int
    start: date          # anchor day
    end: date            # day before the next anchor
    anchor_paise: int

    @property
    def length(self) -> int:
        return (self.end - self.start).days + 1


def cycles_from_anchors(anchors: Anchors) -> list[Cycle]:
    out = []
    for i, (a, b) in enumerate(zip(anchors.dates, anchors.dates[1:], strict=False)):
        out.append(Cycle(i, a, b - timedelta(days=1), anchors.amounts_paise[i]))
    return out
