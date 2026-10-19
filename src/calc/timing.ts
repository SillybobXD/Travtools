import type { Res4 } from "../types";

const ALL = [true, true, true, true];

/**
 * One resource after `hours` of production: it grows up to its storage cap (or stays put if it is
 * already above it) and shrinks down to 0 when production is negative.
 */
function amountAt(have: number, perHour: number, cap: number, hours: number): number {
  if (perHour >= 0) return have >= cap ? have : Math.min(cap, have + perHour * hours);
  return Math.max(0, have + perHour * hours);
}

/** Hours until a resource stops changing: storage full, or empty. Infinity if never. */
function stopsAt(have: number, perHour: number, cap: number): number {
  if (perHour > 0) return have >= cap ? 0 : cap === Infinity ? Infinity : (cap - have) / perHour;
  if (perHour < 0) return have / -perHour;
  return 0;
}

/**
 * Seconds until the village has `need` of every resource without trading, given production
 * per hour and storage. 0 if it already has. Infinity if production or storage never gets there.
 * Resources not to convert into (`convert[i]` false) are claimed from the hero, so they don't wait.
 */
export function timeToAffordDirect(have: Res4, need: Res4, perHour: Res4, caps: Res4, convert: boolean[] = ALL): number {
  let hours = 0;
  for (let i = 0; i < 4; i++) {
    if (!convert[i] || need[i] <= have[i]) continue;
    if (need[i] > caps[i] || perHour[i] <= 0) return Infinity;
    hours = Math.max(hours, (need[i] - have[i]) / perHour[i]);
  }
  return hours * 3600;
}

/**
 * Seconds until one NPC trade covers the need: the village's total (all resources, each within
 * its storage) reaches the need of the resources the trade may convert into.
 * Exact: the total is piecewise linear, changing slope when a resource fills up or runs out.
 */
export function timeToAffordTrade(have: Res4, need: Res4, perHour: Res4, caps: Res4, convert: boolean[] = ALL): number {
  const target = need.reduce((a, b, i) => a + (convert[i] ? b : 0), 0);
  const total = (h: number) => have.reduce((a, s, i) => a + amountAt(s, perHour[i], caps[i], h), 0);
  const breaks = [...new Set([0, ...have.map((s, i) => stopsAt(s, perHour[i], caps[i])).filter(h => h > 0 && h < Infinity)])].sort((a, b) => a - b);
  for (let k = 0; k < breaks.length; k++) {
    const a = breaks[k], b = k + 1 < breaks.length ? breaks[k + 1] : Infinity;
    const va = total(a);
    if (va >= target) return a * 3600;
    // Resources still changing during this stretch.
    const slope = have.reduce((acc, s, i) => acc + (stopsAt(s, perHour[i], caps[i]) > a ? perHour[i] : 0), 0);
    if (slope > 0) {
      const h = a + (target - va) / slope;
      if (h <= b) return h * 3600;
    }
  }
  return Infinity;
}

/** Seconds until each resource's storage is full; Infinity if it never fills (no production or no cap). */
export function timeToFull(have: Res4, perHour: Res4, caps: Res4): Res4 {
  return have.map((s, i) => perHour[i] > 0 && caps[i] !== Infinity ? Math.max(0, (caps[i] - s) / perHour[i]) * 3600 : Infinity) as Res4;
}

/** Seconds until a resource with negative production runs out; Infinity if it doesn't. */
export function timeToEmpty(have: number, perHour: number): number {
  return perHour < 0 ? Math.max(0, have / -perHour) * 3600 : Infinity;
}
