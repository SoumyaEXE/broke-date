import {
  CalendarCheck, ChartLineUp, DeviceMobile, GearSix, Lifebuoy, Receipt, SealCheck, SquaresFour, UploadSimple, X,
} from "@phosphor-icons/react";
import type { ForecastResponse } from "../types";
import { Bar } from "./ui";

export type Page = "overview" | "futures" | "plans" | "activity" | "grade" | "import" | "settings";

const NAV: { id: Page; label: string; Icon: typeof SquaresFour; live?: boolean }[] = [
  { id: "overview", label: "Overview", Icon: SquaresFour },
  { id: "futures", label: "Futures", Icon: ChartLineUp },
  { id: "plans", label: "Plans", Icon: CalendarCheck },
  { id: "activity", label: "Activity", Icon: Receipt },
  { id: "grade", label: "How good am I?", Icon: SealCheck },
  { id: "import", label: "Import statement", Icon: UploadSimple, live: true },
];

export default function Sidebar({ page, onPage, open, onClose, demo, subject, data }: {
  page: Page; onPage: (p: Page) => void; open: boolean; onClose: () => void; demo: boolean; subject: string;
  data: ForecastResponse | null;
}) {
  const cyc = data?.context?.cycle;
  const daysInCycle = data ? (cyc?.day_in_cycle ?? 0) + data.horizon_days : 1;
  const name = subject === "sim" ? "Sample student" : subject.replace(/^\w/, (c) => c.toUpperCase());
  return (
    <>
      {open && <button className="fixed inset-0 z-30 bg-black/20 lg:hidden" aria-label="close menu" onClick={onClose} />}
      <aside className={`fixed lg:sticky top-0 z-40 h-screen w-[248px] shrink-0 bg-app flex flex-col px-3 py-4 transition-transform lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center gap-2.5 px-2 pb-5">
          <Logo />
          <span className="text-[17px] font-semibold tracking-tight">Broke Date</span>
          <button className="ml-auto lg:hidden btn-ghost !p-1.5" onClick={onClose} aria-label="close"><X size={18} /></button>
        </div>
        <nav className="space-y-0.5" aria-label="main">
          {NAV.filter((n) => !(n.live && demo)).map(({ id, label, Icon }) => {
            const on = page === id;
            return (
              <button key={id} onClick={() => onPage(id)} aria-current={on ? "page" : undefined}
                      className={`w-full flex items-center gap-3 rounded-xl px-3 py-2 text-[15px] transition ${on ? "bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] border border-line font-medium text-ink" : "text-ink-2 hover:bg-white/70"}`}>
                <Icon size={19} weight="duotone" className={on ? "text-brand" : "text-mute"} />
                {label}
              </button>
            );
          })}
        </nav>

        <div className="mt-auto space-y-3">
          {data && (
            <div className="card !rounded-2xl p-3.5">
              <div className="flex items-center justify-between text-[13px]">
                <span className="font-medium">This month</span>
                <span className="muted">{data.horizon_days} days left</span>
              </div>
              <div className="mt-2.5"><Bar value={(cyc?.day_in_cycle ?? 0) / Math.max(daysInCycle, 1)} color="#7c5cfc" /></div>
              <p className="text-[12px] muted mt-2">Day {cyc?.day_in_cycle ?? 0} of {daysInCycle} until the next allowance.</p>
            </div>
          )}
          <div className="rounded-2xl p-3.5 text-white" style={{ background: "linear-gradient(140deg,#8b6dff 0%,#6a4cf0 60%,#5a3de0 100%)" }}>
            <div className="flex items-center gap-2 text-[13px] font-medium"><DeviceMobile size={18} weight="duotone" /> Pocket file</div>
            <p className="text-[12px] opacity-85 mt-1.5 leading-snug">One offline HTML for your phone: "can I afford it?" in airplane mode.</p>
            <a href={demo ? `${import.meta.env.BASE_URL}demo/pocket.html` : undefined} download={!demo ? undefined : "broke-date-pocket.html"}
               onClick={(e) => { if (!demo) { e.preventDefault(); alert("Run: brokedate export-pocket -s " + subject); } }}
               className="mt-2.5 inline-flex w-full items-center justify-center rounded-xl bg-white/95 text-[13px] font-medium text-brand py-2 hover:bg-white">
              Get pocket file
            </a>
          </div>
          <div className="space-y-0.5">
            <button onClick={() => onPage("settings")} className={`w-full flex items-center gap-3 rounded-xl px-3 py-2 text-[15px] ${page === "settings" ? "bg-white border border-line" : "text-ink-2 hover:bg-white/70"}`}>
              <GearSix size={19} weight="duotone" className="text-mute" /> Settings
            </button>
            <a href="https://github.com/" className="w-full flex items-center gap-3 rounded-xl px-3 py-2 text-[15px] text-ink-2 hover:bg-white/70">
              <Lifebuoy size={19} weight="duotone" className="text-mute" /> How it works
            </a>
          </div>
          <div className="flex items-center gap-2.5 px-2 pt-2 border-t border-line">
            <div className="h-8 w-8 rounded-full grid place-items-center text-[13px] font-semibold text-white" style={{ background: "#121316" }}>
              {name.slice(0, 1)}
            </div>
            <div className="min-w-0">
              <p className="text-[14px] font-medium truncate">{name}</p>
              <p className="text-[11px] muted">offline · on this laptop</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#9a80ff" /><stop offset="1" stopColor="#6a4cf0" /></linearGradient></defs>
      <rect width="32" height="32" rx="10" fill="url(#lg)" />
      <path d="M7 21 L12.5 14.5 L17 18 L25 9" stroke="#fff" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17 18 L23 24" stroke="#ffb27a" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}
