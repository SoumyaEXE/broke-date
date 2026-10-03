/* Brand marks bundled offline from simple-icons (CC0 SVG paths): no logo CDN, works in airplane mode.
 * Only marks that exist in the pack are used; TabPFN/Prior Labs has none there, so it gets a neutral glyph. */
import { siGoogle, siOllama } from "simple-icons";
import { ChartLineUp } from "@phosphor-icons/react";
import { cx } from "@/utils/cx";

const MARKS = { google: siGoogle, ollama: siOllama } as const;
export type Brand = keyof typeof MARKS | "tabpfn";

export function BrandLogo({ brand, className, mono }: { brand: Brand; className?: string; mono?: boolean }) {
  if (brand === "tabpfn") return <ChartLineUp weight="duotone" className={cx("text-accent-600", className)} aria-hidden />;
  const icon = MARKS[brand];
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill={mono ? "currentColor" : `#${icon.hex}`}>
      <path d={icon.path} />
    </svg>
  );
}
