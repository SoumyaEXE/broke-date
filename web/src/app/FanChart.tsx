/* Fan chart in BoardUI's Recharts recipe: the 500 TabPFN futures summarised per day as a 90% and a 50% range
 * around the median, with the broke line; below it, the share of futures that have gone broke by each day. */
import { useMemo } from "react";
import { Area, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ForecastResponse } from "../types";
import { groupIndian, inr0, shortDate } from "../lib/format";

type Pt = { t: number; label: string; date: string; r90: [number, number]; r50: [number, number]; med: number; broke: number };

const q = (sorted: number[], f: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(f * (sorted.length - 1))))];
const rs = (p: number) => Math.round(p / 100);

export function useFan(data: ForecastResponse): Pt[] {
  return useMemo(() => {
    const P = data.paths.balances_paise, FB = data.paths.first_broke, H = data.horizon_days;
    return Array.from({ length: H + 1 }, (_, t) => {
      const col = P.map((p) => p[Math.min(t, p.length - 1)]).sort((a, b) => a - b);
      const brokeBy = FB.filter((fb) => fb >= 1 && fb <= t).length / Math.max(FB.length, 1);
      const date = data.paths.days[t];
      return {
        t, date, label: t === 0 ? "Today" : shortDate(date).replace(/(st|nd|rd|th) /, " "),
        r90: [rs(q(col, 0.05)), rs(q(col, 0.95))], r50: [rs(q(col, 0.25)), rs(q(col, 0.75))], med: rs(q(col, 0.5)),
        broke: Math.round(brokeBy * 1000) / 10,
      };
    });
  }, [data]);
}

function Card({ active, payload }: { active?: boolean; payload?: { payload: Pt }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-xl bg-background-inner-default px-3 py-2 text-caption-1-medium shadow-dropdown ring-1 ring-separator-border">
      <p className="text-text-tertiary">{p.t === 0 ? "Today" : shortDate(p.date)}</p>
      <p className="text-body-medium text-text-primary tabular-nums">₹{groupIndian(p.med)} <span className="text-caption-1-medium text-text-tertiary">typical</span></p>
      <p className="text-text-secondary tabular-nums">Half of futures: ₹{groupIndian(p.r50[0])} – ₹{groupIndian(p.r50[1])}</p>
      <p className="text-text-tertiary tabular-nums">Almost all: ₹{groupIndian(Math.max(0, p.r90[0]))} – ₹{groupIndian(p.r90[1])}</p>
      {p.broke > 0 && <p className="mt-1 text-status-orange-text tabular-nums">{p.broke}% have run out by now</p>}
    </div>
  );
}

export function FanChart({ data, pts }: { data: ForecastResponse; pts: Pt[] }) {
  const yMax = Math.max(...pts.map((p) => p.r90[1]), rs(data.balance_now_paise)) * 1.08;
  return (
    <div className="animate-chart-reveal h-[340px] w-full min-w-0" role="img"
      aria-label={`Typical balance falls to ${inr0(pts[pts.length - 1]?.med * 100)} by payday; ${data.n_make_it} of ${data.n_futures} futures stay above the broke line.`}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={pts} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <YAxis width={58} domain={[0, Math.ceil(yMax / 500) * 500]} tickCount={5} tickLine={false} axisLine={false}
            tickFormatter={(v: number) => `₹${groupIndian(v)}`} tick={{ fontSize: 12, fill: "var(--color-text-tertiary)" }} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={12} interval="preserveStartEnd" minTickGap={28}
            tick={{ fontSize: 12, fill: "var(--color-text-tertiary)" }} />
          <Tooltip content={<Card />} cursor={{ stroke: "var(--color-chart-cursor)", strokeWidth: 1, strokeDasharray: "4 4" }} />
          <ReferenceLine y={rs(data.broke_line_paise)} stroke="var(--color-orange-400)" strokeDasharray="4 4"
            label={{ value: `Broke line ${inr0(data.broke_line_paise)}`, position: "insideBottomLeft", fontSize: 11, fill: "var(--color-orange-500)" }} />
          <Area type="monotone" dataKey="r90" stroke="none" fill="var(--color-accent-400)" fillOpacity={0.14} animationDuration={700} />
          <Area type="monotone" dataKey="r50" stroke="none" fill="var(--color-accent-500)" fillOpacity={0.24} animationDuration={700} />
          <Line type="monotone" dataKey="med" stroke="var(--color-accent-600)" strokeWidth={2.5} dot={false}
            activeDot={{ r: 5, fill: "var(--color-accent-600)", stroke: "white", strokeWidth: 2 }} animationDuration={700} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Share of futures that have hit the broke line by each day (cumulative). */
export function BrokeByDay({ pts }: { pts: Pt[] }) {
  const max = Math.max(5, ...pts.map((p) => p.broke));
  return (
    <div className="h-[120px] w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={pts} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="broke-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-orange-400)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--color-orange-400)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis width={58} domain={[0, Math.ceil(max)]} tickCount={3} tickLine={false} axisLine={false}
            tickFormatter={(v: number) => `${v}%`} tick={{ fontSize: 12, fill: "var(--color-text-tertiary)" }} />
          <XAxis dataKey="label" hide />
          <Tooltip content={<Card />} cursor={{ stroke: "var(--color-chart-cursor)", strokeWidth: 1, strokeDasharray: "4 4" }} />
          <Area type="monotone" dataKey="broke" stroke="var(--color-orange-500)" strokeWidth={2} fill="url(#broke-fill)" animationDuration={700} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
