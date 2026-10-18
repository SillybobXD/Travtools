import type { Res4 } from "../types";

/** Warehouse caps wood/clay/iron, granary caps crop. 0 or blank means unknown (Infinity). */
export function storageCaps(warehouse: number, granary: number): Res4 {
  return [warehouse || Infinity, warehouse || Infinity, warehouse || Infinity, granary || Infinity];
}

export interface PlanNeeds {
  haveTotal: number;
  needSum: number;
  /** Missing amount per resource without trading. */
  shortEach: Res4;
  shortSum: number;
  /** Every resource is already covered. */
  coveredDirect: boolean;
  /** Total resources cover the total need, so one NPC trade works. */
  coveredNpc: boolean;
  /** An NPC trade is both possible and needed. */
  useNpc: boolean;
}

export function planNeeds(have: Res4, need: Res4): PlanNeeds {
  const haveTotal = have.reduce((a, b) => a + b, 0);
  const needSum = need.reduce((a, b) => a + b, 0);
  const shortEach = need.map((v, i) => Math.max(0, v - have[i])) as Res4;
  const shortSum = shortEach.reduce((a, b) => a + b, 0);
  const coveredDirect = shortSum === 0;
  const coveredNpc = haveTotal >= needSum;
  return { haveTotal, needSum, shortEach, shortSum, coveredDirect, coveredNpc, useNpc: coveredNpc && !coveredDirect };
}

/**
 * Amounts to set in the NPC merchant: each resource gets what's needed, and the
 * leftover goes to `pref` first, then crop, wood, clay, iron, within storage caps.
 */
export function npcTargets(need: Res4, haveTotal: number, caps: Res4, pref: number): Res4 {
  const target = need.slice() as Res4;
  let left = haveTotal - need.reduce((a, b) => a + b, 0);
  for (const i of [pref, 3, 0, 1, 2].filter((v, k, a) => a.indexOf(v) === k)) {
    if (left <= 0) break;
    const room = caps[i] === Infinity ? left : Math.max(0, caps[i] - target[i]);
    const add = Math.min(room, left); target[i] += add; left -= add;
  }
  return target;
}
