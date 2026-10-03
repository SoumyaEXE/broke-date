// Mirrors engine/brokedate/api/schemas.py. A snapshot test on the engine side checks the field names.

export interface BrokeDay { median: string; lo80: string; hi80: string }
export interface Paths { days: string[]; balances_paise: number[][]; first_broke: number[] }
export interface Band { p10: number[]; p50: number[]; p90: number[] }

export interface PlanRow {
  id: string; name: string; amount_paise: number; date: string; active: boolean;
  day_cost: number; futures_delta: number; in_horizon: boolean;
}

export interface RecentRow {
  txn_id: string; merchant: string; category: string | null; amount_paise: number; date: string;
  days_regained: number; futures_delta: number;
}

export interface SafePoint { spend_paise: number; p_broke: number }

export interface Fact {
  id: string; kind: string; value: unknown; unit: string; text: string; desc: string; how: string;
  source: Record<string, unknown>; subject_ref?: string | null;
}

export interface SimilarMonth {
  cycle_id: number; label: string; start: string; end: string; distance: number;
  overlay_this: number[]; overlay_then: number[]; then_went_broke: boolean;
}

export interface ModelInfo {
  engine_version: string; spend_model: string; model_version: string; n_history_days: number;
  anchored: boolean; calibrated: boolean; spread_k: number; lattice_rows: number;
  timings_s: Record<string, number>; history_from: string; history_to: string;
}

export interface LatticeJson {
  qs: number[]; bal: number[]; s3: number[]; s14: number[]; shape: number[]; days: string[];
  values: number[]; anchor_rupees: number;
}

export interface InflowJson { edges: (number | null)[]; probs: number[]; amounts: number[][] }

export interface SimState {
  lattice: LatticeJson; day_map: number[]; H: number; sched: number[]; bal0: number; hist14: number[];
  broke_line: number; factor: number[]; U: number[][]; V: number[][] | null; W: number[][] | null;
  inflow: InflowJson | null; as_of: string;
}

export interface Scenario {
  toggled_active: boolean; n_make_it: number; p_make_it: number; broke_day: BrokeDay | null; band: Band;
  first_broke: number[]; balances_paise: number[][];
}

export interface ForecastResponse {
  as_of: string; subject: string; seed: number; n_futures: number; horizon_days: number;
  next_anchor_date: string; next_anchor_known: boolean; broke_line_paise: number; balance_now_paise: number;
  safe_to_spend_paise: number; nothing_safe: boolean; marginal_spend_paise?: number; risk_tolerance: number; risk_now: number;
  safe_curve: SafePoint[]; p_make_it: number; n_make_it: number; broke_day: BrokeDay | null;
  runway_days_mean: number; paths: Paths; band: Band; similar_month: SimilarMonth | null; plans: PlanRow[];
  plan_scenarios: Record<string, Scenario>; recent: RecentRow[]; facts: Record<string, Fact>;
  fact_ids: Record<string, string>; model: ModelInfo; sim?: SimState | null;
  demo?: { simulated: boolean; note: string };
  context?: DashboardContext | null;
}

export interface GroupSpend {
  group: string; spent_paise: number; typical_paise: number | null; n_txns: number; categories: string[];
  top: { category: string; spent_paise: number; typical_paise: number | null }[];
}
export interface TxnRow {
  id: string; date: string; merchant: string; category: string | null; direction: string; amount_paise: number;
  status: string; label_source: string | null; is_anchor: boolean;
}
export interface DashboardContext {
  cycle: { start: string; day_in_cycle: number; anchor_paise: number; spent_paise: number;
    typical_spent_paise: number | null; avg_daily_14d_paise: number; groups: GroupSpend[]; n_past_cycles: number };
  balance_compare: { this: number[]; last: { start: string; balances_paise: number[]; label: string } | null };
  recurring: { name: string; amount_paise: number; period_days: number; next_date: string; last_date: string; n_seen: number }[];
  transactions: TxnRow[];
  upcoming?: Festival[];
}

export interface Festival {
  name: string; start: string; end: string; days_until: number;
  last: { start: string; end: string; days: number; spent_paise: number; usual_paise: number; extra_paise: number } | null;
}

export interface UnusualSpend {
  txn_id: string; date: string; merchant: string; category: string | null; amount_paise: number;
  usual_paise: number; usual_hi_paise: number; percentile: number; times_seen: number;
}
export interface Insights {
  unusual: { as_of: string; window_days: number; n_checked: number; n_train: number; model: string; note: string | null;
    flag_percentile: number; unusual: UnusualSpend[] };
}
export interface LabelVariant { accuracy: number | null; needs_review: number; counts: Record<string, number>; gemma_error: string | null; tabpfn_error: string | null }
export interface LabelsReport { subject: string; n_rows: number; accuracy_overall: number | null; compare?: Record<string, LabelVariant>; gemma_model?: string | null }

export interface LetterSegment { type: "text" | "fact"; text: string; fact_id?: string }
export interface LetterResponse {
  language: string; text_rendered: string; text_placeholders: string; segments: LetterSegment[];
  placeholders: string[]; attempts: number; fallback_used: boolean; facts: Record<string, Fact>;
  model: string | null;
}

export interface CI { point: number; lo: number; hi: number; n_cycles: number; reps?: number }
export interface ModelEval {
  brier: CI; crps: CI; coverage80: CI | null;
  lead_time: { lead_days: number[]; mean_lead: number; n_broke_cycles: number; n_no_warning: number };
}
export interface BacktestSummary {
  n_origins: number; n_cycles: number; base_rate: number; models: Record<string, ModelEval>;
  diff_vs_M1: Record<string, Record<string, CI & { verdict: string }>>;
  calibration: { k_last: number | null; k_values: number[]; coverage80_uncalibrated: CI | null; coverage80_calibrated: CI | null };
  meta: Record<string, unknown>;
}

export interface Settings {
  broke_line_rupees: number; risk_tolerance: number; n_futures: number; letter_language: string;
  gemma_enabled: boolean; letters_enabled: boolean;
}

export interface ImportReport {
  file: string; adapter: string; parsed_rows: number;
  reconciliation: { ok: boolean; n_rows: number; opening_paise: number | null; closing_paise: number | null;
    n_with_balance: number };
  inserted: number; duplicates: number; reversal_pairs: number;
  enrich: { total: number; by_rules: number; by_cache: number; by_gemma: number; needs_review: number;
    gemma_error: string | null } | null;
  anchors_detected: { id: string; date: string; amount_paise: number }[]; anchor_sender: string;
  date_from: string; date_to: string;
}

export interface ReviewRow {
  id: string; date: string; direction: string; amount_paise: number; raw_narration: string;
  merchant: string | null; category: string | null; counterparty: string | null; label_source: string;
  confidence: number | null;
}
