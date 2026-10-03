"""State lattice: the spend model's quantile function, precomputed once per forecast (NOTES.md, Decisions).

For each simulated day the calendar features are exact; the per-future state (balance, spend_3d, spend_14d)
is laid out on a small grid. TabPFN predicts the full quantile function at every grid point in one batched
call. The simulator interpolates trilinearly between grid points. A convex combination of monotone quantile
functions is monotone, so every interpolated row is a valid quantile function.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

import numpy as np

from brokedate.features.daily import state_features
from brokedate.features.spec import SPEND_FEATURES
from brokedate.models.tabpfn_adapter import DistRegressor

BAL_FRACTIONS = np.array([0.0, 0.02, 0.05, 0.1, 0.16, 0.25, 0.36, 0.5, 0.7, 1.0, 1.4, 2.0, 3.0])


@dataclass
class Lattice:
    qs: np.ndarray            # (Q,)
    bal: np.ndarray           # (B,) rupees
    s3: np.ndarray            # (S3,)
    s14: np.ndarray           # (S14,)
    values: np.ndarray        # (D, B, S3, S14, Q) rupees of unscheduled spend
    days: list[date]          # calendar day for each lattice slice
    anchor_rupees: float
    model_name: str = ""

    @property
    def n_rows(self) -> int:
        return int(np.prod(self.values.shape[:4]))

    def to_json(self, decimals: int = 1) -> dict:
        return {
            "qs": np.round(self.qs, 4).tolist(), "bal": np.round(self.bal, 2).tolist(),
            "s3": np.round(self.s3, 2).tolist(), "s14": np.round(self.s14, 2).tolist(),
            "shape": list(self.values.shape), "days": [d.isoformat() for d in self.days],
            "values": np.round(self.values, decimals).ravel().tolist(), "anchor_rupees": self.anchor_rupees,
        }


def _pick(points: np.ndarray, n: int) -> np.ndarray:
    if len(points) <= n:
        return points
    idx = np.unique(np.round(np.linspace(0, len(points) - 1, n)).astype(int))
    return points[idx]


def make_grids(anchor_rupees: float, balance_now: float, hist_s3: np.ndarray, hist_s14: np.ndarray,
               n_bal: int, n_s3: int, n_s14: int) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    top = max(balance_now * 1.05, anchor_rupees * 0.5, 1.0)
    fr = BAL_FRACTIONS * anchor_rupees
    fr = fr[fr <= top * 1.0001]
    bal = np.unique(np.concatenate([fr, [top]]))
    # keep the low end dense (where going broke is decided); thin the top
    if len(bal) > n_bal:
        low = bal[bal <= anchor_rupees * 0.25]
        high = bal[bal > anchor_rupees * 0.25]
        keep_high = max(n_bal - len(low), 2)
        bal = np.unique(np.concatenate([low[: max(n_bal - keep_high, 1)], _pick(high, keep_high)]))
    s3 = np.unique(np.quantile(hist_s3, np.linspace(0.0, 0.95, n_s3))) if len(hist_s3) else np.array([0.0])
    s3[0] = 0.0
    s14 = np.unique(np.quantile(hist_s14, np.linspace(0.05, 0.95, n_s14))) if len(hist_s14) else np.array([0.0])
    return bal.astype(float), s3.astype(float), s14.astype(float)


def build_lattice(model: DistRegressor, cal_rows: list[dict[str, float]], days: list[date], anchor_rupees: float,
                  bal: np.ndarray, s3: np.ndarray, s14: np.ndarray, qs: np.ndarray) -> Lattice:
    B, S3, S14 = len(bal), len(s3), len(s14)
    gb, g3, g14 = np.meshgrid(bal, s3, s14, indexing="ij")
    gb, g3, g14 = gb.ravel(), g3.ravel(), g14.ravel()
    blocks = []
    for cal in cal_rows:
        st = state_features(gb, g3, g14, anchor_rupees, int(cal["days_to_anchor"]))
        cols = []
        for name in SPEND_FEATURES:
            cols.append(st[name] if name in st else np.full(len(gb), float(cal[name])))
        blocks.append(np.stack(cols, axis=1))
    X = np.concatenate(blocks, axis=0)
    Q = model.quantiles(X, qs)
    Q = np.maximum(Q, 0.0)
    values = Q.reshape(len(cal_rows), B, S3, S14, len(qs))
    return Lattice(qs, bal, s3, s14, values, days, anchor_rupees, model.name)


def _axis(grid: np.ndarray, x: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    if len(grid) == 1:
        return np.zeros(len(x), dtype=int), np.zeros(len(x))
    xc = np.clip(x, grid[0], grid[-1])
    i = np.clip(np.searchsorted(grid, xc, side="right") - 1, 0, len(grid) - 2)
    w = (xc - grid[i]) / np.maximum(grid[i + 1] - grid[i], 1e-9)
    return i, np.clip(w, 0.0, 1.0)


def interpolate(lat: Lattice, day_idx: int, bal: np.ndarray, s3: np.ndarray, s14: np.ndarray) -> np.ndarray:
    """(N, Q) quantile functions for N futures at lattice day `day_idx`."""
    V = lat.values[day_idx]
    ib, wb = _axis(lat.bal, bal)
    i3, w3 = _axis(lat.s3, s3)
    i4, w4 = _axis(lat.s14, s14)
    nb, n3, n4 = len(lat.bal), len(lat.s3), len(lat.s14)
    out = np.zeros((len(bal), V.shape[-1]))
    for db_ in (0, 1):
        jb = np.minimum(ib + db_, nb - 1)
        wbb = wb if db_ else 1 - wb
        for d3 in (0, 1):
            j3 = np.minimum(i3 + d3, n3 - 1)
            w33 = w3 if d3 else 1 - w3
            for d4 in (0, 1):
                j4 = np.minimum(i4 + d4, n4 - 1)
                w44 = w4 if d4 else 1 - w4
                w = (wbb * w33 * w44)[:, None]
                out += w * V[jb, j3, j4]
    return out


def inverse_cdf(Q: np.ndarray, qs: np.ndarray, u: np.ndarray, tail: float = 1.0) -> np.ndarray:
    """Sample by interpolating each row's quantile function at u (N,). Clipped at 0."""
    K = len(qs)
    k = np.clip(np.searchsorted(qs, u, side="right") - 1, 0, K - 2)
    w = np.clip((u - qs[k]) / (qs[k + 1] - qs[k]), 0.0, 1.0)
    r = np.arange(len(u))
    v = Q[r, k] * (1 - w) + Q[r, k + 1] * w
    v = np.where(u < qs[0], Q[:, 0], v)
    v = np.where(u > qs[-1], Q[:, -1] * tail, v)
    return np.maximum(v, 0.0)
