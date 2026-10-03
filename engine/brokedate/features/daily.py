"""Transactions -> daily table -> closure-safe feature rows (SPEC 5.2, 8)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

import numpy as np
import pandas as pd

from brokedate.features.calendar import Calendar
from brokedate.features.spec import DIRECT_FEATURES, SPEND_FEATURES
from brokedate.ingest.cycles import Anchors, next_anchor_date
from brokedate.sim.events import Recurring, detect_recurring


def is_spend(df: pd.DataFrame) -> pd.Series:
    """Consumption spend: successful debits, not bank charges, not transfers to own accounts (ATM cash counts)."""
    debit = (df["direction"] == "DEBIT") & (df["status"] == "SUCCESS")
    bank = df["counterparty"] == "bank"
    self_xfer = (df["counterparty"] == "self") & (df["category"] != "cash_withdrawal")
    return debit & ~bank & ~self_xfer


@dataclass
class Ledger:
    subject: str
    txns: pd.DataFrame
    anchors: Anchors
    recurring: list[Recurring]
    daily: pd.DataFrame          # indexed 0..n-1, column 'date'
    calendar: Calendar
    opening_paise: int

    @property
    def first_day(self) -> date:
        return self.daily["date"].iloc[0]

    @property
    def last_day(self) -> date:
        return self.daily["date"].iloc[-1]

    def anchor_amount_at(self, d: date) -> int:
        prev = [a for x, a in zip(self.anchors.dates, self.anchors.amounts_paise, strict=True) if x <= d]
        if not prev:
            prev = self.anchors.amounts_paise[:1] or [300000]
        return int(np.median(prev[-3:]))

    def prev_anchor(self, d: date) -> date:
        prev = [x for x in self.anchors.dates if x <= d]
        if prev:
            return prev[-1]
        first = self.anchors.dates[0] if self.anchors.dates else self.first_day
        while first > d:
            first -= timedelta(days=30)
        return first

    def next_anchor_actual(self, d: date) -> date | None:
        nxt = [x for x in self.anchors.dates if x > d]
        return nxt[0] if nxt else None

    def next_anchor(self, d: date, hindsight: bool = True) -> tuple[date, bool]:
        """(date, known). hindsight=True uses the realised next anchor when the history has one."""
        if hindsight and (a := self.next_anchor_actual(d)) is not None:
            return a, True
        past = Anchors([], [x for x in self.anchors.dates if x <= d],
                       [a for x, a in zip(self.anchors.dates, self.anchors.amounts_paise, strict=True) if x <= d],
                       self.anchors.sender, self.anchors.mode)
        return next_anchor_date(past if past.dates else self.anchors, d)

    def row_of(self, d: date) -> int:
        return (d - self.first_day).days


def build_ledger(subject: str, txns: pd.DataFrame, anchors: Anchors, calendar: Calendar, opening_paise: int
                 ) -> Ledger:
    df = txns.sort_values("seq").copy()
    df["is_spend"] = is_spend(df)
    recurring = detect_recurring(df)
    sched_ids = {i for r in recurring for i in r.txn_ids}
    df["is_sched"] = df["id"].isin(sched_ids) & df["is_spend"]
    df["signed"] = np.where(df["direction"] == "CREDIT", df["amount_paise"], -df["amount_paise"])
    df["bal_after"] = opening_paise + df["signed"].cumsum()
    df["bal_before"] = df["bal_after"] - df["signed"]
    start, end = df["date"].min(), df["date"].max()
    days = [start + timedelta(days=i) for i in range((end - start).days + 1)]
    by = df["date"]
    amt = df["amount_paise"]
    anchor_ids = set(anchors.ids)
    spend = amt.where(df["is_spend"], 0).groupby(by).sum()
    sched = amt.where(df["is_sched"], 0).groupby(by).sum()
    anchor_in = amt.where(df["id"].isin(anchor_ids), 0).groupby(by).sum()
    credit = amt.where(df["direction"] == "CREDIT", 0).groupby(by).sum()
    other_out = amt.where((df["direction"] == "DEBIT") & ~df["is_spend"], 0).groupby(by).sum()
    bal_end = df["bal_after"].groupby(by).last()
    # lowest running balance within the day (statement order), including the start-of-day balance
    bal_min = pd.concat([df["bal_after"].groupby(by).min(), df["bal_before"].groupby(by).first()], axis=1).min(axis=1)
    daily = pd.DataFrame({"date": days})
    daily["spend_paise"] = daily["date"].map(spend).fillna(0).astype(np.int64)
    daily["sched_paise"] = daily["date"].map(sched).fillna(0).astype(np.int64)
    daily["free_spend_paise"] = daily["spend_paise"] - daily["sched_paise"]
    daily["anchor_paise"] = daily["date"].map(anchor_in).fillna(0).astype(np.int64)
    daily["income_paise"] = daily["date"].map(credit).fillna(0).astype(np.int64) - daily["anchor_paise"]
    daily["other_out_paise"] = daily["date"].map(other_out).fillna(0).astype(np.int64)
    be = daily["date"].map(bal_end)
    be.iloc[0] = be.iloc[0] if pd.notna(be.iloc[0]) else opening_paise
    daily["bal_end_paise"] = be.ffill().astype(np.int64)
    daily["bal_start_paise"] = daily["bal_end_paise"].shift(1).fillna(opening_paise).astype(np.int64)
    bm = daily["date"].map(bal_min)
    daily["bal_min_paise"] = np.minimum(bm.fillna(daily["bal_start_paise"]), daily["bal_start_paise"]).astype(np.int64)
    led = Ledger(subject, df, anchors, recurring, daily, calendar, opening_paise)
    return led


# ----------------------------------------------------------------------------------------------------
def calendar_row(led: Ledger, d: date, next_anchor: date, scheduled_paise: int) -> dict[str, float]:
    prev = led.prev_anchor(d)
    dic = (d - prev).days
    dta = (next_anchor - d).days
    cyc = max((next_anchor - prev).days, 1)
    return {
        "dow": d.weekday(), "is_weekend": int(d.weekday() >= 5), "day_in_cycle": dic, "days_to_anchor": dta,
        "frac_cycle": dic / cyc, "is_festival": int(led.calendar.festival(d) is not None),
        "days_to_festival": led.calendar.days_to_festival(d), "is_exam": int(led.calendar.is_exam(d)),
        "scheduled_today": scheduled_paise / 100.0,
    }


def state_features(bal_rupees: np.ndarray, s3: np.ndarray, s14: np.ndarray, anchor_rupees: float,
                   days_to_anchor: int) -> dict[str, np.ndarray]:
    return {
        "bal_rupees": bal_rupees, "bal_frac": bal_rupees / max(anchor_rupees, 1.0),
        "safe_daily": bal_rupees / max(days_to_anchor, 1), "spend_3d": s3, "spend_14d": s14,
    }


def feature_table(led: Ledger, until: date, min_history: int = 14) -> pd.DataFrame:
    """One row per day d in [first_day + min_history, until) with features (data < d) and targets.

    Targets: free_spend_rupees (spend model) and remaining_rupees / remaining_known (direct model).
    """
    daily = led.daily
    spend_r = daily["spend_paise"].to_numpy() / 100.0
    free_r = daily["free_spend_paise"].to_numpy() / 100.0
    rows = []
    for i in range(min_history, len(daily)):
        d = daily["date"].iloc[i]
        if d >= until:
            break
        nxt, known = led.next_anchor(d, hindsight=True)
        # an anchor that lands after `until` is not knowable at `until`: use the predicted date for features
        nxt_for_feat = nxt if (known and nxt <= until) else led.next_anchor(d, hindsight=False)[0]
        cal = calendar_row(led, d, nxt_for_feat, int(daily["sched_paise"].iloc[i]))
        bal = daily["bal_start_paise"].iloc[i] / 100.0
        st = state_features(np.array([bal]), np.array([spend_r[i - 3:i].sum()]), np.array([spend_r[i - 14:i].sum()]),
                            led.anchor_amount_at(d) / 100.0, int(cal["days_to_anchor"]))
        row = {"date": d, **cal, **{k: float(v[0]) for k, v in st.items()}, "free_spend_rupees": free_r[i]}
        prev = led.prev_anchor(d)
        j0 = max(led.row_of(prev), 0)
        row["cycle_spend_so_far"] = float(free_r[j0:i].sum())
        jn = led.row_of(nxt)
        complete = known and jn <= len(daily)
        row["remaining_rupees"] = float(free_r[i:jn].sum()) if complete else np.nan
        row["next_anchor"] = nxt
        rows.append(row)
    return pd.DataFrame(rows)


def spend_xy(ft: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
    return ft[SPEND_FEATURES].to_numpy(dtype=float), ft["free_spend_rupees"].to_numpy(dtype=float)


def direct_xy(ft: pd.DataFrame, origin: date) -> tuple[np.ndarray, np.ndarray]:
    """Direct-model training rows whose whole target window ends before `origin` (no leakage)."""
    ok = ft["remaining_rupees"].notna() & (ft["next_anchor"] <= origin)
    sub = ft[ok]
    return sub[DIRECT_FEATURES].to_numpy(dtype=float), sub["remaining_rupees"].to_numpy(dtype=float)
