import type { Building, Celebration, Merchant, Unit } from "../types";
import unitsJson from "./units.json";
import buildingsJson from "./buildings.json";
import merchantsJson from "./merchants.json";
import celebrationsJson from "./celebrations.json";

/* JSON shapes are checked in data.test.ts. */
/** Units per tribe. Order matters: saved state stores the unit index. */
export const UNITS = unitsJson as unknown as Record<string, Unit[]>;
/** Order matters: saved building rows store the building index. */
export const BUILDINGS = buildingsJson as unknown as Building[];
export const MERCH = merchantsJson as Record<string, Merchant>;
/** Small, then great. Order matters: saved state stores counts by index. */
export const CELEBRATIONS = celebrationsJson as unknown as Celebration[];
