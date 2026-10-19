import { describe, expect, it } from "vitest";
import { combatOf, migrateLegacy, newVillage, normalizeTroops, villageCombat, type Store } from "./storage";

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

describe("combat state", () => {
  const store = (): Store => ({ version: 2, current: "a", villages: { a: newVillage("A", "Gauls", "1"), b: newVillage("B", "Gauls", "1") }, overrides: {} });

  it("older saves without combat state get defaults for the current village's tribe", () => {
    const s = store();
    const c = combatOf(s);
    expect(c).toMatchObject({ side: "attack", mode: "normal", source: "optimal", objective: "fewestLosses", village: "a", wallTribe: "Gauls" });
    expect(c.enemy).toEqual([{ tribe: "Gauls", counts: Array(10).fill("") }]);
    expect(s.combat).toBe(c);
  });

  it("keeps saved inputs and fills in fields added later", () => {
    const s = store();
    s.combat = { side: "defend", enemy: [{ tribe: "Teutons", counts: ["5"] }], village: "b" } as unknown as Store["combat"];
    const c = combatOf(s);
    expect(c.side).toBe("defend");
    expect(c.village).toBe("b");
    expect(c.enemy[0].counts).toEqual(["5", "", "", "", "", "", "", "", "", ""]);
    expect(c.home).toHaveLength(10);
    expect(c.cap).toBe("100000");
  });

  it("falls back to the current village when the saved one was deleted", () => {
    const s = store();
    s.combat = { village: "gone" } as unknown as Store["combat"];
    expect(combatOf(s).village).toBe("a");
  });

  it("gives each village blank troops and smithy levels until set, keeping what is there", () => {
    const v = newVillage("A", "Teutons", "1");
    expect(villageCombat(v)).toEqual({ troops: Array(10).fill(""), smithy: Array(10).fill("") });
    v.combat!.troops[0] = "500";
    expect(villageCombat(v).troops[0]).toBe("500");
  });

  it("survives the planner's save: the whole store is written back", () => {
    const s = store();
    combatOf(s).cap = "250000";
    villageCombat(s.villages.a).troops[1] = "40";
    const again = JSON.parse(JSON.stringify(s)) as Store;
    expect(combatOf(again).cap).toBe("250000");
    expect(again.villages.a.combat!.troops[1]).toBe("40");
  });
});
