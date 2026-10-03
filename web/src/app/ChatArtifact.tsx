/* Charts the chat draws inline (Claude-style artifacts), always from the live forecast the dashboard uses. */
import { ArrowSquareOut, ChartBar, ChartLineUp, ChartPieSlice, Target } from "@phosphor-icons/react";
import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import { Button } from "@/components/base/buttons/button";
import { cx } from "@/utils/cx";
import type { ForecastResponse } from "../types";
import type { Artifact } from "../lib/chat";
import { days, inr, inr0, shortDate } from "../lib/format";
import { BrokeByDay, FanChart, useFan } from "./FanChart";
import { PaydayHistogram } from "./FuturesPage";
import { Legend, Track, duo } from "./kit";
import type { Route } from "../App";

const META: Record<Artifact, { title: string; icon: PhosphorIcon; route: Route }> = {
  range: { title: "Balance to payday", icon: ChartLineUp, route: "futures" },
  spending: { title: "Where it went", icon: ChartPieSlice, route: "overview" },
  payday: { title: "Where you land on payday", icon: ChartBar, route: "futures" },
  plans: { title: "Your plans", icon: Target, route: "plans" },
};

export function ChatArtifact({ kind, data, go }: { kind: Artifact; data: ForecastResponse; go: (r: Route) => void }) {
  const m = META[kind];
  return (
    <figure className="overflow-hidden rounded-2xl bg-background-inner-default shadow-card ring-1 ring-separator-border">
      <figcaption className="flex items-center gap-2 border-b border-separator-border px-4 py-2.5">
        <m.icon weight="duotone" className="size-4 text-accent-600" aria-hidden />
        <span className="flex-1 text-body-medium text-text-primary">{m.title}</span>
        <Button variant="ghost" size="xs" leadingIcon={duo(ArrowSquareOut)} onClick={() => go(m.route)}>Open</Button>
      </figcaption>
      <div className="p-4">
        {kind === "range" && <Range data={data} />}
        {kind === "spending" && <Spending data={data} />}
        {kind === "payday" && <div className="flex h-64 flex-col"><PaydayHistogram data={data} /></div>}
        {kind === "plans" && <Plans data={data} />}
      </div>
    </figure>
  );
}

function Range({ data }: { data: ForecastResponse }) {
  const pts = useFan(data);
  return (
    <>
      <div className="mb-2 flex flex-wrap gap-4">
        <Legend swatch="var(--color-accent-600)" label="Typical" />
        <Legend swatch="color-mix(in srgb, var(--color-accent-500) 45%, white)" label="Half of futures" />
        <Legend swatch="color-mix(in srgb, var(--color-accent-400) 25%, white)" label="Almost all" />
      </div>
      <FanChart data={data} pts={pts} />
      <p className="mt-3 mb-1 text-body-2-medium text-text-secondary">Chance you have run out, by day</p>
      <BrokeByDay pts={pts} />
    </>
  );
}

const TONE: Record<string, string> = { "Essentials": "bg-accent-500", "Lifestyle": "bg-orange-500", "Friends & family": "bg-sky-500", "Cash & other": "bg-neutral-400" };

function Spending({ data }: { data: ForecastResponse }) {
  const c = data.context?.cycle;
  if (!c) return <p className="text-body-regular text-text-tertiary">No spending yet this month.</p>;
  const groups = c.groups.filter((g) => g.spent_paise > 0 || (g.typical_paise ?? 0) > 0);
  const max = Math.max(...groups.map((g) => Math.max(g.spent_paise, g.typical_paise ?? 0)), 1);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-title-2-medium text-text-primary tabular-nums">{inr(c.spent_paise)}<span className="ms-2 text-body-medium text-text-tertiary">in {c.day_in_cycle} days{c.typical_spent_paise ? ` · typical ${inr0(c.typical_spent_paise)}` : ""}</span></p>
      {groups.map((g, i) => (
        <div key={g.group} className="flex flex-col gap-1">
          <div className="flex justify-between text-body-2-medium"><span className="text-text-primary">{g.group}</span><span className="text-text-secondary tabular-nums">{inr(g.spent_paise)}{g.typical_paise !== null && <span className="text-text-tertiary"> / typical {inr0(g.typical_paise)}</span>}</span></div>
          <div className="relative h-2.5 rounded-full bg-background-secondary-default">
            {g.typical_paise !== null && <span className="absolute inset-y-0 start-0 rounded-full bg-chart-neutral/60" style={{ width: `${(g.typical_paise / max) * 100}%` }} />}
            <span className={cx("animate-[page-reveal_500ms_ease-out_both] absolute inset-y-0 start-0 rounded-full", TONE[g.group] ?? "bg-neutral-400")}
              style={{ width: `${(g.spent_paise / max) * 100}%`, animationDelay: `${i * 70}ms` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Plans({ data }: { data: ForecastResponse }) {
  const H = Math.max(data.horizon_days, 1);
  if (!data.plans.length) return <p className="text-body-regular text-text-tertiary">No plans yet. Try “add momos ₹150 on Friday to plans”.</p>;
  return (
    <div className="flex flex-col gap-3">
      {data.plans.map((p) => (
        <div key={p.id} className="flex items-center gap-3">
          <span className={cx("size-2 shrink-0 rounded-full", p.active ? "bg-orange-500" : "bg-chart-neutral")} aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="flex justify-between gap-2 text-body-2-medium">
              <span className="truncate text-text-primary">{p.name} <span className="text-text-tertiary">· {shortDate(p.date)}{p.active ? "" : " · off"}</span></span>
              <span className="shrink-0 text-text-secondary tabular-nums">{inr(p.amount_paise)} · {days(p.day_cost)}</span>
            </div>
            <div className="mt-1"><Track value={p.day_cost / H} tone={p.active ? "orange" : "accent"} /></div>
          </div>
        </div>
      ))}
      <p className="text-body-2-medium text-text-secondary tabular-nums">With the plans that are on, {data.n_make_it} of {data.n_futures} months make it to payday.</p>
    </div>
  );
}
