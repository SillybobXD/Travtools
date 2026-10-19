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
    expect(r.stock).toEqual({ res: [5596, 4398, 3637, 2966], warehouse: 21400, granary: 31300, cropBalance: 2177 });
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

  it("handles tabs and other thousands separators", () => {
    const t = parseOverview("Dorf A\t12.345\t1'234\t0\t9\u202f999\t3/5\nDorf B\t1\t2\t3\t4\t0/0\nSumme\t12.346\t1236\t3\t10003\t3/5");
    expect(t.villages).toEqual([{ name: "Dorf A", res: [12345, 1234, 0, 9999] }, { name: "Dorf B", res: [1, 2, 3, 4] }]);
    expect(t.production).toEqual([]);
    expect(t.stock).toBeNull();
    expect(t.activeName).toBeNull();
  });

  it("reads the top bar alone when the table is missing", () => {
    const t = parseOverview([1000, 900, 800, 700, 1200, 1100, -50].map(v => n(String(v))).join("\n"));
    expect(t.stock).toEqual({ res: [900, 800, 700, 1100], warehouse: 1000, granary: 1200, cropBalance: -50 });
    expect(t.villages).toEqual([]);
  });

  it("finds nothing in unrelated text", () => {
    expect(parseOverview("hello\nworld")).toEqual({ stock: null, villages: [], production: [], capacities: [], activeName: null, coords: {} });
  });

  it("falls back to the line before Population when the top bar doesn't match a row", () => {
    const t = parseOverview(SAMPLE.replace(n("5,596"), n("15,596")).replace(n("21,400"), n("80,000")));
    expect(t.activeName).toBe("Northgate");
  });
});

/** The Capacity tab, shaped like a real phone copy, with names changed. */
const CAPACITY = `Privacy settings
${n("762")}
${n("708")}
${n("21,400")}
${n("6,621")}
${n("5,129")}
${n("4,120")}
${n("31,300")}
${n("2,988")}
${n("2,177")}
Info box
\u202d${n("1")}×\u202c
Village overview
Resources
Warehouse
Production
Capacity

Village    Warehouse    Granary
Northgate    ${n("21,400")}    ${n("31,300")}
Eastmoor    ${n("9,600")}    ${n("21,400")}
South Hill    ${n("21,400")}    ${n("21,400")}
Westwood    ${n("5,000")}    ${n("1,700")}
Sum    ${n("57,400")}    ${n("75,800")}

PlayerOne
Northgate
Population: ${n("679")}
Loyalty: \u202d${n("100")}%\u202c

Villages \u202d${n("4")}/${n("4")}\u202c
Northgate
\u202d(${n("12")}|${n("34")})\u202c`;

describe("parseOverview on the Capacity tab", () => {
  const r = parseOverview(CAPACITY);

  it("reads warehouse and granary per village and drops the sum row", () => {
    expect(r.capacities).toEqual([
      { name: "Northgate", warehouse: 21400, granary: 31300 },
      { name: "Eastmoor", warehouse: 9600, granary: 21400 },
      { name: "South Hill", warehouse: 21400, granary: 21400 },
      { name: "Westwood", warehouse: 5000, granary: 1700 },
    ]);
    expect(r.villages).toEqual([]);
  });

  it("still reads the top bar for the village you're in", () => {
    expect(r.stock).toEqual({ res: [6621, 5129, 4120, 2988], warehouse: 21400, granary: 31300, cropBalance: 2177 });
  });

  it("finds the active village by its storage", () => {
    expect(r.activeName).toBe("Northgate");
  });

  it("falls back to the line before Population when two villages have the same storage", () => {
    const t = parseOverview(CAPACITY.replace(`Eastmoor    ${n("9,600")}    ${n("21,400")}`, `Eastmoor    ${n("21,400")}    ${n("31,300")}`));
    expect(t.activeName).toBe("Northgate");
  });

  it("doesn't read capacity rows from the Resources tab", () => {
    expect(parseOverview(SAMPLE).capacities).toEqual([]);
  });
});

/** The Production tab, shaped like a real phone copy (tab-separated, sum row glued to its total), names changed. */
const PRODUCTION = `${n("754")}
${n("374")}
${n("6,300")}
${n("1,162")}
${n("904")}
${n("844")}
${n("3,100")}
${n("145")}
${n("30")}
Switch to avatar for sitting
Info box
\u202d${n("1")}×\u202c
Village overview
Production
  \t
Capacity

Village\t\t\t\t
Northgate\t${n("1,750")}\t${n("2,100")}\t${n("2,589")}\t${n("2,893")}
Eastmoor\t${n("26")}\t${n("39")}\t${n("26")}\t${n("3,472")}
South Hill\t${n("1,750")}\t${n("1,750")}\t${n("1,313")}\t${n("1,583")}
Westwood\t${n("665")}\t${n("490")}\t${n("333")}\t${n("80")}
Sum:${n("20,859")}\t${n("4,191")}\t${n("4,379")}\t${n("4,261")}\t${n("8,028")}

PlayerOne
Westwood
Population: ${n("169")}`;

describe("parseOverview on the Production tab", () => {
  const r = parseOverview(PRODUCTION);

  it("reads production per village and drops the sum row", () => {
    expect(r.production).toEqual([
      { name: "Northgate", perHour: [1750, 2100, 2589, 2893] },
      { name: "Eastmoor", perHour: [26, 39, 26, 3472] },
      { name: "South Hill", perHour: [1750, 1750, 1313, 1583] },
      { name: "Westwood", perHour: [665, 490, 333, 80] },
    ]);
    expect(r.villages).toEqual([]);
    expect(r.capacities).toEqual([]);
  });

  it("reads the top bar with its crop balance", () => {
    expect(r.stock).toEqual({ res: [1162, 904, 844, 145], warehouse: 6300, granary: 3100, cropBalance: 30 });
  });

  it("finds the active village from the line before Population", () => {
    expect(r.activeName).toBe("Westwood");
  });

  it("accepts negative crop production", () => {
    const t = parseOverview(`A\t10\t20\t30\t${n("−120")}\nB\t1\t2\t3\t4\nSum\t11\t22\t33\t-116`);
    expect(t.production).toEqual([{ name: "A", perHour: [10, 20, 30, -120] }, { name: "B", perHour: [1, 2, 3, 4] }]);
  });

  it("doesn't read Resources rows as production", () => {
    expect(parseOverview(SAMPLE).production).toEqual([]);
  });
});
