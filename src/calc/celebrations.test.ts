import { describe, expect, it } from "vitest";
import { CELEBRATIONS } from "../data";
import { celebrationCost } from "./celebrations";

describe("celebrationCost", () => {
  it("multiplies each type by its count", () => {
    const { tot } = celebrationCost(CELEBRATIONS, [2, 1]);
    expect(tot).toEqual([2 * 6400 + 29700, 2 * 6650 + 33250, 2 * 5940 + 32000, 2 * 1340 + 6700]);
  });

  it("reports the most expensive single celebration as the peak", () => {
    expect(celebrationCost(CELEBRATIONS, [3, 0]).peak).toEqual([6400, 6650, 5940, 1340]);
    expect(celebrationCost(CELEBRATIONS, [3, 1]).peak).toEqual([29700, 33250, 32000, 6700]);
  });

  it("is zero with no celebrations", () => {
    expect(celebrationCost(CELEBRATIONS, [0, 0])).toEqual({ tot: [0, 0, 0, 0], peak: [0, 0, 0, 0] });
  });
});
