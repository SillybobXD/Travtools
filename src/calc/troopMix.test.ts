import { describe, expect, it } from "vitest";
import type { Res4 } from "../types";
import { maxTroopMix, maxTroopMixDirect, maxTroops, mixDuration, planTroops, type PlanRow } from "./troops";

const NONE: Res4 = [0, 0, 0, 0];
const NO_CAPS: Res4 = [Infinity, Infinity, Infinity, Infinity];
const CLUB: Res4 = [95, 75, 40, 40], SPEAR: Res4 = [145, 70, 85, 40];

/** Small seeded PRNG so the comparison runs are repeatable. */
function rng(seed: number) {
  return () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

describe("maxTroopMix", () => {
  it("matches maxTroops for a single row of weight 1", () => {
    const r = rng(1), ri = (n: number) => Math.floor(r() * n);
    for (let k = 0; k < 5000; k++) {
      const cost = [ri(2000), ri(2000), ri(2000), ri(2000)] as Res4;
      const other = [ri(40000), ri(40000), ri(40000), ri(40000)] as Res4;
      const caps = [0, 1, 2, 3].map(() => r() < 0.3 ? Infinity : ri(100000)) as Res4;
      const have = ri(400000);
      const old = maxTroops(have, other, cost, caps);
      expect(maxTroopMix([{ cost, weight: 1 }], have, other, caps)).toEqual({ counts: [old.count], capLimited: old.capLimited });
    }
  });

  it("keeps a 2:1 ratio", () => {
    // One batch = 2 clubswingers + 1 spearman = 500 + 340 = 840.
    expect(maxTroopMix([{ cost: CLUB, weight: 2 }, { cost: SPEAR, weight: 1 }], 8400, NONE, NO_CAPS).counts).toEqual([20, 10]);
  });

  it("rounds each row down for partial batches", () => {
    expect(maxTroopMix([{ cost: CLUB, weight: 2 }, { cost: SPEAR, weight: 1 }], 8400 + 839, NONE, NO_CAPS).counts).toEqual([21, 10]);
  });

  it("leaves weight-0 rows at zero", () => {
    expect(maxTroopMix([{ cost: CLUB, weight: 1 }, { cost: SPEAR, weight: 0 }], 2500, NONE, NO_CAPS).counts).toEqual([10, 0]);
  });

  it("applies storage caps across the whole mix", () => {
    // Crop per batch: 40 + 40 = 80. Granary 800 allows 10 batches.
    const r = maxTroopMix([{ cost: CLUB, weight: 1 }, { cost: SPEAR, weight: 1 }], 1_000_000, NONE, [Infinity, Infinity, Infinity, 800]);
    expect(r).toEqual({ counts: [10, 10], capLimited: 3 });
  });

  it("subtracts other costs first", () => {
    expect(maxTroopMix([{ cost: CLUB, weight: 1 }], 25272, [100, 100, 50, 0], NO_CAPS).counts).toEqual([100]);
  });
});

describe("maxTroopMix with a resource from the hero", () => {
  const NO_CROP = [true, true, true, false];

  it("doesn't count that resource against the total", () => {
    // Clubswinger without crop: 95 + 75 + 40 = 210.
    expect(maxTroopMix([{ cost: CLUB, weight: 1 }], 2100, NONE, NO_CAPS, NO_CROP).counts).toEqual([10]);
  });

  it("still applies the granary to it", () => {
    const r = maxTroopMix([{ cost: CLUB, weight: 1 }], 1_000_000, NONE, [Infinity, Infinity, Infinity, 400], NO_CROP);
    expect(r).toEqual({ counts: [10], capLimited: 3 });
  });

  it("ignores other costs in that resource", () => {
    expect(maxTroopMix([{ cost: CLUB, weight: 1 }], 2100, [0, 0, 0, 5000], NO_CAPS, NO_CROP).counts).toEqual([10]);
  });
});

describe("maxTroopMixDirect (without trading)", () => {
  it("is limited by the scarcest resource", () => {
    // 75 clay is only enough for one clubswinger.
    expect(maxTroopMixDirect([{ cost: CLUB, weight: 1 }], [1000, 75, 1000, 1000], NONE, NO_CAPS).counts).toEqual([1]);
  });

  it("subtracts other costs per resource", () => {
    expect(maxTroopMixDirect([{ cost: CLUB, weight: 1 }], [1000, 1000, 1000, 1000], [51, 0, 0, 600], NO_CAPS).counts).toEqual([9]);
  });

  it("lets a resource from the hero limit only through storage", () => {
    const r = maxTroopMixDirect([{ cost: CLUB, weight: 1 }], [1000, 75, 1000, 1000], NONE, [Infinity, 1500, Infinity, Infinity], [true, false, true, true]);
    expect(r).toEqual({ counts: [10], capLimited: -1 });
    const capped = maxTroopMixDirect([{ cost: CLUB, weight: 1 }], [1000, 75, 1000, 1000], NONE, [Infinity, 600, Infinity, Infinity], [true, false, true, true]);
    expect(capped).toEqual({ counts: [8], capLimited: 1 });
  });

  it("keeps the ratio", () => {
    expect(maxTroopMixDirect([{ cost: CLUB, weight: 2 }, { cost: SPEAR, weight: 1 }], [3350, 2200, 1650, 1200], NONE, NO_CAPS).counts).toEqual([20, 10]);
  });
});

const row = (p: Partial<PlanRow>): PlanRow => ({ mode: "max", cost: CLUB, weight: 1, count: 0, seconds: 0, perUnit: 0, ...p });
const even = (total: number): Res4 => [total / 4, total / 4, total / 4, total / 4];

describe("planTroops", () => {
  it("matches the single-mode results for one row", () => {
    expect(planTroops([row({})], [2373, 6723, 6243, 9933], NONE, NO_CAPS).counts).toEqual([101]);
    expect(planTroops([row({ mode: "count", count: 40 })], NONE, NONE, NO_CAPS).counts).toEqual([40]);
    expect(planTroops([row({ mode: "time", seconds: 8 * 3600, perUnit: 720 })], NONE, NONE, NO_CAPS).counts).toEqual([40]);
  });

  it("pays set numbers and timed troops first, then fills the max rows", () => {
    // 10 spearmen (3,400) + 1 hour of clubswingers at 720s (5 units, 1,250) leave 10,000 - 4,650 = 5,350 → 21 clubswingers.
    const r = planTroops([
      row({ mode: "count", cost: SPEAR, count: 10 }),
      row({ mode: "time", seconds: 3600, perUnit: 720 }),
      row({ mode: "max" }),
    ], even(10_000), NONE, NO_CAPS);
    expect(r.counts).toEqual([10, 5, 21]);
  });

  it("splits what is left between max rows by ratio", () => {
    const r = planTroops([row({ mode: "count", cost: SPEAR, count: 10 }), row({ weight: 2 }), row({ cost: SPEAR, weight: 1 })], even(3400 + 8400), NONE, NO_CAPS);
    expect(r.counts).toEqual([10, 20, 10]);
  });

  it("gives max rows nothing when fixed rows already use everything", () => {
    expect(planTroops([row({ mode: "count", count: 100 }), row({})], even(1000), NONE, NO_CAPS).counts).toEqual([100, 0]);
  });

  it("counts fixed rows against storage before the max rows", () => {
    // Granary 1,000: 20 fixed clubswingers use 800 crop, leaving room for 5 more.
    const r = planTroops([row({ mode: "count", count: 20 }), row({})], even(1_000_000), NONE, [Infinity, Infinity, Infinity, 1000]);
    expect(r).toEqual({ counts: [20, 5], capLimited: 3 });
  });

  it("can plan max rows without trading", () => {
    const have: Res4 = [1000, 75, 1000, 1000];
    expect(planTroops([row({})], have, NONE, NO_CAPS).counts).toEqual([12]);
    expect(planTroops([row({})], have, NONE, NO_CAPS, [true, true, true, true], false).counts).toEqual([1]);
  });

  it("works with no rows", () => {
    expect(planTroops([], NONE, NONE, NO_CAPS)).toEqual({ counts: [], capLimited: -1 });
  });
});

describe("mixDuration", () => {
  it("is the longest queue", () => {
    const rows = [{ perUnit: 100, weight: 1, group: "B" }, { perUnit: 50, weight: 1, group: "B" }, { perUnit: 300, weight: 1, group: "S" }];
    expect(mixDuration(rows, [10, 10, 4])).toBe(1500);
    expect(mixDuration(rows, [0, 0, 0])).toBe(0);
  });
});
