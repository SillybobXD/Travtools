import { UNITS, WALLS } from "../data";
import type { Unit } from "../types";

/*
 * Travian Legends combat, following the long-standing community model of the
 * T4 battle formulas (as used by kirilloid's simulator). Not yet checked
 * against real reports: see the marked section in combat.test.ts.
 * Hero, artifacts, alliance bonuses, rams/catapults hitting buildings and
 * scouting are not modelled.
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
    /** Defence the village has without troops; defaults to BASE_DEFENCE. */
    baseDefence?: number;
  };
  mode: BattleMode;
  /** Populations for morale; morale is 1 when either is missing. */
  attackerPop?: number;
  defenderPop?: number;
}

export interface BattleResult {
  winner: "attacker" | "defender";
  /** Attack points by kind, smithy included. */
  off: Split;
  /** Final defence: unit defence weighted by the attack's split, plus base defence, times wall and morale. */
  def: number;
  wall: number;
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
}

/** A village without troops still defends with 10 points (before the wall). */
export const BASE_DEFENCE = 10;

const unitsOf = (tribe: string): Unit[] => {
  const units = UNITS[tribe];
  if (!units) throw new Error(`Unknown tribe: ${tribe}`);
  return units;
};

/**
 * Attack or defence value after smithy upgrades:
 * `value + (value + 300 * upkeep / 7) * (1.007^level - 1)`.
 */
export function upgraded(value: number, upkeep: number, level: number): number {
  return level > 0 ? value + (value + 300 * upkeep / 7) * (1.007 ** level - 1) : value;
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
 * Defence weighted by the attack's mix: `defInf * offInf / off + defCav * offCav / off`.
 * With no attack points it counts as infantry.
 */
export function weightedDefence(def: Split, off: Split): number {
  const total = off.inf + off.cav;
  return total > 0 ? (def.inf * off.inf + def.cav * off.cav) / total : def.inf;
}

/** Wall multiplier: the village owner's wall factor ^ level (e.g. Roman city wall 1.03^level). */
export function wallBonus(tribe: string, level: number): number {
  const wall = WALLS[tribe];
  if (!wall) throw new Error(`Unknown tribe: ${tribe}`);
  return level > 0 ? wall.factor ** level : 1;
}

/**
 * Morale: a defence multiplier when the attacker has more population.
 * `(attackerPop / defenderPop) ^ (0.2 * min(1, off / def))`, at most 1.5, 1 when the attacker is not bigger.
 * `off / def` (defence before morale) weakens morale when the attack is weaker than the defence.
 */
export function morale(attackerPop: number, defenderPop: number, off: number, def: number): number {
  if (!(attackerPop > defenderPop) || !(defenderPop > 0)) return 1;
  const ratio = def > 0 ? Math.min(1, off / def) : 1;
  return Math.min(1.5, (attackerPop / defenderPop) ** (0.2 * ratio));
}

/**
 * Exponent for losses, from the number of units on both sides:
 * `2 * (1.8592 - units^0.015)`, kept within 1.2578..1.5.
 * It is 1.5 up to about 1,000 units and falls to 1.2578 at about 1,000,000,
 * so in very large battles the winner loses more.
 */
export function massFactor(units: number): number {
  const k = 2 * (1.8592 - Math.max(0, units) ** 0.015);
  return Math.min(1.5, Math.max(1.2578, k));
}

/**
 * Share of each side lost, from attack and final defence points and the mass factor `k`.
 * Normal attack: the stronger side wins (the defender on a tie), the loser loses everything
 * and the winner loses `(loser / winner)^k`.
 * Raid: with `x = (off / def)^k` the attacker loses `1 / (1 + x)` and the defender `x / (1 + x)`.
 */
export function lossShares(off: number, def: number, mode: BattleMode, k: number): { attacker: number; defender: number } {
  if (!(def > 0)) return { attacker: 0, defender: off > 0 ? 1 : 0 };
  if (!(off > 0)) return { attacker: 1, defender: 0 };
  if (mode === "raid") {
    const x = (off / def) ** k;
    return { attacker: 1 / (1 + x), defender: x / (1 + x) };
  }
  return off > def
    ? { attacker: (def / off) ** k, defender: 1 }
    : { attacker: 1, defender: (off / def) ** k };
}

/** Units lost by index: each count times the share, rounded to the nearest unit. */
export function unitLosses(counts: number[], share: number): number[] {
  return counts.map(n => (n > 0 ? Math.round(n * share) : 0));
}

const countUnits = (army: Army) => army.counts.reduce((s, n) => s + (n > 0 ? n : 0), 0);

/** One battle: attack, defence, wall, morale, mass factor, then losses for both sides. */
export function battle(input: BattleInput): BattleResult {
  const { attacker, defenders, village, mode } = input;
  const off = attackPower(attacker);
  const offTotal = off.inf + off.cav;
  const wall = wallBonus(village.tribe, village.wall ?? 0);
  const before = (weightedDefence(defencePower(defenders), off) + (village.baseDefence ?? BASE_DEFENCE)) * wall;
  const m = morale(input.attackerPop ?? 0, input.defenderPop ?? 0, offTotal, before);
  const def = before * m;
  const k = massFactor(countUnits(attacker) + defenders.reduce((s, a) => s + countUnits(a), 0));
  const loss = lossShares(offTotal, def, mode, k);
  return {
    winner: offTotal > def ? "attacker" : "defender",
    off,
    def,
    wall,
    morale: m,
    massFactor: k,
    attackerLoss: loss.attacker,
    defenderLoss: loss.defender,
    attackerLosses: unitLosses(attacker.counts, loss.attacker),
    defenderLosses: defenders.map(a => unitLosses(a.counts, loss.defender)),
  };
}
