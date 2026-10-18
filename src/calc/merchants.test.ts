import { describe, expect, it } from "vitest";
import { MERCH } from "../data";
import { merchantsNeeded, travelSeconds } from "./merchants";

describe("merchantsNeeded", () => {
  it("rounds up to whole merchants", () => {
    expect(merchantsNeeded(2001, MERCH.Teutons.capacity)).toBe(3);
    expect(merchantsNeeded(1500, MERCH.Romans.capacity)).toBe(3);
    expect(merchantsNeeded(0, 750)).toBe(0);
  });

  it("is 0 when capacity is unknown", () => {
    expect(merchantsNeeded(1000, 0)).toBe(0);
  });
});

describe("travelSeconds", () => {
  it("is distance / (speed * server speed) hours", () => {
    expect(travelSeconds(24, MERCH.Gauls.speed, 1)).toBe(3600);
    expect(travelSeconds(12, 12, 2)).toBe(1800);
    expect(travelSeconds(1.5, 16, 1)).toBeCloseTo(337.5);
  });

  it("is 0 without a distance or speed", () => {
    expect(travelSeconds(0, 12, 1)).toBe(0);
    expect(travelSeconds(10, 0, 1)).toBe(0);
  });
});
