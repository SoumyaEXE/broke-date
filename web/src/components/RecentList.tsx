import type { ForecastResponse } from "../types";
import { days, inr, shortDate } from "../lib/format";

export default function RecentList({ data }: { data: ForecastResponse }) {
  if (!data.recent.length) return null;
  return (
    <div>
      <h3 className="font-medium">Last 7 days: what if you hadn't?</h3>
      <ul className="mt-2 text-sm">
        {data.recent.slice(0, 6).map((r) => (
          <li key={r.txn_id} className="py-2 flex items-center gap-3 dashed-rule first:border-0">
            <span className="flex-1 truncate">{r.merchant}<span className="muted"> · {r.category?.replaceAll("_", " ")}</span></span>
            <span className="num muted">{shortDate(r.date)}</span>
            <span className="num w-20 text-right">{inr(r.amount_paise)}</span>
            <span className="num text-xs px-2 py-0.5 rounded-full w-24 text-center"
                  style={{ background: "var(--bg-2)", color: "var(--color-made)" }}>+{days(r.days_regained)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
