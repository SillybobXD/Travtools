export const fmt = (n: number): string => Math.round(n).toLocaleString("en-US");

/** Parses user input like "1,234" or "1 234"; anything unparseable is 0. */
export const toNum = (v: unknown): number => {
  const n = parseInt(String(v).replace(/[^\d]/g, ""), 10);
  return isNaN(n) ? 0 : n;
};

/** Seconds to "h:mm:ss", with a "Nd " prefix past a day. */
export function fmtTime(s: number): string {
  if (!isFinite(s) || s <= 0) return "0:00:00";
  s = Math.round(s);
  const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
  const hms = `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return d ? `${d}d ${hms}` : hms;
}
