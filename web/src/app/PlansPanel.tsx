import { useState } from "react";
import { CalendarPlus, Lightning, Plus, Sparkle, Target } from "@phosphor-icons/react";
import { parseDate, type CalendarDate } from "@internationalized/date";
import { Button } from "@/components/base/buttons/button";
import { Chip } from "@/components/base/badges/chip";
import { Input } from "@/components/base/input/input";
import { DatePicker } from "@/components/base/date-picker/date-picker";
import { Switch } from "@/components/base/switch/switch";
import { Tooltip, TooltipTrigger } from "@/components/base/tooltip/tooltip";
import { days, inr, shortDate } from "../lib/format";
import { Empty, Panel, Row, Rows, Tile, Track, duo } from "./kit";
import { catIcon, planCategory } from "./categories";
import { factId, type PageProps } from "./OverviewPage";

export function PlansPanel({ data, busy, provider, onUpdate, openFact, onAsk, compact }: Omit<PageProps, "prev" | "go"> & { compact?: boolean }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState<CalendarDate>(() => parseDate(data.as_of));
  const H = Math.max(data.horizon_days, 1);
  const valid = name.trim().length > 0 && Number(amount) > 0;

  const add = async () => {
    if (!valid) return;
    await onUpdate(() => provider.addPlan({ name: name.trim(), amount_paise: Math.round(Number(amount) * 100), date: date.toString() }));
    setName(""); setAmount(""); setAdding(false);
  };

  return (
    <Panel title="Plans" sub="Switch one on to see what it does to your month" icon={Target} flush
      action={<Button variant="secondary" size="xs" leadingIcon={duo(Plus)} onClick={() => setAdding((a) => !a)}>{adding ? "Close" : "Add plan"}</Button>}>
      {adding && (
        <form className="grid gap-3 border-b border-separator-border p-4 sm:grid-cols-[1fr_7.5rem]" onSubmit={(e) => { e.preventDefault(); void add(); }}>
          <Input label="What" placeholder="Momo + movie with friends" value={name} onChange={setName} autoFocus />
          <Input label="Amount (₹)" placeholder="400" inputMode="decimal" value={amount} onChange={setAmount} />
          <div className="flex items-end gap-2 sm:col-span-2">
            <DatePicker aria-label="When" value={date} onChange={(v) => v && setDate(v)} />
            <Button type="submit" variant="primary" size="small" leadingIcon={duo(CalendarPlus)} isDisabled={!valid || busy} className="ms-auto">Price it</Button>
          </div>
        </form>
      )}
      {data.plans.length === 0 ? (
        <Empty>Nothing planned yet. Add a Saturday, or ask “can I afford ₹400 on Saturday?”</Empty>
      ) : (
        <Rows>
          {data.plans.map((p) => (
            <Row key={p.id}>
              <Tile icon={catIcon(planCategory(p.name))} tone={p.active ? "orange" : "neutral"} />
              <div className="min-w-0 w-[38%] shrink-0 sm:w-[30%]">
                <p className="truncate text-body-medium text-text-primary">{p.name}</p>
                <p className="truncate text-body-2-medium text-text-tertiary tabular-nums">{inr(p.amount_paise)} · {shortDate(p.date)}{!p.in_horizon && " · after payday"}</p>
              </div>
              <div className={compact ? "hidden min-w-[60px] flex-1 md:block" : "hidden min-w-[60px] flex-1 sm:block"}>
                <Track value={p.day_cost / H} tone={p.active ? "orange" : "accent"} />
              </div>
              <TooltipTrigger delay={200}>
                <Button variant="ghost" size="xs" onClick={() => openFact(factId(data, "plan_day_cost", `plan:${p.id}`))}
                        className="tabular-nums">{days(p.day_cost)}</Button>
                <Tooltip size="md">Price in days: how much sooner your own money runs out with this plan. Tap for the evidence.</Tooltip>
              </TooltipTrigger>
              {!compact && (
                <Chip variant="caption" color={p.futures_delta < 0 ? "rose" : "neutral"} className="hidden md:inline-flex">
                  <Lightning weight="duotone" className="me-1 size-3.5" aria-hidden />{p.futures_delta === 0 ? "no change" : `${Math.abs(p.futures_delta)} futures`}
                </Chip>
              )}
              <Switch aria-label={`${p.active ? "Skip" : "Do"} ${p.name}`} isSelected={p.active} isDisabled={busy}
                      onChange={() => void onUpdate(() => provider.togglePlan(p.id, !p.active))} />
            </Row>
          ))}
        </Rows>
      )}
      <div className="flex items-center justify-between gap-2 border-t border-separator-border px-4 py-2.5">
        <p className="text-body-2-medium text-text-tertiary">The bar is the plan's price against the {H} days to payday.</p>
        <Button variant="ghost" size="xs" leadingIcon={duo(Sparkle)} onClick={() => onAsk("Can I afford ₹400 on Saturday?")}>Ask first</Button>
      </div>
    </Panel>
  );
}
