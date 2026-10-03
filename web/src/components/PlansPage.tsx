import type { Fact, ForecastResponse } from "../types";
import type { DataProvider } from "../data/provider";
import { Card } from "./ui";
import PlanList from "./PlanList";
import { factId } from "./Overview";
import EatenCalendar from "./EatenCalendar";

export default function PlansPage({ data, busy, provider, onUpdate, openFact, onAsk }: {
  data: ForecastResponse; busy: boolean; provider: DataProvider;
  onUpdate: (fn: () => Promise<ForecastResponse>) => Promise<void>;
  openFact: (id: string | undefined, pool?: Record<string, Fact>) => void; onAsk: (q?: string) => void;
}) {
  return (
    <div className="grid gap-3 xl:grid-cols-[1.2fr_1fr]">
      <Card><div className="p-5">
        <PlanList data={data} provider={provider} busy={busy} onUpdate={onUpdate} openFact={openFact}
                  factId={(r) => factId(data, "plan_day_cost", r)} />
      </div></Card>
      <div className="space-y-3">
        <Card><div className="p-4"><EatenCalendar data={data} /></div></Card>
        <Card><div className="p-5">
          <p className="font-medium">Not sure yet?</p>
          <p className="text-[14px] muted mt-1">Ask before you add it. The answer reruns your futures with that spend on that day.</p>
          <button className="btn-primary mt-3" onClick={() => onAsk("Can I afford ₹500 on Saturday?")}>Ask “can I afford it?”</button>
        </div></Card>
      </div>
    </div>
  );
}
