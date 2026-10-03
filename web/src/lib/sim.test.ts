import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/parity.json";
import { Lattice, inverseCdf, madeIt, rollout } from "./sim";
import type { SimState } from "../types";
import { groupIndian, inr } from "./format";

const s = fixture.state as unknown as SimState;
const lat = new Lattice(s);

function agree(a: number[], b: number[]): number {
  let n = 0;
  for (let i = 0; i < a.length; i++) if (a[i] === b[i]) n++;
  return n / a.length;
}

describe("browser simulator matches the Python engine (same draws)", () => {
  it("baseline", () => {
    const o = rollout(s, lat);
    expect(agree(Array.from(o.firstBroke), fixture.expected.base_first_broke)).toBeGreaterThanOrEqual(0.98);
    const end = o.paths.map((p) => p[p.length - 1]);
    end.forEach((v, i) => expect(Math.abs(v - fixture.expected.base_end_balance[i])).toBeLessThan(1));
  });
  it("with a plan", () => {
    const o = rollout(s, lat, { plans: [fixture.plan] });
    expect(agree(Array.from(o.firstBroke), fixture.expected.plan_first_broke)).toBeGreaterThanOrEqual(0.98);
  });
  it("own money only (no inflows)", () => {
    const o = rollout(s, lat, { plans: [fixture.plan], inflows: false });
    expect(agree(Array.from(o.firstBroke), fixture.expected.own_first_broke)).toBeGreaterThanOrEqual(0.98);
  });
  it("extra spend today", () => {
    const o = rollout(s, lat, { spendToday: 500 });
    expect(agree(Array.from(o.firstBroke), fixture.expected.spend500_first_broke)).toBeGreaterThanOrEqual(0.98);
  });
  it("a plan never adds futures that make it", () => {
    expect(madeIt(rollout(s, lat, { plans: [fixture.plan] }))).toBeLessThanOrEqual(madeIt(rollout(s, lat)));
  });
});

describe("inverse CDF", () => {
  it("interpolates and clips", () => {
    const Q = Float64Array.from([0, 10, 20]);
    expect(inverseCdf(Q, [0.1, 0.5, 0.9], 0.3)).toBeCloseTo(5);
    expect(inverseCdf(Q, [0.1, 0.5, 0.9], 0.05)).toBe(0);
    expect(inverseCdf(Q, [0.1, 0.5, 0.9], 0.95)).toBe(20);
  });
});

describe("format", () => {
  it("Indian grouping", () => {
    expect(groupIndian(12345678)).toBe("1,23,45,678");
    expect(inr(12345678)).toBe("₹1,23,456.78");
    expect(inr(42000)).toBe("₹420");
  });
});
