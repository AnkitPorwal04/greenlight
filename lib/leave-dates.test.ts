import { describe, it, expect } from "vitest";
import {
  parseLeaveDate,
  leaveCoversDay,
  toDayInput,
  fromDayInput,
} from "./leave-dates";

const ms = (y: number, m: number, d: number) => new Date(y, m - 1, d).getTime();

describe("parseLeaveDate", () => {
  it("parses DD Mon YYYY", () => {
    expect(parseLeaveDate("26 Aug 2026")).toBe(ms(2026, 8, 26));
  });
  it("parses single-digit day", () => {
    expect(parseLeaveDate("1 Sep 2026")).toBe(ms(2026, 9, 1));
  });
  it("is case-insensitive and tolerates full month names", () => {
    expect(parseLeaveDate("05 january 2027")).toBe(ms(2027, 1, 5));
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
  const from = ms(2026, 8, 24);
  const to = ms(2026, 8, 26);
  it("true on the first day", () => {
    expect(leaveCoversDay(from, to, ms(2026, 8, 24))).toBe(true);
  });
  it("true in the middle", () => {
    expect(leaveCoversDay(from, to, ms(2026, 8, 25))).toBe(true);
  });
  it("true on the last day", () => {
    expect(leaveCoversDay(from, to, ms(2026, 8, 26))).toBe(true);
  });
  it("false before and after", () => {
    expect(leaveCoversDay(from, to, ms(2026, 8, 23))).toBe(false);
    expect(leaveCoversDay(from, to, ms(2026, 8, 27))).toBe(false);
  });
  it("handles a single-day leave", () => {
    const d = ms(2026, 8, 28);
    expect(leaveCoversDay(d, d, ms(2026, 8, 28))).toBe(true);
    expect(leaveCoversDay(d, d, ms(2026, 8, 29))).toBe(false);
  });
  it("compares at day granularity, ignoring time of day", () => {
    const day = ms(2026, 8, 25) + 15 * 3600_000;
    expect(leaveCoversDay(from, to, day)).toBe(true);
  });
});

describe("toDayInput / fromDayInput", () => {
  it("round-trips a date", () => {
    const t = ms(2026, 8, 26);
    expect(toDayInput(t)).toBe("2026-08-26");
    expect(fromDayInput("2026-08-26")).toBe(t);
  });
  it("returns null for a bad input", () => {
    expect(fromDayInput("26/08/2026")).toBeNull();
  });
});
