import { describe, expect, it } from "vitest";
import { CULTURE } from "../data";
import { celebrationCp, celebrationSeconds, cpForecast, cpPerDay, DAY, expansionPlan, slotLevel, slotsAt } from "./culture";

const H = 3600;

describe("cpPerDay", () => {
  it("adds the alliance bonus on villages and hero, rounded down, as the Residence tab shows", () => {
    // Active village 363 + other villages 896 + hero 100, alliance bonus +4% = 54, total 1,413.
    expect(cpPerDay(1259, 100, 4)).toBe(1413);
    expect(cpPerDay(1259, 0, 0)).toBe(1259);
  });
});

describe("celebrationCp", () => {
  const [small, great] = CULTURE.celebrations;
  it("gives at most the village's or the account's CP per day", () => {
    expect(celebrationCp(small, 564, 1413)).toBe(500);
    expect(celebrationCp(small, 363, 1413)).toBe(363);
    expect(celebrationCp(great, 363, 1413)).toBe(1413);
    expect(celebrationCp(great, 363, 5000)).toBe(2000);
    expect(celebrationCp(small, 0, 0)).toBe(500);
  });
});

describe("cpForecast", () => {
  it("matches the game's estimate from production alone", () => {
    // Read at 13:03:41 with 35,998 of 39,000 and 1,413 per day; the game says 16:01 two days later (±5 minutes).
    const f = cpForecast(35998, 39000, 1413, []);
    const game = (2 * 24 + 16 - 13) * H + (1 - 3) * 60 - 41;
    expect(Math.abs(f.seconds - game)).toBeLessThan(5 * 60);
    expect(f.fromProduction).toBeCloseTo(3002);
  });

  it("is 0 when the CP are already enough, Infinity when nothing adds any", () => {
    expect(cpForecast(500, 400, 100, []).seconds).toBe(0);
    expect(cpForecast(0, 400, 0, []).seconds).toBe(Infinity);
  });

  it("jumps at each event and skips past and late ones", () => {
    const events = [
      { at: 10 * H, cp: 500, label: "small" },
      { at: -1, cp: 9999, label: "past" },
      { at: 20 * H, cp: 363, label: "small 2" },
      { at: 100 * H, cp: 9999, label: "too late" },
    ];
    // 2,400 per day = 100 per hour. Need 3,002: 10 h → 1,000 + 500, 20 h → 2,500 + 363, then 139 more → 21.39 h.
    const f = cpForecast(0, 3002, 2400, events);
    expect(f.seconds).toBeCloseTo(21.39 * H);
    expect(f.events.map(e => e.label)).toEqual(["small", "small 2"]);
    expect(f.fromEvents).toBe(863);
    expect(f.fromProduction + f.fromEvents).toBeCloseTo(3002);
  });

  it("stops at an event that reaches the need", () => {
    const f = cpForecast(0, 1000, 2400, [{ at: 5 * H, cp: 600, label: "artwork" }]);
    expect(f.seconds).toBe(5 * H);
  });

  it("repeats the daily quest reward", () => {
    // 400 every 4 days from day 1, no production: 1,000 needs three rewards, at days 1, 5 and 9.
    const quest = { first: DAY, every: 4 * DAY, cp: 400, label: "quest" };
    expect(cpForecast(0, 1000, 0, [], [quest]).seconds).toBe(9 * DAY);
    // With production the first reward helps: 3,002 at 1,413 per day, 400 at day 1.
    const f = cpForecast(35998, 39000, 1413, [], [quest]);
    expect(f.seconds).toBeCloseTo((3002 - 400) / 1413 * DAY);
    expect(f.events).toHaveLength(1);
  });
});

describe("celebrations back to back", () => {
  const [small, great] = CULTURE.celebrations, f = CULTURE.townHallFactor;
  it("last 24 h (small) and 60 h (great) at Town Hall 1, shorter by 0.964 per level and by server speed", () => {
    expect(celebrationSeconds(small, 1, 1, f)).toBe(24 * H);
    expect(celebrationSeconds(great, 1, 1, f)).toBe(60 * H);
    expect(celebrationSeconds(small, 10, 1, f)).toBeCloseTo(24 * H * 0.964 ** 9);
    expect(celebrationSeconds(small, 20, 3, f)).toBeCloseTo(24 * H * 0.964 ** 19 / 3);
    expect(celebrationSeconds(small, 0, 0, f)).toBe(24 * H);
  });

  it("count every celebration that ends before the CP are there", () => {
    // Need 3,002 at 1,413 per day. Village A: 500 every 5 h from 16 h; village C: 363 every 5 h from 22 h.
    const reps = [
      { first: 16 * H, every: 5 * H, cp: 500, label: "A" },
      { first: 22 * H, every: 5 * H, cp: 363, label: "C" },
    ];
    const r = cpForecast(35998, 39000, 1413, [], reps);
    // Production gives 942 by 16 h: +500 at 16 h, +294 by 21 h: +500, +59 by 22 h: +363 → 38,656; 26 h: +500 → enough.
    expect(r.seconds).toBe(26 * H);
    expect(r.events.map(e => e.label)).toEqual(["A", "A", "C", "A"]);
    expect(r.fromEvents).toBe(1863);
  });

  it("several repeats alone reach the need without production", () => {
    const reps = [{ first: 0, every: 10 * H, cp: 500, label: "A" }, { first: 5 * H, every: 10 * H, cp: 500, label: "B" }];
    expect(cpForecast(0, 2000, 0, [], reps).seconds).toBe(15 * H);
  });
});

describe("slots", () => {
  it("come at Residence 10 and 20, Palace 10, 15 and 20", () => {
    expect([9, 10, 19, 20].map(l => slotsAt("Residence", l))).toEqual([0, 1, 1, 2]);
    expect([10, 15, 20].map(l => slotsAt("Palace", l))).toEqual([1, 2, 3]);
    expect(slotLevel("Residence", 0)).toBe(10);
    expect(slotLevel("Residence", 1)).toBe(20);
    expect(slotLevel("Residence", 2)).toBeNull();
    expect(slotLevel("Palace", 1)).toBe(15);
  });
});

describe("expansionPlan", () => {
  it("plans backward from the CP time", () => {
    const p = expansionPlan(50 * H, 10 * H, 4 * H, 3);
    expect(p).toEqual({ cpAt: 50 * H, soonest: 22 * H, readyAt: 50 * H, settlersStart: 38 * H, buildStart: 28 * H, late: false });
  });

  it("is late when building and training take longer than the CP", () => {
    const p = expansionPlan(10 * H, 10 * H, 4 * H, 3);
    expect(p.late).toBe(true);
    expect(p.readyAt).toBe(22 * H);
    expect(p.buildStart).toBe(0);
  });
});
