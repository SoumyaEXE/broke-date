import { useEffect, useState } from "react";
import type { Fact, ForecastResponse, LetterResponse } from "../types";
import type { DataProvider } from "../data/provider";

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
    <article className="rounded-xl p-5 relative overflow-hidden" style={{ background: "var(--fg)", color: "var(--bg)" }}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-[0.18em] opacity-70">A letter from a future that went broke</p>
        <div className="flex gap-1">
          {LANGS.map((l) => (
            <button key={l} onClick={() => setLang(l)} aria-pressed={lang === l}
                    className={`text-[11px] px-2 py-0.5 rounded-full border ${lang === l ? "opacity-100" : "opacity-50"}`}
                    style={{ borderColor: "currentColor" }}>{l}</button>
          ))}
        </div>
      </div>
      <div className="mt-4 text-[17px] leading-relaxed min-h-[7rem]" aria-live="polite" lang={lang === "Bengali" ? "bn" : "en"}>
        {loading && <p className="opacity-60">writing…</p>}
        {err && <p className="opacity-70">{err}</p>}
        {!loading && letter && letter.segments.map((s, i) => s.type === "fact" ? (
          <button key={i} className="num underline decoration-dotted underline-offset-4" style={{ color: "#f59e5b" }}
                  onClick={() => factFor(s.fact_id)} title="where does this number come from?">{s.text}</button>
        ) : <span key={i}>{s.text}</span>)}
      </div>
      {letter && (
        <p className="mt-4 text-[11px] opacity-60">
          {letter.fallback_used ? "Template letter (Gemma offline)." : `Words by ${letter.model}.`} Every number is filled in by the engine; tap one to see where it came from.
          {letter.placeholders.length > 0 && ` ${letter.placeholders.length} numbers referenced.`}
          {(data as ForecastResponse & { recomputedInBrowser?: boolean }).recomputedInBrowser && " Written for today's starting scenario, before your changes."}
        </p>
      )}
    </article>
  );
}
