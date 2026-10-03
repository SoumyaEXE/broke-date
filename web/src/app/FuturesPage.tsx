import { useState } from "react";
import { ChartLineUp, Hourglass, Receipt, Shuffle, TrendUp } from "@phosphor-icons/react";
import { SegmentedControl, SegmentedControlItem } from "@/components/base/segmented-control/segmented-control";
import type { ForecastResponse } from "../types";
import { days, inr, shortDate } from "../lib/format";
import FuturesCanvas from "../components/FuturesCanvas";
import EatenCalendar from "../components/EatenCalendar";
import DotGrid from "../components/DotGrid";
import { Legend, Panel, Row, Rows, Tile } from "./kit";
import { catIcon, catLabel } from "./categories";

export function FuturesPage({ data, prev }: { data: ForecastResponse; prev: ForecastResponse | null }) {
  const [view, setView] = useState("paths");
  const n = data.n_futures;
  return (
    <>
      <Panel title={`${n} versions of the rest of your month`}
        sub="Each line is one future, drawn day by day from TabPFN's spending distribution. Lines that dip under the broke line stop there."
        icon={ChartLineUp}
        action={
          <SegmentedControl aria-label="View" selectionMode="single" disallowEmptySelection selectedKeys={new Set([view])}
            onSelectionChange={(k) => { const v = [...k][0]; if (v) setView(String(v)); }}>
            <SegmentedControlItem id="paths">Paths</SegmentedControlItem>
            <SegmentedControlItem id="dots">Dots</SegmentedControlItem>
          </SegmentedControl>
        }>
        <div className="mb-3 flex flex-wrap gap-4">
          <Legend swatch="var(--made)" label={`Made it · ${data.n_make_it}`} />
          <Legend swatch="var(--broke)" label={`Went broke · ${n - data.n_make_it}`} />
          <Legend swatch="var(--color-text-primary)" label="Median path" />
        </div>
        {view === "paths" ? <FuturesCanvas data={data} prev={prev} /> : <div className="py-2"><DotGrid firstBroke={data.paths.first_broke} H={data.horizon_days} /></div>}
        {data.broke_day && (
          <p className="mt-3 text-body-regular text-text-secondary">
            If you do go broke, most likely around <span className="font-medium text-status-orange-text">{shortDate(data.broke_day.median)}</span> (80% of those futures between {shortDate(data.broke_day.lo80)} and {shortDate(data.broke_day.hi80)}).
          </p>
        )}
      </Panel>
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="The month, eaten" sub="Days to payday; plans bite their price in days off the end" icon={Hourglass}>
          <EatenCalendar data={data} />
        </Panel>
        {data.similar_month ? (
          <Panel title={`This month looks like ${data.similar_month.label}`} sub={`Closest past month by the shape of your balance · ${data.similar_month.then_went_broke ? `${data.similar_month.label} went below the line` : `${data.similar_month.label} made it`}`} icon={TrendUp}>
            <SimilarSpark this_={data.similar_month.overlay_this} then={data.similar_month.overlay_then} />
          </Panel>
        ) : (
          <Panel title="Similar month" sub="Needs at least three past months" icon={Shuffle}><p className="text-body-regular text-text-tertiary">Not enough history yet.</p></Panel>
        )}
      </div>
      <Panel title="What if you hadn't?" sub="Days your own money would last longer without each recent purchase" icon={Receipt} flush>
        <Rows>
          {data.recent.slice(0, 8).map((r) => (
            <Row key={r.txn_id}>
              <Tile icon={catIcon(r.category)} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-body-medium text-text-primary">{r.merchant}</p>
                <p className="text-body-2-medium text-text-tertiary">{catLabel(r.category)} · {shortDate(r.date)}</p>
              </div>
              <p className="w-20 text-end text-body-medium tabular-nums">{inr(r.amount_paise)}</p>
              <p className="w-24 text-end text-body-medium text-status-lime-text tabular-nums">+{days(r.days_regained)}</p>
            </Row>
          ))}
        </Rows>
      </Panel>
    </>
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
        <polyline points={pts(then)} fill="none" stroke="var(--color-chart-neutral)" strokeWidth="2" strokeDasharray="5 5" vectorEffect="non-scaling-stroke" />
        <polyline points={pts(this_)} fill="none" stroke="var(--color-accent-500)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-2 flex gap-4"><Legend swatch="var(--color-accent-500)" label="This month so far" /><Legend swatch="var(--color-chart-neutral)" label="That month" dashed /></div>
    </>
  );
}
