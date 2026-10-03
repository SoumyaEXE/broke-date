"""Assemble the ForecastResponse (SPEC 5.3) with its facts ledger."""

from __future__ import annotations

import time
from dataclasses import dataclass
from datetime import date
from typing import Any

import numpy as np

from brokedate import __version__
from brokedate.forecast import engine as fe
from brokedate.forecast.context import dashboard_context
from brokedate.forecast.facts import Facts
from brokedate.forecast.similar import similar_month
from brokedate.sim.events import Plan


@dataclass
class ForecastBundle:
    prepared: fe.Prepared
    response: dict[str, Any]
    facts: Facts


def build_forecast(p: fe.Prepared, plans: list[Plan], subject: str, include_lattice: bool = False
                   ) -> ForecastBundle:
    t0 = time.perf_counter()
    base = fe.run(p, plans)
    own = fe.run(p, plans, inflows=False)
    summ = fe.summarize(p, base, own)
    sts = fe.safe_to_spend(p, plans)
    plan_rows, scenarios = fe.plan_effects(p, plans, base)
    recent = fe.recent_purchases(p, plans, base)
    sim_m = similar_month(p.led, p.as_of, p.cfg.broke_line_paise)
    t_outputs = time.perf_counter() - t0
    N = p.si.N
    src = {"kind": "simulation", "n": N, "seed": p.seed, "as_of": str(p.as_of), "model": p.model_name}

    facts = Facts()
    f_safe = facts.add("safe_to_spend", int(round(sts["safe_rupees"] * 100)), "paise",
                       "the amount that is safe to spend today",
                       f"Largest extra spend today that keeps the share of the {N} futures that go broke before "
                       f"payday at or below {round(p.cfg.forecast.risk_tolerance * 100)}%. Found by bisection on "
                       "the same random draws.", {**src, "kind": "safe_to_spend_search",
                                                   "iterations": sts["iterations"]})
    facts.add("n_make_it", summ["n_make_it"], "futures", "how many of the simulated futures make it to payday",
              "Futures whose balance never dips below the broke line before the next allowance.", src)
    facts.add("n_futures", N, "futures", "how many futures were simulated", "Fixed by settings.", src)
    facts.add("n_broke", N - summ["n_make_it"], "futures", "how many simulated futures go broke before payday",
              "Futures whose lowest balance on some day drops below the broke line before payday.", src)
    facts.add("broke_line", p.cfg.broke_line_paise, "paise", "the broke line", "Set in settings.",
              {"kind": "setting"})
    facts.add("days_to_payday", p.H, "count", "days until the next allowance",
              "Known allowance date" if p.anchor_known else "Predicted from past allowance dates.",
              {"kind": "calendar", "next_anchor": str(p.next_anchor)})
    facts.add("balance_now", int(round(p.si.bal0 * 100)), "paise", "the balance right now",
              "Last balance on the imported statement.", {"kind": "statement"})
    facts.add("risk_now", sts["risk_now"], "percent", "the chance of going broke before payday",
              "Share of futures that go broke with no extra spending today.", src)
    if summ["broke_day"]:
        facts.add("broke_day_median", summ["broke_day"]["median"], "date", "the most likely broke date",
                  "Median first broke day among the futures that go broke.", src)
    facts.add("runway_days", summ["runway_own_money"]["mean"], "days",
              "how many days his own money lasts on average",
              "Mean over futures of days until the balance first dips below the broke line, with no help coming "
              "in and the allowance not counted.", {**src, "kind": "runway_own_money"})
    for pr in plan_rows:
        facts.add("plan_day_cost", pr["day_cost"], "days", f"price in days of the plan '{pr['name']}'",
                  "Runway without the plan minus runway with it, averaged over the same futures.",
                  {**src, "kind": "counterfactual", "plan_id": pr["id"]}, subject_ref=f"plan:{pr['id']}")
        facts.add("plan_amount", pr["amount_paise"], "paise", f"the cost of the plan '{pr['name']}'",
                  "Entered by the user.", {"kind": "user_input"}, subject_ref=f"plan:{pr['id']}")
        facts.add("plan_futures_delta", abs(pr["futures_delta"]), "futures",
                  f"how many futures flip between making it and going broke because of the plan '{pr['name']}'",
                  "Difference in futures that make it, with versus without the plan.",
                  {**src, "kind": "counterfactual", "plan_id": pr["id"]}, subject_ref=f"plan:{pr['id']}")
    for r in recent[:5]:
        facts.add("days_regained", r["days_regained"], "days",
                  f"days regained if the recent {r['category']} purchase at {r['merchant']} had not happened",
                  "Runway if that purchase had not happened minus actual runway, same futures.",
                  {**src, "kind": "counterfactual", "txn_id": r["txn_id"]}, subject_ref=f"txn:{r['txn_id']}")
    if sim_m:
        facts.add("similar_month", sim_m["label"], "text", "the past month this one looks most like",
                  "Dynamic time warping between this month's balance curve so far and every past month.",
                  {"kind": "dtw", "distance": sim_m["distance"]})

    H = p.H
    paths_paise = np.round(base.paths[:, : H + 1] * 100).astype(np.int64)
    days = [str(p.day(i)) for i in range(H + 1)]
    resp: dict[str, Any] = {
        "as_of": str(p.as_of), "subject": subject, "seed": p.seed, "n_futures": N, "horizon_days": H,
        "next_anchor_date": str(p.next_anchor), "next_anchor_known": p.anchor_known,
        "broke_line_paise": p.cfg.broke_line_paise, "balance_now_paise": int(round(p.si.bal0 * 100)),
        "safe_to_spend_paise": int(round(sts["safe_rupees"] * 100)), "nothing_safe": sts["nothing_safe"],
        "marginal_spend_paise": int(round(sts.get("marginal_rupees", 0.0) * 100)),
        "risk_tolerance": p.cfg.forecast.risk_tolerance, "risk_now": sts["risk_now"],
        "safe_curve": [{"spend_paise": int(round(s * 100)), "p_broke": r} for s, r in sts["curve"]],
        "p_make_it": summ["p_make_it"], "n_make_it": summ["n_make_it"], "broke_day": summ["broke_day"],
        "runway_days_mean": summ["runway_own_money"]["mean"],
        "paths": {"days": days, "balances_paise": paths_paise.tolist(), "first_broke": base.first_broke.tolist()},
        "band": summ["band"], "similar_month": sim_m, "plans": plan_rows, "plan_scenarios": scenarios,
        "recent": recent, "facts": facts.to_json(), "fact_ids": {"safe_to_spend": f_safe},
        "model": {"engine_version": __version__, "spend_model": p.model_name, "model_version": p.model_version,
                  "n_history_days": p.n_history_days, "anchored": p.anchored, "calibrated": abs(p.k - 1) > 1e-9,
                  "spread_k": p.k, "lattice_rows": p.lattice_rows,
                  "timings_s": {**{k: round(v, 2) for k, v in p.timings.items()}, "outputs": round(t_outputs, 2)},
                  "history_from": str(p.led.first_day), "history_to": str(min(p.led.last_day, p.as_of))},
    }
    resp["context"] = dashboard_context(p.led, p.as_of)
    if include_lattice:
        resp["sim"] = export_sim_state(p)
    return ForecastBundle(p, resp, facts)


def export_sim_state(p: fe.Prepared, decimals: int = 4) -> dict[str, Any]:
    """Everything a browser/phone needs to rerun the same futures for any new plan (lattice + draws)."""
    si = p.si
    return {
        "lattice": si.lat.to_json(), "day_map": si.day_map.tolist(), "H": si.H, "sched": si.sched.tolist(),
        "bal0": si.bal0, "hist14": si.hist14.tolist(), "broke_line": si.broke_line, "factor": np.round(
            p.factor, decimals).tolist(), "U": np.round(si.U, decimals).tolist(),
        "V": np.round(si.V, decimals).tolist() if si.V is not None else None,
        "W": np.round(si.W, decimals).tolist() if si.W is not None else None,
        "inflow": si.inflow.to_json() if si.inflow is not None else None, "as_of": str(p.as_of),
    }


def as_of_default(last_day: date) -> date:
    from datetime import timedelta

    return last_day + timedelta(days=1)
