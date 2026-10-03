/* Time machine and calibration: the backtest replayed. For any past month, what Broke Date said each day (using only
 * the days before it) against what actually happened. And across all days: when it said X%, how often it happened.
 * Every value comes from the backtest's own records (eval/replay.py); nothing here is recomputed or typed. */
import { useEffect, useMemo, useState } from "react";
import { ClockCounterClockwise, Target } from "@phosphor-icons/react";
import { CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { Chip } from "@/components/base/badges/chip";
import { cx } from "@/utils/cx";
import type { Replay, ReplayMonth } from "../types";
import type { DataProvider } from "../data/provider";
import { shortDate } from "../lib/format";
import { Legend, Panel } from "./kit";

const DAY = 86400000;
const t = (d: string) => Math.round(Date.parse(d) / DAY);
const monthName = (m: ReplayMonth) => new Date(m.start).toLocaleString("en-IN", { month: "short", year: "2-digit" });

export function TimeMachine({ provider }: { provider: DataProvider }) {
  const [r, setR] = useState<Replay | null | undefined>(undefined);
  const [pick, setPick] = useState<number | null>(null);
  useEffect(() => { void provider.replay().then((x) => { setR(x); if (x) setPick(x.months.find((m) => m.went_broke)?.cycle ?? x.months[0]?.cycle ?? null); }); }, [provider]);
  if (r === undefined) return <div className="h-80 animate-pulse rounded-2xl bg-background-secondary-default" />;
  if (!r || !r.months.length) return null;
  const m = r.months.find((x) => x.cycle === pick) ?? r.months[0];
  return (
    <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
      <Panel title="Time machine" icon={ClockCounterClockwise}
        sub="Each past month replayed: what Broke Date said every other day, using only the days before it, against what happened">
        <div className="mb-3 flex flex-wrap gap-1.5">
          {r.months.map((x) => (
            <button key={x.cycle} type="button" onClick={() => setPick(x.cycle)}
              className={cx("flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-body-2-medium transition-colors",
                x.cycle === m.cycle ? "bg-background-inner-default text-text-primary shadow-card ring-1 ring-separator-border" : "text-text-secondary hover:bg-background-secondary-default")}>
              <span className={cx("size-2 rounded-full", x.went_broke ? "bg-orange-500" : "bg-lime-500")} aria-hidden />
              {monthName(x)}
            </button>
          ))}
        </div>
        <Story m={m} />
        <MonthChart m={m} threshold={r.threshold} />
        <div className="mt-2 flex flex-wrap gap-4">
          <Legend swatch="var(--color-accent-600)" label="Broke Date: chance of running out" />
          <Legend swatch="var(--color-chart-neutral)" label="Simple pace rule" dashed />
          <Legend swatch="var(--color-orange-500)" label="Ran out" dashed />
        </div>
      </Panel>
      <Calibration r={r} />
    </div>
  );
}

function Story({ m }: { m: ReplayMonth }) {
  const text = m.went_broke
    ? m.first_warning && (m.lead_days ?? 0) > 0
      ? <>Warned on <b>{shortDate(m.first_warning)}</b>, ran out on <b>{shortDate(m.broke_day!)}</b>: <b className="text-accent-600">{m.lead_days} days' notice</b>.</>
      : m.first_warning ? <>Ran out on <b>{shortDate(m.broke_day!)}</b>. The warning came only that same day.</>
        : <>Ran out on <b>{shortDate(m.broke_day!)}</b> with no warning before it.</>
    : m.false_alarm ? <>Made it to payday, but Broke Date warned on <b>{shortDate(m.first_warning!)}</b>: a false alarm.</>
      : <>Made it to payday, and Broke Date never raised the alarm.</>;
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <p className="text-body-regular text-text-secondary [&_b]:font-semibold [&_b]:text-text-primary">{text}</p>
      <Chip variant="caption" color={m.went_broke ? ((m.lead_days ?? 0) > 0 ? "lime" : "rose") : m.false_alarm ? "orange" : "lime"}>
        {m.went_broke ? ((m.lead_days ?? 0) > 0 ? "Caught early" : "Caught late") : m.false_alarm ? "False alarm" : "Quiet, correctly"}
      </Chip>
    </div>
  );
}

function MonthChart({ m, threshold }: { m: ReplayMonth; threshold: number }) {
  const rows = useMemo(() => m.days.map((d) => ({ x: t(d.date), date: d.date, p: Math.round(d.p * 100), b1: d.p_B1 !== undefined ? Math.round(d.p_B1 * 100) : undefined })), [m]);
  const x0 = Math.min(rows[0]?.x ?? 0, m.broke_day ? t(m.broke_day) : Infinity), x1 = Math.max(rows[rows.length - 1]?.x ?? 0, t(m.payday) - 1);
  return (
    <div className="animate-chart-reveal h-64 w-full min-w-0" role="img"
      aria-label={`Predicted chance of running out each day of the month starting ${shortDate(m.start)}`}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--color-separator-border)" />
          <XAxis type="number" dataKey="x" domain={[x0, x1]} tickLine={false} axisLine={false} tickCount={6}
            tickFormatter={(v: number) => shortDate(new Date(v * DAY).toISOString().slice(0, 10)).replace(/(st|nd|rd|th) /, " ")}
            tick={{ fontSize: 12, fill: "var(--color-text-tertiary)" }} />
          <YAxis width={44} domain={[0, 100]} ticks={[0, 50, 100]} tickFormatter={(v: number) => `${v}%`} tickLine={false} axisLine={false}
            tick={{ fontSize: 12, fill: "var(--color-text-tertiary)" }} />
          <Tooltip cursor={{ stroke: "var(--color-chart-cursor)", strokeDasharray: "4 4" }}
            content={({ active, payload }) => active && payload?.length ? (
              <div className="rounded-xl bg-background-inner-default px-3 py-2 text-caption-1-medium shadow-dropdown ring-1 ring-separator-border">
                <p className="text-text-tertiary">{shortDate((payload[0].payload as { date: string }).date)}</p>
                <p className="text-body-medium text-text-primary tabular-nums">{(payload[0].payload as { p: number }).p}% <span className="text-text-tertiary">chance of running out</span></p>
              </div>
            ) : null} />
          <ReferenceLine y={threshold * 100} stroke="var(--color-separator-border-strong)" strokeDasharray="4 4"
            label={{ value: "warning line", position: "insideTopLeft", fontSize: 11, fill: "var(--color-text-tertiary)" }} />
          {m.broke_day && <ReferenceLine x={t(m.broke_day)} stroke="var(--color-orange-500)" strokeDasharray="5 4"
            label={{ value: "ran out", position: "insideTopRight", fontSize: 11, fill: "var(--color-orange-500)" }} />}
          <Line type="monotone" dataKey="b1" stroke="var(--color-chart-neutral)" strokeWidth={1.5} strokeDasharray="5 5" dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="p" stroke="var(--color-accent-600)" strokeWidth={2.5} dot={{ r: 2.5, fill: "var(--color-accent-600)" }}
            activeDot={{ r: 5, stroke: "white", strokeWidth: 2 }} animationDuration={600} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function Calibration({ r }: { r: Replay }) {
  const pts = (k: string) => (r.calibration[k] ?? []).map((b) => ({ said: Math.round(b.mean_p * 100), happened: Math.round(b.observed * 100), n: b.n }));
  const app = pts("M1"), lgbm = pts("B3");
  return (
    <Panel title="Does it mean what it says?" icon={Target}
      sub="All evaluated days grouped by the chance Broke Date gave; on the dashed line, '30%' would mean it happened 30% of the time" className="h-full">
      <div className="h-64 w-full min-w-0" role="img" aria-label="Calibration: predicted chance against how often running out happened">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart margin={{ top: 10, right: 10, bottom: 4, left: 0 }}>
            <CartesianGrid stroke="var(--color-separator-border)" />
            <XAxis type="number" dataKey="said" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v: number) => `${v}%`}
              tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "var(--color-text-tertiary)" }}
              label={{ value: "it said", position: "insideBottomRight", offset: -2, fontSize: 11, fill: "var(--color-text-tertiary)" }} />
            <YAxis type="number" dataKey="happened" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v: number) => `${v}%`} width={44}
              tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "var(--color-text-tertiary)" }} />
            <ZAxis type="number" dataKey="n" range={[40, 260]} />
            <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 100, y: 100 }]} stroke="var(--color-chart-neutral)" strokeDasharray="5 5" />
            <Tooltip cursor={false} content={({ active, payload }) => active && payload?.length ? (
              <div className="rounded-xl bg-background-inner-default px-3 py-2 text-caption-1-medium shadow-dropdown ring-1 ring-separator-border">
                <p className="text-body-medium text-text-primary tabular-nums">Said {(payload[0].payload as { said: number }).said}% → happened {(payload[0].payload as { happened: number }).happened}%</p>
                <p className="text-text-tertiary tabular-nums">{(payload[0].payload as { n: number }).n} days</p>
              </div>
            ) : null} />
            {lgbm.length > 0 && <Scatter data={lgbm} fill="var(--color-chart-neutral)" isAnimationActive={false} />}
            <Scatter data={app} fill="var(--color-accent-500)" line={{ stroke: "var(--color-accent-400)", strokeWidth: 1.5 }} animationDuration={600} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap gap-4">
        <Legend swatch="var(--color-accent-500)" label="Broke Date" />
        {lgbm.length > 0 && <Legend swatch="var(--color-chart-neutral)" label="LightGBM" />}
        <Legend swatch="var(--color-chart-neutral)" label="Perfectly honest" dashed />
      </div>
      <p className="mt-2 text-caption-1-medium text-text-tertiary">Bigger dots = more days. {r.n_days} days in total.</p>
    </Panel>
  );
}
