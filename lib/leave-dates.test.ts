import { describe, it, expect } from "vitest";
import {
  parseLeaveDate,
  leaveCoversDay,
  addDaysYmd,
  isValidYmd,
  isPlausibleLeaveDate,
  LEAVE_PLAUSIBLE_MONTHS_BACK,
  LEAVE_PLAUSIBLE_MONTHS_AHEAD,
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

describe("isPlausibleLeaveDate", () => {
  const received = "2026-08-31T09:00:00.000Z";

  it("accepts leave in the same month the mail arrived", () => {
    expect(isPlausibleLeaveDate("2026-08-12", received)).toBe(true);
  });

  it("accepts leave booked well ahead within the year", () => {
    expect(isPlausibleLeaveDate("2027-01-15", received)).toBe(true);
  });

  it("accepts a leave filed a few weeks after it was taken", () => {
    expect(isPlausibleLeaveDate("2026-07-20", received)).toBe(true);
  });

  it("rejects the reported August 2025 hallucination", () => {
    expect(isPlausibleLeaveDate("2025-08-12", received)).toBe(false);
  });

  it("rejects leave booked further ahead than anyone plans", () => {
    expect(isPlausibleLeaveDate("2030-01-01", received)).toBe(false);
  });

  it("holds the backward bound exactly where the constant puts it", () => {
    expect(isPlausibleLeaveDate("2026-05-01", received)).toBe(true);
    expect(isPlausibleLeaveDate("2026-04-30", received)).toBe(false);
  });

  it("holds the forward bound exactly where the constant puts it", () => {
    expect(isPlausibleLeaveDate("2027-08-31", received)).toBe(true);
    expect(isPlausibleLeaveDate("2027-09-01", received)).toBe(false);
  });

  it("keeps the bounds it advertises", () => {
    expect(LEAVE_PLAUSIBLE_MONTHS_BACK).toBe(3);
    expect(LEAVE_PLAUSIBLE_MONTHS_AHEAD).toBe(12);
  });

  it("fails open when the received date is missing or unreadable", () => {
    expect(isPlausibleLeaveDate("2025-08-12", "")).toBe(true);
    expect(isPlausibleLeaveDate("2025-08-12", "not a date")).toBe(true);
    expect(
      isPlausibleLeaveDate("2025-08-12", undefined as unknown as string)
    ).toBe(true);
  });

  it("fails open on a day string it cannot read, leaving validity to isValidYmd", () => {
    expect(isPlausibleLeaveDate("", received)).toBe(true);
    expect(isPlausibleLeaveDate("12/08/2025", received)).toBe(true);
    expect(isPlausibleLeaveDate("whenever", received)).toBe(true);
  });

  it("judges a month-boundary instant by UTC, not by the machine's timezone", () => {
    const boundary = "2026-08-31T23:30:00.000Z";

    expect(isPlausibleLeaveDate("2026-05-15", boundary)).toBe(true);
    expect(isPlausibleLeaveDate("2027-09-15", boundary)).toBe(false);
  });

  it("gives the same verdict whatever timezone the host runs in", () => {
    const boundary = "2026-08-31T23:30:00.000Z";
    const original = process.env.TZ;
    const verdicts: string[] = [];

    for (const zone of ["UTC", "Asia/Calcutta", "America/New_York", "Pacific/Kiritimati"]) {
      process.env.TZ = zone;
      verdicts.push(
        `${isPlausibleLeaveDate("2026-05-15", boundary)}/${isPlausibleLeaveDate("2027-09-15", boundary)}`
      );
    }
    process.env.TZ = original;

    expect(new Set(verdicts).size).toBe(1);
  });
});
