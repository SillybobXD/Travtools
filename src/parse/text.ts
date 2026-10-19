/* Text helpers shared by the parsers of pasted game pages. */

/** Direction marks the game wraps around every number. */
export const BIDI = /[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;
/** A whole number with optional thousands separators (comma, dot, apostrophe, narrow space). */
export const NUM = String.raw`\d{1,3}(?:[.,'\u202f]?\d{3})*`;
/** NUM with an optional minus sign (ASCII or U+2212). */
export const SNUM = `[-−]?${NUM}`;
/** A line that is only a number. */
export const NUM_LINE = new RegExp(`^${SNUM}$`);
/** `(12|34)`, optionally after a name on the same line. */
export const COORD = /^(.*?)\s*\(\s*([-−]?\d+)\s*\|\s*([-−]?\d+)\s*\)$/;

/** Parses a number with separators and an optional minus sign; 0 if there are no digits. */
export const toInt = (s: string) => { const n = parseInt(s.replace(/[^\d]/g, ""), 10) * (/^[-−]/.test(s) ? -1 : 1); return isNaN(n) ? 0 : n; };

export const sum = (r: number[]) => r.reduce((a, b) => a + b, 0);

/** Pasted text as trimmed, non-empty lines, without direction marks and with non-breaking spaces as spaces. */
export const cleanLines = (text: string) =>
  text.replace(BIDI, "").split(/\r?\n/).map(l => l.replace(/\u00a0/g, " ").trim()).filter(Boolean);
