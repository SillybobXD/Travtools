import { describe, expect, it } from "vitest";
import { BUILDINGS, CAPACITY, CELEBRATIONS, MERCH, UNITS, WALLS } from ".";

const isRes4 = (r: unknown) => Array.isArray(r) && r.length === 4 && r.every(v => Number.isInteger(v) && v >= 0);

describe("data files", () => {
  it("every tribe has units and a merchant", () => {
    expect(Object.keys(UNITS).sort()).toEqual(Object.keys(MERCH).sort());
    expect(Object.keys(UNITS).sort()).toEqual(Object.keys(WALLS).sort());
  });

  it.each(Object.entries(UNITS))("%s units are well-formed", (_, units) => {
    expect(units.length).toBeGreaterThan(0);
    for (const u of units) {
      expect(u.name).toBeTruthy();
      expect(isRes4(u.cost), u.name).toBe(true);
      expect(u.upkeep).toBeGreaterThan(0);
      expect(u.time).toBeGreaterThanOrEqual(0);
      expect(["B", "S", "W", "R"]).toContain(u.building);
      for (const v of [u.att, u.defInf, u.defCav, u.carry]) expect(Number.isInteger(v) && v >= 0, u.name).toBe(true);
      expect(u.speed, u.name).toBeGreaterThan(0);
      expect(["inf", "cav", "scout", "siege", "admin"]).toContain(u.kind);
    }
  });

  it.each(Object.entries(UNITS))("%s have one scout, two siege units, a chief and a settler", (_, units) => {
    const count = (k: string) => units.filter(u => u.kind === k).length;
    expect([count("scout"), count("siege"), count("admin")]).toEqual([1, 2, 2]);
    expect(units.filter(u => u.kind === "scout").every(u => u.att === 0)).toBe(true);
  });

  it("walls are well-formed", () => {
    for (const w of Object.values(WALLS)) {
      expect(w.name).toBeTruthy();
      expect(w.factor).toBeGreaterThan(1);
      expect(w.factor).toBeLessThan(1.05);
      expect(Number.isInteger(w.def) && w.def > 0, w.name).toBe(true);
    }
  });

  it("celebrations are well-formed", () => {
    expect(CELEBRATIONS.map(c => c.name)).toEqual(["Small celebration", "Great celebration"]);
    for (const c of CELEBRATIONS) expect(isRes4(c.cost), c.name).toBe(true);
  });

  it("storage capacity goes up with every level, up to level 20", () => {
    expect(CAPACITY).toHaveLength(21);
    expect(CAPACITY.every((c, i) => i === 0 || c > CAPACITY[i - 1])).toBe(true);
    expect([CAPACITY[2], CAPACITY[6], CAPACITY[9], CAPACITY[13], CAPACITY[15]]).toEqual([1700, 5000, 9600, 21400, 31300]);
  });

  it("buildings are well-formed", () => {
    for (const b of BUILDINGS) {
      expect(b.name).toBeTruthy();
      expect(isRes4(b.cost), b.name).toBe(true);
      expect(b.k).toBeGreaterThan(1);
      expect(b.maxLevel).toBeGreaterThan(0);
    }
  });

  it("merchants are well-formed", () => {
    for (const m of Object.values(MERCH)) {
      expect(m.capacity).toBeGreaterThan(0);
      expect(m.speed).toBeGreaterThan(0);
    }
  });
});
