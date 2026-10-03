"""Pre-registered metrics (SPEC 13)."""

from __future__ import annotations

import numpy as np


def brier(p: np.ndarray, y: np.ndarray) -> float:
    p, y = np.asarray(p, float), np.asarray(y, float)
    return float(np.mean((p - y) ** 2)) if len(p) else float("nan")


def crps_samples(samples: np.ndarray, y: float) -> float:
    """CRPS = E|X - y| - 0.5 E|X - X'| with the O(N log N) sorted-sample formula."""
    x = np.sort(np.asarray(samples, float))
    n = len(x)
    if n == 1:
        return float(abs(x[0] - y))
    term1 = np.mean(np.abs(x - y))
    i = np.arange(1, n + 1)
    # E|X - X'| = 2/n^2 * sum_i (2i - n - 1) x_(i)
    term2 = 2.0 / (n * n) * np.sum((2 * i - n - 1) * x)
    return float(term1 - 0.5 * term2)


def covered80(samples: np.ndarray, y: float) -> bool:
    lo, hi = np.percentile(samples, [10, 90])
    return bool(lo <= y <= hi)


def logistic_fit(x: np.ndarray, y: np.ndarray, l2: float = 1e-2, iters: int = 50) -> tuple[float, float]:
    """1-D logistic regression by Newton steps (for the B1/B2 squash). Returns (a, b)."""
    a, b = 0.0, -5.0
    X = np.stack([np.ones_like(x), x], axis=1)
    w = np.array([a, b])
    for _ in range(iters):
        z = np.clip(X @ w, -30, 30)
        p = 1 / (1 + np.exp(-z))
        g = X.T @ (p - y) + l2 * w
        Hm = X.T @ (X * (p * (1 - p))[:, None]) + l2 * np.eye(2)
        try:
            step = np.linalg.solve(Hm, g)
        except np.linalg.LinAlgError:
            break
        w = w - step
        if np.max(np.abs(step)) < 1e-8:
            break
    return float(w[0]), float(w[1])


def squash(a: float, b: float, x: np.ndarray | float) -> np.ndarray:
    return 1 / (1 + np.exp(-np.clip(a + b * np.asarray(x, float), -30, 30)))


def lead_times(origins: list[dict], threshold: float = 0.5, key: str = "p") -> dict:
    """Per cycle that went broke: actual broke day minus first origin (in that cycle) with P >= threshold.
    No warning on or before the broke day counts as 0 days lead and is reported separately."""
    by_cycle: dict[int, list[dict]] = {}
    for o in origins:
        by_cycle.setdefault(o["cycle"], []).append(o)
    leads, no_warning = [], 0
    for _, os_ in by_cycle.items():
        bd = next((o["cycle_broke_day_ord"] for o in os_ if o["cycle_broke_day_ord"] is not None), None)
        if bd is None:
            continue
        warned = [o["origin_ord"] for o in sorted(os_, key=lambda o: o["origin_ord"])
                  if o[key] >= threshold and o["origin_ord"] <= bd]
        if warned:
            leads.append(bd - warned[0])
        else:
            leads.append(0)
            no_warning += 1
    return {"lead_days": leads, "mean_lead": float(np.mean(leads)) if leads else float("nan"),
            "n_broke_cycles": len(leads), "n_no_warning": no_warning}
