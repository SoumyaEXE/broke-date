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


# ---- TabPFN categorizer stage (stub classifier: nearest class centroid with softmax "probabilities") ----

class CentroidClf:
    def fit(self, X, labels):  # noqa: ANN001, ANN201
        self.classes_ = np.unique(np.asarray(labels).astype(str))
        self.c = np.stack([X[np.asarray(labels) == k].mean(axis=0) for k in self.classes_])
        return self

    def proba(self, X):  # noqa: ANN001, ANN201
        d = -np.linalg.norm(X[:, None, :] - self.c[None], axis=2) * 6.0
        e = np.exp(d - d.max(axis=1, keepdims=True))
        return e / e.sum(axis=1, keepdims=True)


def _row(i, narr, amt=5000, direction="DEBIT"):  # noqa: ANN001, ANN202
    return {"id": f"r{i}", "raw_narration": narr, "direction": direction, "amount_paise": amt}


def test_fingerprint_ignores_reference_numbers():
    from brokedate.enrich.tabpfn_cat import featurize

    a = featurize([_row(0, "UPI-RAJU MAHATO-rajum12@ybl-SBIN0016209-611111111111-Payment")])
    b = featurize([_row(1, "UPI-RAJU MAHATO-rajum98@ybl-HDFC0MERUPI-622222222222-Payment")])
    assert np.allclose(a, b)


def test_classify_pending_only_applies_confident_predictions():
    from brokedate.enrich.tabpfn_cat import classify_pending

    canteen = [dict(_row(i, f"UPI-COLLEGE CANTEEN-canteen{i}@ybl-SBIN0016209-6{i:011d}-Payment"), category="campus_food") for i in range(30)]
    bus = [dict(_row(100 + i, f"UPI-SBSTC BUS-sbstc@sbi-YESB0YBLUPI-5{i:011d}-Payment", 1600), category="transport") for i in range(30)]
    pending = [_row(900, "UPI-COLLEGE CANTEEN-canteen7@ybl-UTIB0000553-699999999999-Payment"), _row(901, "UPI-ZZZ QQQ-zq@ybl-UTIB0000553-688888888888-Payment", 99999)]
    n = classify_pending(canteen + bus, pending, CentroidClf, min_prob=0.9, min_train=40)
    assert pending[0]["category"] == "campus_food" and pending[0]["label_source"] == "tabpfn"
    assert n == sum(p.get("label_source") == "tabpfn" for p in pending)
    assert classify_pending(canteen[:10], [_row(902, "x")], CentroidClf, 0.6, 40) == 0  # too little to learn from


def test_pipeline_counts_and_caches_tabpfn_labels(sim_ledger, db):
    from brokedate.enrich.pipeline import label_rows

    cfg, _, led = sim_ledger
    rows = [{"id": str(t.id), "raw_narration": t.raw_narration, "direction": t.direction, "amount_paise": int(t.amount_paise)}
            for t in led.txns.itertuples()]
    st = label_rows(rows, db, cfg, use_gemma=False, use_tabpfn=True, make_clf=CentroidClf)
    assert st.by_tabpfn == sum(r.get("label_source") == "tabpfn" for r in rows) and st.tabpfn_error is None
    assert st.by_rules + st.by_cache + st.by_tabpfn + st.needs_review >= st.total - st.by_gemma - st.needs_review


def test_compare_labellers_reports_each_pipeline(sim_ledger):
    from brokedate.enrich.eval_labels import compare_labellers

    cfg, d, _ = sim_ledger
    res = compare_labellers(d, cfg, "sim", None, gemma=False, make_clf=CentroidClf)
    assert set(res["variants"]) == {"rules", "rules+tabpfn"}
    assert res["variants"]["rules"]["counts"]["tabpfn"] == 0
    assert 0 <= res["variants"]["rules+tabpfn"]["accuracy"] <= 1


def test_festival_heads_up_uses_last_years_real_spend(sim_ledger):
    from datetime import date

    from brokedate.forecast.context import upcoming_festivals

    _, _, led = sim_ledger
    up = upcoming_festivals(led, date(2026, 10, 3))
    names = [u["name"] for u in up]
    assert any("Durga" in n for n in names) and any("Kali" in n or "Diwali" in n for n in names)
    diwali = next(u for u in up if "Kali" in u["name"] or "Diwali" in u["name"])
    assert diwali["last"] is not None and diwali["last"]["start"].startswith("2025-10")
    # recomputed by hand from the ledger: spend in the window (two days of build-up + the festival days)
    spend = led.txns[led.txns["is_spend"]]
    a, b = date.fromisoformat(diwali["last"]["start"]), date.fromisoformat(diwali["last"]["end"])
    from datetime import timedelta
    win = spend[(spend["date"] >= a - timedelta(days=2)) & (spend["date"] <= b)]
    assert diwali["last"]["spent_paise"] == int(win["amount_paise"].sum())
    durga = next(u for u in up if "Durga" in u["name"])
    assert durga["days_until"] == 14
    assert durga["last"] is None  # 2025 Puja started before the statement does: no partial, made-up comparison


def test_anomaly_eval_scores_every_detector_on_the_same_plants(sim_ledger):
    from brokedate.insights.anomaly_eval import evaluate_detectors

    _, _, led = sim_ledger
    as_of = led.last_day + timedelta(days=1)
    res = evaluate_detectors(led, as_of, CategoryQuantiles, seeds=(1, 2), factors=(5.0,), n_plants=4)
    assert set(res["summary"]) == {"tabpfn", "merchant_3x", "category_z3"}
    runs = res["runs"]
    assert len(runs) == 2 * 3 and all(r["planted"] == 4 for r in runs)
    # same plants for every detector within a seed
    by_seed = {s: {r["planted"] for r in runs if r["seed"] == s} for s in (1, 2)}
    assert all(len(v) == 1 for v in by_seed.values())
    assert all(0 <= r["recall"] <= 1 for r in runs)
    assert res["summary"]["merchant_3x"]["x5"]["recall_mean"] > 0  # a 5x spend is easy for the simple rule too
