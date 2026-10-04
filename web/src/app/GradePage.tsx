import { useEffect, useState } from "react";
import { ChartBar, Crosshair, Scales, SealCheck, Timer, WarningCircle } from "@phosphor-icons/react";
import { StatCards, type Stat } from "@/components/application/dashboard/stat-cards";
import { Table, TableBody, TableCell as Cell, TableColumn as Column, TableHeader, TableRow as TRow } from "@/components/base/table/table";
import { Chip } from "@/components/base/badges/chip";
import type { BacktestSummary, CI } from "../types";
import type { DataProvider } from "../data/provider";
import { Panel, Row, Rows, Tile, duo } from "./kit";
import { TimeMachine } from "./TimeMachine";

const NAMES: Record<string, [string, string]> = {
  M1: ["TabPFN (this app)", "full method"],
  M1a: ["TabPFN without anchoring", "one part removed, to check it helps"],
  M1b: ["TabPFN without calibration", "one part removed, to check it helps"],
  B1: ["Spending pace", "assumes the last 14 days repeat"],
  B2: ["Copy last month", "assumes this month repeats the last"],
  B3: ["LightGBM", "a standard ML model in the same simulator"],
};
const f = (c: CI | null | undefined, d = 3) => (c && Number.isFinite(c.point) ? c.point.toFixed(d) : "–");
const BASELINE: Record<string, string> = { B1: "Pace rule", B2: "Last month", B3: "LightGBM" };
const coverageGap = (p: number) => { const d = Math.round((p - 0.8) * 100); return d === 0 ? "on target" : d < 0 ? `${-d} pts short` : `${d} pts over`; };
const ci = (c: CI | null | undefined, d = 3) => (c && Number.isFinite(c.lo) ? `${c.lo.toFixed(d)} – ${c.hi.toFixed(d)}` : "");

export function GradePage({ provider }: { provider: DataProvider }) {
  const [s, setS] = useState<BacktestSummary | null | undefined>(undefined);
  useEffect(() => { void provider.backtest().then(setS); }, [provider]);
  if (s === undefined) return <div className="h-64 animate-pulse rounded-2xl bg-background-secondary-default" />;
  if (s === null) return <Panel title="Not graded yet" icon={SealCheck}><p className="text-body-regular text-text-secondary">No evaluation has run on this data yet.</p></Panel>;

  const m1 = s.models.M1;
  const sim = s.meta?.subject === "sim" || String(s.meta?.subject ?? "").endsWith("_syn");
  const baselines = ["B1", "B2", "B3"].filter((k) => s.models[k]);
  const best = baselines.sort((a, b) => s.models[a].brier.point - s.models[b].brier.point)[0];
  // months warned at least a day before running out (a same-day warning is not counted as notice)
  const ahead = m1.lead_time.lead_days.filter((d) => d > 0).length;
  const stats: Stat[] = [
    { icon: duo(Crosshair), tone: "purple", label: "Prediction error (Brier)", value: f(m1.brier), caption: `${BASELINE[best] ?? best} ${f(s.models[best].brier)}`, delta: m1.brier.point < s.models[best].brier.point ? "lower" : "higher", deltaColor: m1.brier.point < s.models[best].brier.point ? "lime" : "rose", hint: "Mean squared error of the predicted chance of going broke before payday, across every evaluated day." },
    { icon: duo(Timer), tone: "orange", label: "Warned ahead by", value: Number.isFinite(m1.lead_time.mean_lead) ? `${m1.lead_time.mean_lead.toFixed(1)} days` : "–", caption: `${m1.lead_time.n_broke_cycles} broke months`, delta: `${ahead} of ${m1.lead_time.n_broke_cycles} ahead`, deltaColor: ahead === m1.lead_time.n_broke_cycles ? "lime" : "neutral", hint: "In months that went broke: days between the first warning (50%+ chance) and the actual broke day." },
    { icon: duo(Scales), tone: "blue", label: "Ranges that held", value: m1.coverage80 ? `${Math.round(m1.coverage80.point * 100)}%` : "–", caption: "aim: 80%", delta: m1.coverage80 ? coverageGap(m1.coverage80.point) : "–", deltaColor: m1.coverage80 && Math.abs(m1.coverage80.point - 0.8) <= 0.02 ? "lime" : "neutral", hint: "How often the real end-of-month balance landed inside the claimed 80% range." },
    { icon: duo(ChartBar), tone: "emerald", label: "Days tested", value: `${s.n_origins}`, caption: `${s.n_cycles} months`, delta: "walk-forward", deltaColor: "neutral", hint: "Every 2nd day with 60+ days of history; each model fit only on days before it." },
  ];

  return (
    <>
      <div className="rounded-2xl bg-accent-50 px-4 py-2.5 text-body-2-medium text-accent-800">
        {sim ? "Sample student. " : ""}Tested like a real forecast: each day was predicted using only the days before it, under rules written down before any results.
      </div>
      <StatCards variant="footer" stats={stats} />
      <TimeMachine provider={provider} />
      <Panel title="TabPFN against simpler methods" sub="Lower error is better. Small grey numbers are the 90% uncertainty range." icon={SealCheck} flush>
        <Table aria-label="Backtest results">
          <TableHeader>
            <Column isRowHeader>Model</Column>
            <Column>Error</Column>
            <Column>Off by (₹)</Column>
            <Column>Ranges held</Column>
            <Column className="text-end">Warned ahead</Column>
          </TableHeader>
          <TableBody items={Object.entries(s.models).map(([k, v]) => ({ id: k, k, v }))}>
            {({ k, v }) => (
              <TRow id={k}>
                <Cell>
                  <p className="text-body-medium text-text-primary">{NAMES[k]?.[0] ?? k}{k === "M1" && <Chip variant="caption" color="purple" className="ms-2">app</Chip>}</p>
                  <p className="text-body-2-medium text-text-tertiary">{NAMES[k]?.[1]}</p>
                </Cell>
                <Cell><p className="text-body-medium tabular-nums">{f(v.brier)}</p><p className="text-caption-1-medium text-text-tertiary tabular-nums">{ci(v.brier)}</p></Cell>
                <Cell><p className="text-body-medium tabular-nums">{f(v.crps, 0)}</p><p className="text-caption-1-medium text-text-tertiary tabular-nums">{ci(v.crps, 0)}</p></Cell>
                <Cell><p className="text-body-medium tabular-nums">{v.coverage80 ? `${Math.round(v.coverage80.point * 100)}%` : "no range"}</p></Cell>
                <Cell className="text-end"><p className="text-body-medium tabular-nums">{Number.isFinite(v.lead_time.mean_lead) ? `${v.lead_time.mean_lead.toFixed(1)} d` : "–"}</p></Cell>
              </TRow>
            )}
          </TableBody>
        </Table>
      </Panel>
      <div className="grid gap-4">
        <Panel title="Did TabPFN do better?" sub="Counts as better only if the whole uncertainty range of the difference favours TabPFN" icon={Crosshair} flush>
          <Rows>
            {Object.entries(s.diff_vs_M1).map(([k, d]) => {
              const v = d.brier.verdict;
              return (
                <Row key={k}>
                  <Tile icon={Scales} tone={v === "TabPFN better" ? "lime" : v === "baseline better" ? "rose" : "neutral"} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body-medium text-text-primary">Against {NAMES[k]?.[0] ?? k}</p>
                    <p className="text-body-2-medium text-text-tertiary tabular-nums">error difference {f(d.brier)} (range {ci(d.brier)})</p>
                  </div>
                  <Chip variant="caption" color={v === "TabPFN better" ? "lime" : v === "baseline better" ? "rose" : "neutral"}>{v === "TabPFN better" ? "TabPFN better" : v === "baseline better" ? "Simpler method better" : "Too close to call"}</Chip>
                </Row>
              );
            })}
          </Rows>
        </Panel>
        <Panel title="What this does not prove" sub="Written from the results above" icon={WarningCircle} flush>
          <Rows>
            <Row><p className="text-body-regular text-text-secondary">Only {s.n_cycles} months of history, so the uncertainty is wide (error between {ci(m1.brier)}).</p></Row>
            <Row><p className="text-body-regular text-text-secondary">It learns one person from their own statement. It has not been tested on anyone else.</p></Row>
            <Row><p className="text-body-regular text-text-secondary">Ranges that held before calibration: {s.calibration.coverage80_uncalibrated ? `${Math.round(s.calibration.coverage80_uncalibrated.point * 100)}%` : "–"}; after: {s.calibration.coverage80_calibrated ? `${Math.round(s.calibration.coverage80_calibrated.point * 100)}%` : "–"} (calibration learned only from earlier months).</p></Row>
            {Object.entries(s.diff_vs_M1).filter(([, d]) => d.crps.verdict === "baseline better").map(([k]) => (
              <Row key={k}><p className="text-body-regular text-text-secondary">For the exact payday balance, {NAMES[k]?.[0] ?? k} was closer than TabPFN.</p></Row>
            ))}
          </Rows>
        </Panel>
      </div>
    </>
  );
}
