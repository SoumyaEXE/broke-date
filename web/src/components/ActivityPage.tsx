import { useMemo, useState } from "react";
import { Receipt } from "@phosphor-icons/react";
import type { ForecastResponse } from "../types";
import { inr, shortDate } from "../lib/format";
import { Card, CardHead } from "./ui";
import { CatBadge, catLabel } from "./icons";

export default function ActivityPage({ data }: { data: ForecastResponse }) {
  const [q, setQ] = useState("");
  const tx = useMemo(() => (data.context?.transactions ?? []).filter((t) =>
    !q || `${t.merchant} ${t.category}`.toLowerCase().includes(q.toLowerCase())), [data, q]);
  return (
    <Card>
      <CardHead icon={<Receipt size={18} weight="duotone" />} title="Activity" sub="From your statement, categorized by rules first and Gemma for the rest"
        action={<input className="input !w-56 !py-1.5" placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="filter" />} />
      <div className="overflow-x-auto">
        <table className="w-full text-[14px]">
          <thead className="text-left text-[12px] muted">
            <tr className="border-b border-line">
              <th className="font-normal px-5 py-2.5">Merchant</th><th className="font-normal py-2.5">Category</th>
              <th className="font-normal py-2.5">Labelled by</th><th className="font-normal py-2.5">Date</th>
              <th className="font-normal px-5 py-2.5 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {tx.map((t) => (
              <tr key={t.id} className="border-b border-line-2 last:border-0">
                <td className="px-5 py-2.5"><div className="flex items-center gap-3"><CatBadge category={t.category} size={34} /><span className="truncate max-w-[16rem]">{t.merchant}</span>{t.is_anchor && <span className="tag !bg-brand-2 !text-brand">allowance</span>}</div></td>
                <td className="py-2.5"><span className="tag">{catLabel(t.category)}</span></td>
                <td className="py-2.5 muted text-[13px]">{t.label_source === "gemma" ? "Gemma" : t.label_source === "user" ? "you" : t.label_source === "rule" ? "rules" : "needs review"}</td>
                <td className="py-2.5 muted num">{shortDate(t.date)}</td>
                <td className={`px-5 py-2.5 text-right num font-medium ${t.direction === "CREDIT" ? "text-good" : "text-ink"}`}>{t.direction === "CREDIT" ? "+" : "−"}{inr(t.amount_paise)}{t.status === "REVERSED" && <span className="muted text-[11px]"> reversed</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
