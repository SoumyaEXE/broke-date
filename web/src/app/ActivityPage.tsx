import { useMemo, useState } from "react";
import { MagnifyingGlass, Receipt } from "@phosphor-icons/react";
import { Table, TableBody, TableCell as Cell, TableColumn as Column, TableHeader, TableRow as TRow } from "@/components/base/table/table";
import { Chip } from "@/components/base/badges/chip";
import { Input } from "@/components/base/input/input";
import type { ForecastResponse } from "../types";
import { inr, shortDate } from "../lib/format";
import { Panel, Tile, duo } from "./kit";
import { catIcon, catLabel } from "./categories";

const SOURCE: Record<string, [string, "neutral" | "purple" | "lime" | "orange"]> = {
  rule: ["Rules", "neutral"], gemma: ["Gemma", "purple"], user: ["You", "lime"], unlabelled: ["Needs review", "orange"],
};

export function ActivityPage({ data }: { data: ForecastResponse }) {
  const [q, setQ] = useState("");
  const rows = useMemo(() => (data.context?.transactions ?? []).filter((t) =>
    !q || `${t.merchant} ${t.category}`.toLowerCase().includes(q.toLowerCase())), [data, q]);
  return (
    <Panel title="Activity" sub="From your statement: rules first, Gemma for the rest, you have the last word" icon={Receipt} flush
      action={<Input aria-label="Filter transactions" placeholder="Filter…" leadingIcon={duo(MagnifyingGlass)} value={q} onChange={setQ} className="w-48" />}>
      <Table aria-label="Transactions">
        <TableHeader>
          <Column isRowHeader>Merchant</Column>
          <Column>Category</Column>
          <Column>Labelled by</Column>
          <Column>Date</Column>
          <Column className="text-end">Amount</Column>
        </TableHeader>
        <TableBody items={rows} renderEmptyState={() => <p className="p-6 text-body-regular text-text-tertiary">No transactions match.</p>}>
          {(t) => {
            const src = SOURCE[t.label_source ?? "unlabelled"] ?? SOURCE.unlabelled;
            const credit = t.direction === "CREDIT";
            return (
              <TRow id={t.id}>
                <Cell>
                  <div className="flex items-center gap-3">
                    <Tile icon={catIcon(t.category)} tone={credit ? "lime" : "neutral"} />
                    <span className="truncate text-body-medium text-text-primary">{t.merchant}</span>
                    {t.is_anchor && <Chip variant="caption" color="purple">Allowance</Chip>}
                  </div>
                </Cell>
                <Cell><Chip variant="caption" color="neutral">{catLabel(t.category)}</Chip></Cell>
                <Cell><Chip variant="caption" color={src[1]}>{src[0]}</Chip></Cell>
                <Cell><span className="text-body-medium text-text-secondary tabular-nums">{shortDate(t.date)}</span></Cell>
                <Cell className="text-end">
                  <span className={`text-body-medium tabular-nums ${credit ? "text-status-lime-text" : "text-text-primary"}`}>{credit ? "+" : "−"}{inr(t.amount_paise)}</span>
                  {t.status === "REVERSED" && <span className="ms-1 text-caption-1-medium text-text-tertiary">reversed</span>}
                </Cell>
              </TRow>
            );
          }}
        </TableBody>
      </Table>
    </Panel>
  );
}
