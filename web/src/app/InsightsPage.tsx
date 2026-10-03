/* Insights: the other things TabPFN does with the same statement. Unusual spends (anomalies from its predicted
 * amount distribution), festival heads-ups (measured from last year), and how the categorizers compare. */
import { useEffect, useState } from "react";
import { CalendarStar, ListChecks, MagnifyingGlass, WarningCircle } from "@phosphor-icons/react";
import { Chip } from "@/components/base/badges/chip";
import { cx } from "@/utils/cx";
import type { ForecastResponse, Insights, LabelsReport, UnusualSpend } from "../types";
import type { DataProvider } from "../data/provider";
import { inr, inr0, pct, shortDate } from "../lib/format";
import { Empty, Panel, Row, Rows, Tile } from "./kit";
import { catIcon, catLabel } from "./categories";

export function InsightsPage({ data, provider }: { data: ForecastResponse; provider: DataProvider }) {
  const [ins, setIns] = useState<Insights | null | undefined>(undefined);
  const [labels, setLabels] = useState<LabelsReport | null | undefined>(undefined);
  useEffect(() => {
    void provider.insights().then(setIns);
    void provider.labels().then(setLabels);
  }, [provider, data.as_of]);
  const u = ins?.unusual;
  const fest = data.context?.upcoming ?? [];
  const next = fest[0];

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Fig icon={WarningCircle} label="Unusual spends" value={u ? String(u.unusual.length) : "–"} sub={u ? `last ${Math.round(u.window_days / 7)} weeks` : "checking…"} tone={u && u.unusual.length ? "orange" : undefined} />
        <Fig icon={MagnifyingGlass} label="Spends checked by TabPFN" value={u ? String(u.n_checked) : "–"} sub={u ? `learned from ${u.n_train} earlier ones` : ""} />
        <Fig icon={CalendarStar} label="Coming up" value={next ? next.name.split(" / ")[0] : "Nothing soon"} sub={next ? (next.days_until === 0 ? "happening now" : `in ${next.days_until} days`) : "next 2 months"} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Panel title="Unusual spends" icon={WarningCircle} flush
          sub="TabPFN learned what each kind of spend normally costs you; these sit far above that range">
          {ins === undefined ? <Skeleton /> : !u ? <Empty>Not available yet.</Empty> : u.note ? <Empty>{u.note}.</Empty> : u.unusual.length === 0 ? (
            <Empty>Nothing unusual in the last {Math.round(u.window_days / 7)} weeks. TabPFN checked {u.n_checked} spends.</Empty>
          ) : (
            <Rows>{u.unusual.slice(0, 8).map((s) => <UnusualRow key={s.txn_id} s={s} />)}</Rows>
          )}
          {u && u.unusual.length > 0 && (
            <div className="flex flex-wrap gap-4 border-t border-separator-border px-4 py-2.5 text-caption-1-medium text-text-tertiary">
              <span className="flex items-center gap-1.5"><span className="h-2 w-5 rounded-full bg-accent-200" />Usual range</span>
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-orange-500" />What you paid</span>
            </div>
          )}
        </Panel>

        <div className="flex min-w-0 flex-col gap-4">
          <Panel title="Festival heads-up" icon={CalendarStar} flush sub="What the same festival cost last time, from your statement">
            {fest.length === 0 ? <Empty>No festivals in the next two months.</Empty> : (
              <Rows>
                {fest.map((f) => (
                  <Row key={f.name + f.start} className="items-start">
                    <Tile icon={CalendarStar} tone="accent" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-body-medium text-text-primary">{f.name}</p>
                        <Chip variant="caption" color={f.days_until <= 7 ? "orange" : "neutral"}>{f.days_until === 0 ? "now" : `in ${f.days_until} days`}</Chip>
                      </div>
                      <p className="text-body-2-medium text-text-tertiary">{shortDate(f.start)}{f.end !== f.start ? ` – ${shortDate(f.end)}` : ""}</p>
                      {f.last ? (
                        <p className="mt-1.5 text-body-2-medium text-text-secondary">
                          Last time you spent <span className="text-text-primary tabular-nums">{inr(f.last.spent_paise)}</span> in {f.last.days} days
                          {f.last.extra_paise > 0 && <>, <span className="text-status-orange-text tabular-nums">{inr0(f.last.extra_paise)} more</span> than a normal stretch</>}.
                        </p>
                      ) : <p className="mt-1.5 text-body-2-medium text-text-tertiary">Not in your statement yet, so no comparison.</p>}
                    </div>
                  </Row>
                ))}
              </Rows>
            )}
          </Panel>

          <Panel title="Who sorted your spending" icon={ListChecks} sub="Share of rows labelled correctly, against the sample's ground truth" className="flex-1">
            {labels === undefined ? <Skeleton /> : !labels?.compare ? (
              <p className="text-body-2-medium text-text-tertiary">Not measured yet. Run <code className="font-mono">brokedate eval-labels</code>.</p>
            ) : <LabelBars report={labels} />}
          </Panel>
        </div>
      </div>
    </>
  );
}

function UnusualRow({ s }: { s: UnusualSpend }) {
  const max = Math.max(s.amount_paise, s.usual_hi_paise) * 1.1 || 1;
  const x = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  return (
    <Row>
      <Tile icon={catIcon(s.category)} tone="orange" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="truncate text-body-medium text-text-primary">{s.merchant}</p>
          <p className="shrink-0 text-body-medium text-text-primary tabular-nums">{inr(s.amount_paise)}</p>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <div className="relative h-2 flex-1 rounded-full bg-background-secondary-default" aria-hidden>
            <span className="absolute inset-y-0 rounded-full bg-accent-200" style={{ left: x(Math.min(s.usual_paise, s.usual_hi_paise)), width: `calc(${x(s.usual_hi_paise)} - ${x(s.usual_paise)})` }} />
            <span className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-orange-500 shadow-card" style={{ left: x(s.amount_paise) }} />
          </div>
          <span className="w-28 shrink-0 text-end text-caption-1-medium text-text-tertiary tabular-nums">usual {inr0(s.usual_paise)}–{inr0(s.usual_hi_paise)}</span>
        </div>
        <p className="mt-1 text-caption-1-medium text-text-tertiary">
          {catLabel(s.category)} · {shortDate(s.date)} · bigger than {pct(s.percentile)} of what TabPFN expected{s.times_seen === 0 ? " · first time here" : ""}
        </p>
      </div>
    </Row>
  );
}

const VARIANTS: [string, string][] = [["rules", "Rules only"], ["rules+tabpfn", "Rules + TabPFN"], ["rules+gemma", "Rules + Gemma"], ["rules+tabpfn+gemma", "Rules + TabPFN + Gemma"]];

function LabelBars({ report }: { report: LabelsReport }) {
  const rows = VARIANTS.filter(([k]) => report.compare?.[k]?.accuracy != null);
  return (
    <div className="flex flex-col gap-3">
      {rows.map(([k, label]) => {
        const v = report.compare![k];
        return (
          <div key={k}>
            <div className="flex justify-between text-body-2-medium">
              <span className="text-text-primary">{label}</span>
              <span className="text-text-secondary tabular-nums">{pct(v.accuracy ?? 0)}{v.needs_review ? ` · ${v.needs_review} to review` : ""}</span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-background-secondary-default">
              <div className={cx("animate-[page-reveal_600ms_ease-out_both] h-full rounded-full", k.includes("tabpfn") ? "bg-accent-500" : "bg-chart-neutral")} style={{ width: `${(v.accuracy ?? 0) * 100}%` }} />
            </div>
          </div>
        );
      })}
      <p className="text-caption-1-medium text-text-tertiary">On {report.n_rows} simulated statement rows{report.gemma_model ? ` · Gemma: ${report.gemma_model}` : ""}.</p>
    </div>
  );
}

function Fig({ icon: I, label, value, sub, tone }: { icon: typeof WarningCircle; label: string; value: string; sub: string; tone?: "orange" }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-background-secondary-default p-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-background-inner-default shadow-card">
        <I weight="duotone" className={cx("size-5", tone === "orange" ? "text-status-orange-text" : "text-accent-600")} aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="truncate text-body-2-medium text-text-tertiary">{label}</p>
        <p className={cx("truncate text-title-3-semibold tabular-nums", tone === "orange" ? "text-status-orange-text" : "text-text-primary")}>{value} <span className="text-body-2-medium text-text-tertiary">{sub}</span></p>
      </div>
    </div>
  );
}

function Skeleton() {
  return <div className="flex flex-col gap-3 p-4">{[0, 1, 2].map((i) => <span key={i} className="h-10 animate-pulse rounded-xl bg-background-secondary-default" />)}</div>;
}
