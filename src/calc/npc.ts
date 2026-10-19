import type { Res4 } from "../types";

/** Warehouse caps wood/clay/iron, granary caps crop. 0 or blank means unknown (Infinity). */
export function storageCaps(warehouse: number, granary: number): Res4 {
  return [warehouse || Infinity, warehouse || Infinity, warehouse || Infinity, granary || Infinity];
}

export interface PlanNeeds {
  /** Everything the village has: all of it can go into the NPC trade. */
  haveTotal: number;
  /** Need of the resources the trade may convert into. */
  needSum: number;
  /** Need of all four resources. */
  needAll: number;
  /** Missing amount per resource without trading; 0 for resources claimed from the hero. */
  shortEach: Res4;
  shortSum: number;
  /** Missing amount per resource from the village alone, nothing from the hero: what to send without trading. */
  villageShort: Res4;
  villageShortSum: number;
  /** What to claim from the hero per resource. */
  heroTake: Res4;
  heroSum: number;
  /** Every resource the trade may convert into is already covered. */
  coveredDirect: boolean;
  /** The village's total covers the need of the other resources, so one NPC trade works. */
  coveredNpc: boolean;
  /** An NPC trade is both possible and needed. */
  useNpc: boolean;
}

const ALL = [true, true, true, true];

/**
 * `convert[i]` false means "do not convert into resource i": the trade turns all of it into
 * the other resources and its need is claimed from the hero instead. When no trade is needed
 * only its shortfall is claimed.
 */
export function planNeeds(have: Res4, need: Res4, convert: boolean[] = ALL): PlanNeeds {
  const haveTotal = have.reduce((a, b) => a + b, 0);
  const needSum = need.reduce((a, b, i) => a + (convert[i] ? b : 0), 0);
  const shortEach = need.map((v, i) => convert[i] ? Math.max(0, v - have[i]) : 0) as Res4;
  const shortSum = shortEach.reduce((a, b) => a + b, 0);
  const villageShort = need.map((v, i) => Math.max(0, v - have[i])) as Res4;
  const coveredDirect = shortSum === 0;
  const coveredNpc = haveTotal >= needSum;
  const useNpc = coveredNpc && !coveredDirect;
  // Any plan with a trade (now, or after sending) trades all of it away, so its whole need is claimed.
  const heroTake = need.map((v, i) => convert[i] ? 0 : coveredDirect ? Math.max(0, v - have[i]) : v) as Res4;
  return {
    haveTotal, needSum, needAll: need.reduce((a, b) => a + b, 0), shortEach, shortSum,
    villageShort, villageShortSum: villageShort.reduce((a, b) => a + b, 0),
    heroTake, heroSum: heroTake.reduce((a, b) => a + b, 0),
    coveredDirect, coveredNpc, useNpc,
  };
}

/**
 * Amounts to set in the NPC merchant: each resource gets what's needed, and the leftover goes
 * to `pref` first, then crop, wood, clay, iron, within storage caps. Resources the trade may
 * not convert into are set to 0. `haveTotal` is everything the village has.
 */
export function npcTargets(need: Res4, haveTotal: number, caps: Res4, pref: number, convert: boolean[] = ALL): Res4 {
  const target = need.map((v, i) => convert[i] ? v : 0) as Res4;
  let left = haveTotal - target.reduce((a, b) => a + b, 0);
  for (const i of [pref, 3, 0, 1, 2].filter((v, k, a) => a.indexOf(v) === k && convert[v])) {
    if (left <= 0) break;
    const room = caps[i] === Infinity ? left : Math.max(0, caps[i] - target[i]);
    const add = Math.min(room, left); target[i] += add; left -= add;
  }
  return target;
}
