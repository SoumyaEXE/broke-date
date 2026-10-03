import { useCallback, useEffect, useMemo, useState } from "react";
import type { Fact, ForecastResponse } from "./types";
import { IS_DEMO, LiveProvider, StaticProvider, type DataProvider } from "./data/provider";
import Sidebar, { type Page } from "./components/Sidebar";
import Topbar from "./components/Topbar";
import Overview from "./components/Overview";
import FuturesPage from "./components/FuturesPage";
import PlansPage from "./components/PlansPage";
import ActivityPage from "./components/ActivityPage";
import BacktestPage from "./components/BacktestPage";
import ImportFlow from "./components/ImportFlow";
import SettingsPage from "./components/Settings";
import EvidenceDrawer from "./components/EvidenceDrawer";
import ChatPanel from "./components/ChatPanel";

export default function App() {
  const provider: DataProvider = useMemo(() => (IS_DEMO ? new StaticProvider() : new LiveProvider("sim")), []);
  const [subject, setSubject] = useState<string>(() => {
    const q = new URLSearchParams(window.location.search).get("subject");
    if (q) return q;
    try { return localStorage.getItem("bd:subject") || "sim"; } catch { return "sim"; }
  });
  const [page, setPage] = useState<Page>("overview");
  const [data, setData] = useState<ForecastResponse | null>(null);
  const [prev, setPrev] = useState<ForecastResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fact, setFact] = useState<Fact | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatSeed, setChatSeed] = useState<{ q: string; n: number } | null>(null);
  const [navOpen, setNavOpen] = useState(false);

  const load = useCallback(async () => {
    setBusy(true); setError(null);
    try {
      if (provider instanceof LiveProvider) provider.setSubject(subject);
      setData(await provider.forecast());
    } catch (e) {
      const detail = (e as { detail?: { detail?: string } }).detail;
      setError(typeof detail?.detail === "string" ? detail.detail : provider.mode === "live"
        ? "Can't reach the local engine on 127.0.0.1:8787. Start it with scripts/dev.ps1 engine."
        : "Could not load the demo data.");
    } finally { setBusy(false); }
  }, [provider, subject]);
  useEffect(() => { void load(); }, [load]);

  const update = useCallback(async (fn: () => Promise<ForecastResponse>) => {
    setBusy(true);
    try { const next = await fn(); setPrev(data); setData(next); }
    catch (e) { setError(String(e)); } finally { setBusy(false); }
  }, [data]);

  const openFact = useCallback((id: string | undefined, pool?: Record<string, Fact>) => {
    if (!id || !data) return;
    const f = pool?.[id] ?? data.facts[id];
    if (f) setFact(f);
  }, [data]);

  const ask = useCallback((q?: string) => {
    setChatOpen(true);
    if (q) setChatSeed({ q, n: Date.now() });
  }, []);

  return (
    <div className="min-h-screen flex">
      <Sidebar page={page} onPage={(p) => { setPage(p); setNavOpen(false); }} open={navOpen} onClose={() => setNavOpen(false)}
               demo={IS_DEMO} subject={subject} data={data} />
      <div className="flex-1 min-w-0 flex">
        <div className="flex-1 min-w-0">
          {IS_DEMO && (
            <div className="mx-3 mt-3 rounded-xl bg-brand-2 text-[13px] px-4 py-2 text-ink-2 flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-brand" /> Sample data (simulated persona). The real thing runs offline on your laptop.
            </div>
          )}
          <Topbar data={data} onAsk={ask} onMenu={() => setNavOpen(true)} busy={busy} />
          <main className="px-3 sm:px-4 pb-16">
            {error && (
              <div className="card p-4 mb-3 text-sm" role="alert">
                <p className="font-medium text-bad">{error}</p>
                {provider.mode === "live" && <p className="muted mt-1">No data yet? Import a statement in Import, or open <code>?subject=sim</code>.</p>}
              </div>
            )}
            {!data && !error && <Skeleton />}
            {data && page === "overview" && (
              <Overview data={data} prev={prev} busy={busy} provider={provider} onUpdate={update} openFact={openFact}
                        onAsk={ask} onPage={setPage} />
            )}
            {data && page === "futures" && <FuturesPage data={data} prev={prev} openFact={openFact} provider={provider} />}
            {data && page === "plans" && <PlansPage data={data} busy={busy} provider={provider} onUpdate={update} openFact={openFact} onAsk={ask} />}
            {data && page === "activity" && <ActivityPage data={data} />}
            {page === "grade" && <div className="card p-6"><BacktestPage provider={provider} /></div>}
            {page === "import" && provider instanceof LiveProvider && (
              <div className="card p-6">
                <ImportFlow provider={provider} subject={subject}
                  onSubject={(s) => { setSubject(s); try { localStorage.setItem("bd:subject", s); } catch { /* ignore */ } }}
                  onDone={() => { setPage("overview"); void load(); }} />
              </div>
            )}
            {page === "settings" && <div className="card p-6"><SettingsPage provider={provider} onSaved={() => void load()} /></div>}
          </main>
        </div>
        <ChatPanel open={chatOpen} onClose={() => setChatOpen(false)} data={data} seed={chatSeed}
                   onAddPlan={(p) => void update(() => provider.addPlan(p))} />
      </div>
      <EvidenceDrawer fact={fact} data={data} onClose={() => setFact(null)} />
    </div>
  );
}

function Skeleton() {
  return (
    <div className="grid gap-3 lg:grid-cols-2 animate-pulse" aria-busy="true" aria-label="loading">
      {[0, 1, 2, 3].map((i) => <div key={i} className="card h-72" />)}
    </div>
  );
}
