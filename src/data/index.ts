import type { Animal, Building, Celebration, CultureData, Merchant, Unit, Wall } from "../types";
import unitsJson from "./units.json";
import buildingsJson from "./buildings.json";
import merchantsJson from "./merchants.json";
import celebrationsJson from "./celebrations.json";
import capacityJson from "./capacity.json";
import wallsJson from "./walls.json";
import natureJson from "./nature.json";
import cultureJson from "./culture.json";

/* JSON shapes are checked in data.test.ts. */
/** Units per tribe. Order matters: saved state stores the unit index. */
export const UNITS = unitsJson as unknown as Record<string, Unit[]>;
/** Order matters: saved building rows store the building index. */
export const BUILDINGS = buildingsJson as unknown as Building[];
export const MERCH = merchantsJson as Record<string, Merchant>;
/** Small, then great. Order matters: saved state stores counts by index. */
/** Warehouse or granary capacity by level; index 0 is a village without one. */
export const CAPACITY: number[] = capacityJson;
export const CELEBRATIONS = celebrationsJson as unknown as Celebration[];
/** Wall per tribe, by the village owner's tribe. */
export const WALLS = wallsJson as Record<string, Wall>;
/** Nature's animals in the game's order (Rat … Elephant). Not a tribe: never add them to UNITS. */
export const NATURE: Animal[] = natureJson;
/** The `tribe` key armies of animals use in combat and parsed reports. */
export const NATURE_TRIBE = "Nature";
/** Helmets, daily quest and celebration culture points. */
export const CULTURE = cultureJson as CultureData;
