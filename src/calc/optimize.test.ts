import { describe, expect, it } from "vitest";
import { battle, type Army } from "./combat";
import { armyValue, combatUnits, lootable, mainMix, optimize, simplexGrid, unitValue, type AttackInput, type DefendInput } from "./optimize";

/* Teutons: 0 Clubswinger (att 40, cost 250), 2 Axeman, 4 Paladin, 5 Teutonic Knight. Gauls: 0 Phalanx (def 40/50, cost 315). */
const G = (counts: number[]): Army => ({ tribe: "Gauls", counts });
const T = (counts: number[]): Army => ({ tribe: "Teutons", counts });

const attackOptimal = (o: Partial<AttackInput> = {}): AttackInput => ({
  side: "attack", tribe: "Teutons", source: { kind: "optimal", cap: 100_000 }, objective: "smallestWin", mode: "normal",
  defenders: [G([100])], village: { tribe: "Gauls" }, ...o,
});

describe("helpers", () => {
  it("values units by the sum of their costs", () => {
    expect(unitValue("Teutons", 0)).toBe(250);
    expect(armyValue("Gauls", [100])).toBe(31500);
    expect(unitValue("Nature", 0)).toBe(0);
  });

  it("searches infantry and cavalry only by default", () => {
    expect(combatUnits("Teutons")).toEqual([0, 1, 2, 4, 5]);
  });

  it("loot is what lies above the cranny, per resource", () => {
    expect(lootable([8836, 6295, 8695, 1353], 0)).toBe(25179);
    expect(lootable([1000, 500, 200, 3000], 600)).toBe(400 + 0 + 0 + 2400);
  });

  it("the simplex grid covers pure and mixed directions", () => {
    const g = simplexGrid(3);
    expect(g.every(d => Math.abs(d.reduce((a, b) => a + b, 0) - 1) < 1e-9)).toBe(true);
    expect(g).toContainEqual([1, 0, 0]);
    expect(g).toContainEqual([0, 0, 1]);
    expect(simplexGrid(5).length).toBeLessThanOrEqual(130);
  });
});

describe("attack, optimal troops", () => {
  it("smallest win against 100 Phalanxes is 99 Clubswingers and 1 Axeman", () => {
    // Defence 100 * 40.0021 + 10 = 4,010.21. Clubswingers give the most attack per resource (40.0021 for 250),
    // and cavalry would face 50 per Phalanx. 100 Clubswingers (4,000.21) fall short; 101 win for 25,250,
    // but 99 Clubswingers + 1 Axeman win for less: 3,960.21 + 60.0021 = 4,020.21, cost 24,750 + 490 = 25,240.
    const r = optimize(attackOptimal());
    expect(r.best?.counts).toEqual([99, 0, 1, 0, 0, 0, 0, 0, 0, 0]);
    expect(r.best?.cost).toBe(25240);
    expect(r.best?.win).toBe(true);
    expect(optimize(attackOptimal({ source: { kind: "optimal", cap: 25_239 } })).best).toBeNull();
  });

  it("fewest losses spends up to the cap, and its battle agrees with battle()", () => {
    const r = optimize(attackOptimal({ objective: "fewestLosses", source: { kind: "optimal", cap: 50_000 } }));
    expect(r.best!.cost).toBeLessThanOrEqual(50_000);
    expect(r.best!.cost).toBeGreaterThan(45_000);
    const again = battle({ attacker: r.best!.sent[0].army, defenders: [G([100])], village: { tribe: "Gauls" }, mode: "normal" });
    expect(again).toEqual(r.best!.result);
    expect(again.winner).toBe("attacker");
    // 200 Clubswingers would lose round(200 * (1 - (4010.21/8000.42)^1.5)) → 71 (17,750); the optimizer must do at least as well.
    expect(r.best!.ownLossValue).toBeLessThanOrEqual(17_750);
  });

  it("returns alternatives with another main mix of units, or a cost at least 10% apart", () => {
    const r = optimize(attackOptimal({ objective: "fewestLosses", source: { kind: "optimal", cap: 50_000 } }));
    expect(r.alternatives.length).toBeGreaterThan(0);
    const picked = [r.best!, ...r.alternatives];
    picked.forEach((a, i) => picked.slice(i + 1).forEach(b => {
      expect(mainMix(a, "Teutons") !== mainMix(b, "Teutons") || Math.abs(a.cost - b.cost) > 0.1 * Math.max(a.cost, b.cost)).toBe(true);
    }));
    for (const a of r.alternatives) expect(a.score).toBeLessThanOrEqual(r.best!.score);
  });

  it("the main mix ignores units worth under 10% of the army", () => {
    const o = { counts: [100, 0, 1], cost: 100 * 250 + 490, sent: [{ village: null, army: { tribe: "Teutons", counts: [] } }] };
    expect(mainMix(o, "Teutons")).toBe("100|");
  });

  it("counting wounded as recoverable lowers the loss value", () => {
    const base = optimize(attackOptimal({ objective: "fewestLosses", source: { kind: "optimal", cap: 50_000 } })).best!;
    const healed = optimize(attackOptimal({ objective: "fewestLosses", source: { kind: "optimal", cap: 50_000 }, woundedRecoverable: true })).best!;
    expect(healed.ownLossValue).toBeLessThan(base.ownLossValue);
    expect(base.ownLossValue).toBe(base.ownLost);
  });

  it("raid for loot weighs carry against losses and stays within the lootable resources", () => {
    const r = optimize(attackOptimal({ mode: "raid", objective: "mostLoot", defenders: [G([20])], loot: { res: [5000, 5000, 5000, 5000], crannyCapacity: 1000 } }));
    expect(r.best!.loot).toBeLessThanOrEqual(16_000);
    expect(r.best!.loot).toBeGreaterThan(10_000);
    expect(r.best!.score).toBeCloseTo(r.best!.loot! - r.best!.ownLossValue, 0);
  });

  it("raids an oasis held by animals, which are worth nothing as losses", () => {
    const animals: Army = { tribe: "Nature", counts: [8, 0, 4, 0, 12, 12, 12, 3, 9, 7] };
    const r = optimize(attackOptimal({ defenders: [animals], village: { tribe: "Gauls" } }));
    expect(r.best!.win).toBe(true);
    expect(r.best!.enemyLost).toBe(0);
    expect(battle({ attacker: r.best!.sent[0].army, defenders: [animals], village: { tribe: "Gauls" }, mode: "normal" }).winner).toBe("attacker");
  });

  it("never offers an empty attack, even when every raid costs more than it brings", () => {
    const r = optimize(attackOptimal({ mode: "raid", objective: "mostLoot", defenders: [G([300])], loot: { res: [100, 100, 100, 100], crannyCapacity: 0 }, source: { kind: "optimal", cap: 20_000 } }));
    expect(r.best!.counts.some(n => n > 0)).toBe(true);
    expect(r.best!.score).toBeLessThan(0);
  });

  it("most enemy losses kills the whole defence when the cap allows", () => {
    const r = optimize(attackOptimal({ objective: "mostEnemyLosses" }));
    expect(r.best!.enemyLost).toBe(31_500);
  });

  it("runs well under a second", () => {
    const t0 = performance.now();
    const r = optimize(attackOptimal({ objective: "fewestLosses", defenders: [G([1000]), { tribe: "Romans", counts: [0, 500] }], village: { tribe: "Gauls", wall: 15 }, source: { kind: "optimal", cap: 1_000_000 } }));
    expect(performance.now() - t0).toBeLessThan(1000);
    expect(r.evaluated).toBeGreaterThan(100);
  });
});

describe("attack, owned troops", () => {
  const owned = (villages: { name: string; counts: number[] }[], o: Partial<AttackInput> = {}): AttackInput =>
    attackOptimal({ source: { kind: "owned", villages }, ...o });

  it("never sends more than a village owns, and picks the village that can win", () => {
    const r = optimize(owned([{ name: "A", counts: [80, 0, 0, 0, 0, 0] }, { name: "B", counts: [150, 0, 30, 0, 0, 10] }], { objective: "fewestLosses" }));
    expect(r.best!.sent.map(s => s.village)).toEqual(["B"]);
    const c = r.best!.counts;
    expect(c[0]).toBeLessThanOrEqual(150);
    expect(c[2]).toBeLessThanOrEqual(30);
    expect(c[5]).toBeLessThanOrEqual(10);
    expect(r.best!.win).toBe(true);
  });

  it("finds nothing when no village can win", () => {
    expect(optimize(owned([{ name: "A", counts: [80] }])).best).toBeNull();
  });

  it("uses each village's smithy levels", () => {
    // 100 Clubswingers at smithy 10 have 4,596.67 attack: enough against 100 Phalanxes.
    const r = optimize(attackOptimal({ source: { kind: "owned", villages: [{ name: "A", counts: [100], smithy: [10] }] } }));
    expect(r.best!.sent[0].army.smithy).toEqual([10]);
    expect(r.best!.counts[0]).toBeLessThan(100);
  });
});

describe("defend", () => {
  const defend = (o: Partial<DefendInput> = {}): DefendInput => ({
    side: "defend", tribe: "Gauls", source: { kind: "optimal", cap: 100_000 }, objective: "smallestWin", mode: "normal",
    attacker: T([100]), home: [], village: { tribe: "Gauls" }, ...o,
  });

  it("smallest reinforcement that holds 100 Clubswingers is 100 Phalanxes", () => {
    // 100 * 40.0021 + 10 = 4,010.21 ≥ 4,000.21; 99 give 3,970.2.
    const r = optimize(defend());
    expect(r.best!.counts).toEqual([100, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(r.best!.win).toBe(true);
    expect(r.best!.result.winner).toBe("defender");
  });

  it("counts the troops already at home", () => {
    const r = optimize(defend({ home: [G([60])] }));
    expect(r.best!.counts[0]).toBe(40);
  });

  it("sends nothing when the troops at home already hold", () => {
    // The cheapest reinforcement is none. (Fewest losses would still send some: more defenders lose a smaller share.)
    const r = optimize(defend({ home: [G([300])] }));
    expect(r.best!.sent).toEqual([]);
    expect(r.best!.win).toBe(true);
  });

  it("reinforces from several villages, each within what it owns", () => {
    const r = optimize(defend({ objective: "fewestLosses", source: { kind: "owned", villages: [{ name: "A", counts: [70] }, { name: "B", counts: [60, 0, 0, 0, 20] }] } }));
    expect(r.best!.win).toBe(true);
    for (const s of r.best!.sent) {
      const own = s.village === "A" ? [70] : [60, 0, 0, 0, 20];
      s.army.counts.forEach((n, i) => expect(n).toBeLessThanOrEqual(own[i] ?? 0));
    }
  });

  it("rejects the loot objective", () => {
    expect(() => optimize(defend({ objective: "mostLoot" }))).toThrow();
  });
});

describe("properties", () => {
  const caps = [30_000, 60_000, 120_000, 240_000];
  const targets: Partial<AttackInput>[] = [
    { defenders: [G([100])], village: { tribe: "Gauls" } },
    { defenders: [{ tribe: "Romans", counts: [100, 100] }], village: { tribe: "Romans", wall: 10 } },
    { defenders: [G([100]), { tribe: "Romans", counts: [0, 50] }], village: { tribe: "Gauls", wall: 10 } },
  ];

  it.each(targets.map((t, k) => [k, t] as const))("a bigger cap is never worse (target %i)", (_, t) => {
    for (const objective of ["fewestLosses", "smallestWin", "mostEnemyLosses"] as const) {
      let prev = -Infinity;
      for (const cap of caps) {
        const s = optimize(attackOptimal({ ...t, objective, source: { kind: "optimal", cap } })).best?.score ?? -Infinity;
        expect(s, `${objective} at ${cap}`).toBeGreaterThanOrEqual(prev - 1e-6);
        prev = s;
      }
    }
  });

  it.each(targets.map((t, k) => [k, t] as const))("a reported win is a win in battle() (target %i)", (_, t) => {
    const r = optimize(attackOptimal({ ...t, objective: "fewestLosses" }));
    for (const o of [r.best!, ...r.alternatives]) {
      const b = battle({ attacker: o.sent[0].army, defenders: t.defenders!, village: t.village!, mode: "normal" });
      expect(b.winner).toBe("attacker");
      expect(o.cost).toBeLessThanOrEqual(100_000);
    }
  });
});
