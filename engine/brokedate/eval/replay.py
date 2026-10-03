"""Time machine + calibration, from the backtest's own per-day records (out/backtest/<subject>/per_origin.jsonl).

Nothing is re-run: every evaluated day already stores what each model predicted (the chance of going broke before
payday, made using only earlier days) and what actually happened. This module only regroups those records:

- months: each allowance month with the app's prediction for every evaluated day, the day the money actually ran
  out (if it did), the first warning (prediction >= the pre-registered threshold) and the days of notice. Same rule
  as `metrics.lead_times`, so the numbers match the published table;
- calibration: predictions binned by value against how often running out actually happened in that bin.
"""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from typing import Any

import numpy as np

COMPARE = ("M1", "B3", "B1")      # the app, the strongest baseline, the simplest baseline
BINS = np.linspace(0.0, 1.0, 6)   # five bins: 0-20%, ..., 80-100% (138 days; finer bins would be mostly noise)


def load_origins(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def _iso(ordinal: int | None) -> str | None:
    return None if ordinal is None else date.fromordinal(int(ordinal)).isoformat()


def months(origins: list[dict[str, Any]], threshold: float = 0.5, model: str = "M1") -> list[dict[str, Any]]:
    by: dict[int, list[dict[str, Any]]] = {}
    for o in origins:
        by.setdefault(int(o["cycle"]), []).append(o)
    out = []
    for cyc in sorted(by):
        os_ = sorted(by[cyc], key=lambda o: o["origin_ord"])
        bd = next((o["cycle_broke_day_ord"] for o in os_ if o["cycle_broke_day_ord"] is not None), None)
        days = [{"date": o["origin"], "p": round(float(o["models"][model]["p"]), 4),
                 **{f"p_{m}": round(float(o["models"][m]["p"]), 4) for m in COMPARE if m != model and m in o["models"]}}
                for o in os_]
        warned = [o for o in os_ if o["models"][model]["p"] >= threshold and (bd is None or o["origin_ord"] <= bd)]
        first = warned[0] if warned else None
        out.append({
            "cycle": cyc, "start": os_[0]["origin"], "payday": os_[-1]["window_end"], "days": days,
            "broke_day": _iso(bd), "went_broke": bd is not None,
            "first_warning": first["origin"] if first else None,
            "lead_days": (bd - first["origin_ord"]) if (bd is not None and first) else (0 if bd is not None else None),
            "false_alarm": bd is None and first is not None,
        })
    return out


def calibration(origins: list[dict[str, Any]], model: str) -> list[dict[str, Any]]:
    p = np.array([float(o["models"][model]["p"]) for o in origins])
    y = np.array([int(o["y"]) for o in origins])
    rows = []
    for lo, hi in zip(BINS[:-1], BINS[1:], strict=True):
        m = (p >= lo) & ((p < hi) if hi < 1 else (p <= hi))
        if m.any():
            rows.append({"lo": round(float(lo), 2), "hi": round(float(hi), 2), "n": int(m.sum()),
                         "mean_p": round(float(p[m].mean()), 4), "observed": round(float(y[m].mean()), 4)})
    return rows


def build_replay(origins: list[dict[str, Any]], threshold: float = 0.5) -> dict[str, Any]:
    present = [m for m in COMPARE if origins and m in origins[0]["models"]]
    return {"threshold": threshold, "model": "M1", "n_days": len(origins),
            "months": months(origins, threshold),
            "calibration": {m: calibration(origins, m) for m in present}}
