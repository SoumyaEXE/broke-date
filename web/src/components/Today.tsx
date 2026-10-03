import type { Fact, ForecastResponse } from "../types";
import type { DataProvider } from "../data/provider";
import { daysBetween, inr, pct, shortDate } from "../lib/format";
import FuturesCanvas from "./FuturesCanvas";
import EatenCalendar from "./EatenCalendar";
import PlanList from "./PlanList";
import RecentList from "./RecentList";
import LetterCard from "./LetterCard";
import DotGrid from "./DotGrid";
import InfoButton from "./InfoButton";
import SimilarMonthCard from "./SimilarMonthCard";

interface Props {
  data: ForecastResponse; prev: ForecastResponse | null; busy: boolean; provider: DataProvider;
  onUpdate: (fn: () => Promise<ForecastResponse>) => Promise<void>; openFact: (id: string | undefined, pool?: Record<string, Fact>) => void;
}

function factId(d: ForecastResponse, kind: string, ref?: string): string | undefined {
  return Object.values(d.facts).find((f) => f.kind === kind && (ref === undefined || f.subject_ref === ref))?.id;
}

export default function Today({ data, prev, busy, provider, onUpdate, openFact }: Props) {
  const recomputed = (data as ForecastResponse & { recomputedInBrowser?: boolean }).recomputedInBrowser;
  const delta = prev && prev.as_of === data.as_of ? data.n_make_it - prev.n_make_it : 0;
  const N = data.n_futures;
  const left = daysBetween(data.as_of, data.next_anchor_date);

  return (
    <div className="grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      {/* LEFT: the human numbers */}
      <section aria-labelledby="hero" className="space-y-6 min-w-0">
        <div className="receipt rounded-t-xl px-5 pt-5 pb-6">
          <p className="text-xs uppercase tracking-[0.18em] muted">Safe to spend today</p>
          <div className="flex items-start gap-2 mt-1">
            <h2 id="hero" className="num font-bold leading-none tracking-tight text-[clamp(3.2rem,9vw,5.5rem)]"
                aria-live="polite">
              {data.nothing_safe ? inr(0) : inr(data.safe_to_spend_paise)}
            </h2>
            <InfoButton label="How is this computed?" onClick={() => openFact(data.fact_ids.safe_to_spend ?? factId(data, "safe_to_spend"))} />
          </div>
          <p className="mt-3 text-sm muted max-w-sm">
            {data.nothing_safe
              ? <>Nothing is safe today: there's already a <span className="num font-medium" style={{ color: "var(--color-broke)" }}>{pct(data.risk_now)}</span> chance of going broke before payday.</>
              : <>Keeps your chance of going broke before payday at or below <span className="num">{pct(data.risk_tolerance)}</span>.</>}
          </p>
          <div className="dashed-rule mt-4 pt-3 flex justify-between text-sm">
            <span className="muted">Balance now</span>
            <span className="num">{inr(data.balance_now_paise)}</span>
          </div>
          <div className="flex justify-between text-sm mt-1">
            <span className="muted">Allowance on</span>
            <span className="num">{shortDate(data.next_anchor_date)} · {left}d</span>
          </div>
          <div className="flex justify-between text-sm mt-1">
            <span className="muted">Your money alone lasts</span>
            <button className="num underline decoration-dotted underline-offset-4" onClick={() => openFact(factId(data, "runway_days"))}>
              {data.runway_days_mean.toFixed(1)} days
            </button>
          </div>
        </div>

        <div>
          <p className="text-2xl sm:text-3xl font-medium leading-tight">
            <button onClick={() => openFact(factId(data, "n_make_it"))} className="num underline decoration-dotted underline-offset-4"
                    style={{ color: "var(--color-made)" }}>{data.n_make_it}</button>
            <span className="muted"> of </span><span className="num">{N}</span>
            <span> futures make it to payday.</span>
          </p>
          {delta !== 0 && (
            <p className="mt-2 inline-block num text-sm px-2 py-0.5 rounded-full"
               style={{ background: delta > 0 ? "var(--color-made)" : "var(--color-broke)", color: "#fff" }}>
              {delta > 0 ? "+" : ""}{delta} futures {delta > 0 ? "make it" : "lost"}
            </p>
          )}
          {data.broke_day && (
            <p className="mt-3 muted">
              If you do go broke, most likely around the{" "}
              <button className="num underline decoration-dotted underline-offset-4" style={{ color: "var(--color-broke)" }}
                      onClick={() => openFact(factId(data, "broke_day_median"))}>{shortDate(data.broke_day.median)}</button>
              {" "}(80% range {shortDate(data.broke_day.lo80)} to {shortDate(data.broke_day.hi80)}).
            </p>
          )}
          <div className="mt-4 lg:hidden"><DotGrid firstBroke={data.paths.first_broke} H={data.horizon_days} /></div>
        </div>

        <PlanList data={data} provider={provider} busy={busy} onUpdate={onUpdate} openFact={openFact} factId={(r) => factId(data, "plan_day_cost", r)} />
        <RecentList data={data} />
      </section>

      {/* RIGHT: the wonder screen */}
      <section className="space-y-6 min-w-0" aria-label="simulated futures">
        <div className="rounded-xl border rule p-3 sm:p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-1 pb-2">
            <h3 className="font-medium">500 versions of the rest of your month</h3>
            <p className="text-xs muted">
              <Legend color="var(--color-made)" label={`made it · ${data.n_make_it}`} />{"  "}
              <Legend color="var(--color-broke)" label={`went broke · ${N - data.n_make_it}`} />
            </p>
          </div>
          <FuturesCanvas data={data} prev={prev} />
          {recomputed && (
            <p className="text-xs muted px-1 pt-2">Recomputed in your browser from the same {N} futures (same random draws as the engine).</p>
          )}
        </div>
        <EatenCalendar data={data} />
        <LetterCard provider={provider} data={data} openFact={openFact} />
        {data.similar_month && <SimilarMonthCard sm={data.similar_month} />}
      </section>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 mr-3">
      <span className="inline-block w-3 h-[3px] rounded" style={{ background: color }} aria-hidden />
      <span className="num">{label}</span>
    </span>
  );
}
