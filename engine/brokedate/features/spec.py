"""Feature declarations with the closure rule (SPEC 8.1).

`closure_ok` features can be recomputed inside the simulator from calendar + simulated balance + simulated
daily-spend history + scheduled events. The spend model may only use those. `state` marks the per-future
features that vary across futures (lattice axes or values derived from them).
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Feature:
    name: str
    closure_ok: bool
    state: bool
    doc: str


FEATURES: tuple[Feature, ...] = (
    Feature("dow", True, False, "weekday 0..6"),
    Feature("is_weekend", True, False, "0/1"),
    Feature("day_in_cycle", True, False, "days since last anchor"),
    Feature("days_to_anchor", True, False, "days until next anchor (known or assumed)"),
    Feature("frac_cycle", True, False, "day_in_cycle / cycle_length"),
    Feature("bal_rupees", True, True, "balance at start of day"),
    Feature("bal_frac", True, True, "balance / typical anchor amount"),
    Feature("safe_daily", True, True, "balance / max(days_to_anchor, 1)"),
    Feature("spend_3d", True, True, "sum of daily spend over the previous 3 days (rupees)"),
    Feature("spend_14d", True, True, "sum of daily spend over the previous 14 days (rupees)"),
    Feature("is_festival", True, False, "inside a festival window"),
    Feature("days_to_festival", True, False, "days to next festival start (capped 60)"),
    Feature("is_exam", True, False, "inside a user-entered exam window"),
    Feature("scheduled_today", True, False, "known scheduled outflow today (rupees)"),
)

# explanation-only features (never in the spend model)
EXPLAIN_ONLY: tuple[Feature, ...] = (
    Feature("delivery_count_7d", False, False, "food delivery orders in last 7 days"),
    Feature("outing_count_14d", False, False, "outings in last 14 days"),
)

SPEND_FEATURES: list[str] = [f.name for f in FEATURES]
DIRECT_FEATURES: list[str] = SPEND_FEATURES + ["cycle_spend_so_far"]
CALENDAR_FEATURES: list[str] = [f.name for f in FEATURES if not f.state]


def assert_closure(names: list[str]) -> None:
    ok = {f.name for f in FEATURES if f.closure_ok}
    bad = [n for n in names if n not in ok]
    if bad:
        raise AssertionError(f"spend model uses non-closure features: {bad}")
