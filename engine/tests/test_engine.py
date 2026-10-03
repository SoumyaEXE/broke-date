"""Simulator, outputs, features, eval and API tests (SPEC 19). Fast tests use the LightGBM model behind the same
interface; the TabPFN smoke test is marked slow."""

from __future__ import annotations

import re
from dataclasses import replace
from datetime import date, timedelta

import numpy as np
import pytest

from brokedate.config import REPO_ROOT
from brokedate.eval.bootstrap import cycle_bootstrap
from brokedate.eval.metrics import brier, covered80, crps_samples, lead_times, logistic_fit
from brokedate.features.daily import feature_table
from brokedate.features.spec import FEATURES, SPEND_FEATURES, assert_closure
from brokedate.forecast import engine as fe
from brokedate.models.tabpfn_adapter import QS
from brokedate.sim.events import Plan
from brokedate.sim.rollout import anchor_targets, rollout

AS_OF = date(2026, 8, 6)


@pytest.fixture(scope="module")
def prepared(sim_ledger):
    cfg, _, led = sim_ledger
    return fe.prepare(led, cfg, AS_OF, n=120, model="lightgbm")


# --- features -------------------------------------------------------------------------------------------
def test_closure_rule():
    assert_closure(SPEND_FEATURES)
    with pytest.raises(AssertionError):
        assert_closure([*SPEND_FEATURES, "delivery_count_7d"])
    assert all(f.closure_ok for f in FEATURES)


def test_no_leakage(sim_ledger):
    """Features at day d must not change when data on/after d changes."""
    cfg, _, led = sim_ledger
    d = date(2026, 3, 10)
    ft1 = feature_table(led, until=d + timedelta(days=1))
    led2 = replace(led, daily=led.daily.copy())
    r = led2.row_of(d)
    led2.daily.loc[r:, "spend_paise"] = 9_999_999
    led2.daily.loc[r:, "free_spend_paise"] = 9_999_999
    led2.daily.loc[r:, "bal_end_paise"] = 1          # day d's own close and everything after
    led2.daily.loc[r + 1:, "bal_start_paise"] = 1     # bal_start(d) = close of d-1 is legitimately known
    ft2 = feature_table(led2, until=d + timedelta(days=1))
    row1 = ft1[ft1["date"] == d][SPEND_FEATURES].to_numpy()
    row2 = ft2[ft2["date"] == d][SPEND_FEATURES].to_numpy()
    assert np.allclose(row1, row2)


# --- simulator --------------------------------------------------------------------------------------------
def test_crn_determinism(prepared):
    a, b = fe.run(prepared), fe.run(prepared)
    assert np.array_equal(a.paths, b.paths) and np.array_equal(a.first_broke, b.first_broke)


def test_zero_plan_zero_delta(prepared):
    base = fe.run(prepared)
    z = fe.run(prepared, [Plan("z", "nothing", 0, AS_OF + timedelta(days=3), True)])
    # a zero-amount plan still marks a "plan day" (typical spending replaced) but must not cost futures
    assert z.made_it(prepared.H).sum() >= base.made_it(prepared.H).sum()
    zz = fe.run(prepared, [Plan("z", "nothing", 0, AS_OF + timedelta(days=3), False)])
    assert np.array_equal(zz.paths, base.paths)


def test_paths_never_negative_and_plan_costs(prepared):
    base = fe.run(prepared)
    big = fe.run(prepared, [Plan("b", "big", 200000, AS_OF + timedelta(days=1), True)])
    assert (base.paths >= -1e-9).all() and (big.paths >= -1e-9).all()
    assert big.made_it(prepared.H).sum() <= base.made_it(prepared.H).sum()
    own_b = fe.run(prepared, inflows=False).runway().mean()
    own_big = fe.run(prepared, [Plan("b", "big", 200000, AS_OF + timedelta(days=1), True)], inflows=False)
    assert own_big.runway().mean() <= own_b


def test_anchoring_location_matches_median_and_keeps_order():
    rng = np.random.default_rng(0)
    T = rng.gamma(2, 500, 300)
    D = np.linspace(800, 3000, len(QS))
    tgt = anchor_targets(T, D, QS, 1.0, "location")
    assert np.median(tgt) == pytest.approx(np.interp(0.5, QS, D), rel=1e-6)
    assert (np.argsort(tgt) == np.argsort(T)).all()
    q = anchor_targets(T, D, QS, 1.0, "quantile")
    assert (np.diff(q[np.argsort(T)]) >= -1e-9).all()      # order preserved (ties at the clamped tails)
    wide = anchor_targets(T, None, QS, 1.5)
    assert np.std(wide) > np.std(T)


def test_safe_to_spend_monotone_and_non_negative(prepared):
    s = fe.safe_to_spend(prepared, [])
    risks = [r for _, r in s["curve"]]
    assert all(b >= a - 1e-12 for a, b in zip(risks, risks[1:], strict=False))
    assert s["safe_rupees"] >= 0
    if not s["nothing_safe"]:
        assert fe.p_broke(prepared, fe.run(prepared, spend_today=s["safe_rupees"])) <= \
            prepared.cfg.forecast.risk_tolerance + 1e-12


def test_nothing_safe_branch(prepared):
    p2 = fe.Prepared(**{**prepared.__dict__})
    p2.si = replace(prepared.si, bal0=prepared.si.broke_line + 1.0)
    s = fe.safe_to_spend(p2, [])
    assert s["nothing_safe"] and s["safe_rupees"] == 0


def test_lattice_interpolation_is_monotone(prepared):
    from brokedate.sim.lattice import interpolate

    Q = interpolate(prepared.lat, 0, np.array([0.0, 123.4, 5000.0]), np.array([10.0, 99.0, 0.0]),
                    np.array([500.0, 1000.0, 3000.0]))
    assert (np.diff(Q, axis=1) >= -1e-9).all()


def test_rollout_respects_balance(prepared):
    res = rollout(prepared.si, extra=np.full(prepared.si.T, 1e6))
    assert (res.paths[:, 1:] <= prepared.si.bal0 + 1e6).all()


# --- outputs / build ----------------------------------------------------------------------------------------
def test_build_forecast_has_facts_for_every_number(prepared):
    from brokedate.forecast.build import build_forecast

    b = build_forecast(prepared, [Plan("m", "movie", 32000, AS_OF + timedelta(days=2), True)], "sim",
                       include_lattice=True)
    r = b.response
    kinds = {f["kind"] for f in r["facts"].values()}
    assert {"safe_to_spend", "n_make_it", "n_broke", "plan_day_cost", "runway_days"} <= kinds
    assert r["n_make_it"] == sum(1 for fb in r["paths"]["first_broke"] if fb == -1 or fb > r["horizon_days"])
    assert len(r["paths"]["balances_paise"]) == r["n_futures"]
    assert r["sim"]["lattice"]["shape"][0] >= r["horizon_days"]


def test_letter_fallback_has_no_digits(prepared, sim_ledger):
    from brokedate.forecast.build import build_forecast
    from brokedate.narrate.letter import write_letter
    from brokedate.narrate.validate import validate

    cfg, _, _ = sim_ledger
    b = build_forecast(prepared, [Plan("m", "movie", 32000, AS_OF + timedelta(days=2), True)], "sim")
    for lang in ("Benglish", "English", "Bengali"):
        res = write_letter(b, cfg, lang)
        assert res["fallback_used"]
        assert not re.search(r"\d", re.sub(r"\{f\d+\}", "", res["text_placeholders"]))
        known = set(b.facts.items) | set(res["facts"])
        assert validate(res["text_placeholders"], known, min_words=15) == []


# --- eval ---------------------------------------------------------------------------------------------------
def test_metrics_hand_examples():
    assert brier(np.array([1.0, 0.0]), np.array([1, 0])) == 0
    assert brier(np.array([0.5]), np.array([1])) == 0.25
    assert crps_samples(np.array([3.0]), 1.0) == 2.0
    # CRPS of samples {0, 2} at y=1: E|X-y| = 1, E|X-X'| = 1 -> 0.5
    assert crps_samples(np.array([0.0, 2.0]), 1.0) == pytest.approx(0.5)
    assert covered80(np.arange(100.0), 50) and not covered80(np.arange(100.0), 99.5)
    a, b = logistic_fit(np.array([-1, -0.5, 0.5, 1.0] * 5), np.array([1, 1, 0, 0] * 5, float))
    assert b < 0


def test_lead_time():
    rows = [{"cycle": 0, "origin_ord": 10, "cycle_broke_day_ord": 20, "p": 0.2},
            {"cycle": 0, "origin_ord": 12, "cycle_broke_day_ord": 20, "p": 0.7},
            {"cycle": 1, "origin_ord": 40, "cycle_broke_day_ord": 45, "p": 0.1},
            {"cycle": 2, "origin_ord": 60, "cycle_broke_day_ord": None, "p": 0.9}]
    lt = lead_times(rows)
    assert lt["lead_days"] == [8, 0] and lt["n_no_warning"] == 1


def test_bootstrap_contains_point():
    rng = np.random.default_rng(1)
    rows = [{"cycle": i // 10, "v": float(rng.normal())} for i in range(100)]
    ci = cycle_bootstrap(rows, lambda rs: float(np.mean([r["v"] for r in rs])), reps=300)
    assert ci["lo"] <= ci["point"] <= ci["hi"]


def test_prereg_block_parses():
    from brokedate.eval.prereg import frozen_params

    p = frozen_params()
    assert p["stride"] >= 1 and p["n_futures_eval"] > 0 and p["bootstrap_reps"] >= 100


# --- API schema stays in sync with web/src/types.ts ------------------------------------------------------------
def test_schema_snapshot_matches_types_ts():
    from brokedate.api.schemas import ForecastResponse, LetterResponse, PlanRow, RecentRow

    ts = (REPO_ROOT / "web" / "src" / "types.ts").read_text(encoding="utf-8")
    for model, iface in ((ForecastResponse, "ForecastResponse"), (PlanRow, "PlanRow"), (RecentRow, "RecentRow"),
                         (LetterResponse, "LetterResponse")):
        m = re.search(r"export interface " + iface + r" \{(.*?)\n\}", ts, re.S)
        assert m, iface
        body = m.group(1)
        ts_fields = set(re.findall(r"(\w+)\??:", body))
        py_fields = set(model.model_fields)
        missing = py_fields - ts_fields
        assert not missing, f"{iface}: fields in pydantic but not in types.ts: {missing}"


def test_api_forecast_roundtrip(sim_ledger, monkeypatch):
    from fastapi.testclient import TestClient

    from brokedate.api import server

    cfg, db, _ = sim_ledger
    cfg.tabpfn.model_version = cfg.tabpfn.model_version
    monkeypatch.setitem(server._state, "cfg", cfg)
    monkeypatch.setitem(server._state, "db", db)
    monkeypatch.setitem(server._state, "prepared", {})
    real_prepare = fe.prepare
    monkeypatch.setattr(server.fe, "prepare", lambda *a, **k: real_prepare(*a, **{**k, "model": "lightgbm", "n": 80}))
    c = TestClient(server.app)
    r = c.post("/forecast", json={"subject": "sim", "as_of": str(AS_OF)})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["n_futures"] == 80 and body["subject"] == "sim"
    r2 = c.post("/plans", json={"subject": "sim", "name": "Movie", "amount_paise": 30000,
                                "date": str(AS_OF + timedelta(days=2))})
    assert r2.status_code == 200 and any(p["name"] == "Movie" for p in r2.json()["plans"])
    pid = r2.json()["plans"][0]["id"]
    r3 = c.patch(f"/plans/{pid}?subject=sim", json={"active": False})
    assert r3.status_code == 200 and not r3.json()["plans"][0]["active"]
    assert c.get("/letter", params={"subject": "sim", "language": "English"}).status_code == 200
    assert c.get("/review", params={"subject": "sim"}).status_code == 200


@pytest.mark.slow
def test_tabpfn_adapter_smoke():
    from brokedate.models.tabpfn_adapter import TabPFNDist

    rng = np.random.default_rng(0)
    X = rng.normal(size=(200, 5))
    y = np.maximum(0, 50 + 30 * X[:, 0] + rng.gamma(1, 30, 200))
    m = TabPFNDist(n_estimators=1, seed=0).fit(X, y)
    Q = m.quantiles(X[:20], QS)
    assert Q.shape == (20, len(QS)) and (np.diff(Q, axis=1) >= 0).all()
    assert np.allclose(Q, TabPFNDist(n_estimators=1, seed=0).fit(X, y).quantiles(X[:20], QS))
