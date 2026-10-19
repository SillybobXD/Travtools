import { cleanLines, NUM, toInt } from "./text";
import { tribeOfPrefix } from "./units";

/*
 * Reads a pasted copy of the village overview's Smithy tab. As copied on a phone:
 *   "Village  in progress  Research Level"
 *   eight unit names (the units a smithy upgrades: all but chief and settler)
 *   one row per village: name, the unit being upgraded now ("•" for none, "-" without a smithy),
 *   then a level per unit, "-" for units not researched in that village.
 */

export interface SmithyImport {
  tribe: string | null;
  /** The unit names as shown. */
  units: string[];
  villages: {
    name: string;
    /** Smithy level per unit index, ten entries (chief and settler 0); 0 where not researched. */
    levels: number[];
    /** Whether each unit is researched in that village ("-" means not). */
    researched: boolean[];
    /** Unit index being upgraded now, if any. */
    upgrading: number | null;
  }[];
}

const LEVEL = new RegExp(`^(?:${NUM}|-)$`);

export function parseSmithy(text: string): SmithyImport {
  const lines = cleanLines(text);
  for (let k = 0; k < lines.length; k++) {
    const names = lines[k].split("\t").map(s => s.trim()).filter(Boolean);
    if (names.length < 2 || names.some(s => /\d/.test(s))) continue;
    const tribe = tribeOfPrefix(names);
    if (!tribe) continue;
    const villages: SmithyImport["villages"] = [];
    for (const line of lines.slice(k + 1)) {
      const row = line.split("\t").map(s => s.trim());
      const cells = row.slice(2);
      if (row.length !== names.length + 2 || !row[0] || !cells.every(s => LEVEL.test(s))) break;
      const upgrading = names.findIndex(n => n.toLowerCase() === row[1].toLowerCase());
      const pad = (a: number[]) => [...a, ...Array(10 - a.length).fill(0)];
      villages.push({
        name: row[0],
        levels: pad(cells.map(s => (s === "-" ? 0 : toInt(s)))),
        researched: [...cells.map(s => s !== "-"), ...Array(10 - cells.length).fill(true)],
        upgrading: upgrading >= 0 ? upgrading : null,
      });
    }
    return { tribe, units: names, villages };
  }
  return { tribe: null, units: [], villages: [] };
}

/** Smithy levels for one village, ready for an Army's `smithy`; null if the village isn't there. */
export function villageSmithy(imp: SmithyImport, name: string): number[] | null {
  return imp.villages.find(v => v.name === name)?.levels ?? null;
}
