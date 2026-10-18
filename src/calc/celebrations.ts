import type { Celebration, Res4 } from "../types";

/** Total cost of `qty[i]` celebrations of each type, and the most expensive single one. */
export function celebrationCost(celebrations: Celebration[], qty: number[]): { tot: Res4; peak: Res4 } {
  const tot: Res4 = [0, 0, 0, 0], peak: Res4 = [0, 0, 0, 0];
  celebrations.forEach((c, i) => {
    const n = qty[i] || 0;
    if (n <= 0) return;
    for (let k = 0; k < 4; k++) { tot[k] += c.cost[k] * n; peak[k] = Math.max(peak[k], c.cost[k]); }
  });
  return { tot, peak };
}
