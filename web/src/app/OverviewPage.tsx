import { useEffect, useState } from "react";
import {
  ArrowsClockwise, Brain, ChartLineUp, Cpu, Hourglass, Lightning, Receipt, ShieldCheck, Target,
  Timer, Wallet, WifiSlash,
} from "@phosphor-icons/react";
import { StatCards, type Stat } from "@/components/application/dashboard/stat-cards";
import { Button } from "@/components/base/buttons/button";
import { Chip } from "@/components/base/badges/chip";
import type { BacktestSummary, Fact, ForecastResponse } from "../types";
import type { DataProvider } from "../data/provider";
import { daysBetween, days, inr, pct, shortDate } from "../lib/format";
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
      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <BalanceChartCard data={data} />
        <PlansPanel {...p} compact />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <TransactionsPanel data={data} go={p.go} />
        <EnginePanel data={data} provider={p.provider} go={p.go} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <LetterPanel provider={p.provider} data={data} openFact={p.openFact} />
        <RecurringPanel data={data} />
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
      caption: d.nothing_safe ? `Over your ${pct(d.risk_tolerance)} line · +2 pts max` : `Keeps broke risk ≤ ${pct(d.risk_tolerance)}`,
      delta: `${pct(d.risk_now)} risk`, deltaColor: d.risk_now <= d.risk_tolerance ? "lime" : "rose",
      hint: "The largest extra spend today that keeps the share of simulated futures going broke before payday at or below your risk setting. Found by bisection on the same 500 futures.",
    },
    {
      icon: duo(ChartLineUp), tone: "blue", label: "Futures that make it",
      value: `${d.n_make_it} / ${n}`, caption: madeDelta !== null ? "Change from your last edit" : `${n - d.n_make_it} go broke first`,
      delta: madeDelta !== null ? `${madeDelta > 0 ? "+" : ""}${madeDelta}` : pct(d.p_make_it),
      deltaColor: madeDelta !== null ? (madeDelta > 0 ? "lime" : madeDelta < 0 ? "rose" : "neutral") : d.p_make_it >= 0.9 ? "lime" : "rose",
      hint: "TabPFN simulated this many versions of the rest of your month from your own history. These stay above the broke line until your allowance lands.",
    },
    {
      icon: duo(Hourglass), tone: "orange", label: "Allowance lands in",
      value: `${left} days`, caption: `${shortDate(d.next_anchor_date)}${d.next_anchor_known ? "" : " (predicted)"} · ${inr(d.balance_now_paise)} now`,
      delta: d.broke_day ? `risk ${shortDate(d.broke_day.median)}` : "on track", deltaColor: d.broke_day ? "rose" : "lime",
      hint: "When your next allowance is due, from the dates it arrived in past months.",
    },
    {
      icon: duo(Timer), tone: "emerald", label: "Your money alone lasts",
      value: days(d.runway_days_mean), caption: "No help, allowance not counted",
      delta: `${spare >= 0 ? "+" : ""}${spare.toFixed(1)} d`, deltaColor: spare >= 0 ? "lime" : "rose",
      hint: "Average over the futures of how many days your own money lasts with nobody helping out. The delta is the margin over the days left until your allowance.",
    },
  ];
}

/* ---------------- Transactions ---------------- */
function TransactionsPanel({ data, go }: { data: ForecastResponse; go: (r: Route) => void }) {
  const regained = new Map(data.recent.map((r) => [r.txn_id, r.days_regained]));
  const tx = (data.context?.transactions ?? []).slice(0, 6);
  return (
    <Panel title="Transactions" sub="What each recent spend cost you, in days" icon={Receipt} flush
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
    { icon: Brain, name: "TabPFN spend model", sub: `${m.model_version || "tabpfn"} · 99 quantiles for every state`, value: `${m.lattice_rows.toLocaleString("en-IN")} states`, chip: t.lattice ? `${t.lattice.toFixed(0)} s` : null },
    { icon: Target, name: "TabPFN direct model", sub: "remaining spend to payday anchors the futures", value: m.anchored ? "Anchored" : "Raw", chip: m.calibrated ? `k ${m.spread_k}` : "k 1.0" },
    { icon: ArrowsClockwise, name: "Simulated futures", sub: `same random draws for every what-if · seed ${data.seed}`, value: `${data.n_futures}`, chip: `${m.n_history_days} days` },
    ...(bt && best ? [{ icon: ShieldCheck, name: "Graded on past months", sub: `Brier score vs best baseline, ${bt.n_cycles} months`, value: bt.models.M1.brier.point.toFixed(3), chip: `${best[0]} ${best[1].brier.point.toFixed(3)}` }] : []),
    { icon: WifiSlash, name: "Runs offline", sub: "tests pass with the network blocked", value: "127.0.0.1", chip: null },
  ];
  return (
    <Panel title="Under the hood" sub="Every number on this page is computed on this machine" icon={Cpu} flush
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
      <p className="flex items-center gap-1.5 border-t border-separator-border px-4 py-2.5 text-body-2-medium text-text-tertiary">
        <Lightning weight="duotone" className="size-4" aria-hidden />
        Prepared in {(t.prepare_total ?? 0).toFixed(1)} s; every toggle after that reruns {data.n_futures} futures in milliseconds.
      </p>
    </Panel>
  );
}

/* ---------------- Recurring ---------------- */
function RecurringPanel({ data }: { data: ForecastResponse }) {
  const rec = data.context?.recurring ?? [];
  return (
    <Panel title="Recurring" sub="Found in your statement and already in every future" icon={ArrowsClockwise} flush>
      {rec.length === 0 ? <Empty>No recurring payments detected.</Empty> : (
        <Rows>
          {rec.map((r) => (
            <Row key={r.name + r.amount_paise}>
              <Tile icon={catIcon("recharge_bills")} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-body-medium text-text-primary">{r.name}</p>
                <p className="text-body-2-medium text-text-tertiary">seen {r.n_seen} times</p>
              </div>
              <Chip variant="caption" color="neutral">Every {r.period_days} days</Chip>
              <p className="w-20 text-end text-body-medium tabular-nums">{inr(r.amount_paise)}</p>
              <p className="hidden w-16 text-end text-body-2-medium text-text-tertiary sm:block">{shortDate(r.next_date)}</p>
            </Row>
          ))}
        </Rows>
      )}
    </Panel>
  );
}

