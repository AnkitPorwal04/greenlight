import { describe, it, expect } from "vitest";
import { aggregateStats, aggregateStatsForTeam, type StatsEntry } from "./stats";

function entry(over: Partial<StatsEntry> = {}): StatsEntry {
  return {
    id: "m1",
    employeeName: "Asha Rao",
    employeeCode: "e101",
    leaveType: "Casual Leave",
    numberOfDays: 1,
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
