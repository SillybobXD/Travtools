import { NATURE, NATURE_TRIBE, UNITS } from "../data";

/** A table header that names the units: ten unit names, optionally followed by "Hero". */
export interface UnitHeader {
  /** Tribe key in units.json whose unit names match, NATURE_TRIBE for animals, or null (e.g. another language). */
  tribe: string | null;
  /** The ten unit names as shown. */
  units: string[];
  /** Whether an eleventh "Hero" column follows. */
  hero: boolean;
}

const norm = (s: string) => s.trim().toLowerCase();

/** The tribe whose ten unit names match these, ignoring case: a key of UNITS, NATURE_TRIBE for animals, or null. */
export function tribeOf(names: string[]): string | null {
  const n = names.map(norm);
  if (NATURE.length === n.length && NATURE.every((a, i) => norm(a.name) === n[i])) return NATURE_TRIBE;
  for (const [tribe, units] of Object.entries(UNITS))
    if (units.length === n.length && units.every((u, i) => norm(u.name) === n[i])) return tribe;
  return null;
}

/**
 * Reads tab-separated header cells as a unit header: exactly ten names (no digits),
 * plus an optional last "Hero" column. Returns null for anything else.
 */
export function unitHeader(cells: string[]): UnitHeader | null {
  const c = cells.map(s => s.trim()).filter(Boolean);
  if (c.length < 10 || c.length > 11 || c.some(s => /\d/.test(s))) return null;
  const hero = c.length === 11;
  const units = c.slice(0, 10);
  return { tribe: tribeOf(units), units, hero };
}

/** The tribe whose first unit names match these (e.g. the eight units a smithy upgrades), ignoring case; null if none or several do. */
export function tribeOfPrefix(names: string[]): string | null {
  const n = names.map(norm);
  const hits = Object.entries(UNITS).filter(([, units]) => n.length > 0 && n.length <= units.length && n.every((x, i) => norm(units[i].name) === x));
  return hits.length === 1 ? hits[0][0] : null;
}
