"""Vectorised N-future simulator with common random numbers (SPEC 10.2 to 10.6).

Every scenario (baseline, plan toggles, recent-purchase what-ifs, the safe-to-spend search) reuses the same
uniform draws U, so path i in one scenario corresponds to path i in another and differences reflect only the
intervention.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from brokedate.sim.inflows import InflowModel
from brokedate.sim.lattice import Lattice, interpolate, inverse_cdf


@dataclass
class SimInputs:
    lat: Lattice
    day_map: np.ndarray          # (T,) lattice slice for each simulated day; T = H + E
    H: int                       # days until the next anchor (horizon)
    sched: np.ndarray            # (T,) recurring scheduled outflows, rupees
    bal0: float                  # balance at start of today, rupees
    hist14: np.ndarray           # (14,) total spend of the previous 14 days, rupees (oldest first)
    broke_line: float            # rupees
    U: np.ndarray                # (N, T) uniforms for spending
    inflow: InflowModel | None = None
    V: np.ndarray | None = None  # (N, T) uniforms: does money come in today?
    W: np.ndarray | None = None  # (N, T) uniforms: how much
    tail: float = 1.0

    @property
    def T(self) -> int:
        return len(self.day_map)

    @property
    def N(self) -> int:
        return self.U.shape[0]


@dataclass
class SimResult:
    paths: np.ndarray            # (N, T+1) balances, rupees; column 0 = start of today
    first_broke: np.ndarray      # (N,) first day (1-based) whose low point is below the broke line; 0 = already; -1 never
    free_totals: np.ndarray      # (N,) unscheduled spend summed over the horizon H
    daily_free: np.ndarray       # (N, T)

    def made_it(self, H: int) -> np.ndarray:
        return (self.first_broke == -1) | (self.first_broke > H)

    def runway(self) -> np.ndarray:
        """Days the money lasts (first broke day, or T+1 when it outlasts the simulated window)."""
        T = self.paths.shape[1] - 1
        return np.where(self.first_broke == -1, T + 1, self.first_broke).astype(float)


def rollout(si: SimInputs, factor: np.ndarray | None = None, extra: np.ndarray | None = None,
            plan_days: np.ndarray | None = None, bal0: float | None = None,
            hist14: np.ndarray | None = None, inflows: bool = True) -> SimResult:
    """extra: (T,) additional deterministic outflow (plans, a purchase today). plan_days: (T,) bool, days on
    which a plan replaces typical spending (sampled spend reduced by the state's median, floored at 0).
    inflows=False simulates the subject's own money only (used for runway / price in days)."""
    N, T = si.N, si.T
    lat = si.lat
    q50 = int(np.argmin(np.abs(lat.qs - 0.5)))
    bal = np.full(N, si.bal0 if bal0 is None else bal0, dtype=float)
    hist = np.tile(si.hist14 if hist14 is None else hist14, (N, 1)).astype(float)
    f = np.ones(N) if factor is None else factor
    ex = np.zeros(T) if extra is None else extra
    pdays = np.zeros(T, dtype=bool) if plan_days is None else plan_days
    paths = np.empty((N, T + 1))
    paths[:, 0] = bal
    first = np.where(bal < si.broke_line, 0, -1)
    daily_free = np.zeros((N, T))
    for t in range(T):
        Q = interpolate(lat, int(si.day_map[t]), bal, hist[:, -3:].sum(axis=1), hist.sum(axis=1))
        draw = inverse_cdf(Q, lat.qs, si.U[:, t], si.tail) * f
        if pdays[t]:
            draw = np.maximum(draw - Q[:, q50], 0.0)
        want = draw + si.sched[t] + ex[t]
        spend = np.minimum(want, np.maximum(bal, 0.0))        # UPI cannot spend money you don't have
        daily_free[:, t] = np.minimum(draw, spend)
        inc: np.ndarray | float = 0.0
        if inflows and si.inflow is not None and si.V is not None and si.W is not None:
            inc = si.inflow.sample(bal, si.V[:, t], si.W[:, t])
        low = bal - spend                         # lowest point of the day: after spending, before help arrives
        bal = low + inc
        hist = np.roll(hist, -1, axis=1)
        hist[:, -1] = spend
        newly = (first == -1) & (low < si.broke_line)
        first[newly] = t + 1
        paths[:, t + 1] = bal
    totals = daily_free[:, : si.H].sum(axis=1)
    return SimResult(paths, first, totals, daily_free)


def anchor_targets(free_totals: np.ndarray, direct_q: np.ndarray | None, direct_qs: np.ndarray | None,
                   k: float = 1.0, mode: str = "location") -> np.ndarray:
    """Anchor each future's horizon total to the direct model, then spread-scale around the median by k.

    mode="location" (default, see NOTES.md Decisions): scale all totals so their median matches the direct
    model's median; the simulation keeps its own spread. mode="quantile" (SPEC 10.5 as first written):
    rank-map onto the direct model's full distribution. direct_q=None skips anchoring (ablation M1a)."""
    N = len(free_totals)
    if direct_q is not None and direct_qs is not None and mode == "location":
        dmed = float(np.interp(0.5, direct_qs, np.maximum.accumulate(np.maximum(direct_q, 0))))
        tmed = float(np.median(free_totals))
        target = free_totals * (dmed / tmed) if tmed > 1e-6 else free_totals + dmed
    elif direct_q is not None and direct_qs is not None:
        ranks = np.empty(N)
        ranks[np.argsort(free_totals, kind="stable")] = np.arange(1, N + 1)
        r = ranks / (N + 1)
        target = np.interp(r, direct_qs, np.maximum.accumulate(np.maximum(direct_q, 0)))
    else:
        target = free_totals.copy()
    med = float(np.median(target))
    return np.maximum(med + k * (target - med), 0.0)


def fit_factors(si: SimInputs, targets: np.ndarray, iters: int = 4) -> np.ndarray:
    """Per-future multipliers on sampled spend so horizon totals match targets, solved inside the rollout so the
    balance feedback stays consistent (a few fixed-point steps)."""
    f = np.ones(si.N)
    for _ in range(iters):
        res = rollout(si, factor=f)
        T = res.free_totals
        ok = T > 1e-6
        f = np.where(ok, f * targets / np.where(ok, T, 1.0), f)
        f = np.clip(f, 0.05, 20.0)
    return f
