import { UNITS } from "../data";
import type { Res4 } from "../types";
import { battle, type Army, type BattleInput, type BattleMode, type BattleResult } from "./combat";

/*
 * Army optimizer: which troops to send to attack a village, or to reinforce one.
 *
 * Search method. An army is a vector of counts over the allowed unit types (by default
 * infantry and cavalry; scouts, chiefs, settlers and siege are left out). It is split into
 * a direction (how the army is mixed) and a scale (how big it is):
 *   - optimal mode: the direction shares a resource budget between unit types and the scale is
 *     that budget, up to the cap: count_i = floor(budget * share_i / cost_i);
 *   - owned mode: the direction is the fraction of each type's available troops (largest = 1)
 *     and the scale t in (0, 1] multiplies it: count_i = floor(t * fraction_i * available_i).
 * 1. Directions come from an even grid over the simplex of unit types (about 130 at most).
 * 2. For each direction, a bisection over the scale finds the smallest army that still wins
 *    (winning only grows with the scale), and a fixed geometric ladder of scales (×0.8 steps
 *    in owned mode, budgets 100 × 1.25^j in optimal mode) plus the largest scale samples the rest.
 * 3. The best few distinct armies are then improved by local search on whole units:
 *    add or remove a step of one type, or (optimal mode) trade one type for another
 *    within the cap, halving the step down to one unit.
 * Every army is scored with battle(), so a win the optimizer reports is a win battle() gives.
 * About 5,000 battles per search, a few tens of milliseconds.
 *
 * Attacks with owned troops search each village on its own (one attack comes from one village;
 * splitting an attack across villages is Phase 5). Reinforcements can come from several villages
 * at once, each as its own contingent with its own smithy levels.
 */

export type Objective =
  /** Among winning armies, the fewest own losses by resource value. */
  | "fewestLosses"
  /** The cheapest army that still wins. */
  | "smallestWin"
  /** The most enemy losses by resource value (no need to win). */
  | "mostEnemyLosses"
  /** Attacks only: resources carried home minus own losses by resource value. */
  | "mostLoot";

export type TroopSource =
  /** Troops available per village (as the Troops tab gives) with each village's smithy levels. */
  | { kind: "owned"; villages: { name: string; counts: number[]; smithy?: number[] }[] }
  /** Any units of the tribe at these smithy levels, total cost (all four resources) at most `cap`. */
  | { kind: "optimal"; cap: number; smithy?: number[] };

interface CommonInput {
  /** The player's tribe: the troops searched over. */
  tribe: string;
  source: TroopSource;
  objective: Objective;
  mode: BattleMode;
  /** Unit indices to search over; default every infantry and cavalry unit. */
  units?: number[];
  /** Count wounded troops as recovered (healed) rather than lost. Default false. */
  woundedRecoverable?: boolean;
  /** How many alternatives to return besides the best; default 2. */
  alternatives?: number;
  /** Drop unit types worth under TRIM_SHARE of each result's army (see `trimOption`). Default false. */
  trim?: boolean;
  attackerPop?: number;
  defenderPop?: number;
}

export interface AttackInput extends CommonInput {
  side: "attack";
  /** The target's troops: its own and any reinforcements (e.g. from a scout report). */
  defenders: Army[];
  village: BattleInput["village"];
  /** What scouts saw, for loot: resources and cranny capacity (protected per resource). */
  loot?: { res: Res4; crannyCapacity: number };
}

export interface DefendInput extends CommonInput {
  side: "defend";
  /** The incoming army. */
  attacker: Army;
  /** Troops already in the village (counted as ours). */
  home: Army[];
  village: BattleInput["village"];
}

export type OptimizeInput = AttackInput | DefendInput;

export interface ArmyOption {
  /** What to send: one army for an attack; one contingent per sending village for reinforcements. */
  sent: { village: string | null; army: Army }[];
  /** Total units sent by unit index. */
  counts: number[];
  /** Resource value (sum of the four costs) of the troops sent. */
  cost: number;
  result: BattleResult;
  /** Attack: the attacker wins. Defence: the village holds. */
  win: boolean;
  /** Resource value of our troops lost (defence: home troops included), and of those wounded among them. */
  ownLost: number;
  ownWounded: number;
  /** Own losses as the objective counts them: wounded subtracted when they are recoverable. */
  ownLossValue: number;
  enemyLost: number;
  /** Attack: resources carried home (survivors' capacity, limited by what's above the cranny when known). */
  loot: number | null;
  score: number;
  /** Set when small leftovers were trimmed: units removed by index, and own loss value after minus before. */
  trimmed?: { counts: number[]; lossDelta: number };
}

/** Trimming drops unit types worth less than this share of the army's resource value. */
export const TRIM_SHARE = 0.02;

export interface OptimizeResult {
  best: ArmyOption | null;
  alternatives: ArmyOption[];
  /** Battles simulated. */
  evaluated: number;
}

/** Resource value of one unit: the sum of its four costs (0 for animals and unknown tribes). */
export function unitValue(tribe: string, i: number): number {
  const u = UNITS[tribe]?.[i];
  return u ? u.cost[0] + u.cost[1] + u.cost[2] + u.cost[3] : 0;
}

/** Resource value of an army's counts. */
export function armyValue(tribe: string, counts: number[]): number {
  return counts.reduce((s, n, i) => s + n * unitValue(tribe, i), 0);
}

/** Default unit types to search: infantry and cavalry. */
export function combatUnits(tribe: string): number[] {
  return (UNITS[tribe] ?? []).flatMap((u, i) => (u.kind === "inf" || u.kind === "cav" ? [i] : []));
}

/** Resources a raid or attack can take: what's above the cranny capacity, per resource. */
export function lootable(res: Res4, crannyCapacity: number): number {
  return res.reduce((s, r) => s + Math.max(0, r - crannyCapacity), 0);
}

/** A group of villages (or the "optimal" pool) that one search draws troops from. */
interface Pool {
  villages: { name: string | null; avail: number[] | null; smithy?: number[] }[];
}

const zeros = () => Array(10).fill(0) as number[];

export function optimize(input: OptimizeInput): OptimizeResult {
  if (input.side === "defend" && input.objective === "mostLoot") throw new Error("mostLoot is only for attacks");
  const units = UNITS[input.tribe];
  if (!units) throw new Error(`Unknown tribe: ${input.tribe}`);
  const allowed = input.units ?? combatUnits(input.tribe);
  const value = units.map((_, i) => unitValue(input.tribe, i));
  const src = input.source;
  const pools: Pool[] = src.kind === "optimal"
    ? [{ villages: [{ name: null, avail: null, smithy: src.smithy }] }]
    : input.side === "attack"
      ? src.villages.map(v => ({ villages: [{ name: v.name, avail: v.counts, smithy: v.smithy }] }))
      : [{ villages: src.villages.map(v => ({ name: v.name, avail: v.counts, smithy: v.smithy })) }];

  let evaluated = 0;
  const seen = new Map<string, ArmyOption>();

  /** Simulates the battle for these counts per village of the pool, once per distinct army. */
  const evaluate = (pool: Pool, per: number[][]): ArmyOption => {
    const key = pool.villages.map(v => v.name).join("|") + ":" + per.map(c => c.join(",")).join(";");
    let option = seen.get(key);
    if (!option) { evaluated++; option = simulateOption(input, pool.villages, per); seen.set(key, option); }
    return option;
  };

  for (const pool of pools) searchPool(pool, input, allowed, value, evaluate);

  const all = [...seen.values()].filter(o => o.score > -Infinity).sort((a, b) => b.score - a.score);
  const picked: ArmyOption[] = [];
  const mix = (o: ArmyOption) => mainMix(o, input.tribe);
  const want = 1 + (input.alternatives ?? 2);
  for (const found of all) {
    if (picked.length >= want) break;
    const o = input.trim ? trimOption(input, found) : found;
    if (input.trim) evaluated += o === found ? 0 : 1;
    // Different from those already picked: another main mix or village, or a cost at least 10% apart.
    if (picked.every(p => mix(p) !== mix(o) || Math.abs(p.cost - o.cost) > 0.1 * Math.max(p.cost, o.cost))) picked.push(o);
  }
  return { best: picked[0] ?? null, alternatives: picked.slice(1), evaluated };
}

/** Simulates one army (counts per sending village) against the input's enemy and scores it for the objective. */
export function simulateOption(input: OptimizeInput, villages: { name: string | null; smithy?: number[] }[], per: number[][]): ArmyOption {
  const units = UNITS[input.tribe] ?? [];
  const sent = villages
    .map((v, k) => ({ village: v.name, army: { tribe: input.tribe, counts: per[k], ...(v.smithy ? { smithy: v.smithy } : {}) } as Army }))
    .filter(s => s.army.counts.some(n => n > 0));
  const counts = zeros();
  for (const c of per) c.forEach((n, i) => (counts[i] += n));
  const cost = armyValue(input.tribe, counts);
  let result: BattleResult, win: boolean, ownLost: number, ownWounded: number, enemyLost: number, loot: number | null = null;
  if (input.side === "attack") {
    const attacker: Army = sent[0]?.army ?? { tribe: input.tribe, counts: zeros() };
    result = battle({ attacker, defenders: input.defenders, village: input.village, mode: input.mode, attackerPop: input.attackerPop, defenderPop: input.defenderPop });
    win = result.winner === "attacker";
    ownLost = armyValue(input.tribe, result.attackerLosses);
    ownWounded = armyValue(input.tribe, result.attackerWounded);
    enemyLost = input.defenders.reduce((s, d, k) => s + armyValue(d.tribe, result.defenderLosses[k]), 0);
    const carry = attacker.counts.reduce((s, n, i) => s + (n - result.attackerLosses[i]) * (units[i]?.carry ?? 0), 0);
    loot = input.loot ? Math.min(carry, lootable(input.loot.res, input.loot.crannyCapacity)) : carry;
  } else {
    const defenders = [...input.home, ...sent.map(s => s.army)];
    result = battle({ attacker: input.attacker, defenders, village: input.village, mode: input.mode, attackerPop: input.attackerPop, defenderPop: input.defenderPop });
    win = result.winner === "defender";
    ownLost = defenders.reduce((s, d, k) => s + armyValue(d.tribe, result.defenderLosses[k]), 0);
    ownWounded = defenders.reduce((s, d, k) => s + armyValue(d.tribe, result.defenderWounded[k]), 0);
    enemyLost = armyValue(input.attacker.tribe, result.attackerLosses);
  }
  const ownLossValue = ownLost - (input.woundedRecoverable ? ownWounded : 0);
  const tiny = 1e-6;
  let score: number;
  switch (input.objective) {
    case "fewestLosses": score = win ? -ownLossValue - tiny * cost : -Infinity; break;
    case "smallestWin": score = win ? -cost - tiny * ownLossValue : -Infinity; break;
    case "mostEnemyLosses": score = enemyLost - tiny * ownLossValue; break;
    case "mostLoot": score = (loot ?? 0) - ownLossValue - tiny * cost; break;
  }
  // An attack has to send something; a defence may need no reinforcements at all.
  if (input.side === "attack" && !sent.length) score = -Infinity;
  return { sent, counts, cost, result, win, ownLost, ownWounded, ownLossValue, enemyLost, loot, score };
}

/**
 * Drops small leftovers from an army: unit types worth under TRIM_SHARE of its resource value,
 * never the most valuable type. The army is simulated again; if it won before and the trimmed one
 * doesn't, removed types are put back, most valuable first, until it wins again.
 * Returns the option unchanged when there is nothing to trim.
 */
export function trimOption(input: OptimizeInput, o: ArmyOption): ArmyOption {
  if (!o.sent.length || !(o.cost > 0)) return o;
  const worth = o.counts.map((n, i) => n * unitValue(input.tribe, i));
  const top = worth.indexOf(Math.max(...worth));
  let drop = worth.flatMap((w, i) => (o.counts[i] > 0 && i !== top && w < TRIM_SHARE * o.cost ? [i] : []));
  if (!drop.length) return o;
  const villages = o.sent.map(s => ({ name: s.village, smithy: s.army.smithy }));
  const run = (d: number[]) => simulateOption(input, villages, o.sent.map(s => s.army.counts.map((n, i) => (d.includes(i) ? 0 : n))));
  let t = run(drop);
  // Put back what the win needs, the most valuable removed type first.
  for (const i of [...drop].sort((a, b) => worth[b] - worth[a])) {
    if (!o.win || t.win) break;
    drop = drop.filter(j => j !== i);
    t = run(drop);
  }
  if (!drop.length) return o;
  return { ...t, trimmed: { counts: o.counts.map((n, i) => (drop.includes(i) ? n : 0)), lossDelta: t.ownLossValue - o.ownLossValue } };
}

/** The unit types making up at least 10% of an army's value, and where it comes from: what tells two options apart. */
export function mainMix(o: Pick<ArmyOption, "counts" | "cost" | "sent">, tribe: string): string {
  const main = o.counts.map((n, i) => (o.cost > 0 && n * unitValue(tribe, i) >= 0.1 * o.cost ? 1 : 0)).join("");
  return main + "|" + o.sent.map(s => s.village).join(",");
}

/** Even grid over the simplex of `m` weights: all compositions of `g` into m parts, divided by g. */
export function simplexGrid(m: number, maxPoints = 130): number[][] {
  if (m <= 0) return [];
  let g = 1;
  const count = (g: number) => { let c = 1; for (let k = 1; k < m; k++) c = (c * (g + k)) / k; return Math.round(c); };
  while (g < 12 && count(g + 1) <= maxPoints) g++;
  const out: number[][] = [];
  const rec = (left: number, acc: number[]) => {
    if (acc.length === m - 1) { out.push([...acc, left].map(x => x / g)); return; }
    for (let x = left; x >= 0; x--) rec(left - x, [...acc, x]);
  };
  rec(g, []);
  return out;
}

function searchPool(
  pool: Pool,
  input: OptimizeInput,
  allowed: number[],
  value: number[],
  evaluate: (pool: Pool, per: number[][]) => ArmyOption,
): void {
  const optimal = input.source.kind === "optimal";
  const cap = input.source.kind === "optimal" ? input.source.cap : 0;
  const types = allowed.filter(i => (optimal ? value[i] > 0 : pool.villages.some(v => (v.avail?.[i] ?? 0) > 0)));
  const bounds = pool.villages.map(v => zeros().map((_, i) => (!types.includes(i) ? 0 : v.avail ? (v.avail[i] ?? 0) : Infinity)));
  if (!types.length) { evaluate(pool, pool.villages.map(zeros)); return; }

  // Counts per village for a direction (weights over `types`) and a scale.
  const build = (dir: number[], scale: number): number[][] => pool.villages.map((_, k) => {
    const c = zeros();
    types.forEach((i, j) => {
      c[i] = optimal ? Math.floor((scale * dir[j]) / value[i]) : Math.floor(scale * dir[j] * bounds[k][i] + 1e-9);
    });
    return c;
  });
  // Scales are whole steps so bisection is exact: resources in optimal mode, 1/1024 of the troops in owned mode.
  const maxStep = optimal ? Math.floor(cap) : 1024;
  const scaleOf = (step: number) => (optimal ? step : step / 1024);
  const ladder: number[] = [];
  if (optimal) for (let b = 100; b < maxStep; b *= 1.25) ladder.push(Math.round(b));
  else for (let t = 1024 * 0.8; t >= 4; t *= 0.8) ladder.push(Math.round(t));
  ladder.push(maxStep);

  const needWin = input.objective === "fewestLosses" || input.objective === "smallestWin";
  const starts: ArmyOption[] = [];
  for (let dir of simplexGrid(types.length)) {
    if (!optimal) { const m = Math.max(...dir); dir = dir.map(x => x / m); }
    const at = (step: number) => evaluate(pool, build(dir, scaleOf(step)));
    const top = at(maxStep);
    let threshold: number | null = null;
    if (top.win) {
      let lo = 0, hi = maxStep;  // lo loses (or is empty), hi wins
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (at(mid).win) hi = mid; else lo = mid; }
      threshold = hi;
      starts.push(at(hi));
    }
    if (input.objective === "smallestWin") continue;
    for (const step of ladder) if (!needWin || (threshold !== null && step >= threshold)) starts.push(at(step));
    starts.push(top);
  }

  // Local search from the best few distinct starting armies.
  const ranked = [...new Set(starts)].filter(o => o.score > -Infinity).sort((a, b) => b.score - a.score).slice(0, 5);
  for (const start of ranked) refine(pool, start, types, bounds, optimal ? cap : Infinity, value, evaluate);
}

/** Local search on whole units: add or remove one type, or trade one type for another (cap permitting). */
function refine(
  pool: Pool,
  start: ArmyOption,
  types: number[],
  bounds: number[][],
  cap: number,
  value: number[],
  evaluate: (pool: Pool, per: number[][]) => ArmyOption,
): void {
  const per = pool.villages.map(v => {
    const s = start.sent.find(x => x.village === v.name);
    return s ? [...s.army.counts] : zeros();
  });
  let best = start;
  const fits = (p: number[][]) =>
    p.every((c, k) => c.every((n, i) => n >= 0 && n <= bounds[k][i])) &&
    p.reduce((s, c) => s + c.reduce((t, n, i) => t + n * value[i], 0), 0) <= cap;
  const total = Math.max(1, ...per.flat());
  for (let step = Math.max(1, Math.floor(total / 8)); step >= 1; step = step === 1 ? 0 : Math.max(1, step >> 1)) {
    for (let pass = 0, improved = true; improved && pass < 20; pass++) {
      improved = false;
      const moves: number[][][] = [];
      per.forEach((c, k) => types.forEach(i => {
        for (const d of [step, -step]) { const p = per.map(x => [...x]); p[k][i] += d; moves.push(p); }
        // Trade `step` of type i for as many of type j as the freed resources buy.
        if (cap < Infinity) types.forEach(j => {
          if (j === i || c[i] < step) return;
          const p = per.map(x => [...x]);
          p[k][i] -= step; p[k][j] += Math.max(1, Math.floor((step * value[i]) / value[j]));
          moves.push(p);
        });
      }));
      for (const p of moves) {
        if (!fits(p)) continue;
        const o = evaluate(pool, p);
        if (o.score > best.score) { best = o; per.splice(0, per.length, ...p); improved = true; }
      }
    }
  }
}
