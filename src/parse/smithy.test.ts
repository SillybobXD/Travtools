import { describe, expect, it } from "vitest";
import { parseSmithy, villageSmithy } from "./smithy";

/* Structure and numbers of a real phone copy of the overview's Smithy tab, with the village names replaced. */
const b = (n: number | string) => (typeof n === "number" ? `\u202d\u202d${n}\u202c\u202c` : n);
const row = (name: string, upgrading: string, ...l: (number | string)[]) => [name, upgrading, ...l.map(b)].join("\t");
const TAB = [
  "Local time: 14:16:25 (UTC +01:00)", "Village overview", "Smithy", "Training", "",
  "Village\tin progress\tResearch Level",
  "Clubswinger\tSpearman\tAxeman\tScout\tPaladin\tTeutonic Knight\tRam\tCatapult",
  row("Village A", "Paladin", 3, 3, "-", 0, 1, "-", 0, 0),
  row("Village B", "•", 0, 0, "-", "-", 0, "-", "-", "-"),
  row("Village C", "•", 1, 0, "-", 0, "-", "-", "-", "-"),
  row("Village D", "-", 0, "-", "-", "-", "-", "-", "-", "-"),
  "", "Player X", "Village A", "(1|2)",
].join("\n");

describe("parseSmithy", () => {
  it("reads levels per village, with unresearched units at 0", () => {
    const s = parseSmithy(TAB);
    expect(s.tribe).toBe("Teutons");
    expect(s.units).toHaveLength(8);
    expect(s.villages.map(v => v.name)).toEqual(["Village A", "Village B", "Village C", "Village D"]);
    expect(s.villages[0]).toEqual({
      name: "Village A",
      levels: [3, 3, 0, 0, 1, 0, 0, 0, 0, 0],
      researched: [true, true, false, true, true, false, true, true, true, true],
      upgrading: 4,
    });
    expect(s.villages[1].upgrading).toBeNull();
    expect(s.villages[3].researched.slice(0, 8)).toEqual([true, false, false, false, false, false, false, false]);
  });

  it("finds nothing in other text", () => {
    expect(parseSmithy("nothing\there")).toEqual({ tribe: null, units: [], villages: [] });
  });
});

describe("villageSmithy", () => {
  it("gives one village's levels for an army's smithy", () => {
    const s = parseSmithy(TAB);
    expect(villageSmithy(s, "Village C")).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(villageSmithy(s, "Nowhere")).toBeNull();
  });
});
