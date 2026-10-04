import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowCounterClockwise, CalendarPlus, CheckCircle, ClockCounterClockwise, NotePencil, Trash, XCircle } from "@phosphor-icons/react";
import { Dropdown, DropdownDivider, DropdownItem, DropdownPopover, DropdownTrigger } from "@/components/base/dropdown/dropdown";
import { AgentComposer } from "@/components/application/agent-chat/agent-composer";
import { AgentMessage } from "@/components/application/agent-chat/agent-chat-message";
import { AgentThinking } from "@/components/application/agent-thinking/agent-thinking";
import { Button } from "@/components/base/buttons/button";
import { Chip } from "@/components/base/badges/chip";
import { cx } from "@/utils/cx";
import type { ForecastResponse, PlanRow, Settings } from "../types";
import type { DataProvider } from "../data/provider";
import { Brain, ground, splitPlaceholders, type Answer, type Grounded, type Op, type ScenarioCard } from "../lib/chat";
import { shortDate } from "../lib/format";
import { duo } from "./kit";
import { ChatArtifact } from "./ChatArtifact";
import { ModelPicker, type ModelChoice } from "./ModelPicker";
import { BrandLogo } from "./BrandLogo";
import type { Route } from "../App";

type Bot = {
  id: number; role: "bot"; at: number; a: Answer; g: Grounded;
  text: string;                       // reply so far, with {fN} placeholders
  status: "thinking" | "streaming" | "done";
  source: "gemma" | "template"; model?: string; note?: string;
  applied?: "working" | "done" | "undone" | "failed"; snapshot?: PlanRow;
};
type Msg = { id: number; role: "user"; text: string; at: number } | Bot;
type Thread = { id: string; title: string; updatedAt: number; msgs: Msg[] };

const STARTERS = [
  "Can I afford a ₹400 movie on Saturday?",
  "Anything unusual this month?",
  "Should I ask home for ₹500?",
  "Add momos ₹150 on Friday to plans",
  "Show the range",
  "When would I run out?",
];
const STORE = "brokedate:chats:v1";
const MODEL_STORE = "brokedate:chat-model";

/* Chats are a per-browser convenience: kept in this browser only, never sent anywhere. */
function loadThreads(): Thread[] {
  try {
    const t = JSON.parse(localStorage.getItem(STORE) ?? "[]") as Thread[];
    return t.map((th) => ({ ...th, msgs: th.msgs.map((m) => (m.role === "bot" && m.status !== "done" ? { ...m, status: "done" as const } : m)) }));
  } catch { return []; }
}
function saveThreads(t: Thread[]) { try { localStorage.setItem(STORE, JSON.stringify(t.slice(0, 30))); } catch { /* storage off: chats just aren't kept */ } }
const newId = () => `c${Date.now().toString(36)}`;

export function AskPage({ data, provider, question, onUpdate, onSettings, go }: {
  data: ForecastResponse | null; provider: DataProvider; question: { q: string; n: number } | null;
  onUpdate: (fn: () => Promise<ForecastResponse>) => Promise<void>;
  onSettings: (patch: Partial<Settings>) => Promise<void>;
  go: (r: Route) => void;
}) {
  const brain = useMemo(() => { try { return data?.sim ? new Brain(data) : null; } catch { return null; } }, [data]);
  const [threads, setThreads] = useState<Thread[]>(loadThreads);
  const [activeId, setActiveId] = useState<string>(() => newId());
  const [text, setText] = useState("");
  const [under, setUnder] = useState(false);
  const [language, setLanguage] = useState<string | undefined>();
  const [installed, setInstalled] = useState<string[] | null>(null);
  const [model, setModel] = useState<ModelChoice>(() => { try { return (localStorage.getItem(MODEL_STORE) as ModelChoice) || "auto"; } catch { return "auto"; } });
  const scroller = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);
  const typer = useRef<number | null>(null);
  const seen = useRef<number | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;
  const live = !!provider.chat;
  const n = data?.n_futures ?? 500;

  const thread = threads.find((t) => t.id === activeId);
  const msgs = thread?.msgs ?? [];
  const busy = msgs.some((m) => m.role === "bot" && m.status !== "done");

  useEffect(() => { void provider.settings().then((s) => setLanguage(s.letter_language)).catch(() => undefined); }, [provider]);
  useEffect(() => { if (provider.health) void provider.health().then((h) => setInstalled(Array.isArray(h.models) ? (h.models as string[]) : null)).catch(() => undefined); }, [provider]);
  useEffect(() => { saveThreads(threads); }, [threads]);
  useEffect(() => { try { localStorage.setItem(MODEL_STORE, model); } catch { /* ignore */ } }, [model]);

  const mutate = (fn: (ms: Msg[]) => Msg[], title?: string) => setThreads((ts) => {
    const cur = ts.find((t) => t.id === activeId);
    const next: Thread = cur ? { ...cur, msgs: fn(cur.msgs), updatedAt: Date.now() } : { id: activeId, title: title ?? "New chat", updatedAt: Date.now(), msgs: fn([]) };
    return [next, ...ts.filter((t) => t.id !== activeId)];
  });
  const patch = (id: number, p: Partial<Bot>) => mutate((ms) => ms.map((m) => (m.id === id && m.role === "bot" ? { ...m, ...p } : m)));
  const append = (id: number, piece: string) => mutate((ms) => ms.map((m) => (m.id === id && m.role === "bot" ? { ...m, text: m.text + piece, status: "streaming" } : m)));

  /** Reveal the checked answer word by word (demo, "No AI words", or when Gemma is offline / its draft was rejected). */
  const typeOut = (id: number, template: string, note?: string) => {
    const words = template.split(/(\s+)/);
    let i = 0;
    patch(id, { text: "", status: "streaming", source: "template", note });
    typer.current = window.setInterval(() => {
      i += 2;
      patch(id, { text: words.slice(0, i).join("") });
      if (i >= words.length) { window.clearInterval(typer.current!); patch(id, { status: "done" }); }
    }, 28);
  };

  /** Carry out what the user asked the chat to change, so the dashboard updates too. */
  const apply = async (id: number, ops: Op[]) => {
    patch(id, { applied: "working" });
    try {
      for (const op of ops) {
        if (op.kind === "toggle") await onUpdate(() => provider.togglePlan(op.planId, op.active));
        else if (op.kind === "add") await onUpdate(() => provider.addPlan(op.plan));
        else if (op.kind === "remove") {
          patch(id, { snapshot: dataRef.current?.plans.find((p) => p.id === op.planId) });
          await onUpdate(() => provider.removePlan(op.planId));
        } else if (op.kind === "settings") await onSettings(op.patch);
        else if (op.kind === "go") window.setTimeout(() => go(op.route), 700);
      }
      patch(id, { applied: "done" });
    } catch { patch(id, { applied: "failed" }); }
  };
  const undo = async (m: Bot) => {
    try {
      for (const op of [...(m.a.ops ?? [])].reverse()) {
        if (op.kind === "toggle") await onUpdate(() => provider.togglePlan(op.planId, !op.active));
        else if (op.kind === "add") {
          const p = dataRef.current?.plans.find((x) => x.name === op.plan.name && x.date === op.plan.date && x.amount_paise === op.plan.amount_paise);
          if (p) await onUpdate(() => provider.removePlan(p.id));
        } else if (op.kind === "remove" && m.snapshot) {
          const s = m.snapshot;
          await onUpdate(() => provider.addPlan({ name: s.name, amount_paise: s.amount_paise, date: s.date }));
        } else if (op.kind === "settings") await onSettings(op.before);
      }
      patch(m.id, { applied: "undone" });
    } catch { patch(m.id, { applied: "failed" }); }
  };

  const send = (q: string) => {
    const t = q.trim();
    if (!t || !brain || busy) return;
    const now = Date.now();
    const a = brain.ask(t);            // the real work: TabPFN futures rerun in the browser, milliseconds
    const g = ground(a);
    const id = now + 1;
    mutate((m) => [...m, { id: now, role: "user", text: t, at: now }, { id, role: "bot", at: now, a, g, text: "", status: "thinking", source: "template" }],
      t.length > 48 ? `${t.slice(0, 46)}…` : t);
    setText("");
    if (a.ops?.length) void apply(id, a.ops);
    if (!provider.chat || model === "none") { window.setTimeout(() => typeOut(id, g.template), 320); return; }
    const ctl = new AbortController();
    abort.current = ctl;
    let started = false;
    provider.chat({ question: t, template: g.template, facts: g.facts.map(({ id: fid, desc }) => ({ id: fid, desc })), verdict: g.verdict, language,
      ...(model !== "auto" ? { model } : {}) },
      (e) => {
        if (e.type === "start") { started = true; patch(id, { source: "gemma", model: e.model, ...(e.note ? { note: e.note } : {}) }); }
        else if (e.type === "token") append(id, e.text);
        else if (e.type === "done") {
          if (e.ok) patch(id, { text: e.text, status: "done" });
          else typeOut(id, g.template); // Gemma's one-liner failed a check: drop it, the checked answer is unchanged
        } else if (e.type === "error") typeOut(id, g.template, started ? "Gemma stopped mid-reply; showing the checked answer." : `${e.message}. Showing the checked answer.`);
      }, ctl.signal).catch(() => typeOut(id, g.template, "Engine not reachable; showing the checked answer."));
  };
  const stop = () => {
    abort.current?.abort();
    if (typer.current) window.clearInterval(typer.current);
    mutate((ms) => ms.map((m) => (m.role === "bot" && m.status !== "done" ? { ...m, status: "done" } : m)));
  };
  const newChat = () => { stop(); setActiveId(newId()); setText(""); };
  const remove = (id: string) => { setThreads((ts) => ts.filter((t) => t.id !== id)); if (id === activeId) setActiveId(newId()); };

  useEffect(() => {
    if (question && brain && seen.current !== question.n) { seen.current = question.n; send(question.q); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question, brain]);
  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" }); }, [msgs.length, msgs[msgs.length - 1]]);
  useEffect(() => () => { abort.current?.abort(); if (typer.current) window.clearInterval(typer.current); }, []);

  return (
    <section className="relative flex min-h-[560px] flex-1 overflow-hidden rounded-3xl bg-background-secondary-default">
      <div className="relative flex min-w-0 flex-1 flex-col">
        {/* BoardUI chat header: overlaid, transparent until the transcript scrolls under it, then frosted */}
        <header className={cx("absolute inset-x-0 top-0 z-10 flex h-12 items-center gap-2 border-b px-4 transition-colors duration-200",
          under ? "border-separator-border bg-white/40 backdrop-blur-[20px]" : "border-transparent")}>
          <span className="min-w-0 flex-1 truncate text-headline-medium text-text-primary">{thread?.title ?? "New chat"}</span>
          <HistoryMenu threads={threads} activeId={activeId} onSelect={(id) => { stop(); setActiveId(id); }} onDelete={remove} />
          {msgs.length > 0 && <Button variant="ghost" size="xs" leadingIcon={duo(NotePencil)} onClick={newChat}>New chat</Button>}
        </header>

        <div ref={scroller} onScroll={(e) => setUnder(e.currentTarget.scrollTop > 0)} className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain scroll-smooth">
          <div className={cx("mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pt-[72px] pb-6", msgs.length === 0 && "min-h-full justify-center")}>
            {msgs.length === 0 ? (
              <div className="reveal flex flex-col items-center gap-5 text-center">
                <span className="flex -space-x-2">
                  <span className="flex size-11 items-center justify-center rounded-full bg-background-inner-default shadow-card ring-4 ring-background-secondary-default"><BrandLogo brand="google" className="size-5" /></span>
                  <span className="flex size-11 items-center justify-center rounded-full bg-background-inner-default shadow-card ring-4 ring-background-secondary-default"><BrandLogo brand="ollama" mono className="size-5 text-text-primary" /></span>
                </span>
                <div className="flex flex-col gap-1">
                  <h2 className="text-title-2-medium text-text-primary">Ask about your month</h2>
                  <p className="text-body-regular text-text-tertiary">Numbers by TabPFN · words by Gemma, offline</p>
                </div>
                <div className="flex max-w-2xl flex-wrap justify-center gap-2">
                  {STARTERS.map((q) => (
                    <button key={q} type="button" disabled={!brain} onClick={() => send(q)}
                      className="cursor-pointer rounded-full bg-background-primary-default px-3.5 py-2 text-body-regular text-text-secondary shadow-xs transition-colors hover:bg-background-primary-hover hover:text-text-primary disabled:opacity-50">
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : msgs.map((m) => m.role === "user"
              ? <AgentMessage key={m.id} role="user" text={m.text} at={m.at} />
              : <BotTurn key={m.id} m={m} n={n} live={live && model !== "none"} data={data} go={go} onFollow={send} onUndo={() => void undo(m)} provider={provider} />)}
          </div>
        </div>

        <div className="shrink-0 px-3 pb-3">
          <div className="mx-auto w-full max-w-3xl">
            <AgentComposer value={text} onValueChange={setText} onSubmit={() => send(text)} onStop={stop} busy={busy}
              messageCount={msgs.length} showStatus={false} showAttach={false} placeholder="Ask, or say “turn on the movie”"
              modelSlot={<ModelPicker value={model} onChange={setModel} installed={installed} live={live} />} />
          </div>
        </div>
      </div>
    </section>
  );
}

/** Recent chats, Claude-style: a header menu instead of a permanent column. Kept in this browser only. */
function HistoryMenu({ threads, activeId, onSelect, onDelete }: {
  threads: Thread[]; activeId: string; onSelect: (id: string) => void; onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ago = (t: number) => {
    const m = Math.round((Date.now() - t) / 60000);
    return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
  };
  const today = threads.filter((t) => Date.now() - t.updatedAt < 86400000);
  const older = threads.filter((t) => Date.now() - t.updatedAt >= 86400000);
  const row = (t: Thread) => (
    <div key={t.id} className="group relative">
      <DropdownItem selected={t.id === activeId} onSelect={() => { onSelect(t.id); setOpen(false); }} className="px-2.5 py-2 pe-9">
        <span className="flex min-w-0 flex-1 flex-col text-start">
          <span className="truncate text-body-medium text-text-primary">{t.title}</span>
          <span className="text-caption-1-medium text-text-tertiary">{ago(t.updatedAt)} · {t.msgs.filter((m) => m.role === "user").length} questions</span>
        </span>
      </DropdownItem>
      <button type="button" aria-label={`Delete ${t.title}`} onClick={() => onDelete(t.id)}
        className="absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer rounded-md p-1.5 text-text-tertiary opacity-0 transition-opacity hover:bg-background-secondary-default hover:text-status-rose-text focus-visible:opacity-100 group-hover:opacity-100">
        <Trash className="size-3.5" aria-hidden />
      </button>
    </div>
  );
  return (
    <Dropdown isOpen={open} onOpenChange={setOpen}>
      <DropdownTrigger aria-label="Chat history"
        className="flex h-7 items-center gap-1.5 rounded-lg px-2 text-body-2-medium text-text-secondary transition-colors hover:bg-background-inner-default hover:text-text-primary">
        <ClockCounterClockwise weight="duotone" className="size-4" aria-hidden />History
        {threads.length > 0 && <span className="rounded-md bg-background-inner-default px-1.5 text-caption-1-medium text-text-tertiary tabular-nums">{threads.length}</span>}
      </DropdownTrigger>
      <DropdownPopover aria-label="Recent chats" placement="bottom end" className="w-[320px]" dialogClassName="max-h-[60vh] overflow-y-auto no-scrollbar">
        {threads.length === 0 ? (
          <p className="px-2 py-3 text-body-2-medium text-text-tertiary">No chats yet. They stay in this browser only.</p>
        ) : (
          <>
            {today.length > 0 && <p className="px-2 pt-1 text-caption-1-medium text-text-tertiary">Today</p>}
            {today.map(row)}
            {older.length > 0 && <><DropdownDivider /><p className="px-2 text-caption-1-medium text-text-tertiary">Earlier</p></>}
            {older.map(row)}
          </>
        )}
      </DropdownPopover>
    </Dropdown>
  );
}

function BotTurn({ m, n, live, data, go, onFollow, onUndo, provider }: {
  m: Bot; n: number; live: boolean; data: ForecastResponse | null; go: (r: Route) => void; onFollow: (q: string) => void; onUndo: () => void; provider: DataProvider;
}) {
  const segs = splitPlaceholders(m.text, m.g.facts);
  const done = m.status === "done";
  const plan = m.a.actions?.find((x) => x.plan)?.plan;
  return (
    <div className="flex flex-col gap-3 px-1">
      {m.status === "thinking" ? (
        <AgentThinking variant="wave" label={live ? "Writing" : "Thinking"} shimmer />
      ) : (
        <p className="text-body-regular leading-relaxed text-text-primary">
          {segs.map((s, i) => s.tone ? (
            <span key={i} className={cx("animate-[page-reveal_360ms_ease-out_both] font-semibold tabular-nums",
              s.tone === "good" && "text-status-lime-text", s.tone === "bad" && "text-status-rose-text", s.tone === "brand" && "text-accent-600")}>{s.t}</span>
          ) : <span key={i}>{s.t}</span>)}
          {!done && <span className="ms-0.5 inline-block h-4 w-0.5 translate-y-0.5 animate-pulse rounded-full bg-accent-500 align-baseline" aria-hidden />}
        </p>
      )}
      {m.applied && <AppliedChip state={m.applied} ops={m.a.ops ?? []} onUndo={onUndo} />}
      {/* TabPFN's numbers are ready the moment the question is asked; the words catch up above them */}
      {m.a.card && <div className="animate-[page-reveal_480ms_cubic-bezier(0.22,1,0.36,1)_both]"><ScenarioTile c={m.a.card} /></div>}
      {m.a.artifact && data && <div className="animate-[page-reveal_480ms_cubic-bezier(0.22,1,0.36,1)_both]"><ChatArtifact kind={m.a.artifact} data={data} go={go} provider={provider} /></div>}
      {done && (
        <div className="flex animate-[page-reveal_480ms_cubic-bezier(0.22,1,0.36,1)_both] flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {plan && <Button variant="primary" size="xs" leadingIcon={duo(CalendarPlus)} onClick={() => onFollow(`Add ${plan.name} ₹${Math.round(plan.amount_paise / 100)} on ${shortDate(plan.date)} to plans`)}>Add as a plan</Button>}
            {m.a.follow?.map((f) => <Button key={f} variant="secondary" size="xs" onClick={() => onFollow(f)}>{f}</Button>)}
          </div>
        </div>
      )}
    </div>
  );
}

function AppliedChip({ state, ops, onUndo }: { state: NonNullable<Bot["applied"]>; ops: Op[]; onUndo: () => void }) {
  const undoable = ops.some((o) => o.kind !== "go");
  return (
    <div className="flex items-center gap-2">
      {state === "working" && <Chip variant="caption" color="neutral">Updating your workspace…</Chip>}
      {state === "done" && <Chip variant="caption" color="lime"><CheckCircle weight="fill" className="me-1 size-3.5" aria-hidden />Done · dashboard updated</Chip>}
      {state === "undone" && <Chip variant="caption" color="neutral"><ArrowCounterClockwise className="me-1 size-3.5" aria-hidden />Undone</Chip>}
      {state === "failed" && <Chip variant="caption" color="rose"><XCircle weight="fill" className="me-1 size-3.5" aria-hidden />Could not apply</Chip>}
      {state === "done" && undoable && <Button variant="ghost" size="xs" leadingIcon={duo(ArrowCounterClockwise)} onClick={onUndo}>Undo</Button>}
    </div>
  );
}

/** Smooth SVG path through points (midpoint quadratic smoothing). */
function curve(ys: number[], W: number, H: number, max: number) {
  const n = Math.max(ys.length, 2);
  const P = ys.map((v, i) => [(i / (n - 1)) * W, H - (Math.max(v, 0) / max) * H] as const);
  let d = `M${P[0][0].toFixed(1)},${P[0][1].toFixed(1)}`;
  for (let i = 1; i < P.length - 1; i++) {
    d += ` Q${P[i][0].toFixed(1)},${P[i][1].toFixed(1)} ${((P[i][0] + P[i + 1][0]) / 2).toFixed(1)},${((P[i][1] + P[i + 1][1]) / 2).toFixed(1)}`;
  }
  const L = P[P.length - 1];
  return `${d} L${L[0].toFixed(1)},${L[1].toFixed(1)}`;
}

function ScenarioTile({ c }: { c: ScenarioCard }) {
  const W = 600, H = 96;
  const max = Math.max(...c.beforeP50, ...c.afterP50, c.brokeLine) * 1.1 || 1;
  const verdict = { yes: ["lime", "Comfortable"], tight: ["orange", "Tight"], no: ["rose", "Risky"] }[c.verdict] as ["lime" | "orange" | "rose", string];
  const lost = c.beforeMade - c.afterMade;
  const by = H - (c.brokeLine / max) * H;
  return (
    <div className="rounded-2xl bg-background-inner-default p-3 shadow-card">
      <div className="flex items-center justify-between gap-2 px-1">
        <p className="truncate text-body-medium text-text-primary">{c.title}</p>
        <Chip variant="caption" color={verdict[0]}>{verdict[1]}</Chip>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat label="Months that work out now" value={`${c.beforeMade}/${c.n}`} />
        <Stat label="If you do it" value={`${c.afterMade}/${c.n}`} tone={lost > 0 ? "rose" : "lime"} />
        <Stat label="Costs you" value={c.dayCost !== undefined ? `${c.dayCost.toFixed(1)} days` : "–"} tone="orange" />
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="animate-chart-reveal mt-3 h-24 w-full" role="img" aria-label="Typical balance until payday, now and if you do it">
        <line x1="0" x2={W} y1={by} y2={by} stroke="var(--color-orange-400)" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
        <path d={curve(c.beforeP50, W, H, max)} fill="none" stroke="var(--color-chart-neutral)" strokeWidth="2" strokeDasharray="5 5" vectorEffect="non-scaling-stroke" />
        <path d={curve(c.afterP50, W, H, max)} fill="none" stroke="var(--color-accent-500)" strokeWidth="2.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex flex-wrap gap-x-4 gap-y-1 px-1 text-caption-1-medium text-text-tertiary">
        <span className="flex items-center gap-1.5"><span className="w-3 border-t-2 border-dashed border-chart-neutral" />Typical balance now</span>
        <span className="flex items-center gap-1.5"><span className="w-3 border-t-2 border-accent-500" />If you do it</span>
        <span className="flex items-center gap-1.5"><span className="w-3 border-t-2 border-dashed border-orange-400" />Broke line</span>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "lime" | "rose" | "orange" }) {
  const color = tone === "lime" ? "text-status-lime-text" : tone === "rose" ? "text-status-rose-text" : tone === "orange" ? "text-status-orange-text" : "text-text-primary";
  return (
    <div className="rounded-xl bg-background-secondary-default px-3 py-2">
      <p className="truncate text-caption-1-medium text-text-tertiary">{label}</p>
      <p className={cx("text-title-3-semibold tabular-nums", color)}>{value}</p>
    </div>
  );
}
