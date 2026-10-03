import { Hourglass, Sparkle } from "@phosphor-icons/react";
import { Button } from "@/components/base/buttons/button";
import EatenCalendar from "../components/EatenCalendar";
import { Panel, duo } from "./kit";
import { PlansPanel } from "./PlansPanel";
import type { PageProps } from "./OverviewPage";

export function PlansPage(p: Omit<PageProps, "prev" | "go">) {
  return (
    <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
      <PlansPanel {...p} />
      <div className="flex flex-col gap-4">
        <Panel title="The month, eaten" sub="Each active plan bites its price in days off the end of the month" icon={Hourglass}>
          <EatenCalendar data={p.data} />
        </Panel>
        <Panel title="Not sure yet?" sub="Ask before you add it" icon={Sparkle}>
          <p className="text-body-regular text-text-secondary">The answer reruns all {p.data.n_futures} futures with that spend on that day, so you see the cost before you commit.</p>
          <Button variant="primary" size="small" className="mt-3" leadingIcon={duo(Sparkle)} onClick={() => p.onAsk("Can I afford ₹500 on Saturday?")}>Ask “can I afford it?”</Button>
        </Panel>
      </div>
    </div>
  );
}
