"""Non-anchor inflows (friends paying back, family top-ups when broke, gifts), learned from the subject's own
history, conditional on how low the balance was at the start of the day.

Closure-safe: the only state used is the simulated balance relative to the anchor amount.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

EDGES_FRAC = np.array([0.0, 0.06, 0.15, 0.4, np.inf])   # balance / anchor amount buckets
MIN_DAYS = 12


@dataclass
class InflowModel:
    edges: np.ndarray            # rupees
    probs: np.ndarray            # (K,) P(any inflow that day | bucket)
    amounts: list[np.ndarray]    # per bucket, sorted inflow amounts (rupees)

    def to_json(self) -> dict:
        return {"edges": [float(x) if np.isfinite(x) else None for x in self.edges],
                "probs": self.probs.round(4).tolist(), "amounts": [a.round(2).tolist() for a in self.amounts]}

    def sample(self, bal_start: np.ndarray, v: np.ndarray, w: np.ndarray) -> np.ndarray:
        k = np.clip(np.searchsorted(self.edges, bal_start, side="right") - 1, 0, len(self.probs) - 1)
        hit = v < self.probs[k]
        out = np.zeros(len(bal_start))
        for b in np.unique(k[hit]):
            a = self.amounts[b]
            if len(a) == 0:
                continue
            sel = hit & (k == b)
            idx = np.minimum((w[sel] * len(a)).astype(int), len(a) - 1)
            out[sel] = a[idx]
        return out


def fit_inflows(daily: pd.DataFrame, anchor_rupees: float, before_row: int) -> InflowModel:
    d = daily.iloc[:before_row]
    bal = d["bal_start_paise"].to_numpy() / 100.0
    inc = d["income_paise"].to_numpy() / 100.0
    edges = EDGES_FRAC * max(anchor_rupees, 1.0)
    K = len(edges) - 1
    probs = np.zeros(K)
    amounts: list[np.ndarray] = []
    overall_p = float((inc > 0).mean()) if len(inc) else 0.0
    overall_a = np.sort(inc[inc > 0])
    for b in range(K):
        m = (bal >= edges[b]) & (bal < edges[b + 1])
        n = int(m.sum())
        if n >= MIN_DAYS:
            # shrink toward the overall rate with a weak prior (5 pseudo-days)
            probs[b] = (float((inc[m] > 0).sum()) + 5 * overall_p) / (n + 5)
            a = np.sort(inc[m & (inc > 0)])
            amounts.append(a if len(a) >= 3 else overall_a)
        else:
            probs[b] = overall_p
            amounts.append(overall_a)
    return InflowModel(edges, probs, amounts)
