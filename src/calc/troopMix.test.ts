import { describe, expect, it } from "vitest";
import type { Res4 } from "../types";
import { maxTroopMix, maxTroops, mixDuration, troopMixForTime, troopsForTime, trainingTime } from "./troops";

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

describe("troopMixForTime", () => {
  it("matches troopsForTime for a single row", () => {
    const r = rng(2);
    for (let k = 0; k < 5000; k++) {
      const per = trainingTime(Math.floor(r() * 9000), Math.floor(r() * 21), [1, 2, 3, 5, 10][Math.floor(r() * 5)], Math.floor(r() * 100));
      const secs = Math.floor(r() * 200000);
      expect(troopMixForTime([{ perUnit: per, weight: 1, group: "B" }], secs)).toEqual([troopsForTime(secs, per)]);
    }
  });

  it("splits a shared queue by ratio", () => {
    // Barracks: 2 × 100s + 1 × 200s = 400s per batch, 4000s → 10 batches.
    const rows = [{ perUnit: 100, weight: 2, group: "B" }, { perUnit: 200, weight: 1, group: "B" }];
    expect(troopMixForTime(rows, 4000)).toEqual([20, 10]);
  });

  it("runs different buildings in parallel", () => {
    const rows = [{ perUnit: 100, weight: 1, group: "B" }, { perUnit: 300, weight: 1, group: "S" }];
    expect(troopMixForTime(rows, 3000)).toEqual([30, 10]);
  });

  it("gives 0 for rows without a training time", () => {
    const rows = [{ perUnit: 0, weight: 1, group: "B" }, { perUnit: 100, weight: 1, group: "B" }];
    expect(troopMixForTime(rows, 1000)).toEqual([0, 10]);
  });
});

describe("mixDuration", () => {
  it("is the longest queue", () => {
    const rows = [{ perUnit: 100, weight: 1, group: "B" }, { perUnit: 50, weight: 1, group: "B" }, { perUnit: 300, weight: 1, group: "S" }];
    expect(mixDuration(rows, [10, 10, 4])).toBe(1500);
    expect(mixDuration(rows, [0, 0, 0])).toBe(0);
  });
});
