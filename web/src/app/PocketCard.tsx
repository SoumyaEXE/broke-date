import { DeviceMobile, DownloadSimple } from "@phosphor-icons/react";

/** Sidebar footer row: the offline phone file ("can I afford it?" in airplane mode). */
export function PocketCard({ demo, subject }: { demo: boolean; subject: string }) {
  const body = (
    <>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-50"><DeviceMobile weight="duotone" className="size-4 text-accent-600" aria-hidden /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-body-medium text-text-primary">Pocket file</span>
        <span className="block truncate text-caption-1-medium text-text-tertiary">{demo ? "Works on your phone offline" : `brokedate export-pocket -s ${subject}`}</span>
      </span>
      {demo && <DownloadSimple weight="bold" className="size-4 shrink-0 text-text-tertiary" aria-hidden />}
    </>
  );
  const cls = "flex w-full items-center gap-2.5 rounded-2xl bg-background-inner-default p-3 text-start shadow-card";
  return demo
    ? <a href={`${import.meta.env.BASE_URL}demo/pocket.html`} download="broke-date-pocket.html" className={`${cls} transition-colors hover:bg-background-primary-hover`}>{body}</a>
    : <div className={cls} title="Run this to make the phone file">{body}</div>;
}
