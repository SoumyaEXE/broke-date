import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarBlank, CalendarCheck, Lightbulb, Wallet, ChartLineUp, ChatsCircle, Receipt, SealCheck, ChatCircleText, SquaresFour, UploadSimple,
} from "@phosphor-icons/react";
import { RiMenuLine } from "@remixicon/react";
import { DashboardSidebar, type DashboardNavItem } from "@/components/application/dashboard/dashboard-sidebar";
import { Button } from "@/components/base/buttons/button";
import { IconButton } from "@/components/base/buttons/icon-button";
import { Chip } from "@/components/base/badges/chip";
import type { Fact, ForecastResponse } from "./types";
import { IS_DEMO, LiveProvider, StaticProvider, type DataProvider } from "./data/provider";
import { daysBetween, dow, shortDate } from "./lib/format";
import { duo } from "./app/kit";
import { OverviewPage } from "./app/OverviewPage";
import { FuturesPage } from "./app/FuturesPage";
import { PlansPage } from "./app/PlansPage";
import { ActivityPage } from "./app/ActivityPage";
import { GradePage } from "./app/GradePage";
import { AskPage } from "./app/AskPage";
import { ImportPage } from "./app/ImportPage";
import { SettingsPage } from "./app/SettingsPage";
import { AboutPage } from "./app/AboutPage";
import { InsightsPage } from "./app/InsightsPage";
import { OfflineCard } from "./app/OfflineCard";
import { EvidenceSheet } from "./app/EvidenceSheet";
import { PocketCard } from "./app/PocketCard";

export type Route = "overview" | "ask" | "futures" | "plans" | "activity" | "insights" | "grade" | "import" | "settings" | "about";

const TITLES: Record<Route, string> = {
  overview: "Overview", ask: "Ask Broke Date", futures: "Futures", plans: "Plans", activity: "Activity", insights: "Insights",
  grade: "How good am I?", import: "Import statement", settings: "Settings", about: "How it works",
};

function readRoute(): Route {
  const r = window.location.hash.replace(/^#\/?/, "").split("?")[0] as Route;
  return r in TITLES ? r : "overview";
}

export default function App() {
  const provider: DataProvider = useMemo(() => (IS_DEMO ? new StaticProvider() : new LiveProvider("sim")), []);
  const [subject] = useState<string>(() => {
    const q = new URLSearchParams(window.location.search).get("subject");
    if (q) return q;
    try { return localStorage.getItem("bd:subject") || "sim"; } catch { return "sim"; }
  });
  const [route, setRoute] = useState<Route>(readRoute);
  const [data, setData] = useState<ForecastResponse | null>(null);
  const [prev, setPrev] = useState<ForecastResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fact, setFact] = useState<Fact | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [question, setQuestion] = useState<{ q: string; n: number } | null>(null);

  useEffect(() => {
    const on = () => { setRoute(readRoute()); setNavOpen(false); document.getElementById("main")?.scrollTo({ top: 0 }); };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  const go = useCallback((r: Route) => { window.location.hash = `/${r}`; }, []);

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
    if (q) setQuestion({ q, n: Date.now() });
    go("ask");
  }, [go]);

  const nav: DashboardNavItem[] = [
    { key: "overview", label: "Overview", icon: duo(SquaresFour), href: "#/overview" },
    { key: "ask", label: "Ask Broke Date", icon: duo(ChatsCircle), href: "#/ask", badge: "AI" },
    { key: "futures", label: "Futures", icon: duo(ChartLineUp), href: "#/futures", badge: data?.n_futures },
    { key: "plans", label: "Plans", icon: duo(CalendarCheck), href: "#/plans", badge: data?.plans.filter((p) => p.active).length || undefined },
    { key: "activity", label: "Activity", icon: duo(Receipt), href: "#/activity" },
    { key: "insights", label: "Insights", icon: duo(Lightbulb), href: "#/insights", badge: (data?.context?.upcoming?.length ?? 0) > 0 ? data?.context?.upcoming?.length : undefined },
    { key: "grade", label: "How good am I?", icon: duo(SealCheck), href: "#/grade" },
    ...(IS_DEMO ? [] : [{ key: "import", label: "Import statement", icon: duo(UploadSimple), href: "#/import" }]),
  ];
  const userName = subject === "sim" ? "Sample student" : subject.endsWith("_syn") ? `${subject.slice(0, -4).replace(/^\w/, (c) => c.toUpperCase())} · synthetic` : subject.replace(/^\w/, (c) => c.toUpperCase());
  const sidebar = (mobile: boolean) => (
    <DashboardSidebar items={nav} selected={route} userName={userName} showThemeToggle={false}
      mobile={mobile} onClose={() => setNavOpen(false)}
      onSettings={() => go("settings")} onSupport={() => go("about")}
      footer={<div className="flex flex-col gap-2"><OfflineCard onOpen={() => go("about")} /><PocketCard demo={IS_DEMO} subject={subject} /></div>}
      className={mobile ? "flex" : "hidden lg:flex"} />
  );

  return (
    <div className="flex h-dvh w-full gap-4 bg-background-full p-0 sm:p-3">
      {sidebar(false)}
      {navOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <button className="absolute inset-0 cursor-pointer bg-black/40" aria-label="Close navigation" onClick={() => setNavOpen(false)} />
          <div className="relative flex h-full p-3">{sidebar(true)}</div>
        </div>
      )}

      <main id="main" className="relative flex min-h-0 min-w-0 flex-1 justify-center no-scrollbar overflow-x-hidden overflow-y-auto overscroll-contain scroll-smooth bg-background-full">
        <div className={route === "ask" ? "flex h-full w-full max-w-[1300px] flex-col gap-2.5 px-3 sm:px-2" : "flex w-full max-w-[1300px] flex-col gap-2.5 px-3 pt-3 sm:px-2 sm:pt-0"}>
          <header className="sticky top-0 z-20 flex w-full flex-wrap items-end justify-between gap-2 pt-1 pb-2">
            <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-3 -bottom-4 -z-10 bg-background-full/80 backdrop-blur-md [mask-image:linear-gradient(to_bottom,black_55%,transparent)]" />
            <div className="flex min-w-0 items-center gap-1.5">
              <IconButton icon={RiMenuLine} aria-label="Open navigation" onClick={() => setNavOpen(true)} className="lg:hidden" />
              <h1 className="px-1 text-title-2-medium whitespace-nowrap text-text-primary">{TITLES[route]}</h1>
              {IS_DEMO && <Chip variant="caption" color="purple">Sample data · simulated</Chip>}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2.5">
              {data && (
                <span className="hidden items-center gap-1 rounded-full bg-background-secondary-default p-1 text-body-2-medium md:flex">
                  <span className="flex items-center gap-1.5 px-2.5 text-text-secondary">
                    <CalendarBlank weight="duotone" className="size-4" aria-hidden />
                    {dow(data.as_of)}, {shortDate(data.as_of)}
                  </span>
                  <span className="flex items-center gap-1.5 rounded-full bg-background-inner-default px-2.5 py-1 text-text-primary shadow-xs">
                    <Wallet weight="duotone" className="size-4 text-accent-600" aria-hidden />
                    {(() => { const d = daysBetween(data.as_of, data.next_anchor_date); return d <= 0 ? "Payday today" : d === 1 ? "Payday tomorrow" : `Payday in ${d} days`; })()}
                  </span>
                </span>
              )}
              {route !== "ask" && <Button variant="primary" size="small" leadingIcon={duo(ChatCircleText)} onClick={() => ask()}>Ask Broke Date</Button>}
            </div>
          </header>

          {error && (
            <div role="alert" className="rounded-2xl bg-status-rose-background px-4 py-3 text-body-medium text-status-rose-text">
              {error}{provider.mode === "live" && " · No data yet? Open Import, or add ?subject=sim to the URL."}
            </div>
          )}

          <div key={route} className={route === "ask" ? "reveal flex min-h-0 flex-1 flex-col pb-3" : "reveal flex w-full flex-col gap-4 pb-6"}>
            {!data && !error && ["overview", "futures", "plans", "activity", "insights"].includes(route) && <Loading />}
            {data && route === "overview" && <OverviewPage data={data} prev={prev} busy={busy} provider={provider} onUpdate={update} openFact={openFact} onAsk={ask} go={go} />}
            {route === "ask" && <AskPage data={data} provider={provider} question={question} onUpdate={update} go={go}
              onSettings={async (p) => { await provider.saveSettings(p); await load(); }} />}
            {data && route === "futures" && <FuturesPage data={data} prev={prev} />}
            {data && route === "plans" && <PlansPage data={data} busy={busy} provider={provider} onUpdate={update} openFact={openFact} onAsk={ask} />}
            {data && route === "activity" && <ActivityPage data={data} />}
            {data && route === "insights" && <InsightsPage data={data} provider={provider} />}
            {route === "grade" && <GradePage provider={provider} />}
            {route === "import" && provider instanceof LiveProvider && <ImportPage provider={provider} subject={subject} onDone={() => { go("overview"); void load(); }} />}
            {route === "settings" && <SettingsPage provider={provider} data={data} onSaved={() => void load()} />}
            {route === "about" && <AboutPage data={data} />}
          </div>
        </div>
      </main>
      <EvidenceSheet fact={fact} data={data} onClose={() => setFact(null)} />
    </div>
  );
}

function Loading() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true" aria-label="Loading forecast">
      {[0, 1, 2, 3].map((i) => <div key={i} className="h-[190px] animate-pulse rounded-2xl bg-background-secondary-default" />)}
      <div className="h-[380px] animate-pulse rounded-2xl bg-background-secondary-default sm:col-span-2" />
      <div className="h-[380px] animate-pulse rounded-2xl bg-background-secondary-default sm:col-span-2" />
    </div>
  );
}

