import { useEffect, useRef } from "react";
import type { Fact, ForecastResponse } from "../types";

export default function EvidenceDrawer({ fact, data, onClose }: {
  fact: Fact | null; data: ForecastResponse | null; onClose: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!fact) return;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fact, onClose]);
  if (!fact) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="ev-title">
      <button className="absolute inset-0 bg-black/30" aria-label="close" onClick={onClose} tabIndex={-1} />
      <aside className="relative w-full max-w-md h-full overflow-y-auto p-6 shadow-2xl" style={{ background: "var(--bg)" }}>
        <div className="flex items-start justify-between">
          <p className="text-xs uppercase tracking-[0.18em] muted">Why? · fact <span className="num">{fact.id}</span></p>
          <button ref={ref} onClick={onClose} className="text-sm underline underline-offset-4">close</button>
        </div>
        <h2 id="ev-title" className="num text-4xl font-bold mt-3">{fact.text}</h2>
        <p className="mt-1 muted">{fact.desc}</p>
        <h3 className="mt-6 font-medium">How it was computed</h3>
        <p className="mt-1 text-sm leading-relaxed">{fact.how}</p>
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer muted">technical details</summary>
          <pre className="mt-2 p-3 rounded bg-2 text-xs overflow-x-auto num">{JSON.stringify({ kind: fact.kind, value: fact.value, unit: fact.unit, source: fact.source }, null, 2)}</pre>
        </details>
        {data && (
          <>
            <h3 className="mt-6 font-medium">Inputs</h3>
            <dl className="mt-2 text-sm grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <dt className="muted">history</dt><dd className="num">{data.model.history_from} → {data.model.history_to}</dd>
              <dt className="muted">futures</dt><dd className="num">{data.n_futures}</dd>
              <dt className="muted">seed</dt><dd className="num">{data.seed}</dd>
              <dt className="muted">model</dt><dd className="num">{data.model.model_version || data.model.spend_model}</dd>
              <dt className="muted">anchored</dt><dd>{data.model.anchored ? "yes, to the direct remaining-spend model" : "no"}</dd>
              <dt className="muted">calibrated</dt><dd className="num">{data.model.calibrated ? `yes, k = ${data.model.spread_k}` : "no (k = 1)"}</dd>
              <dt className="muted">engine</dt><dd className="num">v{data.model.engine_version}</dd>
            </dl>
          </>
        )}
      </aside>
    </div>
  );
}
