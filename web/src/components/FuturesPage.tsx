import { ChartLineUp, Hourglass, Shuffle } from "@phosphor-icons/react";
import type { Fact, ForecastResponse } from "../types";
import type { DataProvider } from "../data/provider";
import { inr, shortDate } from "../lib/format";
import { Card, CardHead, Legend } from "./ui";
import FuturesCanvas from "./FuturesCanvas";
import EatenCalendar from "./EatenCalendar";
import SimilarMonthCard from "./SimilarMonthCard";
import DotGrid from "./DotGrid";
import RecentList from "./RecentList";

export default function FuturesPage({ data, prev }: {
  data: ForecastResponse; prev: ForecastResponse | null; openFact: (id: string | undefined, pool?: Record<string, Fact>) => void; provider: DataProvider;
}) {
  return (
    <div className="space-y-3">
      <Card>
        <CardHead icon={<ChartLineUp size={18} weight="duotone" />} title={`${data.n_futures} versions of the rest of your month`}
          sub="Each line is one simulated future, drawn day by day from TabPFN's spending distribution. Lines that dip below the broke line stop there." />
        <div className="px-5 pt-3 flex flex-wrap gap-5">
          <Legend color="#7c5cfc" label={`Made it to payday · ${data.n_make_it}`} />
          <Legend color="#f97316" label={`Went broke · ${data.n_futures - data.n_make_it}`} />
          <Legend color="#121316" label="Median path" />
        </div>
        <div className="p-3"><FuturesCanvas data={data} prev={prev} /></div>
        {data.broke_day && (
          <p className="px-5 pb-4 text-[14px]">If you do go broke, most likely around <span className="font-medium text-warn">{shortDate(data.broke_day.median)}</span> (80% range {shortDate(data.broke_day.lo80)} to {shortDate(data.broke_day.hi80)}).</p>
        )}
      </Card>
      <div className="grid gap-3 xl:grid-cols-2">
        <Card>
          <CardHead icon={<Shuffle size={18} weight="duotone" />} title="Every future at a glance" sub="One dot per future, sorted" />
          <div className="p-5"><DotGrid firstBroke={data.paths.first_broke} H={data.horizon_days} /></div>
        </Card>
        <Card>
          <CardHead icon={<Hourglass size={18} weight="duotone" />} title="The month, eaten" sub="Days to payday; each active plan bites off its price in days" />
          <div className="p-4"><EatenCalendar data={data} /></div>
        </Card>
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        {data.similar_month && <SimilarMonthCard sm={data.similar_month} />}
        <Card><div className="p-5"><RecentList data={data} /></div></Card>
      </div>
      <p className="text-[12px] muted px-1">Balance now {inr(data.balance_now_paise)} · seed {data.seed} · history {data.model.history_from} → {data.model.history_to}</p>
    </div>
  );
}
