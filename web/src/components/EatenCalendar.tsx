import type { ForecastResponse } from "../types";
import { addDays, days, dow, parseISO } from "../lib/format";

/** Days from today to payday. Each active plan takes a bite off the right end, sized by its price in days.
 *  Days after the most likely broke date are hatched. Toggling a plan grows its bite back (700 ms). */
export default function EatenCalendar({ data }: { data: ForecastResponse }) {
  const H = data.horizon_days;
  const cells = Array.from({ length: H }, (_, i) => addDays(data.as_of, i));
  const brokeIdx = data.broke_day ? Math.max(0, Math.round((parseISO(data.broke_day.median).getTime() - parseISO(data.as_of).getTime()) / 86400000)) : null;
  const bites = data.plans.filter((p) => p.day_cost > 0.05);
  const totalActive = bites.filter((b) => b.active).reduce((s, b) => s + b.day_cost, 0);
  const cellPct = 100 / Math.max(H, 1);

  return (
    <div className="rounded-xl border rule p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h3 className="font-medium">The month, eaten</h3>
        <p className="text-xs muted">
          {totalActive > 0 ? <>Plans eat <span className="num" style={{ color: "var(--color-broke)" }}>{days(totalActive)}</span> of runway</> : "No plans eating your runway"}
        </p>
      </div>
      <div className="relative h-14" role="img"
           aria-label={`${H} days until payday. Active plans cost ${days(totalActive)} of runway.${brokeIdx !== null ? ` Most likely broke from day ${brokeIdx + 1}.` : ""}`}>
        <div className="absolute inset-0 flex gap-[2px]">
          {cells.map((d, i) => {
            const broke = brokeIdx !== null && i >= brokeIdx;
            const weekend = ["Sat", "Sun"].includes(dow(d));
            return (
              <div key={d} className={`flex-1 rounded-[3px] relative ${broke ? "hatch" : ""}`}
                   style={{ background: broke ? undefined : weekend ? "var(--bg-2)" : "transparent",
                            outline: "1px solid var(--rule)", outlineOffset: "-1px" }}
                   title={d}>
                <span className="absolute bottom-0.5 left-0 right-0 text-center text-[9px] num muted">{parseISO(d).getUTCDate()}</span>
              </div>
            );
          })}
        </div>
        {/* bites from the right end */}
        <div className="absolute inset-y-0 right-0 flex flex-row-reverse pointer-events-none">
          {bites.map((b) => (
            <div key={b.id} className="h-full overflow-hidden transition-[width] duration-700 ease-in-out"
                 style={{ width: `${b.active ? Math.min(b.day_cost, H) * cellPct : 0}%`, maxWidth: "100%" }}>
              <div className="h-full w-full rounded-l-[14px] flex items-center justify-center text-[10px] text-center px-1 leading-tight"
                   style={{ background: "var(--bg)", boxShadow: "inset 2px 0 0 var(--color-broke)", color: "var(--color-broke)" }}>
                <span className="truncate">{b.name}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex justify-between text-[11px] muted mt-2 num">
        <span>today</span>
        <span>payday →</span>
      </div>
    </div>
  );
}
