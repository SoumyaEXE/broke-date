import { useState } from "react";
import { CalendarBlank, List, MagnifyingGlass, Sparkle } from "@phosphor-icons/react";
import type { ForecastResponse } from "../types";
import { daysBetween, dow, shortDate } from "../lib/format";
import MovingGradientButton from "./originkit/MovingGradientButton";

export default function Topbar({ data, onAsk, onMenu, busy }: {
  data: ForecastResponse | null; onAsk: (q?: string) => void; onMenu: () => void; busy: boolean;
}) {
  const [q, setQ] = useState("");
  return (
    <header className="flex items-center gap-2.5 px-3 sm:px-4 py-3">
      <button className="lg:hidden btn-ghost !p-2" onClick={onMenu} aria-label="open menu"><List size={20} /></button>
      <form className="relative flex-1 max-w-[440px]" onSubmit={(e) => { e.preventDefault(); if (q.trim()) { onAsk(q.trim()); setQ(""); } }}>
        <MagnifyingGlass size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-mute" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask anything… “can I afford ₹400 on Saturday?”"
               className="w-full rounded-full bg-white border border-line pl-10 pr-4 py-2.5 text-[14px] outline-none focus:border-[#c9bbff] focus:shadow-[0_0_0_4px_#f0ebff] transition"
               aria-label="ask Broke Date" />
      </form>
      <div className="ml-auto flex items-center gap-2">
        {busy && <span className="hidden sm:inline text-[12px] muted">updating…</span>}
        {data && (
          <span className="pill hidden md:inline-flex">
            <CalendarBlank size={16} weight="duotone" className="text-mute" />
            <span>{dow(data.as_of)} {shortDate(data.as_of)}</span>
            <span className="muted">· allowance in {daysBetween(data.as_of, data.next_anchor_date)}d</span>
          </span>
        )}
        <MovingGradientButton label="Ask Broke Date" onClick={() => onAsk()} padding="9px 16px" rounded={100}
          font={{ fontFamily: "Inter Variable, Inter, sans-serif", fontWeight: 500, fontSize: 14, lineHeight: "20px" }}
          colors={{ fill: "#121316", hoverFill: "#121316", textColor: "#ffffff", hoverTextColor: "#ffffff" }}
          border={{ borderWidth: 1.5, borderColor: "rgba(255,255,255,0.08)" }}
          stroke={{ color: "#7c5cfc", headColor: "#ffb27a", count: 2, speed: 18, trail: 90, movement: "step", direction: "cw" }}
          icon={{ color: "#c8b8ff", hoverColor: "#ffb27a" }} gap={8}>
          <Sparkle size={16} weight="duotone" />
        </MovingGradientButton>
      </div>
    </header>
  );
}
