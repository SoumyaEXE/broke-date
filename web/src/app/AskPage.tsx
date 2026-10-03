import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarPlus, ChartLineUp, Hourglass, Question, Sparkle, Wallet, Warning } from "@phosphor-icons/react";
import { AgentComposer } from "@/components/application/agent-chat/agent-composer";
import { AgentMessage } from "@/components/application/agent-chat/agent-chat-message";
import { AgentThinking } from "@/components/application/agent-thinking/agent-thinking";
import { Button } from "@/components/base/buttons/button";
import { Chip } from "@/components/base/badges/chip";
import { cx } from "@/utils/cx";
import type { ForecastResponse } from "../types";
import { Brain, type Answer, type ScenarioCard } from "../lib/chat";
import { inr } from "../lib/format";
import { duo } from "./kit";

type Msg = { id: number; role: "user"; text: string; at: number } | { id: number; role: "bot"; a: Answer; at: number };

const STARTERS = [
  { icon: Wallet, q: "How much is safe to spend today?" },
  { icon: Sparkle, q: "Can I afford ₹400 movie on Saturday?" },
  { icon: Warning, q: "When would I go broke?" },
  { icon: Hourglass, q: "How long does my money last?" },
  { icon: ChartLineUp, q: "Where did my money go this month?" },
  { icon: Question, q: "How do you work?" },
];

export function AskPage({ data, question, onAddPlan }: {
  data: ForecastResponse | null; question: { q: string; n: number } | null;
  onAddPlan: (p: { name: string; amount_paise: number; date: string }) => void;
}) {
  const brain = useMemo(() => { try { return data?.sim ? new Brain(data) : null; } catch { return null; } }, [data]);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [scrolled, setScrolled] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const timer = useRef<number | null>(null);
  const seen = useRef<number | null>(null);

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

  useEffect(() => {
    if (question && brain && seen.current !== question.n) { seen.current = question.n; send(question.q); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question, brain]);
  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" }); }, [msgs, busy]);

  const fade = Math.min(1, scrolled / 24);
  return (
    <section className="relative flex min-h-[560px] flex-1 flex-col overflow-hidden rounded-3xl bg-background-secondary-default">
      {/* progressive blur + surface fade under the top edge once scrolled (BoardUI scroll rule) */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-10" aria-hidden>
        <div className="absolute inset-0 backdrop-blur-[1px] [mask-image:linear-gradient(to_bottom,black,transparent)]" style={{ opacity: fade }} />
        <div className="absolute inset-x-0 top-0 h-4 backdrop-blur-[4px] [mask-image:linear-gradient(to_bottom,black,transparent)]" style={{ opacity: fade }} />
        <div className="absolute inset-0 bg-linear-to-b from-background-secondary-default to-transparent" style={{ opacity: fade }} />
      </div>

      <div ref={scroller} onScroll={(e) => setScrolled(e.currentTarget.scrollTop)} className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
        <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6 px-4 pt-8 pb-6">
          {msgs.length === 0 ? (
            <div className="flex flex-col items-center pt-6 text-center sm:pt-14">
              <span className="flex size-14 items-center justify-center rounded-2xl bg-background-inner-default shadow-card">
                <Sparkle weight="duotone" className="size-7 text-accent-500" aria-hidden />
              </span>
              <h2 className="mt-5 text-title-1-medium text-text-primary">What do you want to know?</h2>
              <p className="mt-2 max-w-md text-body-regular text-text-secondary">
                I answer by rerunning the same {data?.n_futures ?? 500} futures TabPFN simulated from your own history. No number here is made up by a language model.
              </p>
              <div className="mt-7 grid w-full gap-2 sm:grid-cols-2">
                {STARTERS.map(({ icon: I, q }) => (
                  <button key={q} type="button" disabled={!brain} onClick={() => send(q)}
                    className="flex items-center gap-2.5 rounded-2xl bg-background-inner-default px-3.5 py-3 text-start text-body-medium text-text-primary shadow-card outline-none transition hover:bg-background-primary-hover focus-visible:ring-2 focus-visible:ring-border-focus-ring disabled:opacity-50">
                    <I weight="duotone" className="size-5 shrink-0 text-accent-500" aria-hidden />{q}
                  </button>
                ))}
              </div>
              {!brain && <p className="mt-4 text-body-2-medium text-text-tertiary">Waiting for the forecast to load…</p>}
            </div>
          ) : msgs.map((m) => m.role === "user"
            ? <AgentMessage key={m.id} role="user" text={m.text} at={m.at} />
            : <BotTurn key={m.id} a={m.a} onFollow={send} onAddPlan={onAddPlan} />)}
          {busy && <AgentThinking variant="wave" label={`Rerunning ${data?.n_futures ?? 500} futures`} shimmer />}
        </div>
      </div>

      <div className="mx-auto w-full max-w-[720px] px-4 pb-4">
        <AgentComposer value={text} onValueChange={setText} onSubmit={() => send(text)} onStop={stop} busy={busy}
          provider="Local" model={data ? `TabPFN ${data.model.model_version?.split(" ").pop() ?? ""} · offline`.trim() : "TabPFN · offline"}
          messageCount={msgs.length} />
      </div>
    </section>
  );
}

function BotTurn({ a, onFollow, onAddPlan }: { a: Answer; onFollow: (q: string) => void; onAddPlan: (p: { name: string; amount_paise: number; date: string }) => void }) {
  const [added, setAdded] = useState(false);
  return (
    <div className="flex flex-col gap-3 px-1">
      <p className="text-body-regular text-text-primary [&_b]:font-semibold">
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
          <Button key={ac.label} variant="primary" size="xs" leadingIcon={duo(CalendarPlus)} isDisabled={added}
                  onClick={() => { onAddPlan(ac.plan!); setAdded(true); }}>{added ? "Added to plans" : ac.label}</Button>
        ))}
        {a.follow?.map((f) => <Button key={f} variant="secondary" size="xs" onClick={() => onFollow(f)}>{f}</Button>)}
        <span className="ms-auto text-caption-1-medium text-text-tertiary tabular-nums">{a.ms} ms · simulated, not generated</span>
      </div>
    </div>
  );
}

function ScenarioTile({ c }: { c: ScenarioCard }) {
  const W = 600, H = 96;
  const all = [...c.beforeP50, ...c.afterP50, c.brokeLine];
  const max = Math.max(...all) * 1.1 || 1;
  const n = Math.max(c.beforeP50.length, 2);
  const pts = (arr: number[]) => arr.map((v, i) => `${((i / (n - 1)) * W).toFixed(1)},${(H - (Math.max(v, 0) / max) * H).toFixed(1)}`).join(" ");
  const verdict = { yes: ["lime", "Comfortable"], tight: ["orange", "Tight"], no: ["rose", "Risky"] }[c.verdict] as ["lime" | "orange" | "rose", string];
  const lost = c.beforeMade - c.afterMade;
  return (
    <div className="rounded-2xl bg-background-inner-default p-3 shadow-card">
      <div className="flex items-center justify-between gap-2 px-1">
        <p className="truncate text-body-medium text-text-primary">{c.title}</p>
        <Chip variant="caption" color={verdict[0]}>{verdict[1]}</Chip>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat label="Make it now" value={`${c.beforeMade}`} sub={`of ${c.n}`} />
        <Stat label="With this" value={`${c.afterMade}`} sub={lost > 0 ? `${lost} fewer` : "no change"} tone={lost > 0 ? "rose" : "lime"} />
        <Stat label="Price" value={c.dayCost !== undefined ? c.dayCost.toFixed(1) : "–"} sub="days of runway" tone="orange" />
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="mt-3 h-24 w-full" role="img" aria-label="Median balance to payday before and after">
        <line x1="0" x2={W} y1={H - (c.brokeLine / max) * H} y2={H - (c.brokeLine / max) * H} stroke="var(--color-rose-400)" strokeDasharray="4 4" />
        <polyline points={pts(c.beforeP50)} fill="none" stroke="var(--color-chart-neutral)" strokeWidth="2" strokeDasharray="5 5" vectorEffect="non-scaling-stroke" />
        <polyline points={pts(c.afterP50)} fill="none" stroke="var(--color-accent-500)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <p className="px-1 text-caption-1-medium text-text-tertiary">Median balance to payday · dashed: now · solid: with this · red: broke line {inr(c.brokeLine)}</p>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "lime" | "rose" | "orange" }) {
  const color = tone === "lime" ? "text-status-lime-text" : tone === "rose" ? "text-status-rose-text" : tone === "orange" ? "text-status-orange-text" : "text-text-primary";
  return (
    <div className="rounded-xl bg-background-secondary-default px-3 py-2">
      <p className="text-caption-1-medium text-text-tertiary">{label}</p>
      <p className={cx("text-title-3-semibold tabular-nums", color)}>{value}</p>
      <p className="text-caption-1-medium text-text-tertiary">{sub}</p>
    </div>
  );
}
