import { useEffect, useRef } from "react";
import { Info } from "@phosphor-icons/react";
import { CloseButton } from "@/components/base/buttons/close-button";
import { Chip } from "@/components/base/badges/chip";
import type { Fact, ForecastResponse } from "../types";

/** "Why?" sheet: every number on screen opens here with its value, how it was computed and its inputs. */
export function EvidenceSheet({ fact, data, onClose }: { fact: Fact | null; data: ForecastResponse | null; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!fact) return;
    ref.current?.focus();
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [fact, onClose]);
  if (!fact) return null;
  const inputs = data ? [
    ["History", `${data.model.history_from} → ${data.model.history_to}`],
    ["Futures", String(data.n_futures)],
    ["Seed", String(data.seed)],
    ["Model", data.model.model_version || data.model.spend_model],
    ["Anchored", data.model.anchored ? "yes, to the TabPFN direct model" : "no"],
    ["Calibrated", data.model.calibrated ? `yes, k = ${data.model.spread_k}` : "no (k = 1)"],
  ] : [];
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="ev-title">
      <button className="absolute inset-0 cursor-pointer bg-black/30" aria-label="Close" tabIndex={-1} onClick={onClose} />
      <div ref={ref} tabIndex={-1} className="relative m-3 flex w-full max-w-md flex-col overflow-y-auto rounded-3xl bg-background-secondary-default p-2 shadow-dropdown outline-none">
        <div className="flex items-center justify-between px-3 pt-2 pb-3">
          <span className="flex items-center gap-2 text-body-medium text-text-secondary"><Info weight="duotone" className="size-5" aria-hidden />Where this number comes from</span>
          <CloseButton size="sm" aria-label="Close" onClick={onClose} />
        </div>
        <div className="rounded-2lg bg-background-inner-default p-5 shadow-card">
          <Chip variant="caption" color="neutral">fact {fact.id}</Chip>
          <h2 id="ev-title" className="mt-3 text-display-4-medium text-text-primary tabular-nums">{fact.text}</h2>
          <p className="mt-1 text-body-regular text-text-secondary">{fact.desc}</p>
          <h3 className="mt-6 text-body-medium text-text-primary">How it was computed</h3>
          <p className="mt-1 text-body-regular text-text-secondary">{fact.how}</p>
          <details className="mt-4">
            <summary className="cursor-pointer text-body-2-medium text-text-tertiary">Technical details</summary>
            <pre className="mt-2 overflow-x-auto rounded-xl bg-background-secondary-default p-3 font-mono text-caption-1-medium text-text-secondary">{JSON.stringify({ kind: fact.kind, value: fact.value, unit: fact.unit, source: fact.source }, null, 2)}</pre>
          </details>
        </div>
        {inputs.length > 0 && (
          <dl className="mt-2 divide-y divide-separator-border rounded-2lg bg-background-inner-default px-5 py-2 shadow-card">
            {inputs.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 py-2"><dt className="text-body-2-medium text-text-tertiary">{k}</dt><dd className="text-end text-body-2-medium text-text-primary tabular-nums">{v}</dd></div>
            ))}
          </dl>
        )}
      </div>
    </div>
  );
}
