import { useEffect, useState } from "react";
import type { Settings } from "../types";
import type { DataProvider } from "../data/provider";

export default function SettingsPage({ provider, onSaved }: { provider: DataProvider; onSaved: () => void }) {
  const [s, setS] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => { void provider.settings().then(setS); }, [provider]);
  if (!s) return <p className="muted">loading…</p>;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => { setS({ ...s, [k]: v }); setSaved(false); };
  return (
    <form className="max-w-lg space-y-5" onSubmit={async (e) => { e.preventDefault(); setS(await provider.saveSettings(s)); setSaved(true); onSaved(); }}>
      <h2 className="text-2xl font-medium">Settings</h2>
      <Field label="Broke line (₹)" hint="Below this, you're broke.">
        <input type="number" min={0} className="inp num" value={s.broke_line_rupees} onChange={(e) => set("broke_line_rupees", Number(e.target.value))} />
      </Field>
      <Field label="Risk tolerance for 'safe to spend'" hint="The chance of going broke before payday you're OK with.">
        <select className="inp num" value={s.risk_tolerance} onChange={(e) => set("risk_tolerance", Number(e.target.value))}>
          {[0.05, 0.1, 0.2, 0.3].map((v) => <option key={v} value={v}>{Math.round(v * 100)}%</option>)}
        </select>
      </Field>
      <Field label="Number of futures">
        <select className="inp num" value={s.n_futures} onChange={(e) => set("n_futures", Number(e.target.value))}>
          {[250, 500, 1000].map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </Field>
      <Field label="Letter language" hint="Benglish, English, Bengali, or type any language.">
        <input className="inp" value={s.letter_language} onChange={(e) => set("letter_language", e.target.value)} />
      </Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.gemma_enabled} onChange={(e) => set("gemma_enabled", e.target.checked)} /> Use Gemma (local, via Ollama). Off = rules + templates only.</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.letters_enabled} onChange={(e) => set("letters_enabled", e.target.checked)} /> Weekly letter</label>
      <div className="flex items-center gap-4">
        <button className="rounded px-4 py-2 font-medium" style={{ background: "var(--fg)", color: "var(--bg)" }}>Save</button>
        {saved && <span className="text-sm" style={{ color: "var(--color-made)" }}>saved</span>}
      </div>
      {provider.mode === "live" && (
        <div className="dashed-rule pt-5">
          <button type="button" className="text-sm underline underline-offset-4" style={{ color: "var(--color-broke)" }}
                  onClick={async () => {
                    if (!confirm("Delete all imported statements, labels and plans from this laptop?")) return;
                    await fetch("http://127.0.0.1:8787/delete-all", { method: "POST" });
                    onSaved();
                  }}>Delete all my data</button>
        </div>
      )}
      <style>{`.inp{border:1px solid var(--rule);border-radius:6px;padding:6px 8px;background:transparent;width:100%}`}</style>
    </form>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="font-medium">{label}</span>
      {hint && <span className="block muted text-xs mb-1">{hint}</span>}
      {children}
    </label>
  );
}
