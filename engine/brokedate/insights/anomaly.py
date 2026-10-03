"""Unusual spends: TabPFN predicts how much each kind of spend normally costs, and flags the ones far outside it.

For every spend in the recent window, TabPFN (fit only on spends *before* the window) predicts 99 quantiles of the
amount from: category, how often this merchant was paid before and its usual amount, weekday, day of the allowance
month, hour, and the balance just before paying. A spend is unusual when its amount sits above the
`FLAG_PERCENTILE` of that predicted distribution and is at least `MIN_FLAG_RUPEES`. Nothing here is generated
text; every value shown is the model's own quantile or the statement's own amount.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Any

import numpy as np
import pandas as pd

from brokedate.enrich.rules import CATEGORIES
from brokedate.features.daily import Ledger
from brokedate.models.tabpfn_adapter import QS, DistRegressor

WINDOW_DAYS = 45          # spends checked: the last six weeks before as_of
MIN_TRAIN = 60            # spends needed before the window to learn what "normal" looks like
FLAG_PERCENTILE = 0.97    # above this quantile of the predicted amount = unusual
MIN_FLAG_RUPEES = 100     # never flag small change (a ₹30 chai can't be the problem)

FEATURES = ["category", "merchant_seen", "merchant_usual_log", "weekday", "day_in_cycle", "hour", "balance_log"]


@dataclass
class Unusual:
    txn_id: str
    date: str
    merchant: str
    category: str | None
    amount_paise: int
    usual_paise: int          # TabPFN median for a spend like this
    usual_hi_paise: int       # TabPFN 90th percentile
    percentile: float         # where the actual amount sits in TabPFN's predicted distribution (0..1)
    times_seen: int           # earlier payments to this merchant


@dataclass
class AnomalyReport:
    as_of: str
    window_days: int
    n_checked: int
    n_train: int
    unusual: list[Unusual] = field(default_factory=list)
    model: str = ""
    note: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {"as_of": self.as_of, "window_days": self.window_days, "n_checked": self.n_checked,
                "n_train": self.n_train, "model": self.model, "note": self.note,
                "flag_percentile": FLAG_PERCENTILE, "unusual": [u.__dict__ for u in self.unusual]}


def spend_features(led: Ledger) -> pd.DataFrame:
    """One row per spend, in statement order, with features that only use information from before that spend."""
    tx = led.txns[led.txns["is_spend"]].sort_values("seq").copy()
    if tx.empty:
        return tx.assign(**{f: [] for f in FEATURES}, y=[])
    cat_code = {c: i for i, c in enumerate(CATEGORIES)}
    tx["category_"] = tx["category"].fillna("other")
    tx["category"] = tx["category_"].map(lambda c: cat_code.get(c, len(CATEGORIES))).astype(float)
    key = tx["merchant"].fillna(tx["raw_narration"].str.slice(0, 24)).str.upper()
    tx["merchant_key"] = key
    tx["merchant_seen"] = tx.groupby(key).cumcount().astype(float)
    rupees = tx["amount_paise"] / 100.0
    # usual amount at this merchant from strictly earlier payments (NaN the first time -> category median so far)
    prior_med = rupees.groupby(key).transform(lambda s: s.expanding().median().shift(1))
    cat_prior = rupees.groupby(tx["category_"]).transform(lambda s: s.expanding().median().shift(1))
    tx["merchant_usual_log"] = np.log1p(prior_med.fillna(cat_prior).fillna(rupees.expanding().median().shift(1)).fillna(0))
    tx["weekday"] = pd.to_datetime(tx["date"]).dt.weekday.astype(float)
    tx["day_in_cycle"] = [float((d - led.prev_anchor(d)).days) for d in tx["date"]]
    tx["hour"] = tx["ts"].dt.hour.astype(float)
    tx["balance_log"] = np.log1p(np.maximum(tx["bal_before"] / 100.0, 0))
    tx["y"] = np.log1p(rupees)
    return tx


def find_unusual(led: Ledger, as_of: date, make_model: Callable[[], DistRegressor],
                 window_days: int = WINDOW_DAYS) -> AnomalyReport:
    """Fit on spends before the window, score every spend inside it. Pure function of the ledger and the model."""
    feats = spend_features(led)
    feats = feats[feats["date"] < as_of] if len(feats) else feats
    start = as_of - timedelta(days=window_days)
    train = feats[feats["date"] < start] if len(feats) else feats
    test = feats[feats["date"] >= start] if len(feats) else feats
    rep = AnomalyReport(as_of=str(as_of), window_days=window_days, n_checked=int(len(test)), n_train=int(len(train)))
    if len(train) < MIN_TRAIN or test.empty:
        rep.note = f"needs at least {MIN_TRAIN} earlier spends to learn what is normal"
        return rep
    model = make_model().fit(train[FEATURES].to_numpy(float), train["y"].to_numpy(float))
    rep.model = getattr(model, "version", "") or getattr(model, "name", "")
    Q = model.quantiles(test[FEATURES].to_numpy(float), QS)
    y = test["y"].to_numpy(float)
    for i, (_, row) in enumerate(test.iterrows()):
        q = Q[i]
        pct = float(np.interp(y[i], q, QS, left=0.0, right=1.0))
        amount = int(row["amount_paise"])
        if pct < FLAG_PERCENTILE or amount < MIN_FLAG_RUPEES * 100:
            continue
        rep.unusual.append(Unusual(
            txn_id=str(row["id"]), date=str(row["date"]), merchant=str(row["merchant"] or row["merchant_key"]).title(),
            category=row["category_"], amount_paise=amount,
            usual_paise=int(round(np.expm1(np.interp(0.5, QS, q)) * 100)),
            usual_hi_paise=int(round(np.expm1(np.interp(0.9, QS, q)) * 100)),
            percentile=round(pct, 3), times_seen=int(row["merchant_seen"]),
        ))
    rep.unusual.sort(key=lambda u: (-u.percentile, -u.amount_paise))
    return rep
