import type { Res4 } from "../types";

/**
 * Seconds to train one unit: base * 0.9^(level-1) / speed * (1 - bonus%).
 * Level is at least 1; bonus is capped at 99%.
 */
export function trainingTime(base: number, level: number, serverSpeed: number, bonusPct: number): number {
  const lvl = Math.max(1, level || 1), bonus = Math.min(99, bonusPct);
  return base * Math.pow(0.9, lvl - 1) / serverSpeed * (1 - bonus / 100);
}

export interface MaxTroops {
  count: number;
  /** Resource index whose storage cap lowered the count, or -1. */
  capLimited: number;
}

/**
 * Most units affordable from the village's total resources (assuming an NPC trade)
 * after building costs, also limited so each resource fits in storage.
 * `caps` uses Infinity for unknown capacity. A cap is ignored for a resource
 * whose building cost alone already exceeds it.
 */
export function maxTroops(haveTotal: number, buildingCost: Res4, unitCost: Res4, caps: Res4): MaxTroops {
  const cSum = unitCost.reduce((a, b) => a + b, 0);
  if (cSum <= 0) return { count: 0, capLimited: -1 };
  const bSum = buildingCost.reduce((a, b) => a + b, 0);
  let n = Math.max(0, Math.floor((haveTotal - bSum) / cSum)), capLimited = -1;
  for (let i = 0; i < 4; i++) {
    if (unitCost[i] > 0 && caps[i] !== Infinity && buildingCost[i] <= caps[i]) {
      const m = Math.floor((caps[i] - buildingCost[i]) / unitCost[i]);
      if (m < n) { n = m; capLimited = i; }
    }
  }
  return { count: n, capLimited };
}

/** Units that finish training within `seconds`. */
export function troopsForTime(seconds: number, perUnit: number): number {
  return perUnit > 0 ? Math.floor(seconds / perUnit) : 0;
}

/** One troop type in a mix. `weight` is its share, e.g. 2 and 1 for a 2:1 mix. */
export interface MixRow {
  cost: Res4;
  weight: number;
}

export interface MixResult {
  /** Units per row, in row order. */
  counts: number[];
  /** Resource index whose storage cap lowered the result, or -1. */
  capLimited: number;
}

/** Units per row when the limit is `num / den` batches: floor(weight * num / den), never negative. */
const countsAt = (weights: number[], num: number, den: number) => weights.map(w => Math.max(0, Math.floor(w * num / den)));
const sumOf = (a: number[]) => a.reduce((s, v) => s + v, 0);
const ALL = [true, true, true, true];

/**
 * Largest troop mix that keeps the rows' ratio, from total resources after
 * other costs, limited per resource by storage like `maxTroops`.
 * `tradable` marks the resources the NPC trade works with; the others come from
 * the hero, so only storage limits them, and `haveTotal` counts only tradable ones.
 * With a single row of weight 1 and everything tradable it gives exactly `maxTroops`.
 */
export function maxTroopMix(rows: MixRow[], haveTotal: number, otherCost: Res4, caps: Res4, tradable: boolean[] = ALL): MixResult {
  const weights = rows.map(r => r.weight), zero = rows.map(() => 0);
  if (sumOf(rows.map(r => r.weight * sumOf(r.cost))) <= 0) return { counts: zero, capLimited: -1 };
  const perBatch = sumOf(rows.map(r => r.weight * sumOf(r.cost.filter((_, i) => tradable[i]))));
  let counts: number[] | null = null, n = Infinity, capLimited = -1;
  if (perBatch > 0) {
    counts = countsAt(weights, haveTotal - sumOf(otherCost.filter((_, i) => tradable[i])), perBatch);
    n = sumOf(counts);
  }
  for (let i = 0; i < 4; i++) {
    const perRes = sumOf(rows.map(r => r.weight * r.cost[i]));
    if (perRes > 0 && caps[i] !== Infinity && otherCost[i] <= caps[i]) {
      const c = countsAt(weights, caps[i] - otherCost[i], perRes), m = sumOf(c);
      if (m < n) { n = m; counts = c; capLimited = i; }
    }
  }
  return { counts: counts ?? zero, capLimited };
}

export type TroopMode = "max" | "count" | "time";

export interface PlanRow {
  mode: TroopMode;
  cost: Res4;
  /** Share among the "max" rows. */
  weight: number;
  /** Units for "count" rows. */
  count: number;
  /** Training time to fill for "time" rows. */
  seconds: number;
  /** Seconds per unit; 0 = unknown. */
  perUnit: number;
}

/**
 * Units per row when each row has its own mode. "count" and "time" rows are fixed
 * and paid first, together with `otherCost`; the "max" rows share what is left by weight.
 */
export function planTroops(rows: PlanRow[], haveTotal: number, otherCost: Res4, caps: Res4, tradable: boolean[] = ALL): MixResult {
  const counts = rows.map(r => r.mode === "count" ? r.count : r.mode === "time" ? troopsForTime(r.seconds, r.perUnit) : 0);
  const fixed = [0, 1, 2, 3].map(i => otherCost[i] + sumOf(rows.map((r, k) => r.cost[i] * counts[k]))) as Res4;
  const maxIdx = rows.flatMap((r, k) => r.mode === "max" ? [k] : []);
  if (!maxIdx.length) return { counts, capLimited: -1 };
  const mix = maxTroopMix(maxIdx.map(k => ({ cost: rows[k].cost, weight: rows[k].weight })), haveTotal, fixed, caps, tradable);
  maxIdx.forEach((k, j) => counts[k] = mix.counts[j]);
  return { counts, capLimited: mix.capLimited };
}

export interface TimedRow {
  /** Seconds per unit; 0 = unknown. */
  perUnit: number;
  /** Rows with the same group share one training queue (e.g. the barracks). */
  group: string;
}

/** Time until the slowest queue finishes, given units per row. Each group trains in parallel. */
export function mixDuration(rows: TimedRow[], counts: number[]): number {
  const perGroup = new Map<string, number>();
  rows.forEach((r, i) => perGroup.set(r.group, (perGroup.get(r.group) ?? 0) + r.perUnit * counts[i]));
  return Math.max(0, ...perGroup.values());
}
