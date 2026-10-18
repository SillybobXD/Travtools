import { describe, expect, it } from "vitest";
import { BUILDINGS, CELEBRATIONS, MERCH, UNITS } from ".";

const isRes4 = (r: unknown) => Array.isArray(r) && r.length === 4 && r.every(v => Number.isInteger(v) && v >= 0);

describe("data files", () => {
  it("every tribe has units and a merchant", () => {
    expect(Object.keys(UNITS).sort()).toEqual(Object.keys(MERCH).sort());
  });

  it.each(Object.entries(UNITS))("%s units are well-formed", (_, units) => {
    expect(units.length).toBeGreaterThan(0);
    for (const u of units) {
      expect(u.name).toBeTruthy();
      expect(isRes4(u.cost), u.name).toBe(true);
      expect(u.upkeep).toBeGreaterThan(0);
      expect(u.time).toBeGreaterThanOrEqual(0);
      expect(["B", "S", "W", "R"]).toContain(u.building);
    }
  });

  it("celebrations are well-formed", () => {
    expect(CELEBRATIONS.map(c => c.name)).toEqual(["Small celebration", "Great celebration"]);
    for (const c of CELEBRATIONS) expect(isRes4(c.cost), c.name).toBe(true);
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
