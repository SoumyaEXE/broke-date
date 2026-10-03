import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarPlus, Cpu, NotePencil, Sparkle } from "@phosphor-icons/react";
import { AgentComposer } from "@/components/application/agent-chat/agent-composer";
import { AgentMessage } from "@/components/application/agent-chat/agent-chat-message";
import { AgentThinking } from "@/components/application/agent-thinking/agent-thinking";
import { Button } from "@/components/base/buttons/button";
import { Chip } from "@/components/base/badges/chip";
import { cx } from "@/utils/cx";
import type { ForecastResponse } from "../types";
import type { DataProvider } from "../data/provider";
import { Brain, ground, splitPlaceholders, type Answer, type Grounded, type ScenarioCard } from "../lib/chat";
import { duo } from "./kit";

type Bot = {
  id: number; role: "bot"; at: number; a: Answer; g: Grounded;
  text: string;                       // reply so far, with {fN} placeholders
  status: "thinking" | "streaming" | "done";
  source: "gemma" | "template"; model?: string; note?: string;
};
type Msg = { id: number; role: "user"; text: string; at: number } | Bot;

const STARTERS = [
  "Can I afford a ₹400 movie on Saturday?",
  "How much can I spend today?",
  "When would I run out?",
  "Where did my money go?",
  "How does this work?",
];

export function AskPage({ data, provider, question, onAddPlan }: {
  data: ForecastResponse | null; provider: DataProvider; question: { q: string; n: number } | null;
  onAddPlan: (p: { name: string; amount_paise: number; date: string }) => void;
}) {
  const brain = useMemo(() => { try { return data?.sim ? new Brain(data) : null; } catch { return null; } }, [data]);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [under, setUnder] = useState(false);
  const [language, setLanguage] = useState<string | undefined>();
  const scroller = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);
  const typer = useRef<number | null>(null);
  const seen = useRef<number | null>(null);
  const n = data?.n_futures ?? 500;
  const busy = msgs.some((m) => m.role === "bot" && m.status !== "done");

  useEffect(() => { void provider.settings().then((s) => setLanguage(s.letter_language)).catch(() => undefined); }, [provider]);

  const patch = (id: number, p: Partial<Bot>) => setMsgs((ms) => ms.map((m) => (m.id === id && m.role === "bot" ? { ...m, ...p } : m)));
  const append = (id: number, piece: string) => setMsgs((ms) => ms.map((m) => (m.id === id && m.role === "bot" ? { ...m, text: m.text + piece, status: "streaming" } : m)));

  /** Reveal the checked template word by word (demo, or when Gemma is offline / its draft was rejected). */
  const typeOut = (id: number, template: string, note?: string) => {
    const words = template.split(/(\s+)/);
    let i = 0;
    patch(id, { text: "", status: "streaming", source: "template", note });
    typer.current = window.setInterval(() => {
      i += 2;
      patch(id, { text: words.slice(0, i).join("") });
      if (i >= words.length) { window.clearInterval(typer.current!); patch(id, { status: "done" }); }
    }, 32);
  };

  const send = (q: string) => {
    const t = q.trim();
    if (!t || !brain || busy) return;
    const now = Date.now();
    const a = brain.ask(t);            // the real work: TabPFN futures rerun in the browser, milliseconds
    const g = ground(a);
    const id = now + 1;
    setMsgs((m) => [...m, { id: now, role: "user", text: t, at: now },
      { id, role: "bot", at: now, a, g, text: "", status: "thinking", source: "template" }]);
    setText("");
    if (!provider.chat) { window.setTimeout(() => typeOut(id, g.template), 380); return; }
    const ctl = new AbortController();
    abort.current = ctl;
    let started = false;
    provider.chat({ question: t, template: g.template, facts: g.facts.map(({ id: fid, desc }) => ({ id: fid, desc })), verdict: g.verdict, language },
      (e) => {
        if (e.type === "start") { started = true; patch(id, { source: "gemma", model: e.model }); }
        else if (e.type === "token") append(id, e.text);
        else if (e.type === "done") {
          if (e.ok) patch(id, { text: e.text, status: "done" });
          else typeOut(id, g.template, "Gemma's draft contained a number it was not given, so here is the checked answer instead.");
        } else if (e.type === "error") typeOut(id, g.template, started ? "Gemma stopped mid-reply; showing the checked answer." : `${e.message}. Showing the checked answer.`);
      }, ctl.signal).catch(() => typeOut(id, g.template, "Engine not reachable; showing the checked answer."));
  };
  const stop = () => {
    abort.current?.abort();
    if (typer.current) window.clearInterval(typer.current);
    setMsgs((ms) => ms.map((m) => (m.role === "bot" && m.status !== "done" ? { ...m, status: "done" } : m)));
  };
  const reset = () => { stop(); setMsgs([]); setText(""); };

  useEffect(() => {
    if (question && brain && seen.current !== question.n) { seen.current = question.n; send(question.q); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question, brain]);
  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" }); }, [msgs]);
  useEffect(() => () => { abort.current?.abort(); if (typer.current) window.clearInterval(typer.current); }, []);

  const first = msgs.find((m): m is Extract<Msg, { role: "user" }> => m.role === "user");
  return (
    <section className="relative flex min-h-[560px] flex-1 flex-col overflow-hidden rounded-3xl bg-background-secondary-default">
      {/* BoardUI chat header: overlaid, transparent until the transcript scrolls under it, then frosted */}
      <header className={cx("absolute inset-x-0 top-0 z-10 flex h-12 items-center gap-2 border-b px-4 transition-colors duration-200",
        under ? "border-separator-border bg-white/40 backdrop-blur-[20px]" : "border-transparent")}>
        <span className="min-w-0 flex-1 truncate text-headline-medium text-text-primary">{first ? first.text : "New chat"}</span>
        {msgs.length > 0 && <Button variant="ghost" size="xs" leadingIcon={duo(NotePencil)} onClick={reset}>New chat</Button>}
      </header>

      <div ref={scroller} onScroll={(e) => setUnder(e.currentTarget.scrollTop > 0)} className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain scroll-smooth">
        <div className={cx("mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pt-[72px] pb-6", msgs.length === 0 && "min-h-full justify-center")}>
          {msgs.length === 0 ? (
            <div className="reveal flex flex-col items-center gap-5 text-center">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-background-inner-default shadow-card">
                <Sparkle weight="duotone" className="size-6 text-accent-500" aria-hidden />
              </span>
              <div className="flex flex-col gap-1">
                <h2 className="text-title-2-medium text-text-primary">Ask about your month</h2>
                <p className="text-body-regular text-text-secondary">TabPFN works out every number from {n} simulated months. {provider.chat ? "Gemma, running on this laptop, puts it into words." : "In the full app, Gemma on your laptop puts it into words."}</p>
              </div>
              <div className="flex max-w-xl flex-wrap justify-center gap-2">
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
            : <BotTurn key={m.id} m={m} n={n} onFollow={send} onAddPlan={onAddPlan} />)}
        </div>
      </div>

      <div className="shrink-0 px-3 pb-3">
        <div className="mx-auto w-full max-w-3xl">
          <AgentComposer value={text} onValueChange={setText} onSubmit={() => send(text)} onStop={stop} busy={busy}
            model={data ? `TabPFN ${data.model.model_version?.split(" ").pop() ?? ""}`.trim() : "TabPFN"}
            messageCount={msgs.length} showStatus={false} showAttach={false} placeholder="Can I afford ₹600 on Friday?" />
        </div>
      </div>
    </section>
  );
}

function BotTurn({ m, n, onFollow, onAddPlan }: { m: Bot; n: number; onFollow: (q: string) => void; onAddPlan: (p: { name: string; amount_paise: number; date: string }) => void }) {
  const [added, setAdded] = useState(false);
  const segs = splitPlaceholders(m.text, m.g.facts);
  if (m.status === "thinking") return <AgentThinking variant="wave" label={`Running ${n} futures`} shimmer className="px-1" />;
  const done = m.status === "done";
  return (
    <div className="flex flex-col gap-3 px-1">
      <p className="text-body-regular leading-relaxed text-text-primary">
        {segs.map((s, i) => s.tone ? (
          <span key={i} className={cx("animate-[page-reveal_360ms_ease-out_both] font-semibold tabular-nums",
            s.tone === "good" && "text-status-lime-text", s.tone === "bad" && "text-status-rose-text", s.tone === "brand" && "text-accent-600")}>{s.t}</span>
        ) : <span key={i}>{s.t}</span>)}
        {!done && <span className="ms-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse rounded-full bg-accent-500 align-baseline" aria-hidden />}
      </p>
      {done && (
        <div className="flex animate-[page-reveal_480ms_cubic-bezier(0.22,1,0.36,1)_both] flex-col gap-3">
          {m.a.card && <ScenarioTile c={m.a.card} />}
          <div className="flex flex-wrap items-center gap-2">
            {m.a.actions?.map((ac) => ac.plan && (
              <Button key={ac.label} variant="primary" size="xs" leadingIcon={duo(CalendarPlus)} disabled={added}
                onClick={() => { onAddPlan(ac.plan!); setAdded(true); }}>{added ? "Added to plans" : ac.label}</Button>
            ))}
            {m.a.follow?.map((f) => <Button key={f} variant="secondary" size="xs" onClick={() => onFollow(f)}>{f}</Button>)}
          </div>
          <p className="flex items-center gap-1.5 text-caption-1-medium text-text-tertiary">
            <Cpu weight="duotone" className="size-3.5" aria-hidden />
            {m.source === "gemma" ? `Words by ${m.model} on this laptop · numbers by TabPFN, ${n} futures` : `Checked answer · numbers by TabPFN, ${n} futures`}
          </p>
          {m.note && <p className="text-caption-1-medium text-text-tertiary">{m.note}</p>}
        </div>
      )}
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
