"""Pydantic response models. Mirrored by hand in web/src/types.ts; a snapshot test keeps them in sync."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel


class BrokeDay(BaseModel):
    median: str
    lo80: str
    hi80: str


class Paths(BaseModel):
    days: list[str]
    balances_paise: list[list[int]]
    first_broke: list[int]


class Band(BaseModel):
    p10: list[int]
    p50: list[int]
    p90: list[int]


class PlanRow(BaseModel):
    id: str
    name: str
    amount_paise: int
    date: str
    active: bool
    day_cost: float
    futures_delta: int
    in_horizon: bool


class RecentRow(BaseModel):
    txn_id: str
    merchant: str
    category: str | None
    amount_paise: int
    date: str
    days_regained: float
    futures_delta: int


class SafePoint(BaseModel):
    spend_paise: int
    p_broke: float


class Fact(BaseModel):
    id: str
    kind: str
    value: Any
    unit: str
    text: str
    desc: str
    how: str
    source: dict[str, Any]
    subject_ref: str | None = None


class SimilarMonth(BaseModel):
    cycle_id: int
    label: str
    start: str
    end: str
    distance: float
    overlay_this: list[float]
    overlay_then: list[float]
    then_went_broke: bool


class ModelInfo(BaseModel):
    engine_version: str
    spend_model: str
    model_version: str
    n_history_days: int
    anchored: bool
    calibrated: bool
    spread_k: float
    lattice_rows: int
    timings_s: dict[str, float]
    history_from: str
    history_to: str


class ForecastResponse(BaseModel):
    as_of: str
    subject: str
    seed: int
    n_futures: int
    horizon_days: int
    next_anchor_date: str
    next_anchor_known: bool
    broke_line_paise: int
    balance_now_paise: int
    safe_to_spend_paise: int
    nothing_safe: bool
    marginal_spend_paise: int = 0
    risk_tolerance: float
    risk_now: float
    safe_curve: list[SafePoint]
    p_make_it: float
    n_make_it: int
    broke_day: BrokeDay | None
    runway_days_mean: float
    paths: Paths
    band: Band
    similar_month: SimilarMonth | None
    plans: list[PlanRow]
    plan_scenarios: dict[str, Any]
    recent: list[RecentRow]
    facts: dict[str, Fact]
    fact_ids: dict[str, str]
    model: ModelInfo
    sim: dict[str, Any] | None = None
    context: dict[str, Any] | None = None


class LetterResponse(BaseModel):
    language: str
    text_rendered: str
    text_placeholders: str
    segments: list[dict[str, Any]]
    placeholders: list[str]
    attempts: int
    fallback_used: bool
    facts: dict[str, Fact]
    model: str | None


class PlanIn(BaseModel):
    subject: str
    name: str
    amount_paise: int
    date: str
    active: bool = True


class PlanPatch(BaseModel):
    active: bool


class ForecastIn(BaseModel):
    subject: str
    as_of: str | None = None
    n: int | None = None
    seed: int | None = None


class Correction(BaseModel):
    id: str
    category: str
    merchant: str | None = None
    counterparty: str | None = None


class AnchorsIn(BaseModel):
    subject: str
    ids: list[str]


class SettingsIn(BaseModel):
    broke_line_rupees: int | None = None
    risk_tolerance: float | None = None
    n_futures: int | None = None
    letter_language: str | None = None
    gemma_enabled: bool | None = None
    letters_enabled: bool | None = None


class ChatFact(BaseModel):
    id: str
    desc: str


class ChatIn(BaseModel):
    question: str
    template: str
    facts: list[ChatFact] = []
    verdict: str | None = None
    language: str | None = None
    model: str | None = None  # a specific installed Gemma tag; None = auto
