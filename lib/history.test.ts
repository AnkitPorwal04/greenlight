import { describe, it, expect } from "vitest";
import {
  buildHistoryMonths,
  gmailAfterDate,
  historyMonthCount,
  monthStart,
} from "./history";
import type { LeaveRequest } from "./types";

function request(over: Partial<LeaveRequest> = {}): LeaveRequest {
  return {
    id: "m1",
    threadId: "t1",
    employeeName: "Asha Rao",
    employeeCode: "E101",
    employeeEmail: "asha.rao@example.com",
    leaveType: "Casual Leave",
    fromDate: "14 Aug 2026",
    toDate: "14 Aug 2026",
    numberOfDays: 1,
    reason: "Personal",
    leaveBalance: "6",
    fromSession: "Session 1",
    toSession: "Session 2",
    receivedAt: "2026-08-14T09:00:00.000Z",
    ccRecipients: [],
    emailVerified: true,
    bodyText: "",
    status: "approved",
    ...over,
  };
}

const NOW = new Date(2026, 7, 18);

describe("buildHistoryMonths", () => {
  it("always offers the current and previous month, current one first", () => {
    const months = buildHistoryMonths([], NOW);

    expect(months.map((m) => m.key)).toEqual(["2026-08", "2026-07"]);
    expect(months.map((m) => m.label)).toEqual(["August", "July"]);
    expect(months.map((m) => m.count)).toEqual([0, 0]);
  });

  it("groups requests into their month, newest first", () => {
    const months = buildHistoryMonths(
      [
        request({ id: "a", receivedAt: new Date(2026, 7, 2, 9).toISOString() }),
        request({ id: "b", receivedAt: new Date(2026, 7, 17, 9).toISOString() }),
        request({ id: "c", receivedAt: new Date(2026, 6, 9, 9).toISOString() }),
      ],
      NOW
    );

    expect(months[0].requests.map((r) => r.id)).toEqual(["b", "a"]);
    expect(months[0].count).toBe(2);
    expect(months[1].requests.map((r) => r.id)).toEqual(["c"]);
  });

  it("adds a tab for older months present in the data", () => {
    const months = buildHistoryMonths(
      [request({ id: "old", receivedAt: new Date(2025, 11, 4, 9).toISOString() })],
      NOW
    );

    expect(months.map((m) => m.key)).toEqual(["2026-08", "2026-07", "2025-12"]);
    expect(months[2].label).toBe("December 2025");
  });

  it("skips requests with an unusable date", () => {
    const months = buildHistoryMonths(
      [request({ id: "bad", receivedAt: "not-a-date" })],
      NOW
    );

    expect(months.every((m) => m.count === 0)).toBe(true);
  });
});

describe("history fetch window", () => {
  it("starts at the first day of the previous month", () => {
    expect(gmailAfterDate(monthStart(NOW, 1))).toBe("2026/07/01");
  });

  it("crosses the year boundary", () => {
    expect(gmailAfterDate(monthStart(new Date(2026, 0, 9), 1))).toBe(
      "2025/12/01"
    );
  });

  it("clamps the requested month count", () => {
    expect(historyMonthCount(null)).toBe(2);
    expect(historyMonthCount("abc")).toBe(2);
    expect(historyMonthCount("0")).toBe(1);
    expect(historyMonthCount("6")).toBe(6);
    expect(historyMonthCount("99")).toBe(12);
  });
});
