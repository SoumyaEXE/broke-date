import { useState } from "react";
import { CheckCircle, FileArrowUp, ListChecks, Wallet } from "@phosphor-icons/react";
import { Button } from "@/components/base/buttons/button";
import { Chip } from "@/components/base/badges/chip";
import { Select, SelectItem } from "@/components/base/select/select";
import type { ImportReport, ReviewRow } from "../types";
import type { LiveProvider } from "../data/provider";
import { inr, shortDate } from "../lib/format";
import { Panel, Row, Rows, Tile, duo } from "./kit";
import { catIcon, catLabel } from "./categories";

const CATS = ["food_delivery", "campus_food", "groceries_snacks", "transport", "outing", "shopping", "recharge_bills",
  "gaming", "education", "transfer_to_person", "transfer_from_person", "allowance", "refund", "cash_withdrawal", "other"];

export function ImportPage({ provider, subject, onDone }: { provider: LiveProvider; subject: string; onDone: () => void }) {
  const [stage, setStage] = useState<"pick" | "working" | "done" | "error">("pick");
  const [rep, setRep] = useState<ReviewRow[] | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [err, setErr] = useState("");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [anchorsOk, setAnchorsOk] = useState(false);
  const [drag, setDrag] = useState(false);

  const upload = async (f: File) => {
    setStage("working");
    try {
      const r = await provider.importFile(f, subject);
      setReport(r);
      setRep(await provider.review(subject));
      setStage("done");
    } catch (e) {
      const d = (e as { detail?: { detail?: { error?: string; row?: number; expected_paise?: number; found_paise?: number } } }).detail?.detail;
      setErr(d?.error === "reconciliation_failed"
        ? `Row ${d.row} doesn't add up: expected balance ${inr(d.expected_paise ?? 0)}, statement says ${inr(d.found_paise ?? 0)}. Nothing was saved.`
        : `Import failed: ${JSON.stringify(d ?? String(e))}`);
      setStage("error");
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
      <Panel title="Bring your statement" sub="Read on this laptop, checked row by row against the balance, never uploaded" icon={FileArrowUp}>
        <label onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) void upload(f); }}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition ${drag ? "border-accent-400 bg-accent-50" : "border-border-button-default hover:bg-background-primary-hover"}`}>
          <FileArrowUp weight="duotone" className="size-9 text-accent-500" aria-hidden />
          <span className="mt-3 text-body-medium text-text-primary">Drop a CSV, XLSX or PDF statement</span>
          <span className="text-body-2-medium text-text-tertiary">or click to choose · saved as “{subject}”</span>
          <input type="file" className="sr-only" accept=".csv,.xlsx,.pdf,.txt" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
        </label>
        {stage === "working" && <p className="mt-3 text-body-medium text-text-secondary" aria-live="polite">Parsing · reconciling · categorizing…</p>}
        {stage === "error" && <p role="alert" className="mt-3 rounded-xl bg-status-rose-background px-3 py-2 text-body-medium text-status-rose-text">{err}</p>}
        {report && (
          <div className="mt-4 rounded-xl bg-status-lime-background px-3 py-2.5 text-body-medium text-status-lime-text">
            <p className="flex items-center gap-1.5"><CheckCircle weight="duotone" className="size-5" aria-hidden />Reconciled to the paisa</p>
            <p className="text-body-2-medium tabular-nums">{report.parsed_rows} rows · {report.reconciliation.n_with_balance} balances checked · {report.date_from} → {report.date_to}</p>
            {report.enrich && <p className="text-body-2-medium tabular-nums">rules {report.enrich.by_rules} · Gemma {report.enrich.by_gemma} · needs review {report.enrich.needs_review}{report.enrich.gemma_error ? " (Gemma offline)" : ""}</p>}
          </div>
        )}
      </Panel>

      {report && (
        <div className="flex flex-col gap-4">
          <Panel title="These look like your allowance" sub={`from ${report.anchor_sender || "?"} · correct?`} icon={Wallet} flush
            action={<Button variant="primary" size="xs" disabled={anchorsOk} onClick={async () => { await provider.confirmAnchors(subject, report.anchors_detected.map((a) => a.id)); setAnchorsOk(true); }}>{anchorsOk ? "Confirmed" : "Yes, these"}</Button>}>
            <Rows>
              {report.anchors_detected.slice(0, 6).map((a) => (
                <Row key={a.id}><Tile icon={Wallet} tone="accent" /><p className="flex-1 text-body-medium tabular-nums">{shortDate(a.date)}</p><p className="text-body-medium tabular-nums">{inr(a.amount_paise)}</p></Row>
              ))}
            </Rows>
          </Panel>
          {rep && rep.length > 0 && (
            <Panel title={`${rep.length} rows need a human`} sub="Fix a category once; similar rows learn from it" icon={ListChecks} flush
              action={<Button variant="secondary" size="xs" disabled={!Object.keys(edits).length} onClick={async () => { await provider.saveReview(Object.entries(edits).map(([id, category]) => ({ id, category }))); setEdits({}); setRep(await provider.review(subject)); }}>Save</Button>}>
              <Rows>
                {rep.slice(0, 12).map((r) => (
                  <Row key={r.id}>
                    <Tile icon={catIcon(edits[r.id] ?? r.category)} />
                    <div className="min-w-0 flex-1"><p className="truncate text-body-medium">{r.merchant ?? r.raw_narration.slice(0, 32)}</p><p className="text-body-2-medium text-text-tertiary tabular-nums">{inr(r.amount_paise)} · {shortDate(r.date.slice(0, 10))}</p></div>
                    <Select aria-label="Category" selectedKey={edits[r.id] ?? r.category ?? "other"} onSelectionChange={(k) => setEdits({ ...edits, [r.id]: String(k) })} className="w-44">
                      {CATS.map((c) => <SelectItem key={c} id={c}>{catLabel(c)}</SelectItem>)}
                    </Select>
                  </Row>
                ))}
              </Rows>
            </Panel>
          )}
          <Button variant="primary" size="medium" leadingIcon={duo(CheckCircle)} onClick={onDone}>See my month</Button>
          <Chip variant="caption" color="neutral" className="self-start">Statements stay in {"$BROKEDATE_DATA_DIR"}, outside git</Chip>
        </div>
      )}
    </div>
  );
}
