"""How good is the unusual-spend detector? Plant known anomalies, see who finds them.

Real statements have no "this was unusual" labels, so we make some: copy the ledger, pick `n_plants` ordinary spends
inside the checked window (seeded, reproducible) and multiply their amount by a factor (3x, 5x). Then every
detector scores the same window:

- TabPFN: amount above the 97th percentile of TabPFN's predicted distribution (the app's detector);
- merchant rule: amount more than 3x this merchant's earlier median (category median the first time);
- category z-score: amount more than 3 standard deviations above its category's earlier mean.

We report recall on the planted spends and false alarms on the untouched ones, per detector. One run per seed;
several seeds give a spread. Numbers are computed, never typed.
"""

from __future__ import annotations

import dataclasses
from collections.abc import Callable
from datetime import date, timedelta
from typing import Any

import numpy as np
import pandas as pd

from brokedate.features.daily import Ledger
from brokedate.insights.anomaly import MIN_FLAG_RUPEES, WINDOW_DAYS, find_unusual, spend_features
from brokedate.models.tabpfn_adapter import DistRegressor


def _plant(led: Ledger, as_of: date, n: int, factor: float, rng: np.random.Generator) -> tuple[Ledger, set[str]]:
    tx = led.txns.copy()
    start = as_of - timedelta(days=WINDOW_DAYS)
    pool = tx[tx["is_spend"] & (tx["date"] >= start) & (tx["date"] < as_of)]
    # only spends that become big enough to be flaggable at all, so recall measures the model, not the floor
    pool = pool[pool["amount_paise"] * factor >= MIN_FLAG_RUPEES * 100]
    idx = rng.choice(pool.index.to_numpy(), size=min(n, len(pool)), replace=False)
    tx.loc[idx, "amount_paise"] = (tx.loc[idx, "amount_paise"] * factor).round().astype(np.int64)
    return dataclasses.replace(led, txns=tx), {str(tx.loc[i, "id"]) for i in idx}


def _rule_flags(led: Ledger, as_of: date) -> tuple[set[str], set[str]]:
    """(merchant-rule flags, category z-score flags) on the same window, using only earlier spends."""
    f = spend_features(led)
    f = f[f["date"] < as_of]
    start = as_of - timedelta(days=WINDOW_DAYS)
    rupees = f["amount_paise"] / 100.0
    usual = np.expm1(f["merchant_usual_log"])
    cat = f["category_"]
    mean = rupees.groupby(cat).transform(lambda s: s.expanding().mean().shift(1))
    std = rupees.groupby(cat).transform(lambda s: s.expanding().std().shift(1))
    win = (f["date"] >= start) & (rupees >= MIN_FLAG_RUPEES)
    merchant = set(f.loc[win & (rupees > 3 * usual.clip(lower=1)), "id"].astype(str))
    z = (rupees - mean) / std.replace(0, np.nan)
    zscore = set(f.loc[win & (z > 3).fillna(False), "id"].astype(str))
    return merchant, zscore


def _score(flags: set[str], planted: set[str], checked: set[str]) -> dict[str, Any]:
    clean = checked - planted
    tp = len(flags & planted)
    fp = len(flags & clean)
    return {"recall": round(tp / len(planted), 3) if planted else None, "found": tp, "planted": len(planted),
            "false_alarms": fp, "false_alarm_rate": round(fp / len(clean), 3) if clean else None}


def evaluate_detectors(led: Ledger, as_of: date, make_model: Callable[[], DistRegressor], seeds: tuple[int, ...] = (1, 2, 3),
                       factors: tuple[float, ...] = (3.0, 5.0), n_plants: int = 5) -> dict[str, Any]:
    rows = []
    for factor in factors:
        for seed in seeds:
            planted_led, planted = _plant(led, as_of, n_plants, factor, np.random.default_rng(seed))
            rep = find_unusual(planted_led, as_of, make_model)
            feats = spend_features(planted_led)
            checked = set(feats[(feats["date"] >= as_of - timedelta(days=WINDOW_DAYS)) & (feats["date"] < as_of)]["id"].astype(str))
            merchant, zscore = _rule_flags(planted_led, as_of)
            for name, flags in (("tabpfn", {u.txn_id for u in rep.unusual}), ("merchant_3x", merchant), ("category_z3", zscore)):
                rows.append({"detector": name, "factor": factor, "seed": seed, **_score(flags, planted, checked)})
    df = pd.DataFrame(rows)
    summary: dict[str, dict[str, dict[str, float]]] = {}
    for (det, fac), g in df.groupby(["detector", "factor"]):
        summary.setdefault(str(det), {})[f"x{float(str(fac)):g}"] = {
            "recall_mean": round(float(g["recall"].mean()), 3), "recall_min": round(float(g["recall"].min()), 3),
            "false_alarms_mean": round(float(g["false_alarms"].mean()), 2),
            "false_alarm_rate_mean": round(float(g["false_alarm_rate"].mean()), 4)}
    return {"as_of": str(as_of), "window_days": WINDOW_DAYS, "n_plants": n_plants, "seeds": list(seeds),
            "factors": list(factors), "summary": summary, "runs": rows,
            "note": "planted anomalies on the SIMULATED statement; real anomalies have no labels"}
