import { describe, expect, it } from "vitest";
import { parseCulture } from "./culture";

/* Structure and numbers of real phone copies of both culture point pages, with player and village names replaced. */
const b = (n: number | string) => `‭‭${n}‬‬`;
const TOP = ["720", "7,689", "31,300", "17,046", "18,766", "16,614", "31,300", "16,534", "2,161"].map(b);
const SIDEBAR = ["Player X", "Village A", `Population: ${b(695)}`, `Loyalty: ${b("100")}%`, "", `Villages ${b(4)}/${b(4)}`,
  "Village A", `(${b(176)}|${b(98)})`, "Village B", `(${b(174)}|${b(97)})`, "Village C", `(${b(99)}|${b(81)})`, "Village D", `(${b(97)}|${b(83)})`];

export const OVERVIEW_TAB = [
  ...TOP, "Switch to avatar for sitting", "Local time: 12:59:31 (UTC +01:00)", "Village overview", "Overview", "Resources", "Culture points", "Troops",
  "About settlement slots and culture points",
  "In order to found or conquer further villages or cities, you will need a settlement slot which is unlocked via culture points. The next settlement slot is estimated to be controllable on 23.10.26, 16:00 (±5 minutes)",
  "Village\tCPs/Day\tCelebrations\tTroops\tSlots",
  `Village A\t564\t16:08:36\t-\t${b(1)}/${b(1)}`,
  `Village B\t221\t-\t-\t${b(1)}/${b(1)}`,
  `Village C\t363\t21:56:14\t-\t${b(1)}/${b(1)}`,
  `Village D\t111\t-\t-\t${b(0)}/${b(0)}`,
  `Sum\t1259\t-\t0\t${b(3)}/${b(3)}`,
  "", ...SIDEBAR,
].join("\n");

export const RESIDENCE_TAB = [
  ...TOP, "Local time: 13:03:41 (UTC +01:00)", "Residence Level 10", "Management", "Train", "Culture points", "Loyalty", "Expansion",
  "Controllable villages",
  "Number of your villages\t4",
  "Maximum controllable villages\t4",
  "Culture points produced so far\t35998",
  "Next village controllable at\t39000",
  "Culture points still needed\t3002",
  "In order to found or conquer further villages, you require culture points. An additional village will predictably be controllable on 23.10.26 at 16:01 (±5 minutes)",
  "Culture points per day",
  "Active village\t363",
  "Other villages\t896",
  "Hero\t100",
  `Alliance bonus level 1 (${b("+" + b(4) + "%")})\t54`,
  "Total\t1413",
  "The further the buildings of your villages are upgraded, the more culture points per day they will produce.",
  ...SIDEBAR,
].join("\n");

describe("parseCulture", () => {
  it("reads the overview's Culture points tab without the sum row", () => {
    const c = parseCulture(OVERVIEW_TAB);
    expect(c.villages).toEqual([
      { name: "Village A", cpPerDay: 564, celebrationLeft: 16 * 3600 + 8 * 60 + 36, slots: [1, 1] },
      { name: "Village B", cpPerDay: 221, celebrationLeft: null, slots: [1, 1] },
      { name: "Village C", cpPerDay: 363, celebrationLeft: 21 * 3600 + 56 * 60 + 14, slots: [1, 1] },
      { name: "Village D", cpPerDay: 111, celebrationLeft: null, slots: [0, 0] },
    ]);
    expect(c.estimate).toBe(new Date(2026, 9, 23, 16, 0).getTime());
    expect(c.produced).toBeNull();
  });

  it("reads the Residence's Culture points tab", () => {
    const c = parseCulture(RESIDENCE_TAB);
    expect(c).toMatchObject({
      produced: 35998, needed: 39000, villageCount: 4, maxVillages: 4,
      active: 363, other: 896, hero: 100, alliancePct: 4, alliance: 54, total: 1413,
      estimate: new Date(2026, 9, 23, 16, 1).getTime(),
    });
    expect(c.villages).toEqual([]);
  });

  it("reads both pasted together", () => {
    const c = parseCulture(OVERVIEW_TAB + "\n" + RESIDENCE_TAB);
    expect(c.villages).toHaveLength(4);
    expect(c.produced).toBe(35998);
  });

  it("finds nothing in other text", () => {
    const c = parseCulture("Village\tWood\tClay\nVillage A\t1\t2");
    expect(c.villages).toEqual([]);
    expect([c.produced, c.needed, c.total, c.estimate]).toEqual([null, null, null, null]);
  });
});
