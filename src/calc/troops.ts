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
