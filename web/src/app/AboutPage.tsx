import {
  ArrowRight, Brain, CheckCircle, FileText, GitBranch, LockKey, Path, SealCheck, ShieldCheck, Sparkle, WifiSlash,
  type Icon as PhosphorIcon,
} from "@phosphor-icons/react";
import type { ForecastResponse } from "../types";
import { Panel, Row, Rows, Tile } from "./kit";

type Step = { icon: PhosphorIcon; title: string; value: string; unit: string; line: string };

/** How it works: the pipeline as five cards, each with one live number from this forecast. */
export function AboutPage({ data }: { data: ForecastResponse | null }) {
  const m = data?.model;
  const steps: Step[] = [
    { icon: FileText, title: "Read", value: m ? String(m.n_history_days) : "–", unit: "days", line: "Reconciled to the paisa" },
    { icon: Brain, title: "Learn", value: m ? m.lattice_rows.toLocaleString("en-IN") : "–", unit: "states", line: "TabPFN, 99 quantiles each" },
    { icon: Path, title: "Simulate", value: data ? String(data.n_futures) : "–", unit: "futures", line: "Day by day to payday" },
    { icon: Sparkle, title: "Ask", value: "0", unit: "numbers from an LLM", line: "Answers rerun the futures" },
    { icon: SealCheck, title: "Grade", value: m?.calibrated ? `k ${m.spread_k}` : "k 1", unit: "calibrated", line: "Walk-forward, pre-registered" },
  ];
  const privacy = [
    { icon: LockKey, name: "Statements", value: "On this laptop" },
    { icon: Brain, name: "TabPFN weights", value: "Local file" },
    { icon: Sparkle, name: "Gemma (words only)", value: "Ollama, local" },
    { icon: WifiSlash, name: "Network at runtime", value: "None" },
  ];
  const rules = [
    { icon: ShieldCheck, name: "Gemma never writes a number", value: "Validated" },
    { icon: GitBranch, name: "Evaluation rules frozen first", value: "In git" },
    { icon: CheckCircle, name: "Every number opens its evidence", value: "Tap it" },
    { icon: Path, name: "Same seed, same answer", value: data ? `seed ${data.seed}` : "Fixed" },
  ];
  return (
    <>
      <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {steps.map((s, i) => (
          <li key={s.title} className="relative flex flex-col rounded-2xl bg-background-secondary-default p-2">
            <div className="flex items-center gap-2 px-2 pt-1 pb-2.5">
              <span className="flex size-7 items-center justify-center rounded-lg bg-accent-500 text-white"><s.icon weight="duotone" className="size-4" aria-hidden /></span>
              <span className="text-body-medium text-text-primary">{s.title}</span>
              <span className="ms-auto text-caption-1-medium text-text-tertiary tabular-nums">0{i + 1}</span>
            </div>
            <div className="flex flex-1 flex-col rounded-2lg bg-background-inner-default p-4 shadow-card">
              <p className="text-title-1-medium text-text-primary tabular-nums">{s.value}</p>
              <p className="text-body-2-medium text-text-tertiary">{s.unit}</p>
              <p className="mt-4 text-body-2-medium text-text-secondary">{s.line}</p>
            </div>
            {i < steps.length - 1 && (
              <ArrowRight weight="bold" className="absolute top-1/2 -right-3 z-10 hidden size-4 -translate-y-1/2 rounded-full bg-background-full text-text-tertiary xl:block" aria-hidden />
            )}
          </li>
        ))}
      </ol>
      <div className="grid gap-4 xl:grid-cols-2">
        <Facts title="What stays on your laptop" icon={LockKey} rows={privacy} />
        <Facts title="Rules it holds itself to" icon={ShieldCheck} rows={rules} />
      </div>
    </>
  );
}

function Facts({ title, icon, rows }: { title: string; icon: PhosphorIcon; rows: { icon: PhosphorIcon; name: string; value: string }[] }) {
  return (
    <Panel title={title} icon={icon} flush>
      <Rows>
        {rows.map((r) => (
          <Row key={r.name}>
            <Tile icon={r.icon} tone="accent" />
            <p className="min-w-0 flex-1 truncate text-body-medium text-text-primary">{r.name}</p>
            <p className="text-body-medium text-text-secondary tabular-nums">{r.value}</p>
          </Row>
        ))}
      </Rows>
    </Panel>
  );
}
