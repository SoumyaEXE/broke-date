import { useState } from "react";
import { CalendarPlus, Plus, Sparkle, Target } from "@phosphor-icons/react";
import { Button } from "@/components/base/buttons/button";
import { Chip } from "@/components/base/badges/chip";
import { Switch } from "@/components/base/switch/switch";
import { cx } from "@/utils/cx";
import { days, inr, shortDate } from "../lib/format";
import { Empty, Panel, Tile, Track, duo } from "./kit";
import { catIcon, planCategory } from "./categories";
import { AddPlanForm } from "./AddPlanForm";
import { factId, type PageProps } from "./OverviewPage";

type Props = Omit<PageProps, "prev" | "go"> & {
  compact?: boolean;
  /** Plans page: the add form lives in its own card, rows are selectable. */
  selected?: string | null;
  onSelect?: (id: string) => void;
};

export function PlansPanel({ data, busy, provider, onUpdate, openFact, onAsk, compact, selected, onSelect }: Props) {
  const [adding, setAdding] = useState(false);
  const H = Math.max(data.horizon_days, 1);
  const selectable = !!onSelect;

  return (
    <Panel title="Plans" sub="Things you are thinking of spending on. Switch one on to count it." icon={Target} flush bodyClassName="flex flex-col"
      action={compact ? (
        <div className="flex gap-1.5">
          <Button variant="ghost" size="xs" leadingIcon={duo(Sparkle)} onClick={() => onAsk("Can I afford ₹400 on Saturday?")}>Ask</Button>
          <Button variant="secondary" size="xs" leadingIcon={duo(Plus)} onClick={() => setAdding((a) => !a)}>{adding ? "Close" : "Add"}</Button>
        </div>
      ) : undefined}>
      {compact && adding && (
        <div className="border-b border-separator-border p-4">
          <AddPlanForm data={data} busy={busy} provider={provider} onUpdate={onUpdate} onDone={() => setAdding(false)} />
        </div>
      )}
      {data.plans.length === 0 ? (
        <Empty>Nothing planned yet.</Empty>
      ) : (
        <ul className="divide-y divide-separator-border">
          {data.plans.map((p) => {
            const isSel = selectable && selected === p.id;
            return (
              <li key={p.id}
                className={cx("relative flex items-center gap-3 px-4 py-3.5 transition-colors duration-200",
                  selectable && "cursor-pointer hover:bg-background-primary-hover", isSel && "bg-accent-50/60 hover:bg-accent-50/60")}
                onClick={() => onSelect?.(p.id)}>
                {isSel && <span className="absolute inset-y-2 start-0 w-1 rounded-e-full bg-accent-500" aria-hidden />}
                <Tile icon={catIcon(planCategory(p.name))} tone={p.active ? "orange" : "neutral"} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="truncate text-body-medium text-text-primary">{p.name}</p>
                    <p className="shrink-0 text-body-medium text-text-primary tabular-nums">{inr(p.amount_paise)}</p>
                  </div>
                  <div className="mt-1.5 flex items-center gap-3">
                    <p className="shrink-0 text-body-2-medium text-text-tertiary">{shortDate(p.date)}{!p.in_horizon && " · after payday"}</p>
                    <div className="min-w-8 flex-1"><Track value={p.day_cost / H} tone={p.active ? "orange" : "accent"} /></div>
                    <button type="button" onClick={(e) => { e.stopPropagation(); openFact(factId(data, "plan_day_cost", `plan:${p.id}`)); }}
                      className="shrink-0 cursor-pointer text-body-2-medium text-text-secondary tabular-nums underline decoration-dotted underline-offset-4 hover:text-text-primary">
                      costs {days(p.day_cost)}
                    </button>
                    {!compact && (
                      <Chip variant="caption" color={p.futures_delta < 0 ? "rose" : "neutral"} className="hidden md:inline-flex">
                        {p.futures_delta === 0 ? "no change" : `${Math.abs(p.futures_delta)} fewer months work out`}
                      </Chip>
                    )}
                  </div>
                </div>
                <div onClick={(e) => e.stopPropagation()}>
                  <Switch aria-label={`${p.active ? "Skip" : "Do"} ${p.name}`} isSelected={p.active} isDisabled={busy}
                    onChange={() => void onUpdate(() => provider.togglePlan(p.id, !p.active))} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-auto flex items-center justify-between gap-3 border-t border-separator-border px-4 py-3">
        <p className="text-body-2-medium text-text-secondary">
          With plans that are on, <span className="text-text-primary tabular-nums">{data.n_make_it} of {data.n_futures}</span> months make it to payday
        </p>
        {!compact && <Button variant="ghost" size="xs" leadingIcon={duo(CalendarPlus)} onClick={() => onAsk("Can I afford ₹400 on Saturday?")}>Ask first</Button>}
      </div>
    </Panel>
  );
}
