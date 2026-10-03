import { DeviceMobile } from "@phosphor-icons/react";
import { LinkButton } from "@/components/base/buttons/link-button";

/** Sidebar footer card: the offline phone file. */
export function PocketCard({ demo, subject }: { demo: boolean; subject: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-background-inner-default p-3 shadow-card">
      <span className="flex items-center gap-2 text-body-medium text-text-primary">
        <span className="flex size-7 items-center justify-center rounded-lg bg-accent-50"><DeviceMobile weight="duotone" className="size-4 text-accent-600" aria-hidden /></span>
        Pocket file
      </span>
      <p className="text-body-2-medium text-text-tertiary">One offline page for your phone: “can I afford it?” in airplane mode.</p>
      {demo
        ? <LinkButton href={`${import.meta.env.BASE_URL}demo/pocket.html`} download="broke-date-pocket.html">Download</LinkButton>
        : <p className="text-caption-1-medium text-text-tertiary">Run <code className="font-mono">brokedate export-pocket -s {subject}</code></p>}
    </div>
  );
}
