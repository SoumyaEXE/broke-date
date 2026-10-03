"""Dashboard context computed from the ledger (no model): this cycle's spending by group vs typical, recurring
payments, this-cycle vs last-cycle balance, recent transactions. Everything here is measured, not forecast."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

import numpy as np

from brokedate.features.daily import Ledger
from brokedate.sim.events import detect_recurring

GROUPS: dict[str, tuple[str, ...]] = {
    "Essentials": ("transport", "campus_food", "groceries_snacks", "recharge_bills", "education"),
    "Lifestyle": ("food_delivery", "outing", "shopping", "gaming"),
    "Friends & family": ("transfer_to_person",),
    "Cash & other": ("cash_withdrawal", "other"),
}


def _group_of(cat: str | None) -> str:
    for g, cats in GROUPS.items():
        if cat in cats:
            return g
    return "Cash & other"


def dashboard_context(led: Ledger, as_of: date) -> dict[str, Any]:
    tx = led.txns[led.txns["date"] < as_of]
    spend = tx[tx["is_spend"]].copy()
    spend["group"] = spend["category"].map(_group_of)
    start = led.prev_anchor(as_of - timedelta(days=1))
    dic = (as_of - start).days
    cur = spend[spend["date"] >= start]

    # typical: average over past full cycles of spending in the same first `dic` days
    past = [(a, b) for a, b in zip(led.anchors.dates, led.anchors.dates[1:], strict=False) if b <= start]
    typical: dict[str, float] = {g: 0.0 for g in GROUPS}
    typical_cat: dict[str, float] = {}
    for a, _b in past:
        win = spend[(spend["date"] >= a) & (spend["date"] < a + timedelta(days=dic))]
        for g, v in win.groupby("group")["amount_paise"].sum().items():
            typical[str(g)] += float(v) / max(len(past), 1)
        for c, v in win.groupby("category")["amount_paise"].sum().items():
            typical_cat[str(c)] = typical_cat.get(str(c), 0.0) + float(v) / max(len(past), 1)
    groups = []
    for g, cats in GROUPS.items():
        sub = cur[cur["group"] == g]
        by_cat = sub.groupby("category")["amount_paise"].sum().sort_values(ascending=False)
        groups.append({
            "group": g, "spent_paise": int(sub["amount_paise"].sum()),
            "typical_paise": int(round(typical[g])) if past else None,
            "n_txns": int(len(sub)), "categories": list(cats),
            "top": [{"category": str(c), "spent_paise": int(v),
                     "typical_paise": int(round(typical_cat.get(str(c), 0.0))) if past else None}
                    for c, v in by_cat.head(4).items()],
        })

    # balance this cycle vs last cycle, by day in cycle
    daily = led.daily
    r0 = led.row_of(start)
    this_bal = daily["bal_end_paise"].iloc[r0:min(led.row_of(as_of), len(daily))].astype(int).tolist()
    last = None
    if past:
        a, b = past[-1]
        last = {"start": str(a), "balances_paise": daily["bal_end_paise"].iloc[led.row_of(a):led.row_of(b)]
                .astype(int).tolist(), "label": a.strftime("%B")}

    rec = []
    for r in detect_recurring(led.txns, before=as_of):
        nxt = r.last_date + timedelta(days=r.period_days)
        while nxt < as_of:
            nxt += timedelta(days=r.period_days)
        rec.append({"name": r.name, "amount_paise": r.amount_paise, "period_days": r.period_days,
                    "next_date": str(nxt), "last_date": str(r.last_date), "n_seen": len(r.txn_ids)})

    recent = tx.sort_values("seq", ascending=False).head(40)
    txns = [{"id": str(t["id"]), "date": str(t["date"]), "merchant": t["merchant"] or "?",
             "category": t["category"], "direction": t["direction"], "amount_paise": int(t["amount_paise"]),
             "status": t["status"], "label_source": t["label_source"],
             "is_anchor": bool(t["is_anchor_income"])} for _, t in recent.iterrows()]

    spent_cycle = int(cur["amount_paise"].sum())
    anchor_amt = led.anchor_amount_at(as_of - timedelta(days=1))
    days_spend = daily["spend_paise"].iloc[max(r0, led.row_of(as_of) - 14):led.row_of(as_of)]
    return {
        "cycle": {"start": str(start), "day_in_cycle": dic, "anchor_paise": int(anchor_amt),
                  "spent_paise": spent_cycle,
                  "typical_spent_paise": int(round(sum(typical.values()))) if past else None,
                  "avg_daily_14d_paise": int(round(float(np.mean(days_spend)))) if len(days_spend) else 0,
                  "groups": groups, "n_past_cycles": len(past)},
        "balance_compare": {"this": this_bal, "last": last},
        "recurring": rec,
        "transactions": txns,
        "upcoming": upcoming_festivals(led, as_of),
    }


def _base_name(name: str) -> str:
    """'Diwali / Kali Puja' and 'Kali Puja / Diwali' are the same festival: compare sorted name parts."""
    return " / ".join(sorted(p.strip().lower() for p in name.split("/")))


def upcoming_festivals(led: Ledger, as_of: date, within_days: int = 60) -> list[dict[str, Any]]:
    """Festivals starting in the next `within_days` (or happening now), each with what the same festival cost last
    time it appears in the statement: spend in its window (plus two days of build-up) vs an ordinary stretch of the
    same length (median daily spend of the 60 days before it). Measured from the ledger, never forecast."""
    spend = led.txns[led.txns["is_spend"]]
    daily = spend.groupby("date")["amount_paise"].sum()
    out = []
    for name, a, b in led.calendar.festivals:
        if b < as_of or a > as_of + timedelta(days=within_days):
            continue
        prev = [(n, x, y) for n, x, y in led.calendar.festivals
                if _base_name(n) == _base_name(name) and y < a and x >= led.first_day]
        last = None
        if prev:
            _, x, y = prev[-1]
            win_start = x - timedelta(days=2)
            n_days = (y - win_start).days + 1
            spent = int(sum(int(daily.get(win_start + timedelta(days=i), 0)) for i in range(n_days)))
            before = [int(daily.get(win_start - timedelta(days=i), 0)) for i in range(1, 61)]
            usual = int(round(float(np.median(before)) * n_days)) if before else 0
            last = {"start": str(x), "end": str(y), "days": n_days, "spent_paise": spent, "usual_paise": usual,
                    "extra_paise": spent - usual}
        out.append({"name": name, "start": str(a), "end": str(b), "days_until": max(0, (a - as_of).days), "last": last})
    return out
