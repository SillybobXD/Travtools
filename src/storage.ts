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
  /** Whether “Max possible” counts on an NPC trade. Missing means yes. */
  useTrade?: boolean;
  /** Saved village the resources are sent from, if any. */
  sendFrom?: string;
  fields: Record<string, string>;
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
}

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
