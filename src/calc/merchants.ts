/** Merchants needed to carry `amount`; 0 if capacity is unknown. */
export function merchantsNeeded(amount: number, capacity: number): number {
  return capacity > 0 ? Math.ceil(amount / capacity) : 0;
}

/** One-way travel time in seconds: distance / (merchantSpeed * serverSpeed) hours. 0 if unknown. */
export function travelSeconds(distance: number, merchantSpeed: number, serverSpeed: number): number {
  return merchantSpeed > 0 && distance > 0 ? distance / (merchantSpeed * serverSpeed) * 3600 : 0;
}

/** Travian Legends maps are 401 × 401 fields (-200..200) and wrap around at the edges. */
export const MAP_SIZE = 401;

/** Distance in fields between two map coordinates, taking the shorter way around the edges. */
export function mapDistance(a: { x: number; y: number }, b: { x: number; y: number }, size = MAP_SIZE): number {
  const wrap = (d: number) => { d = Math.abs(d) % size; return Math.min(d, size - d); };
  return Math.hypot(wrap(a.x - b.x), wrap(a.y - b.y));
}
