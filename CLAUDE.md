# Travian Village Planner

Static web tool for Travian Legends players. It keeps a plan per saved village and plans building upgrades, celebrations and mixed troop training, computes NPC merchant redistribution (optionally leaving out resources taken from the hero), and works out what to send from another village, with the distance from map coordinates.

## Structure
Vite + TypeScript, no runtime dependencies. Output is a static site in `dist/`.

```
index.html              markup only; loads src/style.css and src/main.ts
src/
  main.ts               DOM wiring: rendering, events, reading inputs
  storage.ts            localStorage: saved villages, unit stat edits, migration of old saves
  style.css             all styles (light/dark via CSS variables on :root)
  types.ts              Res4, Unit, Building, Merchant, Celebration
  data/
    units.json          units per tribe
    buildings.json      buildings: level-1 cost, growth factor k, max level
    merchants.json      merchant capacity and speed per tribe
    celebrations.json   small and great celebration costs
    index.ts            typed exports UNITS, BUILDINGS, MERCH, CELEBRATIONS
  parse/
    overview.ts         parseOverview: reads a pasted copy of the game's village overview
  calc/                 pure functions, no DOM access
    buildings.ts        round5, levelCost, rangeCost, buildingTotals
    troops.ts           trainingTime, maxTroops, troopsForTime, maxTroopMix, planTroops, mixDuration
    celebrations.ts     celebrationCost
    npc.ts              storageCaps, planNeeds, npcTargets
    merchants.ts        merchantsNeeded, travelSeconds, mapDistance
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
- Do not reorder entries in `units.json`, `buildings.json` or `celebrations.json`: saved state stores indices. Append new entries at the end of a list.
- Storage: everything lives under the localStorage key `village-planner-v2` (`Store` in `storage.ts`): one `VillageState` per saved village, plus unit stat edits (`overrides`) shared by all villages. If that key is missing, the old single-village saves `village-planner` then `npc-planner` are migrated into the first village and left in place. Keep that migration working.
- A single troop row with no celebrations and nothing from the hero must give exactly the results of the old single-unit version in each mode; `troopMix.test.ts` checks this against `maxTroops` and `troopsForTime`.
- Older saves had one village-wide troop `mode` (none/max/count/time) with shared hours and minutes. `normalizeTroops` gives each row its own mode and time on load; "none" becomes no rows. Keep it.
- `[hidden] { display: none !important; }` in `style.css` makes the `hidden` attribute win over classes that set `display`. Keep it.
- Form fields set `box-sizing: border-box` themselves, because Chrome doesn't pass it through to elements inside `<details>`.
- The paste import must stay something the user triggers by copying text. Travian's rules ban tools that automate or read the game directly.
- `vite.config.ts` uses `base: "./"` so the build works under any GitHub Pages path, and `cssMinify: false` so the stylesheet ships as written.
- Keep it dependency-free at runtime unless a feature clearly needs a library.
- Mobile-first: the main user plays on a phone. Support light and dark mode via the CSS variables.

## Formulas in use
- Building level cost: `round5(base * k^(level-1))` per resource. `k` is 1.67 for resource fields, 1.80 for factory buildings, and about 1.28 for most others.
- Training time per unit: `base * 0.9^(buildingLevel-1) / serverSpeed * (1 - bonus%)`.
- Max troops: `floor((totalResources - otherCosts) / unitCostSum)`, where other costs are buildings plus celebrations, also limited by warehouse/granary capacity per resource (a cap is ignored for a resource whose other costs alone exceed it).
- Troop rows: each row has its own mode. "Set number" and "Fill a time" rows (`floor(seconds / perUnit)`) are fixed and paid first, with buildings and celebrations. "Max possible" rows share what is left by ratio: the largest number of batches `x` (one batch = `weight` units of each max row) under the same limits, then each row gets `floor(weight * x)`. Level and time bonus are set per training building; each building is its own queue, and "All done in" is the longest queue.
- Hero resources: a resource ticked “Take from the hero” is left out of the NPC trade. It keeps the village's amount in the NPC dialog, its shortfall is taken from the hero, it doesn't count toward the total for max troops, and only storage limits it.
- Celebrations: fixed cost per celebration (small 6,400 / 6,650 / 5,940 / 1,340, great 29,700 / 33,250 / 32,000 / 6,700).
- NPC leftover goes to the preferred resource first, then crop, wood, clay, iron, within capacity.
- Merchant travel time: `distance / (merchantSpeed * serverSpeed)`.
- Distance between saved villages: straight line on a 401 × 401 map (-200..200) that wraps at the edges (`mapDistance`). Filled in automatically when both villages have coordinates.

## Known gaps / unverified data
- Celebration costs are standard values from memory, not yet checked against the game.
- Smithy upgrades are not implemented: we still need a reliable source for their costs.
- The paste import is tested against an English phone copy only. Other languages should work (numbers and the sum row are found without relying on words), but the “Population” fallback for finding the active village is English-only.
- The map size (401) is fixed; servers with a different map size would need it as a setting.
- Spartan unit costs are unverified; Spartan base training times are blank (0).
- Other tribes' base training times are from memory; verify against the game.
- Building construction time is not implemented (formula depends on main building level and per-building constants).
- Rounding behaviour of building costs at high levels has not been checked against the game. Verified cases: Warehouse level 2 and Cropland level 10 (see `buildings.test.ts`).

## Import from the game
The user copies the whole Village overview page, Resources tab and/or Capacity tab, and pastes it into “Import from the game” (one tab per paste). `parseOverview`:
- strips the direction marks (U+202A–202E, U+2066–2069) the game puts around every number;
- finds the top bar as a run of number-only lines: warehouse, wood, clay, iron, granary, crop (gold/silver before it are skipped);
- reads Resources rows as `name, wood, clay, iron, crop[, merchants a/b]` and Capacity rows as `name, warehouse, granary`, and drops the last row of each if it is the sum of the others;
- picks the active village as the Resources row closest to the top bar, or the only Capacity row with the top bar's warehouse and granary, else the line before “Population”;
- reads coordinates `(x|y)` from the village list, on their own line under the name or after it.

Each row is mapped to a saved village (matched by remembered `gameName` or by name; on the first import the active row defaults to the village shown) or to a new one. Rows from both tabs are merged by name. Each village gets whatever the paste has: resources, storage, coordinates. The village you were in always gets the top bar (resources and storage, the freshest values), and the planner switches to it.
