import { NATURE, NATURE_TRIBE, UNITS, WALLS } from "../data";
import type { Unit } from "../types";

/*
 * Travian Legends combat, following the T4 model of kirilloid's simulator
 * (github.com/kirilloid/travian, src/model/t4/combat), checked against the
 * game's own Combat Simulator in combat.test.ts.
 * Hero, artifacts, alliance bonuses, residence/palace defence, rams and
 * catapults hitting buildings, and scouting are not modelled.
 */

/** Troops of one tribe: count per unit index, smithy level per unit index (missing = 0). */
export interface Army {
  tribe: string;
  counts: number[];
  smithy?: number[];
}

/** Points split by what they fight: infantry and cavalry. */
export interface Split {
  inf: number;
  cav: number;
}

export type BattleMode = "normal" | "raid";

export interface BattleInput {
  attacker: Army;
  /** The village's own troops and any reinforcements, each with its own tribe and smithy. May be empty. */
  defenders: Army[];
  /** The village owner's tribe picks the wall type. */
  village: {
    tribe: string;
    wall?: number;
    /** Defence the village has without troops or wall; defaults to BASE_DEFENCE. */
    baseDefence?: number;
  };
  mode: BattleMode;
  /** Populations for morale; morale is 1 when either is missing. */
  attackerPop?: number;
  defenderPop?: number;
}

export interface BattleResult {
  winner: "attacker" | "defender";
  /** Attack points by kind, smithy included, before morale. */
  off: Split;
  /** Final attack: off.inf + off.cav, times morale. */
  attack: number;
  /** Final defence: unit defence weighted by the attack's split, plus base and wall defence, times the wall bonus. */
  def: number;
  /** Wall multiplier. */
  wall: number;
  /** Attack multiplier, 0.667..1. */
  morale: number;
  /** Exponent from the number of troops in the battle (1.5 for small battles). */
  massFactor: number;
  /** Share of each side lost, 0..1. */
  attackerLoss: number;
  defenderLoss: number;
  /** Units lost by index. */
  attackerLosses: number[];
  /** Units lost per defending contingent, in the order given. */
  defenderLosses: number[][];
  /** Of the units lost, how many the game lists as wounded (WOUNDED_SHARE, rounded down). */
  attackerWounded: number[];
  defenderWounded: number[][];
}

/** A village without troops still defends with 10 points (before the wall). */
export const BASE_DEFENCE = 10;
/** The game's simulator lists 40% of each unit type's losses (rounded down) as wounded; siege units are never wounded. */
export const WOUNDED_SHARE = 0.4;

const round = (precision: number) => (n: number) => Math.round(n / precision) * precision;
const round4 = round(1e-4);
const round3 = round(1e-3);

/** What combat needs from a unit. Animals fight as infantry. */
type CombatUnit = Pick<Unit, "att" | "defInf" | "defCav" | "upkeep" | "kind">;
const ANIMALS: CombatUnit[] = NATURE.map(a => ({ ...a, kind: "inf" }));

/** A tribe's units, or Nature's animals for NATURE_TRIBE. */
const unitsOf = (tribe: string): CombatUnit[] => {
  const units = tribe === NATURE_TRIBE ? ANIMALS : UNITS[tribe];
  if (!units) throw new Error(`Unknown tribe: ${tribe}`);
  return units;
};

/**
 * A unit's attack or defence value with smithy upgrades, rounded to 4 decimals.
 * With `u = upkeep / 1.007`: `value + (value + 300 * u / 7) * (1.007^level - 1) + u * 0.0021`.
 * The last term makes even level 0 slightly above the base value (Clubswinger 40.0021),
 * which shows in the game's combat strength for large armies.
 */
export function upgraded(value: number, upkeep: number, level: number): number {
  const u = upkeep / 1.007;
  return round4(value + (value + 300 * u / 7) * (1.007 ** level - 1) + u * 0.0021);
}

/** Attack points split into infantry and cavalry. Only "cav" units count as cavalry; scouts, siege and admin units attack as infantry. */
export function attackPower(army: Army): Split {
  const units = unitsOf(army.tribe);
  const out: Split = { inf: 0, cav: 0 };
  army.counts.forEach((n, i) => {
    const u = units[i];
    if (!u || !(n > 0)) return;
    const pts = n * upgraded(u.att, u.upkeep, army.smithy?.[i] ?? 0);
    if (u.kind === "cav") out.cav += pts; else out.inf += pts;
  });
  return out;
}

/** Defence points of all contingents against infantry and against cavalry, each with its own tribe and smithy. */
export function defencePower(armies: Army[]): Split {
  const out: Split = { inf: 0, cav: 0 };
  for (const army of armies) {
    const units = unitsOf(army.tribe);
    army.counts.forEach((n, i) => {
      const u = units[i];
      if (!u || !(n > 0)) return;
      const lvl = army.smithy?.[i] ?? 0;
      out.inf += n * upgraded(u.defInf, u.upkeep, lvl);
      out.cav += n * upgraded(u.defCav, u.upkeep, lvl);
    });
  }
  return out;
}

/**
 * Defence weighted by the attack's mix: `defInf * infShare + defCav * cavShare`,
 * shares `offInf / off` and `offCav / off` rounded to 4 decimals.
 * With no attack points it counts as infantry.
 */
export function weightedDefence(def: Split, off: Split): number {
  const total = off.inf + off.cav;
  if (!(total > 0)) return def.inf;
  return def.inf * round4(off.inf / total) + def.cav * round4(off.cav / total);
}

const wallOf = (tribe: string) => {
  const wall = WALLS[tribe];
  if (!wall) throw new Error(`Unknown tribe: ${tribe}`);
  return wall;
};

/** Wall multiplier: the village owner's wall factor ^ level, rounded to 3 decimals (Palisade 10: 1.280). */
export function wallBonus(tribe: string, level: number): number {
  return level > 0 ? round3(wallOf(tribe).factor ** level) : 1;
}

/** Flat defence the wall adds before the multiplier: `def * level` (Roman 10, Gaul 8, Teuton 6 per level). */
export function wallDefence(tribe: string, level: number): number {
  return level > 0 ? wallOf(tribe).def * level : 0;
}

/**
 * Morale: an attack multiplier when the attacker has more population.
 * `(attackerPop / max(defenderPop, 3)) ^ (-0.2 * min(1, off / def))`, rounded to 3 decimals, at least 0.667;
 * 1 when the attacker is not bigger. `off / def` is before morale, so a weak attack is hit less.
 */
export function morale(attackerPop: number, defenderPop: number, off: number, def: number): number {
  if (!(attackerPop > defenderPop) || !(defenderPop > 0)) return 1;
  const ratio = def > 0 ? Math.min(1, off / def) : 1;
  return Math.max(0.667, round3((attackerPop / Math.max(defenderPop, 3)) ** (-0.2 * ratio)));
}

/**
 * Exponent for losses, from the number of units on both sides:
 * `2 * (1.8592 - units^0.015)`, kept within 1.2578..1.5 and rounded to 0.0002.
 * It is 1.5 up to about 1,000 units and falls to 1.2578 at about 1,000,000,
 * so in very large battles the winner loses more.
 */
export function massFactor(units: number): number {
  const k = 2 * (1.8592 - Math.max(0, units) ** 0.015);
  return round(0.0002)(Math.min(1.5, Math.max(1.2578, k)));
}

/**
 * Share of each side lost, from final attack and defence points and the mass factor `k`.
 * With `x = (off / def)^k`:
 * normal attack: attacker loses `min(1, 1/x)`, defender `min(1, x)` (on a tie both lose everything);
 * raid: attacker loses `1 / (1 + x)`, defender `x / (1 + x)`.
 */
export function lossShares(off: number, def: number, mode: BattleMode, k: number): { attacker: number; defender: number } {
  if (!(def > 0)) return { attacker: 0, defender: off > 0 ? 1 : 0 };
  if (!(off > 0)) return { attacker: 1, defender: 0 };
  const x = (off / def) ** k;
  return mode === "raid"
    ? { attacker: 1 / (1 + x), defender: x / (1 + x) }
    : { attacker: Math.min(1, 1 / x), defender: Math.min(1, x) };
}

/** Units lost by index: survivors are `round(count * (1 - share))`, the rest are lost. */
export function unitLosses(counts: number[], share: number): number[] {
  return counts.map(n => (n > 0 ? n - Math.round(n * (1 - share)) : 0));
}

/** Wounded among the units lost, as the game's simulator lists them: `floor(lost * 0.4)` per unit type, 0 for siege and animals. */
export function woundedOf(tribe: string, losses: number[]): number[] {
  if (tribe === NATURE_TRIBE) return losses.map(() => 0);
  const units = unitsOf(tribe);
  return losses.map((n, i) => (units[i]?.kind === "siege" ? 0 : Math.floor(n * WOUNDED_SHARE + 1e-9)));
}

const countUnits = (army: Army) => army.counts.reduce((s, n) => s + (n > 0 ? n : 0), 0);

/** One battle: attack, defence, wall, morale, mass factor, then losses for both sides. */
export function battle(input: BattleInput): BattleResult {
  const { attacker, defenders, village, mode } = input;
  const off = attackPower(attacker);
  const base = off.inf + off.cav;
  const level = village.wall ?? 0;
  const wall = wallBonus(village.tribe, level);
  const def = (weightedDefence(defencePower(defenders), off) + (village.baseDefence ?? BASE_DEFENCE) + wallDefence(village.tribe, level)) * wall;
  const m = morale(input.attackerPop ?? 0, input.defenderPop ?? 0, base, def);
  const attack = base * m;
  const k = massFactor(countUnits(attacker) + defenders.reduce((s, a) => s + countUnits(a), 0));
  const loss = lossShares(attack, def, mode, k);
  // A single attacking unit with under 84.5 attack (after morale) always dies.
  if (countUnits(attacker) === 1 && attack < 84.5) loss.attacker = 1;
  const attackerLosses = unitLosses(attacker.counts, loss.attacker);
  const defenderLosses = defenders.map(a => unitLosses(a.counts, loss.defender));
  return {
    winner: attack > def ? "attacker" : "defender",
    off,
    attack,
    def,
    wall,
    morale: m,
    massFactor: k,
    attackerLoss: loss.attacker,
    defenderLoss: loss.defender,
    attackerLosses,
    defenderLosses,
    attackerWounded: woundedOf(attacker.tribe, attackerLosses),
    defenderWounded: defenderLosses.map((l, i) => woundedOf(defenders[i].tribe, l)),
  };
}
