import { describe, expect, it } from "vitest";
import demo from "../../public/demo/forecast.json";
import type { ForecastResponse } from "../types";
import { Brain, ground, splitPlaceholders } from "./chat";
import { shortDate } from "./format";

const data = demo as unknown as ForecastResponse;
const QUESTIONS = [
  "Can I afford a ₹400 movie on Saturday?", "How much can I spend today?", "When would I run out?",
  "How long does my money last?", "Where did my money go?", "How does this work?", "What if I skip the earphones?", "hi",
];

describe("grounding: Gemma never sees a number", () => {
  const brain = new Brain(data);
  for (const q of QUESTIONS) {
    it(q, () => {
      const a = brain.ask(q);
      const g = ground(a);
      expect(g.template.replace(/\{f\d+\}/g, "")).not.toMatch(/\d/);
      for (const f of g.facts) expect(f.desc.replace(/\{f\d+\}/g, "")).not.toMatch(/\d/);
      // filling the placeholders back in gives exactly the simulated answer
      const filled = splitPlaceholders(g.template, g.facts).map((s) => s.t).join("");
      expect(filled.replace(/\s+/g, " ").trim()).toBe(a.segs.map((s) => s.t).join("").replace(/\s+/g, " ").trim());
    });
  }
});

describe("splitPlaceholders", () => {
  it("holds back a half-streamed placeholder", () => {
    const facts = [{ id: "f1", text: "₹860", desc: "amount" }];
    expect(splitPlaceholders("You can spend {f", facts).map((s) => s.t).join("")).toBe("You can spend ");
    expect(splitPlaceholders("You can spend {f1} today", facts).map((s) => s.t)).toEqual(["You can spend ", "₹860", " today"]);
  });
});

describe("chat can act on the workspace", () => {
  const brain = new Brain(data);
  it("switches a plan on by any word of its name", () => {
    const a = brain.ask("turn on the movie");
    expect(a.ops).toEqual([expect.objectContaining({ kind: "toggle", active: true, name: "Saturday movie + popcorn" })]);
  });
  it("adds a plan with amount and date", () => {
    const a = brain.ask("Add momos ₹150 on 12th Sep to plans");
    expect(a.ops?.[0]).toMatchObject({ kind: "add", plan: { amount_paise: 15000, date: "2026-09-12" } });
  });
  it("opens a tab", () => expect(brain.ask("open futures").ops).toEqual([{ kind: "go", route: "futures" }]));
  it("changes the risk limit and remembers the old one", () => {
    expect(brain.ask("set risk to 5%").ops?.[0]).toMatchObject({ kind: "settings", patch: { risk_tolerance: 0.05 }, before: { risk_tolerance: data.risk_tolerance } });
  });
  it("draws charts inline", () => {
    expect(brain.ask("show the range").artifact).toBe("range");
    expect(brain.ask("show my spending").artifact).toBe("spending");
    expect(brain.ask("show where I land on payday").artifact).toBe("payday");
  });
  it("still answers what-ifs about a plan without changing it", () => {
    expect(brain.ask("what if I skip the earphones?").ops).toBeUndefined();
  });
});

describe("everyday messages get their own short answers", () => {
  const brain = new Brain(data);
  const text = (q: string) => brain.ask(q).segs.map((s) => s.t).join("");
  it("greets instead of dumping help", () => { expect(brain.ask("hi").intent).toBe("hello"); expect(text("hey")).toContain("right now"); });
  it("tells today's date from the forecast, not a hard-coded one", () => {
    const a = brain.ask("uhm whats the todays date");
    expect(a.intent).toBe("date");
    expect(text("whats the date today")).toContain(shortDate(data.as_of));
  });
  it("answers payday and balance", () => {
    expect(brain.ask("when is my allowance coming").intent).toBe("payday");
    expect(brain.ask("how much money do i have").intent).toBe("balance");
  });
  it("unknown questions get one short line, not the same wall of examples", () => {
    const a = brain.ask("who won the cricket match");
    expect(a.intent).toBe("help");
    expect(text("who won the cricket match").length).toBeLessThan(120);
    expect(a.follow?.length).toBeGreaterThan(2);
  });
  it("every follow-up button is a question the brain understands", () => {
    for (const q of ["hi", "thanks", "whats the date", "when is payday", "my balance", "who won the match"])
      for (const f of brain.ask(q).follow ?? []) expect(brain.ask(f).intent).not.toBe("help");
  });
});
