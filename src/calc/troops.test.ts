import { describe, expect, it } from "vitest";
import { UNITS } from "../data";
import type { Res4 } from "../types";
import { maxTroops, trainingTime, troopsForTime } from "./troops";

const unit = (tribe: string, name: string) => {
  const u = UNITS[tribe].find(u => u.name === name);
  if (!u) throw new Error(`No unit ${name}`);
  return u;
};
const NONE: Res4 = [0, 0, 0, 0];
const NO_CAPS: Res4 = [Infinity, Infinity, Infinity, Infinity];
const total = (r: Res4) => r.reduce((a, b) => a + b, 0);

describe("maxTroops", () => {
  it("Clubswinger with 2,373 / 6,723 / 6,243 / 9,933 → 101 units", () => {
    const have: Res4 = [2373, 6723, 6243, 9933];
    expect(maxTroops(total(have), NONE, unit("Teutons", "Clubswinger").cost, NO_CAPS).count).toBe(101);
  });

  it("Spearman with 1,156 / 1 / 1,155 / 19,513 → 64 units", () => {
    const have: Res4 = [1156, 1, 1155, 19513];
    expect(maxTroops(total(have), NONE, unit("Teutons", "Spearman").cost, NO_CAPS).count).toBe(64);
  });

  it("subtracts building costs first", () => {
    expect(maxTroops(1000, [100, 100, 100, 100], [50, 50, 50, 50], NO_CAPS).count).toBe(3);
  });

  it("never goes below zero", () => {
    expect(maxTroops(100, [500, 0, 0, 0], [10, 10, 10, 10], NO_CAPS).count).toBe(0);
  });

  it("is limited by storage and reports which resource", () => {
    // 1,000,000 total would allow 2,500 Clubswingers, but crop 40 each into a 4,000 granary allows 100.
    const r = maxTroops(1_000_000, NONE, [95, 75, 40, 40], [80_000, 80_000, 80_000, 4_000]);
    expect(r).toEqual({ count: 100, capLimited: 3 });
  });

  it("leaves capLimited at -1 when storage isn't the limit", () => {
    expect(maxTroops(1000, NONE, [25, 25, 25, 25], [80_000, 80_000, 80_000, 80_000])).toEqual({ count: 10, capLimited: -1 });
  });

  it("ignores a cap the buildings alone already exceed", () => {
    const r = maxTroops(100_000, [5_000, 0, 0, 0], [10, 10, 10, 10], [4_000, Infinity, Infinity, Infinity]);
    expect(r).toEqual({ count: 2_375, capLimited: -1 });
  });

  it("returns 0 for a unit with no cost", () => {
    expect(maxTroops(1000, NONE, NONE, NO_CAPS)).toEqual({ count: 0, capLimited: -1 });
  });
});

describe("trainingTime", () => {
  it("is the base time at level 1, 1× speed, no bonus", () => {
    expect(trainingTime(720, 1, 1, 0)).toBe(720);
  });

  it("drops 10% per building level", () => {
    expect(trainingTime(1000, 3, 1, 0)).toBeCloseTo(810);
  });

  it("divides by server speed and applies the bonus", () => {
    expect(trainingTime(1000, 1, 2, 25)).toBe(375);
  });

  it("treats level 0 or blank as level 1 and caps the bonus at 99%", () => {
    expect(trainingTime(1000, 0, 1, 0)).toBe(1000);
    expect(trainingTime(1000, 1, 1, 150)).toBeCloseTo(10);
  });
});

describe("troopsForTime", () => {
  it("counts units that finish in the time", () => {
    expect(troopsForTime(8 * 3600, 720)).toBe(40);
    expect(troopsForTime(1000, 300)).toBe(3);
  });

  it("is 0 when the per-unit time is unknown", () => {
    expect(troopsForTime(3600, 0)).toBe(0);
  });
});
