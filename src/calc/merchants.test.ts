import { describe, expect, it } from "vitest";
import { MERCH } from "../data";
import { mapDistance, merchantsNeeded, travelSeconds } from "./merchants";

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

describe("mapDistance", () => {
  it("is the straight-line distance in fields", () => {
    expect(mapDistance({ x: 12, y: 34 }, { x: 10, y: 33 })).toBeCloseTo(Math.sqrt(5));
    expect(mapDistance({ x: 0, y: 0 }, { x: 3, y: -4 })).toBe(5);
  });

  it("takes the short way around the map edge", () => {
    // 200 to -200 is 1 field apart on a 401-wide map.
    expect(mapDistance({ x: 200, y: 0 }, { x: -200, y: 0 })).toBe(1);
    expect(mapDistance({ x: 0, y: -195 }, { x: 0, y: 190 })).toBe(16);
  });
});
