import { describe, it, expect } from "vitest";
import {
  aggregateStats,
  aggregateStatsForTeam,
  buildStatsMonths,
  entriesInMonth,
  statsMonthKey,
  statsMonthLabel,
  statsMonthShortLabel,
  type StatsEntry,
} from "./stats";

function entry(over: Partial<StatsEntry> = {}): StatsEntry {
  return {
    id: "m1",
    employeeName: "Asha Rao",
    employeeCode: "e101",
    leaveType: "Casual Leave",
    numberOfDays: 1,
    fromDate: "",
    toDate: "",
    receivedAt: "2026-08-14T09:00:00.000Z",
    ...over,
  };
}

describe("aggregateStats employee entries", () => {
  it("lists every request for an employee, newest first", () => {
    const stats = aggregateStats([
      entry({ id: "a", receivedAt: "2026-08-02T09:00:00.000Z" }),
      entry({ id: "b", receivedAt: "2026-08-20T09:00:00.000Z" }),
      entry({ id: "c", receivedAt: "2026-08-11T09:00:00.000Z" }),
    ]);

    const person = stats.byEmployee[0];
    expect(person.entries.map((e) => e.receivedAt)).toEqual([
      "2026-08-20T09:00:00.000Z",
      "2026-08-11T09:00:00.000Z",
      "2026-08-02T09:00:00.000Z",
    ]);
    expect(person.entries).toHaveLength(person.requests);
  });

  it("normalises status and leave type on each entry", () => {
    const stats = aggregateStats([
      entry({ id: "a", status: "approved" }),
      entry({ id: "b", status: undefined, leaveType: "  " }),
    ]);

    const person = stats.byEmployee[0];
    expect(person.entries.map((e) => e.status).sort()).toEqual([
      "approved",
      "pending",
    ]);
    expect(person.entries.some((e) => e.leaveType === "Unspecified")).toBe(true);
  });

  it("keeps negative or missing day counts at zero", () => {
    const stats = aggregateStats([entry({ id: "a", numberOfDays: -3 })]);
    expect(stats.byEmployee[0].entries[0].numberOfDays).toBe(0);
  });

  it("splits entries between employees", () => {
    const stats = aggregateStats([
      entry({ id: "a" }),
      entry({ id: "b", employeeCode: "E202", employeeName: "Dev Iyer" }),
    ]);

    expect(stats.byEmployee).toHaveLength(2);
    for (const person of stats.byEmployee) {
      expect(person.entries).toHaveLength(1);
    }
  });
});

describe("withdrawn requests", () => {
  const kept = entry({
    id: "kept",
    numberOfDays: 2,
    status: "approved",
  });
  const pulled = entry({
    id: "pulled",
    leaveType: "Sick Leave",
    numberOfDays: 5,
    receivedAt: "2026-09-03T09:00:00.000Z",
    status: "withdrawn",
  });

  it("stays out of the app-wide totals, chart and type grid", () => {
    const stats = aggregateStats([kept, pulled]);

    expect(stats.outcomes).toEqual({
      applied: 1,
      approved: 1,
      rejected: 0,
      withdrawn: 1,
      handled: 0,
      pending: 0,
    });
    expect(stats.byMonth).toHaveLength(1);
    expect(stats.byMonth[0].total).toBe(1);
    expect(stats.byMonth[0].byType).toEqual({ "Casual Leave": 1 });
    expect(stats.byType).toEqual([
      { type: "Casual Leave", requests: 1, days: 2 },
    ]);
    expect(stats.totalRequests).toBe(2);
  });

  it("never inflates the person it belongs to", () => {
    const person = aggregateStats([kept, pulled]).byEmployee[0];

    expect(person.requests).toBe(1);
    expect(person.days).toBe(2);
    expect(person.byType).toEqual({ "Casual Leave": 1 });
    expect(person.outcomes.withdrawn).toBe(1);
    expect(person.outcomes.approved).toBe(1);
  });

  it("still shows up in that person's own request list", () => {
    const person = aggregateStats([kept, pulled]).byEmployee[0];

    expect(person.entries.map((e) => e.status)).toEqual([
      "withdrawn",
      "approved",
    ]);
    expect(person.entries).toHaveLength(person.requests + 1);
  });

  it("leaves the ranking by days untouched", () => {
    const stats = aggregateStats([
      entry({
        id: "a",
        employeeCode: "E1",
        employeeName: "Asha Rao",
        numberOfDays: 3,
      }),
      entry({
        id: "b",
        employeeCode: "E2",
        employeeName: "Dev Iyer",
        numberOfDays: 2,
      }),
      entry({
        id: "c",
        employeeCode: "E2",
        employeeName: "Dev Iyer",
        numberOfDays: 9,
        status: "withdrawn",
      }),
    ]);

    expect(stats.byEmployee.map((p) => p.code)).toEqual(["E1", "E2"]);
    expect(stats.byEmployee.map((p) => p.days)).toEqual([3, 2]);
  });

  it("counts a person whose only request was withdrawn at zero", () => {
    const stats = aggregateStats([pulled]);

    expect(stats.outcomes.applied).toBe(0);
    expect(stats.outcomes.withdrawn).toBe(1);
    expect(stats.byMonth).toEqual([]);
    expect(stats.byType).toEqual([]);
    expect(stats.byEmployee[0].requests).toBe(0);
    expect(stats.byEmployee[0].days).toBe(0);
    expect(stats.byEmployee[0].entries).toHaveLength(1);
    expect(stats.sinceDate).toBe("2026-09-03T09:00:00.000Z");
  });
});

describe("month bucketing", () => {
  it("buckets by UTC month regardless of the local timezone", () => {
    // 23:30 UTC on the last day of August is already September in any positive
    // offset (e.g. IST). Bucketing must stay in August so it matches the
    // client-side member lookup, which only has the ISO string to work from.
    const stats = aggregateStats([
      entry({ id: "a", receivedAt: "2026-08-31T23:30:00.000Z" }),
    ]);

    expect(stats.byMonth).toHaveLength(1);
    expect(stats.byMonth[0].month).toBe("Aug 2026");
  });
});

describe("statsMonthKey", () => {
  it("buckets an ISO string into its UTC month", () => {
    expect(statsMonthKey("2026-09-15T10:00:00.000Z")).toBe("2026-09");
  });

  it("keeps a late-evening UTC timestamp in the month it belongs to", () => {
    expect(statsMonthKey("2026-08-31T23:30:00.000Z")).toBe("2026-08");
  });

  it("pads single digit months", () => {
    expect(statsMonthKey("2026-01-05T00:00:00.000Z")).toBe("2026-01");
  });

  it("returns no bucket for a missing or unparseable date", () => {
    expect(statsMonthKey("")).toBe("");
    expect(statsMonthKey("not a date")).toBe("");
  });
});

describe("stats month labels", () => {
  it("spells the month out in full for the selected month", () => {
    expect(statsMonthLabel("2026-09")).toBe("September 2026");
    expect(statsMonthLabel("2026-01")).toBe("January 2026");
  });

  it("keeps the short form used by the per-member chips", () => {
    expect(statsMonthShortLabel("2026-09")).toBe("Sept 2026");
    expect(statsMonthShortLabel("2026-08")).toBe("Aug 2026");
  });

  it("hands back an unparseable key untouched instead of showing Invalid Date", () => {
    expect(statsMonthLabel("")).toBe("");
    expect(statsMonthLabel("nonsense")).toBe("nonsense");
    expect(statsMonthLabel("2026-13")).toBe("2026-13");
    expect(statsMonthShortLabel("nonsense")).toBe("nonsense");
  });
});

describe("buildStatsMonths", () => {
  const now = new Date("2026-09-15T10:00:00.000Z");

  it("always offers the current month even with no data at all", () => {
    expect(buildStatsMonths([], now)).toEqual([
      { key: "2026-09", label: "September 2026", count: 0 },
    ]);
  });

  it("still offers the current month when every entry is older", () => {
    const months = buildStatsMonths(
      [entry({ id: "a", receivedAt: "2026-08-04T09:00:00.000Z" })],
      now
    );

    expect(months).toEqual([
      { key: "2026-09", label: "September 2026", count: 0 },
      { key: "2026-08", label: "August 2026", count: 1 },
    ]);
  });

  it("counts every entry in its month, newest month first", () => {
    const months = buildStatsMonths(
      [
        entry({ id: "a", receivedAt: "2026-07-04T09:00:00.000Z" }),
        entry({ id: "b", receivedAt: "2026-09-02T09:00:00.000Z" }),
        entry({ id: "c", receivedAt: "2026-08-11T09:00:00.000Z" }),
        entry({ id: "d", receivedAt: "2026-08-27T09:00:00.000Z" }),
      ],
      now
    );

    expect(months.map((m) => m.key)).toEqual([
      "2026-09",
      "2026-08",
      "2026-07",
    ]);
    expect(months.map((m) => m.count)).toEqual([1, 2, 1]);
  });

  it("orders across a year boundary by date, not by month name", () => {
    const months = buildStatsMonths(
      [
        entry({ id: "a", receivedAt: "2025-12-04T09:00:00.000Z" }),
        entry({ id: "b", receivedAt: "2026-01-04T09:00:00.000Z" }),
      ],
      new Date("2026-01-20T10:00:00.000Z")
    );

    expect(months.map((m) => m.key)).toEqual(["2026-01", "2025-12"]);
    expect(months.map((m) => m.label)).toEqual([
      "January 2026",
      "December 2025",
    ]);
  });

  it("counts a withdrawn request in its month like any other", () => {
    const months = buildStatsMonths(
      [
        entry({ id: "a", receivedAt: "2026-09-02T09:00:00.000Z" }),
        entry({
          id: "b",
          receivedAt: "2026-09-06T09:00:00.000Z",
          status: "withdrawn",
        }),
      ],
      now
    );

    expect(months).toEqual([
      { key: "2026-09", label: "September 2026", count: 2 },
    ]);
  });

  it("never lets an unparseable date fall into the current month", () => {
    const months = buildStatsMonths(
      [
        entry({ id: "bad", receivedAt: "not a date" }),
        entry({ id: "blank", receivedAt: "" }),
      ],
      now
    );

    expect(months).toEqual([
      { key: "2026-09", label: "September 2026", count: 0 },
    ]);
  });

  it("survives an unusable clock without inventing a month", () => {
    const months = buildStatsMonths(
      [entry({ id: "a", receivedAt: "2026-08-04T09:00:00.000Z" })],
      new Date("nope")
    );

    expect(months).toEqual([
      { key: "2026-08", label: "August 2026", count: 1 },
    ]);
  });
});

describe("entriesInMonth", () => {
  const rows = [
    entry({ id: "a", receivedAt: "2026-08-04T09:00:00.000Z" }),
    entry({ id: "b", receivedAt: "2026-09-02T09:00:00.000Z" }),
    entry({ id: "c", receivedAt: "2026-09-28T09:00:00.000Z" }),
    entry({ id: "bad", receivedAt: "not a date" }),
  ];

  it("returns only the entries received in that month", () => {
    expect(entriesInMonth(rows, "2026-09").map((e) => e.id)).toEqual([
      "b",
      "c",
    ]);
    expect(entriesInMonth(rows, "2026-08").map((e) => e.id)).toEqual(["a"]);
  });

  it("returns nothing for a month with no entries", () => {
    expect(entriesInMonth(rows, "2026-07")).toEqual([]);
  });

  it("never returns an entry whose date could not be read", () => {
    for (const key of ["2026-08", "2026-09", ""]) {
      expect(entriesInMonth(rows, key).some((e) => e.id === "bad")).toBe(false);
    }
  });

  it("returns nothing for an empty month key", () => {
    expect(entriesInMonth(rows, "")).toEqual([]);
  });
});

describe("months follow the leave dates, not the mail arrival", () => {
  const acceptedLate = entry({
    id: "late",
    fromDate: "03 Sep 2026",
    toDate: "04 Sep 2026",
    numberOfDays: 2,
    receivedAt: "2026-08-28T09:00:00.000Z",
  });

  it("puts a September leave in September even though the mail arrived in August", () => {
    expect(entriesInMonth([acceptedLate], "2026-09").map((e) => e.id)).toEqual([
      "late",
    ]);
    expect(entriesInMonth([acceptedLate], "2026-08")).toEqual([]);
  });

  it("offers the month tab for the leave dates rather than the arrival month", () => {
    const months = buildStatsMonths(
      [acceptedLate],
      new Date("2026-09-15T10:00:00.000Z")
    );
    expect(months).toEqual([
      { key: "2026-09", label: "September 2026", count: 1 },
    ]);
  });

  it("buckets the monthly chart by the leave dates too", () => {
    const stats = aggregateStats([acceptedLate]);
    expect(stats.byMonth).toHaveLength(1);
    expect(stats.byMonth[0].month).toBe("Sept 2026");
  });
});

describe("a leave crossing a month boundary", () => {
  const crossing = entry({
    id: "cross",
    fromDate: "30 Aug 2026",
    toDate: "02 Sep 2026",
    numberOfDays: 4,
    receivedAt: "2026-08-20T09:00:00.000Z",
  });

  it("gives each month only the days that fall inside it", () => {
    expect(entriesInMonth([crossing], "2026-08")[0].numberOfDays).toBe(2);
    expect(entriesInMonth([crossing], "2026-09")[0].numberOfDays).toBe(2);
  });

  it("splits the days without inventing or losing any", () => {
    const august = entriesInMonth([crossing], "2026-08")[0].numberOfDays;
    const september = entriesInMonth([crossing], "2026-09")[0].numberOfDays;
    expect(august + september).toBe(4);
  });

  it("counts the request in both months it touches", () => {
    const months = buildStatsMonths(
      [crossing],
      new Date("2026-09-15T10:00:00.000Z")
    );
    expect(months.map((m) => [m.key, m.count])).toEqual([
      ["2026-09", 1],
      ["2026-08", 1],
    ]);
  });

  it("charges each month's own total with just its portion", () => {
    const august = aggregateStats(entriesInMonth([crossing], "2026-08"));
    expect(august.byEmployee[0].days).toBe(2);
    expect(august.byType[0].days).toBe(2);
  });
});

describe("half day requests", () => {
  const halfDay = entry({
    id: "half",
    fromDate: "10 Sep 2026",
    toDate: "10 Sep 2026",
    numberOfDays: 0.5,
    receivedAt: "2026-09-09T09:00:00.000Z",
  });

  it("stays half a day instead of being rounded up to a whole one", () => {
    expect(entriesInMonth([halfDay], "2026-09")[0].numberOfDays).toBe(0.5);
    expect(aggregateStats(entriesInMonth([halfDay], "2026-09")).byEmployee[0].days).toBe(0.5);
  });

  it("splits proportionally rather than one day per covered day", () => {
    const twoHalves = entry({
      id: "spread",
      fromDate: "31 Aug 2026",
      toDate: "01 Sep 2026",
      numberOfDays: 1,
      receivedAt: "2026-08-30T09:00:00.000Z",
    });

    expect(entriesInMonth([twoHalves], "2026-08")[0].numberOfDays).toBe(0.5);
    expect(entriesInMonth([twoHalves], "2026-09")[0].numberOfDays).toBe(0.5);
  });
});

describe("entries whose leave dates cannot be read", () => {
  it("falls back to the month the mail arrived in", () => {
    const rows = [
      entry({ id: "junk", fromDate: "next week", toDate: "sometime" }),
      entry({ id: "blank", fromDate: "", toDate: "" }),
    ];

    expect(entriesInMonth(rows, "2026-08").map((e) => e.id)).toEqual([
      "junk",
      "blank",
    ]);
  });

  it("keeps the whole request in that single month", () => {
    const rows = [
      entry({ id: "junk", fromDate: "not a date", toDate: "", numberOfDays: 3 }),
    ];
    expect(entriesInMonth(rows, "2026-08")[0].numberOfDays).toBe(3);
  });

  it("does not vanish when only the end date is unreadable", () => {
    const rows = [
      entry({
        id: "openended",
        fromDate: "05 Sep 2026",
        toDate: "whenever",
        numberOfDays: 1,
        receivedAt: "2026-08-01T09:00:00.000Z",
      }),
    ];
    expect(entriesInMonth(rows, "2026-09").map((e) => e.id)).toEqual([
      "openended",
    ]);
  });

  it("refuses to expand an absurd date range and buckets it by arrival", () => {
    const rows = [
      entry({
        id: "absurd",
        fromDate: "01 Jan 2026",
        toDate: "01 Jan 2030",
        numberOfDays: 2,
        receivedAt: "2026-08-14T09:00:00.000Z",
      }),
    ];

    expect(entriesInMonth(rows, "2026-08").map((e) => e.id)).toEqual([
      "absurd",
    ]);
    expect(entriesInMonth(rows, "2026-08")[0].numberOfDays).toBe(2);
  });
});

describe("a withdrawn leave inside a month", () => {
  const pulled = entry({
    id: "pulled",
    fromDate: "12 Sep 2026",
    toDate: "12 Sep 2026",
    numberOfDays: 1,
    receivedAt: "2026-08-30T09:00:00.000Z",
    status: "withdrawn",
  });

  it("still shows up in the month its leave dates fall in", () => {
    expect(entriesInMonth([pulled], "2026-09").map((e) => e.id)).toEqual([
      "pulled",
    ]);
  });

  it("keeps its outcome tile without adding days", () => {
    const september = aggregateStats(entriesInMonth([pulled], "2026-09"));
    expect(september.outcomes.withdrawn).toBe(1);
    expect(september.outcomes.applied).toBe(0);
    expect(september.byEmployee[0].days).toBe(0);
  });
});

describe("two leaves overlapping one day", () => {
  const casual = entry({
    id: "casual",
    leaveType: "Casual Leave",
    fromDate: "01 Sep 2026",
    toDate: "03 Sep 2026",
    numberOfDays: 3,
    receivedAt: "2026-08-25T09:00:00.000Z",
  });
  const sick = entry({
    id: "sick",
    leaveType: "Sick Leave",
    fromDate: "03 Sep 2026",
    toDate: "03 Sep 2026",
    numberOfDays: 1,
    receivedAt: "2026-09-02T09:00:00.000Z",
  });

  it("gives the overlapping day to the newer request only", () => {
    const september = entriesInMonth([casual, sick], "2026-09");
    const byId = new Map(september.map((e) => [e.id, e.numberOfDays]));

    expect(byId.get("sick")).toBe(1);
    expect(byId.get("casual")).toBe(2);
  });

  it("lets the older request keep the days it still wins", () => {
    const september = aggregateStats(entriesInMonth([casual, sick], "2026-09"));
    expect(september.byEmployee[0].days).toBe(3);
  });

  it("counts both requests in the month even though one lost a day", () => {
    const september = entriesInMonth([casual, sick], "2026-09");
    expect(september.map((e) => e.id).sort()).toEqual(["casual", "sick"]);
  });

  it("does not depend on the order the entries arrive in", () => {
    const september = entriesInMonth([sick, casual], "2026-09");
    const byId = new Map(september.map((e) => [e.id, e.numberOfDays]));
    expect(byId.get("casual")).toBe(2);
    expect(byId.get("sick")).toBe(1);
  });

  it("never lets one person's leave steal another person's day", () => {
    const other = entry({
      ...sick,
      id: "other",
      employeeCode: "E202",
      employeeName: "Dev Iyer",
    });
    const september = entriesInMonth([casual, other], "2026-09");
    const byId = new Map(september.map((e) => [e.id, e.numberOfDays]));

    expect(byId.get("casual")).toBe(3);
    expect(byId.get("other")).toBe(1);
  });

  it("keeps a losing entry in the month so its outcome still shows", () => {
    const wholeSpanBeaten = entry({
      ...sick,
      id: "beaten",
      fromDate: "03 Sep 2026",
      toDate: "03 Sep 2026",
      receivedAt: "2026-08-01T09:00:00.000Z",
      status: "rejected",
    });
    const september = aggregateStats(
      entriesInMonth([wholeSpanBeaten, sick], "2026-09")
    );

    expect(september.outcomes.rejected).toBe(1);
    expect(september.totalRequests).toBe(2);
  });

  it("breaks a dead heat on arrival time by the larger id", () => {
    const sameTime = entry({ ...sick, receivedAt: casual.receivedAt });
    const september = entriesInMonth([casual, sameTime], "2026-09");
    const byId = new Map(september.map((e) => [e.id, e.numberOfDays]));

    expect(byId.get("sick")).toBe(1);
    expect(byId.get("casual")).toBe(2);
  });
});

describe("payload entries", () => {
  it("carries the deduped entry list the payload was built from", () => {
    const stats = aggregateStats([
      entry({ id: "a" }),
      entry({ id: "a" }),
      entry({ id: "b" }),
    ]);

    expect(stats.entries.map((e) => e.id)).toEqual(["a", "b"]);
    expect(stats.entries).toHaveLength(stats.totalRequests);
  });

  it("carries only the manager's team", () => {
    const stats = aggregateStatsForTeam(
      [
        entry({ id: "mine", employeeCode: "GRP1042" }),
        entry({ id: "theirs", employeeCode: "GRP9999" }),
      ],
      ["GRP1042"]
    );

    expect(stats.entries.map((e) => e.id)).toEqual(["mine"]);
  });

  it("re-aggregates a single month back to that month's own totals", () => {
    const stats = aggregateStats([
      entry({ id: "a", receivedAt: "2026-08-04T09:00:00.000Z" }),
      entry({
        id: "b",
        receivedAt: "2026-09-02T09:00:00.000Z",
        numberOfDays: 3,
      }),
      entry({
        id: "c",
        receivedAt: "2026-09-20T09:00:00.000Z",
        employeeCode: "E202",
        employeeName: "Dev Iyer",
        leaveType: "Sick Leave",
        numberOfDays: 2,
      }),
    ]);

    const september = aggregateStats(entriesInMonth(stats.entries, "2026-09"));

    expect(september.totalRequests).toBe(2);
    expect(september.outcomes.applied).toBe(2);
    expect(september.byEmployee).toHaveLength(2);
    expect(september.byType.map((t) => t.type).sort()).toEqual([
      "Casual Leave",
      "Sick Leave",
    ]);
    expect(september.byMonth).toHaveLength(1);
    expect(september.byMonth[0].month).toBe("Sept 2026");
  });
});

describe("aggregateStatsForTeam", () => {
  const mine = entry({
    id: "mine",
    employeeCode: "GRP1042",
    employeeName: "Aarav Sharma",
    leaveType: "Casual Leave",
    numberOfDays: 2,
    receivedAt: "2026-08-10T09:00:00.000Z",
    status: "approved",
  });
  const theirs = entry({
    id: "theirs",
    employeeCode: "GRP9999",
    employeeName: "Someone Else",
    leaveType: "Sick Leave",
    numberOfDays: 5,
    receivedAt: "2026-09-04T09:00:00.000Z",
    status: "rejected",
  });

  it("keeps every part of the payload inside the team", () => {
    const stats = aggregateStatsForTeam([mine, theirs], ["GRP1042"]);

    expect(stats.totalRequests).toBe(1);
    expect(stats.byEmployee.map((p) => p.code)).toEqual(["GRP1042"]);
    expect(stats.byType.map((t) => t.type)).toEqual(["Casual Leave"]);
    expect(stats.byMonth).toHaveLength(1);
    expect(stats.byMonth[0].total).toBe(1);
    expect(stats.byMonth[0].byType).toEqual({ "Casual Leave": 1 });
    expect(stats.outcomes).toEqual({
      applied: 1,
      approved: 1,
      rejected: 0,
      withdrawn: 0,
      handled: 0,
      pending: 0,
    });
    expect(stats.sinceDate).toBe("2026-08-10T09:00:00.000Z");
  });

  it("never counts a non-team person's days in any bucket", () => {
    const stats = aggregateStatsForTeam([mine, theirs], ["GRP1042"]);

    expect(stats.byEmployee[0].days).toBe(2);
    expect(stats.byType[0].days).toBe(2);
    expect(
      stats.byEmployee.some((p) => p.name === "Someone Else")
    ).toBe(false);
  });

  it("shows everyone when no team is configured", () => {
    const stats = aggregateStatsForTeam([mine, theirs], []);

    expect(stats.totalRequests).toBe(2);
    expect(stats.byEmployee).toHaveLength(2);
    expect(stats.outcomes.applied).toBe(2);
  });

  it("matches team codes regardless of case or stray spacing", () => {
    const stats = aggregateStatsForTeam(
      [mine, theirs, entry({ id: "spaced", employeeCode: " grp1042 " })],
      [" grp1042 "]
    );

    expect(stats.totalRequests).toBe(2);
    expect(stats.byEmployee.map((p) => p.code)).toEqual(["GRP1042"]);
  });

  it("treats a blank saved team as no team instead of hiding everyone", () => {
    const stats = aggregateStatsForTeam([mine, theirs], ["", "   "]);

    expect(stats.totalRequests).toBe(2);
  });

  it("drops entries with no employee code once a team is set", () => {
    const stats = aggregateStatsForTeam(
      [mine, entry({ id: "nocode", employeeCode: "" })],
      ["GRP1042"]
    );

    expect(stats.totalRequests).toBe(1);
    expect(stats.byEmployee.map((p) => p.code)).toEqual(["GRP1042"]);
  });
});
