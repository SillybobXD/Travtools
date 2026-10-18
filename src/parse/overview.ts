import type { Res4 } from "../types";

/** What a paste of the game's village overview page contains. */
export interface OverviewImport {
  /** The active village's top bar: resources and storage. Null if not found. */
  stock: { res: Res4; warehouse: number; granary: number } | null;
  /** Rows of the overview's Resources table, without the sum row. */
  villages: { name: string; res: Res4 }[];
  /** Which table row is the active village, if it could be told. */
  activeName: string | null;
  /** Map coordinates per village name, from the village list. */
  coords: Record<string, { x: number; y: number }>;
}

/** Direction marks the game wraps around every number. */
const BIDI = /[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;
/** A whole number with optional thousands separators (comma, dot, apostrophe, narrow space). */
const NUM = String.raw`\d{1,3}(?:[.,'\u202f]?\d{3})*`;
const NUM_LINE = new RegExp(`^[-−]?${NUM}$`);
/** `(12|34)`, optionally after the village name on the same line. */
const COORD = /^(.*?)\s*\(\s*([-−]?\d+)\s*\|\s*([-−]?\d+)\s*\)$/;
const ROW = new RegExp(String.raw`^(.*?\S)\s+(${NUM})\s+(${NUM})\s+(${NUM})\s+(${NUM})(?:\s+\d+\s*/\s*\d+)?$`);

const toInt = (s: string) => { const n = parseInt(s.replace(/[^\d]/g, ""), 10) * (/^[-−]/.test(s) ? -1 : 1); return isNaN(n) ? 0 : n; };
const sum = (r: number[]) => r.reduce((a, b) => a + b, 0);

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
        return { res: [w, c, i, crop], warehouse: wh, granary: gr };
    }
  }
  return null;
}

export function parseOverview(text: string): OverviewImport {
  const lines = text.replace(BIDI, "").split(/\r?\n/).map(l => l.replace(/\u00a0/g, " ").trim()).filter(Boolean);
  const stock = findStock(lines);

  let villages = lines.flatMap(l => {
    const m = ROW.exec(l);
    return m && !NUM_LINE.test(m[1]) ? [{ name: m[1], res: [m[2], m[3], m[4], m[5]].map(toInt) as Res4 }] : [];
  });
  // The last row is the sum of the others; its label depends on the game's language.
  if (villages.length >= 2) {
    const last = villages[villages.length - 1], rest = villages.slice(0, -1);
    if (last.res.every((v, k) => v === sum(rest.map(r => r.res[k])))) villages = rest;
  }

  const coords: OverviewImport["coords"] = {};
  lines.forEach((l, k) => {
    const m = COORD.exec(l);
    const name = m && (m[1] || (k > 0 ? lines[k - 1] : ""));
    if (m && name) coords[name] = { x: toInt(m[2]), y: toInt(m[3]) };
  });

  return { stock, villages, activeName: findActive(lines, stock, villages), coords };
}

/** The table row closest to the top bar, or failing that the line before "Population". */
function findActive(lines: string[], stock: OverviewImport["stock"], villages: OverviewImport["villages"]): string | null {
  if (stock && villages.length) {
    const diffs = villages.map(v => sum(v.res.map((x, k) => Math.abs(x - stock.res[k]))));
    const best = Math.min(...diffs);
    // Close enough to be the same village a few seconds apart, and not tied with another row.
    if (best <= Math.max(100, sum(stock.res) * 0.05) && diffs.filter(d => d === best).length === 1) return villages[diffs.indexOf(best)].name;
  }
  const p = lines.findIndex(l => /^population\b/i.test(l));
  if (p > 0 && villages.some(v => v.name === lines[p - 1])) return lines[p - 1];
  return null;
}
