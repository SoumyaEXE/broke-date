import { useState } from "react";
import { ChartBar, ChartLineUp, Receipt, TrendUp } from "@phosphor-icons/react";
import { Chip } from "@/components/base/badges/chip";
import { SegmentedControl, SegmentedControlItem } from "@/components/base/segmented-control/segmented-control";
import { cx } from "@/utils/cx";
import type { ForecastResponse } from "../types";
import { days, inr, inr0, shortDate } from "../lib/format";
import DotGrid from "./DotGrid";
import { BrokeByDay, FanChart, useFan } from "./FanChart";
import { Legend, Panel, Row, Rows, Tile } from "./kit";
import { catIcon, catLabel } from "./categories";

export function FuturesPage({ data }: { data: ForecastResponse; prev: ForecastResponse | null }) {
  const [view, setView] = useState("range");
  const n = data.n_futures;
  const pts = useFan(data);
  const end = pts[pts.length - 1];
  return (
    <>
      <Panel title={`Your next ${data.horizon_days} days, played out ${n} times`}
        sub="TabPFN learned how you spend; each simulated month draws a different but realistic set of days"
        icon={ChartLineUp}
        action={
          <SegmentedControl aria-label="View" className="bg-background-tertiary-default/70" selectedKeys={new Set([view])}
            onSelectionChange={(k) => { const v = [...k][0]; if (v) setView(String(v)); }}>
            <SegmentedControlItem id="range">Range</SegmentedControlItem>
            <SegmentedControlItem id="dots">Every future</SegmentedControlItem>
          </SegmentedControl>
        }>
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Fig label="Make it to payday" value={`${data.n_make_it} / ${n}`} tone="accent" />
          <Fig label="Run out first" value={`${n - data.n_make_it}`} tone={n - data.n_make_it > 0 ? "orange" : undefined} />
          <Fig label="Typical balance on payday" value={inr0(end.med * 100)} />
          <Fig label="1-in-20 bad case" value={inr0(Math.max(0, end.r90[0]) * 100)} />
        </div>
        {view === "range" ? (
          <>
            <div className="mb-2 flex flex-wrap gap-4">
              <Legend swatch="var(--color-text-primary)" label="This month so far" />
              <Legend swatch="var(--color-accent-600)" label="Typical ahead" dashed />
              <Legend swatch="color-mix(in srgb, var(--color-accent-500) 45%, white)" label="Likely range" />
            </div>
            <FanChart data={data} pts={pts} />
            <div className="mt-4 border-t border-separator-border pt-3">
              <p className="mb-1 text-body-2-medium text-text-secondary">Chance you have run out, by day</p>
              <BrokeByDay pts={pts} />
            </div>
          </>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap gap-4">
              <Legend swatch="var(--made)" label={`Made it · ${data.n_make_it}`} />
              <Legend swatch="var(--broke)" label={`Ran out · ${n - data.n_make_it}`} />
            </div>
            <DotGrid firstBroke={data.paths.first_broke} H={data.horizon_days} />
          </>
        )}
      </Panel>
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="What if you hadn't bought it?" sub="Days your money would last longer without each recent spend" icon={Receipt} flush>
          <Rows>
            {data.recent.slice(0, 6).map((r) => (
              <Row key={r.txn_id}>
                <Tile icon={catIcon(r.category)} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body-medium text-text-primary">{r.merchant}</p>
                  <p className="text-body-2-medium text-text-tertiary">{catLabel(r.category)} · {shortDate(r.date)}</p>
                </div>
                <p className="w-20 text-end text-body-medium tabular-nums">{inr(r.amount_paise)}</p>
                <Chip variant="caption" color="lime" className="w-20 justify-center">+{days(r.days_regained)}</Chip>
              </Row>
            ))}
          </Rows>
        </Panel>
        <div className="flex min-w-0 flex-col gap-4">
          <Panel title="Where you land on payday" sub="Balance the day before payday, across every simulated month" icon={ChartBar} className="flex-1" bodyClassName="flex flex-col">
            <PaydayHistogram data={data} />
          </Panel>
          {data.similar_month && (
            <Panel title={`This month looks like ${data.similar_month.label}`} sub="Closest past month by the shape of your balance" icon={TrendUp}
              action={<Chip variant="caption" color={data.similar_month.then_went_broke ? "rose" : "lime"}>{data.similar_month.then_went_broke ? "ran out" : "made it"}</Chip>}>
              <SimilarSpark this_={data.similar_month.overlay_this} then={data.similar_month.overlay_then} />
            </Panel>
          )}
        </div>
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

function SimilarSpark({ this_, then }: { this_: number[]; then: number[] }) {
  const W = 600, H = 120;
  const n = Math.max(then.length, this_.length, 2);
  const max = Math.max(1.1, ...then, ...this_);
  const pts = (a: number[]) => a.map((v, i) => `${((i / (n - 1)) * W).toFixed(1)},${(H - (Math.max(v, 0) / max) * H).toFixed(1)}`).join(" ");
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-32 w-full" role="img" aria-label="This month's balance curve against the most similar past month">
        <polyline points={pts(then)} fill="none" stroke="var(--color-chart-neutral)" strokeWidth="2" strokeDasharray="5 5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <polyline points={pts(this_)} fill="none" stroke="var(--color-accent-500)" strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-2 flex gap-4"><Legend swatch="var(--color-accent-500)" label="This month so far" /><Legend swatch="var(--color-chart-neutral)" label="That month" dashed /></div>
    </>
  );
}

/** Histogram of payday balances over all futures; bins under the broke line are orange. */
export function PaydayHistogram({ data }: { data: ForecastResponse }) {
  const H = data.horizon_days;
  const ends = data.paths.balances_paise.map((p) => p[Math.min(H, p.length - 1)]);
  const sorted = [...ends].sort((a, b) => a - b);
  const q = (f: number) => sorted[Math.min(sorted.length - 1, Math.floor(f * sorted.length))];
  // bin over the 1st–99th percentile; the few outliers fall into the edge bins
  const lo = q(0.01), hi = q(0.99) + 1;
  const B = 24, w = (hi - lo) / B || 1;
  const bins = Array.from({ length: B }, (_, i) => ({ from: lo + i * w, n: 0 }));
  for (const e of ends) bins[Math.max(0, Math.min(B - 1, Math.floor((e - lo) / w)))].n++;
  const max = Math.max(...bins.map((b) => b.n), 1);
  const med = q(0.5);
  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-title-2-medium text-text-primary tabular-nums">{inr0(med)}<span className="ms-2 text-body-medium text-text-tertiary">typical</span></p>
        <p className="text-body-2-medium text-text-tertiary tabular-nums">Most land {inr0(data.band.p10[H])} – {inr0(data.band.p90[H])}</p>
      </div>
      <div className="mt-4 flex min-h-36 flex-1 items-end gap-1" role="img" aria-label={`Typical balance on payday ${inr0(med)} across ${ends.length} futures`}>
        {bins.map((b, i) => (
          <span key={i} title={`${inr0(Math.max(0, b.from))}+ · ${b.n} futures`}
            className={cx("animate-bar-rise flex-1 rounded-t-md", b.from + w <= data.broke_line_paise ? "bg-orange-500" : "bg-accent-500/80")}
            style={{ height: `${Math.max(b.n ? 4 : 0, (b.n / max) * 100)}%`, animationDelay: `${i * 22}ms` }} />
        ))}
      </div>
      <div className="mt-2 flex justify-between text-caption-1-medium text-text-tertiary tabular-nums">
        <span>{inr0(Math.max(0, lo))}</span><span>{inr0(hi)}</span>
      </div>
    </>
  );
}
