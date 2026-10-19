import type { Army } from "../calc/combat";
import { cleanLines, NUM, sum, toInt } from "./text";
import { unitHeader } from "./units";

/*
 * Reads a pasted copy of the village overview's Troops tab ("Own troops"):
 * a header row `Village, ten unit names, Hero`, one tab-separated row per village,
 * and a last row with the sums (its label depends on the language), which is dropped.
 */

/** Troops per village, by unit index into UNITS[tribe]. */
export interface TroopsImport {
  /** The player's tribe, if the unit names match one (all villages of an account share it). */
  tribe: string | null;
  /** The unit names as shown, for when the tribe isn't recognised. */
  units: string[];
  villages: { name: string; counts: number[]; hero: number }[];
}

const NUM_CELL = new RegExp(`^${NUM}$`);

export function parseTroops(text: string): TroopsImport {
  const lines = cleanLines(text);
  for (let k = 0; k < lines.length; k++) {
    const cells = lines[k].split("\t").map(s => s.trim());
    // The header's first cell is the "Village" label; the rest name the units.
    const header = cells.length >= 11 ? unitHeader(cells.slice(1)) : null;
    if (!header) continue;
    const width = header.hero ? 11 : 10;
    const villages: TroopsImport["villages"] = [];
    for (const line of lines.slice(k + 1)) {
      const row = line.split("\t").map(s => s.trim());
      const nums = row.slice(1);
      if (row.length !== width + 1 || !row[0] || !nums.every(s => NUM_CELL.test(s))) break;
      const n = nums.map(toInt);
      villages.push({ name: row[0], counts: n.slice(0, 10), hero: header.hero ? n[10] : 0 });
    }
    return { tribe: header.tribe, units: header.units, villages: dropSumRow(villages) };
  }
  return { tribe: null, units: [], villages: [] };
}

/** The last row is the sum of the others when there are two or more villages. */
function dropSumRow(rows: TroopsImport["villages"]): TroopsImport["villages"] {
  if (rows.length < 3) return rows.length === 2 && rows[0].counts.every((c, i) => c === rows[1].counts[i]) ? rows.slice(0, 1) : rows;
  const last = rows[rows.length - 1], rest = rows.slice(0, -1);
  const isSum = last.counts.every((v, i) => v === sum(rest.map(r => r.counts[i]))) && last.hero === sum(rest.map(r => r.hero));
  return isSum ? rest : rows;
}

/** One village's troops as an army for combat.ts, or null when the tribe is unknown or the village isn't there. */
export function villageArmy(imp: TroopsImport, name: string, smithy?: number[]): Army | null {
  const v = imp.villages.find(x => x.name === name);
  if (!v || !imp.tribe) return null;
  return { tribe: imp.tribe, counts: [...v.counts], ...(smithy ? { smithy } : {}) };
}
