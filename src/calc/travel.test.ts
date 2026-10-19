import { describe, expect, it } from "vitest";
import { armyTravelSeconds, slowestSpeed } from "./travel";

describe("slowestSpeed", () => {
  it("is the slowest unit actually sent", () => {
    // Teutons: Clubswinger 7, Axeman 6, Teutonic Knight 9
    expect(slowestSpeed("Teutons", [10, 0, 5, 0, 0, 3])).toBe(6);
    expect(slowestSpeed("Teutons", [0, 0, 0, 0, 0, 3])).toBe(9);
    expect(slowestSpeed("Teutons", [])).toBe(0);
  });
});

describe("armyTravelSeconds", () => {
  it("is distance / (slowest speed * server speed) hours", () => {
    expect(armyTravelSeconds("Teutons", [10, 0, 5], 12, 1)).toBe(7200);   // 12 fields at 6/h
    expect(armyTravelSeconds("Teutons", [10], 14, 2)).toBe(3600);         // 14 fields at 7/h × 2
    expect(armyTravelSeconds("Teutons", [], 14, 1)).toBe(0);
    expect(armyTravelSeconds("Teutons", [10], 0, 1)).toBe(0);
  });
});
