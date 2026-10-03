import type { SimilarMonth } from "../types";

export default function SimilarMonthCard({ sm }: { sm: SimilarMonth }) {
  const W = 300, Hh = 80;
  const n = Math.max(sm.overlay_then.length, sm.overlay_this.length);
  const max = Math.max(1.2, ...sm.overlay_then, ...sm.overlay_this);
  const pts = (arr: number[]) => arr.map((v, i) => `${(i / Math.max(n - 1, 1)) * W},${Hh - (Math.max(v, 0) / max) * Hh}`).join(" ");
  return (
    <div className="rounded-xl border rule p-4 flex flex-wrap gap-4 items-center">
      <div className="flex-1 min-w-[12rem]">
        <h3 className="font-medium">This month looks like {sm.label}.</h3>
        <p className="text-sm muted mt-1">
          Closest past month by the shape of your balance so far (dynamic time warping).{" "}
          {sm.then_went_broke ? `${sm.label} went below the broke line.` : `${sm.label} made it.`}
        </p>
      </div>
      <svg viewBox={`0 0 ${W} ${Hh}`} className="w-full max-w-[300px] h-20" role="img"
           aria-label={`balance curve this month versus ${sm.label}`}>
        <polyline points={pts(sm.overlay_then)} fill="none" stroke="var(--mut)" strokeWidth="1.5" strokeDasharray="4 3" />
        <polyline points={pts(sm.overlay_this)} fill="none" stroke="var(--fg)" strokeWidth="2.2" />
      </svg>
    </div>
  );
}
