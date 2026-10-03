import type {
  BacktestSummary, ForecastResponse, ImportReport, LetterResponse, PlanRow, ReviewRow, Settings,
} from "../types";
import { Lattice, madeIt, meanRunway, percentileBand, rollout, safeToSpend, type SimPlan } from "../lib/sim";
import { addDays } from "../lib/format";

declare const __DEMO__: boolean;
export const IS_DEMO: boolean = typeof __DEMO__ !== "undefined" && __DEMO__;

export interface NewPlan { name: string; amount_paise: number; date: string }

export interface DataProvider {
  readonly mode: "live" | "static";
  forecast(): Promise<ForecastResponse>;
  togglePlan(id: string, active: boolean): Promise<ForecastResponse>;
  addPlan(p: NewPlan): Promise<ForecastResponse>;
  removePlan(id: string): Promise<ForecastResponse>;
  letter(language: string): Promise<LetterResponse>;
  backtest(): Promise<BacktestSummary | null>;
  settings(): Promise<Settings>;
  saveSettings(s: Partial<Settings>): Promise<Settings>;
  importFile?(f: File, subject: string): Promise<ImportReport>;
  review?(subject: string): Promise<ReviewRow[]>;
  saveReview?(rows: { id: string; category: string }[]): Promise<void>;
  confirmAnchors?(subject: string, ids: string[]): Promise<void>;
  health?(): Promise<Record<string, unknown>>;
  /** Stream a Gemma-written reply for an already simulated answer (live engine only). */
  chat?(body: ChatRequest, onEvent: (e: ChatEvent) => void, signal?: AbortSignal): Promise<void>;
}

export interface ChatRequest { question: string; template: string; facts: { id: string; desc: string }[]; verdict: string | null; language?: string }
export type ChatEvent =
  | { type: "start"; model: string; note?: string }
  | { type: "token"; text: string }
  | { type: "done"; ok: boolean; text: string; problems: string[] }
  | { type: "error"; message: string };

/** Read an NDJSON response body line by line as it arrives. */
export async function readNdjson(res: Response, onEvent: (e: ChatEvent) => void): Promise<void> {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) onEvent(JSON.parse(line) as ChatEvent);
    }
  }
}

const API = "http://127.0.0.1:8787";

async function j<T>(r: Promise<Response>): Promise<T> {
  const res = await r;
  if (!res.ok) {
    let detail: unknown = res.statusText;
    try { detail = await res.json(); } catch { /* keep status text */ }
    throw Object.assign(new Error(`API ${res.status}`), { detail });
  }
  return res.json() as Promise<T>;
}

export class LiveProvider implements DataProvider {
  readonly mode = "live" as const;
  constructor(private subject: string) {}
  setSubject(s: string) { this.subject = s; }
  async chat(body: ChatRequest, onEvent: (e: ChatEvent) => void, signal?: AbortSignal) {
    const res = await fetch(`${API}/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal });
    if (!res.ok || !res.body) { onEvent({ type: "error", message: `engine returned ${res.status}` }); return; }
    await readNdjson(res, onEvent);
  }
  forecast() {
    return j<ForecastResponse>(fetch(`${API}/forecast`, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ subject: this.subject }) }));
  }
  togglePlan(id: string, active: boolean) {
    return j<ForecastResponse>(fetch(`${API}/plans/${encodeURIComponent(id)}?subject=${this.subject}`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ active }) }));
  }
  addPlan(p: NewPlan) {
    return j<ForecastResponse>(fetch(`${API}/plans`, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...p, subject: this.subject, active: true }) }));
  }
  removePlan(id: string) {
    return j<ForecastResponse>(fetch(`${API}/plans/${encodeURIComponent(id)}?subject=${this.subject}`,
      { method: "DELETE" }));
  }
  letter(language: string) {
    return j<LetterResponse>(fetch(`${API}/letter?subject=${this.subject}&language=${encodeURIComponent(language)}`));
  }
  async backtest() {
    try { return await j<BacktestSummary>(fetch(`${API}/backtest?subject=${this.subject}`)); } catch { return null; }
  }
  settings() { return j<Settings>(fetch(`${API}/settings`)); }
  saveSettings(s: Partial<Settings>) {
    return j<Settings>(fetch(`${API}/settings`, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(s) }));
  }
  importFile(f: File, subject: string) {
    const fd = new FormData();
    fd.append("file", f); fd.append("subject", subject);
    return j<ImportReport>(fetch(`${API}/import`, { method: "POST", body: fd }));
  }
  review(subject: string) { return j<ReviewRow[]>(fetch(`${API}/review?subject=${subject}`)); }
  async saveReview(rows: { id: string; category: string }[]) {
    await j(fetch(`${API}/review`, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(rows) }));
  }
  async confirmAnchors(subject: string, ids: string[]) {
    await j(fetch(`${API}/anchors`, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ subject, ids }) }));
  }
  health() { return j<Record<string, unknown>>(fetch(`${API}/health`)); }
}

/** Static demo: precomputed engine output + the browser simulator for any change (same draws). */
export class StaticProvider implements DataProvider {
  readonly mode = "static" as const;
  private base: ForecastResponse | null = null;
  private current: ForecastResponse | null = null;
  private lat: Lattice | null = null;
  private plans: PlanRow[] = [];
  private letters: Record<string, LetterResponse> | null = null;
  private settingsState: Settings = { broke_line_rupees: 150, risk_tolerance: 0.1, n_futures: 500,
    letter_language: "English", gemma_enabled: true, letters_enabled: true };
  constructor(private root = `${import.meta.env.BASE_URL}demo/`) {}

  private async load(): Promise<ForecastResponse> {
    if (!this.base) {
      this.base = await j<ForecastResponse>(fetch(`${this.root}forecast.json`));
      this.plans = this.base.plans.map((p) => ({ ...p }));
      this.current = this.base;
      if (this.base.sim) this.lat = new Lattice(this.base.sim);
    }
    return this.current!;
  }
  async forecast() { return this.load(); }

  private recompute(): ForecastResponse {
    const base = this.base!;
    const s = base.sim!;
    const lat = this.lat!;
    const unchanged = this.plans.length === base.plans.length &&
      this.plans.every((p, i) => p.id === base.plans[i].id && p.active === base.plans[i].active);
    if (unchanged) { this.current = base; return base; }
    const sp: SimPlan[] = this.plans.map((p) => ({ date: p.date, amount_paise: p.amount_paise, active: p.active }));
    const out = rollout(s, lat, { plans: sp });
    const n = out.firstBroke.length;
    const H = s.H;
    const made = madeIt(out);
    const sts = safeToSpend(s, lat, sp, base.risk_tolerance);
    const brokeDays: number[] = [];
    out.firstBroke.forEach((fb) => { if (fb >= 1 && fb <= H) brokeDays.push(fb); });
    brokeDays.sort((a, b) => a - b);
    const pick = (q: number) => brokeDays[Math.min(brokeDays.length - 1, Math.max(0, Math.round(q * (brokeDays.length - 1))))];
    const brokeDay = brokeDays.length && made / n <= 0.8
      ? { median: addDays(base.as_of, pick(0.5) - 1), lo80: addDays(base.as_of, pick(0.1) - 1), hi80: addDays(base.as_of, pick(0.9) - 1) }
      : null;
    const own = (plans: SimPlan[]) => meanRunway(rollout(s, lat, { plans, inflows: false }));
    const plansOut: PlanRow[] = this.plans.map((p) => {
      const others = sp.filter((_, i) => this.plans[i].id !== p.id);
      const w = own([...others, { date: p.date, amount_paise: p.amount_paise, active: true }]);
      const wo = own(others);
      const rw = madeIt(rollout(s, lat, { plans: [...others, { date: p.date, amount_paise: p.amount_paise, active: true }] }));
      const rwo = madeIt(rollout(s, lat, { plans: others }));
      return { ...p, day_cost: Math.round((wo - w) * 100) / 100, futures_delta: rw - rwo,
        in_horizon: p.date >= base.as_of && p.date < base.next_anchor_date };
    });
    const resp: ForecastResponse = {
      ...base,
      n_make_it: made, p_make_it: made / n, broke_day: brokeDay,
      safe_to_spend_paise: Math.round(sts.safeRupees * 100), nothing_safe: sts.nothingSafe, risk_now: sts.riskNow,
      paths: { days: base.paths.days, first_broke: Array.from(out.firstBroke),
        balances_paise: out.paths.map((p) => Array.from(p.slice(0, H + 1), (v) => Math.round(v * 100))) },
      band: percentileBand(out, H), plans: plansOut,
      runway_days_mean: meanRunway(rollout(s, lat, { plans: sp, inflows: false })),
      facts: {}, fact_ids: {},
    };
    (resp as ForecastResponse & { recomputedInBrowser?: boolean }).recomputedInBrowser = true;
    this.current = resp;
    return resp;
  }

  async togglePlan(id: string, active: boolean) {
    await this.load();
    this.plans = this.plans.map((p) => (p.id === id ? { ...p, active } : p));
    return this.recompute();
  }
  async addPlan(p: NewPlan) {
    await this.load();
    const id = `${p.name}-${p.date}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    this.plans = [...this.plans.filter((x) => x.id !== id),
      { id, name: p.name, amount_paise: p.amount_paise, date: p.date, active: true, day_cost: 0, futures_delta: 0, in_horizon: true }];
    return this.recompute();
  }
  async removePlan(id: string) {
    await this.load();
    this.plans = this.plans.filter((p) => p.id !== id);
    return this.recompute();
  }
  async letter(language: string) {
    if (!this.letters) this.letters = await j<Record<string, LetterResponse>>(fetch(`${this.root}letters.json`));
    return this.letters[language] ?? Object.values(this.letters)[0];
  }
  async backtest() {
    try { return await j<BacktestSummary>(fetch(`${this.root}backtest.json`)); } catch { return null; }
  }
  async settings() { return this.settingsState; }
  async saveSettings(s: Partial<Settings>) { this.settingsState = { ...this.settingsState, ...s }; return this.settingsState; }
}
