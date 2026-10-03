/** Every simulated future as one dot (violet made it, orange went broke), in a full 50×10 / 25×20 block. */
export default function DotGrid({ firstBroke, H }: { firstBroke: number[]; H: number }) {
  const sorted = [...firstBroke].map((fb) => (fb >= 1 && fb <= H ? 1 : 0)).sort((a, b) => a - b);
  return (
    <div className="grid grid-cols-[repeat(25,minmax(0,1fr))] gap-1.5 lg:grid-cols-[repeat(50,minmax(0,1fr))]" aria-hidden>
      {sorted.map((b, i) => (
        <span key={i} className={`animate-cell-pop aspect-square rounded-full ${b ? "bg-orange-500" : "bg-accent-500/85"}`}
          style={{ animationDelay: `${Math.min(i * 1.4, 700)}ms` }} />
      ))}
    </div>
  );
}
