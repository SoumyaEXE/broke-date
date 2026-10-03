import { useEffect, useState } from "react";
import { EnvelopeSimpleOpen } from "@phosphor-icons/react";
import { SegmentedControl, SegmentedControlItem } from "@/components/base/segmented-control/segmented-control";
import type { Fact, ForecastResponse, LetterResponse } from "../types";
import type { DataProvider } from "../data/provider";
import { Panel } from "./kit";

const LANGS = ["English", "Benglish", "Bengali"] as const;

export function LetterPanel({ provider, data, openFact }: {
  provider: DataProvider; data: ForecastResponse; openFact: (id: string | undefined, pool?: Record<string, Fact>) => void;
}) {
  const [lang, setLang] = useState<string>("English");
  const [letter, setLetter] = useState<LetterResponse | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let live = true;
    setLoading(true);
    provider.letter(lang).then((l) => { if (live) setLetter(l); }).catch(() => { if (live) setLetter(null); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [provider, lang, data.as_of]);
  const recomputed = (data as ForecastResponse & { recomputedInBrowser?: boolean }).recomputedInBrowser;

  return (
    <Panel title="A letter from a future that went broke" sub="Words by Gemma, every number by the engine" icon={EnvelopeSimpleOpen} bodyClassName="flex flex-col"
      action={
        <SegmentedControl aria-label="Letter language" className="bg-background-tertiary-default/70"
          selectedKeys={new Set([lang])} onSelectionChange={(k) => { const v = [...k][0]; if (v) setLang(String(v)); }}>
          {LANGS.map((l) => <SegmentedControlItem key={l} id={l}>{l}</SegmentedControlItem>)}
        </SegmentedControl>
      }>
      <div className="mb-4 min-h-[9rem]" lang={lang === "Bengali" ? "bn" : "en"} aria-live="polite">
        {loading ? (
          <div className="flex flex-col gap-3 pt-1" aria-label="Writing the letter" role="status">
            {["w-full", "w-11/12", "w-full", "w-4/5", "w-2/5"].map((w, i) => (
              <span key={i} className={`h-4 animate-pulse rounded-full bg-background-secondary-default ${w}`} style={{ animationDelay: `${i * 120}ms` }} />
            ))}
          </div>
        ) : letter ? (<>
          <p className="text-headline-medium leading-relaxed text-text-primary" style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontWeight: 400 }}>
            {letter.segments.map((s, i) => s.type === "fact" ? (
              <button key={i} type="button" onClick={() => openFact(s.fact_id, letter.facts)}
                className="rounded-md bg-accent-50 px-1 font-sans text-body-medium text-accent-700 tabular-nums outline-none hover:bg-accent-100 focus-visible:ring-2 focus-visible:ring-border-focus-ring">
                {s.text}
              </button>
            ) : <span key={i}>{s.text}</span>)}
          </p>
          <p className="mt-4 text-body-medium text-text-tertiary italic" style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>— you, from a future where the money ran out</p>
          </>
        ) : <p className="text-body-regular text-text-tertiary">Letter unavailable right now.</p>}
      </div>
      {letter && (
        <p className="mt-auto border-t border-separator-border pt-3 text-body-2-medium text-text-tertiary">
          {letter.fallback_used ? "Template letter · Gemma offline" : `Written by ${letter.model}`} · tap a number for its source
          {recomputed && " Written for today's starting scenario, before your changes."}
        </p>
      )}
    </Panel>
  );
}
