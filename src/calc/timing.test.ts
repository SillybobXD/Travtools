import { describe, expect, it } from "vitest";
import type { Res4 } from "../types";
import { timeToAffordDirect, timeToAffordTrade, timeToEmpty, timeToFull } from "./timing";

const NO_CAPS: Res4 = [Infinity, Infinity, Infinity, Infinity];
const H = 3600;

describe("timeToAffordDirect", () => {
  it("is 0 when the village already has everything", () => {
    expect(timeToAffordDirect([100, 100, 100, 100], [100, 50, 0, 100], [10, 10, 10, 10], NO_CAPS)).toBe(0);
  });

  it("waits for the slowest resource", () => {
    // Wood needs 100 more at 50/h (2 h); clay 300 more at 100/h (3 h).
    expect(timeToAffordDirect([0, 0, 0, 0], [100, 300, 0, 0], [50, 100, 10, 10], NO_CAPS)).toBe(3 * H);
  });

  it("is never when a missing resource isn't produced or doesn't fit in storage", () => {
    expect(timeToAffordDirect([0, 0, 0, 0], [100, 0, 0, 0], [0, 10, 10, 10], NO_CAPS)).toBe(Infinity);
    expect(timeToAffordDirect([0, 0, 0, 0], [100, 0, 0, 0], [10, 10, 10, 10], [80, 80, 80, 80])).toBe(Infinity);
  });

  it("doesn't wait for resources claimed from the hero", () => {
    expect(timeToAffordDirect([0, 0, 0, 0], [100, 0, 0, 900], [50, 0, 0, -10], NO_CAPS, [true, true, true, false])).toBe(2 * H);
  });
});

describe("timeToAffordTrade", () => {
  it("is 0 when the total already covers the need", () => {
    expect(timeToAffordTrade([400, 0, 0, 0], [100, 100, 100, 100], [0, 0, 0, 0], NO_CAPS)).toBe(0);
  });

  it("uses the total production", () => {
    // 400 short, 4 × 50 = 200/h → 2 h.
    expect(timeToAffordTrade([0, 0, 0, 0], [100, 100, 100, 100], [50, 50, 50, 50], NO_CAPS)).toBe(2 * H);
  });

  it("stops counting a resource once its storage is full", () => {
    // Wood fills its 100 cap after 1 h; then only clay adds 100/h. Need 400: 200 after 1 h, then 2 h more.
    expect(timeToAffordTrade([0, 0, 0, 0], [400, 0, 0, 0], [100, 100, 0, 0], [100, 1000, 1000, 1000])).toBeCloseTo(3 * H);
  });

  it("counts negative crop until it runs out", () => {
    // Wood +200/h, crop −100/h from 100: total 100 + 100/h for 1 h, then +200/h. Need 500: 200 at 1 h, then 1.5 h more.
    expect(timeToAffordTrade([0, 0, 0, 100], [500, 0, 0, 0], [200, 0, 0, -100], NO_CAPS)).toBeCloseTo(2.5 * H);
  });

  it("is never when storage can't hold enough in total", () => {
    expect(timeToAffordTrade([0, 0, 0, 0], [500, 500, 500, 500], [100, 100, 100, 100], [400, 400, 400, 400])).toBe(Infinity);
  });

  it("leaves resources claimed from the hero out of the need but trades what the village has of them", () => {
    // Need 300 of wood/clay/iron; crop 900 comes from the hero. Village has 200 crop to trade, +50/h wood → 2 h.
    expect(timeToAffordTrade([0, 0, 0, 200], [100, 100, 100, 900], [50, 0, 0, 0], NO_CAPS, [true, true, true, false])).toBe(2 * H);
  });
});

describe("timeToFull and timeToEmpty", () => {
  it("gives the time until each storage is full", () => {
    expect(timeToFull([500, 1000, 0, 100], [100, 50, 0, -10], [1000, 1000, 1000, 2000])).toEqual([5 * H, 0, Infinity, Infinity]);
  });

  it("gives the time until negative crop runs out", () => {
    expect(timeToEmpty(300, -100)).toBe(3 * H);
    expect(timeToEmpty(300, 100)).toBe(Infinity);
  });
});
