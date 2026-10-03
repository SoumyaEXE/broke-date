/* Fan chart in BoardUI's Recharts recipe. Left of "Today": this month's real balance from the statement.
 * Right of it: the 500 TabPFN futures summarised per day as a typical line, a 50% range and a 90% range, with the
 * broke line. Below: the share of futures that have run out by each day, as plain daily bars. */
import { useMemo } from "react";
import { Area, Bar, BarChart, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ForecastResponse } from "../types";
import { addDays, groupIndian, inr0, shortDate } from "../lib/format";

type Pt = { t: number; label: string; date: string; r90: [number, number]; r50: [number, number]; med: number; broke: number };
type Row = { label: string; date: string; actual?: number; med?: number; r90?: [number, number]; r50?: [number, number]; broke?: number; today?: boolean };

const q = (sorted: number[], f: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(f * (sorted.length - 1))))];
const rs = (p: number) => Math.round(p / 100);
const lab = (d: string) => shortDate(d).replace(/(st|nd|rd|th) /, " ");

/** Forecast days only (today .. payday): used for the headline numbers. */
export function useFan(data: ForecastResponse): Pt[] {
  return useMemo(() => {
    const P = data.paths.balances_paise, FB = data.paths.first_broke, H = data.horizon_days;
    return Array.from({ length: H + 1 }, (_, t) => {
      const col = P.map((p) => p[Math.min(t, p.length - 1)]).sort((a, b) => a - b);
      const brokeBy = FB.filter((fb) => fb >= 1 && fb <= t).length / Math.max(FB.length, 1);
      const date = data.paths.days[t];
      return {
        t, date, label: t === 0 ? "Today" : lab(date),
        r90: [rs(q(col, 0.05)), rs(q(col, 0.95))], r50: [rs(q(col, 0.25)), rs(q(col, 0.75))], med: rs(q(col, 0.5)),
        broke: Math.round(brokeBy * 1000) / 10,
      };
    });
  }, [data]);
}

/** This month so far (real balances) followed by the forecast, on one date axis. */
function useTimeline(data: ForecastResponse, pts: Pt[]): Row[] {
  return useMemo(() => {
    const ctx = data.context;
    const past = ctx?.balance_compare.this ?? [];
    const start = ctx?.cycle.start ?? data.as_of;
    const dic = ctx?.cycle.day_in_cycle ?? 0;
    const hist: Row[] = past.slice(0, dic).map((b, i) => ({ label: lab(addDays(start, i)), date: addDays(start, i), actual: rs(b) }));
    const fut: Row[] = pts.map((p) => ({
      label: p.label, date: p.date, med: p.med, r90: p.r90, r50: p.r50, broke: p.broke, today: p.t === 0,
      ...(p.t === 0 ? { actual: rs(data.balance_now_paise) } : {}),
    }));
    return [...hist, ...fut];
  }, [data, pts]);
}

function Card({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const forecast = p.med !== undefined && !p.today;
  return (
    <div className="rounded-xl bg-background-inner-default px-3 py-2 text-caption-1-medium shadow-dropdown ring-1 ring-separator-border">
      <p className="text-text-tertiary">{p.today ? "Today" : shortDate(p.date)}</p>
      {forecast ? (
        <>
          <p className="text-body-medium text-text-primary tabular-nums">₹{groupIndian(p.med!)} <span className="text-text-tertiary">typical</span></p>
          <p className="text-text-tertiary tabular-nums">Most likely ₹{groupIndian(Math.max(0, p.r50![0]))} – ₹{groupIndian(p.r50![1])}</p>
          {!!p.broke && <p className="mt-1 text-status-orange-text tabular-nums">{p.broke}% have run out</p>}
        </>
      ) : <p className="text-body-medium text-text-primary tabular-nums">₹{groupIndian(p.actual ?? 0)} <span className="text-text-tertiary">{p.today ? "now" : "balance"}</span></p>}
    </div>
  );
}

export function FanChart({ data, pts }: { data: ForecastResponse; pts: Pt[] }) {
  const rows = useTimeline(data, pts);
  const yMax = Math.max(...rows.map((r) => Math.max(r.actual ?? 0, r.r90?.[1] ?? 0)), 1) * 1.08;
  const step = yMax > 4000 ? 1000 : 500;
  return (
    <div className="animate-chart-reveal h-[320px] w-full min-w-0" role="img"
      aria-label={`Balance so far this month, then TabPFN's forecast to payday on ${shortDate(data.next_anchor_date)}: typical ${inr0(pts[pts.length - 1]?.med * 100)}; ${data.n_make_it} of ${data.n_futures} futures stay above the broke line.`}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <YAxis width={58} domain={[0, Math.ceil(yMax / step) * step]} tickCount={5} tickLine={false} axisLine={false}
            tickFormatter={(v: number) => `₹${groupIndian(v)}`} tick={{ fontSize: 12, fill: "var(--color-text-tertiary)" }} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={12} interval="preserveStartEnd" minTickGap={36}
            tick={{ fontSize: 12, fill: "var(--color-text-tertiary)" }} />
          <Tooltip content={<Card />} cursor={{ stroke: "var(--color-chart-cursor)", strokeWidth: 1, strokeDasharray: "4 4" }} />
          <ReferenceLine x="Today" stroke="var(--color-separator-border-strong)" label={{ value: "Today", position: "insideTopRight", fontSize: 11, fill: "var(--color-text-tertiary)" }} />
          <ReferenceLine y={rs(data.broke_line_paise)} stroke="var(--color-orange-400)" strokeDasharray="4 4"
            label={{ value: `Broke line ${inr0(data.broke_line_paise)}`, position: "insideBottomLeft", fontSize: 11, fill: "var(--color-orange-500)" }} />
          <Area type="monotone" dataKey="r90" stroke="none" fill="var(--color-accent-400)" fillOpacity={0.14} animationDuration={700} connectNulls={false} />
          <Area type="monotone" dataKey="r50" stroke="none" fill="var(--color-accent-500)" fillOpacity={0.24} animationDuration={700} connectNulls={false} />
          <Line type="monotone" dataKey="actual" stroke="var(--color-text-primary)" strokeWidth={2.5} dot={false} connectNulls={false}
            activeDot={{ r: 5, fill: "var(--color-text-primary)", stroke: "white", strokeWidth: 2 }} animationDuration={700} />
          <Line type="monotone" dataKey="med" stroke="var(--color-accent-600)" strokeWidth={2.5} strokeDasharray="6 4" dot={false} connectNulls={false}
            activeDot={{ r: 5, fill: "var(--color-accent-600)", stroke: "white", strokeWidth: 2 }} animationDuration={700} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Share of futures that have run out by each day ahead, as daily bars (orange once above zero). */
export function BrokeByDay({ pts }: { pts: Pt[] }) {
  const days = pts.slice(1).map((p) => ({ ...p, label: p.label }));
  const last = days[days.length - 1];
  if (days.length <= 3) {
    return (
      <p className="text-body-medium text-text-secondary">
        <span className="text-title-3-semibold text-text-primary tabular-nums">{last ? `${last.broke}%` : "0%"}</span> of futures run out before payday
      </p>
    );
  }
  const max = Math.max(5, ...days.map((p) => p.broke));
  return (
    <div className="h-[110px] w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={days} margin={{ top: 6, right: 8, bottom: 0, left: 0 }} barCategoryGap={3}>
          <YAxis width={58} domain={[0, Math.ceil(max)]} tickCount={3} tickLine={false} axisLine={false}
            tickFormatter={(v: number) => `${v}%`} tick={{ fontSize: 12, fill: "var(--color-text-tertiary)" }} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={36} tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }} />
          <Tooltip cursor={{ fill: "var(--color-background-secondary-default)" }}
            content={({ active, payload }) => active && payload?.length ? (
              <div className="rounded-xl bg-background-inner-default px-3 py-2 text-caption-1-medium shadow-dropdown ring-1 ring-separator-border">
                <p className="text-text-tertiary">{shortDate((payload[0].payload as Pt).date)}</p>
                <p className="text-body-medium text-text-primary tabular-nums">{(payload[0].payload as Pt).broke}% have run out</p>
              </div>
            ) : null} />
          <Bar dataKey="broke" radius={[4, 4, 0, 0]} animationDuration={600}>
            {days.map((p) => <Cell key={p.t} fill={p.broke > 0 ? "var(--color-orange-500)" : "var(--color-chart-neutral)"} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
