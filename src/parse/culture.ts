import { cleanLines, NUM, sum, toInt } from "./text";

/*
 * Reads pasted copies of the two pages with culture points, one at a time or both together.
 *
 * The village overview's Culture points tab, as copied on a phone:
 *   "Village  CPs/Day  Celebrations  Troops  Slots"
 *   one row per village: name, CP per day, the running celebration's time left ("16:08:36", "-" for none),
 *   troops, settlement slots used/total ("1/1"); then a "Sum" row.
 *
 * The Residence's or Palace's Culture points tab: "label <tab> number" lines such as
 * "Culture points produced so far 35998", "Next village controllable at 39000", and the CP per day
 * as "Active village", "Other villages", "Hero", "Alliance bonus level 1 (+4%)" and "Total".
 *
 * Both say when the game expects the next village: "… controllable on 23.10.26, 16:00" or "… on 23.10.26 at 16:01".
 */

export interface CultureVillage {
  name: string;
  cpPerDay: number;
  /** Seconds left on the running celebration, or null. */
  celebrationLeft: number | null;
  /** Settlement slots used and available, or null if not shown. */
  slots: [number, number] | null;
}

export interface CultureImport {
  /** Overview tab rows, without the sum row. */
  villages: CultureVillage[];
  /** Residence tab: culture points so far, and the total the next village needs. */
  produced: number | null;
  needed: number | null;
  villageCount: number | null;
  maxVillages: number | null;
  /** Residence tab: CP per day of the active village, the other villages, the hero, the alliance bonus and the total. */
  active: number | null;
  other: number | null;
  hero: number | null;
  alliancePct: number | null;
  alliance: number | null;
  total: number | null;
  /** The game's estimate for the next village (local time, ms), or null. */
  estimate: number | null;
}

const NUM_ONLY = new RegExp(`^${NUM}$`);
const LEFT = /^(\d+):(\d{2}):(\d{2})$/;
const SLOTS = /^(\d+)\s*\/\s*(\d+)$/;
const ESTIMATE = /controllable\b.*?(\d{1,2})\.(\d{1,2})\.(\d{2,4}),?\s*(?:at\s*)?(\d{1,2}):(\d{2})/i;

/** Residence tab labels, matched in lower case. */
const LABELS: [RegExp, keyof CultureImport][] = [
  [/^culture points produced so far$/, "produced"],
  [/^next village controllable at$/, "needed"],
  [/^number of your villages$/, "villageCount"],
  [/^maximum controllable villages$/, "maxVillages"],
  [/^active village$/, "active"],
  [/^other villages$/, "other"],
  [/^hero$/, "hero"],
  [/^alliance bonus\b/, "alliance"],
  [/^total$/, "total"],
];

export function parseCulture(text: string): CultureImport {
  const lines = cleanLines(text);
  const out: CultureImport = {
    villages: [], produced: null, needed: null, villageCount: null, maxVillages: null,
    active: null, other: null, hero: null, alliancePct: null, alliance: null, total: null, estimate: null,
  };
  for (let k = 0; k < lines.length; k++) {
    const line = lines[k], cells = line.split("\t").map(s => s.trim()).filter(Boolean);
    const est = ESTIMATE.exec(line);
    if (est && out.estimate === null) {
      const [d, m, y, h, min] = est.slice(1).map(Number);
      out.estimate = new Date(y < 100 ? 2000 + y : y, m - 1, d, h, min).getTime();
      continue;
    }
    if (cells.length === 2 && NUM_ONLY.test(cells[1])) {
      const label = cells[0].toLowerCase(), hit = LABELS.find(([re]) => re.test(label));
      if (hit && out[hit[1]] === null) {
        (out as unknown as Record<string, number>)[hit[1]] = toInt(cells[1]);
        if (hit[1] === "alliance") { const pct = /\(\s*\+?\s*([\d.]+)\s*%\s*\)/.exec(cells[0]); if (pct) out.alliancePct = parseFloat(pct[1]); }
      }
      continue;
    }
    if (!out.villages.length && cells[0]?.toLowerCase() === "village" && cells.some(s => /^cps?\s*\/\s*day$/i.test(s))) {
      out.villages = overviewRows(lines.slice(k + 1));
    }
  }
  return out;
}

function overviewRows(lines: string[]): CultureVillage[] {
  const rows: CultureVillage[] = [];
  for (const line of lines) {
    const cells = line.split("\t").map(s => s.trim());
    if (cells.length < 3 || !cells[0] || !NUM_ONLY.test(cells[1])) break;
    const left = LEFT.exec(cells[2]), slots = SLOTS.exec(cells[cells.length - 1]);
    rows.push({
      name: cells[0],
      cpPerDay: toInt(cells[1]),
      celebrationLeft: left ? +left[1] * 3600 + +left[2] * 60 + +left[3] : null,
      slots: slots ? [+slots[1], +slots[2]] : null,
    });
  }
  // The last row is the sum of the others.
  const last = rows[rows.length - 1];
  if (rows.length > 1 && last.cpPerDay === sum(rows.slice(0, -1).map(r => r.cpPerDay))) rows.pop();
  return rows;
}
