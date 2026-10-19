import { describe, expect, it } from "vitest";
import { parseReport, reportArmy } from "./report";

/*
 * Fixtures follow the structure and numbers of real phone copies (English) with every
 * player, village, alliance name and coordinate replaced. `b()` adds the direction
 * marks the game puts around numbers.
 */
const b = (n: string | number) => `‭‭${n}‬‬`;
const row = (...n: (string | number)[]) => n.map(b).join("\t");
/** Page parts around the report: top bar, menus, and the village list with coordinates. */
const TOP = ["", b(754), b("6,907"), b("6,300"), b("2,606"), "Local time: 14:12:59 (UTC +01:00)", "Reports", "All", "Offensive", "Surrounding"];
const FOOT = ["", "Player X", "Village X", `Population: ${b(172)}`, `Villages ${b(4)}/${b(4)}`, "Village X", `(${b(1)}|${b(2)})`, "Homepage Discord News Support Game rules Terms Imprint"];
const page = (...lines: string[]) => [...TOP, ...lines, ...FOOT].join("\n");

const TEUTONS = "Clubswinger\tSpearman\tAxeman\tScout\tPaladin\tTeutonic Knight\tRam\tCatapult\tChief\tSettler\t Hero";
const GAULS = "Phalanx\tSwordsman\tPathfinder\tTheutates Thunder\tDruidrider\tHaeduan\tRam\tTrebuchet\tChieftain\tSettler\t Hero";
const ROMANS = "Legionnaire\tPraetorian\tImperian\tEquites Legati\tEquites Imperatoris\tEquites Caesaris\tBattering ram\tFire Catapult\tSenator\tSettler";
const NATURE = "Rat\tSpider\tSnake\tBat\tWild Boar\tWolf\tBear\tCrocodile\tTiger\tElephant";
const STATS = (s: [string, string][]) => ["Statistics", "Attacker\tDefender",
  ...["Combat strength\t", "Supply before\t", "Supply lost\t", "Resources lost\t"].flatMap((l, k) => [l, b(s[k][0]), b(s[k][1])])];

const ATTACK_WON = page(
  "Village A attacks Village B", "19.10.26, 13:11:30", "",
  "Attacker", "[AAA] Player A from village Village A", TEUTONS,
  row(930, 0, 180, 0, 0, 0, 0, 0, 0, 0, 1), row(7, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0), row(2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0), row(82, 0, 15, 0, 0, 0, 0, 0, 0, 0, 0),
  "Information\t", "You freed 97 own troops. You could save 73 own troops.",
  "Bounty\t", b(3351), b(679), b(3465), b(2533), `${b(10028)}/${b(58660)}`,
  "Defender", "[BBB] Player B from village Village B", GAULS,
  row(41, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0), row(41, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0), row(16, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
  ...STATS([["49,370", "2,069"], ["1,019", "41"], ["8", "41"], ["2,240", "12,915"]]),
);

const RAID_LOST_HIDDEN = page(
  "Village A raids Village B", "19.10.26, 10:11:27", "",
  "Attacker", "[AAA] Player A from village Village A", ROMANS + "\t Hero",
  row(5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0), row(5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
  "Information\t", "None of the attacker’s troops have returned.",
  "Bounty\t", b(0), b(0), b(0), b(0), `${b(0)}/${b(0)}`,
  "Defender", "[ ] Player B from village Village B", ROMANS,
  "?\t?\t?\t?\t?\t?\t?\t?\t?\t?",
);

const RAID_WON = page(
  "Village A raids Village B", "19.10.26, 11:08:06", "", "", "",
  "Attacker", "[AAA] Player A from village Village A", TEUTONS,
  row(496, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0), row(1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
  "Bounty\t", b(2009), b(1834), b(1407), b(1994), `${b(7244)}/${b("29,700")}`,
  "Defender", "[BBB] Player B from village Village B", TEUTONS,
  row(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0), row(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
  ...STATS([["20,707", "373"], ["496", "0"], ["1", "0"], ["250", "0"]]),
);

const SCOUT = page(
  "Village A scouts Village B", "19.10.26, 13:15:36", "",
  "Attacker", "[AAA] Player A from village Village A", TEUTONS,
  row(0, 0, 0, 10, 0, 0, 0, 0, 0, 0, 0), row(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
  "Information\t", "Residence level 2", "Rally Point level 15", "Palisade level 10",
  "Defender", "[ ] Player B from village Village B", GAULS,
  row(94, 104, 1, 29, 154, 38, 0, 0, 0, 0, 1), row(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
  "Defender", "Reinforcement", NATURE,
  row(8, 0, 4, 0, 12, 12, 12, 3, 9, 7), row(0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
);

const DEFENCE_OASIS = page(
  "Village A attacks Occupied oasis (10|20)", "19.10.26, 09:39:50", "",
  "Attacker", "[AAA] Player A from village Village A", TEUTONS,
  row(500, 0, 0, 0, 0, 69, 0, 0, 0, 0, 0), row(23, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0), row(9, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0),
  "Bounty\t", b(1015), b(1244), b(1592), b(7800), `${b(11651)}/${b(33900)}`,
  "Defender", `[BBB] Player B from village Occupied oasis (${b(10)}|${b(20)})`, TEUTONS,
  row(0, 55, 0, 0, 23, 0, 0, 0, 0, 0, 0), row(0, 55, 0, 0, 23, 0, 0, 0, 0, 0, 0), row(0, 22, 0, 0, 9, 0, 0, 0, 0, 0, 0),
  ...STATS([["34,043", "4,360"], ["707", "101"], ["32", "101"], ["10,325", "41,815"]]),
);

const RAMS_WALL_DESTROYED = page(
  "Village A attacks Village B", "17.10.26, 01:10:51", "",
  "Attacker", "[AAA] Player A from village Village A", GAULS,
  row(0, 1107, 0, 1022, 0, 0, 67, 1, 0, 0, 1), row(0, 425, 0, 393, 0, 0, 26, 0, 0, 0, 0), row(0, 170, 0, 157, 0, 0, 0, 0, 0, 0, 0),
  "Information\t", " City Wall level 20 destroyed", " Iron Foundry was not damaged.",
  "Bounty\t", b(6419), b(10479), b(3337), b(10088), `${b(30323)}/${b(77865)}`,
  "Defender", "[BBB] Player B from village Village B", ROMANS + "\t Hero",
  row(321, 318, 248, 429, 281, 82, 10, 11, 0, 0, 0), row(321, 318, 248, 429, 281, 82, 10, 11, 0, 0, 0), row(128, 127, 99, 171, 112, 32, 0, 0, 0, 0, 0),
  "Defender", "Reinforcement", NATURE,
  row(4, 1, 0, 0, 5, 4, 8, 5, 0, 14), row(4, 1, 0, 0, 5, 4, 8, 5, 0, 14),
  ...STATS([["225,286", "116,678"], ["3,364", "3,012"], ["1,289", "3,012"], ["705,405", "1,219,660"]]),
);

const RESOURCE_SCOUT = page(
  "Village A scouts Village B", "19.10.26, 12:26:44", "", "", "",
  "Attacker", "[AAA] Player A from village Village A", "", TEUTONS,
  row(0, 0, 0, 30, 0, 0, 0, 0, 0, 0, 0), row(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
  "Resources	", b(8836), b(6295), b(8695), b(1353), b(0), b(25179),
  "Defender", "[ ] Player B from village Village B", GAULS,
  row(94, 104, 1, 29, 154, 38, 0, 0, 0, 0, 1), row(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
  "Defender", "Reinforcement", NATURE,
  row(8, 0, 4, 0, 12, 12, 12, 3, 9, 7), row(0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
);

const WALL_DAMAGED = page(
  "Village A attacks Village B", "13.10.26, 11:21:05", "",
  "Attacker", "[AAA] Player A from village Village A", GAULS,
  row(54, 288, 0, 325, 0, 0, 28, 20, 0, 0, 0), row(33, 178, 0, 201, 0, 0, 17, 12, 0, 0, 0),
  "Information	", " Earth Wall damaged from level 15 to level 14", " Workshop level 1 destroyed",
  "Bounty	", b(0), b(0), b(0), b(0), `${b(0)}/${b(14985)}`,
  "Defender", "[BBB] Player B from village Village B", TEUTONS,
  row(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0), row(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
  "Defender", "Reinforcement", GAULS,
  row(450, 0, 0, 0, 50, 0, 0, 0, 0, 0, 1), row(450, 0, 0, 0, 50, 0, 0, 0, 0, 0, 1), row(60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
  ...STATS([["58,092", "42,060"], ["1,196", "556"], ["736", "556"], ["394,745", "196,250"]]),
);

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
