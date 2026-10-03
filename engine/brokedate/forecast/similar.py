"""Similar month: DTW between this cycle's normalised balance curve so far and every past cycle's prefix
(Sakoe-Chiba band, numpy only) (SPEC 11)."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

import numpy as np

from brokedate.features.daily import Ledger


def dtw(a: np.ndarray, b: np.ndarray, band: int = 3) -> float:
    n, m = len(a), len(b)
    INF = np.inf
    D = np.full((n + 1, m + 1), INF)
    D[0, 0] = 0.0
    w = max(band, abs(n - m))
    for i in range(1, n + 1):
        lo, hi = max(1, i - w), min(m, i + w)
        for j in range(lo, hi + 1):
            c = abs(a[i - 1] - b[j - 1])
            D[i, j] = c + min(D[i - 1, j], D[i, j - 1], D[i - 1, j - 1])
    return float(D[n, m] / (n + m))


def _curve(led: Ledger, start: date, end: date, anchor_paise: int) -> np.ndarray:
    r0, r1 = led.row_of(start), min(led.row_of(end) + 1, len(led.daily))
    return led.daily["bal_end_paise"].iloc[r0:r1].to_numpy() / max(anchor_paise, 1)


def similar_month(led: Ledger, as_of: date, broke_line_paise: int = 15000, band: int = 3) -> dict[str, Any] | None:
    if len(led.anchors.dates) < 3:
        return None
    cur_start = led.prev_anchor(as_of - timedelta(days=1))
    days_in = (as_of - cur_start).days
    if days_in < 5:
        return None
    this = _curve(led, cur_start, as_of - timedelta(days=1), led.anchor_amount_at(cur_start))
    best: tuple[float, int] | None = None
    dates = led.anchors.dates
    for i in range(len(dates) - 1):
        s, e = dates[i], dates[i + 1] - timedelta(days=1)
        if e >= cur_start or (e - s).days + 1 < days_in:
            continue
        then = _curve(led, s, e, led.anchors.amounts_paise[i])
        dist = dtw(this, then[: len(this)], band)
        if best is None or dist < best[0]:
            best = (dist, i)
    if best is None:
        return None
    dist, i = best
    s, e = dates[i], dates[i + 1] - timedelta(days=1)
    then = _curve(led, s, e, led.anchors.amounts_paise[i])
    return {"cycle_id": i, "label": s.strftime("%B"), "start": str(s), "end": str(e), "distance": round(dist, 4),
            "overlay_this": np.round(this, 4).tolist(), "overlay_then": np.round(then, 4).tolist(),
            "then_went_broke": bool((led.daily["bal_min_paise"].iloc[led.row_of(s):led.row_of(e) + 1]
                                     < broke_line_paise).any())}
