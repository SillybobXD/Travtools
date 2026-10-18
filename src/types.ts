/** Wood, clay, iron, crop — always in this order. */
export type Res4 = [number, number, number, number];

/** Which building trains a unit: Barracks, Stable, Workshop, Residence/Palace. */
export type TrainingBuilding = "B" | "S" | "W" | "R";

export interface Unit {
  name: string;
  cost: Res4;
  upkeep: number;
  /** Base training time in seconds at 1× speed and building level 1. 0 = unknown. */
  time: number;
  building: TrainingBuilding;
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
