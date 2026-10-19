import { UNITS } from "../data";

/** Speed in fields per hour (1× server) of the slowest unit sent; 0 when nothing is sent. */
export function slowestSpeed(tribe: string, counts: number[]): number {
  const units = UNITS[tribe] ?? [];
  const speeds = counts.flatMap((n, i) => (n > 0 && units[i] ? [units[i].speed] : []));
  return speeds.length ? Math.min(...speeds) : 0;
}

/** One-way travel time in seconds for an army: `distance / (slowest speed * server speed)` hours. 0 if unknown. Tournament square not included. */
export function armyTravelSeconds(tribe: string, counts: number[], distance: number, serverSpeed: number): number {
  const speed = slowestSpeed(tribe, counts);
  return speed > 0 && distance > 0 && serverSpeed > 0 ? (distance / (speed * serverSpeed)) * 3600 : 0;
}
