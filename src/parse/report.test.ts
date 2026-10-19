import { describe, expect, it } from "vitest";
import { parseReport, reportArmy } from "./report";

import {
  ATTACK_WON, DEFENCE_OASIS, FOOT, NATURE, RAID_LOST_HIDDEN, RAID_WON, RAMS_WALL_DESTROYED, RESOURCE_SCOUT, SCOUT, TOP, WALL_DAMAGED,
} from "./report.fixtures";

const z = (...set: [number, number][]) => { const a = Array(10).fill(0); for (const [i, n] of set) a[i] = n; return a; };

describe("parseReport", () => {
  it("returns null for text without a unit table", () => {
    expect(parseReport("Hello\nworld")).toBeNull();
  });

  it("reads a won attack: rows, hero, freed troops, bounty, statistics", () => {
    const r = parseReport(ATTACK_WON)!;
    expect(r.type).toBe("normal");
    expect(r.time).toBe("19.10.26, 13:11:30");
    expect(r.attacker).toMatchObject({
      tribe: "Teutons", alliance: "AAA", player: "Player A", village: "Village A",
      sent: z([0, 930], [2, 180]), lost: z([0, 7], [2, 1]), wounded: z([0, 2]), freed: z([0, 82], [2, 15]),
      survived: z([0, 923], [2, 179]), hero: { sent: true, lost: false },
    });
    expect(r.defenders).toHaveLength(1);
    expect(r.defenders[0]).toMatchObject({ tribe: "Gauls", player: "Player B", sent: z([0, 41]), lost: z([0, 41]), wounded: z([0, 16]), survived: z() });
    expect(r.loot).toEqual({ res: [3351, 679, 3465, 2533], carried: 10028, capacity: 58660 });
    expect(r.info).toEqual(["You freed 97 own troops. You could save 73 own troops."]);
    expect(r.stats).toEqual({ strength: [49370, 2069], supplyBefore: [1019, 41], supplyLost: [8, 41], resourcesLost: [2240, 12915] });
    expect(r.defenceHidden).toBe(false);
    expect(r.wall).toBeNull();
  });

  it("reads a lost raid whose defence is hidden", () => {
    const r = parseReport(RAID_LOST_HIDDEN)!;
    expect(r.type).toBe("raid");
    expect(r.attacker).toMatchObject({ tribe: "Romans", sent: z([0, 5]), lost: z([0, 5]), wounded: null, survived: z() });
    expect(r.defenceHidden).toBe(true);
    expect(r.defenders[0]).toMatchObject({ tribe: "Romans", alliance: "", player: "Player B", sent: null, lost: null, hero: null });
    expect(r.loot).toEqual({ res: [0, 0, 0, 0], carried: 0, capacity: 0 });
    expect(r.stats).toBeNull();
  });

  it("reads a won raid against an empty village", () => {
    const r = parseReport(RAID_WON)!;
    expect(r.type).toBe("raid");
    expect(r.attacker.survived).toEqual(z([0, 495]));
    expect(r.defenders[0].sent).toEqual(z());
    expect(r.loot?.capacity).toBe(29700);
    expect(r.stats?.strength).toEqual([20707, 373]);
  });

  it("reads a scout report: building levels, wall, and an animal reinforcement", () => {
    const r = parseReport(SCOUT)!;
    expect(r.type).toBe("scout");
    expect(r.scouted?.buildings).toEqual([{ name: "Residence", level: 2 }, { name: "Rally Point", level: 15 }, { name: "Palisade", level: 10 }]);
    expect(r.wall).toEqual({ name: "Palisade", before: 10, after: 10, damaged: null });
    expect(r.loot).toBeNull();
    expect(r.defenders).toHaveLength(2);
    expect(r.defenders[0]).toMatchObject({ tribe: "Gauls", sent: [94, 104, 1, 29, 154, 38, 0, 0, 0, 0], hero: { sent: true, lost: false } });
    expect(r.defenders[1]).toMatchObject({ tribe: "Nature", units: NATURE.split("\t"), sent: [8, 0, 4, 0, 12, 12, 12, 3, 9, 7], player: null, hero: null });
  });

  it("reads a defence of an occupied oasis with its coordinates", () => {
    const r = parseReport(DEFENCE_OASIS)!;
    expect(r.type).toBe("normal");
    expect(r.attacker).toMatchObject({ sent: z([0, 500], [5, 69]), lost: z([0, 23], [5, 3]), wounded: z([0, 9], [5, 1]) });
    expect(r.defenders[0]).toMatchObject({ village: "Occupied oasis (10|20)", coords: { x: 10, y: 20 }, lost: z([1, 55], [4, 23]), wounded: z([1, 22], [4, 9]) });
    expect(r.info).toEqual([]);
  });

  it("reads rams destroying a wall, a hero, and siege units that are never wounded", () => {
    const r = parseReport(RAMS_WALL_DESTROYED)!;
    expect(r.wall).toEqual({ name: "City Wall", before: 20, after: 0, damaged: true });
    expect(r.info).toEqual(["City Wall level 20 destroyed", "Iron Foundry was not damaged."]);
    expect(r.attacker).toMatchObject({ tribe: "Gauls", lost: z([1, 425], [3, 393], [6, 26]), wounded: z([1, 170], [3, 157]), hero: { sent: true, lost: false } });
    expect(r.defenders.map(d => d.tribe)).toEqual(["Romans", "Nature"]);
    expect(r.defenders[0].wounded).toEqual([128, 127, 99, 171, 112, 32, 0, 0, 0, 0]);
    expect(r.stats?.resourcesLost).toEqual([705405, 1219660]);
  });

  it("reads a resource scout: resources and the cranny capacity", () => {
    const r = parseReport(RESOURCE_SCOUT)!;
    expect(r.type).toBe("scout");
    expect(r.scouted).toEqual({ res: [8836, 6295, 8695, 1353], crannyCapacity: 0, buildings: [] });
    expect(r.loot).toBeNull();
    expect(r.wall).toBeNull();
    expect(r.attacker.sent).toEqual(z([3, 30]));
  });

  it("reads a wall damaged by some levels, and a reinforcement whose hero died", () => {
    const r = parseReport(WALL_DAMAGED)!;
    expect(r.wall).toEqual({ name: "Earth Wall", before: 15, after: 14, damaged: true });
    expect(r.info).toEqual(["Earth Wall damaged from level 15 to level 14", "Workshop level 1 destroyed"]);
    expect(r.scouted).toBeNull();
    expect(r.attacker).toMatchObject({ lost: z([0, 33], [1, 178], [3, 201], [6, 17], [7, 12]), wounded: null });
    expect(r.defenders[1]).toMatchObject({ tribe: "Gauls", player: null, lost: z([0, 450], [4, 50]), wounded: z([0, 60]), hero: { sent: true, lost: true } });
    expect(r.stats?.strength).toEqual([58092, 42060]);
  });

  it("parses the report alone, without the page around it", () => {
    const alone = ATTACK_WON.split("\n").slice(TOP.length, -FOOT.length).join("\n");
    expect(parseReport(alone)).toEqual(parseReport(ATTACK_WON));
  });
});

describe("reportArmy", () => {
  it("makes a combat army from the sent or surviving troops", () => {
    const r = parseReport(DEFENCE_OASIS)!;
    expect(reportArmy(r.attacker, "sent")).toEqual({ tribe: "Teutons", counts: z([0, 500], [5, 69]) });
    expect(reportArmy(r.attacker, "survived", z([0, 10]))).toEqual({ tribe: "Teutons", counts: z([0, 477], [5, 66]), smithy: z([0, 10]) });
  });

  it("maps an animal reinforcement to Nature, so oasis fights can be simulated", () => {
    expect(reportArmy(parseReport(SCOUT)!.defenders[1], "sent")).toEqual({ tribe: "Nature", counts: [8, 0, 4, 0, 12, 12, 12, 3, 9, 7] });
  });

  it("is null for hidden troops or an unknown tribe", () => {
    expect(reportArmy(parseReport(RAID_LOST_HIDDEN)!.defenders[0], "sent")).toBeNull();
    const other = parseReport(SCOUT.replace("Rat\tSpider", "Ratte\tSpinne"))!.defenders[1];
    expect(other.tribe).toBeNull();
    expect(reportArmy(other, "sent")).toBeNull();
  });
});
