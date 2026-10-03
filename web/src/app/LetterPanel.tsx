import { useEffect, useState } from "react";
import { EnvelopeSimpleOpen } from "@phosphor-icons/react";
import { SegmentedControl, SegmentedControlItem } from "@/components/base/segmented-control/segmented-control";
import { AgentThinking } from "@/components/application/agent-thinking/agent-thinking";
import type { Fact, ForecastResponse, LetterResponse } from "../types";
import type { DataProvider } from "../data/provider";
import { Panel } from "./kit";

const LANGS = ["Benglish", "English", "Bengali"] as const;

export function LetterPanel({ provider, data, openFact }: {
  provider: DataProvider; data: ForecastResponse; openFact: (id: string | undefined, pool?: Record<string, Fact>) => void;
}) {
  const [lang, setLang] = useState<string>("Benglish");
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
    <Panel title="A letter from a future that went broke" sub="Words by Gemma, every number by the engine" icon={EnvelopeSimpleOpen}
      action={
        <SegmentedControl aria-label="Letter language" selectionMode="single" disallowEmptySelection
          selectedKeys={new Set([lang])} onSelectionChange={(k) => { const v = [...k][0]; if (v) setLang(String(v)); }}>
          {LANGS.map((l) => <SegmentedControlItem key={l} id={l}>{l}</SegmentedControlItem>)}
        </SegmentedControl>
      }>
      <div className="min-h-[9rem]" lang={lang === "Bengali" ? "bn" : "en"} aria-live="polite">
        {loading ? <AgentThinking variant="wave" label="Writing" shimmer /> : letter ? (
          <p className="text-headline-medium leading-relaxed text-text-primary" style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontWeight: 400 }}>
            {letter.segments.map((s, i) => s.type === "fact" ? (
              <button key={i} type="button" onClick={() => openFact(s.fact_id, letter.facts)}
                className="rounded-md bg-accent-50 px-1 font-sans text-body-medium text-accent-700 tabular-nums outline-none hover:bg-accent-100 focus-visible:ring-2 focus-visible:ring-border-focus-ring">
                {s.text}
              </button>
            ) : <span key={i}>{s.text}</span>)}
          </p>
        ) : <p className="text-body-regular text-text-tertiary">Letter unavailable right now.</p>}
      </div>
      {letter && (
        <p className="mt-4 border-t border-separator-border pt-3 text-body-2-medium text-text-tertiary">
          {letter.fallback_used ? "Template letter (Gemma is offline)." : `Written by ${letter.model}.`} Tap a highlighted number to see where it came from.
          {recomputed && " Written for today's starting scenario, before your changes."}
        </p>
      )}
    </Panel>
  );
}
