import { describe, it, expect } from "vitest";
import {
  countsAsOnLeave,
  countsAsSettled,
  isWorkFromHome,
  presentOnDay,
  splitDayLeaves,
  toCalendarLeaves,
  type CalendarCandidate,
  type CalendarLeave,
  type CalendarRosterMember,
  type DayLeaveSections,
  type DayPresence,
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
      leave({ id: "a", employeeCode: "EMP1", status: "approved" }),
      leave({ id: "p", employeeCode: "EMP2", status: "pending" }),
      leave({ id: "h", employeeCode: "EMP3", status: "handled" }),
    ];
    const day = splitDayLeaves(rows, "2026-08-25");
    expect(day.approved.map((l) => l.id)).toEqual(["a", "h"]);
    expect(day.pending.map((l) => l.id)).toEqual(["p"]);
  });

  it("keeps the total equal to both sections combined", () => {
    const rows = [
      leave({ id: "a", employeeCode: "EMP1", status: "approved" }),
      leave({ id: "p", employeeCode: "EMP2", status: "pending" }),
      leave({ id: "h", employeeCode: "EMP3", status: "handled" }),
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
      leave({
        id: "z",
        employeeCode: "EMP1",
        employeeName: "Zoya Khan",
        status: "approved",
      }),
      leave({
        id: "a",
        employeeCode: "EMP2",
        employeeName: "Arjun Rao",
        status: "approved",
      }),
      leave({
        id: "m",
        employeeCode: "EMP3",
        employeeName: "Meera Iyer",
        status: "pending",
      }),
      leave({
        id: "b",
        employeeCode: "EMP4",
        employeeName: "Bhavna Das",
        status: "pending",
      }),
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

describe("one person cannot be on two leaves the same day", () => {
  const casual = leave({
    id: "casual",
    leaveType: "Casual Leave",
    status: "approved",
    fromDate: "01 Sep 2026",
    toDate: "03 Sep 2026",
    fromYmd: "2026-09-01",
    toYmd: "2026-09-03",
    numberOfDays: 3,
    receivedAt: "2026-08-25T09:00:00.000Z",
  });
  const sick = leave({
    id: "sick",
    leaveType: "Sick Leave",
    status: "approved",
    fromDate: "03 Sep 2026",
    toDate: "03 Sep 2026",
    fromYmd: "2026-09-03",
    toYmd: "2026-09-03",
    numberOfDays: 1,
    receivedAt: "2026-09-02T09:00:00.000Z",
  });

  it("shows only the latest leave on the overlapping day", () => {
    const day = splitDayLeaves([casual, sick], "2026-09-03");
    expect(day.approved.map((l) => l.id)).toEqual(["sick"]);
    expect(day.total).toBe(1);
  });

  it("still shows the older leave on the days it does not overlap", () => {
    for (const dayYmd of ["2026-09-01", "2026-09-02"]) {
      const day = splitDayLeaves([casual, sick], dayYmd);
      expect(day.approved.map((l) => l.id)).toEqual(["casual"]);
    }
  });

  it("does not depend on the order the rows arrive in", () => {
    const day = splitDayLeaves([sick, casual], "2026-09-03");
    expect(day.approved.map((l) => l.id)).toEqual(["sick"]);
  });

  it("collapses across the approved and pending split, not inside each", () => {
    const pendingSick = { ...sick, status: "pending" };
    const day = splitDayLeaves([casual, pendingSick], "2026-09-03");

    expect(day.total).toBe(1);
    expect(day.approved).toEqual([]);
    expect(day.pending.map((l) => l.id)).toEqual(["sick"]);
  });

  it("keeps the older approved leave when the newer row is on another day", () => {
    const later = { ...sick, fromYmd: "2026-09-09", toYmd: "2026-09-09" };
    const day = splitDayLeaves([casual, later], "2026-09-03");
    expect(day.approved.map((l) => l.id)).toEqual(["casual"]);
  });

  it("never collapses two different people onto one row", () => {
    const other = { ...sick, id: "other", employeeCode: "EMP2" };
    const day = splitDayLeaves([casual, other], "2026-09-03");
    expect(day.approved.map((l) => l.id).sort()).toEqual(["casual", "other"]);
    expect(day.total).toBe(2);
  });

  it("falls back to the name when the employee code is blank", () => {
    const rows = [
      { ...casual, employeeCode: "  ", employeeName: "Asha Nair" },
      { ...sick, employeeCode: "", employeeName: "asha nair" },
    ];
    expect(splitDayLeaves(rows, "2026-09-03").total).toBe(1);
  });

  it("keeps blank identities apart instead of merging them into one person", () => {
    const rows = [
      { ...casual, employeeCode: "", employeeName: "" },
      { ...sick, employeeCode: "", employeeName: "" },
    ];
    expect(splitDayLeaves(rows, "2026-09-03").total).toBe(2);
  });

  it("treats an unreadable arrival time as the oldest row", () => {
    const unreadable = { ...casual, receivedAt: "who knows" };
    const day = splitDayLeaves([unreadable, sick], "2026-09-03");
    expect(day.approved.map((l) => l.id)).toEqual(["sick"]);
  });

  it("breaks a dead heat on arrival time by the larger id", () => {
    const sameTime = { ...sick, receivedAt: casual.receivedAt };
    const day = splitDayLeaves([casual, sameTime], "2026-09-03");
    expect(day.approved.map((l) => l.id)).toEqual(["sick"]);
  });
});

describe("toCalendarLeaves arrival time", () => {
  it("carries the arrival time through so the day view can pick the latest", () => {
    const [row] = toCalendarLeaves([
      candidate({ receivedAt: "2026-08-20T09:00:00.000Z" }),
    ]);
    expect(row.receivedAt).toBe("2026-08-20T09:00:00.000Z");
  });

  it("leaves the arrival time unset when the row never had one", () => {
    const [row] = toCalendarLeaves([candidate()]);
    expect(row.receivedAt).toBeUndefined();
  });
});

function sections(over: Partial<DayLeaveSections> = {}): DayLeaveSections {
  const approved = over.approved ?? [];
  const pending = over.pending ?? [];
  return {
    approved,
    pending,
    total: over.total ?? approved.length + pending.length,
  };
}

const TEAM: CalendarRosterMember[] = [
  { code: "EMP1", name: "Asha Nair" },
  { code: "EMP2", name: "Biju Thomas" },
  { code: "EMP3", name: "Carol Dsa" },
];

describe("presentOnDay", () => {
  it("lists nobody when the manager has not configured a team", () => {
    const day = sections({ approved: [leave({ employeeCode: "EMP1" })] });
    expect(presentOnDay([], day)).toEqual({
      present: [],
      wfh: [],
      absent: [],
    });
  });

  it("stays empty for a missing roster that arrived over the wire", () => {
    const day = sections({ approved: [leave({ employeeCode: "EMP1" })] });
    const missing = undefined as unknown as CalendarRosterMember[];
    expect(presentOnDay(missing, day)).toEqual({
      present: [],
      wfh: [],
      absent: [],
    });
  });

  it("stays empty when the roster is not an array at all", () => {
    const day = sections({ approved: [leave({ employeeCode: "EMP1" })] });
    const bogus = "EMP1" as unknown as CalendarRosterMember[];
    expect(presentOnDay(bogus, day)).toEqual({
      present: [],
      wfh: [],
      absent: [],
    });
  });

  it("marks everyone present when no one is on leave", () => {
    const day = presentOnDay(TEAM, sections());
    expect(day.present.map((m) => m.code)).toEqual(["EMP1", "EMP2", "EMP3"]);
    expect(day.present.length).toBe(3);
    expect(day.wfh).toEqual([]);
    expect(day.absent).toEqual([]);
  });

  it("drops a member with an approved leave from the present list", () => {
    const day = presentOnDay(
      TEAM,
      sections({ approved: [leave({ employeeCode: "EMP2" })] })
    );
    expect(day.present.map((m) => m.code)).toEqual(["EMP1", "EMP3"]);
    expect(day.present.length).toBe(2);
    expect(day.absent.map((m) => m.code)).toEqual(["EMP2"]);
  });

  it("counts a pending leave as away, not as present", () => {
    const day = presentOnDay(
      TEAM,
      sections({ pending: [leave({ employeeCode: "EMP3" })] })
    );
    expect(day.present.map((m) => m.code)).toEqual(["EMP1", "EMP2"]);
    expect(day.absent.map((m) => m.code)).toEqual(["EMP3"]);
  });

  it("counts approved and pending leave together", () => {
    const day = presentOnDay(
      TEAM,
      sections({
        approved: [leave({ id: "a", employeeCode: "EMP1" })],
        pending: [leave({ id: "b", employeeCode: "EMP2" })],
      })
    );
    expect(day.present.map((m) => m.code)).toEqual(["EMP3"]);
    expect(day.present.length).toBe(1);
    expect(day.absent.map((m) => m.code)).toEqual(["EMP1", "EMP2"]);
  });

  it("empties the present list when the whole team is away", () => {
    const day = presentOnDay(
      TEAM,
      sections({
        approved: [
          leave({ id: "a", employeeCode: "EMP1" }),
          leave({ id: "b", employeeCode: "EMP2" }),
          leave({ id: "c", employeeCode: "EMP3" }),
        ],
      })
    );
    expect(day.present).toEqual([]);
    expect(day.present.length).toBe(0);
    expect(day.absent.length).toBe(3);
  });

  it("matches a lower case leave code against an upper case roster code", () => {
    const day = presentOnDay(
      TEAM,
      sections({ approved: [leave({ employeeCode: "emp2" })] })
    );
    expect(day.present.map((m) => m.code)).toEqual(["EMP1", "EMP3"]);
    expect(day.absent.map((m) => m.code)).toEqual(["EMP2"]);
  });

  it("matches a lower case roster code against an upper case leave code", () => {
    const roster = [{ code: "emp2", name: "Biju Thomas" }];
    const day = presentOnDay(
      roster,
      sections({ approved: [leave({ employeeCode: "EMP2" })] })
    );
    expect(day.present).toEqual([]);
    expect(day.absent.map((m) => m.code)).toEqual(["EMP2"]);
  });

  it("matches across surrounding whitespace on both sides", () => {
    const roster = [{ code: "  emp2 ", name: "Biju Thomas" }];
    const day = presentOnDay(
      roster,
      sections({ approved: [leave({ employeeCode: " EMP2  " })] })
    );
    expect(day.present).toEqual([]);
    expect(day.absent.map((m) => m.code)).toEqual(["EMP2"]);
  });

  it("does not match on display name when the codes differ", () => {
    const day = presentOnDay(
      TEAM,
      sections({
        approved: [leave({ employeeCode: "EMP9", employeeName: "Asha Nair" })],
      })
    );
    expect(day.present.map((m) => m.code)).toEqual(["EMP1", "EMP2", "EMP3"]);
    expect(day.present.length).toBe(3);
    expect(day.wfh).toEqual([]);
    expect(day.absent).toEqual([]);
  });

  it("ignores a leave whose code is not on the roster", () => {
    const day = presentOnDay(
      TEAM,
      sections({
        approved: [
          leave({ id: "in", employeeCode: "EMP1" }),
          leave({ id: "out", employeeCode: "EMP404" }),
        ],
      })
    );
    expect(day.present.length).toBe(2);
    expect(day.absent.map((m) => m.code)).toEqual(["EMP1"]);
    expect(day.present.length + day.wfh.length + day.absent.length).toBe(3);
  });

  it("ignores a leave row that carries no employee code", () => {
    const day = presentOnDay(
      TEAM,
      sections({
        approved: [leave({ employeeCode: "  ", employeeName: "Asha Nair" })],
      })
    );
    expect(day.present.length).toBe(3);
    expect(day.wfh).toEqual([]);
    expect(day.absent).toEqual([]);
  });

  it("sorts the present list by name, not by roster order", () => {
    const roster = [
      { code: "E3", name: "Carol Dsa" },
      { code: "E1", name: "Asha Nair" },
      { code: "E2", name: "Biju Thomas" },
    ];
    const day = presentOnDay(roster, sections());
    expect(day.present.map((m) => m.name)).toEqual([
      "Asha Nair",
      "Biju Thomas",
      "Carol Dsa",
    ]);
  });

  it("counts a duplicated roster code only once", () => {
    const roster = [
      { code: "EMP1", name: "Asha Nair" },
      { code: "emp1", name: "Asha Nair" },
    ];
    const day = presentOnDay(roster, sections());
    expect(day.present.map((m) => m.code)).toEqual(["EMP1"]);
    expect(day.present.length).toBe(1);
    expect(day.absent.length).toBe(0);
  });

  it("keeps the first spelling when a roster code repeats under two names", () => {
    const roster = [
      { code: "EMP1", name: "Asha Nair" },
      { code: "emp1", name: "A. Nair" },
    ];
    const day = presentOnDay(roster, sections());
    expect(day.present).toEqual([{ code: "EMP1", name: "Asha Nair" }]);
    expect(day.present.length).toBe(1);
  });

  it("skips a roster row with a blank code", () => {
    const roster = [
      { code: "", name: "Ghost" },
      { code: "EMP1", name: "Asha Nair" },
    ];
    const day = presentOnDay(roster, sections());
    expect(day.present.map((m) => m.name)).toEqual(["Asha Nair"]);
    expect(day.present.length).toBe(1);
  });

  it("gates on a roster whose every row has a blank code", () => {
    const roster = [{ code: "  ", name: "Ghost" }];
    const day = presentOnDay(
      roster,
      sections({ approved: [leave({ employeeCode: "EMP1" })] })
    );
    expect(day).toEqual({ present: [], wfh: [], absent: [] });
  });

  it("falls back to the code when the roster has no name", () => {
    const roster = [{ code: "EMP7", name: "   " }];
    const day = presentOnDay(roster, sections());
    expect(day.present).toEqual([{ code: "EMP7", name: "EMP7" }]);
  });

  it("normalises the code it reports back to upper case", () => {
    const roster = [{ code: " emp7 ", name: "Dev Rao" }];
    const day = presentOnDay(roster, sections());
    expect(day.present).toEqual([{ code: "EMP7", name: "Dev Rao" }]);
  });

  it("keeps the headcount a partition of the configured team", () => {
    const roster = [
      { code: "EMP1", name: "Asha Nair" },
      { code: "EMP2", name: "Biju Thomas" },
      { code: "EMP3", name: "Carol Dsa" },
      { code: "EMP1", name: "Asha Nair" },
      { code: "", name: "Ghost" },
    ];
    const day = presentOnDay(
      roster,
      sections({
        approved: [leave({ id: "a", employeeCode: "emp2" })],
        pending: [leave({ id: "b", employeeCode: "NOTMINE" })],
      })
    );
    expect(day.present.length + day.wfh.length + day.absent.length).toBe(3);
    expect(day.present.length).toBe(2);
    expect(day.absent.length).toBe(1);
  });

  it("counts one member away once even with two leave rows", () => {
    const day = presentOnDay(
      TEAM,
      sections({
        approved: [leave({ id: "a", employeeCode: "EMP1" })],
        pending: [leave({ id: "b", employeeCode: "EMP1" })],
      })
    );
    expect(day.present.length).toBe(2);
    expect(day.absent.map((m) => m.code)).toEqual(["EMP1"]);
  });

  it("does not mutate the roster it was handed", () => {
    const roster = [
      { code: "E2", name: "Biju Thomas" },
      { code: "E1", name: "Asha Nair" },
    ];
    presentOnDay(roster, sections());
    expect(roster.map((m) => m.code)).toEqual(["E2", "E1"]);
  });

  it("works on the sections splitDayLeaves actually produces", () => {
    const rows = [
      leave({
        id: "a",
        employeeCode: "EMP1",
        status: "approved",
        fromYmd: "2026-09-03",
        toYmd: "2026-09-03",
      }),
      leave({
        id: "b",
        employeeCode: "EMP2",
        status: "pending",
        fromYmd: "2026-09-03",
        toYmd: "2026-09-03",
      }),
    ];
    const day = presentOnDay(TEAM, splitDayLeaves(rows, "2026-09-03"));
    expect(day.present.map((m) => m.code)).toEqual(["EMP3"]);
    expect(day.present.length).toBe(1);
    expect(day.absent.map((m) => m.code)).toEqual(["EMP1", "EMP2"]);
  });

  it("puts a member back on duty on a day their leave does not cover", () => {
    const rows = [
      leave({
        id: "a",
        employeeCode: "EMP1",
        status: "approved",
        fromYmd: "2026-09-03",
        toYmd: "2026-09-03",
      }),
    ];
    const day = presentOnDay(TEAM, splitDayLeaves(rows, "2026-09-04"));
    expect(day.present.map((m) => m.code)).toEqual(["EMP1", "EMP2", "EMP3"]);
    expect(day.wfh.length).toBe(0);
    expect(day.absent.length).toBe(0);
  });
});

describe("isWorkFromHome", () => {
  it("accepts the bare acronym", () => {
    expect(isWorkFromHome("WFH")).toBe(true);
  });

  it("accepts the spelled out phrase in title case", () => {
    expect(isWorkFromHome("Work From Home")).toBe(true);
  });

  it("accepts the phrase with the acronym appended", () => {
    expect(isWorkFromHome("work from home (WFH)")).toBe(true);
  });

  it("ignores case on the acronym", () => {
    expect(isWorkFromHome("wfh")).toBe(true);
    expect(isWorkFromHome("Wfh")).toBe(true);
  });

  it("ignores surrounding whitespace", () => {
    expect(isWorkFromHome("  WFH  ")).toBe(true);
    expect(isWorkFromHome("\tWork From Home\n")).toBe(true);
  });

  it("collapses internal whitespace before matching", () => {
    expect(isWorkFromHome("Work  From   Home")).toBe(true);
    expect(isWorkFromHome("work\tfrom\nhome")).toBe(true);
  });

  it("rejects real leave types", () => {
    expect(isWorkFromHome("Casual Leave")).toBe(false);
    expect(isWorkFromHome("Sick Leave")).toBe(false);
    expect(isWorkFromHome("Earned Leave")).toBe(false);
    expect(isWorkFromHome("Maternity Leave")).toBe(false);
  });

  it("rejects an empty or blank type", () => {
    expect(isWorkFromHome("")).toBe(false);
    expect(isWorkFromHome("   ")).toBe(false);
  });

  it("does not treat the acronym as a substring of another word", () => {
    expect(isWorkFromHome("WFHX")).toBe(false);
    expect(isWorkFromHome("half day wfh request")).toBe(false);
  });

  it("survives a type that never arrived over the wire", () => {
    expect(isWorkFromHome(undefined as unknown as string)).toBe(false);
    expect(isWorkFromHome(null as unknown as string)).toBe(false);
  });
});

describe("presentOnDay work from home bucket", () => {
  it("puts a work from home member in their own bucket, not absent", () => {
    const day = presentOnDay(
      TEAM,
      sections({
        approved: [
          leave({ employeeCode: "EMP2", leaveType: "Work From Home" }),
        ],
      })
    );
    expect(day.present.map((m) => m.code)).toEqual(["EMP1", "EMP3"]);
    expect(day.wfh.map((m) => m.code)).toEqual(["EMP2"]);
    expect(day.absent).toEqual([]);
  });

  it("treats a pending work from home row the same as an approved one", () => {
    const day = presentOnDay(
      TEAM,
      sections({ pending: [leave({ employeeCode: "EMP2", leaveType: "WFH" })] })
    );
    expect(day.wfh.map((m) => m.code)).toEqual(["EMP2"]);
    expect(day.absent).toEqual([]);
  });

  it("keeps work from home out of the present bucket", () => {
    const day = presentOnDay(
      TEAM,
      sections({
        approved: [leave({ employeeCode: "EMP1", leaveType: "WFH" })],
      })
    );
    expect(day.present.map((m) => m.code)).not.toContain("EMP1");
  });

  it("splits three members across all three buckets at once", () => {
    const day = presentOnDay(
      TEAM,
      sections({
        approved: [
          leave({ id: "a", employeeCode: "EMP2", leaveType: "WFH" }),
          leave({ id: "b", employeeCode: "EMP3", leaveType: "Sick Leave" }),
        ],
      })
    );
    expect(day.present.map((m) => m.code)).toEqual(["EMP1"]);
    expect(day.wfh.map((m) => m.code)).toEqual(["EMP2"]);
    expect(day.absent.map((m) => m.code)).toEqual(["EMP3"]);
  });

  it("sorts the work from home list by name, not by roster order", () => {
    const roster = [
      { code: "E3", name: "Carol Dsa" },
      { code: "E1", name: "Asha Nair" },
      { code: "E2", name: "Biju Thomas" },
    ];
    const day = presentOnDay(
      roster,
      sections({
        approved: [
          leave({ id: "a", employeeCode: "E3", leaveType: "WFH" }),
          leave({ id: "b", employeeCode: "E1", leaveType: "WFH" }),
          leave({ id: "c", employeeCode: "E2", leaveType: "WFH" }),
        ],
      })
    );
    expect(day.wfh.map((m) => m.name)).toEqual([
      "Asha Nair",
      "Biju Thomas",
      "Carol Dsa",
    ]);
  });

  it("sorts the absent list by name, not by roster order", () => {
    const roster = [
      { code: "E3", name: "Carol Dsa" },
      { code: "E1", name: "Asha Nair" },
      { code: "E2", name: "Biju Thomas" },
    ];
    const day = presentOnDay(
      roster,
      sections({
        approved: [
          leave({ id: "a", employeeCode: "E3" }),
          leave({ id: "b", employeeCode: "E1" }),
          leave({ id: "c", employeeCode: "E2" }),
        ],
      })
    );
    expect(day.absent.map((m) => m.name)).toEqual([
      "Asha Nair",
      "Biju Thomas",
      "Carol Dsa",
    ]);
  });
});

describe("presentOnDay real leave beats work from home", () => {
  it("marks a member absent when a sick leave sits beside a work from home row", () => {
    const day = presentOnDay(
      TEAM,
      sections({
        approved: [
          leave({ id: "a", employeeCode: "EMP1", leaveType: "Work From Home" }),
          leave({ id: "b", employeeCode: "EMP1", leaveType: "Sick Leave" }),
        ],
      })
    );
    expect(day.absent.map((m) => m.code)).toEqual(["EMP1"]);
    expect(day.wfh).toEqual([]);
    expect(day.present.map((m) => m.code)).toEqual(["EMP2", "EMP3"]);
  });

  it("marks a member absent whichever order the two rows arrive in", () => {
    const day = presentOnDay(
      TEAM,
      sections({
        approved: [
          leave({ id: "a", employeeCode: "EMP1", leaveType: "Sick Leave" }),
          leave({ id: "b", employeeCode: "EMP1", leaveType: "Work From Home" }),
        ],
      })
    );
    expect(day.absent.map((m) => m.code)).toEqual(["EMP1"]);
    expect(day.wfh).toEqual([]);
  });

  it("marks a member absent when the rows straddle approved and pending", () => {
    const day = presentOnDay(
      TEAM,
      sections({
        approved: [
          leave({ id: "a", employeeCode: "EMP1", leaveType: "WFH" }),
        ],
        pending: [
          leave({ id: "b", employeeCode: "EMP1", leaveType: "Casual Leave" }),
        ],
      })
    );
    expect(day.absent.map((m) => m.code)).toEqual(["EMP1"]);
    expect(day.wfh).toEqual([]);
  });

  it("keeps a member on work from home when every row is work from home", () => {
    const day = presentOnDay(
      TEAM,
      sections({
        approved: [
          leave({ id: "a", employeeCode: "EMP1", leaveType: "WFH" }),
          leave({ id: "b", employeeCode: "EMP1", leaveType: "Work From Home" }),
        ],
      })
    );
    expect(day.wfh.map((m) => m.code)).toEqual(["EMP1"]);
    expect(day.absent).toEqual([]);
  });
});

describe("presentOnDay partitions the configured team", () => {
  function uniqueRosterCodes(roster: CalendarRosterMember[]): number {
    const seen = new Set<string>();
    for (const m of roster) {
      const code = typeof m.code === "string" ? m.code.trim().toUpperCase() : "";
      if (code) seen.add(code);
    }
    return seen.size;
  }

  function expectPartition(
    roster: CalendarRosterMember[],
    day: DayLeaveSections
  ): DayPresence {
    const presence = presentOnDay(roster, day);
    expect(
      presence.present.length + presence.wfh.length + presence.absent.length
    ).toBe(uniqueRosterCodes(roster));
    const codes = [
      ...presence.present.map((m) => m.code),
      ...presence.wfh.map((m) => m.code),
      ...presence.absent.map((m) => m.code),
    ];
    expect(new Set(codes).size).toBe(codes.length);
    return presence;
  }

  it("holds when nobody is on leave", () => {
    expectPartition(TEAM, sections());
  });

  it("holds with a mix of all three buckets", () => {
    expectPartition(
      TEAM,
      sections({
        approved: [leave({ id: "a", employeeCode: "EMP1", leaveType: "WFH" })],
        pending: [leave({ id: "b", employeeCode: "EMP2" })],
      })
    );
  });

  it("holds when a duplicated roster code is present", () => {
    const roster = [
      { code: "EMP1", name: "Asha Nair" },
      { code: "emp1", name: "A. Nair" },
      { code: "EMP2", name: "Biju Thomas" },
    ];
    const presence = expectPartition(
      roster,
      sections({ approved: [leave({ employeeCode: "EMP1" })] })
    );
    expect(presence.absent).toEqual([{ code: "EMP1", name: "Asha Nair" }]);
  });

  it("holds when a blank roster code is mixed in", () => {
    const roster = [
      { code: "  ", name: "Ghost" },
      { code: "EMP1", name: "Asha Nair" },
      { code: "EMP2", name: "Biju Thomas" },
    ];
    expectPartition(
      roster,
      sections({
        approved: [leave({ employeeCode: "EMP2", leaveType: "WFH" })],
      })
    );
  });

  it("holds when a leave row belongs to nobody on the roster", () => {
    const presence = expectPartition(
      TEAM,
      sections({
        approved: [
          leave({ id: "a", employeeCode: "NOTMINE" }),
          leave({ id: "b", employeeCode: "STRANGER", leaveType: "WFH" }),
        ],
      })
    );
    expect(presence.present.length).toBe(3);
    expect(presence.wfh).toEqual([]);
    expect(presence.absent).toEqual([]);
  });

  it("holds when the whole team works from home", () => {
    const presence = expectPartition(
      TEAM,
      sections({
        approved: [
          leave({ id: "a", employeeCode: "EMP1", leaveType: "WFH" }),
          leave({ id: "b", employeeCode: "EMP2", leaveType: "WFH" }),
          leave({ id: "c", employeeCode: "EMP3", leaveType: "WFH" }),
        ],
      })
    );
    expect(presence.wfh.length).toBe(3);
  });

  it("holds on an empty roster", () => {
    expectPartition([], sections({ approved: [leave()] }));
  });

  it("never leaks a leave row employee into any bucket", () => {
    const presence = presentOnDay(
      TEAM,
      sections({
        approved: [
          leave({ id: "a", employeeCode: "GHOST1", employeeName: "Ghost One" }),
          leave({ id: "b", employeeCode: "GHOST2", employeeName: "Ghost Two" }),
        ],
      })
    );
    const everyone = [
      ...presence.present,
      ...presence.wfh,
      ...presence.absent,
    ].map((m) => m.code);
    expect(everyone).not.toContain("GHOST1");
    expect(everyone).not.toContain("GHOST2");
    expect(everyone.sort()).toEqual(["EMP1", "EMP2", "EMP3"]);
  });

  it("does not grow a bucket from a directory of strangers", () => {
    const strangers = Array.from({ length: 50 }, (_, i) =>
      leave({ id: `s${i}`, employeeCode: `X${i}`, employeeName: `Stranger ${i}` })
    );
    const presence = presentOnDay(TEAM, sections({ approved: strangers }));
    expect(
      presence.present.length + presence.wfh.length + presence.absent.length
    ).toBe(3);
  });
});
