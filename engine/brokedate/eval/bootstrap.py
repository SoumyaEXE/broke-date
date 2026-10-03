"""Block bootstrap over cycles (SPEC 13, PREREGISTRATION 7)."""

from __future__ import annotations

from collections.abc import Callable

import numpy as np


def cycle_bootstrap(rows: list[dict], stat: Callable[[list[dict]], float], reps: int = 2000, seed: int = 0,
                    ci: float = 0.90) -> dict[str, float]:
    cycles = sorted({r["cycle"] for r in rows})
    by = {c: [r for r in rows if r["cycle"] == c] for c in cycles}
    rng = np.random.default_rng(seed)
    point = stat(rows)
    vals = []
    for _ in range(reps):
        pick = rng.integers(0, len(cycles), len(cycles))
        sample = [r for i in pick for r in by[cycles[i]]]
        v = stat(sample)
        if np.isfinite(v):
            vals.append(v)
    if not vals:
        return {"point": point, "lo": float("nan"), "hi": float("nan"), "n_cycles": len(cycles)}
    a = (1 - ci) / 2
    lo, hi = np.percentile(vals, [100 * a, 100 * (1 - a)])
    return {"point": float(point), "lo": float(lo), "hi": float(hi), "n_cycles": len(cycles), "reps": len(vals)}
