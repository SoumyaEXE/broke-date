"""Unusual spends: TabPFN predicts how much each kind of spend normally costs, and flags the ones far outside it.

For every spend in the recent window, TabPFN (fit only on spends *before* the window) predicts 99 quantiles of the
amount from: category, how often this merchant was paid before and its usual amount, weekday, day of the allowance
month, hour, and the balance just before paying. A spend is unusual when TabPFN gives a spend that big a chance
of at most `1 - FLAG_PERCENTILE` and it is at least `MIN_FLAG_RUPEES`. The chance comes from TabPFN's full
predicted distribution (its exact CDF, tails included), so it can say "about 1 in 400" instead of only "above the
99th percentile". `tail_check` reports how many ordinary spends TabPFN called that rare, against how many it should
have if its tails are honest. Nothing here is generated text; every value is the model's or the statement's own.
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
ONE_IN_CAP = 10_000       # beyond this the tail is extrapolation; shown as "rarer than 1 in 10,000"

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
    chance: float = 0.0       # TabPFN's probability of a spend at least this big (exact CDF, tails included)
    one_in: int = 0           # the same as "about 1 in N" (round(1 / chance), capped at ONE_IN_CAP)


@dataclass
class AnomalyReport:
    as_of: str
    window_days: int
    n_checked: int
    n_train: int
    unusual: list[Unusual] = field(default_factory=list)
    model: str = ""
    note: str | None = None
    tail_check: dict[str, Any] = field(default_factory=dict)
    closest: list[Unusual] = field(default_factory=list)  # rarest spends that were NOT flagged, so "nothing unusual" shows its work

    def to_dict(self) -> dict[str, Any]:
        return {"as_of": self.as_of, "window_days": self.window_days, "n_checked": self.n_checked,
                "n_train": self.n_train, "model": self.model, "note": self.note,
                "flag_percentile": FLAG_PERCENTILE, "tail_check": self.tail_check,
                "unusual": [u.__dict__ for u in self.unusual], "closest": [u.__dict__ for u in self.closest]}


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
    Xt = test[FEATURES].to_numpy(float)
    Q = model.quantiles(Xt, QS)
    y = test["y"].to_numpy(float)
    # chance of a spend at least this big: the amount itself counts, so evaluate a hair below it
    chance = model.exceed_prob(Xt, y - 1e-9)
    rep.tail_check = tail_check(chance)
    for i, (_, row) in enumerate(test.iterrows()):
        q = Q[i]
        p = float(chance[i])
        amount = int(row["amount_paise"])
        flagged = p <= 1 - FLAG_PERCENTILE and amount >= MIN_FLAG_RUPEES * 100
        (rep.unusual if flagged else rep.closest).append(Unusual(
            txn_id=str(row["id"]), date=str(row["date"]), merchant=str(row["merchant"] or row["merchant_key"]).title(),
            category=row["category_"], amount_paise=amount,
            usual_paise=int(round(np.expm1(np.interp(0.5, QS, q)) * 100)),
            usual_hi_paise=int(round(np.expm1(np.interp(0.9, QS, q)) * 100)),
            percentile=round(1 - p, 4), times_seen=int(row["merchant_seen"]),
            chance=round(p, 6), one_in=one_in(p),
        ))
    rep.unusual.sort(key=lambda u: (u.chance, -u.amount_paise))
    rep.closest = sorted(rep.closest, key=lambda u: (u.chance, -u.amount_paise))[:3]
    return rep


def one_in(p: float) -> int:
    return ONE_IN_CAP if p <= 1 / ONE_IN_CAP else int(round(1 / p))


def tail_check(chance: np.ndarray) -> dict[str, Any]:
    """If TabPFN's tails are honest, about 3% of spends get a chance <= 3% (and 10% get <= 10%). Small windows
    are noisy, so counts are reported, not a verdict."""
    n = int(len(chance))
    return {"n": n, "levels": [{"level": lv, "expected": round(lv * n, 1), "observed": int((chance <= lv).sum())}
                               for lv in (0.03, 0.10)]}
