import type { Army } from "../calc/combat";
import { WALLS } from "../data";
import type { Res4 } from "../types";
import { cleanLines, COORD, NUM, NUM_LINE, toInt } from "./text";
import { unitHeader, type UnitHeader } from "./units";

/*
 * Reads a pasted copy of a battle, raid, scout or defence report (the report alone or the whole page).
 *
 * Layout, as copied on a phone in English:
 *   "<village> attacks|raids|scouts <village>"     title
 *   "19.10.26, 13:11:30"                           time
 *   "Attacker", "[TAG] player from village V"      side label and place
 *   unit names, tab-separated, then " Hero" if the hero column is shown
 *   rows of tab-separated numbers: sent, lost, wounded (if any), freed prisoners (if any); "?" when hidden
 *   "Information" lines, "Bounty" with four resources and "carried/capacity" (attacker only)
 *   the same for each "Defender": the village's own troops, then "Reinforcement" blocks
 *   "Statistics": combat strength, supply before, supply lost, resources lost (attacker, defender)
 * Unit tables and numbers are found by shape, not by their labels; the title words,
 * "from village" and the wall lines are English.
 */

/** What the report says the attack was. */
export type ReportType = "normal" | "raid" | "scout";

/** One army in a report: unit counts by index into UNITS[tribe]. Rows the report hides or doesn't show are null. */
export interface ReportArmy {
  /** Tribe key as in units.json ("Teutons", "Romans", …), or null if the names don't match one (e.g. Nature's animals). */
  tribe: string | null;
  /** The ten unit names as shown. */
  units: string[];
  /** Null when the report hides the troops ("?"). */
  sent: number[] | null;
  /** Units lost, wounded included (the first "−N" row). */
  lost: number[] | null;
  /** Of the lost units, those listed as wounded, when the report has that row. */
  wounded: number[] | null;
  /** A fourth row: own troops freed from a trap (the information line says "You freed N own troops"). */
  freed: number[] | null;
  /** Units left after the battle: sent − lost. */
  survived: number[] | null;
  /** The hero column, when shown: whether the hero came and whether it was lost. */
  hero: { sent: boolean; lost: boolean } | null;
}

/** One side's identity as the report shows it; only kept in memory, never in test fixtures. */
export interface ReportPlace {
  /** Alliance tag without brackets ("" when the player has none); null for reinforcement blocks. */
  alliance: string | null;
  player: string | null;
  village: string | null;
  coords: { x: number; y: number } | null;
}

/** Attacker and defender numbers from the report's Statistics. */
export interface ReportStats {
  strength: [number, number];
  supplyBefore: [number, number];
  supplyLost: [number, number];
  resourcesLost: [number, number];
}

export interface BattleReport {
  type: ReportType | null;
  /** The time the report shows, as written. */
  time: string | null;
  attacker: ReportArmy & ReportPlace;
  /** The defending contingents: the village's own troops first, then each reinforcement block. */
  defenders: (ReportArmy & ReportPlace)[];
  /** True when the defender's troops are shown as "?" (the attack failed to see them). */
  defenceHidden: boolean;
  /**
   * Wall level, when an information line names the defender's wall: "Palisade level 10" (scouts: before = after),
   * "City Wall level 20 destroyed" (after 0), "Earth Wall damaged from level 15 to level 14",
   * "Palisade was not damaged." (levels unknown, damaged false).
   */
  wall: { name: string; before: number | null; after: number | null; damaged: boolean | null } | null;
  /** Resources carried home and how much the survivors could carry. */
  loot: { res: Res4; carried: number; capacity: number } | null;
  /**
   * What scouts saw. A resource scout lists wood, clay, iron, crop, then the cranny figure and the total
   * (`Resources` then six numbers); a defence scout lists buildings as "Residence level 2". Absent parts are null or empty.
   */
  scouted: { res: Res4 | null; cranny: number | null; buildings: { name: string; level: number }[] } | null;
  /** The information lines as written (wall and building damage, freed troops, …). */
  info: string[];
  stats: ReportStats | null;
}

const DATE = /^\d{1,2}[./-]\d{1,2}[./-]\d{2,4},?\s+\d{1,2}:\d{2}(?::\d{2})?$/;
const CARRY = new RegExp(`^(${NUM})\\s*/\\s*(${NUM})$`);
const CELL = new RegExp(`^(?:${NUM}|\\?)$`);
const WALL_NAMES = Object.values(WALLS).map(w => w.name.toLowerCase());

const cells = (line: string) => line.split("\t").map(s => s.trim()).filter(Boolean);

interface Block { header: UnitHeader; at: number; end: number; rows: (number[] | null)[] }

/** Unit tables: a header line followed by rows of numbers (or "?"), one cell per column. */
function findBlocks(lines: string[]): Block[] {
  const blocks: Block[] = [];
  for (let k = 0; k < lines.length; k++) {
    const header = lines[k].includes("\t") ? unitHeader(cells(lines[k])) : null;
    if (!header) continue;
    const width = header.hero ? 11 : 10;
    const rows: (number[] | null)[] = [];
    let j = k + 1;
    for (; j < lines.length; j++) {
      const c = cells(lines[j].replace(/[−-]/g, ""));
      if (c.length !== width || !c.every(s => CELL.test(s))) break;
      rows.push(c.includes("?") ? null : c.map(toInt));
    }
    if (rows.length) { blocks.push({ header, at: k, end: j, rows }); k = j - 1; }
  }
  return blocks;
}

/** "[TAG] player from village V (x|y)" on the line before a table; the "from village" split is English. */
function readPlace(line: string | undefined): ReportPlace {
  const m = line ? /^\[([^\]]*)\]\s*(.*)$/.exec(line) : null;
  if (!m) return { alliance: null, player: null, village: null, coords: null };
  const [player, village] = m[2].includes(" from village ") ? m[2].split(" from village ", 2) : [m[2], null];
  const c = village ? COORD.exec(village) : null;
  return { alliance: m[1].trim(), player: player.trim() || null, village, coords: c ? { x: toInt(c[2]), y: toInt(c[3]) } : null };
}

function readArmy(b: Block): ReportArmy {
  const [sentRow, lostRow, woundedRow, freedRow] = b.rows;
  const units = (r: number[] | null | undefined) => (r ? r.slice(0, 10) : null);
  const sent = units(sentRow), lost = units(lostRow);
  return {
    tribe: b.header.tribe,
    units: b.header.units,
    sent,
    lost,
    wounded: units(woundedRow),
    freed: units(freedRow),
    survived: sent && lost ? sent.map((n, i) => n - lost[i]) : null,
    hero: b.header.hero && sentRow ? { sent: sentRow[10] > 0, lost: (lostRow?.[10] ?? 0) > 0 } : null,
  };
}

/**
 * Wall line from the information: "Palisade level 10", "City Wall level 20 destroyed",
 * "Earth Wall damaged from level 15 to level 14", "Palisade was not damaged."
 */
function readWall(info: string[]): BattleReport["wall"] {
  for (const line of info) {
    const name = WALL_NAMES.find(w => line.toLowerCase().startsWith(w));
    if (!name) continue;
    const wall = line.slice(0, name.length);
    const from = /from\s+level\s+(\d+)\s+to\s+level\s+(\d+)/i.exec(line);
    if (from) return { name: wall, before: +from[1], after: +from[2], damaged: +from[2] < +from[1] };
    const m = /level\s+(\d+)(\s+destroyed)?/i.exec(line);
    if (m) return m[2]
      ? { name: wall, before: +m[1], after: 0, damaged: true }
      : { name: wall, before: +m[1], after: +m[1], damaged: null };
    if (/not damaged/i.test(line)) return { name: wall, before: null, after: null, damaged: false };
  }
  return null;
}

export function parseReport(text: string): BattleReport | null {
  const lines = cleanLines(text);
  const blocks = findBlocks(lines);
  if (!blocks.length) return null;
  const [att, ...defs] = blocks;

  const t = lines.findIndex((l, k) => k < att.at && DATE.test(l));
  const title = t > 0 ? lines[t - 1] : "";
  const type: ReportType | null = / raids /.test(title) ? "raid" : / scouts /.test(title) ? "scout" : / attacks /.test(title) ? "normal" : null;

  // Between the attacker's table and the next one: information lines, then the bounty.
  const between = lines.slice(att.end, defs.length ? defs[0].at : lines.length);
  const carryAt = between.findIndex(l => CARRY.test(l));
  let loot: BattleReport["loot"] = null;
  if (carryAt >= 4 && between.slice(carryAt - 4, carryAt).every(l => NUM_LINE.test(l))) {
    const m = CARRY.exec(between[carryAt])!;
    loot = { res: between.slice(carryAt - 4, carryAt).map(toInt) as Res4, carried: toInt(m[1]), capacity: toInt(m[2]) };
  }
  const firstNum = between.findIndex(l => NUM_LINE.test(l) || CARRY.test(l));
  // Information lines have spaces; single-word lines are labels ("Information", "Bounty", "Defender", "Reinforcement").
  const info = between.slice(0, firstNum < 0 ? between.length : firstNum).filter(l => /\s/.test(l) && !l.startsWith("["));

  const buildings = info.flatMap(l => { const m = /^(.+?)\s+level\s+(\d+)$/i.exec(l); return m ? [{ name: m[1], level: +m[2] }] : []; });
  // Resource scout: six numbers in a row, the last being the sum of the first four.
  let scoutRes: Res4 | null = null, cranny: number | null = null;
  if (loot === null && firstNum >= 0) {
    const n = between.slice(firstNum, firstNum + 6);
    const v = n.map(toInt);
    if (n.length === 6 && n.every(l => NUM_LINE.test(l)) && v[5] === v[0] + v[1] + v[2] + v[3]) { scoutRes = v.slice(0, 4) as Res4; cranny = v[4]; }
  }

  // Statistics: after the last table, four label lines each followed by an attacker and a defender number.
  const pairs: [number, number][] = [];
  const last = blocks[blocks.length - 1];
  for (let k = last.end; k + 2 < lines.length && pairs.length < 4; k++)
    if (NUM_LINE.test(lines[k + 1]) && NUM_LINE.test(lines[k + 2]) && !NUM_LINE.test(lines[k])) { pairs.push([toInt(lines[k + 1]), toInt(lines[k + 2])]); k += 2; }
    else if (pairs.length) break;
  const stats = pairs.length === 4 ? { strength: pairs[0], supplyBefore: pairs[1], supplyLost: pairs[2], resourcesLost: pairs[3] } : null;

  const defenders = defs.map(b => ({ ...readArmy(b), ...readPlace(lines[b.at - 1]) }));
  return {
    type,
    time: t >= 0 ? lines[t] : null,
    attacker: { ...readArmy(att), ...readPlace(lines[att.at - 1]) },
    defenders,
    defenceHidden: defenders.some(d => d.sent === null),
    wall: readWall(info),
    loot,
    scouted: scoutRes || (type === "scout" && buildings.length) ? { res: scoutRes, cranny, buildings: type === "scout" ? buildings : [] } : null,
    info,
    stats,
  };
}

/** An army for combat.ts from a report row ("sent" before the battle, "survived" after it). Smithy levels aren't in reports. */
export function reportArmy(side: ReportArmy, which: "sent" | "survived", smithy?: number[]): Army | null {
  const counts = side[which];
  if (!side.tribe || !counts) return null;
  return { tribe: side.tribe, counts: [...counts], ...(smithy ? { smithy } : {}) };
}
