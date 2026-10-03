import { useState } from "react";
import { CalendarPlus } from "@phosphor-icons/react";
import { parseDate, type CalendarDate } from "@internationalized/date";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { DatePicker } from "@/components/base/date-picker/date-picker";
import type { ForecastResponse } from "../types";
import type { DataProvider } from "../data/provider";
import { addDays, dow } from "../lib/format";
import { duo } from "./kit";

/** Example plans a student might price: prefill only, nothing is added until "See what it costs". */
const IDEAS: { name: string; rupees: number; weekday: string }[] = [
  { name: "Movie with friends", rupees: 400, weekday: "Sat" },
  { name: "Dinner out", rupees: 300, weekday: "Fri" },
  { name: "Cab home", rupees: 250, weekday: "Sun" },
];

export function AddPlanForm({ data, busy, provider, onUpdate, onDone }: {
  data: ForecastResponse; busy: boolean; provider: DataProvider;
  onUpdate: (fn: () => Promise<ForecastResponse>) => Promise<void>; onDone?: () => void;
}) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState<CalendarDate>(() => parseDate(data.as_of));
  const valid = name.trim().length > 0 && Number(amount) > 0;

  const nextWeekday = (wd: string) => {
    for (let i = 1; i <= 7; i++) { const d = addDays(data.as_of, i); if (dow(d) === wd) return d; }
    return data.as_of;
  };
  const add = async () => {
    if (!valid) return;
    await onUpdate(() => provider.addPlan({ name: name.trim(), amount_paise: Math.round(Number(amount) * 100), date: date.toString() }));
    setName(""); setAmount(""); onDone?.();
  };

  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void add(); }}>
      <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
        <Input label="What" placeholder="Momos with friends" value={name} onChange={setName} />
        <Input label="Amount (₹)" placeholder="400" inputMode="decimal" value={amount} onChange={setAmount} />
      </div>
      <DatePicker aria-label="When" value={date} onChange={(v) => v && setDate(v)} />
      <div className="flex flex-wrap gap-1.5">
        {IDEAS.map((i) => (
          <button key={i.name} type="button" onClick={() => { setName(i.name); setAmount(String(i.rupees)); setDate(parseDate(nextWeekday(i.weekday))); }}
            className="cursor-pointer rounded-full bg-background-secondary-default px-3 py-1.5 text-body-2-medium text-text-secondary transition-colors hover:bg-background-secondary-hover hover:text-text-primary">
            {i.name} · ₹{i.rupees}
          </button>
        ))}
      </div>
      <Button type="submit" variant="primary" size="small" leadingIcon={duo(CalendarPlus)} disabled={!valid || busy}>See what it costs</Button>
    </form>
  );
}
