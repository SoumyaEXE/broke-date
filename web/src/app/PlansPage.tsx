import { useMemo, useState } from "react";
import { CalendarPlus, ChartLineUp } from "@phosphor-icons/react";
import { Area, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cx } from "@/utils/cx";
import type { ForecastResponse } from "../types";
import { groupIndian, inr, inr0, pct, shortDate } from "../lib/format";
import { Legend, Panel } from "./kit";
import { PlansPanel } from "./PlansPanel";
import { AddPlanForm } from "./AddPlanForm";
import type { PageProps } from "./OverviewPage";

const rs = (p: number) => Math.round(p / 100);
const lab = (d: string, t: number) => (t === 0 ? "Today" : shortDate(d).replace(/(st|nd|rd|th) /, " "));

export function PlansPage(p: Omit<PageProps, "prev" | "go">) {
  const { data } = p;
  const [sel, setSel] = useState<string | null>(data.plans.find((x) => x.in_horizon)?.id ?? null);
  const plan = data.plans.find((x) => x.id === sel) ?? null;
  const alt = plan ? data.plan_scenarios[plan.id] : null;
  const on = data.plans.filter((x) => x.active);
  const risk = 1 - data.p_make_it;

  return (
    <>
      <Panel title="Your month with these plans" icon={ChartLineUp}
        sub="TabPFN's typical balance to payday, with each plan marked on its day. Pick a plan to see the month with and without it.">
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Fig label="Plans switched on" value={`${on.length} of ${data.plans.length}`} />
          <Fig label="Money set aside" value={inr(on.reduce((s, x) => s + x.amount_paise, 0))} />
          <Fig label="Months that make it" value={`${data.n_make_it} / ${data.n_futures}`} tone="accent" />
          <Fig label="Chance of running out" value={pct(risk)} tone={risk > data.risk_tolerance ? "orange" : undefined} />
        </div>
        <Timeline data={data} alt={alt ? { band: alt.band, active: alt.toggled_active, name: plan!.name } : null} selected={sel} />
        {plan && alt && (
          <p className="mt-3 rounded-xl bg-background-secondary-default px-3 py-2.5 text-body-medium text-text-secondary">
            {alt.toggled_active ? "Doing" : "Skipping"} <span className="text-text-primary">{plan.name}</span>:{" "}
            <span className={cx("tabular-nums", alt.n_make_it < data.n_make_it ? "text-status-rose-text" : "text-status-lime-text")}>
              {alt.n_make_it} of {data.n_futures}
            </span>{" "}months make it, instead of {data.n_make_it}.
          </p>
        )}
      </Panel>
      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <PlansPanel {...p} selected={sel} onSelect={setSel} />
        <Panel title="Add a plan" sub="Name it, price it, pick the day. The futures rerun with it." icon={CalendarPlus}>
          <AddPlanForm data={data} busy={p.busy} provider={p.provider} onUpdate={p.onUpdate} />
        </Panel>
      </div>
    </>
  );
}

function Fig({ label, value, tone }: { label: string; value: string; tone?: "accent" | "orange" }) {
  return (
    <div className="rounded-xl bg-background-secondary-default px-3 py-2.5">
      <p className="truncate text-body-2-medium text-text-tertiary">{label}</p>
      <p className={cx("text-title-3-semibold tabular-nums", tone === "accent" ? "text-accent-600" : tone === "orange" ? "text-status-orange-text" : "text-text-primary")}>{value}</p>
    </div>
  );
}

type Pt = { label: string; date: string; med: number; band: [number, number]; alt?: number };

function Timeline({ data, alt, selected }: { data: ForecastResponse; alt: { band: ForecastResponse["band"]; active: boolean; name: string } | null; selected: string | null }) {
  const pts = useMemo<Pt[]>(() => data.band.p50.map((m, t) => ({
    label: lab(data.paths.days[t], t), date: data.paths.days[t], med: rs(m), band: [rs(data.band.p10[t]), rs(data.band.p90[t])] as [number, number],
    alt: alt ? rs(alt.band.p50[t]) : undefined,
  })), [data, alt]);
  const yMax = Math.max(...pts.map((x) => Math.max(x.band[1], x.alt ?? 0))) * 1.08;
  const markers = data.plans.filter((x) => x.in_horizon);
  return (
    <>
      <div className="mb-2 flex flex-wrap gap-4">
        <Legend swatch="var(--color-accent-600)" label="Typical balance, as planned" />
        {alt && <Legend swatch="var(--color-orange-500)" label={`${alt.active ? "With" : "Without"} ${alt.name}`} dashed />}
        <Legend swatch="color-mix(in srgb, var(--color-accent-400) 30%, white)" label="Most months fall here" />
      </div>
      <div className="animate-chart-reveal h-[300px] w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={pts} margin={{ top: 22, right: 8, bottom: 0, left: 0 }}>
            <YAxis width={58} domain={[0, Math.ceil(yMax / 500) * 500]} tickCount={5} tickLine={false} axisLine={false}
              tickFormatter={(v: number) => `₹${groupIndian(v)}`} tick={{ fontSize: 12, fill: "var(--color-text-tertiary)" }} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={12} interval="preserveStartEnd" minTickGap={28}
              tick={{ fontSize: 12, fill: "var(--color-text-tertiary)" }} />
            <Tooltip content={<Card alt={alt} />} cursor={{ stroke: "var(--color-chart-cursor)", strokeWidth: 1, strokeDasharray: "4 4" }} />
            <ReferenceLine y={rs(data.broke_line_paise)} stroke="var(--color-orange-400)" strokeDasharray="4 4"
              label={{ value: `Broke line ${inr0(data.broke_line_paise)}`, position: "insideBottomLeft", fontSize: 11, fill: "var(--color-orange-500)" }} />
            {markers.map((m) => (
              <ReferenceLine key={m.id} x={lab(m.date, Math.round((Date.parse(m.date) - Date.parse(data.as_of)) / 86400000))}
                stroke={m.id === selected ? "var(--color-accent-500)" : m.active ? "var(--color-orange-400)" : "var(--color-chart-neutral)"}
                strokeWidth={m.id === selected ? 2 : 1} strokeDasharray={m.active ? undefined : "3 3"}
                label={{ value: m.name.length > 16 ? `${m.name.slice(0, 15)}…` : m.name, position: "top", fontSize: 11,
                  fill: m.id === selected ? "var(--color-accent-600)" : "var(--color-text-tertiary)" }} />
            ))}
            <Area type="monotone" dataKey="band" stroke="none" fill="var(--color-accent-400)" fillOpacity={0.14} animationDuration={600} />
            {alt && <Line type="monotone" dataKey="alt" stroke="var(--color-orange-500)" strokeWidth={2} strokeDasharray="6 5" dot={false} animationDuration={500} />}
            <Line type="monotone" dataKey="med" stroke="var(--color-accent-600)" strokeWidth={2.5} dot={false}
              activeDot={{ r: 5, fill: "var(--color-accent-600)", stroke: "white", strokeWidth: 2 }} animationDuration={600} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

function Card({ active, payload, alt }: { active?: boolean; payload?: { payload: Pt }[]; alt: { active: boolean; name: string } | null }) {
  if (!active || !payload?.length) return null;
  const x = payload[0].payload;
  return (
    <div className="rounded-xl bg-background-inner-default px-3 py-2 text-caption-1-medium shadow-dropdown ring-1 ring-separator-border">
      <p className="text-text-tertiary">{x.label === "Today" ? "Today" : shortDate(x.date)}</p>
      <p className="text-body-medium text-text-primary tabular-nums">₹{groupIndian(x.med)} <span className="text-caption-1-medium text-text-tertiary">typical</span></p>
      {alt && x.alt !== undefined && <p className="text-status-orange-text tabular-nums">₹{groupIndian(x.alt)} {alt.active ? "with" : "without"} {alt.name}</p>}
      <p className="text-text-tertiary tabular-nums">Most months: ₹{groupIndian(Math.max(0, x.band[0]))} – ₹{groupIndian(x.band[1])}</p>
    </div>
  );
}
