import { describe, it, expect } from "vitest";
import {
  countsAsOnLeave,
  countsAsSettled,
  splitDayLeaves,
  toCalendarLeaves,
  type CalendarCandidate,
  type CalendarLeave,
} from "./calendar";

function leave(over: Partial<CalendarLeave> = {}): CalendarLeave {
  return {
    id: "m1",
    employeeName: "Asha Nair",
    employeeCode: "EMP1",
    leaveType: "Casual Leave",
    status: "pending",
    fromDate: "24 Aug 2026",
    toDate: "26 Aug 2026",
    fromYmd: "2026-08-24",
    toYmd: "2026-08-26",
    numberOfDays: 3,
    ...over,
  };
}

function candidate(over: Partial<CalendarCandidate> = {}): CalendarCandidate {
  return {
    id: "m1",
    employeeName: "Asha Nair",
    employeeCode: "EMP1",
    leaveType: "Casual Leave",
    fromDate: "24 Aug 2026",
    toDate: "26 Aug 2026",
    numberOfDays: 3,
    status: "pending",
    ...over,
  };
}

describe("countsAsOnLeave", () => {
  it("keeps statuses that leave the person away", () => {
    expect(countsAsOnLeave("pending")).toBe(true);
    expect(countsAsOnLeave("approved")).toBe(true);
    expect(countsAsOnLeave("handled")).toBe(true);
  });
  it("drops rejected", () => {
    expect(countsAsOnLeave("rejected")).toBe(false);
  });
  it("drops withdrawn", () => {
    expect(countsAsOnLeave("withdrawn")).toBe(false);
  });
});

describe("toCalendarLeaves", () => {
  it("keeps a pending leave and adds day strings", () => {
    const [leave] = toCalendarLeaves([candidate()]);
    expect(leave.fromYmd).toBe("2026-08-24");
    expect(leave.toYmd).toBe("2026-08-26");
    expect(leave.employeeName).toBe("Asha Nair");
    expect(leave.status).toBe("pending");
  });

  it("excludes a withdrawn request because nobody is on leave", () => {
    const rows = [
      candidate({ id: "keep", status: "approved" }),
      candidate({ id: "gone", status: "withdrawn" }),
    ];
    expect(toCalendarLeaves(rows).map((l) => l.id)).toEqual(["keep"]);
  });

  it("excludes a rejected request", () => {
    const rows = [
      candidate({ id: "keep", status: "handled" }),
      candidate({ id: "gone", status: "rejected" }),
    ];
    expect(toCalendarLeaves(rows).map((l) => l.id)).toEqual(["keep"]);
  });

  it("excludes both rejected and withdrawn together", () => {
    const rows = [
      candidate({ id: "a", status: "rejected" }),
      candidate({ id: "b", status: "withdrawn" }),
    ];
    expect(toCalendarLeaves(rows)).toEqual([]);
  });

  it("falls back to the start day when the end date does not parse", () => {
    const [leave] = toCalendarLeaves([candidate({ toDate: "" })]);
    expect(leave.fromYmd).toBe("2026-08-24");
    expect(leave.toYmd).toBe("2026-08-24");
  });

  it("drops rows whose start date does not parse", () => {
    expect(toCalendarLeaves([candidate({ fromDate: "next week" })])).toEqual([]);
  });

  it("suppresses a leave whose cancellation has been approved", () => {
    const rows = [
      candidate({ id: "leave", status: "approved" }),
      candidate({ id: "cx", kind: "cancellation", status: "approved" }),
    ];
    expect(toCalendarLeaves(rows)).toEqual([]);
  });

  it("keeps the leave while its cancellation is still pending", () => {
    const rows = [
      candidate({ id: "leave", status: "approved" }),
      candidate({ id: "cx", kind: "cancellation", status: "pending" }),
    ];
    expect(toCalendarLeaves(rows).map((l) => l.id)).toEqual(["leave"]);
  });

  it("keeps the leave when its cancellation was rejected", () => {
    const rows = [
      candidate({ id: "leave", status: "approved" }),
      candidate({ id: "cx", kind: "cancellation", status: "rejected" }),
    ];
    expect(toCalendarLeaves(rows).map((l) => l.id)).toEqual(["leave"]);
  });

  it("only suppresses the matching employee's leave, not others on the same dates", () => {
    const rows = [
      candidate({ id: "meera", status: "approved" }),
      candidate({ id: "asha", employeeCode: "EMP2", status: "approved" }),
      candidate({ id: "cx", kind: "cancellation", status: "approved" }),
    ];
    expect(toCalendarLeaves(rows).map((l) => l.id)).toEqual(["asha"]);
  });

  it("shows work from home re-applied for the same span after the cancellation", () => {
    const rows = [
      candidate({
        id: "original",
        status: "approved",
        receivedAt: "2026-08-10T09:00:00.000Z",
      }),
      candidate({
        id: "cx",
        kind: "cancellation",
        status: "approved",
        receivedAt: "2026-08-12T09:00:00.000Z",
      }),
      candidate({
        id: "wfh",
        leaveType: "Work From Home",
        status: "approved",
        receivedAt: "2026-08-13T09:00:00.000Z",
      }),
    ];
    expect(toCalendarLeaves(rows).map((l) => l.id)).toEqual(["wfh"]);
  });

  it("still hides a leave applied before the cancellation that cancels it", () => {
    const rows = [
      candidate({
        id: "original",
        status: "approved",
        receivedAt: "2026-08-10T09:00:00.000Z",
      }),
      candidate({
        id: "cx",
        kind: "cancellation",
        status: "approved",
        receivedAt: "2026-08-12T09:00:00.000Z",
      }),
    ];
    expect(toCalendarLeaves(rows)).toEqual([]);
  });

  it("hides a re-application whose arrival time is unreadable", () => {
    const rows = [
      candidate({
        id: "cx",
        kind: "cancellation",
        status: "approved",
        receivedAt: "2026-08-12T09:00:00.000Z",
      }),
      candidate({ id: "wfh", status: "approved", receivedAt: "who knows" }),
    ];
    expect(toCalendarLeaves(rows)).toEqual([]);
  });
});

describe("countsAsSettled", () => {
  it("treats approved and handled as settled", () => {
    expect(countsAsSettled("approved")).toBe(true);
    expect(countsAsSettled("handled")).toBe(true);
  });
  it("leaves pending unsettled", () => {
    expect(countsAsSettled("pending")).toBe(false);
  });
});

describe("splitDayLeaves", () => {
  it("splits the day into approved and pending", () => {
    const rows = [
      leave({ id: "a", status: "approved" }),
      leave({ id: "p", status: "pending" }),
      leave({ id: "h", status: "handled" }),
    ];
    const day = splitDayLeaves(rows, "2026-08-25");
    expect(day.approved.map((l) => l.id)).toEqual(["a", "h"]);
    expect(day.pending.map((l) => l.id)).toEqual(["p"]);
  });

  it("keeps the total equal to both sections combined", () => {
    const rows = [
      leave({ id: "a", status: "approved" }),
      leave({ id: "p", status: "pending" }),
      leave({ id: "h", status: "handled" }),
    ];
    const day = splitDayLeaves(rows, "2026-08-25");
    expect(day.total).toBe(3);
    expect(day.total).toBe(day.approved.length + day.pending.length);
  });

  it("only keeps leaves covering the chosen day", () => {
    const rows = [
      leave({ id: "in", status: "approved" }),
      leave({
        id: "out",
        status: "approved",
        fromYmd: "2026-09-01",
        toYmd: "2026-09-02",
      }),
    ];
    const day = splitDayLeaves(rows, "2026-08-24");
    expect(day.approved.map((l) => l.id)).toEqual(["in"]);
    expect(day.total).toBe(1);
  });

  it("includes the inclusive first and last day of a span", () => {
    const rows = [leave({ id: "a", status: "approved" })];
    expect(splitDayLeaves(rows, "2026-08-24").total).toBe(1);
    expect(splitDayLeaves(rows, "2026-08-26").total).toBe(1);
    expect(splitDayLeaves(rows, "2026-08-27").total).toBe(0);
  });

  it("sorts each section by employee name", () => {
    const rows = [
      leave({ id: "z", employeeName: "Zoya Khan", status: "approved" }),
      leave({ id: "a", employeeName: "Arjun Rao", status: "approved" }),
      leave({ id: "m", employeeName: "Meera Iyer", status: "pending" }),
      leave({ id: "b", employeeName: "Bhavna Das", status: "pending" }),
    ];
    const day = splitDayLeaves(rows, "2026-08-25");
    expect(day.approved.map((l) => l.employeeName)).toEqual([
      "Arjun Rao",
      "Zoya Khan",
    ]);
    expect(day.pending.map((l) => l.employeeName)).toEqual([
      "Bhavna Das",
      "Meera Iyer",
    ]);
  });

  it("returns empty sections for a quiet day", () => {
    const day = splitDayLeaves([leave({ status: "approved" })], "2026-01-01");
    expect(day.approved).toEqual([]);
    expect(day.pending).toEqual([]);
    expect(day.total).toBe(0);
  });
});
