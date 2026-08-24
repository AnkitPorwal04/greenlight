import { describe, it, expect } from "vitest";
import {
  parseLeaveDate,
  leaveCoversDay,
  addDaysYmd,
  isValidYmd,
} from "./leave-dates";

describe("parseLeaveDate", () => {
  it("parses DD Mon YYYY into YYYY-MM-DD", () => {
    expect(parseLeaveDate("26 Aug 2026")).toBe("2026-08-26");
  });
  it("parses single-digit day", () => {
    expect(parseLeaveDate("1 Sep 2026")).toBe("2026-09-01");
  });
  it("is case-insensitive and tolerates full month names", () => {
    expect(parseLeaveDate("05 january 2027")).toBe("2027-01-05");
  });
  it("returns null for empty or malformed input", () => {
    expect(parseLeaveDate("")).toBeNull();
    expect(parseLeaveDate("next week")).toBeNull();
    expect(parseLeaveDate("2026-08-26")).toBeNull();
  });
  it("rejects impossible dates", () => {
    expect(parseLeaveDate("31 Feb 2026")).toBeNull();
  });
});

describe("leaveCoversDay", () => {
  const from = "2026-08-24";
  const to = "2026-08-26";
  it("true on the first day", () => {
    expect(leaveCoversDay(from, to, "2026-08-24")).toBe(true);
  });
  it("true in the middle", () => {
    expect(leaveCoversDay(from, to, "2026-08-25")).toBe(true);
  });
  it("true on the last day", () => {
    expect(leaveCoversDay(from, to, "2026-08-26")).toBe(true);
  });
  it("false before and after", () => {
    expect(leaveCoversDay(from, to, "2026-08-23")).toBe(false);
    expect(leaveCoversDay(from, to, "2026-08-27")).toBe(false);
  });
  it("handles a single-day leave", () => {
    expect(leaveCoversDay("2026-08-28", "2026-08-28", "2026-08-28")).toBe(true);
    expect(leaveCoversDay("2026-08-28", "2026-08-28", "2026-08-29")).toBe(false);
  });
  it("tolerates reversed ends", () => {
    expect(leaveCoversDay(to, from, "2026-08-25")).toBe(true);
  });
  it("crosses month and year boundaries", () => {
    expect(leaveCoversDay("2026-12-30", "2027-01-02", "2027-01-01")).toBe(true);
    expect(leaveCoversDay("2026-12-30", "2027-01-02", "2027-01-03")).toBe(false);
  });
});

describe("addDaysYmd", () => {
  it("adds and subtracts across month boundaries", () => {
    expect(addDaysYmd("2026-08-31", 1)).toBe("2026-09-01");
    expect(addDaysYmd("2026-09-01", -1)).toBe("2026-08-31");
    expect(addDaysYmd("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("isValidYmd", () => {
  it("accepts a real date", () => {
    expect(isValidYmd("2026-08-26")).toBe(true);
  });
  it("rejects impossible or malformed dates", () => {
    expect(isValidYmd("2026-02-31")).toBe(false);
    expect(isValidYmd("26/08/2026")).toBe(false);
    expect(isValidYmd("")).toBe(false);
  });
});
