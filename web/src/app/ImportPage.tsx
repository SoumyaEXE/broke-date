import { useEffect, useState } from "react";
import { CheckCircle, CircleNotch, FileArrowUp, ListChecks, LockKey, Wallet } from "@phosphor-icons/react";
import { cx } from "@/utils/cx";
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
const STEPS = [
  { icon: FileArrowUp, t: "Read", d: "On this laptop" },
  { icon: CheckCircle, t: "Checked", d: "Every row vs balance" },
  { icon: ListChecks, t: "Sorted", d: "Rules, then Gemma" },
];
/** The built-in sample student is read-only: a statement dropped onto it would mix two people's money. */
const SAMPLE = "sim";
const slug = (v: string) => v.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 24);

export function ImportPage({ provider, subject, onDone }: { provider: LiveProvider; subject: string; onDone: () => void }) {
  const [stage, setStage] = useState<"pick" | "working" | "done" | "error">("pick");
  const [rep, setRep] = useState<ReviewRow[] | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [err, setErr] = useState("");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [anchorsOk, setAnchorsOk] = useState(false);
  const [drag, setDrag] = useState(false);
  const [name, setName] = useState(subject === SAMPLE ? "" : subject);   // who this statement is saved as
  const [fileName, setFileName] = useState("");
  const [secs, setSecs] = useState(0);
  const working = stage === "working";
  const saveAs = slug(name);
  const nameOk = saveAs.length > 0 && saveAs !== SAMPLE;

  // a visible clock while the engine works: the import is one request, so there is no percentage to show
  useEffect(() => {
    if (!working) return;
    setSecs(0);
    const t = window.setInterval(() => setSecs((v) => v + 1), 1000);
    return () => window.clearInterval(t);
  }, [working]);

  const upload = async (f: File) => {
    if (working) return;
    if (!nameOk) {
      setErr(saveAs === SAMPLE ? "The sample student is read-only. Pick another name for this statement." : "Give this statement a name first.");
      setStage("error");
      return;
    }
    setFileName(f.name); setErr(""); setStage("working");
    try {
      const r = await provider.importFile(f, saveAs);
      setReport(r);
      setRep(await provider.review(saveAs));
      setStage("done");
    } catch (e) {
      const d = (e as { detail?: { detail?: { error?: string; row?: number; expected_paise?: number; found_paise?: number } } }).detail?.detail;
      setErr(d?.error === "reconciliation_failed"
        ? `Row ${d.row} doesn't add up: expected balance ${inr(d.expected_paise ?? 0)}, statement says ${inr(d.found_paise ?? 0)}. Nothing was saved.`
        : `Import failed: ${JSON.stringify(d ?? String(e))}`);
      setStage("error");
    }
  };

  const drop = working ? (
    <div role="status" aria-live="polite"
      className={cx("flex flex-col items-center justify-center rounded-2xl border-2 border-accent-200 bg-accent-50/50 text-center",
        report ? "px-6 py-10" : "px-6 py-16 sm:py-20")}>
      <span className="relative flex size-14 items-center justify-center rounded-2xl bg-background-inner-default shadow-card">
        <FileArrowUp weight="duotone" className="size-6 text-accent-600" aria-hidden />
        <CircleNotch weight="bold" className="absolute -inset-2.5 size-19 animate-spin text-accent-500 motion-reduce:animate-none" aria-hidden />
      </span>
      <span className="mt-5 text-title-3-semibold text-text-primary">Reading {fileName || "your statement"}…</span>
      <span className="mt-1 text-body-medium text-text-secondary">Checking every row against the balance, then sorting. Usually about a minute.</span>
      <span className="mt-5 h-1.5 w-64 max-w-full overflow-hidden rounded-full bg-accent-100" aria-hidden>
        <span className="progress-indeterminate block h-full w-1/3 rounded-full bg-accent-500" />
      </span>
      <span className="mt-3 text-body-2-medium text-text-tertiary tabular-nums">{secs} s · still working, nothing has left this laptop</span>
    </div>
  ) : (
    <label onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) void upload(f); }}
      className={cx("group flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed text-center transition-all duration-200",
        report ? "px-6 py-10" : "px-6 py-16 sm:py-20",
        drag ? "scale-[1.01] border-accent-400 bg-accent-50" : "border-border-button-default hover:border-accent-300 hover:bg-background-primary-hover")}>
      <span className="flex size-14 items-center justify-center rounded-2xl bg-accent-50 transition-transform duration-200 group-hover:-translate-y-0.5">
        <FileArrowUp weight="duotone" className="size-7 text-accent-600" aria-hidden />
      </span>
      <span className="mt-4 text-title-3-semibold text-text-primary">Drop your bank statement</span>
      <span className="mt-1 text-body-medium text-text-tertiary">or click to choose a file</span>
      <span className="mt-4 flex gap-1.5">
        {["CSV", "XLSX", "PDF"].map((x) => <Chip key={x} variant="caption" color="neutral">{x}</Chip>)}
      </span>
      <input type="file" className="sr-only" accept=".csv,.xlsx,.pdf,.txt" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} />
    </label>
  );
  /** "See my month": open the person this statement was saved as (a reload, since the app holds one person at a time). */
  const openSaved = () => {
    if (saveAs === subject) { onDone(); return; }
    try { localStorage.setItem("bd:subject", saveAs); } catch { /* private window: the URL below is enough */ }
    window.location.href = `${window.location.pathname}?subject=${encodeURIComponent(saveAs)}#/overview`;
  };

  if (!report) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 pt-2">
        <section className="rounded-3xl bg-background-secondary-default p-2">
          <div className="rounded-2lg bg-background-inner-default p-3 shadow-card">{drop}</div>
        </section>
        {stage === "error" && <p role="alert" className="rounded-xl bg-status-rose-background px-4 py-3 text-body-medium text-status-rose-text">{err}</p>}
        <ol className="grid gap-3 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.t} style={working ? { animationDelay: `${i * 300}ms` } : undefined}
              className={cx("flex items-center gap-3 rounded-2xl bg-background-secondary-default p-3", working && "step-wave ring-1 ring-accent-200")}>
              <Tile icon={s.icon} tone="accent" />
              <div className="min-w-0">
                <p className="text-body-medium text-text-primary"><span className="text-text-tertiary tabular-nums">{i + 1} · </span>{s.t}</p>
                <p className="truncate text-body-2-medium text-text-tertiary">{s.d}</p>
              </div>
            </li>
          ))}
        </ol>
        <label className="flex flex-wrap items-center justify-center gap-2 text-body-2-medium text-text-tertiary">
          <LockKey weight="duotone" className="size-4" aria-hidden />Never uploaded · save as
          <input value={name} onChange={(e) => setName(e.target.value)} disabled={working} placeholder="a name, e.g. subarna"
            aria-label="Save this statement as" aria-invalid={!nameOk} spellCheck={false}
            className={cx("w-44 rounded-lg bg-background-inner-default px-2.5 py-1 text-body-2-medium text-text-primary shadow-card ring-1 outline-none transition-shadow focus:ring-2 focus:ring-accent-400 disabled:opacity-60",
              nameOk ? "ring-separator-border" : "ring-status-orange-text")} />
          {!nameOk && <span className="text-status-orange-text">{saveAs === SAMPLE ? "the sample student is read-only" : "name it first"}</span>}
        </label>
      </div>
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
      <Panel title="Bring your statement" sub="Read on this laptop, checked row by row against the balance, never uploaded" icon={FileArrowUp}>
        {drop}
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
          <Panel title="These look like your paydays" sub={`from ${report.anchor_sender || "?"} · correct?`} icon={Wallet} flush
            action={<Button variant="primary" size="xs" disabled={anchorsOk} onClick={async () => { await provider.confirmAnchors(saveAs, report.anchors_detected.map((a) => a.id)); setAnchorsOk(true); }}>{anchorsOk ? "Confirmed" : "Yes, these"}</Button>}>
            <Rows>
              {report.anchors_detected.slice(0, 6).map((a) => (
                <Row key={a.id}><Tile icon={Wallet} tone="accent" /><p className="flex-1 text-body-medium tabular-nums">{shortDate(a.date)}</p><p className="text-body-medium tabular-nums">{inr(a.amount_paise)}</p></Row>
              ))}
            </Rows>
          </Panel>
          {rep && rep.length > 0 && (
            <Panel title={`${rep.length} rows need a human`} sub="Fix a category once; similar rows learn from it" icon={ListChecks} flush
              action={<Button variant="secondary" size="xs" disabled={!Object.keys(edits).length} onClick={async () => { await provider.saveReview(Object.entries(edits).map(([id, category]) => ({ id, category }))); setEdits({}); setRep(await provider.review(saveAs)); }}>Save</Button>}>
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
          <Button variant="primary" size="medium" leadingIcon={duo(CheckCircle)} onClick={openSaved}>See my month</Button>
          <Chip variant="caption" color="neutral" className="self-start">Statements stay in {"$BROKEDATE_DATA_DIR"}, outside git</Chip>
        </div>
      )}
    </div>
  );
}
