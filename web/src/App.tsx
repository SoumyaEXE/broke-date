import { useCallback, useEffect, useMemo, useState } from "react";
import type { Fact, ForecastResponse } from "./types";
import { IS_DEMO, LiveProvider, StaticProvider, type DataProvider } from "./data/provider";
import { daysBetween, dow, shortDate } from "./lib/format";
import Today from "./components/Today";
import BacktestPage from "./components/BacktestPage";
import ImportFlow from "./components/ImportFlow";
import SettingsPage from "./components/Settings";
import EvidenceDrawer from "./components/EvidenceDrawer";

type Tab = "today" | "grade" | "import" | "settings";

function useTheme(): [boolean, () => void] {
  const [dark, setDark] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem("bd:theme");
      if (v) return v === "dark";
    } catch { /* storage unavailable */ }
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  });
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try { localStorage.setItem("bd:theme", dark ? "dark" : "light"); } catch { /* ignore */ }
  }, [dark]);
  return [dark, () => setDark((d) => !d)];
}

export default function App() {
  const provider: DataProvider = useMemo(() => (IS_DEMO ? new StaticProvider() : new LiveProvider("subarna")), []);
  const [subject, setSubject] = useState<string>(() => {
    try { return localStorage.getItem("bd:subject") || "subarna"; } catch { return "subarna"; }
  });
  const [tab, setTab] = useState<Tab>("today");
  const [data, setData] = useState<ForecastResponse | null>(null);
  const [prev, setPrev] = useState<ForecastResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fact, setFact] = useState<Fact | null>(null);
  const [dark, toggleDark] = useTheme();

  const load = useCallback(async () => {
    setBusy(true); setError(null);
    try {
      if (provider instanceof LiveProvider) provider.setSubject(subject);
      setData(await provider.forecast());
    } catch (e) {
      const detail = (e as { detail?: { detail?: string } }).detail;
      setError(typeof detail?.detail === "string" ? detail.detail : provider.mode === "live"
        ? "Can't reach the local engine on 127.0.0.1:8787. Start it with `scripts/dev.ps1 engine`."
        : "Could not load the demo data.");
    } finally { setBusy(false); }
  }, [provider, subject]);

  useEffect(() => { void load(); }, [load]);

  const update = useCallback(async (fn: () => Promise<ForecastResponse>) => {
    setBusy(true);
    try {
      const next = await fn();
      setPrev(data);
      setData(next);
    } catch (e) { setError(String(e)); } finally { setBusy(false); }
  }, [data]);

  const openFact = (id: string | undefined, pool?: Record<string, Fact>) => {
    if (!id || !data) return;
    const f = pool?.[id] ?? data.facts[id];
    if (f) setFact(f);
  };

  const daysLeft = data ? daysBetween(data.as_of, data.next_anchor_date) : null;

  return (
    <div className="min-h-screen">
      {IS_DEMO && (
        <div className="bg-ink text-paper text-sm px-4 py-2 text-center" role="note"
             style={{ background: "var(--fg)", color: "var(--bg)" }}>
          Sample data (simulated). The real thing runs offline on your laptop.
        </div>
      )}
      <header className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 pb-4 flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="mr-auto">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight leading-none">
            Broke<span style={{ color: "var(--color-broke)" }}>.</span>Date
          </h1>
          {data && (
            <p className="muted mt-1 text-sm">
              <span className="num">{dow(data.as_of)} {shortDate(data.as_of)}</span>
              {" · "}
              {data.next_anchor_known ? "Allowance in " : "Next income ~ "}
              <span className="num font-medium" style={{ color: "var(--fg)" }}>{daysLeft} days</span>
              {!data.next_anchor_known && " (not scheduled, assumed)"}
            </p>
          )}
        </div>
        <nav className="flex gap-1 text-sm" aria-label="sections">
          {(["today", "grade", ...(IS_DEMO ? [] : ["import"]), "settings"] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)} aria-current={tab === t ? "page" : undefined}
              className={`px-3 py-1.5 rounded-full border rule transition ${tab === t ? "font-medium" : "muted"}`}
              style={tab === t ? { background: "var(--fg)", color: "var(--bg)", borderColor: "var(--fg)" } : undefined}>
              {{ today: "Today", grade: "How good am I?", import: "Import", settings: "Settings" }[t]}
            </button>
          ))}
          <button onClick={toggleDark} className="px-3 py-1.5 rounded-full border rule muted"
            aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}>{dark ? "☀" : "☾"}</button>
        </nav>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 pb-24">
        {error && (
          <div className="border rule rounded-lg p-4 mb-6 text-sm" role="alert">
            <p className="font-medium" style={{ color: "var(--color-broke)" }}>{error}</p>
            {provider.mode === "live" && (
              <p className="muted mt-2">No data yet? Import a statement in the Import tab, or try subject <code>sim</code>.</p>
            )}
          </div>
        )}
        {tab === "today" && data && (
          <Today data={data} prev={prev} busy={busy} provider={provider} onUpdate={update} openFact={openFact} />
        )}
        {tab === "today" && !data && !error && <Skeleton />}
        {tab === "grade" && <BacktestPage provider={provider} />}
        {tab === "import" && provider instanceof LiveProvider && (
          <ImportFlow provider={provider} subject={subject}
            onSubject={(s) => { setSubject(s); try { localStorage.setItem("bd:subject", s); } catch { /* ignore */ } }}
            onDone={() => { setTab("today"); void load(); }} />
        )}
        {tab === "settings" && <SettingsPage provider={provider} onSaved={() => void load()} />}
      </main>

      <footer className="max-w-6xl mx-auto px-4 sm:px-6 pb-10 text-xs muted dashed-rule pt-4">
        Built for Subarna. Forecasts by TabPFN, words by Gemma, every number from the engine.
        {data && <> · {data.n_futures} futures · seed <span className="num">{data.seed}</span> · history{" "}
          <span className="num">{data.model.history_from}</span> to <span className="num">{data.model.history_to}</span></>}
      </footer>

      <EvidenceDrawer fact={fact} data={data} onClose={() => setFact(null)} />
    </div>
  );
}

function Skeleton() {
  return (
    <div className="animate-pulse grid gap-6 md:grid-cols-[1fr_1.4fr]" aria-busy="true" aria-label="loading">
      <div className="h-56 rounded-xl bg-2" />
      <div className="h-80 rounded-xl bg-2" />
    </div>
  );
}
