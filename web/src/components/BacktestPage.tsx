import { useEffect, useState } from "react";
import type { BacktestSummary, CI } from "../types";
import type { DataProvider } from "../data/provider";

const NAMES: Record<string, string> = {
  M1: "TabPFN simulation (anchored, calibrated)",
  M1a: "TabPFN, no anchoring",
  M1b: "TabPFN, no calibration",
  B1: "Burn rate (last 14 days)",
  B2: "Same point last month",
  B3: "LightGBM quantiles, same simulator",
};

function fmt(c: CI | null | undefined, digits = 3) {
  if (!c || !Number.isFinite(c.point)) return "–";
  return `${c.point.toFixed(digits)} [${c.lo.toFixed(digits)}, ${c.hi.toFixed(digits)}]`;
}

export default function BacktestPage({ provider }: { provider: DataProvider }) {
  const [s, setS] = useState<BacktestSummary | null | undefined>(undefined);
  useEffect(() => { void provider.backtest().then(setS); }, [provider]);
  if (s === undefined) return <p className="muted">loading…</p>;
  if (s === null) return <p className="muted">[[pending: backtest]] No evaluation has run on this data yet.</p>;
  const m1 = s.models.M1;
  const lead = m1.lead_time;
  const verdicts = Object.entries(s.diff_vs_M1);
  const sim = (s.meta?.subject as string) === "sim";

  return (
    <div className="space-y-8 max-w-4xl">
      <section>
        <p className="text-xs uppercase tracking-[0.18em] muted">It grades itself{sim ? " · simulated persona" : ""}</p>
        <h2 className="text-2xl sm:text-3xl font-medium mt-2 leading-snug">
          {Number.isFinite(lead.mean_lead) && lead.n_broke_cycles > 0
            ? <>On {sim ? "the" : "your"} past <span className="num">{s.n_cycles}</span> months, I flagged trouble on average{" "}
                <span className="num" style={{ color: "var(--color-made)" }}>{lead.mean_lead.toFixed(1)}</span> days before it happened.</>
            : <>Evaluated on <span className="num">{s.n_origins}</span> past days across <span className="num">{s.n_cycles}</span> months.</>}
        </h2>
        <p className="muted mt-2 text-sm">
          Rules were committed to the repository before looking at any results on real data: walk-forward, every model fit only on
          days before each forecast date, intervals from a block bootstrap over months ({String(s.meta?.bootstrap_reps ?? "")} replicates, 90%).
          {lead.n_no_warning > 0 && ` In ${lead.n_no_warning} of ${lead.n_broke_cycles} broke months there was no warning in time.`}
        </p>
      </section>

      <section className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="text-left font-medium pb-2">Lower is better for Brier and CRPS; coverage should be near 80%.</caption>
          <thead className="muted text-xs">
            <tr className="text-left">
              <th className="py-2 pr-3 font-normal">model</th>
              <th className="py-2 pr-3 font-normal">Brier (went broke?)</th>
              <th className="py-2 pr-3 font-normal">CRPS (end balance, ₹)</th>
              <th className="py-2 pr-3 font-normal">80% interval coverage</th>
              <th className="py-2 font-normal">lead time</th>
            </tr>
          </thead>
          <tbody className="num">
            {Object.entries(s.models).map(([k, v]) => (
              <tr key={k} className="dashed-rule" style={k === "M1" ? { fontWeight: 600 } : undefined}>
                <td className="py-2 pr-3 font-sans">{NAMES[k] ?? k}</td>
                <td className="py-2 pr-3">{fmt(v.brier)}</td>
                <td className="py-2 pr-3">{fmt(v.crps, 0)}</td>
                <td className="py-2 pr-3">{v.coverage80 ? fmt(v.coverage80, 2) : "n/a (point)"}</td>
                <td className="py-2">{Number.isFinite(v.lead_time.mean_lead) ? `${v.lead_time.mean_lead.toFixed(1)} d` : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h3 className="font-medium">Did TabPFN beat the baselines? (pre-registered rule: the 90% interval of the Brier difference must be entirely below zero)</h3>
        <ul className="mt-3 grid sm:grid-cols-2 gap-2 text-sm">
          {verdicts.map(([k, d]) => (
            <li key={k} className="rounded-lg border rule p-3">
              <p className="muted text-xs">vs {NAMES[k] ?? k}</p>
              <p className="mt-1 font-medium" style={{ color: d.brier.verdict === "TabPFN better" ? "var(--color-made)" : d.brier.verdict === "baseline better" ? "var(--color-broke)" : undefined }}>
                {d.brier.verdict}
              </p>
              <p className="num text-xs muted mt-1">ΔBrier {fmt(d.brier)} · ΔCRPS {fmt(d.crps, 0)}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="grid sm:grid-cols-[1fr_1fr] gap-6 items-center">
        <div>
          <h3 className="font-medium">Calibration</h3>
          <p className="text-sm muted mt-1">How often the real end-of-month balance landed inside the claimed 80% range, before and after spread calibration (fit only on earlier months).</p>
        </div>
        <CoverageChart before={s.calibration.coverage80_uncalibrated} after={s.calibration.coverage80_calibrated} />
      </section>

      <section className="rounded-xl border rule p-4 text-sm">
        <h3 className="font-medium">Honest limitations</h3>
        <ul className="list-disc pl-5 mt-2 space-y-1 muted">
          <li>Only <span className="num">{s.n_cycles}</span> months of history: intervals are wide{m1.brier ? <> (Brier 90% CI width <span className="num">{(m1.brier.hi - m1.brier.lo).toFixed(3)}</span>)</> : null}.</li>
          <li>One person's model, fit on their own history. It says nothing about anyone else until tested.</li>
          <li>Base rate of going broke in the evaluation windows: <span className="num">{Math.round(s.base_rate * 100)}%</span>.</li>
          {verdicts.filter(([, d]) => d.brier.verdict !== "TabPFN better").map(([k, d]) => (
            <li key={k}>Against {NAMES[k] ?? k}: {d.brier.verdict}.</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function CoverageChart({ before, after }: { before: CI | null; after: CI | null }) {
  const W = 320, H = 120, x0 = 90;
  const bar = (c: CI | null, y: number, label: string, color: string) => {
    if (!c) return null;
    const sx = (v: number) => x0 + v * (W - x0 - 10);
    return (
      <g key={label}>
        <text x={0} y={y + 12} fontSize="12" fill="var(--mut)">{label}</text>
        <rect x={x0} y={y} width={sx(c.point) - x0} height={16} fill={color} rx={3} />
        <line x1={sx(c.lo)} x2={sx(c.hi)} y1={y + 8} y2={y + 8} stroke="var(--fg)" strokeWidth={1.5} />
        <text x={sx(c.point) + 6} y={y + 12} fontSize="11" fill="var(--fg)" style={{ fontFamily: "IBM Plex Mono" }}>{Math.round(c.point * 100)}%</text>
      </g>
    );
  };
  const target = x0 + 0.8 * (W - x0 - 10);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-sm" role="img"
         aria-label={`coverage before ${before ? Math.round(before.point * 100) : "?"}%, after ${after ? Math.round(after.point * 100) : "?"}%, target 80%`}>
      {bar(before, 20, "before", "var(--mut)")}
      {bar(after, 56, "after", "var(--color-made)")}
      <line x1={target} x2={target} y1={10} y2={86} stroke="var(--color-broke)" strokeDasharray="4 3" />
      <text x={target} y={102} fontSize="11" textAnchor="middle" fill="var(--color-broke)">target 80%</text>
    </svg>
  );
}
