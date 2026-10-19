import { NATURE_TRIBE } from "../data";
import type { Res4 } from "../types";
import type { BattleReport } from "./report";

/** What a pasted report fills in on the combat page. */
export interface ReportFill {
  /** Attack: the target's contingents. Defend: the incoming army alone. Hidden or unknown ones are left out. */
  enemy: { tribe: string; counts: number[] }[];
  /** Tribe of the village's owner (decides the wall), when the report shows it. */
  wallTribe: string | null;
  wall: number | null;
  /** The target's coordinates, when the report shows them (oases). */
  coords: { x: number; y: number } | null;
  /** Scouted resources and cranny capacity. */
  loot: { res: Res4; crannyCapacity: number } | null;
  /** Contingents the report hid ("?") or whose tribe wasn't recognised. */
  skipped: number;
}

/**
 * Turns a parsed report into combat page inputs.
 * Attack: the report's defenders are the target (village troops first, then reinforcements).
 * Defend: the report's attacker is the incoming army; its defender's tribe and wall are ours.
 */
export function fillFromReport(r: BattleReport, side: "attack" | "defend"): ReportFill {
  const owner = r.defenders.find(d => d.tribe && d.tribe !== NATURE_TRIBE)?.tribe ?? null;
  const wall = r.wall ? (r.wall.after ?? r.wall.before) : null;
  if (side === "defend") {
    const ok = r.attacker.tribe && r.attacker.sent;
    return { enemy: ok ? [{ tribe: r.attacker.tribe!, counts: [...r.attacker.sent!] }] : [], wallTribe: owner, wall, coords: null, loot: null, skipped: ok ? 0 : 1 };
  }
  const known = r.defenders.filter(d => d.tribe && d.sent);
  return {
    enemy: known.map(d => ({ tribe: d.tribe!, counts: [...d.sent!] })),
    wallTribe: owner,
    wall,
    coords: r.defenders[0]?.coords ?? null,
    loot: r.scouted?.res ? { res: r.scouted.res, crannyCapacity: r.scouted.crannyCapacity ?? 0 } : null,
    skipped: r.defenders.length - known.length,
  };
}
