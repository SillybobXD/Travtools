import type { Building, Res4 } from "../types";
import { toNum } from "./format";

export const round5 = (v: number): number => Math.round(v / 5) * 5;

/** Cost of upgrading to `level`: round5(base * k^(level-1)) per resource. */
export function levelCost(b: Building, level: number): Res4 {
  return b.cost.map(c => c === 0 ? 0 : round5(c * Math.pow(b.k, level - 1))) as Res4;
}

/** Total and single-level peak cost for upgrading from `from` to `to`. */
export function rangeCost(b: Building, from: number, to: number): { tot: Res4; peak: Res4 } {
  const tot: Res4 = [0, 0, 0, 0], peak: Res4 = [0, 0, 0, 0];
  for (let L = from + 1; L <= to; L++) {
    const c = levelCost(b, L);
    for (let i = 0; i < 4; i++) { tot[i] += c[i]; peak[i] = Math.max(peak[i], c[i]); }
  }
  return { tot, peak };
}

/** A building row as the user typed it; levels and qty may be raw strings. */
export interface BuildRow {
  b: number;
  from: string | number;
  to: string | number;
  qty: string | number;
}

export type BuildRowResult =
  | { valid: false; from: number; max: number }
  | { valid: true; from: number; max: number; cost: Res4 };

export interface BuildTotals {
  rows: BuildRowResult[];
  /** Sum of all rows, times quantity. */
  tot: Res4;
  /** Most expensive single level across all rows, per resource. */
  peak: Res4;
  sum: number;
}

/** Levels are clamped to the building's max; qty defaults to 1. Rows with target ≤ current are skipped. */
export function buildingTotals(rows: BuildRow[], buildings: Building[]): BuildTotals {
  const tot: Res4 = [0, 0, 0, 0], peak: Res4 = [0, 0, 0, 0];
  const results = rows.map((r): BuildRowResult => {
    const b = buildings[r.b], max = b.maxLevel;
    const from = Math.min(toNum(r.from), max), to = Math.min(toNum(r.to), max), qty = Math.max(1, toNum(r.qty) || 1);
    if (to <= from) return { valid: false, from, max };
    const range = rangeCost(b, from, to);
    for (let k = 0; k < 4; k++) { tot[k] += range.tot[k] * qty; peak[k] = Math.max(peak[k], range.peak[k]); }
    return { valid: true, from, max, cost: range.tot.map(v => v * qty) as Res4 };
  });
  return { rows: results, tot, peak, sum: tot.reduce((a, b) => a + b, 0) };
}
