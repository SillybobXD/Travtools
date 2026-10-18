# Travian Village Planner

Static web tool for Travian Legends players. It plans building upgrades and troop training, computes NPC merchant redistribution, and works out what to send from another village.

## Current state
- Single file: `index.html` (HTML + CSS + vanilla JS, no build step).
- Data lives in JS constants at the top of the script: `UNITS`, `BUILDINGS`, `MERCH`.
- State persists in `localStorage` under key `village-planner`.

## Formulas in use
- Building level cost: `round5(base * k^(level-1))` per resource. `k` is 1.67 for resource fields, 1.80 for factory buildings, and about 1.28 for most others.
- Training time per unit: `base * 0.9^(buildingLevel-1) / serverSpeed * (1 - bonus%)`.
- Max troops: `floor((totalResources - buildingCost) / unitCostSum)`, also limited by warehouse/granary capacity per resource.
- NPC leftover goes to the preferred resource first, then crop, wood, clay, iron, within capacity.
- Merchant travel time: `distance / (merchantSpeed * serverSpeed)`.

## Known gaps / unverified data
- Spartan unit costs are unverified; Spartan base training times are blank (0).
- Other tribes' base training times are from memory; verify against the game.
- Building construction time is not implemented (formula depends on main building level and per-building constants).
- Rounding behaviour of building costs at high levels has not been checked against the game.

## Conventions
- Keep it dependency-free unless a feature clearly needs a framework.
- Supports light and dark mode via CSS variables on `:root`.
- Mobile-first: the main user plays on a phone.
