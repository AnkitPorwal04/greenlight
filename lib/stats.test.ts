import { describe, it, expect } from "vitest";
import {
  aggregateStats,
  aggregateStatsForTeam,
  buildStatsMonths,
  chartTicks,
  dailyLeaveCounts,
  narrowDayLabels,
  entriesInMonth,
  fillTeamRoster,
  statsMonthKey,
  statsMonthLabel,
  statsMonthShortLabel,
  teamRoster,
  topDaysByType,
  type StatsEntry,
} from "./stats";

function sumOf(bucket: Record<string, number>): number {
  return Object.values(bucket).reduce((total, value) => total + value, 0);
}

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

describe("a person's days per leave type", () => {
  it("counts days, not requests, so it agrees with the row's day total", () => {
    const person = aggregateStats([
      entry({ id: "a", leaveType: "Casual Leave", numberOfDays: 2 }),
      entry({ id: "b", leaveType: "Casual Leave", numberOfDays: 1 }),
      entry({ id: "c", leaveType: "Restricted Holiday", numberOfDays: 1 }),
    ]).byEmployee[0];

    expect(person.daysByType).toEqual({
      "Casual Leave": 3,
      "Restricted Holiday": 1,
    });
    expect(person.requests).toBe(3);
    expect(person.days).toBe(4);
    expect(sumOf(person.daysByType)).toBe(person.days);
  });

  it("always adds up to the person's day total", () => {
    const person = aggregateStats([
      entry({ id: "a", leaveType: "Casual Leave", numberOfDays: 2 }),
      entry({ id: "b", leaveType: "Sick Leave", numberOfDays: 0.5 }),
      entry({ id: "c", leaveType: "Earned Leave", numberOfDays: 3.5 }),
      entry({ id: "d", leaveType: "Casual Leave", numberOfDays: -2 }),
      entry({ id: "e", leaveType: "  ", numberOfDays: 1 }),
    ]).byEmployee[0];

    expect(sumOf(person.daysByType)).toBe(person.days);
    expect(person.daysByType["Casual Leave"]).toBe(2);
    expect(person.daysByType["Unspecified"]).toBe(1);
  });

  it("still adds up once a month's days have been prorated", () => {
    const person = aggregateStats(
      entriesInMonth(
        [
          entry({
            id: "spanning",
            leaveType: "Earned Leave",
            fromDate: "30 Aug 2026",
            toDate: "02 Sep 2026",
            numberOfDays: 4,
            receivedAt: "2026-08-20T09:00:00.000Z",
          }),
          entry({
            id: "third",
            leaveType: "Casual Leave",
            fromDate: "10 Sep 2026",
            toDate: "12 Sep 2026",
            numberOfDays: 1,
            receivedAt: "2026-09-09T09:00:00.000Z",
          }),
        ],
        "2026-09"
      )
    ).byEmployee[0];

    expect(sumOf(person.daysByType)).toBeCloseTo(person.days, 5);
  });

  it("keeps half days instead of rounding them to whole days", () => {
    const person = aggregateStats([
      entry({ id: "a", leaveType: "Casual Leave", numberOfDays: 0.5 }),
      entry({ id: "b", leaveType: "Casual Leave", numberOfDays: 2 }),
    ]).byEmployee[0];

    expect(person.daysByType["Casual Leave"]).toBe(2.5);
    expect(sumOf(person.daysByType)).toBe(person.days);
  });

  it("never shows floating point dust for a type", () => {
    const person = aggregateStats([
      entry({ id: "a", leaveType: "Casual Leave", numberOfDays: 0.1 }),
      entry({ id: "b", leaveType: "Casual Leave", numberOfDays: 0.1 }),
      entry({ id: "c", leaveType: "Casual Leave", numberOfDays: 0.1 }),
    ]).byEmployee[0];

    expect(0.1 + 0.1 + 0.1).not.toBe(0.3);
    expect(person.daysByType["Casual Leave"]).toBe(0.3);
    expect(sumOf(person.daysByType)).toBe(person.days);
  });

  it("rounds a type the same way a prorated day total is rounded", () => {
    const person = aggregateStats([
      entry({ id: "a", leaveType: "Earned Leave", numberOfDays: 1.1 }),
      entry({ id: "b", leaveType: "Earned Leave", numberOfDays: 2.2 }),
    ]).byEmployee[0];

    expect(1.1 + 2.2).not.toBe(3.3);
    expect(person.daysByType["Earned Leave"]).toBe(3.3);
    expect(sumOf(person.daysByType)).toBe(person.days);
  });

  it("records zero days for a request whose only day a newer one took", () => {
    const beaten = entry({
      id: "beaten",
      leaveType: "Casual Leave",
      fromDate: "03 Sep 2026",
      toDate: "03 Sep 2026",
      numberOfDays: 1,
      receivedAt: "2026-08-01T09:00:00.000Z",
    });
    const winner = entry({
      id: "winner",
      leaveType: "Sick Leave",
      fromDate: "03 Sep 2026",
      toDate: "03 Sep 2026",
      numberOfDays: 1,
      receivedAt: "2026-09-02T09:00:00.000Z",
    });

    const person = aggregateStats(
      entriesInMonth([beaten, winner], "2026-09")
    ).byEmployee[0];

    expect(person.daysByType).toEqual({
      "Casual Leave": 0,
      "Sick Leave": 1,
    });
    expect(person.requests).toBe(2);
    expect(person.days).toBe(1);
    expect(sumOf(person.daysByType)).toBe(person.days);
    expect(topDaysByType(person.daysByType)).toEqual([
      { type: "Sick Leave", days: 1 },
    ]);
  });

  it("leaves a roster member who took nothing with no types to show", () => {
    const filled = fillTeamRoster([], [{ code: "GRP2001", name: "Vikram" }]);

    expect(filled[0].daysByType).toEqual({});
    expect(topDaysByType(filled[0].daysByType)).toEqual([]);
  });
});

describe("topDaysByType", () => {
  it("hides a type that contributed no days", () => {
    expect(
      topDaysByType({ "Casual Leave": 0, "Sick Leave": 2 })
    ).toEqual([{ type: "Sick Leave", days: 2 }]);
  });

  it("has nothing to show when every type is zero", () => {
    expect(topDaysByType({ "Casual Leave": 0, "Sick Leave": 0 })).toEqual([]);
    expect(topDaysByType({})).toEqual([]);
  });

  it("puts the biggest type first", () => {
    expect(
      topDaysByType({ "Casual Leave": 1, "Sick Leave": 4, "Earned Leave": 2 })
    ).toEqual([
      { type: "Sick Leave", days: 4 },
      { type: "Earned Leave", days: 2 },
      { type: "Casual Leave", days: 1 },
    ]);
  });

  it("settles a tie by name so the order never wobbles", () => {
    const tied = { Sick: 2, Casual: 2, Earned: 2 };

    expect(topDaysByType(tied).map((row) => row.type)).toEqual([
      "Casual",
      "Earned",
      "Sick",
    ]);
    expect(topDaysByType({ Earned: 2, Sick: 2, Casual: 2 })).toEqual(
      topDaysByType(tied)
    );
  });

  it("shows at most four types", () => {
    const many = { a: 6, b: 5, c: 4, d: 3, e: 2, f: 1 };

    expect(topDaysByType(many).map((row) => row.type)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
    expect(topDaysByType(many, 2).map((row) => row.type)).toEqual(["a", "b"]);
  });

  it("ignores days that are negative or not a number", () => {
    expect(
      topDaysByType({
        Good: 1,
        Negative: -3,
        Broken: Number.NaN,
        Endless: Number.POSITIVE_INFINITY,
      })
    ).toEqual([{ type: "Good", days: 1 }]);
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
      handled: 0,
      pending: 0,
    });
    expect(stats.byMonth).toHaveLength(1);
    expect(stats.byMonth[0].total).toBe(1);
    expect(stats.byMonth[0].byType).toEqual({ "Casual Leave": 1 });
    expect(stats.byType).toEqual([
      { type: "Casual Leave", requests: 1, days: 2 },
    ]);
    expect(stats.totalRequests).toBe(1);
  });

  it("never inflates the person it belongs to", () => {
    const person = aggregateStats([kept, pulled]).byEmployee[0];

    expect(person.requests).toBe(1);
    expect(person.days).toBe(2);
    expect(person.daysByType).toEqual({ "Casual Leave": 2 });
    expect(person.outcomes).toEqual({
      approved: 1,
      rejected: 0,
      handled: 0,
      pending: 0,
    });
  });

  it("is gone from that person's own request list", () => {
    const person = aggregateStats([kept, pulled]).byEmployee[0];

    expect(person.entries.map((e) => e.status)).toEqual(["approved"]);
    expect(person.entries).toHaveLength(person.requests);
  });

  it("never reaches the entries the client re-aggregates from", () => {
    const stats = aggregateStats([kept, pulled]);

    expect(stats.entries.map((e) => e.id)).toEqual(["kept"]);
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

  it("leaves nothing behind when it is a person's only request", () => {
    const stats = aggregateStats([pulled]);

    expect(stats.outcomes.applied).toBe(0);
    expect(stats.totalRequests).toBe(0);
    expect(stats.byMonth).toEqual([]);
    expect(stats.byType).toEqual([]);
    expect(stats.byEmployee).toEqual([]);
    expect(stats.entries).toEqual([]);
    expect(stats.sinceDate).toBe("");
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

  it("never lets a withdrawn request inflate a month tab count", () => {
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
      { key: "2026-09", label: "September 2026", count: 1 },
    ]);
  });

  it("keeps a month tab a withdrawn request was the only reason for", () => {
    const months = buildStatsMonths(
      [
        entry({
          id: "b",
          fromDate: "04 Nov 2026",
          toDate: "04 Nov 2026",
          receivedAt: "2026-10-06T09:00:00.000Z",
          status: "withdrawn",
        }),
      ],
      now
    );

    expect(months.map((m) => m.key)).toEqual(["2026-09"]);
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

  it("adds neither an outcome nor a person to that month", () => {
    const september = aggregateStats(entriesInMonth([pulled], "2026-09"));
    expect(september.outcomes.applied).toBe(0);
    expect(september.totalRequests).toBe(0);
    expect(september.byEmployee).toEqual([]);
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

describe("teamRoster", () => {
  const directory = {
    GRP1042: { name: "Asha Rao" },
    GRP2001: { name: "Vikram Singh" },
  };

  it("names every configured team member from the directory", () => {
    expect(teamRoster(["GRP1042", "GRP2001"], directory)).toEqual([
      { code: "GRP1042", name: "Asha Rao" },
      { code: "GRP2001", name: "Vikram Singh" },
    ]);
  });

  it("falls back to the bare code when the directory has never heard of them", () => {
    expect(teamRoster(["GRP9999"], directory)).toEqual([
      { code: "GRP9999", name: "GRP9999" },
    ]);
  });

  it("normalises case and stray spacing the way the team filter does", () => {
    expect(teamRoster([" grp1042 "], directory)).toEqual([
      { code: "GRP1042", name: "Asha Rao" },
    ]);
  });

  it("drops blanks and repeats", () => {
    expect(
      teamRoster(["GRP1042", "", "   ", "grp1042"], directory).map((m) => m.code)
    ).toEqual(["GRP1042"]);
  });

  it("stays empty when no team is configured", () => {
    expect(teamRoster([], directory)).toEqual([]);
  });
});

describe("fillTeamRoster", () => {
  const roster = [
    { code: "GRP1042", name: "Asha Rao" },
    { code: "GRP2001", name: "Vikram Singh" },
    { code: "GRP3003", name: "Meera Nair" },
  ];

  it("adds a zero row for a team member who took nothing", () => {
    const { byEmployee } = aggregateStats([
      entry({ id: "a", employeeCode: "GRP1042", numberOfDays: 2 }),
    ]);

    const filled = fillTeamRoster(byEmployee, roster);

    expect(filled.map((p) => p.code)).toEqual([
      "GRP1042",
      "GRP2001",
      "GRP3003",
    ]);
    expect(filled[1]).toEqual({
      code: "GRP2001",
      name: "Vikram Singh",
      requests: 0,
      days: 0,
      daysByType: {},
      outcomes: { approved: 0, rejected: 0, handled: 0, pending: 0 },
      entries: [],
    });
  });

  it("never duplicates a person who already has leave", () => {
    const { byEmployee } = aggregateStats([
      entry({ id: "a", employeeCode: "grp1042", numberOfDays: 2 }),
      entry({ id: "b", employeeCode: " GRP1042 ", numberOfDays: 1 }),
    ]);

    const filled = fillTeamRoster(byEmployee, roster);

    expect(filled.filter((p) => p.code === "GRP1042")).toHaveLength(1);
    expect(filled.find((p) => p.code === "GRP1042")?.days).toBe(3);
  });

  it("keeps the ranking by days, with the zero rows last", () => {
    const { byEmployee } = aggregateStats([
      entry({ id: "a", employeeCode: "GRP1042", numberOfDays: 1 }),
      entry({ id: "b", employeeCode: "GRP2001", numberOfDays: 4 }),
    ]);

    const filled = fillTeamRoster(byEmployee, roster);

    expect(filled.map((p) => [p.code, p.days])).toEqual([
      ["GRP2001", 4],
      ["GRP1042", 1],
      ["GRP3003", 0],
    ]);
  });

  it("ranks by days even when the rows arrive out of order", () => {
    const quiet = {
      code: "GRP1042",
      name: "Asha Rao",
      requests: 1,
      days: 1,
      daysByType: {},
      outcomes: { approved: 1, rejected: 0, handled: 0, pending: 0 },
      entries: [],
    };
    const busy = { ...quiet, code: "GRP2001", name: "Vikram Singh", days: 4 };

    const filled = fillTeamRoster([quiet, busy], roster);

    expect(filled.map((p) => [p.code, p.days])).toEqual([
      ["GRP2001", 4],
      ["GRP1042", 1],
      ["GRP3003", 0],
    ]);
  });

  it("puts the whole team on at zero when nobody took leave", () => {
    const filled = fillTeamRoster([], roster);

    expect(filled.map((p) => p.code)).toEqual([
      "GRP1042",
      "GRP2001",
      "GRP3003",
    ]);
    expect(filled.every((p) => p.days === 0 && p.requests === 0)).toBe(true);
  });

  it("never invents a roster when the manager has no team configured", () => {
    const { byEmployee } = aggregateStats([
      entry({ id: "a", employeeCode: "GRP1042", numberOfDays: 2 }),
    ]);

    expect(fillTeamRoster(byEmployee, [])).toBe(byEmployee);
    expect(fillTeamRoster(byEmployee, undefined)).toBe(byEmployee);
  });

  it("leaves a person with no code alone instead of merging them into a member", () => {
    const { byEmployee } = aggregateStats([
      entry({ id: "a", employeeCode: "", employeeName: "Asha Rao" }),
    ]);

    const filled = fillTeamRoster(byEmployee, roster);

    expect(filled).toHaveLength(4);
    expect(filled.filter((p) => p.name === "Asha Rao")).toHaveLength(2);
  });
});

describe("chartTicks", () => {
  it("still gives a scale to read when nobody was off", () => {
    expect(chartTicks(0)).toEqual([0, 1]);
  });

  it("tops out at one when at most one person was off", () => {
    expect(chartTicks(1)).toEqual([0, 1]);
  });

  it("counts up in ones while that fits in four ticks", () => {
    expect(chartTicks(2)).toEqual([0, 1, 2]);
    expect(chartTicks(3)).toEqual([0, 1, 2, 3]);
  });

  it("widens the step rather than crowd in a fifth tick", () => {
    expect(chartTicks(4)).toEqual([0, 2, 4]);
    expect(chartTicks(7)).toEqual([0, 3, 6, 9]);
    expect(chartTicks(12)).toEqual([0, 4, 8, 12]);
  });

  it("keeps every tick a whole number of people", () => {
    for (let peak = 0; peak <= 60; peak += 1) {
      for (const tick of chartTicks(peak)) {
        expect(Number.isInteger(tick)).toBe(true);
      }
    }
  });

  it("always starts at zero, rises evenly and clears the peak", () => {
    for (let peak = 0; peak <= 60; peak += 1) {
      const ticks = chartTicks(peak);

      expect(ticks[0]).toBe(0);
      expect(ticks.length).toBeGreaterThanOrEqual(2);
      expect(ticks.length).toBeLessThanOrEqual(4);
      expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(peak);
      expect(ticks[ticks.length - 1]).toBeGreaterThan(0);

      const step = ticks[1] - ticks[0];
      for (let i = 1; i < ticks.length; i += 1) {
        expect(ticks[i] - ticks[i - 1]).toBe(step);
      }
    }
  });

  it("falls back to a readable scale for a peak that makes no sense", () => {
    expect(chartTicks(-4)).toEqual([0, 1]);
    expect(chartTicks(Number.NaN)).toEqual([0, 1]);
    expect(chartTicks(Number.POSITIVE_INFINITY)).toEqual([0, 1]);
    expect(chartTicks(Number.NEGATIVE_INFINITY)).toEqual([0, 1]);
  });

  it("lifts a fractional peak to the whole person above it", () => {
    expect(chartTicks(2.4)).toEqual([0, 1, 2, 3]);
  });
});

describe("narrowDayLabels", () => {
  it("always shows the first and last date of every month length", () => {
    for (const days of [28, 29, 30, 31]) {
      const shown = narrowDayLabels(days);

      expect(shown).toHaveLength(days);
      expect(shown[0]).toBe(true);
      expect(shown[days - 1]).toBe(true);
    }
  });

  it("never leaves two shown dates side by side", () => {
    for (const days of [28, 29, 30, 31]) {
      const shown = narrowDayLabels(days);

      for (let i = 1; i < days; i += 1) {
        expect(shown[i] && shown[i - 1]).toBe(false);
      }
    }
  });

  it("drops roughly half the dates so each one has room", () => {
    for (const days of [28, 29, 30, 31]) {
      const kept = narrowDayLabels(days).filter(Boolean).length;

      expect(kept).toBeLessThanOrEqual(Math.ceil(days / 2) + 1);
      expect(kept).toBeGreaterThanOrEqual(Math.floor(days / 2));
    }
  });

  it("skips the date next to the last one so they cannot collide", () => {
    expect(narrowDayLabels(30)[28]).toBe(false);
    expect(narrowDayLabels(30)[29]).toBe(true);
  });

  it("copes with a month too short to thin out", () => {
    expect(narrowDayLabels(1)).toEqual([true]);
    expect(narrowDayLabels(2)).toEqual([true, true]);
    expect(narrowDayLabels(3)).toEqual([true, false, true]);
  });

  it("has nothing to show for an empty or nonsense month", () => {
    expect(narrowDayLabels(0)).toEqual([]);
    expect(narrowDayLabels(-5)).toEqual([]);
    expect(narrowDayLabels(Number.NaN)).toEqual([]);
  });

  it("gives one answer per plotted day", () => {
    const points = dailyLeaveCounts([], "2026-09");

    expect(narrowDayLabels(points.length)).toHaveLength(points.length);
  });
});

describe("dailyLeaveCounts", () => {
  const leave = (over: Partial<StatsEntry>) =>
    entry({ fromDate: "01 Sep 2026", toDate: "01 Sep 2026", ...over });

  it("emits one point per calendar day of a 30-day month", () => {
    const points = dailyLeaveCounts([], "2026-09");

    expect(points).toHaveLength(30);
    expect(points[0].ymd).toBe("2026-09-01");
    expect(points[29].ymd).toBe("2026-09-30");
  });

  it("emits one point per calendar day of a 31-day month", () => {
    const points = dailyLeaveCounts([], "2026-08");

    expect(points).toHaveLength(31);
    expect(points.at(-1)?.ymd).toBe("2026-08-31");
  });

  it("gives February 29 points in a leap year", () => {
    const points = dailyLeaveCounts([], "2028-02");

    expect(points).toHaveLength(29);
    expect(points.at(-1)).toEqual({ ymd: "2028-02-29", day: 29, people: 0 });
  });

  it("gives February 28 points outside a leap year", () => {
    const points = dailyLeaveCounts([], "2026-02");

    expect(points).toHaveLength(28);
    expect(points.at(-1)).toEqual({ ymd: "2026-02-28", day: 28, people: 0 });
  });

  it("stays inside the asked-for month on every point, in ascending order", () => {
    const points = dailyLeaveCounts(
      [leave({ id: "a", fromDate: "28 Aug 2026", toDate: "03 Sep 2026" })],
      "2026-09"
    );

    expect(points.every((p) => p.ymd.slice(0, 7) === "2026-09")).toBe(true);
    expect(points.map((p) => p.day)).toEqual(
      Array.from({ length: 30 }, (_, i) => i + 1)
    );
    expect([...points].sort((a, b) => a.ymd.localeCompare(b.ymd))).toEqual(
      points
    );
  });

  it("counts the people out on each day of a span", () => {
    const points = dailyLeaveCounts(
      [
        leave({
          id: "a",
          employeeCode: "GRP1042",
          fromDate: "10 Sep 2026",
          toDate: "12 Sep 2026",
        }),
        leave({
          id: "b",
          employeeCode: "GRP2001",
          employeeName: "Vikram Singh",
          fromDate: "12 Sep 2026",
          toDate: "12 Sep 2026",
        }),
      ],
      "2026-09"
    );

    const byDay = new Map(points.map((p) => [p.day, p.people]));
    expect(byDay.get(9)).toBe(0);
    expect(byDay.get(10)).toBe(1);
    expect(byDay.get(11)).toBe(1);
    expect(byDay.get(12)).toBe(2);
    expect(byDay.get(13)).toBe(0);
  });

  it("counts one person once when two of their requests overlap the same day", () => {
    const points = dailyLeaveCounts(
      [
        leave({
          id: "a",
          employeeCode: "GRP1042",
          fromDate: "10 Sep 2026",
          toDate: "12 Sep 2026",
        }),
        leave({
          id: "b",
          employeeCode: "grp1042",
          fromDate: "12 Sep 2026",
          toDate: "14 Sep 2026",
        }),
      ],
      "2026-09"
    );

    expect(points.filter((p) => p.people > 0).map((p) => [p.day, p.people])).toEqual(
      [
        [10, 1],
        [11, 1],
        [12, 1],
        [13, 1],
        [14, 1],
      ]
    );
  });

  it("splits a leave that crosses a month boundary across both charts", () => {
    const crossing = leave({
      id: "a",
      fromDate: "30 Aug 2026",
      toDate: "02 Sep 2026",
    });

    const august = dailyLeaveCounts([crossing], "2026-08");
    const september = dailyLeaveCounts([crossing], "2026-09");

    expect(august.filter((p) => p.people > 0).map((p) => p.day)).toEqual([
      30, 31,
    ]);
    expect(september.filter((p) => p.people > 0).map((p) => p.day)).toEqual([
      1, 2,
    ]);
  });

  it("still returns a full month of zeros when nobody took leave", () => {
    const points = dailyLeaveCounts(
      [leave({ id: "a", fromDate: "04 Jul 2026", toDate: "06 Jul 2026" })],
      "2026-09"
    );

    expect(points).toHaveLength(30);
    expect(points.every((p) => p.people === 0)).toBe(true);
  });

  it("keeps quiet days in the middle of a month instead of skipping them", () => {
    const points = dailyLeaveCounts(
      [
        leave({ id: "a", fromDate: "02 Sep 2026", toDate: "02 Sep 2026" }),
        leave({ id: "b", fromDate: "28 Sep 2026", toDate: "28 Sep 2026" }),
      ],
      "2026-09"
    );

    expect(points).toHaveLength(30);
    expect(points.slice(2, 27).every((p) => p.people === 0)).toBe(true);
  });

  it("ignores withdrawn requests", () => {
    const points = dailyLeaveCounts(
      [
        leave({
          id: "a",
          fromDate: "12 Sep 2026",
          toDate: "12 Sep 2026",
          status: "withdrawn",
        }),
      ],
      "2026-09"
    );

    expect(points.every((p) => p.people === 0)).toBe(true);
  });

  it("leaves unparseable leave dates off the chart instead of using the mail date", () => {
    const points = dailyLeaveCounts(
      [
        entry({
          id: "a",
          fromDate: "",
          toDate: "",
          receivedAt: "2026-09-14T09:00:00.000Z",
        }),
        entry({
          id: "b",
          fromDate: "32 Sep 2026",
          toDate: "32 Sep 2026",
          receivedAt: "2026-09-15T09:00:00.000Z",
        }),
      ],
      "2026-09"
    );

    expect(points).toHaveLength(30);
    expect(points.every((p) => p.people === 0)).toBe(true);
  });

  it("leaves an absurdly long span off the chart", () => {
    const points = dailyLeaveCounts(
      [leave({ id: "a", fromDate: "01 Jan 2025", toDate: "31 Dec 2026" })],
      "2026-09"
    );

    expect(points.every((p) => p.people === 0)).toBe(true);
  });

  it("falls back to the name when a person has no employee code", () => {
    const points = dailyLeaveCounts(
      [
        leave({
          id: "a",
          employeeCode: " ",
          employeeName: "Asha Rao",
          fromDate: "12 Sep 2026",
          toDate: "12 Sep 2026",
        }),
        leave({
          id: "b",
          employeeCode: "",
          employeeName: "asha rao",
          fromDate: "12 Sep 2026",
          toDate: "12 Sep 2026",
        }),
      ],
      "2026-09"
    );

    expect(points.find((p) => p.day === 12)?.people).toBe(1);
  });

  it("returns nothing for a missing or malformed month key", () => {
    const entries = [leave({ id: "a" })];

    expect(dailyLeaveCounts(entries, "")).toEqual([]);
    expect(dailyLeaveCounts(entries, "2026-13")).toEqual([]);
    expect(dailyLeaveCounts(entries, "2026-00")).toEqual([]);
    expect(dailyLeaveCounts(entries, "2026-9")).toEqual([]);
    expect(dailyLeaveCounts(entries, "2026-09-01")).toEqual([]);
    expect(dailyLeaveCounts(entries, "September")).toEqual([]);
  });
});
