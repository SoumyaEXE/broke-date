import { useState } from "react";
import type { Fact, ForecastResponse } from "../types";
import type { DataProvider } from "../data/provider";
import { addDays, days, inr, shortDate } from "../lib/format";

interface Props {
  data: ForecastResponse; provider: DataProvider; busy: boolean;
  onUpdate: (fn: () => Promise<ForecastResponse>) => Promise<void>;
  openFact: (id: string | undefined, pool?: Record<string, Fact>) => void; factId: (ref: string) => string | undefined;
}

export default function PlanList({ data, provider, busy, onUpdate, openFact, factId }: Props) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const nextSat = (() => { let d = data.as_of; for (let i = 0; i < 7; i++) { if (new Date(d).getUTCDay() === 6) break; d = addDays(d, 1); } return d; })();
  const [date, setDate] = useState(nextSat);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const rupees = Number(amount);
    if (!name.trim() || !(rupees > 0)) return;
    await onUpdate(() => provider.addPlan({ name: name.trim(), amount_paise: Math.round(rupees * 100), date }));
    setName(""); setAmount(""); setAdding(false);
  };

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h3 className="font-medium">Planned</h3>
        <button className="text-sm underline underline-offset-4" onClick={() => setAdding((a) => !a)}>
          {adding ? "cancel" : "+ Add plan"}
        </button>
      </div>
      {adding && (
        <form onSubmit={submit} className="mt-3 grid grid-cols-[1fr_6rem] sm:grid-cols-[1fr_6rem_9rem_auto] gap-2 text-sm">
          <input className="border rule rounded px-2 py-1.5 bg-transparent" placeholder="What? (e.g. Momo + movie)"
                 value={name} onChange={(e) => setName(e.target.value)} aria-label="plan name" required />
          <input className="border rule rounded px-2 py-1.5 bg-transparent num" placeholder="₹" inputMode="decimal"
                 value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="amount in rupees" required />
          <input type="date" className="border rule rounded px-2 py-1.5 bg-transparent num" value={date}
                 min={data.as_of} onChange={(e) => setDate(e.target.value)} aria-label="date" />
          <button className="rounded px-3 py-1.5 font-medium" style={{ background: "var(--fg)", color: "var(--bg)" }}
                  disabled={busy}>Price it</button>
        </form>
      )}
      <ul className="mt-3 divide-y rule">
        {data.plans.length === 0 && <li className="py-3 text-sm muted">Nothing planned. Add a Saturday and see what it costs.</li>}
        {data.plans.map((p) => (
          <li key={p.id} className={`py-3 flex items-center gap-3 rule ${p.active ? "" : "opacity-55"}`}>
            <button role="switch" aria-checked={p.active} aria-label={`${p.active ? "Skip" : "Keep"} ${p.name}`}
                    disabled={busy}
                    onClick={() => onUpdate(() => provider.togglePlan(p.id, !p.active))}
                    className="relative w-10 h-6 rounded-full shrink-0 transition"
                    style={{ background: p.active ? "var(--color-broke)" : "var(--rule)" }}>
              <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all" style={{ left: p.active ? 18 : 2 }} />
            </button>
            <div className="min-w-0 flex-1">
              <p className={`truncate ${p.active ? "" : "line-through"}`}>{p.name}</p>
              <p className="text-xs muted num">{inr(p.amount_paise)} · {shortDate(p.date)}{!p.in_horizon && " · after payday"}</p>
            </div>
            <button onClick={() => openFact(factId(`plan:${p.id}`))}
                    className="num text-sm px-2 py-1 rounded-full border shrink-0"
                    style={{ borderColor: "var(--color-broke)", color: "var(--color-broke)" }}
                    title="Price in days: how much sooner your own money runs out">
              {days(p.day_cost)}
            </button>
            {provider.mode === "static" && (
              <button aria-label={`remove ${p.name}`} className="muted text-sm" onClick={() => onUpdate(() => provider.removePlan(p.id))}>×</button>
            )}
          </li>
        ))}
      </ul>
      {data.plans.length > 0 && (
        <p className="text-xs muted mt-2">The chip is the plan's price in days: how much sooner your own money runs out with it.</p>
      )}
    </div>
  );
}
