import type { CultureData } from "../types";

/* Culture points over time and the plan for the next village. All times are seconds from the moment the CP numbers were read. */

export const DAY = 86400;

/** CP per day: villages plus hero, plus the alliance bonus on both, rounded down (1,359 at +4% shows 54, total 1,413). */
export function cpPerDay(villages: number, hero: number, alliancePct: number): number {
  const base = villages + hero;
  return base + Math.floor(base * alliancePct / 100);
}

/**
 * CP a celebration gives when it ends: its amount, at most the village's (small) or the account's (great)
 * CP per day. An unknown (0) production doesn't limit it.
 */
export function celebrationCp(c: CultureData["celebrations"][number], villagePerDay: number, accountPerDay: number): number {
  const cap = c.capBy === "village" ? villagePerDay : accountPerDay;
  return cap > 0 ? Math.min(c.cp, cap) : c.cp;
}

/**
 * Seconds a celebration lasts: its base time × factor^(Town Hall level - 1) / server speed
 * (factor 0.964, like the Main Building's, from kirilloid's model; not checked against the game yet).
 */
export function celebrationSeconds(c: CultureData["celebrations"][number], townHall: number, serverSpeed: number, factor: number): number {
  return c.seconds * Math.pow(factor, Math.max(1, townHall || 1) - 1) / (serverSpeed || 1);
}

/** A one-off gain of culture points: a celebration ending, an Artwork, a daily quest reward. */
export interface CpEvent {
  at: number;
  cp: number;
  label: string;
}

/** A reward that repeats: first at `first`, then every `every` seconds (a daily quest, celebrations back to back). */
export interface CpRepeat {
  first: number;
  every: number;
  cp: number;
  label: string;
}

export interface CpForecast {
  /** Seconds until the CP reach the need; 0 if they already do, Infinity if never. */
  seconds: number;
  /** The one-off gains counted before then, in order. */
  events: CpEvent[];
  /** CP from production and from the events by then. */
  fromProduction: number;
  fromEvents: number;
}

/**
 * When culture points reach `need`: they grow by `perDay` all the time and jump at each event and each
 * occurrence of the repeats. Events before 0 are already in `have` and are ignored.
 */
export function cpForecast(have: number, need: number, perDay: number, events: CpEvent[], repeats: (CpRepeat | null | undefined)[] = []): CpForecast {
  const rate = Math.max(0, perDay) / DAY;
  const missing = need - have;
  if (missing <= 0) return { seconds: 0, events: [], fromProduction: 0, fromEvents: 0 };
  const reps = repeats.filter((r): r is CpRepeat => !!r && r.cp > 0 && r.every > 0);
  // Nothing after production alone, or any one repeat alone, gets there can matter.
  let limit = rate > 0 ? missing / rate : Infinity;
  for (const r of reps) limit = Math.min(limit, Math.max(0, r.first) + r.every * Math.ceil(missing / r.cp));
  const all = events.filter(e => e.at >= 0 && e.at <= limit && e.cp > 0);
  for (const r of reps)
    for (let t = r.first; t <= limit; t += r.every) if (t >= 0) all.push({ at: t, cp: r.cp, label: r.label });
  all.sort((a, b) => a.at - b.at);
  let t = 0, cp = have, fromEvents = 0;
  const counted: CpEvent[] = [];
  for (const e of all) {
    const before = cp + rate * (e.at - t);
    if (before >= need) break;
    cp = before + e.cp; t = e.at; fromEvents += e.cp;
    counted.push(e);
    if (cp >= need) return { seconds: t, events: counted, fromProduction: t * rate, fromEvents };
  }
  if (rate <= 0) return { seconds: Infinity, events: counted, fromProduction: 0, fromEvents };
  const seconds = t + (need - cp) / rate;
  return { seconds, events: counted, fromProduction: seconds * rate, fromEvents };
}

/** Settlement slots a Residence or Palace gives at a level: Residence at 10 and 20, Palace at 10, 15 and 20. */
export function slotsAt(building: "Residence" | "Palace", level: number): number {
  const steps = building === "Palace" ? [10, 15, 20] : [10, 20];
  return steps.filter(l => level >= l).length;
}

/** The lowest level with a free slot when `used` slots are taken, or null if the building can't give one. */
export function slotLevel(building: "Residence" | "Palace", used: number): number | null {
  for (let l = 0; l <= 20; l++) if (slotsAt(building, l) > used) return l;
  return null;
}

export interface ExpansionPlan {
  /** When the CP are enough. */
  cpAt: number;
  /** Building and training from now, without waiting: the soonest the settlers could leave. */
  soonest: number;
  /** When the last settler is ready: the CP time, or later if building and training can't make it. */
  readyAt: number;
  /** Latest start for the Residence or Palace upgrades, and for the first settler. */
  buildStart: number;
  settlersStart: number;
  /** Building and training take longer than the wait for the CP. */
  late: boolean;
}

/**
 * Plans backward from the CP time: the settlers train one after another and the last one is ready
 * when the CP are (the game doesn't let settlers leave before). The building upgrades end when the first starts.
 */
export function expansionPlan(cpAt: number, buildSeconds: number, settlerSeconds: number, settlers: number): ExpansionPlan {
  const training = Math.max(0, settlers) * Math.max(0, settlerSeconds), build = Math.max(0, buildSeconds);
  const soonest = build + training;
  const readyAt = Math.max(cpAt, soonest);
  return { cpAt, soonest, readyAt, settlersStart: readyAt - training, buildStart: readyAt - training - build, late: soonest > cpAt };
}
