import { describe, expect, it } from "vitest";
import {
  attackPower, battle, BASE_DEFENCE, defencePower, lossShares, massFactor, morale, unitLosses, upgraded, wallBonus, weightedDefence,
} from "./combat";

/* Unit indices used below: Teutons 0 Clubswinger (inf, att 40), 1 Spearman, 3 Scout, 5 Teutonic Knight (cav, att 150), 6 Ram;
   Gauls 0 Phalanx (def 40/50); Romans 0 Legionnaire (def 35/50). */

describe("upgraded (smithy)", () => {
  it("is the base value at level 0", () => {
    expect(upgraded(40, 1, 0)).toBe(40);
  });

  it("adds (value + 300 * upkeep / 7) * (1.007^level - 1)", () => {
    // Clubswinger at level 20: 40 + 82.857 * 0.149740 = 52.405
    expect(upgraded(40, 1, 20)).toBeCloseTo(52.405, 2);
    // Teutonic Knight (upkeep 3) at level 10: 150 + 278.571 * 0.072247 = 170.126
    expect(upgraded(150, 3, 10)).toBeCloseTo(170.126, 2);
  });
});

describe("attackPower", () => {
  it("splits infantry and cavalry", () => {
    // 100 Clubswingers 4,000 inf, 10 Teutonic Knights 1,500 cav
    expect(attackPower({ tribe: "Teutons", counts: [100, 0, 0, 0, 0, 10] })).toEqual({ inf: 4000, cav: 1500 });
  });

  it("counts siege as infantry and scouts as nothing", () => {
    // 5 Rams * 65 = 325 inf; scouts attack 0
    expect(attackPower({ tribe: "Teutons", counts: [0, 0, 0, 50, 0, 0, 5] })).toEqual({ inf: 325, cav: 0 });
  });

  it("applies smithy levels per unit", () => {
    const a = attackPower({ tribe: "Teutons", counts: [100, 0, 0, 0, 0, 10], smithy: [20, 0, 0, 0, 0, 10] });
    expect(a.inf).toBeCloseTo(5240.5, 0);
    expect(a.cav).toBeCloseTo(1701.3, 0);
  });
});

describe("defence", () => {
  it("adds contingents of different tribes, each with its own smithy", () => {
    const d = defencePower([
      { tribe: "Gauls", counts: [100] },                 // 4,000 / 5,000
      { tribe: "Romans", counts: [10], smithy: [0] },    //   350 /   500
      { tribe: "Teutons", counts: [0, 10], smithy: [0, 20] },
    ]);
    // Spearman level 20: 35 + 77.857 * 0.149740 = 46.656 and 60 + 102.857 * 0.149740 = 75.399
    expect(d.inf).toBeCloseTo(4350 + 466.56, 1);
    expect(d.cav).toBeCloseTo(5500 + 753.99, 1);
  });

  it("is weighted by the attacker's infantry/cavalry share", () => {
    // 3,500 vs inf, 5,000 vs cav; attack 80% inf: 2,800 + 1,000
    expect(weightedDefence({ inf: 3500, cav: 5000 }, { inf: 4000, cav: 1000 })).toBe(3800);
    expect(weightedDefence({ inf: 3500, cav: 5000 }, { inf: 0, cav: 1000 })).toBe(5000);
    expect(weightedDefence({ inf: 3500, cav: 5000 }, { inf: 0, cav: 0 })).toBe(3500);
  });
});

describe("wallBonus", () => {
  it("is the tribe's factor ^ level", () => {
    expect(wallBonus("Romans", 0)).toBe(1);
    expect(wallBonus("Romans", 10)).toBeCloseTo(1.343916, 6);   // 1.03^10
    expect(wallBonus("Teutons", 20)).toBeCloseTo(1.485947, 6);  // 1.02^20
    expect(wallBonus("Gauls", 20)).toBeCloseTo(1.638616, 6);    // 1.025^20
    expect(wallBonus("Huns", 20)).toBeCloseTo(1.346855, 6);     // 1.015^20
  });
});

describe("morale", () => {
  it("is 1 unless the attacker has more population", () => {
    expect(morale(100, 100, 1, 1)).toBe(1);
    expect(morale(50, 100, 1, 1)).toBe(1);
    expect(morale(100, 0, 1, 1)).toBe(1);
  });

  it("is (attPop / defPop)^0.2, at most 1.5", () => {
    expect(morale(200, 100, 2, 1)).toBeCloseTo(1.148698, 6);  // 2^0.2
    expect(morale(1000, 100, 2, 1)).toBe(1.5);                // 10^0.2 = 1.585
  });

  it("is weaker when the attack is weaker than the defence", () => {
    expect(morale(200, 100, 1, 2)).toBeCloseTo(1.071773, 6);  // 2^0.1
  });
});

describe("massFactor", () => {
  it("is 1.5 for battles up to about 1,000 units", () => {
    expect(massFactor(0)).toBe(1.5);
    expect(massFactor(1000)).toBe(1.5);
  });

  it("is 2 * (1.8592 - units^0.015) in between", () => {
    // 10,000^0.015 = 1.148154
    expect(massFactor(10000)).toBeCloseTo(1.422093, 5);
  });

  it("stops at 1.2578 for about 1,000,000 units and more", () => {
    expect(massFactor(5_000_000)).toBe(1.2578);
  });
});

describe("lossShares", () => {
  it("normal: the loser loses everything, the winner (loser / winner)^k", () => {
    expect(lossShares(4000, 2000, "normal", 1.5)).toEqual({ attacker: 0.5 ** 1.5, defender: 1 });
    expect(lossShares(2000, 4000, "normal", 1.5)).toEqual({ attacker: 1, defender: 0.5 ** 1.5 });
  });

  it("normal: a tie goes to the defender", () => {
    expect(lossShares(1000, 1000, "normal", 1.5)).toEqual({ attacker: 1, defender: 1 });
  });

  it("raid: both sides lose part, x = (off / def)^k", () => {
    const x = 2 ** 1.5;  // 2.828427
    const r = lossShares(4000, 2000, "raid", 1.5);
    expect(r.attacker).toBeCloseTo(1 / (1 + x), 9);  // 0.261204
    expect(r.defender).toBeCloseTo(x / (1 + x), 9);  // 0.738796
    expect(lossShares(1000, 1000, "raid", 1.5)).toEqual({ attacker: 0.5, defender: 0.5 });
  });

  it("handles empty sides", () => {
    expect(lossShares(0, 100, "normal", 1.5)).toEqual({ attacker: 1, defender: 0 });
    expect(lossShares(100, 0, "raid", 1.5)).toEqual({ attacker: 0, defender: 1 });
  });
});

describe("unitLosses", () => {
  it("rounds each unit type to the nearest unit", () => {
    expect(unitLosses([100, 0, 7, 3], 0.356)).toEqual([36, 0, 2, 1]);
  });
});

describe("battle", () => {
  // 100 Clubswingers (4,000) against 50 Phalanxes (2,000) + base defence 10, no wall: 2,010
  const attacker = { tribe: "Teutons", counts: [100] };
  const defenders = [{ tribe: "Gauls", counts: [50] }];

  it("normal attack: attacker wins and loses (2010 / 4000)^1.5", () => {
    const r = battle({ attacker, defenders, village: { tribe: "Gauls" }, mode: "normal" });
    expect(r.winner).toBe("attacker");
    expect(r.def).toBe(2010);
    expect(r.massFactor).toBe(1.5);
    expect(r.attackerLoss).toBeCloseTo(0.356208, 6);
    expect(r.attackerLosses).toEqual([36]);
    expect(r.defenderLosses).toEqual([[50]]);
  });

  it("raid: both lose part of their troops", () => {
    const r = battle({ attacker, defenders, village: { tribe: "Gauls" }, mode: "raid" });
    // x = (4000 / 2010)^1.5 = 2.807346
    expect(r.attackerLoss).toBeCloseTo(0.262650, 5);
    expect(r.defenderLoss).toBeCloseTo(0.737350, 5);
    expect(r.attackerLosses).toEqual([26]);
    expect(r.defenderLosses).toEqual([[37]]);
  });

  it("wall and base defence: defender wins, attacker loses everything", () => {
    // 50 Clubswingers (2,000) against 100 Phalanxes behind a level 10 palisade:
    // (4,000 + 10) * 1.025^10 = 5,133.14; defender loses (2000 / 5133.14)^1.5 = 0.243204
    const r = battle({ attacker: { tribe: "Teutons", counts: [50] }, defenders: [{ tribe: "Gauls", counts: [100] }], village: { tribe: "Gauls", wall: 10 }, mode: "normal" });
    expect(r.winner).toBe("defender");
    expect(r.def).toBeCloseTo(5133.14, 1);
    expect(r.attackerLosses).toEqual([50]);
    expect(r.defenderLoss).toBeCloseTo(0.243204, 5);
    expect(r.defenderLosses).toEqual([[24]]);
  });

  it("an empty village defends with the base defence times the wall", () => {
    const r = battle({ attacker, defenders: [], village: { tribe: "Romans", wall: 10 }, mode: "normal" });
    expect(r.def).toBeCloseTo(BASE_DEFENCE * 1.343916, 4);
    expect(r.attackerLosses).toEqual([0]);
  });

  it("morale raises the defence when the attacker is bigger", () => {
    // Pop 400 vs 100, attack stronger: 4^0.2 = 1.319508; def 2,010 * 1.319508 = 2,652.21
    const r = battle({ attacker, defenders, village: { tribe: "Gauls" }, mode: "normal", attackerPop: 400, defenderPop: 100 });
    expect(r.morale).toBeCloseTo(1.319508, 6);
    expect(r.def).toBeCloseTo(2652.21, 1);
    expect(r.attackerLoss).toBeCloseTo((2652.21 / 4000) ** 1.5, 5);
  });

  it("uses the large-battle factor for many units", () => {
    // 6,000 Clubswingers (240,000) against 4,000 Phalanxes (160,010): 10,000 units, k = 1.422093
    const r = battle({ attacker: { tribe: "Teutons", counts: [6000] }, defenders: [{ tribe: "Gauls", counts: [4000] }], village: { tribe: "Gauls" }, mode: "normal" });
    expect(r.massFactor).toBeCloseTo(1.422093, 5);
    // (160010 / 240000)^1.422093 = 0.561850, more than the 0.544382 a small battle would give
    expect(r.attackerLoss).toBeCloseTo(0.561850, 5);
    expect(r.attackerLosses).toEqual([3371]);
  });

  it("weights several contingents by the attack's mix", () => {
    // 100 Clubswingers + 20 Teutonic Knights: 4,000 inf + 3,000 cav
    // Defence: 50 Phalanxes (2,000 / 2,500) + 20 Legionnaires (700 / 1,000): 2,700 inf, 3,500 cav
    // (2,700 * 4 + 3,500 * 3) / 7 + 10 = 3,052.857
    const r = battle({
      attacker: { tribe: "Teutons", counts: [100, 0, 0, 0, 0, 20] },
      defenders: [{ tribe: "Gauls", counts: [50] }, { tribe: "Romans", counts: [20] }],
      village: { tribe: "Gauls" },
      mode: "normal",
    });
    expect(r.off).toEqual({ inf: 4000, cav: 3000 });
    expect(r.def).toBeCloseTo(3052.857, 3);
    expect(r.defenderLosses).toEqual([[50], [20]]);
  });
});

/*
 * ======================================================================
 * REAL BATTLE REPORTS — to be filled in from reports the user provides.
 * For each report: both armies (tribe, counts by unit index, smithy levels),
 * wall level and village tribe, populations, mode, and the losses the game
 * showed. Add one `it` per report and remove the todo.
 * ======================================================================
 */
describe("real battle reports", () => {
  it.todo("matches a normal attack report from the game");
  it.todo("matches a raid report from the game");
  it.todo("matches a report with a wall and morale");
});
