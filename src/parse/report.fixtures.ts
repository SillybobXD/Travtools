/*
 * Report fixtures for tests: the structure and numbers of real phone copies (English) with every
 * player, village, alliance name and coordinate replaced. `b()` adds the direction marks the game
 * puts around numbers.
 */
const b = (n: string | number) => `\u202d\u202d${n}\u202c\u202c`;
const row = (...n: (string | number)[]) => n.map(b).join("\t");
/** Page parts around the report: top bar, menus, and the village list with coordinates. */
export const TOP = ["", b(754), b("6,907"), b("6,300"), b("2,606"), "Local time: 14:12:59 (UTC +01:00)", "Reports", "All", "Offensive", "Surrounding"];
export const FOOT = ["", "Player X", "Village X", `Population: ${b(172)}`, `Villages ${b(4)}/${b(4)}`, "Village X", `(${b(1)}|${b(2)})`, "Homepage Discord News Support Game rules Terms Imprint"];
const page = (...lines: string[]) => [...TOP, ...lines, ...FOOT].join("\n");

const TEUTONS = "Clubswinger\tSpearman\tAxeman\tScout\tPaladin\tTeutonic Knight\tRam\tCatapult\tChief\tSettler\t Hero";
const GAULS = "Phalanx\tSwordsman\tPathfinder\tTheutates Thunder\tDruidrider\tHaeduan\tRam\tTrebuchet\tChieftain\tSettler\t Hero";
const ROMANS = "Legionnaire\tPraetorian\tImperian\tEquites Legati\tEquites Imperatoris\tEquites Caesaris\tBattering ram\tFire Catapult\tSenator\tSettler";
export const NATURE = "Rat\tSpider\tSnake\tBat\tWild Boar\tWolf\tBear\tCrocodile\tTiger\tElephant";
const STATS = (s: [string, string][]) => ["Statistics", "Attacker\tDefender",
  ...["Combat strength\t", "Supply before\t", "Supply lost\t", "Resources lost\t"].flatMap((l, k) => [l, b(s[k][0]), b(s[k][1])])];

export const ATTACK_WON = page(
  "Village A attacks Village B", "19.10.26, 13:11:30", "",
  "Attacker", "[AAA] Player A from village Village A", TEUTONS,
  row(930, 0, 180, 0, 0, 0, 0, 0, 0, 0, 1), row(7, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0), row(2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0), row(82, 0, 15, 0, 0, 0, 0, 0, 0, 0, 0),
  "Information\t", "You freed 97 own troops. You could save 73 own troops.",
  "Bounty\t", b(3351), b(679), b(3465), b(2533), `${b(10028)}/${b(58660)}`,
  "Defender", "[BBB] Player B from village Village B", GAULS,
  row(41, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0), row(41, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0), row(16, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
  ...STATS([["49,370", "2,069"], ["1,019", "41"], ["8", "41"], ["2,240", "12,915"]]),
);

export const RAID_LOST_HIDDEN = page(
  "Village A raids Village B", "19.10.26, 10:11:27", "",
  "Attacker", "[AAA] Player A from village Village A", ROMANS + "\t Hero",
  row(5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0), row(5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
  "Information\t", "None of the attacker’s troops have returned.",
  "Bounty\t", b(0), b(0), b(0), b(0), `${b(0)}/${b(0)}`,
  "Defender", "[ ] Player B from village Village B", ROMANS,
  "?\t?\t?\t?\t?\t?\t?\t?\t?\t?",
);

export const RAID_WON = page(
  "Village A raids Village B", "19.10.26, 11:08:06", "", "", "",
  "Attacker", "[AAA] Player A from village Village A", TEUTONS,
  row(496, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0), row(1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
  "Bounty\t", b(2009), b(1834), b(1407), b(1994), `${b(7244)}/${b("29,700")}`,
  "Defender", "[BBB] Player B from village Village B", TEUTONS,
  row(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0), row(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
  ...STATS([["20,707", "373"], ["496", "0"], ["1", "0"], ["250", "0"]]),
);

export const SCOUT = page(
  "Village A scouts Village B", "19.10.26, 13:15:36", "",
  "Attacker", "[AAA] Player A from village Village A", TEUTONS,
  row(0, 0, 0, 10, 0, 0, 0, 0, 0, 0, 0), row(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
  "Information\t", "Residence level 2", "Rally Point level 15", "Palisade level 10",
  "Defender", "[ ] Player B from village Village B", GAULS,
  row(94, 104, 1, 29, 154, 38, 0, 0, 0, 0, 1), row(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
  "Defender", "Reinforcement", NATURE,
  row(8, 0, 4, 0, 12, 12, 12, 3, 9, 7), row(0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
);

export const DEFENCE_OASIS = page(
  "Village A attacks Occupied oasis (10|20)", "19.10.26, 09:39:50", "",
  "Attacker", "[AAA] Player A from village Village A", TEUTONS,
  row(500, 0, 0, 0, 0, 69, 0, 0, 0, 0, 0), row(23, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0), row(9, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0),
  "Bounty\t", b(1015), b(1244), b(1592), b(7800), `${b(11651)}/${b(33900)}`,
  "Defender", `[BBB] Player B from village Occupied oasis (${b(10)}|${b(20)})`, TEUTONS,
  row(0, 55, 0, 0, 23, 0, 0, 0, 0, 0, 0), row(0, 55, 0, 0, 23, 0, 0, 0, 0, 0, 0), row(0, 22, 0, 0, 9, 0, 0, 0, 0, 0, 0),
  ...STATS([["34,043", "4,360"], ["707", "101"], ["32", "101"], ["10,325", "41,815"]]),
);

export const RAMS_WALL_DESTROYED = page(
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

export const RESOURCE_SCOUT = page(
  "Village A scouts Village B", "19.10.26, 12:26:44", "", "", "",
  "Attacker", "[AAA] Player A from village Village A", "", TEUTONS,
  row(0, 0, 0, 30, 0, 0, 0, 0, 0, 0, 0), row(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
  "Resources	", b(8836), b(6295), b(8695), b(1353), b(0), b(25179),
  "Defender", "[ ] Player B from village Village B", GAULS,
  row(94, 104, 1, 29, 154, 38, 0, 0, 0, 0, 1), row(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
  "Defender", "Reinforcement", NATURE,
  row(8, 0, 4, 0, 12, 12, 12, 3, 9, 7), row(0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
);

export const WALL_DAMAGED = page(
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

