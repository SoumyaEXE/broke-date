import { useEffect, useRef, useState } from "react";
import type { ForecastResponse } from "../types";
import { addDays, inr, shortDate } from "../lib/format";

/** This month's balance so far vs last month (same day of the cycle), plus TabPFN's median forecast and 80% band
 *  from today to payday. Balances in paise. */
export default function BalanceChart({ data, height = 300 }: { data: ForecastResponse; height?: number }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(600);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver((e) => setW(Math.round(e[0].contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const ctx = data.context;
  const thisBal = ctx?.balance_compare.this ?? [];
  const last = ctx?.balance_compare.last?.balances_paise ?? [];
  const dic = ctx?.cycle.day_in_cycle ?? thisBal.length;
  const start = ctx?.cycle.start ?? data.as_of;
  const H = data.horizon_days;
  const total = Math.max(dic + H + 1, last.length, 2);
  // today's point = start of today's balance (band[0])
  const thisSeries = [...thisBal.slice(0, dic), data.band.p50[0]];
  const fc = data.band;
  const all = [...thisSeries, ...last, ...fc.p90, data.broke_line_paise];
  const yMax = Math.max(...all) * 1.12 + 1;
  const pad = { l: 58, r: 16, t: 14, b: 30 };
  const iw = Math.max(w - pad.l - pad.r, 50);
  const ih = height - pad.t - pad.b;
  const x = (i: number) => pad.l + (i / (total - 1)) * iw;
  const y = (v: number) => pad.t + (1 - Math.max(v, 0) / yMax) * ih;
  const line = (arr: number[], off = 0) => arr.map((v, i) => `${i ? "L" : "M"}${x(i + off).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const fcIdx = (i: number) => dic + i;
  const band = `M${fc.p90.map((v, i) => `${x(fcIdx(i)).toFixed(1)},${y(v).toFixed(1)}`).join(" L")} L${[...fc.p10].reverse().map((v, i) => `${x(fcIdx(fc.p10.length - 1 - i)).toFixed(1)},${y(v).toFixed(1)}`).join(" L")} Z`;
  const area = `${line(thisSeries)} L${x(thisSeries.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;
  const ticks = 5;
  const step = Math.ceil(yMax / 100 / ticks / 100) * 100 * 100 || 10000;
  const xt = Math.max(1, Math.round(total / Math.max(3, Math.floor(iw / 80))));
  const hv = hover;
  const valAt = (i: number) => (i < dic ? thisSeries[i] : fc.p50[i - dic]);

  return (
    <div ref={wrap} className="relative w-full min-w-0 select-none">
      <svg width={w} height={height} role="img" className="block"
           aria-label={`Balance this month so far and the TabPFN median forecast to payday; ${data.n_make_it} of ${data.n_futures} futures stay above the broke line.`}
           onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const i = Math.round(((e.clientX - r.left - pad.l) / iw) * (total - 1)); setHover(i >= 0 && i <= dic + H ? i : null); }}
           onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id="thisFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#f97316" stopOpacity="0.14" /><stop offset="1" stopColor="#f97316" stopOpacity="0.01" /></linearGradient>
        </defs>
        {Array.from({ length: ticks + 1 }, (_, k) => k * step).filter((v) => v <= yMax).map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={w - pad.r} y1={y(v)} y2={y(v)} stroke="#f0f0f3" />
            <text x={pad.l - 10} y={y(v) + 4} textAnchor="end" fontSize="12" fill="#7b7f88" className="num">{inr(v)}</text>
          </g>
        ))}
        {Array.from({ length: total }, (_, i) => i).filter((i) => i % xt === 0).map((i) => (
          <text key={i} x={x(i)} y={height - 8} textAnchor="middle" fontSize="12" fill="#7b7f88">{shortDate(addDays(start, i)).replace(/(st|nd|rd|th) /, " ")}</text>
        ))}
        <path d={band} fill="#f97316" opacity="0.08" />
        <path d={area} fill="url(#thisFill)" />
        {last.length > 1 && <path d={line(last)} fill="none" stroke="#121316" strokeWidth="1.6" strokeDasharray="3 4" opacity="0.75" />}
        <path d={line(thisSeries)} fill="none" stroke="#f97316" strokeWidth="2.4" strokeLinejoin="round" />
        <path d={line(fc.p50, dic)} fill="none" stroke="#f97316" strokeWidth="2" strokeDasharray="6 5" strokeLinejoin="round" />
        <line x1={pad.l} x2={w - pad.r} y1={y(data.broke_line_paise)} y2={y(data.broke_line_paise)} stroke="#e5484d" strokeDasharray="4 4" opacity="0.6" />
        <text x={w - pad.r} y={y(data.broke_line_paise) - 6} textAnchor="end" fontSize="11" fill="#e5484d">broke line {inr(data.broke_line_paise)}</text>
        <line x1={x(dic)} x2={x(dic)} y1={pad.t} y2={pad.t + ih} stroke="#121316" opacity="0.12" />
        <text x={x(dic) + 6} y={pad.t + 12} fontSize="11" fill="#7b7f88">today</text>
        <circle cx={x(dic)} cy={y(thisSeries[thisSeries.length - 1])} r="8" fill="#f97316" opacity="0.15" />
        <circle cx={x(dic)} cy={y(thisSeries[thisSeries.length - 1])} r="4" fill="#fff" stroke="#f97316" strokeWidth="2" />
        <text x={x(dic) + 12} y={y(thisSeries[thisSeries.length - 1]) + 4} fontSize="13" fill="#f97316" fontWeight="600" className="num">{inr(thisSeries[thisSeries.length - 1])}</text>
        {hv !== null && <line x1={x(hv)} x2={x(hv)} y1={pad.t} y2={pad.t + ih} stroke="#121316" opacity="0.25" />}
      </svg>
      {hv !== null && (
        <div className="pointer-events-none absolute top-2 rounded-xl border border-line bg-white px-3 py-2 text-[12px] shadow-sm"
             style={{ left: Math.min(x(hv) + 10, w - 190) }}>
          <p className="font-medium">{shortDate(addDays(start, hv))}{hv >= dic ? " · forecast" : ""}</p>
          <p className="num">{hv >= dic ? "median " : ""}{inr(Math.round(valAt(hv) / 100) * 100)}</p>
          {hv >= dic && <p className="muted num">80%: {inr(Math.round(fc.p10[hv - dic] / 100) * 100)} – {inr(Math.round(fc.p90[hv - dic] / 100) * 100)}</p>}
          {last[hv] !== undefined && <p className="muted num">last month: {inr(last[hv])}</p>}
        </div>
      )}
    </div>
  );
}
