import { NATURE, NATURE_TRIBE, UNITS } from "../data";
import { upgraded, wallBonus, wallDefence, BASE_DEFENCE } from "./combat";

/*
 * Works out which smithy levels fit the combat strength a battle report shows.
 * Strength is a sum of unit values, each rising with its unit's smithy level, so every
 * level from 0 to 20 can be tried: a level fits when the strength it gives is within
 * a point of the report's (the game rounds what it shows).
 *   - Common level: one level for every unit type; the sum rises with it, so the fitting levels form a range.
 *   - Per unit type: a level fits if some levels of the other types (0..20) make up the rest.
 * A hero adds an unknown amount, so then the strength only caps the levels (0 up to the highest that fits).
 * Morale and bonuses are not in reports either; they are assumed absent.
 */

export interface SmithyEstimate {
  /** "ok": levels fit the strength; "uncertain": a hero adds an unknown amount, so only a cap; "none": nothing can be inferred. */
  status: "ok" | "uncertain" | "none";
  /** Fitting levels [lowest, highest] per unit index for the unit types in the battle; null for the others. */
  ranges: ([number, number] | null)[];
  /** Levels to pre-fill: the middle of the common range when one fits all types, else of each type's range; 0 elsewhere. */
  suggested: number[];
  /** One or two sentences for the page. */
  note: string;
}

const MAX_LEVEL = 20;
/** Units a smithy upgrades: indices 0–7 (chief and settler are not). */
const UPGRADABLE = 8;
const LEVELS = Array.from({ length: MAX_LEVEL + 1 }, (_, l) => l);

interface Term { i: number; name: string; value: (level: number) => number }

const none = (note: string): SmithyEstimate => ({ status: "none", ranges: Array(10).fill(null), suggested: Array(10).fill(0), note });
const span = (r: [number, number]) => (r[0] === r[1] ? `${r[0]}` : `${r[0]}–${r[1]}`);
const mid = (r: [number, number]) => Math.round((r[0] + r[1]) / 2);
const rangeOf = (ls: number[]): [number, number] | null => (ls.length ? [ls[0], ls[ls.length - 1]] : null);

/** Levels that fit `lo <= constant + Σ terms <= hi`, for a common level and per term. */
function solve(terms: Term[], constant: number, lo: number, hi: number, hero: boolean, what: string): SmithyEstimate {
  if (!terms.length) return none(`No ${what} that a smithy upgrades took part.`);
  const sumAt = (l: number) => constant + terms.reduce((s, t) => s + t.value(l), 0);
  const common = rangeOf(LEVELS.filter(l => sumAt(l) >= lo && sumAt(l) <= hi));
  const ranges: SmithyEstimate["ranges"] = Array(10).fill(null);
  for (const t of terms) {
    const others = terms.filter(o => o !== t);
    const min = constant + others.reduce((s, o) => s + o.value(0), 0);
    const max = constant + others.reduce((s, o) => s + o.value(MAX_LEVEL), 0);
    ranges[t.i] = rangeOf(LEVELS.filter(l => min + t.value(l) <= hi && max + t.value(l) >= lo));
  }
  if (!common && terms.every(t => !ranges[t.i]))
    return none(`The report's strength doesn't fit any smithy levels for these ${what}: morale, a hero or bonuses may be involved.`);
  const suggested = Array(10).fill(0);
  for (const t of terms) suggested[t.i] = common ? mid(common) : ranges[t.i] ? mid(ranges[t.i]!) : 0;

  const base = terms.reduce((s, t) => s + t.value(0), 0);
  const main = terms.find(t => t.value(0) >= 0.9 * base);
  const parts: string[] = [];
  if (terms.length === 1) parts.push(`Report suggests ${terms[0].name} smithy ${span(ranges[terms[0].i] ?? common!)}`);
  else {
    if (common) parts.push(`Report suggests smithy ${span(common)} if all units share a level`);
    if (main && ranges[main.i]) parts.push(`${main.name} ${span(ranges[main.i]!)} on its own`);
    if (!parts.length) parts.push(terms.flatMap(t => (ranges[t.i] ? [`${t.name} ${span(ranges[t.i]!)}`] : [])).join(", "));
  }
  const note = parts.join("; ") + "." + (hero ? " A hero took part and adds an unknown amount, so the levels may be lower: this is only the most that fits." : "");
  return { status: hero ? "uncertain" : "ok", ranges, suggested, note };
}

/** Smithy levels of an attacking army, from the attacker's combat strength in the report's statistics. */
export function estimateAttackerSmithy(a: { tribe: string; sent: number[]; strength: number; hero: boolean }): SmithyEstimate {
  const units = UNITS[a.tribe];
  if (!units) return none("Unknown tribe, so smithy levels can't be estimated.");
  const terms: Term[] = [];
  let constant = 0;
  a.sent.forEach((n, i) => {
    const u = units[i];
    if (!u || !(n > 0)) return;
    if (i < UPGRADABLE && u.att > 0) terms.push({ i, name: u.name, value: l => n * upgraded(u.att, u.upkeep, l) });
    else constant += n * upgraded(u.att, u.upkeep, 0);
  });
  return solve(terms, constant, a.hero ? -Infinity : a.strength - 1, a.strength + 1, a.hero, "attacking units");
}

/**
 * Smithy levels of the defending army, from the defender's combat strength. Only when everything else is known:
 * the wall level, an attack of only infantry or only cavalry (so the defence it meets is clear), and a single
 * army whose levels are unknown (others may only be animals).
 */
export function estimateDefenderSmithy(d: {
  contingents: { tribe: string | null; sent: number[] | null; hero: boolean }[];
  strength: number;
  /** The wall during the battle, or null if the report doesn't show it. */
  wall: { tribe: string; level: number } | null;
  attackKind: "inf" | "cav" | "mixed";
}): SmithyEstimate {
  if (!d.wall) return none("The report doesn't show the wall level, so the defence's smithy levels can't be inferred.");
  if (d.attackKind === "mixed") return none("The attack mixed infantry and cavalry, and how much of each depends on the attacker's smithy, so the defence's smithy levels can't be inferred.");
  if (d.contingents.some(c => !c.tribe || !c.sent)) return none("Some defending troops are hidden or not recognised, so the defence's smithy levels can't be inferred.");
  const armed = d.contingents.filter(c => c.tribe !== NATURE_TRIBE && c.sent!.some(n => n > 0));
  if (armed.length !== 1) return none(armed.length ? "Several armies defended; their smithy levels can't be told apart." : "No defending troops that a smithy upgrades.");
  const stat = d.attackKind === "inf" ? "defInf" : "defCav";
  let constant = 0;
  for (const c of d.contingents) if (c.tribe === NATURE_TRIBE) c.sent!.forEach((n, i) => { const a = NATURE[i]; if (a && n > 0) constant += n * upgraded(a[stat], a.upkeep, 0); });
  const army = armed[0], units = UNITS[army.tribe!];
  const terms: Term[] = [];
  army.sent!.forEach((n, i) => {
    const u = units[i];
    if (!u || !(n > 0)) return;
    if (i < UPGRADABLE) terms.push({ i, name: u.name, value: l => n * upgraded(u[stat], u.upkeep, l) });
    else constant += n * upgraded(u[stat], u.upkeep, 0);
  });
  // Shown defence = (units + base + wall's flat defence) * wall bonus.
  const bonus = wallBonus(d.wall.tribe, d.wall.level);
  constant += BASE_DEFENCE + wallDefence(d.wall.tribe, d.wall.level);
  const hero = d.contingents.some(c => c.hero);
  return solve(terms, constant, hero ? -Infinity : (d.strength - 1) / bonus, (d.strength + 1) / bonus, hero, "defending units");
}
