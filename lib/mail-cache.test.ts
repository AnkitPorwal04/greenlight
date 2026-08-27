import { describe, it, expect } from "vitest";
import {
  buildLeaveRequest,
  cacheEntryFromParsed,
  emptyMailCache,
  partitionCached,
  pruneMailCache,
  readMailCache,
  MAIL_CACHE_MAX_AGE_MS,
  MAIL_CACHE_MAX_BODY_CHARS,
  MAIL_CACHE_MAX_BYTES,
  MAIL_CACHE_MAX_ENTRIES,
  MAIL_CACHE_MAX_REASON_CHARS,
  MAIL_CACHE_VERSION,
} from "./mail-cache";
import type { MailCache, MailCacheEntry } from "./mail-cache";
import type { ParsedLeaveMail } from "./parser";
import type { Decision, LeaveRequest } from "./types";

const NOW = Date.UTC(2026, 7, 27, 9, 0, 0);

function parsed(overrides: Partial<ParsedLeaveMail> = {}): ParsedLeaveMail {
  return {
    employeeName: "Aarav Sharma",
    employeeCode: "GRP1042",
    employeeEmail: "aarav.sharma@ethara-ai.com",
    leaveType: "Casual Leave",
    fromDate: "17 Aug 2026",
    toDate: "18 Aug 2026",
    numberOfDays: 2,
    reason: "Family function out of town.",
    leaveBalance: "Casual: 6.5",
    fromSession: "Session 1",
    toSession: "Session 2",
    ccRecipients: ["hr@ethara-ai.com"],
    kind: "leave",
    ...overrides,
  };
}

function cacheOf(entries: Record<string, MailCacheEntry>): MailCache {
  return { v: MAIL_CACHE_VERSION, entries };
}

function directBuild(
  id: string,
  source: ParsedLeaveMail,
  threadId: string,
  bodyText: string,
  receivedMs: number,
  employees: Record<string, { email: string }>,
  decisions: Record<string, Decision>,
): LeaveRequest {
  const directoryEntry = employees[source.employeeCode.toUpperCase()];
  const decision = decisions[id];
  return {
    id,
    threadId,
    ...source,
    employeeEmail: directoryEntry?.email ?? source.employeeEmail,
    emailVerified: Boolean(directoryEntry),
    bodyText,
    receivedAt: new Date(receivedMs).toISOString(),
    status: decision?.status ?? "pending",
    decidedAt: decision?.decidedAt,
    decisionNote: decision?.note,
    mailSent: Boolean(decision?.sentTo),
  };
}

describe("readMailCache", () => {
  it("returns an empty cache for nothing stored", () => {
    expect(readMailCache(null)).toEqual(emptyMailCache());
    expect(readMailCache(undefined)).toEqual(emptyMailCache());
    expect(readMailCache("nonsense")).toEqual(emptyMailCache());
  });

  it("discards the whole blob on a version mismatch", () => {
    const stale = {
      v: MAIL_CACHE_VERSION + 1,
      entries: { m1: { t: NOW, m: null } },
    };
    expect(readMailCache(stale)).toEqual(emptyMailCache());
  });

  it("keeps a matching version", () => {
    const blob = cacheOf({ m1: { t: NOW, m: null } });
    expect(readMailCache(blob)).toEqual(blob);
  });

  it("drops entries that are not shaped like entries", () => {
    const blob = {
      v: MAIL_CACHE_VERSION,
      entries: {
        good: { t: NOW, m: null },
        noTime: { m: null },
        badTime: { t: "yesterday", m: null },
        notAnObject: 7,
        alsoBad: null,
      },
    };
    expect(Object.keys(readMailCache(blob).entries)).toEqual(["good"]);
  });

  it("survives a missing entries map", () => {
    expect(readMailCache({ v: MAIL_CACHE_VERSION })).toEqual(emptyMailCache());
  });
});

describe("partitionCached", () => {
  const cache = cacheOf({
    hit: { t: NOW, m: cacheEntryFromParsed(parsed(), NOW, "t1", "body").m },
    miss: { t: NOW, m: null },
  });

  it("counts a negative parse as known so it is not re-fetched", () => {
    const { known, missing } = partitionCached(["hit", "miss", "new"], cache);
    expect(known).toEqual(["hit", "miss"]);
    expect(missing).toEqual(["new"]);
  });

  it("deduplicates and drops blank ids", () => {
    const { known, missing } = partitionCached(
      ["hit", "hit", "", "new", "new"],
      cache,
    );
    expect(known).toEqual(["hit"]);
    expect(missing).toEqual(["new"]);
  });

  it("treats an empty cache as all missing", () => {
    expect(partitionCached(["a", "b"], emptyMailCache())).toEqual({
      known: [],
      missing: ["a", "b"],
    });
  });
});

describe("cacheEntryFromParsed", () => {
  it("stores a null marker for a mail that did not parse", () => {
    expect(cacheEntryFromParsed(null, NOW, "t1", "body")).toEqual({
      t: NOW,
      m: null,
    });
  });

  it("keeps the thread id and body alongside the parsed fields", () => {
    const entry = cacheEntryFromParsed(parsed(), NOW, "t1", "hello");
    expect(entry.t).toBe(NOW);
    expect(entry.m?.threadId).toBe("t1");
    expect(entry.m?.bodyText).toBe("hello");
    expect(entry.m?.employeeCode).toBe("GRP1042");
    expect(entry.m?.ccRecipients).toEqual(["hr@ethara-ai.com"]);
  });

  it("truncates a runaway reason and body", () => {
    const entry = cacheEntryFromParsed(
      parsed({ reason: "r".repeat(5000) }),
      NOW,
      "t1",
      "b".repeat(MAIL_CACHE_MAX_BODY_CHARS + 500),
    );
    expect(entry.m?.reason).toHaveLength(MAIL_CACHE_MAX_REASON_CHARS);
    expect(entry.m?.bodyText).toHaveLength(MAIL_CACHE_MAX_BODY_CHARS);
  });

  it("falls back to a usable timestamp when the mail has none", () => {
    const entry = cacheEntryFromParsed(parsed(), Number.NaN, "t1", "body");
    expect(Number.isFinite(entry.t)).toBe(true);
  });
});

describe("buildLeaveRequest", () => {
  const employees = { GRP1042: { email: "aarav@ethara-ai.com" } };
  const decisions: Record<string, Decision> = {
    m1: {
      status: "approved",
      decidedAt: "2026-08-20T10:00:00.000Z",
      note: "ok",
      sentTo: "aarav@ethara-ai.com",
    },
  };

  it("returns null for a cached negative parse", () => {
    expect(
      buildLeaveRequest("m1", { t: NOW, m: null }, employees, decisions),
    ).toBeNull();
  });

  it("round-trips parse to cache to request identically to a direct build", () => {
    const source = parsed();
    const entry = cacheEntryFromParsed(source, NOW, "t1", "the body");
    expect(buildLeaveRequest("m1", entry, employees, decisions)).toEqual(
      directBuild(
        "m1",
        source,
        "t1",
        "the body",
        NOW,
        employees,
        decisions,
      ),
    );
  });

  it("round-trips an unknown employee with no decision", () => {
    const source = parsed({ employeeCode: "GRP9999" });
    const entry = cacheEntryFromParsed(source, NOW, "t2", "body");
    const built = buildLeaveRequest("m2", entry, employees, {});
    expect(built).toEqual(
      directBuild("m2", source, "t2", "body", NOW, employees, {}),
    );
    expect(built?.emailVerified).toBe(false);
    expect(built?.status).toBe("pending");
    expect(built?.mailSent).toBe(false);
  });

  it("prefers the directory email over the guessed one", () => {
    const entry = cacheEntryFromParsed(parsed(), NOW, "t1", "body");
    const built = buildLeaveRequest("m3", entry, employees, {});
    expect(built?.employeeEmail).toBe("aarav@ethara-ai.com");
    expect(built?.emailVerified).toBe(true);
  });
});

describe("pruneMailCache", () => {
  it("drops entries older than the retention window", () => {
    const cache = cacheOf({
      fresh: { t: NOW - 1000, m: null },
      stale: { t: NOW - MAIL_CACHE_MAX_AGE_MS - 1000, m: null },
    });
    expect(Object.keys(pruneMailCache(cache, NOW).entries)).toEqual(["fresh"]);
  });

  it("keeps an entry exactly on the retention boundary", () => {
    const cache = cacheOf({
      edge: { t: NOW - MAIL_CACHE_MAX_AGE_MS, m: null },
    });
    expect(Object.keys(pruneMailCache(cache, NOW).entries)).toEqual(["edge"]);
  });

  it("caps the entry count, dropping the oldest first", () => {
    const entries: Record<string, MailCacheEntry> = {};
    for (let i = 0; i < MAIL_CACHE_MAX_ENTRIES + 5; i += 1) {
      entries[`m${i}`] = { t: NOW - i * 1000, m: null };
    }
    const pruned = pruneMailCache(cacheOf(entries), NOW);
    const kept = Object.keys(pruned.entries);
    expect(kept).toHaveLength(MAIL_CACHE_MAX_ENTRIES);
    expect(kept[0]).toBe("m0");
    expect(pruned.entries[`m${MAIL_CACHE_MAX_ENTRIES}`]).toBeUndefined();
  });

  it("caps total size so the blob stays writable", () => {
    const entries: Record<string, MailCacheEntry> = {};
    for (let i = 0; i < 400; i += 1) {
      entries[`m${i}`] = cacheEntryFromParsed(
        parsed({ reason: "r".repeat(400) }),
        NOW - i * 1000,
        "t1",
        "b".repeat(4000),
      );
    }
    const pruned = pruneMailCache(cacheOf(entries), NOW);
    expect(JSON.stringify(pruned).length).toBeLessThanOrEqual(
      MAIL_CACHE_MAX_BYTES,
    );
    expect(Object.keys(pruned.entries).length).toBeLessThan(400);
    expect(pruned.entries.m0).toBeDefined();
  });

  it("leaves a small cache untouched and stamps the version", () => {
    const cache = cacheOf({ a: { t: NOW, m: null } });
    expect(pruneMailCache(cache, NOW)).toEqual(cache);
  });
});
