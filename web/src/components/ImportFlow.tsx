import { useState } from "react";
import type { ImportReport, ReviewRow } from "../types";
import type { LiveProvider } from "../data/provider";
import { inr } from "../lib/format";

const CATS = ["food_delivery", "campus_food", "groceries_snacks", "transport", "outing", "shopping", "recharge_bills",
  "gaming", "education", "transfer_to_person", "transfer_from_person", "allowance", "refund", "cash_withdrawal", "other"];

export default function ImportFlow({ provider, subject, onSubject, onDone }: {
  provider: LiveProvider; subject: string; onSubject: (s: string) => void; onDone: () => void;
}) {
  const [stage, setStage] = useState<"pick" | "working" | "done" | "error">("pick");
  const [report, setReport] = useState<ImportReport | null>(null);
  const [err, setErr] = useState<string>("");
  const [review, setReview] = useState<ReviewRow[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [anchorsOk, setAnchorsOk] = useState(false);

  const upload = async (f: File) => {
    setStage("working");
    try {
      const r = await provider.importFile(f, subject);
      setReport(r);
      setReview(await provider.review(subject));
      setStage("done");
    } catch (e) {
      const d = (e as { detail?: { detail?: { error?: string; row?: number; expected_paise?: number; found_paise?: number } } }).detail?.detail;
      setErr(d?.error === "reconciliation_failed"
        ? `Reconciliation failed at row ${d.row}: expected balance ${inr(d.expected_paise ?? 0)}, statement says ${inr(d.found_paise ?? 0)}. Nothing was saved.`
        : `Import failed: ${JSON.stringify(d ?? String(e))}`);
      setStage("error");
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <section>
        <h2 className="text-2xl font-medium">Bring your statement</h2>
        <p className="muted text-sm mt-1">It is read on this laptop, checked row by row against the balance, and never leaves it.</p>
        <label className="block mt-4 text-sm">Whose data is this?{" "}
          <input className="border rule rounded px-2 py-1 bg-transparent num ml-2" value={subject}
                 onChange={(e) => onSubject(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))} />
        </label>
        <label className="mt-4 flex flex-col items-center justify-center border-2 border-dashed rule rounded-xl p-10 cursor-pointer text-center"
               onDragOver={(e) => e.preventDefault()}
               onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void upload(f); }}>
          <span className="font-medium">Drop a CSV, XLSX or PDF statement</span>
          <span className="muted text-sm mt-1">or click to choose</span>
          <input type="file" className="sr-only" accept=".csv,.xlsx,.pdf,.txt"
                 onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
        </label>
      </section>

      {stage === "working" && <p className="muted" aria-live="polite">Parsing · reconciling · categorizing…</p>}
      {stage === "error" && <p role="alert" style={{ color: "var(--color-broke)" }}>{err}</p>}

      {stage === "done" && report && (
        <section className="space-y-5" aria-live="polite">
          <div className="rounded-xl border rule p-4">
            <p className="font-medium" style={{ color: "var(--color-made)" }}>✓ Reconciled to the paisa</p>
            <p className="text-sm muted mt-1 num">
              {report.parsed_rows} rows · {report.reconciliation.n_with_balance} balances checked · {report.date_from} → {report.date_to}
              {" · "}opening {inr(report.reconciliation.opening_paise ?? 0)} → closing {inr(report.reconciliation.closing_paise ?? 0)}
            </p>
            {report.enrich && (
              <p className="text-sm mt-2 num">
                categorized: rules {report.enrich.by_rules} · cache {report.enrich.by_cache} · Gemma {report.enrich.by_gemma} · needs review {report.enrich.needs_review}
                {report.enrich.gemma_error && <span className="muted"> (Gemma offline)</span>}
              </p>
            )}
          </div>

          <div className="rounded-xl border rule p-4">
            <h3 className="font-medium">These look like your allowance. Correct?</h3>
            <p className="text-sm muted">from <span className="num">{report.anchor_sender || "?"}</span></p>
            <ul className="mt-2 text-sm num grid grid-cols-2 sm:grid-cols-3 gap-1">
              {report.anchors_detected.map((a) => <li key={a.id}>{a.date} · {inr(a.amount_paise)}</li>)}
            </ul>
            <button className="mt-3 rounded px-3 py-1.5 text-sm font-medium disabled:opacity-50"
                    style={{ background: "var(--fg)", color: "var(--bg)" }} disabled={anchorsOk}
                    onClick={async () => { await provider.confirmAnchors(subject, report.anchors_detected.map((a) => a.id)); setAnchorsOk(true); }}>
              {anchorsOk ? "Confirmed" : "Yes, these are it"}
            </button>
          </div>

          {review.length > 0 && (
            <div className="rounded-xl border rule p-4">
              <h3 className="font-medium">{review.length} rows need a human</h3>
              <div className="max-h-96 overflow-y-auto mt-2">
                <table className="w-full text-sm">
                  <tbody>
                    {review.slice(0, 60).map((r) => (
                      <tr key={r.id} className="dashed-rule">
                        <td className="py-1.5 pr-2 num muted whitespace-nowrap">{r.date.slice(0, 10)}</td>
                        <td className="py-1.5 pr-2 num whitespace-nowrap">{inr(r.amount_paise)}</td>
                        <td className="py-1.5 pr-2 truncate max-w-[16rem]" title={r.raw_narration}>{r.merchant ?? r.raw_narration.slice(0, 40)}</td>
                        <td className="py-1.5">
                          <select className="border rule rounded bg-transparent text-xs px-1 py-0.5" aria-label="category"
                                  value={edits[r.id] ?? r.category ?? "other"} onChange={(e) => setEdits({ ...edits, [r.id]: e.target.value })}>
                            {CATS.map((c) => <option key={c} value={c}>{c.replaceAll("_", " ")}</option>)}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button className="mt-3 rounded px-3 py-1.5 text-sm font-medium" style={{ background: "var(--fg)", color: "var(--bg)" }}
                      onClick={async () => { await provider.saveReview(Object.entries(edits).map(([id, category]) => ({ id, category }))); setEdits({}); setReview(await provider.review(subject)); }}>
                Save corrections
              </button>
            </div>
          )}
          <button className="underline underline-offset-4" onClick={onDone}>See my month →</button>
        </section>
      )}
    </div>
  );
}
