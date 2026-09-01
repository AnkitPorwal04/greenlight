import { describe, it, expect } from "vitest";
import {
  buildHistoryMonths,
  decidedInMonth,
  gmailAfterDate,
  historyMonthCount,
  monthStart,
  monthTotals,
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

  it("seeds empty months with an empty pending list", () => {
    const months = buildHistoryMonths([], NOW);

    expect(months.map((m) => m.pending)).toEqual([[], []]);
    expect(months.map((m) => m.requests)).toEqual([[], []]);
  });

  it("splits pending out of the decided list for the same month", () => {
    const months = buildHistoryMonths(
      [
        request({ id: "done", receivedAt: new Date(2026, 7, 2, 9).toISOString() }),
        request({
          id: "rh",
          status: "pending",
          receivedAt: new Date(2026, 7, 5, 9).toISOString(),
        }),
      ],
      NOW
    );

    expect(months[0].requests.map((r) => r.id)).toEqual(["done"]);
    expect(months[0].pending.map((r) => r.id)).toEqual(["rh"]);
  });

  it("counts pending and decided together so the month tab stays clickable", () => {
    const months = buildHistoryMonths(
      [
        request({ id: "done", receivedAt: new Date(2026, 7, 2, 9).toISOString() }),
        request({
          id: "rh",
          status: "pending",
          receivedAt: new Date(2026, 7, 5, 9).toISOString(),
        }),
      ],
      NOW
    );

    expect(months[0].count).toBe(2);
  });

  it("gives a pending-only month a non-zero count", () => {
    const months = buildHistoryMonths(
      [
        request({
          id: "rh",
          status: "pending",
          receivedAt: new Date(2026, 7, 5, 9).toISOString(),
        }),
      ],
      NOW
    );

    expect(months[0].count).toBe(1);
    expect(months[0].requests).toEqual([]);
    expect(months[0].pending.map((r) => r.id)).toEqual(["rh"]);
  });

  it("orders each list newest first independently", () => {
    const months = buildHistoryMonths(
      [
        request({ id: "d1", receivedAt: new Date(2026, 7, 3, 9).toISOString() }),
        request({
          id: "p1",
          status: "pending",
          receivedAt: new Date(2026, 7, 4, 9).toISOString(),
        }),
        request({ id: "d2", receivedAt: new Date(2026, 7, 15, 9).toISOString() }),
        request({
          id: "p2",
          status: "pending",
          receivedAt: new Date(2026, 7, 16, 9).toISOString(),
        }),
      ],
      NOW
    );

    expect(months[0].requests.map((r) => r.id)).toEqual(["d2", "d1"]);
    expect(months[0].pending.map((r) => r.id)).toEqual(["p2", "p1"]);
  });

  it("skips a pending request with an unusable date", () => {
    const months = buildHistoryMonths(
      [request({ id: "bad", status: "pending", receivedAt: "not-a-date" })],
      NOW
    );

    expect(months.every((m) => m.count === 0)).toBe(true);
    expect(months.every((m) => m.pending.length === 0)).toBe(true);
  });

  it("buckets pending into an older month tab of its own", () => {
    const months = buildHistoryMonths(
      [
        request({
          id: "old",
          status: "pending",
          receivedAt: new Date(2025, 11, 4, 9).toISOString(),
        }),
      ],
      NOW
    );

    expect(months.map((m) => m.key)).toEqual(["2026-08", "2026-07", "2025-12"]);
    expect(months[2].pending.map((r) => r.id)).toEqual(["old"]);
    expect(months[2].requests).toEqual([]);
  });

  it("never leaks a pending request into requests, which feeds the tiles", () => {
    const months = buildHistoryMonths(
      [
        request({ id: "a", receivedAt: new Date(2026, 7, 2, 9).toISOString() }),
        request({
          id: "p",
          status: "pending",
          receivedAt: new Date(2026, 7, 6, 9).toISOString(),
        }),
        request({
          id: "w",
          status: "withdrawn",
          receivedAt: new Date(2026, 6, 9, 9).toISOString(),
        }),
        request({
          id: "p2",
          status: "pending",
          receivedAt: new Date(2026, 6, 11, 9).toISOString(),
        }),
      ],
      NOW
    );

    for (const month of months) {
      expect(month.requests.some((r) => r.status === "pending")).toBe(false);
      expect(month.pending.every((r) => r.status === "pending")).toBe(true);
    }
  });

  it("leaves the decided totals identical whether or not pending is passed in", () => {
    const decided = [
      request({ id: "a", receivedAt: new Date(2026, 7, 2, 9).toISOString() }),
      request({
        id: "b",
        status: "rejected",
        receivedAt: new Date(2026, 7, 17, 9).toISOString(),
      }),
    ];
    const pendingRows = [
      request({
        id: "p",
        status: "pending",
        receivedAt: new Date(2026, 7, 18, 9).toISOString(),
      }),
    ];

    const withoutPending = buildHistoryMonths(decided, NOW);
    const withPending = buildHistoryMonths([...decided, ...pendingRows], NOW);

    expect(withPending[0].requests.map((r) => r.id)).toEqual(
      withoutPending[0].requests.map((r) => r.id)
    );
    expect(monthTotals(withPending[0].requests)).toEqual(
      monthTotals(withoutPending[0].requests)
    );
  });
});

describe("decidedInMonth", () => {
  const key = "2026-08";

  it("keeps only actioned requests received in that month", () => {
    const kept = decidedInMonth(
      [
        request({ id: "a", receivedAt: new Date(2026, 7, 1, 9).toISOString() }),
        request({
          id: "july",
          receivedAt: new Date(2026, 6, 31, 23).toISOString(),
        }),
        request({
          id: "sept",
          receivedAt: new Date(2026, 8, 1, 0).toISOString(),
        }),
      ],
      key
    );

    expect(kept.map((r) => r.id)).toEqual(["a"]);
  });

  it("treats a withdrawn request as decided", () => {
    const kept = decidedInMonth(
      [
        request({
          id: "pulled",
          status: "withdrawn",
          receivedAt: new Date(2026, 7, 6, 9).toISOString(),
        }),
      ],
      key
    );

    expect(kept.map((r) => r.id)).toEqual(["pulled"]);
  });

  it("drops pending requests and unusable dates", () => {
    const kept = decidedInMonth(
      [
        request({
          id: "pending",
          status: "pending",
          receivedAt: new Date(2026, 7, 4, 9).toISOString(),
        }),
        request({ id: "bad", receivedAt: "not-a-date" }),
      ],
      key
    );

    expect(kept).toEqual([]);
  });

  it("matches the month bucket the history tabs build", () => {
    const requests = [
      request({ id: "a", receivedAt: new Date(2026, 7, 2, 9).toISOString() }),
      request({
        id: "b",
        status: "rejected",
        receivedAt: new Date(2026, 7, 17, 9).toISOString(),
      }),
      request({ id: "c", receivedAt: new Date(2026, 6, 9, 9).toISOString() }),
    ];
    const months = buildHistoryMonths(
      requests.filter((r) => r.status !== "pending"),
      NOW
    );

    expect(monthTotals(decidedInMonth(requests, key))).toEqual(
      monthTotals(months[0].requests)
    );
  });
});

describe("monthTotals", () => {
  it("counts each outcome and totals only actioned requests", () => {
    const totals = monthTotals([
      request({ id: "a", status: "approved" }),
      request({ id: "b", status: "approved" }),
      request({ id: "c", status: "rejected" }),
      request({ id: "d", status: "handled" }),
      request({ id: "e", status: "pending" }),
    ]);

    expect(totals).toEqual({
      total: 4,
      approved: 2,
      rejected: 1,
      withdrawn: 0,
      handled: 1,
    });
  });

  it("keeps withdrawn out of the three decision counts", () => {
    const totals = monthTotals([
      request({ id: "a", status: "approved" }),
      request({ id: "w", status: "withdrawn" }),
      request({ id: "x", status: "withdrawn" }),
    ]);

    expect(totals.approved).toBe(1);
    expect(totals.rejected).toBe(0);
    expect(totals.handled).toBe(0);
    expect(totals.withdrawn).toBe(2);
    expect(totals.total).toBe(3);
  });

  it("returns zeroes for an empty month", () => {
    expect(monthTotals([])).toEqual({
      total: 0,
      approved: 0,
      rejected: 0,
      withdrawn: 0,
      handled: 0,
    });
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
