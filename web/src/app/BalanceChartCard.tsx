/* Adapted from BoardUI's Revenue Chart Card (components/application/dashboard/revenue-chart-card.tsx):
 * same frame, count-up headline, delta chip, legend and Recharts recipe — this month's balance against last
 * month's, plus TabPFN's median forecast and 80% band from today to payday. */
import { useId, useMemo, useState } from "react";
import { Area, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Chip } from "@/components/base/badges/chip";
import { useCountUp } from "@/hooks/use-count-up";
import { cx } from "@/utils/cx";
import type { ForecastResponse } from "../types";
import { addDays, groupIndian, inr, shortDate } from "../lib/format";

type Pt = { label: string; date: string; current?: number; previous?: number; forecast?: number; band?: [number, number] };

const rupees = (p: number) => Math.round(p / 100);

function ActiveDot({ cx: x, cy: y }: { cx?: number; cy?: number }) {
  if (x === undefined || y === undefined) return null;
  return (
    <g>
      <circle cx={x} cy={y} r={7} fill="var(--color-accent-500)" opacity={0.25} />
      <circle cx={x} cy={y} r={4} fill="var(--color-accent-500)" stroke="var(--color-background-secondary-default)" strokeWidth={2} />
    </g>
  );
}

export function BalanceChartCard({ data, className }: { data: ForecastResponse; className?: string }) {
  const [active, setActive] = useState<number | null>(null);
  const gid = useId();
  const ctx = data.context;
  const dic = ctx?.cycle.day_in_cycle ?? 0;
  const start = ctx?.cycle.start ?? data.as_of;
  const last = ctx?.balance_compare.last;

  const points = useMemo<Pt[]>(() => {
    const thisBal = ctx?.balance_compare.this ?? [];
    const total = Math.max(dic + data.horizon_days + 1, last?.balances_paise.length ?? 0);
    return Array.from({ length: total }, (_, i) => {
      const date = addDays(start, i);
      const p: Pt = { label: shortDate(date).replace(/(st|nd|rd|th) /, " "), date };
      if (i < dic) p.current = rupees(thisBal[i] ?? data.band.p50[0]);
      if (i === dic) p.current = rupees(data.band.p50[0]);
      if (i >= dic && i - dic < data.band.p50.length) {
        p.forecast = rupees(data.band.p50[i - dic]);
        p.band = [rupees(data.band.p10[i - dic]), rupees(data.band.p90[i - dic])];
      }
      if (last && i < last.balances_paise.length) p.previous = rupees(last.balances_paise[i]);
      return p;
    });
  }, [ctx, dic, data, start, last]);

  const pt = active !== null ? points[active] : null;
  const headline = pt ? (pt.current ?? pt.forecast ?? 0) : rupees(data.balance_now_paise);
  const compare = pt ? pt.previous : (last ? rupees(last.balances_paise[Math.min(dic, last.balances_paise.length - 1)]) : undefined);
  const delta = compare !== undefined && compare !== 0 ? Math.round(((headline - compare) / Math.abs(compare)) * 1000) / 10 : null;
  const display = useCountUp(Math.round(headline));
  const yMax = Math.max(...points.flatMap((p) => [p.current ?? 0, p.previous ?? 0, p.band?.[1] ?? 0])) || 1;
  const label = pt ? `${shortDate(pt.date)}${pt.current === undefined ? " · forecast median" : ""}` : "Balance this month";

  return (
    <section className={cx("flex h-[380px] min-w-0 flex-col gap-6 rounded-2xl bg-background-secondary-default px-4 pt-4 pb-3", className)}>
      <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="w-full text-body-medium text-text-secondary">{label}</p>
          <div className="flex w-full items-center gap-2">
            <p key={active ?? "now"} className="animate-number-fade text-title-1-medium whitespace-nowrap text-text-primary tabular-nums">₹{groupIndian(display)}</p>
            {delta !== null && <Chip variant="bold" color={delta > 0 ? "lime" : delta < 0 ? "rose" : "neutral"}>{delta > 0 ? "+" : ""}{delta}%</Chip>}
          </div>
          <p className="text-body-2-medium text-text-tertiary tabular-nums">
            {compare !== undefined ? <>₹{groupIndian(compare)} {pt ? "same day last month" : `at this point in ${last?.label ?? "last month"}`}</> : "No earlier month to compare"}
            {pt?.band && <> · 80% between ₹{groupIndian(pt.band[0])} and ₹{groupIndian(pt.band[1])}</>}
          </p>
        </div>
        <dl className="flex shrink-0 flex-wrap items-center gap-4 text-body-2-medium text-text-secondary">
          <div className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-accent-600" aria-hidden /><dt>This month</dt></div>
          <div className="flex items-center gap-1.5"><span className="w-3 border-t-2 border-dashed border-accent-500" aria-hidden /><dt>TabPFN forecast</dt></div>
          {last && <div className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-chart-neutral" aria-hidden /><dt>{last.label}</dt></div>}
        </dl>
      </div>
      <div className="animate-chart-reveal min-h-0 w-full flex-1" role="img"
           aria-label={`Balance this month and TabPFN's forecast to payday on ${shortDate(data.next_anchor_date)}. ${data.n_make_it} of ${data.n_futures} futures stay above ${inr(data.broke_line_paise)}.`}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={points} margin={{ top: 4, right: 6, bottom: 0, left: 0 }}
            onMouseMove={(s) => { const i = Number(s?.activeTooltipIndex); if (s?.isTooltipActive && Number.isFinite(i)) setActive(i); }}
            onMouseLeave={() => setActive(null)}>
            <defs>
              <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-accent-400)" stopOpacity={0.28} />
                <stop offset="100%" stopColor="var(--color-accent-400)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <YAxis width={56} domain={[0, Math.ceil(yMax * 1.1)]} tickCount={5} tickLine={false} axisLine={false}
                   tickFormatter={(v: number) => `₹${groupIndian(v)}`} tick={{ fontSize: 12, fill: "var(--color-text-tertiary)" }} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={12} interval="preserveStartEnd" minTickGap={24}
                   tick={{ fontSize: 13, fill: "var(--color-text-tertiary)" }} />
            <Tooltip content={() => null} cursor={{ stroke: "var(--color-chart-cursor)", strokeWidth: 1, strokeDasharray: "4 4" }} />
            <ReferenceLine y={rupees(data.broke_line_paise)} stroke="var(--color-rose-400)" strokeDasharray="4 4"
                           label={{ value: `broke line ${inr(data.broke_line_paise)}`, position: "insideBottomRight", fontSize: 11, fill: "var(--color-rose-500)" }} />
            <Area type="monotone" dataKey="band" stroke="none" fill="var(--color-accent-400)" fillOpacity={0.1} isAnimationActive animationDuration={450} />
            <Line type="monotone" dataKey="previous" stroke="var(--color-chart-neutral)" strokeWidth={2} strokeDasharray="5 5" dot={false} activeDot={false} isAnimationActive animationDuration={450} />
            <Line type="monotone" dataKey="current" stroke="var(--color-accent-600)" strokeWidth={2.5} dot={false} activeDot={<ActiveDot />} isAnimationActive animationDuration={450} />
            <Line type="monotone" dataKey="forecast" stroke="var(--color-accent-500)" strokeWidth={2} strokeDasharray="6 5" dot={false} activeDot={<ActiveDot />} isAnimationActive animationDuration={450} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
