import type { Res4 } from "../types";
import { cleanLines, COORD, NUM, NUM_LINE, SNUM, sum, toInt } from "./text";

/** What a paste of the game's village overview page contains. */
export interface OverviewImport {
  /**
   * The active village's top bar: resources and storage, and the crop balance (crop per hour
   * after upkeep) when the bar shows it. Null if not found.
   */
  stock: { res: Res4; warehouse: number; granary: number; cropBalance?: number } | null;
  /** Rows of the overview's Resources tab (they have a merchants column), without the sum row. */
  villages: { name: string; res: Res4 }[];
  /** Rows of the overview's Production tab (no merchants column), per hour, without the sum row. */
  production: { name: string; perHour: Res4 }[];
  /** Rows of the overview's Capacity tab, without the sum row. */
  capacities: { name: string; warehouse: number; granary: number }[];
  /** Which table row is the active village, if it could be told. */
  activeName: string | null;
  /** Map coordinates per village name, from the village list. */
  coords: Record<string, { x: number; y: number }>;
}

/** Resources tab: name, wood, clay, iron, crop, merchants "free/total". */
const ROW = new RegExp(String.raw`^(.*?\S)\s+(${NUM})\s+(${NUM})\s+(${NUM})\s+(${NUM})\s+\d+\s*/\s*\d+$`);
/** Production tab: name and four per-hour numbers (crop can be negative), no merchants. */
const PROD_ROW = new RegExp(String.raw`^(.*?\S)\s+(${SNUM})\s+(${SNUM})\s+(${SNUM})\s+(${SNUM})$`);
/** Capacity tab: name, warehouse, granary. */
const CAP_ROW = new RegExp(String.raw`^(.*?\S)\s+(${NUM})\s+(${NUM})$`);

/** Finds the top bar: warehouse, wood, clay, iron, granary, crop in a run of number-only lines. */
function findStock(lines: string[]): OverviewImport["stock"] {
  let run: number[] = [];
  const runs: number[][] = [];
  for (const l of lines) {
    if (NUM_LINE.test(l)) run.push(toInt(l));
    else { if (run.length) runs.push(run); run = []; }
  }
  if (run.length) runs.push(run);
  for (const r of runs) {
    // Prefer the last window that looks like a stock bar; leading numbers (gold, silver) are skipped.
    for (let s = r.length - 6; s >= 0; s--) {
      const [wh, w, c, i, gr, crop] = r.slice(s, s + 6);
      if (wh > 0 && gr > 0 && w >= 0 && c >= 0 && i >= 0 && crop >= 0 && Math.max(w, c, i) <= wh && crop <= gr)
        return { res: [w, c, i, crop], warehouse: wh, granary: gr, ...(s + 6 < r.length ? { cropBalance: r[s + 6] } : {}) };
    }
  }
  return null;
}

export function parseOverview(text: string): OverviewImport {
  const lines = cleanLines(text);
  const stock = findStock(lines);

  const villages = dropSumRow(lines.flatMap(l => {
    const m = ROW.exec(l);
    return m && !NUM_LINE.test(m[1]) ? [{ name: m[1], res: [m[2], m[3], m[4], m[5]].map(toInt) as Res4 }] : [];
  }), r => r.res);
  const production = dropSumRow(lines.flatMap(l => {
    const m = PROD_ROW.exec(l);
    return m && !NUM_LINE.test(m[1]) ? [{ name: m[1], perHour: [m[2], m[3], m[4], m[5]].map(toInt) as Res4 }] : [];
  }), r => r.perHour);
  const capacities = dropSumRow(lines.flatMap(l => {
    // A row with four numbers would also match name + two numbers; it belongs to another tab.
    const m = !ROW.test(l) && !PROD_ROW.test(l) && CAP_ROW.exec(l);
    return m && !NUM_LINE.test(m[1]) ? [{ name: m[1], warehouse: toInt(m[2]), granary: toInt(m[3]) }] : [];
  }), r => [r.warehouse, r.granary]);

  const coords: OverviewImport["coords"] = {};
  lines.forEach((l, k) => {
    const m = COORD.exec(l);
    const name = m && (m[1] || (k > 0 ? lines[k - 1] : ""));
    if (m && name) coords[name] = { x: toInt(m[2]), y: toInt(m[3]) };
  });

  return { stock, villages, production, capacities, activeName: findActive(lines, stock, villages, [...capacities, ...production], capacities), coords };
}

/** The last row is the sum of the others; its label depends on the game's language. */
function dropSumRow<T>(rows: T[], values: (r: T) => number[]): T[] {
  if (rows.length < 2) return rows;
  const last = values(rows[rows.length - 1]), rest = rows.slice(0, -1);
  return last.every((v, k) => v === sum(rest.map(r => values(r)[k]))) ? rest : rows;
}

/**
 * The Resources row closest to the top bar, or the only Capacity row with the top bar's
 * warehouse and granary, or failing that the line before "Population".
 */
function findActive(lines: string[], stock: OverviewImport["stock"], villages: OverviewImport["villages"], others: { name: string }[], capacities: OverviewImport["capacities"]): string | null {
  if (stock && villages.length) {
    const diffs = villages.map(v => sum(v.res.map((x, k) => Math.abs(x - stock.res[k]))));
    const best = Math.min(...diffs);
    // Close enough to be the same village a few seconds apart, and not tied with another row.
    if (best <= Math.max(100, sum(stock.res) * 0.05) && diffs.filter(d => d === best).length === 1) return villages[diffs.indexOf(best)].name;
  }
  if (stock) {
    const same = capacities.filter(c => c.warehouse === stock.warehouse && c.granary === stock.granary);
    if (same.length === 1) return same[0].name;
  }
  const p = lines.findIndex(l => /^population\b/i.test(l));
  if (p > 0 && [...villages, ...others].some(v => v.name === lines[p - 1])) return lines[p - 1];
  return null;
}
