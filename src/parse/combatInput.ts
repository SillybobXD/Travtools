import { NATURE_TRIBE, UNITS } from "../data";
import { estimateAttackerSmithy, estimateDefenderSmithy, type SmithyEstimate } from "../calc/smithyEstimate";
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

/**
 * Smithy levels the report's combat strength allows for the enemy army: the attacker's in defend mode,
 * the defender's in attack mode. `index` is the army in `fillFromReport(...).enemy` it applies to.
 * Oases (a defender village with coordinates) have no wall; for villages the wall must be in the report.
 */
export function smithyFromReport(r: BattleReport, side: "attack" | "defend"): { estimate: SmithyEstimate; index: number } {
  const known = r.defenders.filter(d => d.tribe && d.sent);
  if (!r.stats) {
    const why = r.type === "scout" ? "Scout reports have no combat strength" : "This report has no combat strength statistics";
    return { estimate: noEstimate(`${why}, so smithy levels can't be estimated.`), index: 0 };
  }
  if (side === "defend") {
    if (!r.attacker.tribe || !r.attacker.sent) return { estimate: noEstimate("The attacker's troops aren't readable, so smithy levels can't be estimated."), index: 0 };
    return { estimate: estimateAttackerSmithy({ tribe: r.attacker.tribe, sent: r.attacker.sent, strength: r.stats.strength[0], hero: !!r.attacker.hero?.sent }), index: 0 };
  }
  const index = Math.max(0, known.findIndex(d => d.tribe !== NATURE_TRIBE && d.sent!.some(n => n > 0)));
  const units = UNITS[r.attacker.tribe ?? ""] ?? [];
  const sent = r.attacker.sent ?? [];
  if (sent.some((n, i) => n > 0 && units[i]?.kind === "siege" && i === 6))
    return { estimate: noEstimate("Rams may have lowered the wall during the battle, so the defence's smithy levels can't be inferred."), index };
  const kinds = new Set(sent.flatMap((n, i) => (n > 0 && units[i] && units[i].att > 0 ? [units[i].kind === "cav" ? "cav" : "inf"] : [])));
  const attackKind = kinds.size === 1 ? ([...kinds][0] as "inf" | "cav") : "mixed";
  const owner = known.find(d => d.tribe !== NATURE_TRIBE)?.tribe ?? null;
  const level = r.wall?.before ?? (r.defenders[0]?.coords ? 0 : null);
  const wall = level !== null && (owner || level === 0) ? { tribe: owner ?? Object.keys(UNITS)[0], level } : null;
  return {
    estimate: estimateDefenderSmithy({
      contingents: r.defenders.map(d => ({ tribe: d.tribe, sent: d.sent, hero: !!d.hero?.sent })),
      strength: r.stats.strength[1], wall, attackKind,
    }),
    index,
  };
}

const noEstimate = (note: string): SmithyEstimate => ({ status: "none", ranges: Array(10).fill(null), suggested: Array(10).fill(0), note });
