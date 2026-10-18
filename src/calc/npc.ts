import type { Res4 } from "../types";

/** Warehouse caps wood/clay/iron, granary caps crop. 0 or blank means unknown (Infinity). */
export function storageCaps(warehouse: number, granary: number): Res4 {
  return [warehouse || Infinity, warehouse || Infinity, warehouse || Infinity, granary || Infinity];
}

export interface PlanNeeds {
  /** Total of the tradable resources. */
  haveTotal: number;
  /** Need of the tradable resources. */
  needSum: number;
  /** Need of all four resources, hero ones included. */
  needAll: number;
  /** Missing amount per tradable resource without trading; 0 for hero resources. */
  shortEach: Res4;
  shortSum: number;
  /** What to take from the hero per resource. */
  heroTake: Res4;
  heroSum: number;
  /** Every tradable resource is already covered. */
  coveredDirect: boolean;
  /** Tradable resources cover the tradable need, so one NPC trade works. */
  coveredNpc: boolean;
  /** An NPC trade is both possible and needed. */
  useNpc: boolean;
}

const ALL = [true, true, true, true];

/** `tradable[i]` false means resource i comes from the hero and is left out of the NPC trade. */
export function planNeeds(have: Res4, need: Res4, tradable: boolean[] = ALL): PlanNeeds {
  const sumT = (r: Res4) => r.reduce((a, b, i) => a + (tradable[i] ? b : 0), 0);
  const haveTotal = sumT(have), needSum = sumT(need);
  const shortEach = need.map((v, i) => tradable[i] ? Math.max(0, v - have[i]) : 0) as Res4;
  const heroTake = need.map((v, i) => tradable[i] ? 0 : Math.max(0, v - have[i])) as Res4;
  const shortSum = shortEach.reduce((a, b) => a + b, 0);
  const coveredDirect = shortSum === 0;
  const coveredNpc = haveTotal >= needSum;
  return {
    haveTotal, needSum, needAll: need.reduce((a, b) => a + b, 0), shortEach, shortSum,
    heroTake, heroSum: heroTake.reduce((a, b) => a + b, 0),
    coveredDirect, coveredNpc, useNpc: coveredNpc && !coveredDirect,
  };
}

/**
 * Amounts to set in the NPC merchant: each tradable resource gets what's needed, and the
 * leftover goes to `pref` first, then crop, wood, clay, iron, within storage caps.
 * `haveTotal` is the total of the tradable resources. Hero resources keep what the village has.
 */
export function npcTargets(need: Res4, haveTotal: number, caps: Res4, pref: number, tradable: boolean[] = ALL, have?: Res4): Res4 {
  const target = need.map((v, i) => tradable[i] ? v : have ? have[i] : v) as Res4;
  let left = haveTotal - need.reduce((a, b, i) => a + (tradable[i] ? b : 0), 0);
  for (const i of [pref, 3, 0, 1, 2].filter((v, k, a) => a.indexOf(v) === k && tradable[v])) {
    if (left <= 0) break;
    const room = caps[i] === Infinity ? left : Math.max(0, caps[i] - target[i]);
    const add = Math.min(room, left); target[i] += add; left -= add;
  }
  return target;
}
