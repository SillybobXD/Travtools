import { describe, expect, it } from "vitest";
import { parseOverview } from "./overview";

/** Wraps a value in the direction marks the game puts around numbers. */
const n = (v: string) => `\u202d${v}\u202c`;
const frac = (a: string, b: string) => `\u202d${n(a)}/${n(b)}\u202c`;

/** Shaped like a real phone copy of the village overview (Resources tab), with names changed. */
const SAMPLE = `Privacy settings
${n("762")}
${n("708")}
${n("21,400")}
${n("5,596")}
${n("4,398")}
${n("3,637")}
${n("31,300")}
${n("2,966")}
${n("2,177")}
Switch to avatar for sitting
Hero
Local time: 21:29:22 (UTC +01:00)
Alliance banner
Alliance
 
Info box
\u202d${n("1")}×\u202c
Village overview
Overview
Resources
Culture points
Troops

Resources

Warehouse

Production

Capacity

Village                    Merchants
Northgate    ${n("5,591")}    ${n("4,395")}    ${n("3,635")}    ${n("2,966")}    ${frac("13", "19")}
Eastmoor    ${n("3,692")}    ${n("1,208")}    ${n("37")}    ${n("20,670")}    ${frac("7", "7")}
South Hill    ${n("3,136")}    ${n("4,111")}    ${n("3,518")}    ${n("540")}    ${frac("12", "12")}
Westwood    ${n("1,151")}    ${n("1,541")}    ${n("1,475")}    ${n("186")}    ${frac("0", "0")}
Sum    ${n("13,570")}    ${n("11,255")}    ${n("8,665")}    ${n("24,362")}    ${frac("32", "38")}

PlayerOne
Northgate
Population: ${n("678")}
Loyalty: \u202d${n("100")}%\u202c

Villages \u202d${n("4")}/${n("4")}\u202c
Northgate
\u202d(${n("12")}|${n("34")})\u202c
Eastmoor
\u202d(${n("10")}|${n("−33")})\u202c
South Hill (${n("-56")}|${n("78")})
Task overview`;

describe("parseOverview", () => {
  const r = parseOverview(SAMPLE);

  it("reads the top bar, skipping the two leading numbers", () => {
    expect(r.stock).toEqual({ res: [5596, 4398, 3637, 2966], warehouse: 21400, granary: 31300 });
  });

  it("reads every village row, names with spaces included, and drops the sum row", () => {
    expect(r.villages).toEqual([
      { name: "Northgate", res: [5591, 4395, 3635, 2966] },
      { name: "Eastmoor", res: [3692, 1208, 37, 20670] },
      { name: "South Hill", res: [3136, 4111, 3518, 540] },
      { name: "Westwood", res: [1151, 1541, 1475, 186] },
    ]);
  });

  it("reads coordinates from the village list, on their own line or after the name", () => {
    expect(r.coords).toEqual({ Northgate: { x: 12, y: 34 }, Eastmoor: { x: 10, y: -33 }, "South Hill": { x: -56, y: 78 } });
  });

  it("works out which village is active", () => {
    expect(r.activeName).toBe("Northgate");
  });

  it("handles tabs, other separators and a desktop copy without merchants", () => {
    const t = parseOverview("Dorf A\t12.345\t1'234\t0\t9\u202f999\nDorf B\t1\t2\t3\t4\nSumme\t12.346\t1236\t3\t10003");
    expect(t.villages).toEqual([{ name: "Dorf A", res: [12345, 1234, 0, 9999] }, { name: "Dorf B", res: [1, 2, 3, 4] }]);
    expect(t.stock).toBeNull();
    expect(t.activeName).toBeNull();
  });

  it("reads the top bar alone when the table is missing", () => {
    const t = parseOverview([1000, 900, 800, 700, 1200, 1100, -50].map(v => n(String(v))).join("\n"));
    expect(t.stock).toEqual({ res: [900, 800, 700, 1100], warehouse: 1000, granary: 1200 });
    expect(t.villages).toEqual([]);
  });

  it("finds nothing in unrelated text", () => {
    expect(parseOverview("hello\nworld")).toEqual({ stock: null, villages: [], activeName: null, coords: {} });
  });

  it("falls back to the line before Population when the top bar doesn't match a row", () => {
    const t = parseOverview(SAMPLE.replace(n("5,596"), n("15,596")).replace(n("21,400"), n("80,000")));
    expect(t.activeName).toBe("Northgate");
  });
});
