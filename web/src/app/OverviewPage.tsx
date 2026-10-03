import { useEffect, useState } from "react";
import {
  ArrowsClockwise, Brain, ChartLineUp, ChartPieSlice, Coins, Cpu, Hourglass, Popcorn, Receipt, ShieldCheck, ShoppingBag,
  Target, Timer, UsersThree, Wallet, WifiSlash, type Icon as PhosphorIcon,
} from "@phosphor-icons/react";
import { cx } from "@/utils/cx";
import { StatCards, type Stat } from "@/components/application/dashboard/stat-cards";
import { Button } from "@/components/base/buttons/button";
import { Chip } from "@/components/base/badges/chip";
import type { BacktestSummary, Fact, ForecastResponse } from "../types";
import type { DataProvider } from "../data/provider";
import { daysBetween, days, inr, inr0, pct, shortDate } from "../lib/format";
import { BalanceChartCard } from "./BalanceChartCard";
import { Empty, Panel, Row, Rows, Tile, duo } from "./kit";
import { PlansPanel } from "./PlansPanel";
import { LetterPanel } from "./LetterPanel";
import { catIcon, catLabel } from "./categories";
import type { Route } from "../App";

export interface PageProps {
  data: ForecastResponse; prev: ForecastResponse | null; busy: boolean; provider: DataProvider;
  onUpdate: (fn: () => Promise<ForecastResponse>) => Promise<void>;
  openFact: (id: string | undefined, pool?: Record<string, Fact>) => void;
  onAsk: (q?: string) => void; go: (r: Route) => void;
}

export function factId(d: ForecastResponse, kind: string, ref?: string): string | undefined {
  return Object.values(d.facts).find((f) => f.kind === kind && (ref === undefined || f.subject_ref === ref))?.id;
}

export function OverviewPage(p: PageProps) {
  const { data } = p;
  return (
    <>
      <StatCards variant="footer" stats={kpis(data, p.prev)} />
      <div className="grid gap-4 xl:grid-cols-[1.45fr_1fr]">
        <BalanceChartCard data={data} />
        <WherePanel data={data} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <PlansPanel {...p} compact />
        <LetterPanel provider={p.provider} data={data} openFact={p.openFact} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <TransactionsPanel data={data} go={p.go} />
        <EnginePanel data={data} provider={p.provider} go={p.go} />
      </div>
    </>
  );
}

function kpis(d: ForecastResponse, prev: ForecastResponse | null): Stat[] {
  const n = d.n_futures;
  const left = daysBetween(d.as_of, d.next_anchor_date);
  const madeDelta = prev && prev.as_of === d.as_of ? d.n_make_it - prev.n_make_it : null;
  const spare = d.runway_days_mean - left;
  return [
    {
      icon: duo(Wallet), tone: "purple", label: "Safe to spend today",
      value: inr(d.nothing_safe ? (d.marginal_spend_paise ?? 0) : d.safe_to_spend_paise),
      caption: d.nothing_safe ? "Small extra only" : `Risk cap ${pct(d.risk_tolerance)}`,
      delta: `${pct(d.risk_now)} risk`, deltaColor: d.risk_now <= d.risk_tolerance ? "lime" : "rose",
      hint: "The largest extra spend today that keeps the share of simulated futures going broke before payday at or below your risk setting. Found by bisection on the same 500 futures.",
    },
    {
      icon: duo(ChartLineUp), tone: "blue", label: "Futures that make it",
      value: `${d.n_make_it} / ${n}`, caption: madeDelta !== null ? "Since last edit" : `${n - d.n_make_it} go broke`,
      delta: madeDelta !== null ? `${madeDelta > 0 ? "+" : ""}${madeDelta}` : pct(d.p_make_it),
      deltaColor: madeDelta !== null ? (madeDelta > 0 ? "lime" : madeDelta < 0 ? "rose" : "neutral") : d.p_make_it >= 0.9 ? "lime" : "rose",
      hint: "TabPFN simulated this many versions of the rest of your month from your own history. These stay above the broke line until your allowance lands.",
    },
    {
      icon: duo(Hourglass), tone: "orange", label: "Allowance lands in",
      value: `${left} days`, caption: `${shortDate(d.next_anchor_date)}${d.next_anchor_known ? "" : " · predicted"}`,
      delta: d.broke_day ? `risk ${shortDate(d.broke_day.median)}` : "on track", deltaColor: d.broke_day ? "rose" : "lime",
      hint: "When your next allowance is due, from the dates it arrived in past months.",
    },
    {
      icon: duo(Timer), tone: "emerald", label: "Your money alone lasts",
      value: days(d.runway_days_mean), caption: "Without top-ups",
      delta: `${spare >= 0 ? "+" : ""}${spare.toFixed(1)} d`, deltaColor: spare >= 0 ? "lime" : "rose",
      hint: "Average over the futures of how many days your own money lasts with nobody helping out. The delta is the margin over the days left until your allowance.",
    },
  ];
}

/* ---------------- Transactions ---------------- */
function TransactionsPanel({ data, go }: { data: ForecastResponse; go: (r: Route) => void }) {
  const regained = new Map(data.recent.map((r) => [r.txn_id, r.days_regained]));
  const tx = (data.context?.transactions ?? []).slice(0, 5);
  return (
    <Panel title="Transactions" icon={Receipt} flush
           action={<Button variant="ghost" size="xs" onClick={() => go("activity")}>See all</Button>}>
      {tx.length === 0 ? <Empty>No transactions yet.</Empty> : (
        <Rows>
          {tx.map((t) => {
            const credit = t.direction === "CREDIT";
            const rg = regained.get(t.id);
            return (
              <Row key={t.id}>
                <Tile icon={catIcon(t.category)} tone={credit ? "lime" : "neutral"} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body-medium text-text-primary">{t.merchant}</p>
                  <p className="truncate text-body-2-medium text-text-tertiary">{catLabel(t.category)} · {shortDate(t.date)}</p>
                </div>
                {rg !== undefined && rg > 0.04 && <Chip variant="caption" color="lime" className="hidden sm:inline-flex">+{days(rg)} if skipped</Chip>}
                <p className={`w-24 text-end text-body-medium tabular-nums ${credit ? "text-status-lime-text" : "text-text-primary"}`}>{credit ? "+" : "−"}{inr(t.amount_paise)}</p>
              </Row>
            );
          })}
        </Rows>
      )}
    </Panel>
  );
}

/* ---------------- Engine (TabPFN under the hood) ---------------- */
function EnginePanel({ data, provider, go }: { data: ForecastResponse; provider: DataProvider; go: (r: Route) => void }) {
  const [bt, setBt] = useState<BacktestSummary | null>(null);
  useEffect(() => { void provider.backtest().then(setBt); }, [provider]);
  const m = data.model;
  const t = m.timings_s ?? {};
  const best = bt ? Object.entries(bt.models).filter(([k]) => ["B1", "B2", "B3"].includes(k)).sort((a, b) => a[1].brier.point - b[1].brier.point)[0] : null;
  const rows = [
    { icon: Brain, name: "TabPFN spend model", sub: `${m.model_version || "tabpfn"} · 99 quantiles`, value: `${m.lattice_rows.toLocaleString("en-IN")} states`, chip: t.lattice ? `${t.lattice.toFixed(0)} s` : null },
    { icon: Target, name: "TabPFN direct model", sub: "spend to payday", value: m.anchored ? "Anchored" : "Raw", chip: m.calibrated ? `k ${m.spread_k}` : "k 1.0" },
    { icon: ArrowsClockwise, name: "Simulated futures", sub: `seed ${data.seed}`, value: `${data.n_futures}`, chip: `${m.n_history_days} days` },
    ...(bt && best ? [{ icon: ShieldCheck, name: "Graded on past months", sub: `Brier · ${bt.n_cycles} months`, value: bt.models.M1.brier.point.toFixed(3), chip: `${best[0]} ${best[1].brier.point.toFixed(3)}` }] : []),
    { icon: WifiSlash, name: "Runs offline", sub: "no network at runtime", value: "127.0.0.1", chip: null },
  ];
  return (
    <Panel title="Under the hood" sub="Computed on this machine" icon={Cpu} flush
           action={<Button variant="ghost" size="xs" onClick={() => go("grade")}>How good am I?</Button>}>
      <Rows>
        {rows.map((r) => (
          <Row key={r.name}>
            <Tile icon={r.icon} tone="accent" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-body-medium text-text-primary">{r.name}</p>
              <p className="truncate text-body-2-medium text-text-tertiary">{r.sub}</p>
            </div>
            <p className="text-body-medium text-text-primary tabular-nums">{r.value}</p>
            {r.chip && <Chip variant="caption" color="neutral" className="hidden w-20 sm:inline-flex">{r.chip}</Chip>}
          </Row>
        ))}
      </Rows>
    </Panel>
  );
}

/* ---------------- Where it went (groups vs typical + recurring) ---------------- */
const GROUP_TONE: Record<string, string> = {
  "Essentials": "bg-accent-500", "Lifestyle": "bg-orange-500", "Friends & family": "bg-sky-500", "Cash & other": "bg-neutral-400",
};
const GROUP_ICON: Record<string, PhosphorIcon> = { "Essentials": ShoppingBag, "Lifestyle": Popcorn, "Friends & family": UsersThree, "Cash & other": Coins };

function WherePanel({ data }: { data: ForecastResponse }) {
  const c = data.context?.cycle;
  const rec = data.context?.recurring ?? [];
  if (!c) return <Panel title="Where it went" icon={ChartPieSlice}><Empty>No spending yet this month.</Empty></Panel>;
  const groups = c.groups.filter((g) => g.spent_paise > 0 || (g.typical_paise ?? 0) > 0);
  const total = Math.max(c.spent_paise, 1);
  const vs = c.typical_spent_paise ? c.spent_paise - c.typical_spent_paise : null;
  return (
    <Panel title="Where it went" sub={`This month vs your typical first ${c.day_in_cycle} days, over ${c.n_past_cycles} past months`} icon={ChartPieSlice} flush
      action={vs !== null && <Chip variant="caption" color={vs > 0 ? "rose" : "lime"}>{vs > 0 ? "+" : "−"}{inr0(Math.abs(vs))} vs typical</Chip>}>
      <div className="px-4 pt-4">
        <p className="text-title-2-medium text-text-primary tabular-nums">{inr(c.spent_paise)}<span className="ms-2 text-body-medium text-text-tertiary">spent in {c.day_in_cycle} days</span></p>
        <div className="mt-3 flex h-2.5 gap-0.5 overflow-hidden rounded-full">
          {groups.filter((g) => g.spent_paise > 0).map((g) => (
            <span key={g.group} className={cx("h-full first:rounded-s-full last:rounded-e-full", GROUP_TONE[g.group] ?? "bg-neutral-400")} style={{ width: `${(g.spent_paise / total) * 100}%` }} />
          ))}
        </div>
      </div>
      <Rows>
        {groups.map((g) => {
          const over = g.typical_paise !== null && g.spent_paise > g.typical_paise * 1.15;
          return (
            <Row key={g.group}>
              <span className={cx("size-2 shrink-0 rounded-full", GROUP_TONE[g.group] ?? "bg-neutral-400")} aria-hidden />
              <Tile icon={GROUP_ICON[g.group] ?? Coins} />
              <p className="min-w-0 flex-1 truncate text-body-medium text-text-primary">{g.group}</p>
              <p className="hidden text-body-2-medium text-text-tertiary tabular-nums sm:block">typical {g.typical_paise !== null ? inr0(g.typical_paise) : "–"}</p>
              <p className={cx("w-20 text-end text-body-medium tabular-nums", over ? "text-status-rose-text" : "text-text-primary")}>{inr(g.spent_paise)}</p>
            </Row>
          );
        })}
        {rec.map((r) => (
          <Row key={r.name + r.amount_paise}>
            <span className="size-2 shrink-0" aria-hidden />
            <Tile icon={ArrowsClockwise} tone="accent" />
            <p className="min-w-0 flex-1 truncate text-body-medium text-text-primary">{r.name}</p>
            <Chip variant="caption" color="neutral">every {r.period_days} d · next {shortDate(r.next_date)}</Chip>
            <p className="w-20 text-end text-body-medium tabular-nums">{inr(r.amount_paise)}</p>
          </Row>
        ))}
      </Rows>
    </Panel>
  );
}
