import { describe, it, expect } from "vitest";
import type { gmail_v1 } from "@googleapis/gmail";
import {
  buildDirectMail,
  directCacheEntryFromMessage,
  emptyDirectCache,
  partitionDirectCached,
  pruneDirectCache,
  readDirectCache,
  DIRECT_CACHE_MAX_AGE_MS,
  DIRECT_CACHE_MAX_BODY_CHARS,
  DIRECT_CACHE_MAX_BYTES,
  DIRECT_CACHE_MAX_ENTRIES,
  DIRECT_CACHE_MAX_FROM_CHARS,
  DIRECT_CACHE_MAX_RECIPIENTS,
  DIRECT_CACHE_MAX_SUBJECT_CHARS,
  DIRECT_CACHE_VERSION,
} from "./direct-cache";
import type { DirectCache, DirectCacheEntry } from "./direct-cache";
import { DIRECT_MAX_MESSAGES } from "./direct-fetch";
import { buildClassifyPrompt, MAX_BODY_CHARS as CLASSIFY_MAX_BODY_CHARS } from "./classify";

const NOW = Date.UTC(2026, 7, 27, 9, 0, 0);
const SELF = "manager@ethara-ai.com";

function body(text: string) {
  return {
    mimeType: "text/plain",
    body: { data: Buffer.from(text, "utf8").toString("base64url") },
  };
}

function message(
  over: {
    id?: string;
    threadId?: string;
    internalDate?: string | null;
    from?: string;
    to?: string;
    cc?: string;
    subject?: string;
    text?: string;
  } = {},
): gmail_v1.Schema$Message {
  return {
    id: over.id ?? "m1",
    threadId: over.threadId ?? "t1",
    internalDate: over.internalDate === undefined ? String(NOW) : over.internalDate,
    payload: {
      ...body(over.text ?? "Taking Monday off."),
      headers: [
        { name: "From", value: over.from ?? "Jane Doe <jane.doe@ethara-ai.com>" },
        { name: "To", value: over.to ?? SELF },
        { name: "Cc", value: over.cc ?? "hr@ethara-ai.com" },
        { name: "Subject", value: over.subject ?? "Leave on Monday" },
      ],
    },
  };
}

function cacheOf(entries: Record<string, DirectCacheEntry>): DirectCache {
  return { v: DIRECT_CACHE_VERSION, entries };
}

describe("readDirectCache", () => {
  it("returns an empty cache for nothing stored", () => {
    expect(readDirectCache(null)).toEqual(emptyDirectCache());
    expect(readDirectCache(undefined)).toEqual(emptyDirectCache());
    expect(readDirectCache("nonsense")).toEqual(emptyDirectCache());
  });

  it("discards the whole blob on a version mismatch", () => {
    const stale = {
      v: DIRECT_CACHE_VERSION + 1,
      entries: { m1: { t: NOW, m: null } },
    };
    expect(readDirectCache(stale)).toEqual(emptyDirectCache());
  });

  it("keeps a matching version", () => {
    const blob = cacheOf({ m1: { t: NOW, m: null } });
    expect(readDirectCache(blob)).toEqual(blob);
  });

  it("drops entries that are not shaped like entries", () => {
    const blob = {
      v: DIRECT_CACHE_VERSION,
      entries: {
        good: { t: NOW, m: null },
        noTime: { m: null },
        badTime: { t: "yesterday", m: null },
        notAnObject: 7,
        alsoBad: null,
      },
    };
    expect(Object.keys(readDirectCache(blob).entries)).toEqual(["good"]);
  });

  it("survives a missing entries map", () => {
    expect(readDirectCache({ v: DIRECT_CACHE_VERSION })).toEqual(
      emptyDirectCache(),
    );
  });
});

describe("partitionDirectCached", () => {
  const cache = cacheOf({
    hit: directCacheEntryFromMessage(message()),
    unusable: { t: NOW, m: null },
  });

  it("counts an unusable mail as known so it is never re-fetched", () => {
    const { known, missing } = partitionDirectCached(
      ["hit", "unusable", "new"],
      cache,
    );
    expect(known).toEqual(["hit", "unusable"]);
    expect(missing).toEqual(["new"]);
  });

  it("deduplicates and drops blank ids", () => {
    const { known, missing } = partitionDirectCached(
      ["hit", "hit", "", "new", "new"],
      cache,
    );
    expect(known).toEqual(["hit"]);
    expect(missing).toEqual(["new"]);
  });

  it("treats an empty cache as all missing", () => {
    expect(partitionDirectCached(["a", "b"], emptyDirectCache())).toEqual({
      known: [],
      missing: ["a", "b"],
    });
  });
});

describe("directCacheEntryFromMessage", () => {
  it("keeps every mail fact the classifier and the row need", () => {
    const entry = directCacheEntryFromMessage(message());
    expect(entry.t).toBe(NOW);
    expect(entry.m).toEqual({
      threadId: "t1",
      subject: "Leave on Monday",
      bodyText: "Taking Monday off.",
      senderEmail: "jane.doe@ethara-ai.com",
      recipients: [SELF, "hr@ethara-ai.com"],
      from: "Jane Doe <jane.doe@ethara-ai.com>",
    });
  });

  it("lower-cases the sender so the directory lookup matches", () => {
    const entry = directCacheEntryFromMessage(
      message({ from: "Jane <Jane.Doe@Ethara-AI.com>" }),
    );
    expect(entry.m?.senderEmail).toBe("jane.doe@ethara-ai.com");
  });

  it("stores a null marker when the mail has no sender address", () => {
    const entry = directCacheEntryFromMessage(message({ from: "Nobody" }));
    expect(entry.m).toBeNull();
    expect(entry.t).toBe(NOW);
  });

  it("does not store the resolved person or the manager address", () => {
    const entry = directCacheEntryFromMessage(message());
    const keys = Object.keys(entry.m ?? {});
    expect(keys).not.toContain("person");
    expect(keys).not.toContain("employeeCode");
    expect(keys).not.toContain("selfEmail");
  });

  it("clips a runaway body, subject, from and recipient list", () => {
    const entry = directCacheEntryFromMessage(
      message({
        text: "b".repeat(DIRECT_CACHE_MAX_BODY_CHARS + 500),
        subject: "s".repeat(DIRECT_CACHE_MAX_SUBJECT_CHARS + 50),
        from: `${"n".repeat(DIRECT_CACHE_MAX_FROM_CHARS)} <a@b.com>`,
        cc: Array.from(
          { length: DIRECT_CACHE_MAX_RECIPIENTS + 20 },
          (_, i) => `p${i}@ethara-ai.com`,
        ).join(", "),
      }),
    );
    expect(entry.m?.bodyText).toHaveLength(DIRECT_CACHE_MAX_BODY_CHARS);
    expect(entry.m?.subject).toHaveLength(DIRECT_CACHE_MAX_SUBJECT_CHARS);
    expect(entry.m?.from).toHaveLength(DIRECT_CACHE_MAX_FROM_CHARS);
    expect(entry.m?.recipients).toHaveLength(DIRECT_CACHE_MAX_RECIPIENTS);
  });

  it("keeps every body character the classifier would have read", () => {
    expect(DIRECT_CACHE_MAX_BODY_CHARS).toBeGreaterThanOrEqual(
      CLASSIFY_MAX_BODY_CHARS,
    );
  });

  it("classifies a clipped body exactly as it would the original", () => {
    const long = "Taking Monday off. ".repeat(2000);
    const entry = directCacheEntryFromMessage(message({ text: long }));
    const mail = buildDirectMail("m1", entry, SELF)!;
    expect(buildClassifyPrompt({ subject: "s", from: "f", bodyText: long })).toBe(
      buildClassifyPrompt({ subject: "s", from: "f", bodyText: mail.bodyText }),
    );
  });

  it("falls back to a usable timestamp when the mail has no internal date", () => {
    const entry = directCacheEntryFromMessage(
      message({ internalDate: null }),
      NOW,
    );
    expect(entry.t).toBe(NOW);
  });
});

describe("buildDirectMail", () => {
  it("returns null for a cached unusable mail", () => {
    expect(buildDirectMail("m1", { t: NOW, m: null }, SELF)).toBeNull();
  });

  it("rebuilds exactly what a live fetch would have produced", () => {
    const entry = directCacheEntryFromMessage(message());
    expect(buildDirectMail("m1", entry, SELF)).toEqual({
      id: "m1",
      threadId: "t1",
      subject: "Leave on Monday",
      bodyText: "Taking Monday off.",
      receivedAt: new Date(NOW).toISOString(),
      senderEmail: "jane.doe@ethara-ai.com",
      recipients: [SELF, "hr@ethara-ai.com"],
      selfEmail: SELF,
    });
  });

  it("takes the manager address from the caller, never from the cache", () => {
    const entry = directCacheEntryFromMessage(message());
    const moved = buildDirectMail("m1", entry, "new.manager@ethara-ai.com");
    expect(moved?.selfEmail).toBe("new.manager@ethara-ai.com");
  });
});

describe("pruneDirectCache", () => {
  it("drops entries older than the retention window", () => {
    const cache = cacheOf({
      fresh: { t: NOW - 1000, m: null },
      stale: { t: NOW - DIRECT_CACHE_MAX_AGE_MS - 1000, m: null },
    });
    expect(Object.keys(pruneDirectCache(cache, NOW).entries)).toEqual(["fresh"]);
  });

  it("keeps an entry exactly on the retention boundary", () => {
    const cache = cacheOf({ edge: { t: NOW - DIRECT_CACHE_MAX_AGE_MS, m: null } });
    expect(Object.keys(pruneDirectCache(cache, NOW).entries)).toEqual(["edge"]);
  });

  it("caps the entry count, dropping the oldest first", () => {
    const entries: Record<string, DirectCacheEntry> = {};
    for (let i = 0; i < DIRECT_CACHE_MAX_ENTRIES + 5; i += 1) {
      entries[`m${i}`] = { t: NOW - i * 1000, m: null };
    }
    const pruned = pruneDirectCache(cacheOf(entries), NOW);
    const kept = Object.keys(pruned.entries);
    expect(kept).toHaveLength(DIRECT_CACHE_MAX_ENTRIES);
    expect(kept[0]).toBe("m0");
    expect(pruned.entries[`m${DIRECT_CACHE_MAX_ENTRIES}`]).toBeUndefined();
  });

  it("caps total size so the blob stays writable", () => {
    const entries: Record<string, DirectCacheEntry> = {};
    for (let i = 0; i < DIRECT_CACHE_MAX_ENTRIES; i += 1) {
      entries[`m${i}`] = directCacheEntryFromMessage(
        message({ text: "b".repeat(DIRECT_CACHE_MAX_BODY_CHARS) }),
        NOW - i * 1000,
      );
      entries[`m${i}`].t = NOW - i * 1000;
    }
    const pruned = pruneDirectCache(cacheOf(entries), NOW);
    expect(JSON.stringify(pruned).length).toBeLessThanOrEqual(
      DIRECT_CACHE_MAX_BYTES,
    );
    expect(pruned.entries.m0).toBeDefined();
  });

  it("skips one oversized entry instead of evicting the whole tail behind it", () => {
    const small = (t: number): DirectCacheEntry => ({
      t,
      m: {
        threadId: "t1",
        subject: "Leave",
        bodyText: "b".repeat(900),
        senderEmail: "jane.doe@ethara-ai.com",
        recipients: [SELF],
        from: "Jane <jane.doe@ethara-ai.com>",
      },
    });

    const entries: Record<string, DirectCacheEntry> = {};
    for (let i = 0; i < 5; i += 1) entries[`new${i}`] = small(NOW - i * 1000);
    entries.fat = {
      t: NOW - 5 * 1000,
      m: { ...small(0).m!, bodyText: "b".repeat(DIRECT_CACHE_MAX_BYTES - 1000) },
    };
    for (let i = 0; i < 5; i += 1) entries[`old${i}`] = small(NOW - 6000 - i * 1000);

    const pruned = pruneDirectCache(cacheOf(entries), NOW);

    expect(pruned.entries.fat).toBeUndefined();
    for (let i = 0; i < 5; i += 1) {
      expect(pruned.entries[`new${i}`]).toBeDefined();
      expect(pruned.entries[`old${i}`]).toBeDefined();
    }
    expect(JSON.stringify(pruned).length).toBeLessThanOrEqual(
      DIRECT_CACHE_MAX_BYTES,
    );
  });

  it("holds a whole direct window without evicting anything", () => {
    const entries: Record<string, DirectCacheEntry> = {};
    for (let i = 0; i < 100; i += 1) {
      const entry = directCacheEntryFromMessage(message({ id: `m${i}` }));
      entries[`m${i}`] = { ...entry, t: NOW - i * 1000 };
    }
    const pruned = pruneDirectCache(cacheOf(entries), NOW);
    expect(Object.keys(pruned.entries)).toHaveLength(100);
  });

  it("holds a whole direct window of maximum length prose mail", () => {
    const entries: Record<string, DirectCacheEntry> = {};
    for (let i = 0; i < DIRECT_MAX_MESSAGES; i += 1) {
      const entry = directCacheEntryFromMessage(
        message({
          id: `m${i}`,
          text: "Taking Monday off, please approve. ".repeat(200),
          subject: "s".repeat(DIRECT_CACHE_MAX_SUBJECT_CHARS),
          from: `${"n".repeat(DIRECT_CACHE_MAX_FROM_CHARS)} <a@b.com>`,
          cc: Array.from(
            { length: DIRECT_CACHE_MAX_RECIPIENTS },
            (_, n) => `person.number${n}@a-long-company-domain.example.com`,
          ).join(", "),
        }),
      );
      entries[`m${i}`] = { ...entry, t: NOW - i * 1000 };
    }
    const pruned = pruneDirectCache(cacheOf(entries), NOW);
    expect(Object.keys(pruned.entries)).toHaveLength(DIRECT_MAX_MESSAGES);
  });

  it("never exceeds the byte cap, whatever it is handed", () => {
    const entries: Record<string, DirectCacheEntry> = {};
    for (let i = 0; i < DIRECT_CACHE_MAX_ENTRIES; i += 1) {
      entries[`m${i}`] = {
        t: NOW - i * 1000,
        m: {
          threadId: "t1",
          subject: '"'.repeat(DIRECT_CACHE_MAX_SUBJECT_CHARS),
          bodyText: '"'.repeat(DIRECT_CACHE_MAX_BODY_CHARS),
          senderEmail: "jane.doe@ethara-ai.com",
          recipients: Array.from({ length: DIRECT_CACHE_MAX_RECIPIENTS }, () =>
            "a".repeat(60),
          ),
          from: '"'.repeat(DIRECT_CACHE_MAX_FROM_CHARS),
        },
      };
    }
    const pruned = pruneDirectCache(cacheOf(entries), NOW);
    expect(JSON.stringify(pruned).length).toBeLessThanOrEqual(
      DIRECT_CACHE_MAX_BYTES,
    );
    expect(Object.keys(pruned.entries).length).toBeGreaterThan(0);
  });

  it("leaves a small cache untouched and stamps the version", () => {
    const cache = cacheOf({ a: { t: NOW, m: null } });
    expect(pruneDirectCache(cache, NOW)).toEqual(cache);
  });
});
