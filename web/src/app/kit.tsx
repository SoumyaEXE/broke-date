/* Small app-level building blocks in BoardUI's own recipe (tokens + composite type only). */
import type { ComponentType, ReactNode } from "react";
import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import { cx } from "@/utils/cx";

type IconComponent = ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;

/** Phosphor duotone icons, shaped for BoardUI icon slots (`leadingIcon={duo(Icon)}`). */
const cache = new Map<PhosphorIcon, IconComponent>();
export function duo(I: PhosphorIcon): IconComponent {
  let C = cache.get(I);
  if (!C) {
    C = ({ className }) => <I weight="duotone" className={className} aria-hidden />;
    cache.set(I, C);
  }
  return C;
}

/** BoardUI dashboard card: neutral surface, header row, white inner tile. */
export function Panel({ title, sub, icon: Icon, action, children, className, bodyClassName, flush }: {
  title: ReactNode; sub?: ReactNode; icon?: PhosphorIcon; action?: ReactNode; children: ReactNode;
  className?: string; bodyClassName?: string; flush?: boolean;
}) {
  return (
    <section className={cx("flex min-w-0 flex-col rounded-2xl bg-background-secondary-default p-2", className)}>
      <header className="flex items-center gap-2.5 px-2 pt-1.5 pb-3">
        {Icon && (
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-background-inner-default shadow-card">
            <Icon weight="duotone" className="size-[18px] text-foreground-icon-primary" aria-hidden />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-body-medium text-text-primary">{title}</h2>
          {sub && <p className="truncate text-body-2-medium text-text-tertiary">{sub}</p>}
        </div>
        {action}
      </header>
      <div className={cx("min-w-0 flex-1 rounded-2lg bg-background-inner-default shadow-card", !flush && "p-4", bodyClassName)}>
        {children}
      </div>
    </section>
  );
}

export function Rows({ children }: { children: ReactNode }) {
  return <ul className="divide-y divide-separator-border">{children}</ul>;
}

export function Row({ children, className }: { children: ReactNode; className?: string }) {
  return <li className={cx("flex min-w-0 items-center gap-3 px-4 py-3", className)}>{children}</li>;
}

/** Round icon tile used at the start of list rows. */
export function Tile({ icon: Icon, tone = "neutral" }: { icon: PhosphorIcon; tone?: "neutral" | "accent" | "orange" | "lime" | "rose" }) {
  const t = {
    neutral: "bg-background-secondary-default text-foreground-icon-primary",
    accent: "bg-accent-50 text-accent-600",
    orange: "bg-status-orange-background text-status-orange-text",
    lime: "bg-status-lime-background text-status-lime-text",
    rose: "bg-status-rose-background text-status-rose-text",
  }[tone];
  return (
    <span className={cx("flex size-9 shrink-0 items-center justify-center rounded-full", t)}>
      <Icon weight="duotone" className="size-[18px]" aria-hidden />
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-4 py-6 text-body-regular text-text-tertiary">{children}</p>;
}

export function Legend({ swatch, label, dashed }: { swatch: string; label: string; dashed?: boolean }) {
  return (
    <span className="flex items-center gap-1.5 text-body-2-medium text-text-secondary">
      {dashed ? <span className="w-3 border-t-2 border-dashed" style={{ borderColor: swatch }} aria-hidden />
        : <span className="size-2 rounded-full" style={{ background: swatch }} aria-hidden />}
      {label}
    </span>
  );
}

/** Thin progress track in accent, with an optional end knob (goal-row style). */
export function Track({ value, tone = "accent" }: { value: number; tone?: "accent" | "orange" }) {
  const v = Math.max(0, Math.min(1, value));
  const fill = tone === "accent" ? "bg-accent-500" : "bg-orange-500";
  const ring = tone === "accent" ? "border-accent-500" : "border-orange-500";
  return (
    <div className="relative h-1.5 w-full rounded-full bg-background-tertiary-default">
      <div className={cx("absolute inset-y-0 start-0 rounded-full transition-[width] duration-700", fill)} style={{ width: `${v * 100}%` }} />
      <span className={cx("absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] bg-background-inner-default transition-[left] duration-700", ring)}
            style={{ left: `${v * 100}%` }} aria-hidden />
    </div>
  );
}
