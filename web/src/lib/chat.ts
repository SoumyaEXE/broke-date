// Chat brain: understands a question, reruns the SAME TabPFN futures (lattice + draws exported by the engine) for
// the asked scenario, and answers with numbers that come only from that simulation. No language model ever
// produces a number here.

import type { ForecastResponse, PlanRow } from "../types";
import { Lattice, madeIt, meanRunway, percentileBand, rollout, safeToSpend, type SimPlan } from "./sim";
import { addDays, days, dow, inr, pct, shortDate } from "./format";

export type Seg = { t: string; tone?: "num" | "good" | "bad" | "brand" };
export interface ScenarioCard {
  title: string; beforeMade: number; afterMade: number; n: number; beforeP50: number[]; afterP50: number[];
  brokeLine: number; dayCost?: number; verdict: "yes" | "tight" | "no";
}
export interface ChatAction { label: string; plan?: { name: string; amount_paise: number; date: string } }
/** Changes the chat makes to the workspace when asked ("turn on the movie", "open futures", "set risk to 5%"). */
export type Op =
  | { kind: "toggle"; planId: string; name: string; active: boolean }
  | { kind: "add"; plan: { name: string; amount_paise: number; date: string } }
  | { kind: "remove"; planId: string; name: string }
  | { kind: "go"; route: "overview" | "futures" | "plans" | "activity" | "grade" | "settings" | "about" }
  | { kind: "settings"; patch: { risk_tolerance?: number; broke_line_rupees?: number }; before: { risk_tolerance?: number; broke_line_rupees?: number } };
/** Charts the chat can draw inline, from the same futures as the dashboard. */
export type Artifact = "range" | "spending" | "payday" | "plans";
export interface Answer {
  segs: Seg[]; card?: ScenarioCard; actions?: ChatAction[]; follow?: string[]; intent: string; ms: number;
  ops?: Op[]; artifact?: Artifact;
}

const WEEKDAYS: Record<string, number> = {
  sun: 0, sunday: 0, robibar: 0, mon: 1, monday: 1, sombar: 1, tue: 2, tues: 2, tuesday: 2, mongolbar: 2,
  wed: 3, wednesday: 3, budhbar: 3, thu: 4, thur: 4, thursday: 4, brihospotibar: 4, fri: 5, friday: 5,
  sukrobar: 5, shukrobar: 5, sat: 6, saturday: 6, shonibar: 6, sanibar: 6,
};
const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

export function parseAmount(q: string): number | null {
  const s = q.replace(/,/g, "");
  const m = s.match(/(?:₹|rs\.?|inr)\s*(\d+(?:\.\d+)?)/i) ?? s.match(/(\d+(?:\.\d+)?)\s*(?:₹|rs\b|rupees?|taka|tk\b|\/-)/i)
    ?? s.match(/(?:for|of|worth|costs?|spend|buy|kinte|pay)\D{0,12}(\d{2,6})(?!\s*(?:st|nd|rd|th|days?|aug|sep|oct|nov|dec|jan|feb|mar|apr|may|jun|jul))/i)
    ?? s.match(/\b(\d{2,6})\b(?!\s*(?:st|nd|rd|th|days?|aug|sep|oct|nov|dec|jan|feb|mar|apr|may|jun|jul))/i);
  return m ? Math.round(parseFloat(m[1]) * 100) : null;
}

export function parseDate(q: string, asOf: string): string | null {
  const s = q.toLowerCase();
  if (/\b(today|aaj|now|right now)\b/.test(s)) return asOf;
  if (/\b(tomorrow|kal|tmrw)\b/.test(s)) return addDays(asOf, 1);
  if (/\bday after tomorrow|porshu\b/.test(s)) return addDays(asOf, 2);
  if (/\b(this )?weekend\b/.test(s)) { for (let i = 0; i < 7; i++) if (dow(addDays(asOf, i)) === "Sat") return addDays(asOf, i); }
  if (/\bnext week\b/.test(s)) return addDays(asOf, 7);
  const dm = s.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*/) ??
    s.match(/\b(?:on|the)\s+(\d{1,2})(?:st|nd|rd|th)\b/);
  if (dm) {
    const y = Number(asOf.slice(0, 4));
    const mon = dm[2] ? MONTHS[dm[2]] : Number(asOf.slice(5, 7));
    let d = `${y}-${String(mon).padStart(2, "0")}-${String(Number(dm[1])).padStart(2, "0")}`;
    if (d < asOf) d = dm[2] ? `${y + 1}${d.slice(4)}` : addDays(d, 30).slice(0, 8) + d.slice(8);
    return d;
  }
  for (const [w, n] of Object.entries(WEEKDAYS)) {
    if (new RegExp(`\\b${w}\\b`).test(s)) {
      for (let i = 0; i < 8; i++) {
        const d = addDays(asOf, i);
        if (["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][n] === dow(d)) return d;
      }
    }
  }
  return null;
}

const NOT_A_THING = /^(it|that|this|something|today|tomorrow|tonight|weekend|(mon|tues|wednes|thurs|fri|satur|sun)day|next .*|this .*)$/i;

function thing(q: string): string {
  // "₹400 movie", "400 rs biryani": the noun right after the amount is the best guess
  const a = q.match(/(?:₹|rs\.?|inr)?\s?\d[\d,]*(?:\s?(?:rs|rupees?))?\s+(?:for\s+|on\s+)?(?:a |an |the |some )?([a-z][a-z &'-]{2,24}?)(?:\s+(?:on|for|this|next|tomorrow|today|at)\b|[?.!,]|$)/i);
  if (a?.[1] && !NOT_A_THING.test(a[1].trim())) return a[1].trim();
  const m = q.match(/(?:afford|buy|get|go (?:for|to)|spend\s+\S+\s+on|on)\s+(?:a |an |the |some )?([a-z][a-z +&'-]{2,28}?)(?:\s+(?:for|on|this|next|tomorrow|today|at|worth|of)\b|[?.!,]|$)/i);
  const t = m?.[1]?.trim();
  if (!t || /^\d/.test(t) || NOT_A_THING.test(t)) return "this";
  return t.length > 26 ? t.slice(0, 26) : t;
}

export class Brain {
  private lat: Lattice;
  constructor(private d: ForecastResponse) {
    if (!d.sim) throw new Error("forecast has no simulator state");
    this.lat = new Lattice(d.sim);
  }
  private plans(extra?: SimPlan, without?: string): SimPlan[] {
    const ps = this.d.plans.filter((p) => p.id !== without).map((p) => ({ date: p.date, amount_paise: p.amount_paise, active: p.active }));
    return extra ? [...ps, extra] : ps;
  }
  private run(plans: SimPlan[], inflows = true) { return rollout(this.d.sim!, this.lat, { plans, inflows }); }

  ask(qRaw: string): Answer {
    const t0 = performance.now();
    const q = qRaw.trim().toLowerCase();
    const res = this.route(q, qRaw);
    return { ...res, ms: Math.round(performance.now() - t0) };
  }

  private route(q: string, raw: string): Omit<Answer, "ms"> {
    // a plan is meant if any meaningful word of its name appears ("the movie" -> "Saturday movie + popcorn")
    const words = (name: string) => name.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3 && !/^(with|from|this|that|then)$/.test(w));
    const planHit = this.d.plans.find((p) => words(p.name).some((w) => new RegExp(`\\b${w}`).test(q)));
    const talk = this.smallTalk(q);
    if (talk) return talk;
    const cmd = this.command(q, raw, planHit);
    if (cmd) return cmd;
    if (/\b(skip|cancel|drop|without|don'?t|not go|na jai|bad di)\b/.test(q) && planHit) return this.skip(planHit);
    if (/\b(how (do|does) (you|this|it) work|tabpfn|what model|how accurate|accuracy|trust|backtest|brier|why should i believe)\b/.test(q)) return this.model();
    const amount = parseAmount(q);
    if (amount && /\b(afford|can i|should i|buy|spend|get|go|kinte|kena|order|treat|pay|is it ok|worth)\b/.test(q)) return this.afford(amount, parseDate(q, this.d.as_of) ?? this.d.as_of, thing(raw));
    if (/\b(when|kobe|which day).*(broke|run out|shesh|khatam)|\bbroke\b.*\bwhen\b/.test(q)) return this.whenBroke();
    if (/\b(how long|runway|last till|last until|kotodin|how many days)\b/.test(q)) return this.runway();
    if (/\b(safe|how much can i|koto|kitna|budget today|spend today)\b/.test(q)) return this.safe();
    if (/\b(spent|spending|kharcha|where.*money|food|delivery|transport|outing|categor|this month)\b/.test(q)) return this.spending();
    if (amount) return this.afford(amount, parseDate(q, this.d.as_of) ?? this.d.as_of, thing(raw));
    if (planHit) return this.skip(planHit);
    return this.help();
  }

  private card(title: string, before: ReturnType<typeof rollout>, after: ReturnType<typeof rollout>, dayCost?: number): ScenarioCard {
    const H = this.d.horizon_days;
    const n = before.firstBroke.length;
    const a = madeIt(after);
    const risk = 1 - a / n;
    return {
      title, beforeMade: madeIt(before), afterMade: a, n, brokeLine: this.d.broke_line_paise,
      beforeP50: percentileBand(before, H).p50, afterP50: percentileBand(after, H).p50, dayCost,
      verdict: risk <= this.d.risk_tolerance ? "yes" : risk <= this.d.risk_tolerance + 0.12 ? "tight" : "no",
    };
  }

  afford(amountPaise: number, date: string, what: string): Omit<Answer, "ms"> {
    const s = this.d.sim!;
    const T = s.day_map.length;
    const idx = Math.round((Date.parse(date) - Date.parse(this.d.as_of)) / 86400000);
    const base = this.run(this.plans());
    const extra = { date, amount_paise: amountPaise, active: true };
    const after = this.run(this.plans(extra));
    const own0 = meanRunway(this.run(this.plans(), false));
    const own1 = meanRunway(this.run(this.plans(extra), false));
    const cost = Math.max(0, own0 - own1);
    const n = base.firstBroke.length;
    const c = this.card(`${what === "this" ? "Spend" : what} · ${inr(amountPaise)} · ${shortDate(date)}`, base, after, cost);
    const lost = c.beforeMade - c.afterMade;
    const segs: Seg[] = [];
    if (idx >= T || date >= this.d.next_anchor_date) {
      segs.push({ t: date === this.d.next_anchor_date
        ? `${shortDate(date)} is the day your allowance lands, so it doesn't touch this month's `
        : `${shortDate(date)} is after your allowance lands (${shortDate(this.d.next_anchor_date)}), so it doesn't touch this month's ` },
        { t: "futures", tone: "brand" }, { t: `. It still costs about ` }, { t: days(cost), tone: "num" }, { t: " of your own money's runway." });
    } else {
      const v = c.verdict;
      segs.push({ t: v === "yes" ? "Yes. " : v === "tight" ? "Doable, but tight. " : "I'd hold off. ", tone: v === "yes" ? "good" : v === "tight" ? "brand" : "bad" },
        { t: `I reran your ${n} futures with ${what === "this" ? inr(amountPaise) : `a ${inr(amountPaise)} ${what}`} on ${dow(date)}, ${shortDate(date)}. ` },
        { t: `${c.afterMade} of ${n}`, tone: "num" }, { t: " still make it to payday" },
        { t: lost > 0 ? ` (${lost} fewer)` : " (no change)", tone: lost > 0 ? "bad" : "good" },
        { t: `, and it costs ` }, { t: days(cost), tone: "num" }, { t: " of runway on your own money. " });
      const risk = 1 - c.afterMade / n;
      segs.push({ t: `Chance of going broke before payday would be ` }, { t: pct(risk), tone: risk > this.d.risk_tolerance ? "bad" : "good" }, { t: "." });
    }
    return {
      intent: "afford", segs, card: c,
      actions: [{ label: "Add as a plan", plan: { name: what === "this" ? `Spend ${inr(amountPaise)}` : what.replace(/^\w/, (x) => x.toUpperCase()), amount_paise: amountPaise, date } }],
      follow: [`What if I spend ${inr(Math.round(amountPaise / 2))} instead?`, "When would I go broke?", "How much is safe today?"],
    };
  }

  skip(p: PlanRow): Omit<Answer, "ms"> {
    const withP = this.run(this.plans({ date: p.date, amount_paise: p.amount_paise, active: true }, p.id));
    const without = this.run(this.plans(undefined, p.id));
    const own1 = meanRunway(this.run(this.plans({ date: p.date, amount_paise: p.amount_paise, active: true }, p.id), false));
    const own0 = meanRunway(this.run(this.plans(undefined, p.id), false));
    const c = this.card(`Without "${p.name}"`, withP, without, Math.max(0, own0 - own1));
    return {
      intent: "skip", card: c,
      segs: [{ t: `Skipping ${p.name} (${inr(p.amount_paise)}, ${shortDate(p.date)}) gives back ` }, { t: days(Math.max(0, own0 - own1)), tone: "num" },
        { t: " of runway, and " }, { t: `${c.afterMade - c.beforeMade}`, tone: "good" }, { t: ` more of your futures make it to payday (${c.afterMade} of ${c.n}).` }],
      follow: ["How much is safe today?", "When would I go broke?"],
    };
  }

  whenBroke(): Omit<Answer, "ms"> {
    const r = this.run(this.plans());
    const H = this.d.horizon_days;
    const n = r.firstBroke.length;
    const b = Array.from(r.firstBroke).filter((x) => x >= 1 && x <= H).sort((a, z) => a - z);
    if (!b.length) return { intent: "broke", segs: [{ t: "In none of your " }, { t: String(n), tone: "num" }, { t: ` futures do you go broke before ${shortDate(this.d.next_anchor_date)}. ` }, { t: "You're fine this month.", tone: "good" }], follow: ["How much is safe today?", "How long does my money last?"] };
    const q = (p: number) => b[Math.min(b.length - 1, Math.round(p * (b.length - 1)))];
    const lo = shortDate(addDays(this.d.as_of, q(0.1) - 1)), hi = shortDate(addDays(this.d.as_of, q(0.9) - 1));
    return {
      intent: "broke",
      segs: [{ t: `${b.length} of ${n}`, tone: "bad" }, { t: " simulated months run out before payday. When they do, it's most often around " },
        { t: shortDate(addDays(this.d.as_of, q(0.5) - 1)), tone: "num" },
        { t: lo === hi ? ", right at the end of the month." : ` (most of them between ${lo} and ${hi}).` }],
      follow: ["How much is safe today?", "What if I skip my plans?"],
    };
  }

  runway(): Omit<Answer, "ms"> {
    const rw = meanRunway(this.run(this.plans(), false));
    const until = addDays(this.d.as_of, Math.floor(rw) - 1);
    return { intent: "runway", segs: [{ t: "On your own money alone (no help from anyone, allowance not counted) it lasts about " }, { t: days(rw), tone: "num" },
      { t: `, roughly until ${shortDate(until)}. Your allowance is due ${shortDate(this.d.next_anchor_date)}.` }], follow: ["When would I go broke?", "How much is safe today?"] };
  }

  safe(): Omit<Answer, "ms"> {
    const s = safeToSpend(this.d.sim!, this.lat, this.plans(), this.d.risk_tolerance);
    if (s.nothingSafe) return { intent: "safe", segs: [{ t: "Honestly, nothing extra today. ", tone: "bad" }, { t: "You're already at a " }, { t: pct(s.riskNow), tone: "bad" }, { t: ` chance of going broke before payday, above your ${pct(this.d.risk_tolerance)} comfort line.` }], follow: ["What if I skip my plans?", "When would I go broke?"] };
    return { intent: "safe", segs: [{ t: "You can spend up to " }, { t: inr(Math.round(s.safeRupees * 100)), tone: "good" }, { t: ` today and still keep the chance of going broke before payday at or below ${pct(this.d.risk_tolerance)}. Right now it's ` }, { t: pct(s.riskNow), tone: "num" }, { t: "." }], follow: ["Can I afford ₹300 on Saturday?", "How long does my money last?"] };
  }

  spending(): Omit<Answer, "ms"> {
    const c = this.d.context?.cycle;
    if (!c) return this.help();
    const segs: Seg[] = [{ t: `Since your allowance on ${shortDate(c.start)} (${c.day_in_cycle} days) you've spent ` }, { t: inr(c.spent_paise), tone: "num" }];
    if (c.typical_spent_paise) {
      const diff = c.spent_paise - c.typical_spent_paise;
      segs.push({ t: `, vs ${inr(c.typical_spent_paise)} by this point in a typical month (` }, { t: `${diff >= 0 ? "+" : ""}${inr(diff)}`, tone: diff > 0 ? "bad" : "good" }, { t: "). " });
    } else segs.push({ t: ". " });
    const top = [...c.groups].sort((a, b) => b.spent_paise - a.spent_paise).filter((g) => g.spent_paise > 0).slice(0, 2);
    if (top.length) segs.push({ t: "Most of it: " }, { t: top.map((g) => `${g.group} ${inr(g.spent_paise)}`).join(", "), tone: "num" }, { t: "." });
    return { intent: "spending", segs, follow: ["How much is safe today?", "When would I go broke?"] };
  }

  model(): Omit<Answer, "ms"> {
    return { intent: "model", segs: [{ t: "TabPFN", tone: "brand" }, { t: " learned the full spread of how much you might spend on any day, from your own history, no training loop. I simulate " },
      { t: `${this.d.n_futures} futures`, tone: "num" }, { t: " day by day from it and answer every question by rerunning those same futures with your change. Then I grade myself on your past months under rules committed before seeing results; see " }, { t: "How good am I?", tone: "brand" }, { t: "." }],
      follow: ["Can I afford ₹500 biryani on Saturday?", "When would I go broke?"] };
  }

  /** Imperative requests: act on the workspace or draw a chart. Returns null for ordinary questions. */
  private command(q: string, raw: string, planHit: PlanRow | undefined): Omit<Answer, "ms"> | null {
    // inline charts
    if (/\b(show|draw|plot|chart|graph|visuali[sz]e|dekha)\b/.test(q)) {
      if (/\b(spend\w*|spent|categor\w*|where|breakdown|kharcha)\b/.test(q) && !/\bpayday\b/.test(q)) return this.show("spending", "Here's where this month's money went, against a typical month.");
      if (/\b(payday|land|end of (the )?month|histogram)\b/.test(q)) return this.show("payday", `Here's where all ${this.d.n_futures} simulated months land on payday.`);
      if (/\bplans?\b/.test(q) && !/\bopen\b/.test(q)) return this.show("plans", "Here are your plans and what each one costs in days of runway.");
      if (/\b(range|future|fan|balance|month|forecast)\b/.test(q)) return this.show("range", `Here's the range of your balance to payday across ${this.d.n_futures} simulated months.`);
    }
    // navigation
    const tab = q.match(/\b(?:open|go to|take me to|switch to|navigate to)\s+(?:the\s+)?(overview|home|dashboard|futures?|plans?|activity|transactions|grade|how good|settings|about|how it works)\b/);
    if (tab) {
      const t = tab[1];
      const route = /overview|home|dashboard/.test(t) ? "overview" : /future/.test(t) ? "futures" : /plan/.test(t) ? "plans"
        : /activity|transactions/.test(t) ? "activity" : /grade|how good/.test(t) ? "grade" : /settings/.test(t) ? "settings" : "about";
      return { intent: "go", segs: [{ t: "Opening " }, { t: route === "grade" ? "How good am I?" : route[0].toUpperCase() + route.slice(1), tone: "brand" }, { t: "." }], ops: [{ kind: "go", route }] };
    }
    // plan switches
    if (planHit && /\b(turn on|switch on|enable|activate|count|add .* back|i('| a)?m doing|i will do|do it)\b/.test(q) && !planHit.active)
      return this.opPlan({ kind: "toggle", planId: planHit.id, name: planHit.name, active: true }, `Switched on ${planHit.name}.`);
    if (planHit && /\b(turn off|switch off|disable|deactivate|not doing|pause)\b/.test(q) && planHit.active)
      return this.opPlan({ kind: "toggle", planId: planHit.id, name: planHit.name, active: false }, `Switched off ${planHit.name}.`);
    if (planHit && /\b(delete|remove)\b/.test(q))
      return this.opPlan({ kind: "remove", planId: planHit.id, name: planHit.name }, `Removed ${planHit.name} from your plans.`);
    // new plan
    const amount = parseAmount(q);
    if (amount && /\b(add|plan|schedule|put)\b/.test(q) && /\b(add|to (my )?plans?|as a plan)\b/.test(q)) {
      const date = parseDate(q, this.d.as_of) ?? this.d.as_of;
      const name = thing(raw);
      const plan = { name: name === "this" ? "New plan" : name[0].toUpperCase() + name.slice(1), amount_paise: amount, date };
      return this.opPlan({ kind: "add", plan }, `Added ${plan.name}, ${inr(amount)} on ${shortDate(date)}, to your plans.`);
    }
    // settings
    const risk = q.match(/\b(?:risk|comfort)\b.*?\b(\d{1,2})\s?%/);
    if (risk && /\b(set|change|make|put|lower|raise)\b/.test(q)) {
      const v = Math.min(50, Math.max(1, Number(risk[1]))) / 100;
      return { intent: "settings", segs: [{ t: "Your risk limit is now " }, { t: pct(v), tone: "num" }, { t: ". Safe-to-spend recalculates on the same futures." }],
        ops: [{ kind: "settings", patch: { risk_tolerance: v }, before: { risk_tolerance: this.d.risk_tolerance } }] };
    }
    const line = q.match(/\bbroke line\b.*?(?:₹|rs\.?\s?)?(\d{2,5})\b/);
    if (line && /\b(set|change|make|put|to)\b/.test(q)) {
      const r = Number(line[1]);
      return { intent: "settings", segs: [{ t: "Broke line is now " }, { t: inr(r * 100), tone: "num" }, { t: ". Every future reruns against it." }],
        ops: [{ kind: "settings", patch: { broke_line_rupees: r }, before: { broke_line_rupees: Math.round(this.d.broke_line_paise / 100) } }] };
    }
    return null;
  }

  private show(artifact: Artifact, text: string): Omit<Answer, "ms"> {
    return { intent: "show", segs: [{ t: text }], artifact,
      follow: artifact === "spending" ? ["When would I run out?", "Show the range"] : ["Where did my money go?", "How much is safe today?"] };
  }

  private opPlan(op: Op, text: string): Omit<Answer, "ms"> {
    return { intent: "act", segs: [{ t: text }, { t: " Every future has been rerun with it." }], ops: [op], artifact: "plans",
      follow: ["How much is safe today?", "When would I run out?"] };
  }

  /** Everyday messages: greetings, thanks, today's date, payday, balance. Short, direct, never the help wall. */
  private smallTalk(q: string): Omit<Answer, "ms"> | null {
    const words = q.replace(/[^a-z\s']/g, " ").trim().split(/\s+/).filter(Boolean);
    const today = this.d.as_of, pay = this.d.next_anchor_date;
    const left = Math.round((Date.parse(pay) - Date.parse(today)) / 86400000);
    const payText = left <= 0 ? "today" : left === 1 ? `tomorrow, ${dow(pay)} ${shortDate(pay)}` : `${dow(pay)} ${shortDate(pay)}, in ${left} days`;
    if (words.length <= 4 && /^(hi|hii+|hey|hello|helo|yo|sup|namaste|nomoskar|hola|gm|good (morning|evening|afternoon))\b/.test(words.join(" "))) {
      return { intent: "hello", segs: [{ t: "Hey! You have " }, { t: inr(this.d.balance_now_paise), tone: "num" }, { t: ` right now, and your allowance is due ${payText}. What do you want to check?` }],
        follow: ["How much is safe today?", "Can I afford ₹300 on Saturday?", "Where did my money go?"] };
    }
    if (words.length <= 6 && /\b(thanks|thank you|thx|ty|dhonnobad|ok|okay|cool|nice|great)\b/.test(q)) {
      return { intent: "thanks", segs: [{ t: "Anytime. Ask again whenever a plan comes up." }], follow: ["Show the range", "How much is safe today?"] };
    }
    if (/\b(date|what day|which day|today'?s? date|day is it)\b/.test(q) && !/\b(broke|run out|pay ?day|allowance|afford)\b/.test(q)) {
      return { intent: "date", segs: [{ t: "Today is " }, { t: `${dow(today)}, ${shortDate(today)}`, tone: "num" }, { t: `. Your allowance is due ${payText}.` }],
        follow: ["How much is safe today?", "When would I run out?"] };
    }
    if (/\b(pay ?day|allowance|pocket money|when (do|will) i get|money (come|arrive))\b/.test(q) && !/\b(afford|spend|broke|run out)\b/.test(q)) {
      return { intent: "payday", segs: [{ t: "Your allowance is due " }, { t: payText, tone: "num" }, { t: this.d.next_anchor_known ? "." : ", based on when it usually arrives." }],
        follow: ["When would I run out?", "How much is safe today?"] };
    }
    if (/\b(balance|how much (money )?(do i have|is left|have i got)|money left|in my account)\b/.test(q)) {
      return { intent: "balance", segs: [{ t: "You have " }, { t: inr(this.d.balance_now_paise), tone: "num" }, { t: ` as of ${shortDate(today)}.` }],
        follow: ["How much is safe today?", "Where did my money go?"] };
    }
    return null;
  }

  help(): Omit<Answer, "ms"> {
    return { intent: "help", segs: [{ t: "I can only answer questions about your money this month. Try one of these, or ask if you can afford something." }],
      follow: ["How much is safe today?", "Can I afford ₹300 on Saturday?", "Show the range", "Add momos ₹150 on Friday to plans"] };
  }
}

/* ---------------- grounding for Gemma ----------------
 * Turn a simulated answer into (a) facts {fN} -> exact value text, (b) a template with every number replaced by its
 * placeholder. Gemma only ever sees the template and short descriptions, never a value (same contract as the letter).
 */
export interface GroundFact { id: string; text: string; desc: string; tone?: Seg["tone"] }
export interface Grounded { template: string; facts: GroundFact[]; verdict: string | null }

const NUM = /₹\s?[\d,]+(?:\.\d+)?|\d+(?:\.\d+)?\s?%|\d+(?:\.\d+)?\s(?:days?|futures?|months?)|\d{1,2}(?:st|nd|rd|th)\s[A-Z][a-z]{2,3}|\d+(?:\s?\/\s?\d+)?(?:\.\d+)?/g;

function describe(before: string, value: string): string {
  const ctx = before.replace(/\{f\d+\}/g, "").trim().split(/\s+/).slice(-7).join(" ");
  const kind = value.includes("₹") ? "amount" : value.includes("%") ? "percentage" : /day/.test(value) ? "number of days"
    : /[A-Z][a-z]{2}/.test(value) ? "date" : "count";
  return ctx ? `${kind} after "${ctx}"` : kind;
}

export function ground(a: Answer): Grounded {
  const facts: GroundFact[] = [];
  let template = "";
  const add = (value: string, tone?: Seg["tone"]) => {
    const hit = facts.find((f) => f.text === value);
    if (hit) return `{${hit.id}}`;
    const id = `f${facts.length + 1}`;
    facts.push({ id, text: value, desc: describe(template, value), tone });
    return `{${id}}`;
  };
  for (const s of a.segs) {
    if ((s.tone === "num" || s.tone === "good" || s.tone === "bad") && /\d/.test(s.t)) {
      const [, lead, core, tail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(s.t)!;
      template += lead + add(core, s.tone) + tail;
    }
    else template += s.t.replace(NUM, (m) => add(m.trim()));
  }
  // say exactly what each number means: its kind plus the sentence it sits in (other numbers stay placeholders)
  const sentences = template.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/);
  for (const f of facts) {
    const s = sentences.find((x) => x.includes(`{${f.id}}`));
    const kind = f.desc.split(" after ")[0];
    if (s) f.desc = `${kind}, in "${s.trim()}"`;
  }
  const v = a.card?.verdict;
  const verdict = v === "yes" ? "comfortable: yes, they can afford it" : v === "tight" ? "doable but tight" : v === "no" ? "risky: better to hold off" : null;
  return { template: template.replace(/\s+/g, " ").trim(), facts, verdict };
}

/** Split text that may contain {fN} placeholders into renderable parts; a half-streamed "{f" tail is held back. */
export function splitPlaceholders(text: string, facts: GroundFact[]): Seg[] {
  const out: Seg[] = [];
  const clean = text.replace(/\{f?\d*$/, "");
  let pos = 0;
  for (const m of clean.matchAll(/\{(f\d+)\}/g)) {
    if (m.index! > pos) out.push({ t: clean.slice(pos, m.index) });
    const f = facts.find((x) => x.id === m[1]);
    out.push(f ? { t: f.text, tone: f.tone ?? "num" } : { t: "" });
    pos = m.index! + m[0].length;
  }
  if (pos < clean.length) out.push({ t: clean.slice(pos) });
  return out;
}
