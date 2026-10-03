import { CaretDown, Check, Lightning } from "@phosphor-icons/react";
import { Dropdown, DropdownDivider, DropdownItem, DropdownPopover, DropdownTrigger } from "@/components/base/dropdown/dropdown";
import { cx } from "@/utils/cx";
import { BrandLogo } from "./BrandLogo";

export type ModelChoice = "auto" | "gemma3:4b" | "gemma3:1b" | "none";

const OPTIONS: { id: ModelChoice; name: string; meta: string }[] = [
  { id: "auto", name: "Auto", meta: "lightest" },
  { id: "gemma3:1b", name: "Gemma 3 1B", meta: "1 GB" },
  { id: "gemma3:4b", name: "Gemma 3 4B", meta: "5 GB free" },
  { id: "none", name: "Instant", meta: "no AI" },
];

/** Composer model menu. Numbers always come from TabPFN; this only picks who writes the words.
 *  `installed` is null when the engine has not reported its models (or in the static demo). */
export function ModelPicker({ value, onChange, installed, live }: {
  value: ModelChoice; onChange: (m: ModelChoice) => void; installed: string[] | null; live: boolean;
}) {
  const current = OPTIONS.find((o) => o.id === value) ?? OPTIONS[0];
  const unavailable = (id: ModelChoice) => id !== "none" && (!live || (installed !== null && id !== "auto" && !installed.includes(id)));
  const mark = (id: ModelChoice, cls: string) => (id === "none"
    ? <Lightning weight="fill" className={cx(cls, "text-text-secondary")} aria-hidden />
    : <BrandLogo brand="google" className={cls} />);
  return (
    <Dropdown>
      <DropdownTrigger aria-label={`Writing model: ${current.name}`}
        className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-body-2-medium text-text-secondary transition-colors hover:bg-background-secondary-default hover:text-text-primary">
        {mark(current.id, "size-3.5")}
        {current.name}
        <CaretDown weight="bold" className="size-3 opacity-60" aria-hidden />
      </DropdownTrigger>
      <DropdownPopover aria-label="Writing model" placement="top end" offset={8} className="w-60">
        {OPTIONS.map((o) => (
          <DropdownItem key={o.id} selected={o.id === value} onSelect={() => onChange(o.id)}
            className={cx("items-center px-2 py-1.5", unavailable(o.id) && "opacity-50")}>
            {mark(o.id, "size-4 shrink-0")}
            <span className="flex-1 whitespace-nowrap text-start text-body-medium text-text-primary">{o.name}</span>
            <span className="text-caption-1-medium text-text-tertiary">{o.meta}</span>
            <Check weight="bold" className={cx("size-3.5 shrink-0 text-accent-600", o.id !== value && "invisible")} aria-hidden />
          </DropdownItem>
        ))}
        <DropdownDivider />
        <p className="flex items-center gap-1.5 px-2 pb-0.5 text-caption-1-medium text-text-tertiary">
          <BrandLogo brand="ollama" mono className="size-3.5" />Runs on this laptop
        </p>
      </DropdownPopover>
    </Dropdown>
  );
}
