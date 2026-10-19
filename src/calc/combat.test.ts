import { describe, expect, it } from "vitest";
import {
  attackPower, battle, BASE_DEFENCE, defencePower, lossShares, massFactor, morale, unitLosses, upgraded,
  wallBonus, wallDefence, weightedDefence, woundedOf,
  type Army, type BattleInput,
} from "./combat";

/* Unit indices used below: Teutons 0 Clubswinger (inf, att 40), 1 Spearman, 2 Axeman, 3 Scout, 5 Teutonic Knight (cav, att 150), 6 Ram;
   Gauls 0 Phalanx (def 40/50); Romans 0 Legionnaire (def 35/50), 1 Praetorian (def 65/35), 2 Imperian (att 70). */

describe("upgraded (smithy)", () => {
  it("adds u * 0.0021 even at level 0, u = upkeep / 1.007", () => {
    expect(upgraded(40, 1, 0)).toBeCloseTo(40.0021, 6);
    expect(upgraded(150, 3, 0)).toBeCloseTo(150.0063, 6);
  });

  it("adds (value + 300 * u / 7) * (1.007^level - 1), rounded to 4 decimals", () => {
    // Clubswinger level 20: 40 + 82.5593 * 0.149740 + 0.0021 = 52.3623
    expect(upgraded(40, 1, 20)).toBeCloseTo(52.3623, 6);
    // Teutonic Knight (upkeep 3) level 10: 150 + 277.678 * 0.072247 + 0.0063 = 170.0675
    expect(upgraded(150, 3, 10)).toBeCloseTo(170.0675, 6);
  });
});

describe("attackPower", () => {
  it("splits infantry and cavalry", () => {
    // 100 Clubswingers 4,000.21 inf, 10 Teutonic Knights 1,500.063 cav
    const a = attackPower({ tribe: "Teutons", counts: [100, 0, 0, 0, 0, 10] });
    expect(a.inf).toBeCloseTo(4000.21, 6);
    expect(a.cav).toBeCloseTo(1500.063, 6);
  });

  it("counts siege as infantry and scouts as nothing", () => {
    // 5 Rams * 65.0063; even 0-attack scouts get the 0.0021 term: 50 * 0.0021
    const a = attackPower({ tribe: "Teutons", counts: [0, 0, 0, 50, 0, 0, 5] });
    expect(a.inf).toBeCloseTo(325.0315 + 0.105, 6);
    expect(a.cav).toBe(0);
  });

  it("applies smithy levels per unit", () => {
    const a = attackPower({ tribe: "Teutons", counts: [100, 0, 0, 0, 0, 10], smithy: [20, 0, 0, 0, 0, 10] });
    expect(a.inf).toBeCloseTo(5236.23, 6);
    expect(a.cav).toBeCloseTo(1700.675, 6);
  });
});

describe("defence", () => {
  it("adds contingents of different tribes, each with its own smithy", () => {
    const d = defencePower([
      { tribe: "Gauls", counts: [100] },                        // 4,000.21 / 5,000.21
      { tribe: "Romans", counts: [10] },                        //   350.021 /  500.021
      { tribe: "Teutons", counts: [0, 10], smithy: [0, 20] },   // Spearman level 20: 46.6137 / 75.3565
    ]);
    expect(d.inf).toBeCloseTo(4000.21 + 350.021 + 466.137, 6);
    expect(d.cav).toBeCloseTo(5000.21 + 500.021 + 753.565, 6);
  });

  it("is weighted by the attacker's infantry/cavalry share, rounded to 4 decimals", () => {
    // 3,500 vs inf, 5,000 vs cav; attack 80% inf: 2,800 + 1,000
    expect(weightedDefence({ inf: 3500, cav: 5000 }, { inf: 4000, cav: 1000 })).toBeCloseTo(3800, 9);
    // 1/3 and 2/3 become 0.3333 and 0.6667
    expect(weightedDefence({ inf: 3000, cav: 6000 }, { inf: 1000, cav: 2000 })).toBeCloseTo(3000 * 0.3333 + 6000 * 0.6667, 6);
    expect(weightedDefence({ inf: 3500, cav: 5000 }, { inf: 0, cav: 1000 })).toBe(5000);
    expect(weightedDefence({ inf: 3500, cav: 5000 }, { inf: 0, cav: 0 })).toBe(3500);
  });
});

describe("wall", () => {
  it("multiplies by the tribe's factor ^ level, rounded to 3 decimals", () => {
    expect(wallBonus("Romans", 0)).toBe(1);
    expect(wallBonus("Romans", 10)).toBeCloseTo(1.344, 9);   // 1.03^10 = 1.34392
    expect(wallBonus("Gauls", 10)).toBeCloseTo(1.28, 9);     // 1.025^10 = 1.28008
    expect(wallBonus("Teutons", 10)).toBeCloseTo(1.219, 9);  // 1.02^10 = 1.21899
    expect(wallBonus("Huns", 20)).toBeCloseTo(1.347, 9);     // 1.015^20 = 1.34686
  });

  it("adds flat defence per level", () => {
    expect([wallDefence("Romans", 10), wallDefence("Gauls", 10), wallDefence("Teutons", 10), wallDefence("Gauls", 0)]).toEqual([100, 80, 60, 0]);
  });
});

describe("morale", () => {
  it("is 1 unless the attacker has more population", () => {
    expect(morale(100, 100, 1, 1)).toBe(1);
    expect(morale(50, 100, 1, 1)).toBe(1);
    expect(morale(100, 0, 1, 1)).toBe(1);
  });

  it("is (attPop / defPop)^-0.2 on the attack, at least 0.667", () => {
    expect(morale(200, 100, 2, 1)).toBeCloseTo(0.871, 9);  // 2^-0.2 = 0.87055
    expect(morale(1000, 100, 2, 1)).toBe(0.667);           // 10^-0.2 = 0.631
  });

  it("is milder when the attack is weaker than the defence", () => {
    expect(morale(200, 100, 1, 2)).toBeCloseTo(0.933, 9);  // 2^-0.1 = 0.93303
  });
});

describe("massFactor", () => {
  it("is 1.5 for battles up to about 1,000 units", () => {
    expect(massFactor(0)).toBe(1.5);
    expect(massFactor(1000)).toBe(1.5);
  });

  it("is 2 * (1.8592 - units^0.015) in between, rounded to 0.0002", () => {
    expect(massFactor(10000)).toBeCloseTo(1.4220, 9);  // 1.42209
    expect(massFactor(18000)).toBeCloseTo(1.4018, 9);  // 1.40176
  });

  it("stops at 1.2578 for about 1,000,000 units and more", () => {
    expect(massFactor(5_000_000)).toBeCloseTo(1.2578, 9);
  });
});

describe("lossShares", () => {
  it("normal: the loser loses everything, the winner (loser / winner)^k", () => {
    const win = lossShares(4000, 2000, "normal", 1.5);
    expect(win.attacker).toBeCloseTo(0.5 ** 1.5, 12);
    expect(win.defender).toBe(1);
    const lose = lossShares(2000, 4000, "normal", 1.5);
    expect(lose.attacker).toBe(1);
    expect(lose.defender).toBeCloseTo(0.5 ** 1.5, 12);
  });

  it("normal: on a tie both sides lose everything", () => {
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

describe("unitLosses and woundedOf", () => {
  it("rounds the survivors, so the losses take the rest", () => {
    // survivors 64.4, 4.508, 1.932
    expect(unitLosses([100, 0, 7, 3], 0.356)).toEqual([36, 0, 2, 1]);
    // survivors 2.5 round up to 3, so 2 are lost (rounding the losses would give 3)
    expect(unitLosses([5], 0.5)).toEqual([2]);
  });

  it("lists 40% of the losses as wounded, rounded down, none for siege", () => {
    expect(woundedOf("Teutons", [44, 7314, 0, 0, 0, 0, 20])).toEqual([17, 2925, 0, 0, 0, 0, 0]);
  });
});

describe("battle", () => {
  it("a lone attacker with under 84.5 attack dies", () => {
    const r = battle({ attacker: { tribe: "Teutons", counts: [1] }, defenders: [], village: { tribe: "Gauls", baseDefence: 0 }, mode: "raid" });
    expect(r.attackerLosses).toEqual([1]);
  });

  it("morale lowers the attack when the attacker is bigger", () => {
    // Pop 400 vs 100, attack stronger: 4^-0.2 = 0.758; 4,000.21 * 0.758
    const r = battle({ attacker: { tribe: "Teutons", counts: [100] }, defenders: [{ tribe: "Gauls", counts: [50] }], village: { tribe: "Gauls" }, mode: "normal", attackerPop: 400, defenderPop: 100 });
    expect(r.morale).toBeCloseTo(0.758, 9);
    expect(r.attack).toBeCloseTo(4000.21 * 0.758, 6);
    expect(r.def).toBeCloseTo(2010.105, 6);
  });

  it("an empty village defends with the base defence plus the wall", () => {
    const r = battle({ attacker: { tribe: "Teutons", counts: [100] }, defenders: [], village: { tribe: "Romans", wall: 10 }, mode: "normal" });
    expect(r.def).toBeCloseTo((BASE_DEFENCE + 100) * 1.344, 6);
    // (147.84 / 4000.21)^1.5 = 0.0071: 99.29 survivors round to 99
    expect(r.attackerLosses).toEqual([1]);
  });
});

/*
 * ======================================================================
 * GAME COMBAT SIMULATOR CASES (Rally Point → Combat Simulator, Travian Legends)
 * Run by the user with known settings: no hero, artifacts or bonuses, smithy 0,
 * wall 0, equal population, no residence/palace, unless noted.
 * `att`/`def` are the "Combat strength" the game showed (it rounds the attack
 * and seems to round the defence down, so we compare within 1 point).
 * Losses and wounded are the two "−N" rows of the result, per unit index.
 * Add more cases here as the user runs them.
 * ======================================================================
 */
interface SimCase {
  name: string;
  input: BattleInput;
  att: number;
  def: number;
  attLost: number[];
  attWounded: number[];
  defLost: number[][];
  defWounded: number[][];
}

const T = (counts: number[], smithy?: number[]): Army => ({ tribe: "Teutons", counts, smithy });
const G = (counts: number[], smithy?: number[]): Army => ({ tribe: "Gauls", counts, smithy });
const R = (counts: number[]): Army => ({ tribe: "Romans", counts });

const SIM_CASES: SimCase[] = [
  { name: "1: 100 Clubswingers vs 100 Phalanxes, normal",
    input: { attacker: T([100]), defenders: [G([100])], village: { tribe: "Gauls" }, mode: "normal" },
    att: 4000, def: 4010, attLost: [100], attWounded: [40], defLost: [[100]], defWounded: [[40]] },
  { name: "2: same as 1, raid",
    input: { attacker: T([100]), defenders: [G([100])], village: { tribe: "Gauls" }, mode: "raid" },
    att: 4000, def: 4010, attLost: [50], attWounded: [20], defLost: [[50]], defWounded: [[20]] },
  { name: "3: 50 Clubswingers vs 200 Phalanxes, normal",
    input: { attacker: T([50]), defenders: [G([200])], village: { tribe: "Gauls" }, mode: "normal" },
    att: 2000, def: 8010, attLost: [50], attWounded: [20], defLost: [[25]], defWounded: [[10]] },
  { name: "4: same as 3, raid",
    input: { attacker: T([50]), defenders: [G([200])], village: { tribe: "Gauls" }, mode: "raid" },
    att: 2000, def: 8010, attLost: [44], attWounded: [17], defLost: [[22]], defWounded: [[8]] },
  { name: "5: 50 Teutonic Knights vs 100 Phalanxes (cavalry), normal",
    input: { attacker: T([0, 0, 0, 0, 0, 50]), defenders: [G([100])], village: { tribe: "Gauls" }, mode: "normal" },
    att: 7500, def: 5010, attLost: [0, 0, 0, 0, 0, 27], attWounded: [0, 0, 0, 0, 0, 10], defLost: [[100]], defWounded: [[40]] },
  { name: "6: 100 Axemen + 50 Teutonic Knights vs 100 Legionnaires + 100 Praetorians (mixed), normal",
    input: { attacker: T([0, 0, 100, 0, 0, 50]), defenders: [R([100, 100])], village: { tribe: "Romans" }, mode: "normal" },
    att: 13501, def: 9177, attLost: [0, 0, 56, 0, 0, 28], attWounded: [0, 0, 22, 0, 0, 11], defLost: [[100, 100]], defWounded: [[40, 40]] },
  { name: "7: same as 1, palisade 10",
    input: { attacker: T([100]), defenders: [G([100])], village: { tribe: "Gauls", wall: 10 }, mode: "normal" },
    att: 4000, def: 5235, attLost: [100], attWounded: [40], defLost: [[67]], defWounded: [[26]] },
  { name: "8: 100 Imperians vs 150 Spearmen, earth wall 10, normal",
    input: { attacker: R([0, 0, 100]), defenders: [T([0, 150])], village: { tribe: "Teutons", wall: 10 }, mode: "normal" },
    att: 7000, def: 6485, attLost: [0, 0, 89], attWounded: [0, 0, 35], defLost: [[0, 150]], defWounded: [[0, 60]] },
  { name: "9: 100 Clubswingers vs 100 Legionnaires, city wall 10, normal",
    input: { attacker: T([100]), defenders: [R([100])], village: { tribe: "Romans", wall: 10 }, mode: "normal" },
    att: 4000, def: 4852, attLost: [100], attWounded: [40], defLost: [[75]], defWounded: [[30]] },
  // The copied inputs show wall 0 here, but the game's defence (5,998) only fits with the palisade 10 from case 7 still set.
  { name: "10: same as 1, smithy 10 on both sides (palisade 10 apparently still set)",
    input: { attacker: T([100], [10]), defenders: [G([100], [10])], village: { tribe: "Gauls", wall: 10 }, mode: "normal" },
    att: 4597, def: 5998, attLost: [100], attWounded: [40], defLost: [[67]], defWounded: [[26]] },
  { name: "12: 10,000 Clubswingers vs 8,000 Phalanxes (large battle), normal",
    input: { attacker: T([10000]), defenders: [G([8000])], village: { tribe: "Gauls" }, mode: "normal" },
    att: 400021, def: 320026, attLost: [7314], attWounded: [2925], defLost: [[8000]], defWounded: [[3200]] },
  { name: "13: same as 1, plus 50 Roman Praetorians reinforcing",
    input: { attacker: T([100]), defenders: [G([100]), R([0, 50])], village: { tribe: "Gauls" }, mode: "normal" },
    att: 4000, def: 7260, attLost: [100], attWounded: [40], defLost: [[41], [0, 20]], defWounded: [[16], [0, 8]] },
  // The game also reported "Palisade was not damaged".
  { name: "14: 100 Clubswingers + 20 Rams vs 100 Phalanxes + 50 Praetorians, palisade 10, normal",
    input: { attacker: T([100, 0, 0, 0, 0, 0, 20]), defenders: [G([100]), R([0, 50])], village: { tribe: "Gauls", wall: 10 }, mode: "normal" },
    att: 5300, def: 9395, attLost: [100, 0, 0, 0, 0, 0, 20], attWounded: [40, 0, 0, 0, 0, 0, 0], defLost: [[42], [0, 21]], defWounded: [[16], [0, 8]] },
];

describe("game combat simulator cases", () => {
  it.each(SIM_CASES)("$name", c => {
    const r = battle(c.input);
    expect(Math.abs(r.attack - c.att), `attack ${r.attack}`).toBeLessThan(1);
    expect(Math.abs(r.def - c.def), `defence ${r.def}`).toBeLessThan(1);
    expect(r.attackerLosses).toEqual(c.attLost);
    expect(r.attackerWounded).toEqual(c.attWounded);
    expect(r.defenderLosses).toEqual(c.defLost);
    expect(r.defenderWounded).toEqual(c.defWounded);
  });

  it.todo("11: morale, population 2,000 vs 200 (not run yet)");
});
