import { CaretDown, Check, Lightning } from "@phosphor-icons/react";
import { Dropdown, DropdownDivider, DropdownGroup, DropdownItem, DropdownPopover, DropdownTrigger } from "@/components/base/dropdown/dropdown";
import { cx } from "@/utils/cx";
import { BrandLogo } from "./BrandLogo";

export type ModelChoice = "auto" | "gemma3:4b" | "gemma3:1b" | "none";

const OPTIONS: { id: ModelChoice; name: string; line: string }[] = [
  { id: "auto", name: "Auto", line: "Lightest Gemma installed · safe on any laptop" },
  { id: "gemma3:1b", name: "Gemma 3 1B", line: "Fast · about 1 GB of memory" },
  { id: "gemma3:4b", name: "Gemma 3 4B", line: "Warmer words · only when 5 GB is free" },
  { id: "none", name: "No AI words", line: "Instant checked answers only" },
];

/** Composer model menu. Numbers always come from TabPFN; this only picks who writes the words. */
export function ModelPicker({ value, onChange, installed, live }: {
  value: ModelChoice; onChange: (m: ModelChoice) => void; installed: string[]; live: boolean;
}) {
  const current = OPTIONS.find((o) => o.id === value) ?? OPTIONS[0];
  const usable = (id: ModelChoice) => id === "none" || (live && (id === "auto" ? installed.some((m) => m.startsWith("gemma")) : installed.includes(id)));
  return (
    <Dropdown>
      <DropdownTrigger aria-label="Choose who writes the words"
        className="flex h-8 shrink-0 items-center gap-1.5 rounded-xl px-2 text-body-2-medium text-text-secondary transition-colors hover:bg-background-secondary-default">
        {value === "none" ? <Lightning weight="duotone" className="size-4 text-accent-600" aria-hidden /> : <BrandLogo brand="google" className="size-3.5" />}
        <span className="hidden sm:inline">{current.name}</span>
        <CaretDown weight="bold" className="size-3 text-text-tertiary" aria-hidden />
      </DropdownTrigger>
      <DropdownPopover aria-label="Models" placement="top end" className="w-[300px]">
        <DropdownGroup label="Words">
          {OPTIONS.map((o) => {
            const ok = usable(o.id);
            return (
              <DropdownItem key={o.id} selected={o.id === value} onSelect={ok ? () => onChange(o.id) : undefined}
                className={cx("items-start", !ok && "cursor-not-allowed opacity-45")}>
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-background-secondary-default">
                  {o.id === "none" ? <Lightning weight="duotone" className="size-3.5 text-accent-600" aria-hidden /> : <BrandLogo brand="google" className="size-3.5" />}
                </span>
                <span className="flex min-w-0 flex-1 flex-col text-start">
                  <span className="text-body-medium text-text-primary">{o.name}</span>
                  <span className="text-caption-1-medium text-text-tertiary">{ok || o.id === "none" ? o.line : live ? "Not installed · ollama pull " + o.id.replace("auto", "gemma3:1b") : "Runs on your laptop in the full app"}</span>
                </span>
                {o.id === value && <Check weight="bold" className="mt-1 size-4 text-accent-600" aria-hidden />}
              </DropdownItem>
            );
          })}
        </DropdownGroup>
        <DropdownDivider />
        <div className="flex items-center gap-2 px-2 pb-1 text-caption-1-medium text-text-tertiary">
          <BrandLogo brand="tabpfn" className="size-4" />
          <span>Numbers always from TabPFN v2</span>
          <span className="ms-auto flex items-center gap-1"><BrandLogo brand="ollama" className="size-3.5" mono />Ollama</span>
        </div>
      </DropdownPopover>
    </Dropdown>
  );
}
