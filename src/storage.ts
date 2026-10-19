import type { BuildRow } from "./calc/buildings";
import type { TroopMode } from "./calc/troops";
import type { Res4, TrainingBuilding } from "./types";

const KEY = "village-planner-v2";
/** Single-village keys from earlier versions; migrated into the first village once. */
const LEGACY_KEYS = ["village-planner", "npc-planner"];

/** One troop type in the plan. Inputs are kept as typed. */
export interface TroopRow {
  unit: number;
  /** Older saves have no mode; the village-wide `mode` applies (see `normalizeTroops`). */
  mode?: TroopMode;
  ratio: string;
  count: string;
  hours?: string;
  mins?: string;
}

/** Everything the planner shows for one village. Inputs are kept as typed. */
export interface VillageState {
  name: string;
  /** The village's name in the game, remembered from the last import. */
  gameName?: string;
  tribe: string;
  speed: string;
  pref: string;
  /** Village-wide troop mode from before each row had its own. Only read when migrating. */
  mode?: string;
  builds: BuildRow[];
  troops: TroopRow[];
  /** Level and time bonus per training building. */
  train: Partial<Record<TrainingBuilding, { lvl: string; bonus: string }>>;
  /** Number of small and great celebrations. */
  celebs: string[];
  /**
   * Per resource: “do not convert into”. The NPC trade turns all of it into the other
   * resources and its need is claimed from the hero. (Named `hero` since older saves.)
   */
  hero?: boolean[];
  /** Crop production came from the Production tab, which is before troop upkeep. */
  cropGross?: boolean;
  /** When the resource, storage and production numbers were last entered or imported (ms). */
  resAt?: number;
  /** Whether “Max possible” counts on an NPC trade. Missing means yes. */
  useTrade?: boolean;
  /** Saved village the resources are sent from, if any. */
  sendFrom?: string;
  fields: Record<string, string>;
  /** Combat page: this village's own troops and smithy levels, by unit index, as typed or imported. */
  combat?: VillageCombat;
}

export interface VillageCombat {
  troops: string[];
  smithy: string[];
}

/** One army on the combat page, counts as typed. */
export interface CombatArmy {
  tribe: string;
  counts: string[];
}

/** The combat page's inputs, kept as typed. Shared by all villages; absent in older saves. */
export interface CombatState {
  side: "attack" | "defend";
  mode: "normal" | "raid";
  /** Attack: the target's contingents (own troops first, then reinforcements). Defend: the incoming army (first entry). */
  enemy: CombatArmy[];
  /** Tribe of the village being attacked (for its wall); in defend mode, of our defended village. */
  wallTribe: string;
  wall: string;
  /** Target coordinates (attack) or the attacker's (defend), for travel time. */
  x: string;
  y: string;
  /** Scouted resources and cranny capacity, for raids. */
  lootRes: string[];
  cranny: string;
  /** Saved village whose troops we use (attack) or send as reinforcements (defend). */
  village: string;
  /** Defend: troops already in the defended village. */
  home: string[];
  source: "owned" | "optimal";
  cap: string;
  /** Unit indices the optimizer may use, per tribe; missing means the default (infantry and cavalry). */
  allowed: Record<string, number[]>;
  objective: "fewestLosses" | "smallestWin" | "mostEnemyLosses" | "mostLoot";
  woundedRecoverable: boolean;
  ownPop: string;
  enemyPop: string;
}

export interface UnitOverride {
  cost: Res4;
  upkeep: number;
  time: number;
}

export interface Store {
  version: 2;
  current: string;
  villages: Record<string, VillageState>;
  /** Unit stats edited by the user, per tribe and unit index. Shared by all villages. */
  overrides: Record<string, Record<string, UnitOverride>>;
  /** Combat page inputs; added by the combat page, older saves have none. */
  combat?: CombatState;
}

const blank10 = () => Array.from({ length: 10 }, () => "");

export function newCombatArmy(tribe: string): CombatArmy {
  return { tribe, counts: blank10() };
}

export function newCombatState(tribe: string, village: string): CombatState {
  return {
    side: "attack", mode: "normal", enemy: [newCombatArmy(tribe)], wallTribe: tribe, wall: "", x: "", y: "",
    lootRes: ["", "", "", ""], cranny: "", village, home: blank10(), source: "optimal", cap: "100000",
    allowed: {}, objective: "fewestLosses", woundedRecoverable: false, ownPop: "", enemyPop: "",
  };
}

/** The store's combat state, created or completed with defaults so older saves load. */
export function combatOf(store: Store): CombatState {
  const first = store.villages[store.current] ?? Object.values(store.villages)[0];
  const def = newCombatState(first?.tribe ?? "Teutons", store.current);
  const c: CombatState = { ...def, ...(store.combat ?? {}) };
  if (!c.enemy?.length) c.enemy = def.enemy;
  c.enemy = c.enemy.map(a => ({ tribe: a.tribe, counts: pad10(a.counts) }));
  c.home = pad10(c.home);
  c.lootRes = [0, 1, 2, 3].map(i => c.lootRes?.[i] ?? "");
  if (!store.villages[c.village]) c.village = store.current;
  store.combat = c;
  return c;
}

/** A village's combat troops and smithy, created with blanks when missing. */
export function villageCombat(v: VillageState): VillageCombat {
  v.combat = { troops: pad10(v.combat?.troops), smithy: pad10(v.combat?.smithy) };
  return v.combat;
}

const pad10 = (a: string[] | undefined) => Array.from({ length: 10 }, (_, i) => a?.[i] ?? "");

export function newVillage(name: string, tribe: string, speed: string): VillageState {
  return {
    name, tribe, speed, pref: "3", builds: [],
    troops: [newTroop(0)],
    train: {}, celebs: ["", ""], hero: [false, false, false, false],
    fields: {},
  };
}

export const newTroop = (unit: number, mode: TroopMode = "max"): TroopRow => ({ unit, mode, ratio: "1", count: "100", hours: "8", mins: "0" });

/**
 * Gives every troop row its own mode, from the village-wide mode older saves used.
 * "None" becomes no rows. Hours and minutes come from the old shared fields.
 */
export function normalizeTroops(v: VillageState): void {
  if (v.troops.some(r => !r.mode)) {
    const old = v.mode || "max";
    v.troops = old === "none" ? [] : v.troops.map(r => ({
      ...r, mode: r.mode ?? (old as TroopMode),
      hours: r.hours ?? v.fields.hours ?? "8", mins: r.mins ?? v.fields.mins ?? "0",
    }));
  }
  delete v.mode;
}

export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/** Converts a saved state from the single-village versions. */
export function migrateLegacy(s: Record<string, unknown>, building: (tribe: string, unit: number) => TrainingBuilding | undefined): VillageState {
  const str = (v: unknown) => v == null ? "" : String(v);
  const v = newVillage("My village", str(s.tribe), str(s.speed) || "1");
  if (s.pref) v.pref = str(s.pref);
  if (Array.isArray(s.builds)) v.builds = s.builds as BuildRow[];
  const unit = Number(s.unit) || 0;
  v.troops = [{ unit, ratio: "1", count: str(s.count) || "100" }];
  v.mode = str(s.mode) || "max";
  const b = building(v.tribe, unit);
  if (b) v.train[b] = { lvl: str(s.lvl) || "1", bonus: str(s.bonus) };
  for (const f of ["have0", "have1", "have2", "have3", "wh", "gr", "hours", "mins", "dist", "merchCap", "merchSpeed"])
    if (s[f] != null && s[f] !== "") v.fields[f] = str(s[f]);
  normalizeTroops(v);
  return v;
}

export function saveStore(s: Store): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {}
}

/** Loads the store, migrating a legacy single-village save if there is no new one. */
export function loadStore(building: (tribe: string, unit: number) => TrainingBuilding | undefined): Store | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY)!);
    if (s && s.version === 2 && s.villages && Object.keys(s.villages).length) return s;
  } catch (e) {}
  for (const key of LEGACY_KEYS) {
    try {
      const old = JSON.parse(localStorage.getItem(key)!);
      if (old && typeof old === "object") {
        const id = newId();
        return { version: 2, current: id, villages: { [id]: migrateLegacy(old, building) }, overrides: {} };
      }
    } catch (e) {}
  }
  return null;
}
