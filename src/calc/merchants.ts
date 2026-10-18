/** Merchants needed to carry `amount`; 0 if capacity is unknown. */
export function merchantsNeeded(amount: number, capacity: number): number {
  return capacity > 0 ? Math.ceil(amount / capacity) : 0;
}

/** One-way travel time in seconds: distance / (merchantSpeed * serverSpeed) hours. 0 if unknown. */
export function travelSeconds(distance: number, merchantSpeed: number, serverSpeed: number): number {
  return merchantSpeed > 0 && distance > 0 ? distance / (merchantSpeed * serverSpeed) * 3600 : 0;
}
