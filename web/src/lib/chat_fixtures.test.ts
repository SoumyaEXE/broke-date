/* The questions Gemma is evaluated on (engine: `brokedate eval-chat`). Grounded by the real browser brain from the
 * demo forecast, so the Python side tests exactly what the app sends. Regenerate after changing the brain:
 *   UPDATE_FIXTURES=1 pnpm exec vitest run src/lib/chat_fixtures.test.ts */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import demo from "../../public/demo/forecast.json";
import type { ForecastResponse } from "../types";
import { Brain, ground } from "./chat";

export const EVAL_QUESTIONS = [
  "Can I afford a ₹400 movie on Saturday?", "Can I afford ₹1200 shoes tomorrow?", "How much can I spend today?",
  "When would I run out?", "How long does my money last?", "Where did my money go?", "What if I skip the earphones?",
  "Should I ask home for ₹500?", "hi", "what's the date today", "when is my allowance coming", "how much money do i have",
  "Add momos ₹150 on Friday to plans", "turn on the movie",
];

const FILE = new URL("./__fixtures__/chat_questions.json", import.meta.url);

describe("Gemma evaluation fixtures", () => {
  it("match what the browser brain grounds today", () => {
    const brain = new Brain(demo as unknown as ForecastResponse);
    const rows = EVAL_QUESTIONS.map((question) => {
      const g = ground(brain.ask(question));
      return { question, template: g.template, verdict: g.verdict, facts: g.facts.map(({ id, desc }) => ({ id, desc })) };
    });
    if (process.env.UPDATE_FIXTURES || !existsSync(FILE)) writeFileSync(FILE, `${JSON.stringify(rows, null, 1)}\n`);
    expect(JSON.parse(readFileSync(FILE, "utf8"))).toEqual(rows);
  });
});
