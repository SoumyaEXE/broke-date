import { describe, expect, it } from "vitest";
import demo from "../../public/demo/forecast.json";
import type { ForecastResponse } from "../types";
import { Brain, ground, splitPlaceholders } from "./chat";

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
