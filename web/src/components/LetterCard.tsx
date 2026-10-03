import { useEffect, useState } from "react";
import type { Fact, ForecastResponse, LetterResponse } from "../types";
import type { DataProvider } from "../data/provider";
import { EnvelopeSimpleOpen } from "@phosphor-icons/react";

const LANGS = ["Benglish", "English", "Bengali"];

export default function LetterCard({ provider, data, openFact }: {
  provider: DataProvider; data: ForecastResponse; openFact: (id: string | undefined, pool?: Record<string, Fact>) => void;
}) {
  const [lang, setLang] = useState("Benglish");
  const [letter, setLetter] = useState<LetterResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = async (l: string) => {
    setLoading(true); setErr(null);
    try { setLetter(await provider.letter(l)); } catch { setErr("Letter unavailable right now."); } finally { setLoading(false); }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(lang); }, [lang, data.as_of]);

  const factFor = (id?: string) => {
    if (!id || !letter) return;
    openFact(id, letter.facts);
  };

  return (
    <article className="card p-5 relative overflow-hidden" style={{ background: "linear-gradient(180deg,#fbfaff 0%,#ffffff 60%)" }}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[15px] font-medium flex items-center gap-2"><EnvelopeSimpleOpen size={18} weight="duotone" className="text-brand" />A letter from a future that went broke</p>
        <div className="flex gap-1">
          {LANGS.map((l) => (
            <button key={l} onClick={() => setLang(l)} aria-pressed={lang === l}
                    className={`text-[12px] px-2.5 py-1 rounded-full border transition ${lang === l ? "bg-ink text-white border-ink" : "border-line text-ink-2 hover:bg-[#f6f6f8]"}`}>{l}</button>
          ))}
        </div>
      </div>
      <div className="mt-4 text-[16px] leading-[1.7] min-h-[6rem] text-ink" style={{ fontFamily: "Georgia, 'Times New Roman', serif" }} aria-live="polite" lang={lang === "Bengali" ? "bn" : "en"}>
        {loading && <p className="opacity-60">writing…</p>}
        {err && <p className="opacity-70">{err}</p>}
        {!loading && letter && letter.segments.map((s, i) => s.type === "fact" ? (
          <button key={i} className="num font-semibold underline decoration-dotted underline-offset-4 text-brand" style={{ fontFamily: "var(--font-sans)" }}
                  onClick={() => factFor(s.fact_id)} title="where does this number come from?">{s.text}</button>
        ) : <span key={i}>{s.text}</span>)}
      </div>
      {letter && (
        <p className="mt-4 text-[12px] muted">
          {letter.fallback_used ? "Template letter (Gemma offline)." : `Words by ${letter.model}.`} Every number is filled in by the engine; tap one to see where it came from.
          {letter.placeholders.length > 0 && ` ${letter.placeholders.length} numbers referenced.`}
          {(data as ForecastResponse & { recomputedInBrowser?: boolean }).recomputedInBrowser && " Written for today's starting scenario, before your changes."}
        </p>
      )}
    </article>
  );
}
