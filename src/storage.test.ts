import { describe, expect, it } from "vitest";
import { migrateLegacy, newVillage, normalizeTroops } from "./storage";

describe("migrateLegacy", () => {
  it("turns the single-village save into the first village", () => {
    const old = { tribe: "Gauls", unit: "1", speed: "3", pref: "0", mode: "time", builds: [{ b: 3, from: "5", to: "7", qty: "6" }],
      have0: "100", have1: "", wh: "8000", lvl: "7", count: "40", hours: "2", mins: "30", bonus: "25", dist: "12.5", merchCap: "750", merchSpeed: "24" };
    const v = migrateLegacy(old, (_, u) => u === 1 ? "B" : "S");
    expect(v).toMatchObject({ name: "My village", tribe: "Gauls", speed: "3", pref: "0", builds: old.builds,
      troops: [{ unit: 1, mode: "time", ratio: "1", count: "40", hours: "2", mins: "30" }], train: { B: { lvl: "7", bonus: "25" } } });
    expect(v.mode).toBeUndefined();
    expect(v.fields).toEqual({ have0: "100", wh: "8000", hours: "2", mins: "30", dist: "12.5", merchCap: "750", merchSpeed: "24" });
  });
});

describe("normalizeTroops", () => {
  it("gives every row the village-wide mode and the shared time", () => {
    const v = { ...newVillage("A", "Teutons", "1"), mode: "count", troops: [{ unit: 0, ratio: "2", count: "10" }, { unit: 3, ratio: "1", count: "5" }] };
    v.fields = { hours: "3", mins: "15" };
    normalizeTroops(v);
    expect(v.troops).toEqual([
      { unit: 0, mode: "count", ratio: "2", count: "10", hours: "3", mins: "15" },
      { unit: 3, mode: "count", ratio: "1", count: "5", hours: "3", mins: "15" },
    ]);
    expect(v.mode).toBeUndefined();
  });

  it("turns the old None mode into no rows", () => {
    const v = { ...newVillage("A", "Teutons", "1"), mode: "none", troops: [{ unit: 0, ratio: "1", count: "100" }] };
    normalizeTroops(v);
    expect(v.troops).toEqual([]);
  });

  it("leaves rows that already have a mode alone", () => {
    const v = newVillage("A", "Teutons", "1");
    const before = structuredClone(v.troops);
    normalizeTroops(v);
    expect(v.troops).toEqual(before);
  });
});
