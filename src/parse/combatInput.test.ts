import { describe, expect, it } from "vitest";
import { fillFromReport, smithyFromReport } from "./combatInput";
import { parseReport } from "./report";
import { ATTACK_WON, DEFENCE_OASIS, RAID_LOST_HIDDEN, RAID_WON, RAMS_WALL_DESTROYED, RESOURCE_SCOUT, SCOUT, WALL_DAMAGED } from "./report.fixtures";

const fill = (text: string, side: "attack" | "defend") => fillFromReport(parseReport(text)!, side);

describe("fillFromReport", () => {
  it("attack: a scout report gives the target's troops, animals, wall and owner's tribe", () => {
    const f = fill(SCOUT, "attack");
    expect(f.enemy).toEqual([
      { tribe: "Gauls", counts: [94, 104, 1, 29, 154, 38, 0, 0, 0, 0] },
      { tribe: "Nature", counts: [8, 0, 4, 0, 12, 12, 12, 3, 9, 7] },
    ]);
    expect(f).toMatchObject({ wallTribe: "Gauls", wall: 10, coords: null, loot: null, skipped: 0 });
  });

  it("attack: a resource scout gives the loot to aim for", () => {
    expect(fill(RESOURCE_SCOUT, "attack").loot).toEqual({ res: [8836, 6295, 8695, 1353], crannyCapacity: 0 });
  });

  it("attack: the wall after rams, and an oasis's coordinates", () => {
    expect(fill(WALL_DAMAGED, "attack")).toMatchObject({ wall: 14, wallTribe: "Teutons" });
    expect(fill(RAMS_WALL_DESTROYED, "attack").wall).toBe(0);
    expect(fill(DEFENCE_OASIS, "attack").coords).toEqual({ x: 10, y: 20 });
  });

  it("attack: hidden troops are skipped and counted", () => {
    const f = fill(RAID_LOST_HIDDEN, "attack");
    expect(f.enemy).toEqual([]);
    expect(f.skipped).toBe(1);
  });

  it("defend: the report's attacker is the incoming army", () => {
    const f = fill(DEFENCE_OASIS, "defend");
    expect(f.enemy).toEqual([{ tribe: "Teutons", counts: [500, 0, 0, 0, 0, 69, 0, 0, 0, 0] }]);
    expect(f).toMatchObject({ wallTribe: "Teutons", coords: null, loot: null });
  });
});

describe("smithyFromReport", () => {
  const est = (text: string, side: "attack" | "defend") => smithyFromReport(parseReport(text)!, side);

  it("scout reports have no strength to work from", () => {
    const e = est(SCOUT, "attack").estimate;
    expect(e.status).toBe("none");
    expect(e.note).toBe("Scout reports have no combat strength, so smithy levels can't be estimated.");
  });

  it("defend: the attacker's levels from its strength; a hero makes it uncertain (sample 1)", () => {
    const { estimate, index } = est(ATTACK_WON, "defend");
    expect(index).toBe(0);
    expect(estimate.status).toBe("uncertain");
    expect(estimate.ranges[0]).toEqual([0, 2]);
  });

  it("defend: no hero, two unit types (sample 5)", () => {
    const e = est(DEFENCE_OASIS, "defend").estimate;
    expect(e.status).toBe("ok");
    expect(e.note).toContain("Clubswinger");
  });

  it("attack: a battle report without a wall line can't tell the defence's levels (sample 1)", () => {
    expect(est(ATTACK_WON, "attack").estimate.note).toContain("wall level");
  });

  it("attack: a mixed attack on an oasis can't either (sample 5)", () => {
    expect(est(DEFENCE_OASIS, "attack").estimate.note).toContain("mixed infantry and cavalry");
  });

  it("attack: rams make the wall during the battle unknown", () => {
    expect(est(WALL_DAMAGED, "attack").estimate.note).toContain("Rams");
  });

  it("attack: an empty village gives nothing to estimate", () => {
    expect(est(RAID_WON, "attack").estimate.status).toBe("none");
  });
});
