"""Unusual-spend detector and TabPFN categorizer: leakage, planted anomalies, honest empty states."""

from __future__ import annotations

import dataclasses
from datetime import timedelta

import numpy as np
import pytest

from brokedate.insights.anomaly import FEATURES, MIN_TRAIN, find_unusual, spend_features
from brokedate.models.tabpfn_adapter import DistRegressor


class CategoryQuantiles(DistRegressor):
    """Cheap stand-in for TabPFN: the empirical quantiles of log-amount per category (feature 0)."""

    name = "category-quantiles"

    def fit(self, X: np.ndarray, y: np.ndarray) -> CategoryQuantiles:
        self.by = {c: y[X[:, 0] == c] for c in np.unique(X[:, 0])}
        self.all = y
        return self

    def quantiles(self, X: np.ndarray, qs: np.ndarray) -> np.ndarray:
        return np.stack([np.quantile(self.by.get(c, self.all) if len(self.by.get(c, [])) >= 5 else self.all, qs)
                         for c in X[:, 0]])


def test_features_use_only_earlier_payments(sim_ledger):
    _, _, led = sim_ledger
    f = spend_features(led)
    assert list(f["merchant_seen"].head(1)) == [0.0]
    m = f["merchant_key"].value_counts().index[0]           # the most frequent merchant
    rows = f[f["merchant_key"] == m]
    amounts = rows["amount_paise"].to_numpy() / 100
    for k in (1, 5, len(rows) - 1):
        assert rows["merchant_seen"].iloc[k] == k
        assert np.isclose(rows["merchant_usual_log"].iloc[k], np.log1p(np.median(amounts[:k])))
    assert not f[FEATURES].isna().any().any()


def test_planted_spend_is_flagged_and_normal_ones_mostly_are_not(sim_ledger):
    _, _, led = sim_ledger
    as_of = led.last_day + timedelta(days=1)
    tx = led.txns.copy()
    recent = tx[tx["is_spend"] & (tx["date"] >= as_of - timedelta(days=20)) & (tx["category"] == "campus_food")]
    target = recent.index[0]
    tx.loc[target, "amount_paise"] = 200000                 # a ₹2,000 canteen bill
    planted = dataclasses.replace(led, txns=tx)
    rep = find_unusual(planted, as_of, CategoryQuantiles)
    ids = [u.txn_id for u in rep.unusual]
    assert str(tx.loc[target, "id"]) in ids
    hit = next(u for u in rep.unusual if u.txn_id == str(tx.loc[target, "id"]))
    assert hit.percentile >= 0.97 and hit.amount_paise == 200000 and hit.usual_paise < 20000
    assert len(rep.unusual) <= max(3, 0.1 * rep.n_checked)  # not crying wolf
    assert rep.n_train >= MIN_TRAIN and rep.n_checked > 0


def test_too_little_history_says_so_instead_of_guessing(sim_ledger):
    _, _, led = sim_ledger
    early = led.first_day + timedelta(days=40)
    rep = find_unusual(led, early, CategoryQuantiles)
    assert rep.unusual == [] and rep.note and "needs at least" in rep.note


@pytest.mark.slow
def test_tabpfn_runs_end_to_end_on_the_sim_month(sim_ledger):
    from brokedate.models.tabpfn_adapter import make_tabpfn

    cfg, _, led = sim_ledger
    rep = find_unusual(led, led.last_day + timedelta(days=1), lambda: make_tabpfn(cfg, seed=0))
    assert rep.model.startswith("tabpfn") and rep.n_checked > 0
    assert all(u.percentile >= 0.97 for u in rep.unusual)
