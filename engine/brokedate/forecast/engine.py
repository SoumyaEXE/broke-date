"""Forecast orchestration: fit -> lattice -> baseline -> scenarios -> outputs (SPEC 9 to 12)."""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Any

import numpy as np
import pandas as pd

from brokedate.config import Config
from brokedate.features.daily import Ledger, calendar_row, direct_xy, feature_table, spend_xy, state_features
from brokedate.features.spec import DIRECT_FEATURES, SPEND_FEATURES, assert_closure
from brokedate.models.tabpfn_adapter import QS, DistRegressor, LGBMQuantileDist, make_tabpfn
from brokedate.sim.events import Plan, detect_recurring, scheduled_by_day
from brokedate.sim.inflows import fit_inflows
from brokedate.sim.lattice import Lattice, build_lattice, make_grids
from brokedate.sim.rollout import SimInputs, SimResult, anchor_targets, fit_factors, rollout

log = logging.getLogger(__name__)

EXT_SLICES = 7          # extension days (past the anchor, "if the allowance were late") share one slice per weekday


@dataclass
class Prepared:
    led: Ledger
    cfg: Config
    as_of: date
    next_anchor: date
    anchor_known: bool
    H: int
    E: int
    si: SimInputs
    factor: np.ndarray
    k: float
    anchored: bool
    model_name: str
    model_version: str
    direct_q: np.ndarray | None
    direct_median_rupees: float | None
    seed: int
    n_history_days: int
    timings: dict[str, float] = field(default_factory=dict)
    lattice_rows: int = 0

    @property
    def lat(self) -> Lattice:
        return self.si.lat

    def day(self, i: int) -> date:
        return self.as_of + timedelta(days=i)


def make_model(kind: str, cfg: Config, seed: int) -> DistRegressor:
    if kind == "tabpfn":
        return make_tabpfn(cfg, seed)
    if kind == "lightgbm":
        return LGBMQuantileDist(seed=seed)
    raise ValueError(kind)


def prepare(led: Ledger, cfg: Config, as_of: date, seed: int | None = None, n: int | None = None,
            model: str = "tabpfn", anchored: bool | None = None, k: float = 1.0, hindsight_anchor: bool = False,
            extension_days: int | None = None, ft: pd.DataFrame | None = None) -> Prepared:
    t0 = time.perf_counter()
    seed = cfg.forecast.seed if seed is None else seed
    n = cfg.forecast.n_futures if n is None else n
    anchored = cfg.forecast.anchor_to_direct_model if anchored is None else anchored
    E = cfg.forecast.runway_extension_days if extension_days is None else extension_days
    assert_closure(SPEND_FEATURES)
    if as_of <= led.first_day + timedelta(days=21):
        raise ValueError("need at least three weeks of history before the forecast date")

    ft = feature_table(led, until=as_of) if ft is None else ft[ft["date"] < as_of]
    Xs, ys = spend_xy(ft)
    timings: dict[str, float] = {}

    t = time.perf_counter()
    spend_model = make_model(model, cfg, seed).fit(Xs, ys)
    timings["fit_spend"] = time.perf_counter() - t

    nxt, known = led.next_anchor(as_of - timedelta(days=1), hindsight=hindsight_anchor)
    if nxt <= as_of:
        nxt, known = led.next_anchor(as_of, hindsight=hindsight_anchor)
    H = max((nxt - as_of).days, 1)
    T = H + E

    # state at start of as_of
    row = led.row_of(as_of)
    daily = led.daily
    if row < len(daily):
        bal0 = float(daily["bal_start_paise"].iloc[row]) / 100.0
    else:
        bal0 = float(daily["bal_end_paise"].iloc[-1]) / 100.0
    spend_r = daily["spend_paise"].to_numpy() / 100.0
    end = min(row, len(daily))
    hist14 = spend_r[max(end - 14, 0):end]
    hist14 = np.concatenate([np.zeros(14 - len(hist14)), hist14])

    recurring = detect_recurring(led.txns, before=as_of)
    sched = scheduled_by_day(recurring, [], as_of, T).astype(float) / 100.0
    anchor_amt = led.anchor_amount_at(as_of - timedelta(days=1)) / 100.0

    # calendar rows: horizon days exact; extension days one slice per weekday with "allowance overdue" context
    cal_rows: list[dict[str, float]] = []
    days: list[date] = []
    for i in range(H):
        d = as_of + timedelta(days=i)
        cal_rows.append(calendar_row(led, d, nxt, int(round(sched[i] * 100))))
        days.append(d)
    day_map = list(range(H))
    if E > 0:
        prev = led.prev_anchor(as_of - timedelta(days=1)) if led.anchors.dates else as_of
        ext_slice: dict[int, int] = {}
        for i in range(H, T):
            d = as_of + timedelta(days=i)
            if d.weekday() not in ext_slice and len(ext_slice) < EXT_SLICES:
                cyc = (nxt - prev).days
                c = calendar_row(led, d, d + timedelta(days=1), 0)
                c.update(day_in_cycle=cyc, frac_cycle=1.0, days_to_anchor=1)
                ext_slice[d.weekday()] = len(cal_rows)
                cal_rows.append(c)
                days.append(d)
            day_map.append(ext_slice[d.weekday()])

    bal_g, s3_g, s14_g = make_grids(anchor_amt, bal0, ft["spend_3d"].to_numpy(), ft["spend_14d"].to_numpy(),
                                    cfg.tabpfn.lattice_bal_points, cfg.tabpfn.lattice_s3_points,
                                    cfg.tabpfn.lattice_s14_points)
    t = time.perf_counter()
    lat = build_lattice(spend_model, cal_rows, days, anchor_amt, bal_g, s3_g, s14_g, QS)
    timings["lattice"] = time.perf_counter() - t

    rng = np.random.default_rng(seed)
    U = rng.random((n, T))
    V = rng.random((n, T))
    W = rng.random((n, T))
    inflow = fit_inflows(daily, anchor_amt, end)
    si = SimInputs(lat, np.array(day_map), H, sched, bal0, hist14, cfg.broke_line_paise / 100.0, U, inflow, V, W)

    # direct remaining-spend model at the origin (for anchoring)
    direct_q = None
    direct_med = None
    Xd, yd = direct_xy(ft, as_of)
    if anchored and len(yd) >= 20:
        t = time.perf_counter()
        dm = make_model(model, cfg, seed + 1).fit(Xd, yd)
        cal0 = calendar_row(led, as_of, nxt, int(round(sched[0] * 100)))
        st0 = state_features(np.array([bal0]), np.array([hist14[-3:].sum()]), np.array([hist14.sum()]), anchor_amt,
                             int(cal0["days_to_anchor"]))
        prev_a = led.prev_anchor(as_of - timedelta(days=1))
        j0 = max(led.row_of(prev_a), 0)
        free_r = daily["free_spend_paise"].to_numpy() / 100.0
        feats = {**cal0, **{kk: float(v[0]) for kk, v in st0.items()},
                 "cycle_spend_so_far": float(free_r[j0:end].sum())}
        x = np.array([[feats[c] for c in DIRECT_FEATURES]])
        direct_q = dm.quantiles(x, QS)[0]
        direct_med = float(np.interp(0.5, QS, direct_q))
        timings["direct"] = time.perf_counter() - t
    elif anchored:
        anchored = False

    t = time.perf_counter()
    base = rollout(si)
    targets = anchor_targets(base.free_totals, direct_q if anchored else None, QS, k)
    factor = fit_factors(si, targets) if (anchored or abs(k - 1.0) > 1e-9) else np.ones(n)
    timings["calibrate"] = time.perf_counter() - t
    timings["prepare_total"] = time.perf_counter() - t0
    return Prepared(led, cfg, as_of, nxt, known, H, E, si, factor, k, anchored, spend_model.name,
                    getattr(spend_model, "version", ""), direct_q, direct_med, seed, len(ft), timings,
                    lat.n_rows)


# ----------------------------------------------------------------------------------------------------
def plan_arrays(p: Prepared, plans: list[Plan]) -> tuple[np.ndarray, np.ndarray]:
    extra = np.zeros(p.si.T)
    pdays = np.zeros(p.si.T, dtype=bool)
    for pl in plans:
        if pl.active and p.as_of <= pl.date < p.as_of + timedelta(days=p.si.T):
            i = (pl.date - p.as_of).days
            extra[i] += pl.amount_paise / 100.0
            pdays[i] = True
    return extra, pdays


def run(p: Prepared, plans: list[Plan] | None = None, spend_today: float = 0.0, bal_delta: float = 0.0,
        hist_delta: np.ndarray | None = None, inflows: bool = True) -> SimResult:
    extra, pdays = plan_arrays(p, plans or [])
    extra[0] += spend_today
    hist = p.si.hist14 + (hist_delta if hist_delta is not None else 0.0)
    return rollout(p.si, factor=p.factor, extra=extra, plan_days=pdays, bal0=p.si.bal0 + bal_delta,
                   hist14=np.maximum(hist, 0.0), inflows=inflows)


def p_broke(p: Prepared, res: SimResult) -> float:
    return float(1.0 - res.made_it(p.H).mean())


def safe_to_spend(p: Prepared, plans: list[Plan]) -> dict[str, Any]:
    tol = p.cfg.forecast.risk_tolerance
    prec = float(p.cfg.forecast.safe_spend_precision_rupees)
    line = p.si.broke_line
    hi = max(p.si.bal0 - line, 0.0)

    def risk(s: float) -> float:
        return p_broke(p, run(p, plans, spend_today=s))

    r0 = risk(0.0)
    grid = np.unique(np.round(np.linspace(0, hi, 25) / prec) * prec) if hi > 0 else np.array([0.0])
    curve = [(float(s), risk(float(s))) for s in grid]
    risks = np.maximum.accumulate([c[1] for c in curve])
    curve = [(s, float(r)) for (s, _), r in zip(curve, risks, strict=True)]
    if r0 > tol:
        return {"safe_rupees": 0.0, "nothing_safe": True, "risk_now": r0, "curve": curve, "iterations": 0}
    if risk(hi) <= tol:
        return {"safe_rupees": float(np.floor(hi / prec) * prec), "nothing_safe": False, "risk_now": r0,
                "curve": curve, "iterations": 1}
    lo, up, it = 0.0, hi, 0
    while up - lo > prec and it < 20:
        mid = (lo + up) / 2
        if risk(mid) <= tol:
            lo = mid
        else:
            up = mid
        it += 1
    return {"safe_rupees": float(np.floor(lo / prec) * prec), "nothing_safe": False, "risk_now": r0, "curve": curve,
            "iterations": it}


def runway_stats(res: SimResult) -> dict[str, float]:
    rw = res.runway()
    return {"mean": float(rw.mean()), "median": float(np.median(rw))}


def summarize(p: Prepared, res: SimResult, own: SimResult | None = None) -> dict[str, Any]:
    H = p.H
    made = res.made_it(H)
    fb = res.first_broke
    broke_in = fb[(fb >= 1) & (fb <= H)]
    out: dict[str, Any] = {"p_make_it": float(made.mean()), "n_make_it": int(made.sum()), "n": int(len(made))}
    if len(broke_in) and out["p_make_it"] <= 0.8:
        med = int(np.median(broke_in))
        lo, hi = (int(x) for x in np.percentile(broke_in, [10, 90], method="nearest"))
        out["broke_day"] = {"median": str(p.day(med - 1)), "lo80": str(p.day(lo - 1)), "hi80": str(p.day(hi - 1))}
    else:
        out["broke_day"] = None
    if (fb == 0).all():
        out["already_broke"] = True
    seg = res.paths[:, : H + 1]
    out["band"] = {k: np.round(np.percentile(seg, q, axis=0) * 100).astype(int).tolist()
                   for k, q in (("p10", 10), ("p50", 50), ("p90", 90))}
    if own is not None:
        out["runway_own_money"] = runway_stats(own)
    out["end_balance_q"] = np.percentile(res.paths[:, H], [10, 50, 90]).round(2).tolist()
    return out


def recent_purchases(p: Prepared, plans: list[Plan], base: SimResult, days: int = 7, limit: int = 8
                     ) -> list[dict[str, Any]]:
    """Days regained if a recent purchase had not happened (own-money runway, same draws)."""
    tx = p.led.txns
    lo = p.as_of - timedelta(days=days)
    rec = tx[(tx["date"] >= lo) & (tx["date"] < p.as_of) & tx["is_spend"] & ~tx["is_sched"]]
    rec = rec.sort_values("amount_paise", ascending=False).head(limit)
    own_base = run(p, plans, inflows=False).runway().mean()
    out = []
    for _, r in rec.iterrows():
        amt = r["amount_paise"] / 100.0
        hd = np.zeros(14)
        back = (p.as_of - r["date"]).days      # 1 = yesterday
        if 1 <= back <= 14:
            hd[14 - back] = -amt
        own = run(p, plans, bal_delta=amt, hist_delta=hd, inflows=False)
        res = run(p, plans, bal_delta=amt, hist_delta=hd)
        out.append({"txn_id": r["id"], "merchant": r["merchant"] or "?", "category": r["category"],
                    "amount_paise": int(r["amount_paise"]), "date": str(r["date"]),
                    "days_regained": round(float(own.runway().mean() - own_base), 2),
                    "futures_delta": int(res.made_it(p.H).sum() - base.made_it(p.H).sum())})
    return out


def plan_effects(p: Prepared, plans: list[Plan], base: SimResult) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Price in days of each plan: how much sooner his own money runs out with the plan than without it
    (mean over futures, same draws). futures_delta: change in futures that make it to payday."""
    out = []
    scenarios: dict[str, Any] = {}
    for pl in plans:
        others = [x for x in plans if x.id != pl.id]
        with_ = [*others, Plan(pl.id, pl.name, pl.amount_paise, pl.date, True)]
        without = [*others, Plan(pl.id, pl.name, pl.amount_paise, pl.date, False)]
        r_with = base if pl.active else run(p, with_)
        r_without = run(p, without) if pl.active else base
        cost = float(run(p, without, inflows=False).runway().mean() - run(p, with_, inflows=False).runway().mean())
        delta = int(r_with.made_it(p.H).sum() - r_without.made_it(p.H).sum())
        out.append({"id": pl.id, "name": pl.name, "amount_paise": pl.amount_paise, "date": str(pl.date),
                    "active": pl.active, "day_cost": round(cost, 2), "futures_delta": delta,
                    "in_horizon": p.as_of <= pl.date < p.next_anchor})
        alt = r_without if pl.active else r_with
        scenarios[pl.id] = {"toggled_active": not pl.active, **_scenario_payload(p, alt)}
    return out, scenarios


def _scenario_payload(p: Prepared, res: SimResult) -> dict[str, Any]:
    s = summarize(p, res)
    return {"n_make_it": s["n_make_it"], "p_make_it": s["p_make_it"], "broke_day": s["broke_day"],
            "band": s["band"], "first_broke": res.first_broke.tolist(),
            "balances_paise": np.round(res.paths[:, : p.H + 1] * 100).astype(np.int64).tolist(),
            }
