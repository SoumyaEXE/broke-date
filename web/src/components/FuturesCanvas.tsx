import { useEffect, useMemo, useRef, useState } from "react";
import type { ForecastResponse } from "../types";
import { inr, shortDate } from "../lib/format";

interface Props { data: ForecastResponse; prev: ForecastResponse | null }

const MADE = [15, 118, 110];
const BROKE = [217, 72, 15];
const ANIM_MS = 600;

function ease(t: number) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

export default function FuturesCanvas({ data, prev }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const [w, setW] = useState(640);
  const [hover, setHover] = useState<number | null>(null);
  const progress = useRef(1);
  const H = data.horizon_days;
  const h = Math.max(260, Math.min(420, Math.round(w * 0.58)));

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver((e) => setW(Math.round(e[0].contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const from = prev && prev.as_of === data.as_of && prev.paths.balances_paise.length === data.paths.balances_paise.length
    ? prev : null;

  const yMax = useMemo(() => {
    let m = data.balance_now_paise;
    for (const v of data.band.p90) m = Math.max(m, v);
    if (from) for (const v of from.band.p90) m = Math.max(m, v);
    return m * 1.08 + 1;
  }, [data, from]);

  const pad = { l: 56, r: 12, t: 12, b: 28 };
  const x = (t: number) => pad.l + (t / Math.max(H, 1)) * (w - pad.l - pad.r);
  const y = (paise: number) => pad.t + (1 - Math.max(paise, 0) / yMax) * (h - pad.t - pad.b);

  useEffect(() => {
    const c = cv.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const start = performance.now();
    progress.current = from && !reduce ? 0 : 1;

    const css = getComputedStyle(document.documentElement);
    const fg = css.getPropertyValue("--fg").trim() || "#14110f";
    const mut = css.getPropertyValue("--mut").trim() || "#6b6460";
    const rule = css.getPropertyValue("--rule").trim() || "#d8d2c6";

    const draw = () => {
      const p = ease(progress.current);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      // grid + axes
      ctx.font = "11px 'IBM Plex Mono', monospace";
      ctx.fillStyle = mut; ctx.strokeStyle = rule; ctx.lineWidth = 1;
      const steps = 4;
      for (let i = 0; i <= steps; i++) {
        const v = (yMax / steps) * i;
        const yy = y(v);
        ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.moveTo(pad.l, yy); ctx.lineTo(w - pad.r, yy); ctx.stroke();
        ctx.globalAlpha = 1; ctx.textAlign = "right"; ctx.fillText(inr(Math.round(v / 100) * 100), pad.l - 6, yy + 4);
      }
      const every = Math.max(1, Math.ceil(H / Math.max(2, Math.floor((w - pad.l) / 70))));
      ctx.textAlign = "center";
      for (let t = 0; t <= H; t += every) ctx.fillText(t === 0 ? "today" : shortDate(data.paths.days[t]), x(t), h - 8);

      // 80% band
      const band = (k: "p10" | "p90", t: number) => {
        const a = from ? from.band[k][t] : data.band[k][t];
        return a + (data.band[k][t] - a) * p;
      };
      ctx.beginPath();
      for (let t = 0; t <= H; t++) ctx.lineTo(x(t), y(band("p90", t)));
      for (let t = H; t >= 0; t--) ctx.lineTo(x(t), y(band("p10", t)));
      ctx.closePath(); ctx.fillStyle = fg; ctx.globalAlpha = 0.06; ctx.fill(); ctx.globalAlpha = 1;

      // paths
      const P = data.paths.balances_paise;
      const FB = data.paths.first_broke;
      ctx.lineWidth = 1;
      for (let i = 0; i < P.length; i++) {
        const fb = FB[i];
        const broke = fb >= 1 && fb <= H;
        const end = broke ? fb : H;
        const col = broke ? BROKE : MADE;
        ctx.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},${broke ? 0.16 : 0.08})`;
        ctx.beginPath();
        const src = from ? from.paths.balances_paise[i] : null;
        for (let t = 0; t <= end; t++) {
          const v = src ? src[t] + (P[i][t] - src[t]) * p : P[i][t];
          if (t === 0) ctx.moveTo(x(t), y(v)); else ctx.lineTo(x(t), y(v));
        }
        ctx.stroke();
        if (broke) {
          const v = src ? src[end] + (P[i][end] - src[end]) * p : P[i][end];
          ctx.fillStyle = `rgba(${BROKE[0]},${BROKE[1]},${BROKE[2]},0.5)`;
          ctx.fillRect(x(end) - 1, y(v) - 1, 2, 2);
        }
      }
      // median
      ctx.strokeStyle = fg; ctx.lineWidth = 2.2; ctx.beginPath();
      for (let t = 0; t <= H; t++) {
        const a = from ? from.band.p50[t] : data.band.p50[t];
        const v = a + (data.band.p50[t] - a) * p;
        if (t === 0) ctx.moveTo(x(t), y(v)); else ctx.lineTo(x(t), y(v));
      }
      ctx.stroke();
      // broke line
      const by = y(data.broke_line_paise);
      ctx.setLineDash([6, 5]); ctx.strokeStyle = `rgb(${BROKE.join(",")})`; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(pad.l, by); ctx.lineTo(w - pad.r, by); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = `rgb(${BROKE.join(",")})`; ctx.textAlign = "left";
      ctx.fillText(`broke line ${inr(data.broke_line_paise)}`, pad.l + 6, by - 6);

      if (progress.current < 1) {
        progress.current = Math.min(1, (performance.now() - start) / ANIM_MS);
        raf = requestAnimationFrame(draw);
      }
    };
    draw();
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, from, w, h, yMax]);

  const hv = hover !== null ? Math.max(0, Math.min(H, hover)) : null;
  const label = `${data.n_make_it} of ${data.n_futures} simulated futures stay above the ${inr(data.broke_line_paise)} broke line until ${shortDate(data.next_anchor_date)}.` +
    (data.broke_day ? ` Futures that go broke most often do so around ${shortDate(data.broke_day.median)}.` : "");

  return (
    <div ref={wrap} className="relative select-none">
      <canvas ref={cv} style={{ width: w, height: h, display: "block" }} role="img" aria-label={label}
        onMouseMove={(e) => {
          const r = (e.target as HTMLCanvasElement).getBoundingClientRect();
          const t = Math.round(((e.clientX - r.left - pad.l) / (w - pad.l - pad.r)) * H);
          setHover(t >= 0 && t <= H ? t : null);
        }}
        onMouseLeave={() => setHover(null)} />
      {hv !== null && (
        <div className="pointer-events-none absolute top-2 text-xs num px-2 py-1 rounded border rule"
             style={{ left: Math.min(x(hv) + 8, w - 170), background: "var(--bg)" }}>
          {shortDate(data.paths.days[hv])}: median {inr(Math.round(data.band.p50[hv] / 100) * 100)}
          <div className="muted">80% between {inr(Math.round(data.band.p10[hv] / 100) * 100)} and {inr(Math.round(data.band.p90[hv] / 100) * 100)}</div>
        </div>
      )}
      {hv !== null && (
        <div className="pointer-events-none absolute top-0 bottom-7 w-px" style={{ left: x(hv), background: "var(--mut)", opacity: 0.5 }} />
      )}
      <p className="sr-only">{label}</p>
    </div>
  );
}
