import { describe, expect, it } from "vitest";
import { estimateAttackerSmithy, estimateDefenderSmithy } from "./smithyEstimate";

describe("estimateAttackerSmithy", () => {
  it("one unit type: 100 Clubswingers showing 4,597 are at smithy 10 (simulator case 10)", () => {
    // Level 9 gives 4,535, level 10 4,597, level 11 4,659.
    const e = estimateAttackerSmithy({ tribe: "Teutons", sent: [100], strength: 4597, hero: false });
    expect(e.status).toBe("ok");
    expect(e.ranges[0]).toEqual([10, 10]);
    expect(e.suggested[0]).toBe(10);
    expect(e.note).toBe("Report suggests Clubswinger smithy 10.");
  });

  it("level 0 when the strength is the base (simulator case 1)", () => {
    expect(estimateAttackerSmithy({ tribe: "Teutons", sent: [100], strength: 4000, hero: false }).ranges[0]).toEqual([0, 0]);
  });

  it("a hero makes the strength only a cap (report sample 1: 930 Clubswingers + 180 Axemen, 49,370)", () => {
    // Common level 2 gives 49,340, level 3 gives 50,020: so 0–2.
    const e = estimateAttackerSmithy({ tribe: "Teutons", sent: [930, 0, 180], strength: 49370, hero: true });
    expect(e.status).toBe("uncertain");
    expect(e.suggested[0]).toBe(1);
    expect(e.suggested[2]).toBe(1);
    expect(e.note).toContain("smithy 0–2 if all units share a level");
    expect(e.note).toContain("hero");
  });

  it("several types: per-type ranges when no common level fits (report sample 5: 500 Clubswingers + 69 Teutonic Knights, 34,043)", () => {
    // A common level 8 gives 33,820 and 9 gives 34,267, so the types differ.
    const e = estimateAttackerSmithy({ tribe: "Teutons", sent: [500, 0, 0, 0, 0, 69], strength: 34043, hero: false });
    expect(e.status).toBe("ok");
    expect(e.note).not.toContain("share a level");
    expect(e.ranges[0]).not.toBeNull();
    expect(e.ranges[5]).not.toBeNull();
    // Every suggested combination need not fit exactly, but each level is within its range.
    for (const i of [0, 5]) expect(e.suggested[i]).toBeGreaterThanOrEqual(e.ranges[i]![0]);
  });

  it("nothing fits when the strength is below the base", () => {
    const e = estimateAttackerSmithy({ tribe: "Teutons", sent: [100], strength: 3000, hero: false });
    expect(e.status).toBe("none");
    expect(e.note).toContain("doesn't fit");
  });
});

describe("estimateDefenderSmithy", () => {
  const phalanx = (n: number) => ({ tribe: "Gauls", sent: [n, 0, 0, 0, 0, 0, 0, 0, 0, 0], hero: false });

  it("one army, known wall, infantry attack: 100 Phalanxes showing 4,606 are at smithy 10 (simulator case 10)", () => {
    const e = estimateDefenderSmithy({ contingents: [phalanx(100)], strength: 4606, wall: { tribe: "Gauls", level: 0 }, attackKind: "inf" });
    expect(e.ranges[0]).toEqual([10, 10]);
  });

  it("takes the wall into account (simulator case 7: palisade 10, 5,235)", () => {
    const e = estimateDefenderSmithy({ contingents: [phalanx(100)], strength: 5235, wall: { tribe: "Gauls", level: 10 }, attackKind: "inf" });
    expect(e.ranges[0]).toEqual([0, 0]);
  });

  it("can't infer without the wall, against a mixed attack, or with several armies", () => {
    const base = { contingents: [phalanx(100)], strength: 4606, wall: { tribe: "Gauls", level: 0 }, attackKind: "inf" as const };
    expect(estimateDefenderSmithy({ ...base, wall: null }).note).toContain("wall level");
    expect(estimateDefenderSmithy({ ...base, attackKind: "mixed" }).status).toBe("none");
    expect(estimateDefenderSmithy({ ...base, contingents: [phalanx(100), { tribe: "Romans", sent: [0, 50], hero: false }] }).note).toContain("Several armies");
  });

  it("animals are known and don't block it", () => {
    const animals = { tribe: "Nature", sent: [10, 0, 0, 0, 0, 0, 0, 0, 0, 0], hero: false };
    // 10 rats add 10 * 25.0021 = 250.02 against infantry.
    const e = estimateDefenderSmithy({ contingents: [phalanx(100), animals], strength: 4856, wall: { tribe: "Gauls", level: 0 }, attackKind: "inf" });
    expect(e.ranges[0]).toEqual([10, 10]);
  });
});
