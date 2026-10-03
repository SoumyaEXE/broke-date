import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarPlus, NotePencil, Sparkle } from "@phosphor-icons/react";
import { AgentComposer } from "@/components/application/agent-chat/agent-composer";
import { AgentMessage } from "@/components/application/agent-chat/agent-chat-message";
import { AgentThinking } from "@/components/application/agent-thinking/agent-thinking";
import { Button } from "@/components/base/buttons/button";
import { Chip } from "@/components/base/badges/chip";
import { cx } from "@/utils/cx";
import type { ForecastResponse } from "../types";
import { Brain, type Answer, type ScenarioCard } from "../lib/chat";
import { duo } from "./kit";

type Msg = { id: number; role: "user"; text: string; at: number } | { id: number; role: "bot"; a: Answer; at: number };

const STARTERS = [
  "Can I afford a ₹400 movie on Saturday?",
  "How much can I spend today?",
  "When would I run out?",
  "Where did my money go?",
  "How does this work?",
];

export function AskPage({ data, question, onAddPlan }: {
  data: ForecastResponse | null; question: { q: string; n: number } | null;
  onAddPlan: (p: { name: string; amount_paise: number; date: string }) => void;
}) {
  const brain = useMemo(() => { try { return data?.sim ? new Brain(data) : null; } catch { return null; } }, [data]);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [under, setUnder] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const timer = useRef<number | null>(null);
  const seen = useRef<number | null>(null);
  const n = data?.n_futures ?? 500;

  const send = (q: string) => {
    const t = q.trim();
    if (!t || !brain || busy) return;
    setMsgs((m) => [...m, { id: Date.now(), role: "user", text: t, at: Date.now() }]);
    setText("");
    setBusy(true);
    // the simulation takes milliseconds; a short beat lets the thinking state read as work, not a glitch
    timer.current = window.setTimeout(() => {
      const a = brain.ask(t);
      setMsgs((m) => [...m, { id: Date.now() + 1, role: "bot", a, at: Date.now() }]);
      setBusy(false);
    }, 450);
  };
  const stop = () => { if (timer.current) window.clearTimeout(timer.current); setBusy(false); };
  const reset = () => { stop(); setMsgs([]); setText(""); };

  useEffect(() => {
    if (question && brain && seen.current !== question.n) { seen.current = question.n; send(question.q); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question, brain]);
  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" }); }, [msgs, busy]);

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
                <p className="text-body-regular text-text-secondary">Every answer is worked out from {n} simulated months, not guessed by a chatbot.</p>
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
            : <BotTurn key={m.id} a={m.a} n={n} onFollow={send} onAddPlan={onAddPlan} />)}
          {busy && <AgentThinking variant="wave" label={`Running ${n} futures`} shimmer className="px-1" />}
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

function BotTurn({ a, n, onFollow, onAddPlan }: { a: Answer; n: number; onFollow: (q: string) => void; onAddPlan: (p: { name: string; amount_paise: number; date: string }) => void }) {
  const [added, setAdded] = useState(false);
  return (
    <div className="flex animate-[page-reveal_520ms_cubic-bezier(0.22,1,0.36,1)_both] flex-col gap-3 px-1">
      <p className="text-body-regular leading-relaxed text-text-primary">
        {a.segs.map((s, i) => (
          <span key={i} className={cx(
            s.tone === "num" && "font-semibold tabular-nums",
            s.tone === "good" && "font-semibold text-status-lime-text tabular-nums",
            s.tone === "bad" && "font-semibold text-status-rose-text tabular-nums",
            s.tone === "brand" && "font-medium text-accent-600",
          )}>{s.t}</span>
        ))}
      </p>
      {a.card && <ScenarioTile c={a.card} />}
      <div className="flex flex-wrap items-center gap-2">
        {a.actions?.map((ac) => ac.plan && (
          <Button key={ac.label} variant="primary" size="xs" leadingIcon={duo(CalendarPlus)} disabled={added}
            onClick={() => { onAddPlan(ac.plan!); setAdded(true); }}>{added ? "Added to plans" : ac.label}</Button>
        ))}
        {a.follow?.map((f) => <Button key={f} variant="secondary" size="xs" onClick={() => onFollow(f)}>{f}</Button>)}
        <span className="ms-auto text-caption-1-medium text-text-tertiary">From {n} simulated months</span>
      </div>
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
