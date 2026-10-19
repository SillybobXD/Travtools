import { describe, expect, it } from "vitest";
import { fmt, fmtTime, toNum, toSignedNum } from "./format";

describe("toNum", () => {
  it("strips separators and junk", () => {
    expect(toNum("1,234")).toBe(1234);
    expect(toNum(" 9 933 ")).toBe(9933);
    expect(toNum(42)).toBe(42);
  });

  it("is 0 for blank or non-numeric input", () => {
    expect(toNum("")).toBe(0);
    expect(toNum("abc")).toBe(0);
    expect(toNum(undefined)).toBe(0);
  });
});

describe("toSignedNum", () => {
  it("keeps the sign", () => {
    expect(toSignedNum("-1,234")).toBe(-1234);
    expect(toSignedNum("−120")).toBe(-120);
    expect(toSignedNum("2,177")).toBe(2177);
    expect(toSignedNum("")).toBe(0);
  });
});

describe("fmt", () => {
  it("rounds and adds thousands separators", () => {
    expect(fmt(25272.4)).toBe("25,272");
  });
});

describe("fmtTime", () => {
  it("formats h:mm:ss", () => {
    expect(fmtTime(720)).toBe("0:12:00");
    expect(fmtTime(3661)).toBe("1:01:01");
  });

  it("adds days past 24 hours", () => {
    expect(fmtTime(90061)).toBe("1d 1:01:01");
  });

  it("shows 0:00:00 for zero, negative or infinite", () => {
    expect(fmtTime(0)).toBe("0:00:00");
    expect(fmtTime(-5)).toBe("0:00:00");
    expect(fmtTime(Infinity)).toBe("0:00:00");
  });
});
