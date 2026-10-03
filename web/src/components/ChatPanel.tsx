import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, CalendarPlus, Cpu, Sparkle, WifiSlash, X } from "@phosphor-icons/react";
import type { ForecastResponse } from "../types";
import { Brain, type Answer, type ScenarioCard } from "../lib/chat";
import { inr } from "../lib/format";
import { Logo } from "./Sidebar";

type Msg = { role: "user"; text: string } | { role: "bot"; a: Answer };

const STARTERS = [
  "Can I afford ₹400 movie on Saturday?",
  "How much is safe to spend today?",
  "When would I go broke?",
  "How long does my money last?",
  "Where did my money go this month?",
  "How do you work?",
];

export default function ChatPanel({ open, onClose, data, seed, onAddPlan }: {
  open: boolean; onClose: () => void; data: ForecastResponse | null; seed: { q: string; n: number } | null;
  onAddPlan: (p: { name: string; amount_paise: number; date: string }) => void;
}) {
  const brain = useMemo(() => { try { return data?.sim ? new Brain(data) : null; } catch { return null; } }, [data]);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [thinking, setThinking] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const send = (q: string) => {
    if (!q.trim() || !brain) return;
    setMsgs((m) => [...m, { role: "user", text: q.trim() }]);
    setText("");
    setThinking(true);
    // let the typing indicator paint; the simulation itself takes milliseconds
    setTimeout(() => {
      const a = brain.ask(q);
      setMsgs((m) => [...m, { role: "bot", a }]);
      setThinking(false);
    }, 380);
  };

  useEffect(() => { if (seed && brain) send(seed.q); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [seed?.n, brain]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs, thinking]);
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 250); }, [open]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape" && open) onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);

  return (
    <>
      {open && <button className="fixed inset-0 z-40 bg-black/10 xl:hidden" aria-label="close chat" onClick={onClose} />}
      <aside aria-label="Ask Broke Date" aria-hidden={!open}
             className={`fixed xl:sticky right-0 top-0 z-50 h-screen bg-white border-l border-line flex flex-col transition-[width,transform] duration-300 ease-out
               ${open ? "w-full sm:w-[440px] translate-x-0" : "w-0 translate-x-full xl:translate-x-0"} overflow-hidden shrink-0`}>
        <div className="min-w-[320px] sm:min-w-[440px] h-full flex flex-col">
          <div className="flex items-center gap-2.5 px-5 h-[64px] border-b border-line">
            <Logo size={26} />
            <div className="flex-1">
              <p className="text-[15px] font-semibold leading-tight">Ask Broke Date</p>
              <p className="text-[11.5px] muted flex items-center gap-1"><Cpu size={12} weight="duotone" /> answers from your TabPFN futures · <WifiSlash size={12} weight="duotone" /> offline</p>
            </div>
            <button className="btn-ghost !p-2" onClick={onClose} aria-label="close"><X size={18} /></button>
          </div>

          <div className="flex-1 overflow-y-auto scroll-thin px-5 py-5 space-y-5">
            {msgs.length === 0 && (
              <div className="rise">
                <div className="h-12 w-12 rounded-2xl grid place-items-center" style={{ background: "#f4f0ff" }}><Sparkle size={26} weight="duotone" className="text-brand" /></div>
                <h2 className="text-[22px] font-semibold tracking-tight mt-4 leading-snug">What do you want to know about your month?</h2>
                <p className="text-[14px] muted mt-2 leading-relaxed">
                  Every answer reruns the same {data?.n_futures ?? 500} futures that TabPFN simulated from your own history. No number here is guessed by a language model.
                </p>
                <div className="mt-5 grid gap-2">
                  {STARTERS.map((s) => (
                    <button key={s} onClick={() => send(s)} disabled={!brain}
                            className="text-left text-[14px] rounded-xl border border-line px-3.5 py-2.5 hover:bg-[#faf9ff] hover:border-[#ded4ff] transition disabled:opacity-50">{s}</button>
                  ))}
                </div>
                {!brain && <p className="text-[13px] text-bad mt-3">Waiting for a forecast…</p>}
              </div>
            )}
            {msgs.map((m, i) => m.role === "user" ? (
              <div key={i} className="flex justify-end rise">
                <p className="max-w-[85%] rounded-2xl rounded-br-md bg-[#f4f4f6] px-4 py-2.5 text-[14.5px] leading-relaxed">{m.text}</p>
              </div>
            ) : (
              <BotMsg key={i} a={m.a} onFollow={send} onAddPlan={onAddPlan} />
            ))}
            {thinking && (
              <div className="flex items-center gap-2 text-[13px] muted rise">
                <Logo size={20} />
                <span>rerunning {data?.n_futures ?? 500} futures</span>
                <span className="dot-typing inline-flex gap-0.5"><span>•</span><span>•</span><span>•</span></span>
              </div>
            )}
            <div ref={endRef} />
          </div>

          <form className="p-4 border-t border-line" onSubmit={(e) => { e.preventDefault(); send(text); }}>
            <div className="rounded-2xl border border-line bg-white focus-within:border-[#c9bbff] focus-within:shadow-[0_0_0_4px_#f0ebff] transition">
              <textarea ref={inputRef} rows={2} value={text} onChange={(e) => setText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(text); } }}
                        placeholder="Can I afford ₹500 biryani on Friday?" aria-label="message"
                        className="w-full resize-none bg-transparent px-4 pt-3 text-[14.5px] outline-none" />
              <div className="flex items-center justify-between px-3 pb-2.5">
                <span className="text-[11.5px] muted">Enter to send · Shift+Enter for a new line</span>
                <button type="submit" disabled={!text.trim() || !brain} aria-label="send"
                        className="h-8 w-8 rounded-full grid place-items-center text-white disabled:opacity-30 transition"
                        style={{ background: "#121316" }}><ArrowUp size={16} weight="bold" /></button>
              </div>
            </div>
          </form>
        </div>
      </aside>
    </>
  );
}

function BotMsg({ a, onFollow, onAddPlan }: { a: Answer; onFollow: (q: string) => void; onAddPlan: (p: { name: string; amount_paise: number; date: string }) => void }) {
  const [added, setAdded] = useState(false);
  return (
    <div className="rise">
      <div className="flex items-center gap-2 mb-1.5"><Logo size={20} /><span className="text-[12px] muted">Broke Date · {a.ms} ms</span></div>
      <p className="text-[14.5px] leading-[1.65] text-ink">
        {a.segs.map((s, i) => (
          <span key={i} className={s.tone === "num" ? "num font-semibold" : s.tone === "good" ? "font-semibold text-good num" : s.tone === "bad" ? "font-semibold text-bad num" : s.tone === "brand" ? "font-medium text-brand" : ""}>{s.t}</span>
        ))}
      </p>
      {a.card && <Scenario c={a.card} />}
      {(a.actions?.length || a.follow?.length) ? (
        <div className="flex flex-wrap gap-2 mt-3">
          {a.actions?.map((ac) => ac.plan && (
            <button key={ac.label} disabled={added} onClick={() => { onAddPlan(ac.plan!); setAdded(true); }}
                    className="btn-primary !py-1.5 !px-3 !text-[13px] !rounded-full disabled:opacity-60">
              <CalendarPlus size={15} weight="duotone" />{added ? "Added to plans" : ac.label}
            </button>
          ))}
          {a.follow?.map((f) => (
            <button key={f} onClick={() => onFollow(f)} className="text-[13px] rounded-full border border-line px-3 py-1.5 hover:bg-[#faf9ff]">{f}</button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Scenario({ c }: { c: ScenarioCard }) {
  const W = 360, H = 90;
  const all = [...c.beforeP50, ...c.afterP50, c.brokeLine];
  const max = Math.max(...all) * 1.1 || 1;
  const n = Math.max(c.beforeP50.length, 2);
  const pts = (a: number[]) => a.map((v, i) => `${(i / (n - 1)) * W},${H - (Math.max(v, 0) / max) * H}`).join(" ");
  const tone = c.verdict === "yes" ? ["#e7f6ee", "#12a150", "Comfortable"] : c.verdict === "tight" ? ["#fff1e7", "#f97316", "Tight"] : ["#fdecec", "#e5484d", "Risky"];
  return (
    <div className="mt-3 rounded-2xl border border-line p-4 bg-[#fcfcfd]">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-medium truncate">{c.title}</p>
        <span className="text-[12px] rounded-full px-2 py-0.5 font-medium" style={{ background: tone[0], color: tone[1] }}>{tone[2]}</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Stat label="before" value={`${c.beforeMade}`} sub={`of ${c.n}`} />
        <Stat label="after" value={`${c.afterMade}`} sub={`of ${c.n}`} color={c.afterMade < c.beforeMade ? "#e5484d" : "#12a150"} />
        <Stat label="price" value={c.dayCost !== undefined ? c.dayCost.toFixed(1) : "–"} sub="days" color="#f97316" />
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[90px] mt-3" role="img" aria-label="median balance before and after">
        <line x1="0" x2={W} y1={H - (c.brokeLine / max) * H} y2={H - (c.brokeLine / max) * H} stroke="#e5484d" strokeDasharray="4 4" opacity=".5" />
        <polyline points={pts(c.beforeP50)} fill="none" stroke="#c9bbff" strokeWidth="2" />
        <polyline points={pts(c.afterP50)} fill="none" stroke="#7c5cfc" strokeWidth="2.4" />
      </svg>
      <p className="text-[11.5px] muted mt-1">Median balance to payday: <span style={{ color: "#c9bbff" }}>■</span> before · <span className="text-brand">■</span> after · broke line {inr(c.brokeLine)}</p>
    </div>
  );
}

function Stat({ label, value, sub, color }: { label: string; value: string; sub: string; color?: string }) {
  return (
    <div className="rounded-xl bg-white border border-line py-2">
      <p className="text-[11px] muted uppercase tracking-wide">{label}</p>
      <p className="num text-[20px] font-semibold leading-tight" style={{ color }}>{value}</p>
      <p className="text-[11px] muted">{sub}</p>
    </div>
  );
}
