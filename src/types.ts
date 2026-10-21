/** Wood, clay, iron, crop — always in this order. */
export type Res4 = [number, number, number, number];

/** Which building trains a unit: Barracks, Stable, Workshop, Residence/Palace. */
export type TrainingBuilding = "B" | "S" | "W" | "R";

/** Scouts, siege and admin units (chiefs, settlers) fight as infantry; only "cav" counts as cavalry. */
export type UnitKind = "inf" | "cav" | "scout" | "siege" | "admin";

export interface Unit {
  name: string;
  cost: Res4;
  upkeep: number;
  /** Base training time in seconds at 1× speed and building level 1. 0 = unknown. */
  time: number;
  building: TrainingBuilding;
  /** Attack value at smithy level 0. */
  att: number;
  /** Defence against infantry. */
  defInf: number;
  /** Defence against cavalry. */
  defCav: number;
  /** Fields per hour at 1× speed. */
  speed: number;
  /** Resources one unit carries home from a raid or attack. */
  carry: number;
  kind: UnitKind;
}

export interface Building {
  name: string;
  /** Level 1 cost. */
  cost: Res4;
  /** Cost growth factor per level. */
  k: number;
  maxLevel: number;
}

export interface Merchant {
  /** Resources one merchant carries. */
  capacity: number;
  /** Fields per hour at 1× speed. */
  speed: number;
}

export interface Celebration {
  name: string;
  cost: Res4;
  /** Minimum town hall level. */
  townHall: number;
}

/** Nature's animals (oasis defenders): combat stats only. Kept apart from UNITS so they are never a playable tribe. */
export interface Animal {
  name: string;
  att: number;
  defInf: number;
  defCav: number;
  upkeep: number;
}

/** A tribe's wall: adds `def * level` to the village's base defence, then multiplies all defence by factor^level. */
export interface Wall {
  name: string;
  factor: number;
  def: number;
}

/** Culture point sources with fixed values (`culture.json`). */
export interface CultureData {
  /** Hero helmets that add culture points per day, "none" first. */
  helmets: { name: string; cpPerDay: number }[];
  /** The daily quests' culture point reward: a flat amount every few days. */
  dailyQuest: { cp: number; everyDays: number };
  /** Town Hall level L makes a celebration last factor^(L-1) of its base time. */
  townHallFactor: number;
  /**
   * Small, then great: culture points at the end, at most the village's or the account's production per day,
   * and the duration in seconds at Town Hall level 1 and speed 1×.
   */
  celebrations: { name: string; cp: number; capBy: "village" | "account"; seconds: number }[];
}
