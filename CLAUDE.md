# Travian Village Planner

Static web tool for Travian Legends players, three pages sharing the saved villages. The Village planner keeps a plan per saved village and plans building upgrades, celebrations and mixed troop training, computes NPC merchant redistribution (optionally never converting into resources you claim from the hero), and works out what to send from another village, with the distance from map coordinates. The Combat page finds the army to attack with or the reinforcements to send, from pasted reports and the player's troops. The Expansion page forecasts when culture points allow the next village and when to start the Residence or Palace and the settlers.

## Structure
Vite + TypeScript, no runtime dependencies. Output is a static site in `dist/`.

```
index.html              Village planner markup only; loads src/style.css and src/main.ts
combat.html             Combat page markup only; loads src/style.css and src/combat.ts
expansion.html          Expansion page markup only; loads src/style.css and src/expansion.ts
src/
  main.ts               Village planner DOM wiring: rendering, events, reading inputs
  combat.ts             Combat page DOM wiring: reads inputs, runs optimize() and battle(), renders
  expansion.ts          Expansion page DOM wiring: culture point forecast and the Residence/settler plan
  storage.ts            localStorage: saved villages, unit stat edits, combat and expansion page state, migration of old saves
  style.css             all styles (light/dark via CSS variables on :root)
  types.ts              Res4, Unit, Building, Merchant, Celebration
  data/
    units.json          units per tribe: cost, upkeep, training, combat stats (att, defInf, defCav, speed, carry, kind)
    buildings.json      buildings: level-1 cost, growth factor k, max level
    merchants.json      merchant capacity and speed per tribe
    celebrations.json   small and great celebration costs
    capacity.json       warehouse/granary capacity by level (0 = none)
    walls.json          wall name, defence factor and flat defence per level, by tribe
    nature.json         Nature's animals (oasis defenders): att, defInf, defCav, upkeep. Not a tribe
    culture.json        CP helmets, the daily quest reward, celebration culture points
    index.ts            typed exports UNITS, BUILDINGS, MERCH, CELEBRATIONS, CAPACITY, WALLS, NATURE, NATURE_TRIBE, CULTURE
  parse/
    overview.ts         parseOverview: reads a pasted copy of the game's village overview
    text.ts             shared helpers: cleanLines (drops direction marks), toInt, NUM/SNUM/NUM_LINE/COORD patterns
    units.ts            unitHeader, tribeOf, tribeOfPrefix: recognise a tribe from a row of unit names
    report.ts           parseReport: battle, raid, scout and defence reports; reportArmy
    troops.ts           parseTroops: troops per village from the overview's Troops tab; villageArmy
    smithy.ts           parseSmithy: smithy levels per village from the overview's Smithy tab; villageSmithy
    culture.ts          parseCulture: the overview's and the Residence's Culture points tabs
    combatInput.ts      fillFromReport, smithyFromReport: what a parsed report fills in on the combat page
    report.fixtures.ts  anonymized report pastes for tests (and for checking the page by hand)
  calc/                 pure functions, no DOM access
    buildings.ts        round5, levelCost, rangeCost, buildingTotals
    troops.ts           trainingTime, maxTroops, troopsForTime, maxTroopMix, maxTroopMixDirect, planTroops, mixDuration
    celebrations.ts     celebrationCost
    npc.ts              storageCaps, planNeeds, npcTargets
    combat.ts           upgraded, attackPower, defencePower, weightedDefence, wallBonus, wallDefence, morale, massFactor, lossShares, unitLosses, woundedOf, battle
    optimize.ts         optimize (attack or defend army search), simulateOption, trimOption, mainMix, unitValue, armyValue, combatUnits, lootable, simplexGrid
    culture.ts          cpPerDay, celebrationCp, cpForecast, slotsAt, slotLevel, expansionPlan
    smithyEstimate.ts   estimateAttackerSmithy, estimateDefenderSmithy: smithy levels that fit a report's combat strength
    merchants.ts        merchantsNeeded, travelSeconds, mapDistance
    travel.ts           slowestSpeed, armyTravelSeconds
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
- Do not reorder entries in `units.json`, `buildings.json`, `celebrations.json` or `nature.json`: saved state and parsed reports use indices. Append new entries at the end of a list.
- Storage: everything lives under the localStorage key `village-planner-v2` (`Store` in `storage.ts`): one `VillageState` per saved village, plus unit stat edits (`overrides`) shared by all villages. Both pages load and save the whole store, so each keeps what the other wrote. The combat page adds `store.combat` (`CombatState`: mode, enemy armies with smithy levels and the report's note, wall, target coordinates, loot, source, cap, allowed units per tribe, objective, trim, populations) and `village.combat` (`VillageCombat`: own troops and smithy levels per unit index); both are optional, and `combatOf` / `villageCombat` fill in defaults so older saves load. The expansion page adds `store.culture` (`CultureState`, account-wide), completed by `cultureOf`. If that key is missing, the old single-village saves `village-planner` then `npc-planner` are migrated into the first village and left in place. Keep that migration working.
- A single troop row with no celebrations, every resource convertible and “Use an NPC trade” on must give exactly the results of the old single-unit version in each mode; `troopMix.test.ts` checks this against `maxTroops` and `troopsForTime`.
- Older saves had one village-wide troop `mode` (none/max/count/time) with shared hours and minutes. `normalizeTroops` gives each row its own mode and time on load; "none" becomes no rows. Keep it.
- `[hidden] { display: none !important; }` in `style.css` makes the `hidden` attribute win over classes that set `display`. Keep it.
- Form fields set `box-sizing: border-box` themselves, because Chrome doesn't pass it through to elements inside `<details>`.
- Nature's animals live in `nature.json` (`NATURE`), never in `UNITS`, so the planner's tribe dropdown doesn't change. Combat and the parsers use the tribe key `NATURE_TRIBE` ("Nature") for them.
- Parsing is English-only by decision: report titles, "from village", wall names and unit names are matched in English.
- The paste import must stay something the user triggers by copying text. Travian's rules ban tools that automate or read the game directly.
- `vite.config.ts` uses `base: "./"` so the build works under any GitHub Pages path, and `cssMinify: false` so the stylesheet ships as written.
- Keep it dependency-free at runtime unless a feature clearly needs a library.
- Icons are our own inline SVG symbols in the sprite at the top of `index.html` (`<use href="#i-wood">`, or `icon()` in `main.ts`). Don't copy Travian's artwork.
- The plan table must fit 375px without scrolling: keep long text in its cells on separate lines.
- All pages share `style.css` and link to each other from the `.top-nav` header. Each page carries its own copy of the icon sprite with the symbols it uses.
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
  - Animals (`tribe: "Nature"`) fight with their `nature.json` stats and upkeep 1, are never wounded (a real report shows no wounded row for them) and count 0 as resource value.
  - Wounded: the game's simulator shows a second losses row, `floor(0.4 * lost)` per unit type and 0 for siege. These are part of the losses (supply and resources lost count all of them), presumably the Legends hospital's healable troops. `battle()` returns them as `attackerWounded`/`defenderWounded`.
- Optimizer (`optimize.ts`): attack (find the army to send against given defenders, wall and village tribe) or defend (find reinforcements so the village holds against a given attacker, with the troops already at home counted as ours). Troops are either owned (counts and smithy per village, as the Troops and Smithy tabs give) or optimal (any units of the tribe at given smithy levels, total cost of the four resources at most `cap`). Normal attack or raid.
  - Unit value is the sum of its four costs. Own losses count wounded as lost unless `woundedRecoverable`; on defence our side is home troops plus reinforcements.
  - Objectives: `fewestLosses` (must win), `smallestWin` (cheapest that wins), `mostEnemyLosses`, `mostLoot` (attacks: resources carried home minus own losses; carry of the survivors, limited to the scouted resources above the cranny capacity per resource). "Win" is `battle()`'s winner: attacker for attacks (raids too), defender for defence. An attack never sends nothing.
  - Searched units: infantry and cavalry by default (`units` overrides); scouts, chiefs, settlers and siege are left out (rams wait for a ram model).
  - Search: armies are a direction (mix of unit types) times a scale. Optimal mode: the direction shares the budget, `count = floor(budget * share / cost)`; owned mode: the direction is a fraction of each type's troops, `count = floor(t * fraction * available)`. Directions come from an even simplex grid (at most 130). Per direction an integer bisection finds the smallest winning scale, and a fixed ladder (budgets 100 × 1.25^j up to the cap, or t = 0.8^j) samples the rest. The 5 best distinct armies are refined by local search on whole units (± a step of one type, or trading one type for another within the cap), halving the step to 1. Every candidate is scored with `battle()`. Typically 1,000–10,000 battles, 5–50 ms on a desktop.
  - Owned attacks search each village separately (Phase 5 will split attacks across villages); owned reinforcements combine villages, each as its own contingent with its own smithy.
  - Trim (`trim`, the page's "Trim small leftovers", on by default): each picked army drops unit types worth under `TRIM_SHARE` (2%) of its resource value, never its most valuable type, and is simulated again (`trimOption`). If it won before and the trimmed army doesn't, removed types go back, most valuable first, until it wins. The option records what was removed and the change in own loss value. Only a value share is used (no unit-count rule), so a few expensive units that matter are never dropped for being few.
  - Output: the best army and up to 2 alternatives with another main mix (the unit types worth at least 10% of the army, `mainMix`) or a cost at least 10% apart, each with its `battle()` result, cost, own and enemy loss values, wounded value and loot.
- Enemy smithy estimate (`smithyEstimate.ts`): combat strength is a sum of unit values, each rising with its smithy level, so levels 0–20 are tried and a level fits when its strength is within 1 of the report's. Reported: a common level (one level for all types, a range since the sum rises with it) and per type (a level fits if some levels 0–20 of the other types make up the rest); the page pre-fills the middle of the common range, else of each type's range, and shows the note (e.g. "Report suggests Clubswinger smithy 10."). A hero adds an unknown amount, so then the strength only caps the levels ("uncertain"). Morale and bonuses are assumed absent.
  - Attacker (defend mode): from the attacker's strength in the statistics.
  - Defender (attack mode): only when everything else is known: the wall level is in the report (or the target is an oasis, wall 0), no rams (they may lower the wall during the battle), the attack was all infantry or all cavalry, and one army besides animals defended. Shown = (units + 10 + wall's flat defence) × wall bonus.
  - Scout reports and other reports without statistics give nothing, and the page says so.
- Culture points (`culture.ts`), in seconds from when the CP numbers were pasted or typed (`cpAt`):
  - CP per day = (villages + hero) + floor((villages + hero) × alliance bonus %), as the Residence tab shows (1,259 + 100, +4% = 54, total 1,413).
  - Hero helmets: Helmet of the Gladiator tier 1/2/3 = 100/400/1,600 CP per day. Daily quest: 400 CP every 4 days (from the next reward time).
  - Celebrations add their CP when they end: small 500, at most the village's CP per day; great 2,000, at most the account's. Artwork: one day of the account's CP by default. These caps and the Artwork value are unverified; every event's CP can be typed.
  - `cpForecast`: production is continuous, events are jumps; solved exactly between events. With production alone it matches the game's own estimate (within its ±5 minutes); the game's estimate ignores celebrations.
  - Settlement slots: Residence at 10 and 20, Palace at 10, 15 and 20. The game doesn't let settlers leave before the CP are there, so the last settler is ready at the CP time; settlers train one after another at the slot level (`trainingTime`, the village's Residence/Palace bonus); the upgrades end when the first settler starts. If that can't fit, the plan starts now and the village comes later (`late`).
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
- Nature's animal stats in `nature.json` are kirilloid's (T3 data, assumed unchanged in Legends); not yet checked against the game.
- The optimizer is a heuristic search: it is not guaranteed to find the true optimum, though tests check it against hand-worked cases, that a bigger cap never scores worse on sample targets, and that every reported win is a win in `battle()`.
- Rams are not modelled (see the ram cases under "Import reports and troops").
- Other tribes' base training times are from memory; verify against the game.
- Building construction time is not implemented (formula depends on main building level and per-building constants). The Expansion page asks for the Residence/Palace upgrade time.
- Celebration CP caps, celebration durations (Town Hall level) and the Artwork's CP are unverified; queued celebrations are typed with their end time.
- Rounding behaviour of building costs at high levels has not been checked against the game. Verified cases: Warehouse level 2 and Cropland level 10 (see `buildings.test.ts`).

## Combat page
`combat.html` + `src/combat.ts`, top to bottom:
- Mode: Attack or Defend, Normal attack or Raid.
- Paste a report: `parseReport` then `fillFromReport`. Attack: the report's defenders become the target's contingents (animals as Nature), plus the owner's tribe, wall (after rams if shown), an oasis's coordinates and scouted resources with cranny capacity. Defend: the report's attacker becomes the incoming army. Everything read is shown in editable fields and can be typed by hand.
- Target / Incoming attack: owner's tribe and wall level, one unit grid per contingent (attack can add reinforcements), troops at home (defend, counted as ours), scouted resources and cranny capacity (attack raids), and the target's or defended village's coordinates.
- Each enemy army (not animals) has smithy levels per unit, blank = 0, filled from the report's estimate when it gives one; the estimate's note shows under them and in the paste status.
- Your troops: the saved village (its tribe and server speed are used), owned troops (stored per village, filled by pasting the Troops tab, rows matched by saved village name or game name) or any troops up to a resource cap, the units to use (infantry and cavalry), and smithy levels (pasting the Smithy tab).
- Optimize for: the four objectives (most loot only in attack raids), "Trim small leftovers" (on by default; a card notes what was trimmed and the change in losses), wounded as recoverable, and optional populations for morale.
- Best army: the best option and its alternatives as cards (army, win or lose, army value, our losses and wounded, enemy losses, loot in raids, travel time when both villages have coordinates, using the slowest unit and server speed). "Simulate / edit this army" opens an editable army run through `battle()` on every keystroke.
The optimizer runs 200 ms after the last change; the simulator runs at once.

## Expansion page
`expansion.html` + `src/expansion.ts`, top to bottom:
- Paste: the overview's Culture points tab (CP per day per village, running celebrations' time left, slots used/total, the game's estimate) and the Residence's or Palace's Culture points tab (CP so far, CP for the next village, per day: active village, other villages, hero, alliance bonus %, total). One at a time; each fills what it has. A running celebration replaces the next one listed for that village, keeping its small/great choice (small by default; the tab doesn't say).
- Culture points: so far, next village at, CP per day (villages, helmet, alliance %), the total checked against the game's.
- Extra culture points: daily quest reward (next time), celebrations and Artworks with a time and CP (blank = default).
- Next village: the forecast, what counts towards it, the game's estimate, and what would help (an Artwork now, the next helmet tier).
- Residence and settlers: the saved village (tribe, server speed, Residence bonus), Residence or Palace, level now, slots used (from the paste), the upgrade time typed, settlers to train; the latest start of each step and the costs.

## Combat optimizer roadmap
1. Done: combat data and the simulator in `combat.ts`.
2. Done: paste parsers for battle, scout and defence reports and the overview's Troops and Smithy tabs (`src/parse/report.ts`, `troops.ts`, `smithy.ts`), no UI yet. Built from samples in `Report samples/` (git-ignored, like `Combat reports/`: they hold player and village names, so tests keep only anonymized structure and numbers).
3. Done: optimizer in `src/calc/optimize.ts` (see "Formulas in use"), no UI yet. Waiting: a "rams get through" objective, once ram damage is modelled from simulator runs with rams against each wall type, winning and losing.
4. Done: the Combat page (`combat.html`), sharing saved villages and storage with the planner.
5. Next: splitting the army across villages using coordinates and travel time.

## Import reports and troops
The user copies a report or the overview's Troops tab ("Own troops") or Smithy tab, the whole page or just that part. Tested against English phone copies.
- Unit tables are found by shape: a tab-separated line of exactly ten unit names (no digits), optionally followed by "Hero", then rows of ten or eleven numbers or "?". `tribeOf` matches the names against `units.json` ignoring case; Nature's animals (Rat … Elephant, seen as oasis or village reinforcements) give tribe `NATURE_TRIBE`; other languages give tribe null, with the names kept.
- Report rows in order: sent, lost (wounded included), wounded (only when shown), and in one sample a fourth row of own troops freed from a trap ("You freed N own troops"). Survived = sent − lost. A row of "?" means hidden troops (`defenceHidden`). The first table is the attacker; the others are the defender's own troops, then each "Reinforcement" block (no player line).
- The title line before the date (`19.10.26, 13:11:30`) gives the type: " attacks " normal, " raids " raid, " scouts " scout. The place line is `[TAG] player from village V`, with `(x|y)` in V for oases.
- Between the attacker's table and the next: information lines (any line with a space), then the bounty (four numbers and `carried/capacity`). After the last table: four statistics pairs (combat strength, supply before, supply lost, resources lost), found by shape.
- Wall from the information lines, by the names in `walls.json`: `Palisade level 10` (scout), `City Wall level 20 destroyed` and `Earth Wall damaged from level 15 to level 14` (rams), `Palisade was not damaged.` (simulator). Scout reports also list other buildings as `Name level N`.
- A resource scout has `Resources` and six numbers after the attacker's table: wood, clay, iron, crop, the cranny capacity, and the total (checked as the sum of the four) → `scouted.res` and `scouted.crannyCapacity`.
- Troops tab: header `Village`, ten unit names, `Hero`; one row per village; the last row is the sum and is dropped.
- Smithy tab: `Village / in progress / Research Level`, then the eight upgradable unit names (tribe by `tribeOfPrefix`); each row is the village, the unit being upgraded (`•` none, `-` no smithy) and a level per unit, `-` when not researched (level 0). `villageSmithy` gives ten levels for an army's `smithy`.

What the samples showed:
- Wounded in most real reports follow the simulator: `floor(0.4 * lost)` per unit, 0 for rams and catapults. Not always: in the partial wall damage report a Gaul reinforcement lost 450 Phalanxes and 50 Druidriders with only 60 and 0 wounded, and the attacker (lost 33 + 178 + 201 + 29 siege) had no wounded row at all; presumably the hospital's level or space limits it. The row is also missing in some raids, so a third row is wounded only by position.
- Rams, three cases, compared with kirilloid's T4 ram formula (`4 * sigma(off/def) * floor(rams / durability)` demolish points, `sigma(x) = (2 - x^-1.5)/2` above 1 and `x^1.5/2` below; each wall level costs its level number; ram smithy assumed 0; off/def from the combat strength shown):
  - 67 Gaul rams (26 lost) win against a Roman City Wall 20 (225,286 vs 116,678): destroyed, 20 → 0. Formula: 218 points → 0. Matches, but only just (210.5 needed).
  - 28 Gaul rams (17 lost) win against a Teuton Earth Wall 15 (58,092 vs 42,060): 15 → 14. Formula: 77.5 points → 9. Does not match; it would fit if the Earth Wall's durability divided the rams by about 3 or 4 (ram smithy above 0 would make the gap bigger).
  - 20 Teuton rams lose against a Gaul Palisade 10 (simulator case 14, 5,300 vs 9,395): not damaged. Formula: 17 points → 9. Does not match.
  So kirilloid's formula with durability 1 for every wall is not reliable; rams are not modelled. Teuton Earth Wall durability (and whether losing attacks damage walls at all) needs more cases, ideally simulator runs with rams and known smithy.
- Hero: the report shows only a 0/1 hero column, never its strength or items. Combat strength includes it: 930 Clubswingers + 180 Axemen with a hero show 49,370 against 48,000 from the units, so the hero added about 1,370 (smithy unknown).
- Defence we don't model yet: an empty Teuton village defended with 373, and an occupied oasis's 55 Spearmen + 23 Paladins with 4,360 instead of about 4,234 (smithy, residence/palace or oasis bonus unknown).

## Import from the game
The user copies the whole Village overview page (Resources, Production or Capacity tab) and pastes it into “Import from the game”, one tab per paste. `parseOverview`:
- strips the direction marks (U+202A–202E, U+2066–2069) the game puts around every number;
- finds the top bar as a run of number-only lines: warehouse, wood, clay, iron, granary, crop, then the crop balance (crop per hour after upkeep) if present; gold/silver before it are skipped;
- reads Resources rows as `name, wood, clay, iron, crop, merchants a/b`, Production rows as `name` plus four per-hour numbers with no merchants column (crop may be negative), and Capacity rows as `name, warehouse, granary`, and drops the last row of each if it is the sum of the others (on the Production tab the sum row's label has the grand total glued to it, e.g. `Sum:20,859`);
- picks the active village as the Resources row closest to the top bar, or the only Capacity row with the top bar's warehouse and granary, else the line before “Population”;
- reads coordinates `(x|y)` from the village list, on their own line under the name or after it.

Each row is mapped to a saved village (matched by remembered `gameName` or by name; on the first import the active row defaults to the village shown) or to a new one, and the saved village is renamed to its game name. Rows from all tabs are merged by name. Each village gets whatever the paste has: resources, production, storage, coordinates. The Production tab's crop is before troop upkeep (e.g. 2,893/h on the tab vs a 2,177/h balance), so the village you were in takes the top bar's crop balance instead; other villages take the tab's crop and are flagged `cropGross` (a note says so) unless they already have a balance, which is kept. The village you were in always gets the top bar (resources and storage, the freshest values), and the planner switches to it.
