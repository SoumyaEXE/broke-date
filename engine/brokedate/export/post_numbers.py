"""Every number the post needs, pulled from out/ artifacts (SPEC 22.3). Real subjects: relative numbers only."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from brokedate.config import REPO_ROOT

OUT = REPO_ROOT / "out"


def _load(p: Path) -> Any:
    return json.loads(p.read_text(encoding="utf-8")) if p.is_file() else None


def _bt_table(s: dict[str, Any]) -> dict[str, Any]:
    t = {}
    for m, v in s["models"].items():
        t[m] = {k: (None if v[k] is None else {x: round(v[k][x], 4) for x in ("point", "lo", "hi")})
                for k in ("brier", "crps", "coverage80")}
        t[m]["lead"] = {k: v["lead_time"][k] for k in ("mean_lead", "n_broke_cycles", "n_no_warning")}
    return t


def collect() -> dict[str, Any]:
    out: dict[str, Any] = {}
    demo = _load(REPO_ROOT / "web" / "public" / "demo" / "forecast.json")
    if demo:
        plans = {p["name"]: p["day_cost"] for p in demo["plans"]}
        out["demo_sim"] = {"as_of": demo["as_of"], "safe_to_spend_paise": demo["safe_to_spend_paise"],
                           "n_make_it": demo["n_make_it"], "n_futures": demo["n_futures"], "plan_day_costs": plans,
                           "timings_s": demo["model"]["timings_s"]}
    for sub_dir in sorted((OUT / "backtest").glob("*")) + sorted((OUT / "real" / "backtest").glob("*")):
        s = _load(sub_dir / "summary.json")
        if not s:
            continue
        real = "real" in sub_dir.parts
        entry = {"n_origins": s["n_origins"], "n_cycles": s["n_cycles"], "base_rate": s["base_rate"],
                 "table": _bt_table(s), "verdicts": {m: {k: v["verdict"] for k, v in d.items()}
                                                     for m, d in s["diff_vs_M1"].items()},
                 "calibration": {k: s["calibration"][k] for k in ("k_last",)},
                 "relative_only": real}
        out[f"backtest_{sub_dir.name}"] = entry
    for f in [OUT / "labels" / "sim.json", *sorted((OUT / "real" / "labels").glob("*.json"))]:
        lab = _load(f)
        if lab:
            out[f"labels_{f.stem}"] = {k: lab[k] for k in ("n_rows", "rules_coverage", "accuracy_overall",
                                                           "accuracy_by_source", "gemma_model")}
    bench = _load(OUT / "bench.json")
    if bench:
        out["bench"] = [{k: r.get(k) for k in ("label", "machine", "full_forecast_s", "prepare_s", "lattice_s",
                                               "peak_rss_mb", "gemma_tokens_per_s", "n_futures", "horizon_days")}
                        for r in bench]
    return out
