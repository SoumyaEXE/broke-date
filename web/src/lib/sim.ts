// Browser port of engine/brokedate/sim/{lattice,rollout,inflows}.py. Given the exported lattice and the SAME
// random draws (U, V, W), it reruns the exact futures for any new plan, offline, in a few milliseconds.
// Parity with Python is tested in sim.test.ts against a fixture exported by the engine.

import type { SimState } from "../types";

export interface SimPlan { date: string; amount_paise: number; active: boolean }
export interface SimOut {
  paths: Float64Array[]; firstBroke: Int32Array; H: number; T: number;
}

function axis(grid: number[], x: number): [number, number] {
  const n = grid.length;
  if (n === 1) return [0, 0];
  const xc = Math.min(Math.max(x, grid[0]), grid[n - 1]);
  let i = 0;
  // grids are tiny (<= 13 points): linear scan is fastest
  while (i < n - 2 && grid[i + 1] <= xc) i++;
  const w = (xc - grid[i]) / Math.max(grid[i + 1] - grid[i], 1e-9);
  return [i, Math.min(Math.max(w, 0), 1)];
}

export class Lattice {
  readonly qs: number[];
  readonly B: number; readonly S3: number; readonly S14: number; readonly Q: number;
  private readonly v: Float32Array;
  constructor(private readonly s: SimState) {
    const L = s.lattice;
    this.qs = L.qs;
    [, this.B, this.S3, this.S14, this.Q] = L.shape;
    this.v = Float32Array.from(L.values);
  }
  private at(d: number, b: number, i3: number, i4: number, q: number): number {
    return this.v[((((d * this.B + b) * this.S3 + i3) * this.S14 + i4) * this.Q) + q];
  }
  /** Quantile function (length Q) for one future's state at lattice slice d. */
  interp(d: number, bal: number, s3: number, s14: number, out: Float64Array): Float64Array {
    const L = this.s.lattice;
    const [ib, wb] = axis(L.bal, bal);
    const [i3, w3] = axis(L.s3, s3);
    const [i4, w4] = axis(L.s14, s14);
    out.fill(0);
    for (let db = 0; db < 2; db++) {
      const jb = Math.min(ib + db, this.B - 1); const wbb = db ? wb : 1 - wb;
      if (wbb === 0) continue;
      for (let d3 = 0; d3 < 2; d3++) {
        const j3 = Math.min(i3 + d3, this.S3 - 1); const w33 = d3 ? w3 : 1 - w3;
        if (w33 === 0) continue;
        for (let d4 = 0; d4 < 2; d4++) {
          const j4 = Math.min(i4 + d4, this.S14 - 1); const w44 = d4 ? w4 : 1 - w4;
          const w = wbb * w33 * w44;
          if (w === 0) continue;
          for (let q = 0; q < this.Q; q++) out[q] += w * this.at(d, jb, j3, j4, q);
        }
      }
    }
    return out;
  }
}

export function inverseCdf(Q: Float64Array, qs: number[], u: number, tail = 1): number {
  const K = qs.length;
  if (u < qs[0]) return Math.max(Q[0], 0);
  if (u > qs[K - 1]) return Math.max(Q[K - 1] * tail, 0);
  let k = 0;
  while (k < K - 2 && qs[k + 1] <= u) k++;
  const w = Math.min(Math.max((u - qs[k]) / (qs[k + 1] - qs[k]), 0), 1);
  return Math.max(Q[k] * (1 - w) + Q[k + 1] * w, 0);
}

function inflow(s: SimState, bal: number, v: number, w: number): number {
  const m = s.inflow;
  if (!m) return 0;
  const edges = m.edges.map((e) => (e === null ? Infinity : e));
  let k = 0;
  while (k < m.probs.length - 1 && edges[k + 1] <= bal) k++;
  if (!(v < m.probs[k])) return 0;
  const a = m.amounts[k];
  if (!a.length) return 0;
  return a[Math.min(Math.floor(w * a.length), a.length - 1)];
}

export interface RunOpts {
  plans?: SimPlan[]; spendToday?: number; balDelta?: number; inflows?: boolean; n?: number;
}

export function rollout(s: SimState, lat: Lattice, opts: RunOpts = {}): SimOut {
  const T = s.day_map.length;
  const N = opts.n ?? s.U.length;
  const extra = new Float64Array(T);
  const pdays = new Uint8Array(T);
  for (const p of opts.plans ?? []) {
    if (!p.active) continue;
    const i = Math.round((Date.parse(p.date) - Date.parse(s.as_of)) / 86400000);
    if (i >= 0 && i < T) { extra[i] += p.amount_paise / 100; pdays[i] = 1; }
  }
  extra[0] += opts.spendToday ?? 0;
  const useInflows = opts.inflows ?? true;
  const q50 = lat.qs.reduce((best, q, i) => (Math.abs(q - 0.5) < Math.abs(lat.qs[best] - 0.5) ? i : best), 0);
  const paths: Float64Array[] = [];
  const firstBroke = new Int32Array(N);
  const Q = new Float64Array(lat.Q);
  for (let i = 0; i < N; i++) {
    const path = new Float64Array(T + 1);
    let bal = s.bal0 + (opts.balDelta ?? 0);
    const hist = s.hist14.slice();
    path[0] = bal;
    let first = bal < s.broke_line ? 0 : -1;
    const f = s.factor[i] ?? 1;
    for (let t = 0; t < T; t++) {
      const s3 = hist[11] + hist[12] + hist[13];
      let s14 = 0;
      for (let j = 0; j < 14; j++) s14 += hist[j];
      lat.interp(s.day_map[t], bal, s3, s14, Q);
      let draw = inverseCdf(Q, lat.qs, s.U[i][t]) * f;
      if (pdays[t]) draw = Math.max(draw - Q[q50], 0);
      const want = draw + s.sched[t] + extra[t];
      const spend = Math.min(want, Math.max(bal, 0));
      const low = bal - spend;
      const inc = useInflows && s.V && s.W ? inflow(s, bal, s.V[i][t], s.W[i][t]) : 0;
      bal = low + inc;
      hist.shift(); hist.push(spend);
      if (first === -1 && low < s.broke_line) first = t + 1;
      path[t + 1] = bal;
    }
    paths.push(path);
    firstBroke[i] = first;
  }
  return { paths, firstBroke, H: s.H, T };
}

export function madeIt(o: SimOut): number {
  let n = 0;
  for (const fb of o.firstBroke) if (fb === -1 || fb > o.H) n++;
  return n;
}

export function meanRunway(o: SimOut): number {
  let s = 0;
  for (const fb of o.firstBroke) s += fb === -1 ? o.T + 1 : fb;
  return s / o.firstBroke.length;
}

/** Largest extra spend today with P(broke before payday) <= tol, by bisection to `precision` rupees. */
export function safeToSpend(s: SimState, lat: Lattice, plans: SimPlan[], tol: number, precision = 10): {
  safeRupees: number; riskNow: number; nothingSafe: boolean;
} {
  const N = s.U.length;
  const risk = (x: number) => 1 - madeIt(rollout(s, lat, { plans, spendToday: x })) / N;
  const r0 = risk(0);
  const hi0 = Math.max(s.bal0 - s.broke_line, 0);
  if (r0 > tol) return { safeRupees: 0, riskNow: r0, nothingSafe: true };
  if (risk(hi0) <= tol) return { safeRupees: Math.floor(hi0 / precision) * precision, riskNow: r0, nothingSafe: false };
  let lo = 0, hi = hi0;
  for (let it = 0; it < 20 && hi - lo > precision; it++) {
    const mid = (lo + hi) / 2;
    if (risk(mid) <= tol) lo = mid; else hi = mid;
  }
  return { safeRupees: Math.floor(lo / precision) * precision, riskNow: r0, nothingSafe: false };
}

export function percentileBand(o: SimOut, H: number): { p10: number[]; p50: number[]; p90: number[] } {
  const p10: number[] = [], p50: number[] = [], p90: number[] = [];
  const col = new Float64Array(o.paths.length);
  for (let t = 0; t <= H; t++) {
    for (let i = 0; i < o.paths.length; i++) col[i] = o.paths[i][t];
    col.sort();
    const q = (p: number) => {
      const x = p * (col.length - 1); const lo = Math.floor(x); const hi = Math.ceil(x);
      return col[lo] + (col[hi] - col[lo]) * (x - lo);
    };
    p10.push(Math.round(q(0.1) * 100)); p50.push(Math.round(q(0.5) * 100)); p90.push(Math.round(q(0.9) * 100));
  }
  return { p10, p50, p90 };
}
