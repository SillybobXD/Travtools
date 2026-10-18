import { describe, expect, it } from "vitest";
import { migrateLegacy } from "./storage";

describe("migrateLegacy", () => {
  it("turns the single-village save into the first village", () => {
    const old = { tribe: "Gauls", unit: "1", speed: "3", pref: "0", mode: "time", builds: [{ b: 3, from: "5", to: "7", qty: "6" }],
      have0: "100", have1: "", wh: "8000", lvl: "7", count: "40", hours: "2", mins: "30", bonus: "25", dist: "12.5", merchCap: "750", merchSpeed: "24" };
    const v = migrateLegacy(old, (_, u) => u === 1 ? "B" : "S");
    expect(v).toMatchObject({ name: "My village", tribe: "Gauls", speed: "3", pref: "0", mode: "time", builds: old.builds,
      troops: [{ unit: 1, ratio: "1", count: "40" }], train: { B: { lvl: "7", bonus: "25" } } });
    expect(v.fields).toEqual({ have0: "100", wh: "8000", hours: "2", mins: "30", dist: "12.5", merchCap: "750", merchSpeed: "24" });
  });
});
