import { describe, expect, it } from "vitest";
import { parseTroops, villageArmy } from "./troops";

/* Structure and numbers of a real phone copy of the overview's Troops tab, with the village names replaced. */
const b = (n: number) => `\u202d\u202d${n}\u202c\u202c`;
const row = (name: string, ...n: number[]) => [name, ...n.map(b)].join("\t");
const TAB = [
  "", b(754), b(6907), "Local time: 14:16:25 (UTC +01:00)",
  "Village overview", "Overview", "Resources", "Culture points", "Troops", "  ", "Own troops", "  ", "Troops in villages", "  ", "Smithy", "  ", "Hospital", "  ", "Training", "",
  "Village\tClubswinger\tSpearman\tAxeman\tScout\tPaladin\tTeutonic Knight\tRam\tCatapult\tChief\tSettler\tHero",
  row("Village A", 500, 1400, 0, 166, 300, 0, 20, 32, 0, 0, 1),
  row("Village B", 0, 886, 0, 0, 2, 0, 0, 0, 0, 0, 0),
  row("Village C", 1093, 30, 0, 50, 0, 0, 0, 0, 0, 0, 0),
  row("Village D", 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
  row("Sum", 1593, 2316, 0, 216, 302, 0, 20, 32, 0, 0, 1),
  "", "Player X", "Village A", "(1|2)",
].join("\n");

describe("parseTroops", () => {
  it("reads troops per village and drops the sum row", () => {
    const t = parseTroops(TAB);
    expect(t.tribe).toBe("Teutons");
    expect(t.villages).toEqual([
      { name: "Village A", counts: [500, 1400, 0, 166, 300, 0, 20, 32, 0, 0], hero: 1 },
      { name: "Village B", counts: [0, 886, 0, 0, 2, 0, 0, 0, 0, 0], hero: 0 },
      { name: "Village C", counts: [1093, 30, 0, 50, 0, 0, 0, 0, 0, 0], hero: 0 },
      { name: "Village D", counts: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], hero: 0 },
    ]);
  });

  it("keeps a single village and drops its sum row", () => {
    const one = TAB.split("\n").filter(l => !/^Village [BCD]\t/.test(l)).join("\n").replace(/Sum\t.*/, row("Sum", 500, 1400, 0, 166, 300, 0, 20, 32, 0, 0, 1));
    expect(parseTroops(one).villages.map(v => v.name)).toEqual(["Village A"]);
  });

  it("finds nothing in other text", () => {
    expect(parseTroops("nothing here")).toEqual({ tribe: null, units: [], villages: [] });
  });
});

describe("villageArmy", () => {
  it("gives one village's troops as a combat army", () => {
    const t = parseTroops(TAB);
    expect(villageArmy(t, "Village B")).toEqual({ tribe: "Teutons", counts: [0, 886, 0, 0, 2, 0, 0, 0, 0, 0] });
    expect(villageArmy(t, "Nowhere")).toBeNull();
  });
});
