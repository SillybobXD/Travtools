# Travian Village Planner

Static web tool for Travian Legends players. It keeps a plan per saved village and plans building upgrades, celebrations and mixed troop training, computes NPC merchant redistribution (optionally never converting into resources you claim from the hero), and works out what to send from another village, with the distance from map coordinates.

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
    units.json          units per tribe: cost, upkeep, training, combat stats (att, defInf, defCav, speed, carry, kind)
    buildings.json      buildings: level-1 cost, growth factor k, max level
    merchants.json      merchant capacity and speed per tribe
    celebrations.json   small and great celebration costs
    capacity.json       warehouse/granary capacity by level (0 = none)
    walls.json          wall name, defence factor and flat defence per level, by tribe
    index.ts            typed exports UNITS, BUILDINGS, MERCH, CELEBRATIONS, CAPACITY, WALLS
  parse/
    overview.ts         parseOverview: reads a pasted copy of the game's village overview
  calc/                 pure functions, no DOM access
    buildings.ts        round5, levelCost, rangeCost, buildingTotals
    troops.ts           trainingTime, maxTroops, troopsForTime, maxTroopMix, maxTroopMixDirect, planTroops, mixDuration
    celebrations.ts     celebrationCost
    npc.ts              storageCaps, planNeeds, npcTargets
    combat.ts           upgraded, attackPower, defencePower, weightedDefence, wallBonus, wallDefence, morale, massFactor, lossShares, unitLosses, woundedOf, battle
    merchants.ts        merchantsNeeded, travelSeconds, mapDistance
    timing.ts           timeToAffordDirect, timeToAffordTrade, timeToFull, timeToEmpty
    format.ts           fmt, fmtTime, toNum, toSignedNum
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
- A single troop row with no celebrations, every resource convertible and “Use an NPC trade” on must give exactly the results of the old single-unit version in each mode; `troopMix.test.ts` checks this against `maxTroops` and `troopsForTime`.
- Older saves had one village-wide troop `mode` (none/max/count/time) with shared hours and minutes. `normalizeTroops` gives each row its own mode and time on load; "none" becomes no rows. Keep it.
- `[hidden] { display: none !important; }` in `style.css` makes the `hidden` attribute win over classes that set `display`. Keep it.
- Form fields set `box-sizing: border-box` themselves, because Chrome doesn't pass it through to elements inside `<details>`.
- The paste import must stay something the user triggers by copying text. Travian's rules ban tools that automate or read the game directly.
- `vite.config.ts` uses `base: "./"` so the build works under any GitHub Pages path, and `cssMinify: false` so the stylesheet ships as written.
- Keep it dependency-free at runtime unless a feature clearly needs a library.
- Icons are our own inline SVG symbols in the sprite at the top of `index.html` (`<use href="#i-wood">`, or `icon()` in `main.ts`). Don't copy Travian's artwork.
- The plan table must fit 375px without scrolling: keep long text in its cells on separate lines.
- Mobile-first: the main user plays on a phone. Support light and dark mode via the CSS variables.

## Formulas in use
- Building level cost: `round5(base * k^(level-1))` per resource. `k` is 1.67 for resource fields, 1.80 for factory buildings, and about 1.28 for most others.
- Warehouse and granary are chosen by level (`capacity.json`) or “Other amount” for anything else (several warehouses, great warehouse, artifacts). The typed capacity in `fields.wh`/`fields.gr` stays the saved value; the dropdown follows it.
- Training time per unit: `base * 0.9^(buildingLevel-1) / serverSpeed * (1 - bonus%)`.
- Max troops: `floor((totalResources - otherCosts) / unitCostSum)`, where other costs are buildings plus celebrations, also limited by warehouse/granary capacity per resource (a cap is ignored for a resource whose other costs alone exceed it).
- Troop rows: each row has its own mode. "Set number" and "Fill a time" rows (`floor(seconds / perUnit)`) are fixed and paid first, with buildings and celebrations. "Max possible" rows share what is left by ratio: the largest number of batches `x` (one batch = `weight` units of each max row) under the same limits, then each row gets `floor(weight * x)`. Level and time bonus are set per training building; each building is its own queue, and "All done in" is the longest queue.
- “Do not convert into” (saved as `hero` per resource): the NPC trade never converts into that resource. When the plan involves a trade (now, or after sending), all of the village's amount goes into the trade (its NPC target is 0) and its whole need is claimed from the hero afterwards; when no trade is needed only its shortfall is claimed. Sending without a trade means the village alone: it sends every shortfall, ticked resources included (`villageShort`). For max troops its cost doesn't count against the total (the hero covers it); only storage limits it.
- One trading switch, “Use an NPC trade” at the top of the Plan card (`useTrade`, default on), decides for the whole plan: max troops, verdict, NPC table, timing and sending. “Don't convert into” and “Leftover into” sit under it and only apply when it's on; when it's off every resource counts as the village's own (no hero).
- Max possible with and without trading: with a trade the total is shared (`maxTroopMix`); without one each resource limits on its own (`maxTroopMixDirect`). The switch picks which goes into the plan; max rows show the other in brackets.
- “Max possible” troops use what's left, so they never make the plan short. The verdict and NPC table use the full need (`need`), because the trade has to produce the troops' mix. Sending and timing use the fixed plan only (`fixedNeed`: buildings, celebrations, set-number and timed troops); otherwise they would advise sending resources for troops sized to fit what you have.
- Celebrations: fixed cost per celebration (small 6,400 / 6,650 / 5,940 / 1,340, great 29,700 / 33,250 / 32,000 / 6,700).
- NPC leftover goes to the preferred resource first, then crop, wood, clay, iron, within capacity.
- Merchant travel time: `distance / (merchantSpeed * serverSpeed)`.
- Combat (`combat.ts`): the T4 model of kirilloid's simulator (github.com/kirilloid/travian, `src/model/t4/combat`), checked against 13 runs of the game's own Combat Simulator (`combat.test.ts`). No hero, artifacts, alliance bonuses, residence/palace defence, scouting or building damage yet. Armies are plain `{ tribe, counts[], smithy[] }` by unit index; the defence is a list of such contingents (the village's own troops plus reinforcements of any tribe).
  - Unit value with smithy, `u = upkeep / 1.007`: `value + (value + 300u/7) * (1.007^level - 1) + 0.0021u`, rounded to 4 decimals, for attack and both defences. Even level 0 is slightly above the base (Clubswinger 40.0021), which the game shows: 10,000 Clubswingers have 400,021 attack.
  - Attack splits into infantry and cavalry by `kind`: only `cav` is cavalry; scouts, siege and admin units (chiefs, settlers) attack as infantry.
  - Defence: `(defInf * infShare + defCav * cavShare + 10 + wallDef * level) * round3(wallFactor^level)`, shares rounded to 4 decimals. Wall per village owner's tribe (`walls.json`): Roman 1.03 and +10 per level, Teuton 1.02 and +6, Gaul 1.025 and +8, Egyptian 1.025 and +8, Hun 1.015 and +6.
  - Morale multiplies the attack, only when the attacker has more population: `max(0.667, round3((attPop / max(defPop, 3))^(-0.2 * min(1, off/def))))`.
  - Mass factor `k = 2 * (1.8592 - units^0.015)` within 1.2578..1.5, rounded to 0.0002, units = all troops of both sides (1.5 up to about 1,000 units).
  - With `x = (attack/def)^k`: normal attack, attacker loses `min(1, 1/x)` and defender `min(1, x)` (a tie kills both); raid, attacker `1/(1+x)` and defender `x/(1+x)`. Survivors per unit type are `round(count * (1 - share))`. A lone attacking unit with under 84.5 attack always dies.
  - Wounded: the game's simulator shows a second losses row, `floor(0.4 * lost)` per unit type and 0 for siege. These are part of the losses (supply and resources lost count all of them), presumably the Legends hospital's healable troops. `battle()` returns them as `attackerWounded`/`defenderWounded`.
- Production per hour is entered per village (crop may be negative). Storage fills at `(cap - have) / production`; negative crop runs out at `have / -production`.
- Time to afford (fixed plan, whichever way the switch is set). Without trading: the slowest missing resource, `(need - have) / production`; never if it isn't produced or doesn't fit in storage. Resources not to convert into are claimed from the hero and don't wait.
- With an NPC trade: when the village's total reaches the need of the convertible resources. Each resource grows within its storage (production stops when full) and negative crop stops at 0, so the total is piecewise linear; `timeToAffordTrade` solves it exactly per stretch.
- Times count from `resAt`, when the resource, storage or production numbers were last typed or imported, and show as a clock time.
- Distance between saved villages: straight line on a 401 × 401 map (-200..200) that wraps at the edges (`mapDistance`). Filled in automatically when both villages have coordinates.

## Known gaps / unverified data
- Celebration costs are standard values from memory, not yet checked against the game.
- Smithy upgrades are not implemented: we still need a reliable source for their costs.
- The paste import is tested against an English phone copy only. Other languages should work (numbers and the sum row are found without relying on words), but the “Population” fallback for finding the active village is English-only.
- The map size (401) is fixed; servers with a different map size would need it as a setting.
- Spartan unit costs are unverified; Spartan base training times are blank (0).
- Combat stats in `units.json` (att, defInf, defCav, speed, carry): Romans, Teutons and Gauls match kirilloid's T4 data and the units used in the simulator cases match the game; Egyptians and Huns match kirilloid's Fire and Sand data. Theutates Thunder attack is confirmed 100 in the game (kirilloid's data has 90). Spartan stats and the Spartan wall (1.02, +6 per level) are guesses.
- Combat checks against the game's simulator so far: infantry vs cavalry, mixed armies, all three classic walls at level 10, smithy 10, a 18,000-unit battle, a reinforcement of another tribe, normal and raid.
- Morale is kirilloid's formula, unverified against the game: its Combat Simulator has no population input. It can only be checked with real reports where both populations are known.
- The game shows combat strength with the attack rounded and the defence apparently rounded down; the tests allow 1 point.
- Rams are not modelled. In case 14, 20 rams with a losing attack left palisade 10 "not damaged", while kirilloid's ram formula would take it to 9; this needs more cases (winning attacks with rams) before Phase 3's "rams get through".
- Other tribes' base training times are from memory; verify against the game.
- Building construction time is not implemented (formula depends on main building level and per-building constants).
- Rounding behaviour of building costs at high levels has not been checked against the game. Verified cases: Warehouse level 2 and Cropland level 10 (see `buildings.test.ts`).

## Combat optimizer roadmap
Phase 1 (done): combat data and the simulator in `combat.ts`.
2. Paste parsers for battle, scout and defence reports and the village overview Troops tab.
3. Optimizer in `src/calc/optimize.ts`: owned troops, or an "optimal" army of any units of your tribe under a resource cap; objectives: fewest losses by resource value, smallest winning army, most enemy losses, rams get through; normal attack and raid; attack and defend modes.
4. A separate `combat.html` page sharing saved villages and storage.
5. Splitting the army across villages using coordinates and travel time.

## Import from the game
The user copies the whole Village overview page (Resources, Production or Capacity tab) and pastes it into “Import from the game”, one tab per paste. `parseOverview`:
- strips the direction marks (U+202A–202E, U+2066–2069) the game puts around every number;
- finds the top bar as a run of number-only lines: warehouse, wood, clay, iron, granary, crop, then the crop balance (crop per hour after upkeep) if present; gold/silver before it are skipped;
- reads Resources rows as `name, wood, clay, iron, crop, merchants a/b`, Production rows as `name` plus four per-hour numbers with no merchants column (crop may be negative), and Capacity rows as `name, warehouse, granary`, and drops the last row of each if it is the sum of the others (on the Production tab the sum row's label has the grand total glued to it, e.g. `Sum:20,859`);
- picks the active village as the Resources row closest to the top bar, or the only Capacity row with the top bar's warehouse and granary, else the line before “Population”;
- reads coordinates `(x|y)` from the village list, on their own line under the name or after it.

Each row is mapped to a saved village (matched by remembered `gameName` or by name; on the first import the active row defaults to the village shown) or to a new one, and the saved village is renamed to its game name. Rows from all tabs are merged by name. Each village gets whatever the paste has: resources, production, storage, coordinates. The Production tab's crop is before troop upkeep (e.g. 2,893/h on the tab vs a 2,177/h balance), so the village you were in takes the top bar's crop balance instead; other villages take the tab's crop and are flagged `cropGross` (a note says so) unless they already have a balance, which is kept. The village you were in always gets the top bar (resources and storage, the freshest values), and the planner switches to it.
