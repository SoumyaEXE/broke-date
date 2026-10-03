import { useEffect, useState } from "react";
import { LockKey, ShieldCheck, WarningCircle } from "@phosphor-icons/react";
import { cx } from "@/utils/cx";
import { blockedRequests, networkLock, outsideRequests, requestCount } from "../lib/offline";

/** Re-measures every few seconds: the numbers come from the browser's own request log, not from us. */
export function useOfflineProof() {
  const read = () => ({ outside: outsideRequests(), total: requestCount(), lock: networkLock(), blocked: blockedRequests() });
  const [s, setS] = useState(read);
  useEffect(() => { const t = window.setInterval(() => setS(read()), 3000); return () => window.clearInterval(t); }, []);
  return s;
}

/** Sidebar card: is anything leaving this laptop right now? */
export function OfflineCard({ onOpen }: { onOpen: () => void }) {
  const s = useOfflineProof();
  const ok = s.outside.length === 0;
  return (
    <button type="button" onClick={onOpen}
      className="flex w-full cursor-pointer items-center gap-2.5 rounded-2xl bg-background-inner-default p-3 text-start shadow-card transition-colors hover:bg-background-primary-hover">
      <span className={cx("relative flex size-8 shrink-0 items-center justify-center rounded-lg", ok ? "bg-status-lime-background" : "bg-status-rose-background")}>
        {ok ? <ShieldCheck weight="duotone" className="size-4 text-status-lime-text" aria-hidden /> : <WarningCircle weight="duotone" className="size-4 text-status-rose-text" aria-hidden />}
        {ok && <span className="absolute -top-0.5 -right-0.5 size-2 animate-pulse rounded-full bg-lime-500" aria-hidden />}
      </span>
      <span className="min-w-0">
        <span className="block text-body-medium text-text-primary">{ok ? "Offline" : "Data left the laptop"}</span>
        <span className="block truncate text-caption-1-medium text-text-tertiary tabular-nums">
          {s.outside.length} of {s.total} requests left this laptop
        </span>
      </span>
      {s.lock && <LockKey weight="duotone" className="ms-auto size-4 shrink-0 text-text-tertiary" aria-label="Network lock on" />}
    </button>
  );
}
