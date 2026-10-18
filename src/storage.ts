import type { BuildRow } from "./calc/buildings";

const KEY = "village-planner";
/** Key used by the older NPC-only planner; read once as a fallback. */
const LEGACY_KEY = "npc-planner";

export interface SavedState {
  tribe?: string;
  unit?: string;
  speed?: string;
  pref?: string;
  mode?: string;
  builds?: BuildRow[];
  [field: string]: unknown;
}

export function saveState(s: SavedState): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {}
}

export function loadState(): SavedState | null {
  let s: SavedState | null = null;
  try { s = JSON.parse(localStorage.getItem(KEY)!); } catch (e) {}
  if (!s) { try { const old = JSON.parse(localStorage.getItem(LEGACY_KEY)!); if (old) s = old; } catch (e) {} }
  return s;
}
