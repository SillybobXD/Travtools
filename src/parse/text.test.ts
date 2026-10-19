import { describe, expect, it } from "vitest";
import { cleanLines, COORD, NUM_LINE, toInt } from "./text";

describe("text helpers", () => {
  it("cleanLines drops direction marks, non-breaking spaces and empty lines", () => {
    expect(cleanLines("‭‭4,000‬‬\r\n\n  a b  \n")).toEqual(["4,000", "a b"]);
  });

  it("toInt reads separators and both minus signs", () => {
    expect([toInt("1,828,500"), toInt("−100"), toInt("-2.177"), toInt("x")]).toEqual([1828500, -100, -2177, 0]);
  });

  it("NUM_LINE and COORD", () => {
    expect([NUM_LINE.test("320,026"), NUM_LINE.test("−40"), NUM_LINE.test("40 x")]).toEqual([true, true, false]);
    expect(COORD.exec("Village (−12|98)")?.slice(1)).toEqual(["Village", "−12", "98"]);
  });
});
