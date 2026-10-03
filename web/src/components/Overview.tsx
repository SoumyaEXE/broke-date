import { useEffect, useState } from "react";
import {
  ArrowsClockwise, Brain, CalendarCheck, CaretDown, ChartLineUp, Cpu, Info, Lightning, Plus, Receipt, ShieldCheck,
  Sparkle, Target, Timer, WifiSlash,
} from "@phosphor-icons/react";
import type { BacktestSummary, Fact, ForecastResponse } from "../types";
import type { DataProvider } from "../data/provider";
import { daysBetween, days, inr, pct, shortDate } from "../lib/format";
import { Bar, Card, CardHead, Delta, Empty, Legend, SeeAll, Toggle } from "./ui";
import { CatBadge, GROUP_META, catLabel } from "./icons";
import BalanceChart from "./BalanceChart";
import FuturesCanvas from "./FuturesCanvas";
import LetterCard from "./LetterCard";
import type { Page } from "./Sidebar";

interface Props {
  data: ForecastResponse; prev: ForecastResponse | null; busy: boolean; provider: DataProvider;
  onUpdate: (fn: () => Promise<ForecastResponse>) => Promise<void>;
  openFact: (id: string | undefined, pool?: Record<string, Fact>) => void;
  onAsk: (q?: string) => void; onPage: (p: Page) => void;
}

export function factId(d: ForecastResponse, kind: string, ref?: string): string | undefined {
  return Object.values(d.facts).find((f) => f.kind === kind && (ref === undefined || f.subject_ref === ref))?.id;
}

export default function Overview({ data, prev, busy, provider, onUpdate, openFact, onAsk, onPage }: Props) {
  const recomputed = (data as ForecastResponse & { recomputedInBrowser?: boolean }).recomputedInBrowser;
  const delta = prev && prev.as_of === data.as_of ? data.n_make_it - prev.n_make_it : 0;
  return (
    <div className="space-y-3">
      <Kpis data={data} delta={delta} openFact={openFact} onAsk={onAsk} />
      <div className="grid gap-3 xl:grid-cols-2">
        <SpentCard data={data} />
        <ChartCard data={data} prev={prev} recomputed={!!recomputed} />
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        <PlansCard data={data} busy={busy} provider={provider} onUpdate={onUpdate} openFact={openFact} onAsk={onAsk} onPage={onPage} />
        <TransactionsCard data={data} onPage={onPage} />
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        <ModelCard data={data} provider={provider} onPage={onPage} />
        <div className="grid gap-3">
          <RecurringCard data={data} />
          <LetterCard provider={provider} data={data} openFact={openFact} />
        </div>
      </div>
    </div>
  );
}

/* ---------------- KPI row ---------------- */
function Kpis({ data, delta, openFact, onAsk }: { data: ForecastResponse; delta: number; openFact: Props["openFact"]; onAsk: Props["onAsk"] }) {
  const n = data.n_futures;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div className="card p-5 relative overflow-hidden">
        <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full" style={{ background: "radial-gradient(closest-side,#efe9ff,transparent)" }} />
        <div className="relative flex items-center justify-between">
          <p className="text-[14px] text-ink-2">Safe to spend today</p>
          <button className="text-mute hover:text-ink" aria-label="how is this computed" onClick={() => openFact(data.fact_ids.safe_to_spend ?? factId(data, "safe_to_spend"))}><Info size={18} weight="duotone" /></button>
        </div>
        <p className="relative num text-[40px] leading-none font-semibold tracking-tight mt-3" aria-live="polite">
          {inr(data.nothing_safe ? 0 : data.safe_to_spend_paise)}
        </p>
        <p className="relative text-[13px] muted mt-2.5">
          {data.nothing_safe ? <>Over your {pct(data.risk_tolerance)} line already ({pct(data.risk_now)}).{data.marginal_spend_paise ? <> Up to <span className="font-medium text-ink">{inr(data.marginal_spend_paise)}</span> adds under 2 pts of risk.</> : null}</>
            : <>keeps broke risk ≤ {pct(data.risk_tolerance)} · now <span className="text-ink-2 font-medium">{pct(data.risk_now)}</span></>}
        </p>
        <button onClick={() => onAsk("How much is safe today?")} className="relative mt-3 text-[13px] font-medium text-brand inline-flex items-center gap-1 hover:opacity-80">
          <Sparkle size={14} weight="duotone" /> Ask why
        </button>
      </div>
      <div className="card p-5">
        <div className="flex items-center justify-between">
          <p className="text-[14px] text-ink-2">Futures that make it</p>
          <button className="text-mute hover:text-ink" aria-label="details" onClick={() => openFact(factId(data, "n_make_it"))}><Info size={18} weight="duotone" /></button>
        </div>
        <p className="num text-[40px] leading-none font-semibold tracking-tight mt-3">
          {data.n_make_it}<span className="text-[18px] text-mute font-medium"> / {n}</span>
        </p>
        <div className="mt-3 flex items-center gap-2">
          <div className="flex-1"><Bar value={data.n_make_it / n} color="#7c5cfc" track="#ffe9da" /></div>
          {delta !== 0 && <Delta value={delta} />}
        </div>
        <p className="text-[13px] muted mt-2">{n - data.n_make_it} futures dip below {inr(data.broke_line_paise)} first</p>
      </div>
      <div className="card p-5">
        <p className="text-[14px] text-ink-2">Allowance lands</p>
        <p className="num text-[40px] leading-none font-semibold tracking-tight mt-3">{daysBetween(data.as_of, data.next_anchor_date)}<span className="text-[18px] text-mute font-medium"> days</span></p>
        <p className="text-[13px] muted mt-3">{shortDate(data.next_anchor_date)}{data.next_anchor_known ? "" : " (predicted)"} · balance {inr(data.balance_now_paise)}</p>
        {data.broke_day && <p className="text-[13px] mt-1">Broke risk peaks around <span className="font-medium text-warn">{shortDate(data.broke_day.median)}</span></p>}
      </div>
      <div className="card p-5">
        <div className="flex items-center justify-between">
          <p className="text-[14px] text-ink-2">Your money alone lasts</p>
          <button className="text-mute hover:text-ink" aria-label="details" onClick={() => openFact(factId(data, "runway_days"))}><Info size={18} weight="duotone" /></button>
        </div>
        <p className="num text-[40px] leading-none font-semibold tracking-tight mt-3">{data.runway_days_mean.toFixed(1)}<span className="text-[18px] text-mute font-medium"> days</span></p>
        <p className="text-[13px] muted mt-3">No help from anyone, allowance not counted</p>
      </div>
    </div>
  );
}

/* ---------------- Spending this month (allocation) ---------------- */
function SpentCard({ data }: { data: ForecastResponse }) {
  const c = data.context?.cycle;
  if (!c) return <Card><Empty>No spending context.</Empty></Card>;
  const total = c.groups.reduce((s, g) => s + g.spent_paise, 0) || 1;
  const diff = c.typical_spent_paise != null ? c.spent_paise - c.typical_spent_paise : null;
  return (
    <Card>
      <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-line">
        <div>
          <p className="text-[14px] text-ink-2">Spent since allowance</p>
          <p className="num text-[26px] font-semibold tracking-tight mt-1">{inr(c.spent_paise)}</p>
          {diff !== null && (
            <p className="text-[13px] mt-0.5">
              <span className={diff > 0 ? "text-bad" : "text-good"}>{diff > 0 ? "+" : ""}{inr(diff)}</span>
              <span className="muted"> vs a typical month by day {c.day_in_cycle}</span>
            </p>
          )}
        </div>
        <span className="pill"><CalendarCheck size={16} weight="duotone" className="text-mute" />Since {shortDate(c.start)}</span>
      </div>
      <div className="px-5 pt-4 pb-3">
        <p className="text-[14px] font-medium mb-3">Allocation</p>
        <div className="flex h-7 w-full gap-1">
          {c.groups.filter((g) => g.spent_paise > 0).map((g) => (
            <div key={g.group} className="h-full rounded-lg transition-all" title={`${g.group} ${inr(g.spent_paise)}`}
                 style={{ width: `${(g.spent_paise / total) * 100}%`, background: GROUP_META[g.group]?.color ?? "#ccc", minWidth: 10 }} />
          ))}
          {c.spent_paise === 0 && <div className="h-full w-full rounded-lg bg-line-2" />}
        </div>
      </div>
      <ul className="divide-soft">
        {c.groups.map((g) => {
          const meta = GROUP_META[g.group];
          const I = meta.Icon;
          const share = c.spent_paise ? g.spent_paise / c.spent_paise : 0;
          const vs = g.typical_paise ? g.spent_paise / g.typical_paise - 1 : null;
          return (
            <li key={g.group} className="flex items-center gap-3.5 px-5 py-3.5">
              <span className="icon-badge"><I size={20} weight="duotone" style={{ color: meta.color }} /></span>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] flex items-center gap-1.5"><span className="inline-block h-3.5 w-[3px] rounded" style={{ background: meta.color }} />{g.group}</p>
                <p className="text-[13px] text-bad num">-{inr(g.spent_paise)} <span className="muted">spent · {g.n_txns} txns</span></p>
              </div>
              <div className="text-right">
                <p className="text-[14px] num"><span className="text-good">{pct(share)}</span> <span className="muted">of spend</span></p>
                <p className="text-[13px] muted num">{g.typical_paise != null ? <>typical {inr(g.typical_paise)}{vs !== null && Math.abs(vs) > 0.05 && <span className={vs > 0 ? "text-bad" : "text-good"}> ({vs > 0 ? "+" : ""}{Math.round(vs * 100)}%)</span>}</> : "—"}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/* ---------------- Chart: this vs last month | 500 futures ---------------- */
function ChartCard({ data, prev, recomputed }: { data: ForecastResponse; prev: ForecastResponse | null; recomputed: boolean }) {
  const [mode, setMode] = useState<"month" | "futures">("month");
  const lastLabel = data.context?.balance_compare.last?.label;
  return (
    <Card>
      <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-line gap-3">
        <div>
          <p className="text-[14px] text-ink-2">{mode === "month" ? "Balance this month" : `${data.n_futures} simulated futures`}</p>
          <p className="num text-[26px] font-semibold tracking-tight mt-1">{mode === "month" ? inr(data.balance_now_paise) : `${data.n_make_it} make it`}</p>
        </div>
        <div className="relative">
          <select value={mode} onChange={(e) => setMode(e.target.value as "month" | "futures")}
                  className="pill appearance-none pr-8 cursor-pointer" aria-label="chart view">
            <option value="month">This month vs. last month</option>
            <option value="futures">All {data.n_futures} futures</option>
          </select>
          <CaretDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      </div>
      <div className="px-5 py-3 flex flex-wrap gap-x-5 gap-y-1 border-b border-line">
        {mode === "month" ? <>
          <Legend color="#f97316" label="This month" />
          <Legend color="#f97316" label="TabPFN forecast (median, 80% band)" dashed />
          {lastLabel && <Legend color="#121316" label={`Last month (${lastLabel})`} dashed />}
        </> : <>
          <Legend color="#7c5cfc" label={`Made it · ${data.n_make_it}`} />
          <Legend color="#f97316" label={`Went broke · ${data.n_futures - data.n_make_it}`} />
        </>}
      </div>
      <div className="px-3 pt-3 pb-2">
        {mode === "month" ? <BalanceChart data={data} /> : <FuturesCanvas data={data} prev={prev} />}
        {recomputed && <p className="text-[12px] muted px-2 pb-1">Recomputed in your browser from the same {data.n_futures} futures and random draws as the engine.</p>}
      </div>
    </Card>
  );
}

/* ---------------- Plans ---------------- */
function PlansCard({ data, busy, provider, onUpdate, openFact, onAsk, onPage }: Omit<Props, "prev">) {
  const H = Math.max(data.horizon_days, 1);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(data.as_of);
  return (
    <Card>
      <CardHead icon={<Target size={18} weight="duotone" />} title="Plans" sub="Toggle one to see what it does to your month"
        action={<div className="flex items-center gap-3">
          <button className="btn-ghost !py-1.5 text-[14px]" onClick={() => setAdding((a) => !a)}><Plus size={15} weight="bold" />Add</button>
          <SeeAll onClick={() => onPage("plans")} />
        </div>} />
      {adding && (
        <form className="grid grid-cols-2 sm:grid-cols-[1fr_7rem_9rem_auto] gap-2 px-5 py-3 border-b border-line"
              onSubmit={async (e) => { e.preventDefault(); const r = Number(amount); if (!name.trim() || !(r > 0)) return;
                await onUpdate(() => provider.addPlan({ name: name.trim(), amount_paise: Math.round(r * 100), date })); setName(""); setAmount(""); setAdding(false); }}>
          <input className="input col-span-2 sm:col-span-1" placeholder="What? e.g. Momo + movie" value={name} onChange={(e) => setName(e.target.value)} aria-label="plan name" />
          <input className="input num" placeholder="₹ amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="amount" />
          <input className="input num" type="date" value={date} min={data.as_of} onChange={(e) => setDate(e.target.value)} aria-label="date" />
          <button className="btn-primary" disabled={busy}>Price it</button>
        </form>
      )}
      {data.plans.length === 0 ? (
        <Empty>Nothing planned. Add a Saturday, or ask “can I afford ₹400 movie on Saturday?”</Empty>
      ) : (
        <ul className="divide-soft">
          {data.plans.map((p) => {
            const f = Math.min(p.day_cost / H, 1);
            return (
              <li key={p.id} className="flex items-center gap-3.5 px-5 py-3.5">
                <CatBadge category={/movie|cinema|popcorn/i.test(p.name) ? "outing" : /biryani|food|momo|treat/i.test(p.name) ? "food_delivery" : /phone|earphone|headphone|shoe|shirt/i.test(p.name) ? "shopping" : "other"} />
                <div className="min-w-0 w-[34%]">
                  <p className={`text-[15px] truncate ${p.active ? "" : "text-ink-2"}`}>{p.name}</p>
                  <p className="text-[13px] muted num">{inr(p.amount_paise)} · {shortDate(p.date)}</p>
                </div>
                <div className="flex-1 min-w-[70px] hidden sm:block">
                  <Bar value={f} color={p.active ? "#f97316" : "#c9bbff"} knob={<span className="block h-4 w-4 rounded-full border-[3px] bg-white" style={{ borderColor: p.active ? "#f97316" : "#c9bbff" }} />} />
                </div>
                <button onClick={() => openFact(factId(data, "plan_day_cost", `plan:${p.id}`))}
                        className="num text-[14px] font-medium w-[78px] text-right" style={{ color: p.active ? "#f97316" : "#7c5cfc" }}
                        title="Price in days: how much sooner your own money runs out with this plan">{days(p.day_cost)}</button>
                <span className="hidden md:inline-flex text-[12px] muted num w-[86px] justify-end"><Lightning size={14} weight="duotone" className="mr-1" />{p.futures_delta === 0 ? "no change" : `${Math.abs(p.futures_delta)} futures`}</span>
                <Toggle on={p.active} disabled={busy} label={`${p.active ? "Skip" : "Do"} ${p.name}`} onChange={() => onUpdate(() => provider.togglePlan(p.id, !p.active))} />
              </li>
            );
          })}
        </ul>
      )}
      <div className="px-5 py-3 border-t border-line flex items-center justify-between">
        <p className="text-[12px] muted">Price in days = how much sooner your own money runs out.</p>
        <button className="text-[13px] font-medium text-brand inline-flex items-center gap-1" onClick={() => onAsk("Can I afford ₹400 on Saturday?")}><Sparkle size={14} weight="duotone" />Ask instead</button>
      </div>
    </Card>
  );
}

/* ---------------- Transactions ---------------- */
function TransactionsCard({ data, onPage }: { data: ForecastResponse; onPage: (p: Page) => void }) {
  const regained = new Map(data.recent.map((r) => [r.txn_id, r.days_regained]));
  const tx = (data.context?.transactions ?? []).slice(0, 6);
  return (
    <Card>
      <CardHead icon={<Receipt size={18} weight="duotone" />} title="Transactions" sub="Last week · what each one cost you in days" action={<SeeAll onClick={() => onPage("activity")} />} />
      {tx.length === 0 ? <Empty>No transactions yet.</Empty> : (
        <ul className="divide-soft">
          {tx.map((t) => {
            const credit = t.direction === "CREDIT";
            const rg = regained.get(t.id);
            return (
              <li key={t.id} className="flex items-center gap-3.5 px-5 py-3">
                <CatBadge category={t.category} />
                <p className="flex-1 min-w-0 text-[15px] truncate">{t.merchant}</p>
                <span className="tag hidden sm:inline-flex">{catLabel(t.category)}</span>
                <p className={`num text-[15px] w-[92px] text-right font-medium ${credit ? "text-good" : "text-bad"}`}>{credit ? "+" : "−"}{inr(t.amount_paise)}</p>
                <span className="hidden md:inline-flex w-[84px] justify-end">{rg !== undefined ? <span className="tag !bg-good-2 !text-good num">+{days(rg)}</span> : <span className="text-[12px] muted num">{shortDate(t.date)}</span>}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/* ---------------- TabPFN under the hood ---------------- */
function ModelCard({ data, provider, onPage }: { data: ForecastResponse; provider: DataProvider; onPage: (p: Page) => void }) {
  const [bt, setBt] = useState<BacktestSummary | null>(null);
  useEffect(() => { void provider.backtest().then(setBt); }, [provider]);
  const m = data.model;
  const t = m.timings_s ?? {};
  const best = bt ? Object.entries(bt.models).filter(([k]) => ["B1", "B2", "B3"].includes(k)).sort((a, b) => a[1].brier.point - b[1].brier.point)[0] : null;
  const rows: { Icon: typeof Brain; name: string; sub: string; value: string; chip?: { text: string; good?: boolean } }[] = [
    { Icon: Brain, name: "Spend model · TabPFN", sub: `${m.model_version || "tabpfn"} · 99 quantiles per state`, value: `${m.lattice_rows.toLocaleString("en-IN")} states`, chip: t.lattice ? { text: `${t.lattice.toFixed(0)}s`, good: true } : undefined },
    { Icon: Target, name: "Anchor · TabPFN direct model", sub: "remaining spend to payday, level-matched", value: m.anchored ? "on" : "off", chip: { text: m.anchored ? "anchored" : "raw", good: m.anchored } },
    { Icon: ArrowsClockwise, name: "Futures simulated", sub: `same random draws for every what-if · seed ${data.seed}`, value: `${data.n_futures}`, chip: { text: `${m.n_history_days} days learned`, good: true } },
    ...(bt && best ? [{ Icon: ShieldCheck, name: "Self-graded on past months", sub: `Brier vs best baseline (${best[0]}), ${bt.n_cycles} months`, value: bt.models.M1.brier.point.toFixed(3), chip: { text: `${best[1].brier.point.toFixed(3)} base`, good: bt.models.M1.brier.point < best[1].brier.point } }] : []),
    { Icon: WifiSlash, name: "Runs offline", sub: "test suite passes with network blocked", value: "local", chip: { text: "127.0.0.1", good: true } },
  ];
  return (
    <Card>
      <CardHead icon={<Cpu size={18} weight="duotone" />} title="Under the hood" sub="Every number above is computed here, on this machine" action={<SeeAll label="How good am I?" onClick={() => onPage("grade")} />} />
      <ul className="divide-soft">
        {rows.map((r) => (
          <li key={r.name} className="flex items-center gap-3.5 px-5 py-3.5">
            <span className="icon-badge" style={{ background: "#f4f0ff", borderColor: "#ebe4ff" }}><r.Icon size={20} weight="duotone" className="text-brand" /></span>
            <div className="flex-1 min-w-0">
              <p className="text-[15px] truncate">{r.name}</p>
              <p className="text-[12.5px] muted truncate">{r.sub}</p>
            </div>
            <p className="num text-[15px] font-medium">{r.value}</p>
            {r.chip && <span className="mono text-[12px] rounded-full px-2 py-0.5 w-[92px] text-center truncate" style={{ background: r.chip.good ? "#e7f6ee" : "#fdecec", color: r.chip.good ? "#12a150" : "#e5484d" }}>{r.chip.text}</span>}
          </li>
        ))}
      </ul>
      <div className="px-5 py-3 border-t border-line flex items-center gap-2 text-[12px] muted">
        <Timer size={14} weight="duotone" /> forecast prepared in <span className="num text-ink-2">{(t.prepare_total ?? 0).toFixed(1)}s</span>; every toggle after that reruns {data.n_futures} futures in milliseconds.
        <ChartLineUp size={14} weight="duotone" className="ml-auto" />
      </div>
    </Card>
  );
}

/* ---------------- Recurring ---------------- */
function RecurringCard({ data }: { data: ForecastResponse }) {
  const rec = data.context?.recurring ?? [];
  return (
    <Card>
      <CardHead icon={<ArrowsClockwise size={18} weight="duotone" />} title="Recurring" sub="Detected from your statement, already in every future" />
      {rec.length === 0 ? <Empty>No recurring payments detected.</Empty> : (
        <ul className="divide-soft">
          {rec.map((r) => (
            <li key={r.name + r.amount_paise} className="flex items-center gap-3.5 px-5 py-3">
              <CatBadge category="recharge_bills" />
              <p className="flex-1 text-[15px] truncate">{r.name}</p>
              <span className="tag">Every {r.period_days} days</span>
              <p className="num text-[15px] font-medium w-[72px] text-right">{inr(r.amount_paise)}</p>
              <span className="text-[12.5px] muted num w-[64px] text-right">{shortDate(r.next_date)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
