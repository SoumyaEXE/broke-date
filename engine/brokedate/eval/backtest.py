"""Walk-forward backtest exactly as docs/PREREGISTRATION.md (SPEC 13). Checkpointed per origin; resumable."""

from __future__ import annotations

import json
import logging
import platform
import time
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import numpy as np

from brokedate.config import Config
from brokedate.eval.bootstrap import cycle_bootstrap
from brokedate.eval.metrics import brier, covered80, crps_samples, lead_times, logistic_fit, squash
from brokedate.features.daily import Ledger, feature_table
from brokedate.forecast import engine as fe
from brokedate.models.tabpfn_adapter import QS
from brokedate.sim.rollout import anchor_targets, fit_factors, rollout

log = logging.getLogger(__name__)

SIM_MODELS = ("M1", "M1a", "M1b", "B3")
POINT_MODELS = ("B1", "B2")
ALL_MODELS = ("M1", "M1a", "M1b", "B1", "B2", "B3")
K_GRID = np.round(np.arange(0.7, 1.6001, 0.05), 2)


@dataclass
class Origin:
    idx: int
    day: date
    next_anchor: date
    cycle: int


def origins_for(led: Ledger, stride: int, min_history: int) -> list[Origin]:
    out = []
    start = led.first_day + timedelta(days=min_history)
    d = start
    i = 0
    while d <= led.last_day:
        nxt = led.next_anchor_actual(d)
        if nxt is not None and nxt > d and nxt <= led.last_day + timedelta(days=1):
            prev = [j for j, a in enumerate(led.anchors.dates) if a <= d]
            out.append(Origin(i, d, nxt, prev[-1] if prev else -1))
            i += 1
        d += timedelta(days=stride)
    return out


def actual(led: Ledger, o: Origin, line_paise: int) -> dict[str, Any]:
    daily = led.daily
    r0, r1 = led.row_of(o.day), led.row_of(o.next_anchor)
    lows = daily["bal_min_paise"].iloc[r0:r1].to_numpy()
    y = int((lows < line_paise).any())
    B = float(daily["bal_end_paise"].iloc[r1 - 1]) / 100.0
    # first broke day of the whole cycle containing the origin (for lead time)
    cs = led.anchors.dates[o.cycle] if o.cycle >= 0 else led.first_day
    c0 = led.row_of(cs)
    cl = daily["bal_min_paise"].iloc[c0:r1].to_numpy()
    hit = np.nonzero(cl < line_paise)[0]
    bd = (cs + timedelta(days=int(hit[0]))).toordinal() if len(hit) else None
    return {"y": y, "B": B, "cycle_broke_day_ord": bd}


def fit_k(history: list[dict], key: str, before: date) -> float:
    """Nested spread calibration: k in [0.7, 1.6] whose 80% interval coverage on earlier origins (outcome known
    before `before`) is closest to 0.8; ties -> closest to 1."""
    rows = [h for h in history if h["window_end"] < str(before) and key in h["uncal"]]
    if len(rows) < 10:
        return 1.0
    best = (9.9, 1.0)
    for k in K_GRID:
        cov = []
        for h in rows:
            s = np.asarray(h["uncal"][key])
            med = np.median(s)
            cov.append(covered80(med + k * (s - med), h["B"]))
        score = (abs(float(np.mean(cov)) - 0.8), abs(k - 1.0))
        if score < (best[0], abs(best[1] - 1.0)):
            best = (score[0], float(k))
    return best[1]


def fit_squash(history: list[dict], key: str, before: date) -> tuple[float, float]:
    rows = [h for h in history if h["window_end"] < str(before)]
    if len(rows) < 10 or len({h["y"] for h in rows}) < 2:
        return 0.0, -10.0
    x = np.array([h["margin"][key] for h in rows])
    y = np.array([h["y"] for h in rows], float)
    return logistic_fit(x, y)


def _sim_eval(p: fe.Prepared, res: Any) -> dict[str, Any]:
    made = res.made_it(p.H)
    return {"p": float(1 - made.mean()), "samples": res.paths[:, p.H].astype(float)}


def run_origin(led: Ledger, cfg: Config, o: Origin, history: list[dict], seed: int, n: int) -> dict[str, Any]:
    act = actual(led, o, cfg.broke_line_paise)
    ft = feature_table(led, until=o.day)
    out: dict[str, Any] = {"origin": str(o.day), "origin_ord": o.day.toordinal(), "idx": o.idx, "cycle": o.cycle,
                           "window_end": str(o.next_anchor - timedelta(days=1)), **act, "models": {},
                           "uncal": {}, "margin": {}, "timing": {}}
    t = time.perf_counter()
    p = fe.prepare(led, cfg, o.day, seed=seed, n=n, model="tabpfn", anchored=True, k=1.0, hindsight_anchor=True,
                   extension_days=0, ft=ft)
    out["timing"]["tabpfn_prepare"] = time.perf_counter() - t
    out["H"] = p.H
    raw = rollout(p.si)
    raw_e = _sim_eval(p, raw)
    anchored_ok = p.direct_q is not None
    # M1b: anchored, uncalibrated
    if anchored_ok:
        f_b = fit_factors(p.si, anchor_targets(raw.free_totals, p.direct_q, QS, 1.0))
        m1b = _sim_eval(p, rollout(p.si, factor=f_b))
    else:
        m1b = raw_e
    out["uncal"]["M1"] = np.round(m1b["samples"], 2).tolist()
    out["uncal"]["M1a"] = np.round(raw_e["samples"], 2).tolist()
    k1 = fit_k(history, "M1", o.day)
    k1a = fit_k(history, "M1a", o.day)
    if anchored_ok:
        f1 = fit_factors(p.si, anchor_targets(raw.free_totals, p.direct_q, QS, k1)) if k1 != 1.0 else f_b
        m1 = _sim_eval(p, rollout(p.si, factor=f1))
    else:
        m1 = raw_e
    m1a = (_sim_eval(p, rollout(p.si, factor=fit_factors(p.si, anchor_targets(raw.free_totals, None, QS, k1a))))
           if k1a != 1.0 else raw_e)
    for name, e, k in (("M1", m1, k1), ("M1a", m1a, k1a), ("M1b", m1b, 1.0)):
        out["models"][name] = {"p": e["p"], "crps": crps_samples(e["samples"], act["B"]),
                               "cov80": covered80(e["samples"], act["B"]), "k": k,
                               "B_med": float(np.median(e["samples"]))}
    out["models"]["M1"]["anchored"] = anchored_ok

    # B3: LightGBM quantile in the same simulator, same anchoring + nested calibration
    t = time.perf_counter()
    pl = fe.prepare(led, cfg, o.day, seed=seed, n=n, model="lightgbm", anchored=True, k=1.0, hindsight_anchor=True,
                    extension_days=0, ft=ft)
    out["timing"]["lgbm_prepare"] = time.perf_counter() - t
    raw3 = rollout(pl.si)
    if pl.direct_q is not None:
        f3b = fit_factors(pl.si, anchor_targets(raw3.free_totals, pl.direct_q, QS, 1.0))
        b3u = _sim_eval(pl, rollout(pl.si, factor=f3b))
    else:
        b3u = _sim_eval(pl, raw3)
    out["uncal"]["B3"] = np.round(b3u["samples"], 2).tolist()
    k3 = fit_k(history, "B3", o.day)
    if k3 != 1.0:
        tg = anchor_targets(raw3.free_totals, pl.direct_q, QS, k3) if pl.direct_q is not None else \
            anchor_targets(raw3.free_totals, None, QS, k3)
        b3 = _sim_eval(pl, rollout(pl.si, factor=fit_factors(pl.si, tg)))
    else:
        b3 = b3u
    out["models"]["B3"] = {"p": b3["p"], "crps": crps_samples(b3["samples"], act["B"]),
                           "cov80": covered80(b3["samples"], act["B"]), "k": k3,
                           "B_med": float(np.median(b3["samples"]))}

    # B1 burn rate, B2 same point last cycle (point forecasts, logistic squash fit on earlier origins)
    daily = led.daily
    r0 = led.row_of(o.day)
    spend = daily["spend_paise"].to_numpy() / 100.0
    anchor_amt = led.anchor_amount_at(o.day - timedelta(days=1)) / 100.0
    bal0 = p.si.bal0
    line = cfg.broke_line_paise / 100.0
    rem1 = float(spend[max(r0 - 14, 0):r0].mean()) * p.H
    prev_start = led.anchors.dates[o.cycle - 1] if o.cycle >= 1 else None
    if prev_start is not None:
        dic = (o.day - led.anchors.dates[o.cycle]).days
        ps = led.row_of(prev_start) + dic
        pe = led.row_of(led.anchors.dates[o.cycle])
        rem2 = float(spend[ps:pe].sum()) if ps < pe else 0.0
    else:
        rem2 = rem1
    for name, rem in (("B1", rem1), ("B2", rem2)):
        B_hat = bal0 - rem
        margin = (B_hat - line) / max(anchor_amt, 1.0)
        out["margin"][name] = margin
        a, b = fit_squash(history, name, o.day)
        pr = float(squash(a, b, margin))
        out["models"][name] = {"p": pr, "crps": abs(B_hat - act["B"]), "cov80": None, "B_med": B_hat,
                               "squash": [a, b]}
    return out


# ----------------------------------------------------------------------------------------------------
def summarize(rows: list[dict], reps: int, seed: int) -> dict[str, Any]:
    res: dict[str, Any] = {"n_origins": len(rows), "n_cycles": len({r["cycle"] for r in rows}),
                           "base_rate": float(np.mean([r["y"] for r in rows])) if rows else None, "models": {},
                           "diff_vs_M1": {}}

    def m_stat(model: str, key: str):
        def f(rs: list[dict]) -> float:
            if key == "brier":
                return brier(np.array([r["models"][model]["p"] for r in rs]), np.array([r["y"] for r in rs]))
            vals = [r["models"][model][key] for r in rs if r["models"][model].get(key) is not None]
            return float(np.mean(vals)) if vals else float("nan")
        return f

    for m in ALL_MODELS:
        res["models"][m] = {
            "brier": cycle_bootstrap(rows, m_stat(m, "brier"), reps, seed),
            "crps": cycle_bootstrap(rows, m_stat(m, "crps"), reps, seed),
            "coverage80": (cycle_bootstrap(rows, m_stat(m, "cov80"), reps, seed) if m not in POINT_MODELS
                           else None),
            "lead_time": lead_times([{"cycle": r["cycle"], "origin_ord": r["origin_ord"],
                                      "cycle_broke_day_ord": r["cycle_broke_day_ord"], "p": r["models"][m]["p"]}
                                     for r in rows]),
        }
    for m in ALL_MODELS:
        if m == "M1":
            continue
        for metric in ("brier", "crps"):
            def diff(rs: list[dict], m: str = m, metric: str = metric) -> float:
                return m_stat("M1", metric)(rs) - m_stat(m, metric)(rs)
            ci = cycle_bootstrap(rows, diff, reps, seed)
            if ci["hi"] < 0:
                verdict = "TabPFN better"
            elif ci["lo"] > 0:
                verdict = "baseline better"
            else:
                verdict = "no clear difference"
            res["diff_vs_M1"].setdefault(m, {})[metric] = {**ci, "verdict": verdict}
    ks = [r["models"]["M1"]["k"] for r in rows]
    res["calibration"] = {"k_last": ks[-1] if ks else None, "k_values": sorted(set(ks)),
                          "coverage80_uncalibrated": res["models"]["M1b"]["coverage80"],
                          "coverage80_calibrated": res["models"]["M1"]["coverage80"]}
    return res


def run_backtest(led: Ledger, cfg: Config, out_dir: Path, stride: int, n: int, base_seed: int, reps: int,
                 min_history: int = 60, limit: int | None = None, progress: Any = None) -> dict[str, Any]:
    out_dir.mkdir(parents=True, exist_ok=True)
    ck = out_dir / "per_origin.jsonl"
    done: dict[str, dict] = {}
    if ck.exists():
        for line in ck.read_text(encoding="utf-8").splitlines():
            if line.strip():
                r = json.loads(line)
                done[r["origin"]] = r
    origins = origins_for(led, stride, min_history)
    if limit:
        origins = origins[:limit]
    history: list[dict] = [done[str(o.day)] for o in origins if str(o.day) in done]
    t0 = time.perf_counter()
    for o in origins:
        if str(o.day) in done:
            continue
        r = run_origin(led, cfg, o, history, base_seed + o.idx, n)
        with ck.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(r) + "\n")
        history.append(r)
        done[r["origin"]] = r
        if progress:
            progress(o, r, len(done), len(origins))
    rows = [done[str(o.day)] for o in origins if str(o.day) in done]
    summ = summarize(rows, reps, base_seed)
    summ["meta"] = {"subject": led.subject, "stride_days": stride, "n_futures_eval": n, "base_seed": base_seed,
                    "bootstrap_reps": reps, "min_history_days": min_history,
                    "history": [str(led.first_day), str(led.last_day)], "machine": platform.processor(),
                    "spend_model": f"tabpfn {cfg.tabpfn.model_version} n_estimators={cfg.tabpfn.n_estimators}",
                    "runtime_s_this_run": round(time.perf_counter() - t0, 1),
                    "broke_definition": "lowest within-day balance below the broke line"}
    (out_dir / "summary.json").write_text(json.dumps(summ, indent=2), encoding="utf-8")
    try:
        import pandas as pd

        flat = [{"origin": r["origin"], "cycle": r["cycle"], "H": r["H"], "y": r["y"], "B": r["B"],
                 **{f"{m}_{k}": v for m, mv in r["models"].items() for k, v in mv.items()
                    if k in ("p", "crps", "cov80", "k", "B_med")}} for r in rows]
        pd.DataFrame(flat).to_parquet(out_dir / "per_origin.parquet")
    except Exception as e:  # pragma: no cover
        log.warning("parquet export failed: %s", e)
    return summ
