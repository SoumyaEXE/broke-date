/** 500 futures as a dot grid (compact alternate to the canvas on narrow screens). */
export default function DotGrid({ firstBroke, H }: { firstBroke: number[]; H: number }) {
  const sorted = [...firstBroke].map((fb) => (fb >= 1 && fb <= H ? 1 : 0)).sort((a, b) => a - b);
  return (
    <div className="grid gap-[3px]" style={{ gridTemplateColumns: "repeat(50, minmax(0, 1fr))" }} aria-hidden>
      {sorted.map((b, i) => (
        <span key={i} className="aspect-square rounded-full" style={{ background: b ? "var(--color-broke)" : "var(--color-made)", opacity: b ? 0.9 : 0.75 }} />
      ))}
    </div>
  );
}
