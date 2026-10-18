# Travian Village Planner

Static web tool for Travian Legends players. It plans building upgrades and troop training, computes NPC merchant redistribution, and works out what to send from another village.

## Structure
Vite + TypeScript, no runtime dependencies. Output is a static site in `dist/`.

```
index.html              markup only; loads src/style.css and src/main.ts
src/
  main.ts               DOM wiring: rendering, events, reading inputs
  storage.ts            localStorage save/load
  style.css             all styles (light/dark via CSS variables on :root)
  types.ts              Res4, Unit, Building, Merchant
  data/
    units.json          units per tribe
    buildings.json      buildings: level-1 cost, growth factor k, max level
    merchants.json      merchant capacity and speed per tribe
    index.ts            typed exports UNITS, BUILDINGS, MERCH
  calc/                 pure functions, no DOM access
    buildings.ts        round5, levelCost, rangeCost, buildingTotals
    troops.ts           trainingTime, maxTroops, troopsForTime
    npc.ts              storageCaps, planNeeds, npcTargets
    merchants.ts        merchantsNeeded, travelSeconds
    format.ts           fmt, fmtTime, toNum
    *.test.ts           Vitest tests next to each module
.github/workflows/deploy.yml   test, build and deploy to GitHub Pages on push to main
```

Resource arrays (`Res4`) are always wood, clay, iron, crop.

## Commands
- `npm run dev`: dev server with hot reload
- `npm test`: run tests once (`npm run test:watch` to keep watching)
- `npm run typecheck`: TypeScript check, tests included
- `npm run build`: typecheck, then build to `dist/`
- `npm run preview`: serve the built `dist/`

## Rules
- Keep calculation logic in `src/calc/` as pure functions with tests; `main.ts` only reads inputs and renders.
- Do not reorder entries in `units.json` or `buildings.json`: saved state stores unit and building indices. Append new entries at the end of a list.
- The localStorage key is `village-planner`; `npc-planner` is read once as a legacy fallback. Keep both working.
- `vite.config.ts` uses `base: "./"` so the build works under any GitHub Pages path, and `cssMinify: false` so the stylesheet ships as written.
- Keep it dependency-free at runtime unless a feature clearly needs a library.
- Mobile-first: the main user plays on a phone. Support light and dark mode via the CSS variables.

## Formulas in use
- Building level cost: `round5(base * k^(level-1))` per resource. `k` is 1.67 for resource fields, 1.80 for factory buildings, and about 1.28 for most others.
- Training time per unit: `base * 0.9^(buildingLevel-1) / serverSpeed * (1 - bonus%)`.
- Max troops: `floor((totalResources - buildingCost) / unitCostSum)`, also limited by warehouse/granary capacity per resource (a cap is ignored for a resource whose building cost alone exceeds it).
- NPC leftover goes to the preferred resource first, then crop, wood, clay, iron, within capacity.
- Merchant travel time: `distance / (merchantSpeed * serverSpeed)`.

## Known gaps / unverified data
- Spartan unit costs are unverified; Spartan base training times are blank (0).
- Other tribes' base training times are from memory; verify against the game.
- Building construction time is not implemented (formula depends on main building level and per-building constants).
- Rounding behaviour of building costs at high levels has not been checked against the game. Verified cases: Warehouse level 2 and Cropland level 10 (see `buildings.test.ts`).
