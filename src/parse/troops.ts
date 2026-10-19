import type { Army } from "../calc/combat";

/*
 * Reads a pasted copy of the village overview's Troops tab.
 * The format is not implemented yet: it waits for a real sample from the game.
 */

/** Troops per village, by unit index into UNITS[tribe]. */
export interface TroopsImport {
  /** The player's tribe, if the page tells (all villages of an account share it). */
  tribe: string | null;
  villages: { name: string; counts: number[] }[];
}

/** Parses a pasted Troops tab. Not implemented yet. */
export function parseTroops(_text: string): TroopsImport {
  return { tribe: null, villages: [] };
}

/** One village's troops as an army for combat.ts, or null when the tribe is unknown or the village isn't there. */
export function villageArmy(imp: TroopsImport, name: string, smithy?: number[]): Army | null {
  const v = imp.villages.find(x => x.name === name);
  if (!v || !imp.tribe) return null;
  return { tribe: imp.tribe, counts: [...v.counts], ...(smithy ? { smithy } : {}) };
}
