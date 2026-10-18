import { describe, expect, it } from "vitest";
import type { Res4 } from "../types";
import { npcTargets, planNeeds, storageCaps } from "./npc";

const NO_CAPS: Res4 = [Infinity, Infinity, Infinity, Infinity];

describe("storageCaps", () => {
  it("uses the warehouse for wood/clay/iron and the granary for crop", () => {
    expect(storageCaps(8000, 6000)).toEqual([8000, 8000, 8000, 6000]);
  });

  it("treats 0 as unknown", () => {
    expect(storageCaps(0, 0)).toEqual(NO_CAPS);
  });
});

describe("planNeeds", () => {
  it("is covered directly when every resource is enough", () => {
    const p = planNeeds([100, 100, 100, 100], [50, 100, 0, 10]);
    expect(p).toMatchObject({ coveredDirect: true, coveredNpc: true, useNpc: false, shortSum: 0 });
  });

  it("needs an NPC trade when the total is enough but one resource isn't", () => {
    const p = planNeeds([500, 0, 0, 0], [100, 100, 100, 100]);
    expect(p).toMatchObject({ haveTotal: 500, needSum: 400, shortEach: [0, 100, 100, 100], shortSum: 300, coveredDirect: false, coveredNpc: true, useNpc: true });
  });

  it("is short even after trading when the total isn't enough", () => {
    const p = planNeeds([100, 0, 0, 0], [100, 100, 0, 0]);
    expect(p).toMatchObject({ coveredDirect: false, coveredNpc: false, useNpc: false, shortSum: 100 });
  });
});

describe("npcTargets", () => {
  it("puts the leftover into the preferred resource", () => {
    expect(npcTargets([100, 100, 100, 100], 500, NO_CAPS, 0)).toEqual([200, 100, 100, 100]);
  });

  it("defaults to crop first when crop is preferred", () => {
    expect(npcTargets([100, 100, 100, 100], 500, NO_CAPS, 3)).toEqual([100, 100, 100, 200]);
  });

  it("spills over storage caps in order: preferred, crop, wood, clay, iron", () => {
    const caps: Res4 = [150, 150, 150, 120];
    // 300 leftover: iron (pref) +50 to 150, crop +20 to 120, wood +50, clay +50, 130 can't fit anywhere.
    expect(npcTargets([100, 100, 100, 100], 700, caps, 2)).toEqual([150, 150, 150, 120]);
  });

  it("keeps the targets summing to what the village has when storage allows", () => {
    const t = npcTargets([300, 50, 700, 120], 2000, storageCaps(1000, 1000), 1);
    expect(t.reduce((a, b) => a + b, 0)).toBe(2000);
    expect(t).toEqual([300, 880, 700, 120]);
  });

  it("changes nothing when there is no leftover", () => {
    expect(npcTargets([100, 200, 300, 400], 1000, NO_CAPS, 3)).toEqual([100, 200, 300, 400]);
  });
});

describe("hero resources", () => {
  const HERO_CROP = [true, true, true, false];

  it("leaves hero resources out of the trade and says what to take", () => {
    const p = planNeeds([500, 0, 0, 0], [100, 100, 100, 900], HERO_CROP);
    expect(p).toMatchObject({ haveTotal: 500, needSum: 300, needAll: 1200, shortEach: [0, 100, 100, 0], heroTake: [0, 0, 0, 900], heroSum: 900, coveredNpc: true, useNpc: true });
  });

  it("is covered directly when only hero resources are missing", () => {
    const p = planNeeds([100, 100, 100, 0], [100, 100, 100, 50], HERO_CROP);
    expect(p).toMatchObject({ coveredDirect: true, useNpc: false, heroTake: [0, 0, 0, 50] });
  });

  it("keeps hero resources at what the village has and never puts leftover there", () => {
    expect(npcTargets([100, 100, 100, 900], 500, NO_CAPS, 3, HERO_CROP, [500, 0, 0, 7])).toEqual([300, 100, 100, 7]);
  });

  it("matches the default when nothing comes from the hero", () => {
    const all = [true, true, true, true];
    expect(planNeeds([500, 0, 0, 0], [100, 100, 100, 100], all)).toEqual(planNeeds([500, 0, 0, 0], [100, 100, 100, 100]));
    expect(npcTargets([100, 100, 100, 100], 500, NO_CAPS, 0, all, [500, 0, 0, 0])).toEqual(npcTargets([100, 100, 100, 100], 500, NO_CAPS, 0));
  });
});
