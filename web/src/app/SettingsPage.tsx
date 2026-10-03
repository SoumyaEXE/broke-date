import { useEffect, useState } from "react";
import { Cpu, GearSix, Trash, Translate } from "@phosphor-icons/react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Select, SelectItem } from "@/components/base/select/select";
import { Switch } from "@/components/base/switch/switch";
import type { ForecastResponse, Settings } from "../types";
import type { DataProvider } from "../data/provider";
import { Panel, Row, Rows, duo } from "./kit";

export function SettingsPage({ provider, onSaved, data }: { provider: DataProvider; onSaved: () => void; data: ForecastResponse | null }) {
  const [s, setS] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => { void provider.settings().then(setS); }, [provider]);
  if (!s) return <div className="h-64 animate-pulse rounded-2xl bg-background-secondary-default" />;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => { setS({ ...s, [k]: v }); setSaved(false); };
  const save = async () => { setS(await provider.saveSettings(s)); setSaved(true); onSaved(); };
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Panel title="Forecast" sub="How careful the safe-to-spend number is" icon={GearSix} flush
        action={<Button variant="primary" size="xs" onClick={() => void save()}>{saved ? "Saved" : "Save"}</Button>}>
        <Rows>
          <Row className="flex-wrap">
            <div className="min-w-0 flex-1"><p className="text-body-medium">Broke line</p><p className="text-body-2-medium text-text-tertiary">Below this you count as broke</p></div>
            <Input aria-label="Broke line in rupees" inputMode="numeric" value={String(s.broke_line_rupees)} onChange={(v) => set("broke_line_rupees", Number(v.replace(/\D/g, "")) || 0)} className="w-28" />
          </Row>
          <Row className="flex-wrap">
            <div className="min-w-0 flex-1"><p className="text-body-medium">Risk you're OK with</p><p className="text-body-2-medium text-text-tertiary">Max chance of going broke</p></div>
            <Select aria-label="Risk tolerance" selectedKey={String(s.risk_tolerance)} onSelectionChange={(k) => set("risk_tolerance", Number(k))} className="w-28">
              {["0.05", "0.1", "0.2", "0.3"].map((v) => <SelectItem key={v} id={v}>{Math.round(Number(v) * 100)}%</SelectItem>)}
            </Select>
          </Row>
          <Row className="flex-wrap">
            <div className="min-w-0 flex-1"><p className="text-body-medium">Futures to simulate</p><p className="text-body-2-medium text-text-tertiary">More is smoother</p></div>
            <Select aria-label="Number of futures" selectedKey={String(s.n_futures)} onSelectionChange={(k) => set("n_futures", Number(k))} className="w-28">
              {["250", "500", "1000"].map((v) => <SelectItem key={v} id={v}>{v}</SelectItem>)}
            </Select>
          </Row>
        </Rows>
      </Panel>
      <Panel title="Words" sub="Gemma runs locally through Ollama" icon={Translate} flush>
        <Rows>
          <Row className="flex-wrap">
            <div className="min-w-0 flex-1"><p className="text-body-medium">Letter language</p><p className="text-body-2-medium text-text-tertiary">Any language</p></div>
            <Input aria-label="Letter language" value={s.letter_language} onChange={(v) => set("letter_language", v)} className="w-40" />
          </Row>
          <Row><div className="flex-1"><p className="text-body-medium">Use Gemma</p><p className="text-body-2-medium text-text-tertiary">Off: rules and templates only</p></div><Switch aria-label="Use Gemma" isSelected={s.gemma_enabled} onChange={(v) => set("gemma_enabled", v)} /></Row>
          <Row><div className="flex-1"><p className="text-body-medium">Weekly letter</p><p className="text-body-2-medium text-text-tertiary">From a future that went broke</p></div><Switch aria-label="Weekly letter" isSelected={s.letters_enabled} onChange={(v) => set("letters_enabled", v)} /></Row>
          {provider.mode === "live" && (
            <Row><div className="flex-1"><p className="text-body-medium">Delete all my data</p><p className="text-body-2-medium text-text-tertiary">Statements, labels, plans</p></div>
              <Button variant="danger" size="xs" leadingIcon={duo(Trash)} onClick={async () => { if (!confirm("Delete all imported statements, labels and plans from this laptop?")) return; await fetch("http://127.0.0.1:8787/delete-all", { method: "POST" }); onSaved(); }}>Delete</Button>
            </Row>
          )}
        </Rows>
      </Panel>
      <Panel title="Engine" sub="What produced the numbers you see" icon={Cpu} flush className="xl:col-span-2">
        <div className="grid divide-separator-border sm:grid-cols-2 sm:divide-x xl:grid-cols-4">
          {engine(data).map(([k, v]) => (
            <div key={k} className="px-4 py-3">
              <p className="text-body-2-medium text-text-tertiary">{k}</p>
              <p className="truncate text-body-medium text-text-primary tabular-nums">{v}</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function engine(d: ForecastResponse | null): [string, string][] {
  if (!d) return [["Engine", "–"]];
  const m = d.model;
  return [
    ["Spend model", m.model_version || m.spend_model],
    ["History", `${m.history_from} → ${m.history_to}`],
    ["Calibration", m.calibrated ? `k = ${m.spread_k}` : "off"],
    ["Prepared in", `${(m.timings_s?.prepare_total ?? 0).toFixed(1)} s`],
  ];
}
