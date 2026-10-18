import { describe, expect, it } from "vitest";
import { BUILDINGS } from "../data";
import { buildingTotals, levelCost, rangeCost, round5 } from "./buildings";

const byName = (name: string) => {
  const i = BUILDINGS.findIndex(b => b.name === name);
  if (i < 0) throw new Error(`No building ${name}`);
  return i;
};

describe("round5", () => {
  it("rounds to the nearest 5", () => {
    expect(round5(166.4)).toBe(165);
    expect(round5(167.5)).toBe(170);
    expect(round5(9092.66)).toBe(9095);
  });
});

describe("levelCost", () => {
  it("Warehouse level 2 costs 165 / 205 / 115 / 50", () => {
    expect(levelCost(BUILDINGS[byName("Warehouse")], 2)).toEqual([165, 205, 115, 50]);
  });

  it("Cropland level 10 costs 7,070 / 9,095 / 7,070 / 2,020", () => {
    expect(levelCost(BUILDINGS[byName("Cropland")], 10)).toEqual([7070, 9095, 7070, 2020]);
  });

  it("level 1 is the base cost", () => {
    expect(levelCost(BUILDINGS[byName("Woodcutter")], 1)).toEqual([40, 100, 50, 60]);
  });

  it("keeps zero-cost resources at zero", () => {
    expect(levelCost(BUILDINGS[byName("Palisade")], 5)[2]).toBe(0);
  });
});

describe("rangeCost", () => {
  it("sums levels from+1 through to and tracks the peak level", () => {
    const wh = BUILDINGS[byName("Warehouse")];
    const { tot, peak } = rangeCost(wh, 0, 2);
    expect(tot).toEqual([130 + 165, 160 + 205, 90 + 115, 40 + 50]);
    expect(peak).toEqual([165, 205, 115, 50]);
  });

  it("is empty when the target is not above the current level", () => {
    expect(rangeCost(BUILDINGS[0], 5, 5)).toEqual({ tot: [0, 0, 0, 0], peak: [0, 0, 0, 0] });
  });
});

describe("buildingTotals", () => {
  const cropland = byName("Cropland");

  it("multiplies by quantity but keeps the per-level peak", () => {
    const one = rangeCost(BUILDINGS[cropland], 5, 7);
    const r = buildingTotals([{ b: cropland, from: "5", to: "7", qty: "6" }], BUILDINGS);
    expect(r.tot).toEqual(one.tot.map(v => v * 6));
    expect(r.peak).toEqual(one.peak);
    expect(r.sum).toBe(one.tot.reduce((a, b) => a + b, 0) * 6);
    expect(r.rows[0]).toEqual({ valid: true, from: 5, max: 20, cost: r.tot });
  });

  it("treats blank or zero quantity as 1", () => {
    const a = buildingTotals([{ b: cropland, from: 0, to: 3, qty: "" }], BUILDINGS);
    const b = buildingTotals([{ b: cropland, from: 0, to: 3, qty: 1 }], BUILDINGS);
    expect(a.tot).toEqual(b.tot);
  });

  it("clamps levels to the building's max", () => {
    const cranny = byName("Cranny");
    const r = buildingTotals([{ b: cranny, from: 8, to: 15, qty: 1 }], BUILDINGS);
    expect(r.tot).toEqual(rangeCost(BUILDINGS[cranny], 8, 10).tot);
  });

  it("marks rows with target ≤ current as invalid and skips them", () => {
    const r = buildingTotals([{ b: cropland, from: 7, to: 7, qty: 1 }], BUILDINGS);
    expect(r.rows[0]).toEqual({ valid: false, from: 7, max: 20 });
    expect(r.sum).toBe(0);
  });

  it("adds several rows together", () => {
    const rows = [{ b: cropland, from: 0, to: 2, qty: 1 }, { b: byName("Warehouse"), from: 1, to: 2, qty: 1 }];
    expect(buildingTotals(rows, BUILDINGS).tot).toEqual([70 + 115 + 165, 90 + 150 + 205, 70 + 115 + 115, 20 + 35 + 50]);
  });
});
