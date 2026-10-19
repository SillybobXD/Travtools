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
  /** Fields per hour at 1� speed. */
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

/** A tribe's wall: defence is multiplied by factor^level. */
export interface Wall {
  name: string;
  factor: number;
}
