import type { Army } from "../calc/combat";
import type { Res4 } from "../types";

/*
 * Reads a pasted copy of a battle, raid, scout or defence report.
 * The format is not implemented yet: it waits for real samples from the game
 * (see "Combat optimizer roadmap" in CLAUDE.md). Only the shapes are fixed here,
 * so the optimizer and UI can be built against them.
 */

/** What the report says the attack was. */
export type ReportType = "normal" | "raid" | "scout";

/** One army in a report: unit counts by index into UNITS[tribe]. Rows the report hides are null. */
export interface ReportArmy {
  /** Tribe key as in units.json ("Teutons", "Romans", …), or null if the report doesn't tell. */
  tribe: string | null;
  sent: number[];
  /** Units lost, wounded included (the game's first "−N" row). Null when the report hides it. */
  lost: number[] | null;
  /** Of the lost units, those listed as wounded (the second "−N" row), if the report shows it. */
  wounded: number[] | null;
  /** Units left after the battle: sent − lost. */
  survived: number[] | null;
  /** Whether the hero took part. Hero stats are not read yet. */
  hero: boolean;
}

/** One side's identity as the report shows it; only kept in memory, never in test fixtures. */
export interface ReportPlace {
  player: string | null;
  village: string | null;
  coords: { x: number; y: number } | null;
}

export interface BattleReport {
  type: ReportType | null;
  /** The time the report shows, as written. */
  time: string | null;
  attacker: ReportArmy & ReportPlace;
  /**
   * The defending contingents: the village's own troops first, then each reinforcement.
   * Empty when the attacker saw nothing (e.g. all attackers died).
   */
  defenders: (ReportArmy & ReportPlace)[];
  /** True when the report says the defence could not be seen. */
  defenceHidden: boolean;
  /** Wall level before and after, when the report shows rams' or a scout's result. */
  wall: { before: number | null; after: number | null } | null;
  /** Resources carried home, and how much the survivors could carry, if shown. */
  loot: { res: Res4; carried: number; capacity: number } | null;
  /** What scouts saw: resources and cranny, if shown. */
  scouted: { res: Res4 | null; cranny: number | null } | null;
}

/** Parses a pasted report. Returns null when the text doesn't look like one. Not implemented yet. */
export function parseReport(_text: string): BattleReport | null {
  return null;
}

/** An army for combat.ts from a report row ("sent" before the battle, "survived" after it). Smithy levels aren't in reports. */
export function reportArmy(side: ReportArmy, which: "sent" | "survived", smithy?: number[]): Army | null {
  const counts = side[which];
  if (!side.tribe || !counts) return null;
  return { tribe: side.tribe, counts: [...counts], ...(smithy ? { smithy } : {}) };
}
