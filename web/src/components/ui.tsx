import type { ReactNode } from "react";
import { CaretRight } from "@phosphor-icons/react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`card overflow-hidden ${className}`}>{children}</section>;
}

export function CardHead({ icon, title, action, sub }: {
  icon?: ReactNode; title: ReactNode; action?: ReactNode; sub?: ReactNode;
}) {
  return (
    <div className="card-head flex items-center gap-2.5 px-5 py-4">
      {icon && <span className="text-ink-2">{icon}</span>}
      <div className="min-w-0 flex-1">
        <h3 className="text-[15px] font-medium leading-tight">{title}</h3>
        {sub && <p className="text-xs muted mt-0.5">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function SeeAll({ onClick, label = "See all" }: { onClick?: () => void; label?: string }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-1 text-[14px] font-medium text-ink hover:opacity-70">
      {label} <CaretRight size={14} weight="bold" />
    </button>
  );
}

export function Toggle({ on, onChange, label, disabled }: {
  on: boolean; onChange: () => void; label: string; disabled?: boolean;
}) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={onChange}
            className="relative h-6 w-10 shrink-0 rounded-full transition-colors disabled:opacity-50"
            style={{ background: on ? "#7c5cfc" : "#e4e4e9" }}>
      <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all"
            style={{ left: on ? 18 : 2 }} />
    </button>
  );
}

export function Bar({ value, color, track = "#f0f0f3", knob }: {
  value: number; color: string; track?: string; knob?: ReactNode;
}) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="relative h-2 w-full rounded-full" style={{ background: track }}>
      <div className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700" style={{ width: `${v * 100}%`, background: color }} />
      {knob && (
        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 transition-[left] duration-700" style={{ left: `${v * 100}%` }}>{knob}</div>
      )}
    </div>
  );
}

export function Delta({ value, suffix = "", invert = false }: { value: number; suffix?: string; invert?: boolean }) {
  const good = invert ? value < 0 : value > 0;
  const zero = Math.abs(value) < 1e-9;
  return (
    <span className="mono text-[12px] rounded-full px-2 py-0.5"
          style={{ background: zero ? "#f3f3f5" : good ? "#e7f6ee" : "#fdecec", color: zero ? "#7b7f88" : good ? "#12a150" : "#e5484d" }}>
      {value > 0 ? "+" : ""}{value}{suffix}
    </span>
  );
}

export function Legend({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] text-ink-2">
      {dashed ? <span className="inline-block w-3 border-t-2 border-dashed" style={{ borderColor: color }} />
        : <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} />}
      {label}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-5 py-6 text-sm muted">{children}</p>;
}
