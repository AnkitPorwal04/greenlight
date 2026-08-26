import { describe, it, expect } from "vitest";
import {
  countsAsOnLeave,
  toCalendarLeaves,
  type CalendarCandidate,
} from "./calendar";

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
});
