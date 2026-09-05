import { describe, expect, it, vi } from "vitest";
import {
  SYNC_MAX_AGE_MS,
  SYNC_STATE_VERSION,
  advanceSyncState,
  decideSync,
  isStaleHistoryId,
  maxAgeFor,
  nextSyncState,
  normalizeHistoryId,
  planSync,
  probeSaysChanged,
  readSyncState,
  scanIsComplete,
  syncStateToStore,
} from "./gmail-sync";
import type { HistoryProbeResponse, SyncState } from "./gmail-sync";

const NOW = 1_800_000_000_000;

function state(overrides: Partial<SyncState> = {}): SyncState {
  return {
    v: SYNC_STATE_VERSION,
    historyId: "9001",
    sinceMs: 1_700_000_000_000,
    count: 3,
    at: NOW - 60_000,
    ...overrides,
  };
}

function input(overrides: Partial<Parameters<typeof planSync>[1]> = {}) {
  return {
    historyId: "9001",
    sinceMs: 1_700_000_000_000,
    nowMs: NOW,
    cachedCount: 3,
    ...overrides,
  };
}

const unchangedProbe = vi.fn(async () => ({ history: [] }));

describe("normalizeHistoryId", () => {
  it("keeps a trimmed string", () => {
    expect(normalizeHistoryId(" 42 ")).toBe("42");
  });

  it("accepts the numeric form Gmail sometimes hands back", () => {
    expect(normalizeHistoryId(42)).toBe("42");
  });

  it("treats anything else as absent", () => {
    expect(normalizeHistoryId(undefined)).toBe("");
    expect(normalizeHistoryId(null)).toBe("");
    expect(normalizeHistoryId("")).toBe("");
    expect(normalizeHistoryId("   ")).toBe("");
    expect(normalizeHistoryId(Number.NaN)).toBe("");
    expect(normalizeHistoryId({})).toBe("");
  });
});

describe("readSyncState", () => {
  it("round-trips a well formed record", () => {
    expect(readSyncState(state())).toEqual(state());
  });

  it("rejects a record written by an older shape", () => {
    expect(readSyncState({ ...state(), v: 0 })).toBeNull();
  });

  it("rejects records missing any field the decision depends on", () => {
    expect(readSyncState(null)).toBeNull();
    expect(readSyncState("nope")).toBeNull();
    expect(readSyncState({ ...state(), historyId: "" })).toBeNull();
    expect(readSyncState({ ...state(), sinceMs: "x" })).toBeNull();
    expect(readSyncState({ ...state(), count: -1 })).toBeNull();
    expect(readSyncState({ ...state(), count: Number.NaN })).toBeNull();
    expect(readSyncState({ ...state(), at: undefined })).toBeNull();
  });
});

describe("maxAgeFor", () => {
  it("falls back to the shipped valve", () => {
    expect(maxAgeFor(undefined)).toBe(SYNC_MAX_AGE_MS);
    expect(maxAgeFor(Number.NaN)).toBe(SYNC_MAX_AGE_MS);
    expect(maxAgeFor(-1)).toBe(SYNC_MAX_AGE_MS);
  });

  it("honours an explicit override", () => {
    expect(maxAgeFor(0)).toBe(0);
    expect(maxAgeFor(1234)).toBe(1234);
  });
});

describe("planSync", () => {
  it("scans when there is nothing stored yet", () => {
    expect(planSync(null, input())).toEqual({
      action: "scan",
      reason: "cold",
    });
  });

  it("scans when Gmail gave us no historyId to compare", () => {
    expect(planSync(state(), input({ historyId: "" }))).toEqual({
      action: "scan",
      reason: "no-history-id",
    });
  });

  it("scans when the window asked for is not the window we covered", () => {
    expect(planSync(state(), input({ sinceMs: 1_600_000_000_000 }))).toEqual({
      action: "scan",
      reason: "window-moved",
    });
  });

  it("scans once the safety valve age is reached, even if nothing changed", () => {
    expect(
      planSync(state({ at: NOW - SYNC_MAX_AGE_MS }), input())
    ).toEqual({ action: "scan", reason: "max-age" });
    expect(
      planSync(state({ at: NOW - SYNC_MAX_AGE_MS - 1 }), input())
    ).toEqual({ action: "scan", reason: "max-age" });
  });

  it("skips just inside the safety valve", () => {
    expect(
      planSync(state({ at: NOW - SYNC_MAX_AGE_MS + 1 }), input())
    ).toEqual({ action: "skip", reason: "unchanged" });
  });

  it("scans when the stored pass looks like it came from the future", () => {
    expect(planSync(state({ at: NOW + 1 }), input())).toEqual({
      action: "scan",
      reason: "max-age",
    });
  });

  it("scans when the cache now holds fewer ids than the pass we recorded", () => {
    expect(planSync(state({ count: 4 }), input({ cachedCount: 3 }))).toEqual({
      action: "scan",
      reason: "cache-shrunk",
    });
  });

  it("still skips when the cache has grown", () => {
    expect(planSync(state({ count: 2 }), input({ cachedCount: 9 }))).toEqual({
      action: "skip",
      reason: "unchanged",
    });
  });

  it("skips when the mailbox historyId is byte-for-byte the stored one", () => {
    expect(planSync(state(), input())).toEqual({
      action: "skip",
      reason: "unchanged",
    });
  });

  it("probes when the mailbox historyId moved", () => {
    expect(planSync(state(), input({ historyId: "9002" }))).toEqual({
      action: "probe",
      reason: "history-changed",
    });
  });

  it("respects an overridden max age", () => {
    expect(planSync(state(), input({ maxAgeMs: 0 })).action).toBe("scan");
    expect(
      planSync(state(), input({ maxAgeMs: 10 * 60_000 })).action
    ).toBe("skip");
  });
});

describe("probeSaysChanged", () => {
  it("reports no change when history.list came back empty", () => {
    expect(probeSaysChanged({ history: [] })).toBe(false);
    expect(probeSaysChanged({})).toBe(false);
  });

  it("reports no change when records carry no messagesAdded", () => {
    expect(probeSaysChanged({ history: [{ messagesAdded: [] }] })).toBe(false);
    expect(probeSaysChanged({ history: [{}] })).toBe(false);
  });

  it("reports change as soon as one message was added", () => {
    expect(
      probeSaysChanged({ history: [{}, { messagesAdded: [{ id: "m1" }] }] })
    ).toBe(true);
  });

  it("assumes change when there are more pages we did not read", () => {
    expect(probeSaysChanged({ history: [], nextPageToken: "p2" })).toBe(true);
    expect(probeSaysChanged({ history: [], nextPageToken: "  " })).toBe(false);
  });

  it("assumes change when the probe could not be made at all", () => {
    expect(probeSaysChanged(null)).toBe(true);
    expect(probeSaysChanged(undefined)).toBe(true);
    expect(probeSaysChanged("nope" as unknown as HistoryProbeResponse)).toBe(
      true
    );
  });
});

describe("isStaleHistoryId", () => {
  it("recognises the 404 Gmail returns for an expired startHistoryId", () => {
    expect(isStaleHistoryId({ response: { status: 404 } })).toBe(true);
    expect(isStaleHistoryId({ status: 404 })).toBe(true);
    expect(isStaleHistoryId({ code: 404 })).toBe(true);
    expect(isStaleHistoryId({ code: "404" })).toBe(true);
  });

  it("does not swallow anything else", () => {
    expect(isStaleHistoryId({ response: { status: 429 } })).toBe(false);
    expect(isStaleHistoryId({ status: 500 })).toBe(false);
    expect(isStaleHistoryId(new Error("boom"))).toBe(false);
    expect(isStaleHistoryId(null)).toBe(false);
    expect(isStaleHistoryId("404")).toBe(false);
  });
});

describe("decideSync", () => {
  it("skips without spending a probe when the historyId is unchanged", async () => {
    const probe = vi.fn(unchangedProbe);
    await expect(decideSync(state(), input(), probe)).resolves.toEqual({
      scan: false,
      reason: "unchanged",
    });
    expect(probe).not.toHaveBeenCalled();
  });

  it("scans without spending a probe when it is cold", async () => {
    const probe = vi.fn(unchangedProbe);
    await expect(decideSync(null, input(), probe)).resolves.toEqual({
      scan: true,
      reason: "cold",
    });
    expect(probe).not.toHaveBeenCalled();
  });

  it("scans without spending a probe once the safety valve fires", async () => {
    const probe = vi.fn(unchangedProbe);
    await expect(
      decideSync(state({ at: NOW - SYNC_MAX_AGE_MS }), input(), probe)
    ).resolves.toEqual({ scan: true, reason: "max-age" });
    expect(probe).not.toHaveBeenCalled();
  });

  it("skips when the mailbox moved but no message was added", async () => {
    const probe = vi.fn(async () => ({ history: [{ labelsAdded: [{}] }] }));
    await expect(
      decideSync(state(), input({ historyId: "9002" }), probe)
    ).resolves.toEqual({ scan: false, reason: "no-messages-added" });
    expect(probe).toHaveBeenCalledWith("9001");
  });

  it("scans when the probe reports a new message", async () => {
    const probe = vi.fn(async () => ({
      history: [{ messagesAdded: [{ message: { id: "m1" } }] }],
    }));
    await expect(
      decideSync(state(), input({ historyId: "9002" }), probe)
    ).resolves.toEqual({ scan: true, reason: "messages-added" });
  });

  it("falls back to a full scan when the stored historyId has expired", async () => {
    const probe = vi.fn(async () => {
      throw { response: { status: 404 } };
    });
    await expect(
      decideSync(state(), input({ historyId: "9002" }), probe)
    ).resolves.toEqual({ scan: true, reason: "stale-history-id" });
  });

  it("lets a throttling failure through so the breaker can see it", async () => {
    const probe = vi.fn(async () => {
      throw { response: { status: 429 } };
    });
    await expect(
      decideSync(state(), input({ historyId: "9002" }), probe)
    ).rejects.toEqual({ response: { status: 429 } });
  });

  it("scans when the probe could not be afforded", async () => {
    const probe = vi.fn(async () => null);
    await expect(
      decideSync(state(), input({ historyId: "9002" }), probe)
    ).resolves.toEqual({ scan: true, reason: "messages-added" });
  });
});

describe("scanIsComplete", () => {
  const cached = { a: {}, b: {} };

  it("accepts a pass that listed and cached everything", () => {
    expect(
      scanIsComplete({ exhausted: false, capped: false, ids: ["a", "b"], cached })
    ).toBe(true);
  });

  it("rejects a pass that ran out of budget", () => {
    expect(
      scanIsComplete({ exhausted: true, capped: false, ids: ["a"], cached })
    ).toBe(false);
  });

  it("rejects a pass that hit the message cap", () => {
    expect(
      scanIsComplete({ exhausted: false, capped: true, ids: ["a"], cached })
    ).toBe(false);
  });

  it("rejects a pass whose ids did not all survive into the saved cache", () => {
    expect(
      scanIsComplete({
        exhausted: false,
        capped: false,
        ids: ["a", "b", "c"],
        cached,
      })
    ).toBe(false);
  });

  it("accepts an empty window", () => {
    expect(
      scanIsComplete({ exhausted: false, capped: false, ids: [], cached: {} })
    ).toBe(true);
  });
});

describe("nextSyncState", () => {
  it("records what the pass covered", () => {
    expect(nextSyncState("9002", 100, 7, NOW)).toEqual({
      v: SYNC_STATE_VERSION,
      historyId: "9002",
      sinceMs: 100,
      count: 7,
      at: NOW,
    });
  });

  it("refuses to record a pass with no historyId to compare next time", () => {
    expect(nextSyncState("", 100, 7, NOW)).toBeNull();
    expect(nextSyncState("9002", Number.NaN, 7, NOW)).toBeNull();
  });
});

describe("advanceSyncState", () => {
  it("moves the marker forward without touching the coverage record", () => {
    expect(advanceSyncState(state(), "9002")).toEqual(
      state({ historyId: "9002" })
    );
  });

  it("writes nothing when there is nothing to move", () => {
    expect(advanceSyncState(state(), "9001")).toBeNull();
    expect(advanceSyncState(state(), "")).toBeNull();
    expect(advanceSyncState(null, "9002")).toBeNull();
  });
});

describe("syncStateToStore", () => {
  const base = {
    scanned: true,
    skipped: false,
    exhausted: false,
    capped: false,
    ids: ["a"],
    cached: { a: {} },
    historyId: "9002",
    sinceMs: 1_700_000_000_000,
    nowMs: NOW,
    previous: state(),
  };

  it("records a complete scan", () => {
    expect(syncStateToStore(base)).toEqual({
      v: SYNC_STATE_VERSION,
      historyId: "9002",
      sinceMs: 1_700_000_000_000,
      count: 1,
      at: NOW,
    });
  });

  it("records nothing when Gmail was skipped by the breaker", () => {
    expect(syncStateToStore({ ...base, skipped: true })).toBeNull();
  });

  it("records nothing when the scan was cut short by the budget", () => {
    expect(syncStateToStore({ ...base, exhausted: true })).toBeNull();
  });

  it("records nothing when an id did not survive the cache prune", () => {
    expect(syncStateToStore({ ...base, cached: {} })).toBeNull();
  });

  it("only moves the marker forward when the scan was skipped", () => {
    expect(syncStateToStore({ ...base, scanned: false })).toEqual(
      state({ historyId: "9002" })
    );
  });

  it("does not refresh the safety-valve clock on a skipped scan", () => {
    const stored = syncStateToStore({ ...base, scanned: false });
    expect(stored?.at).toBe(state().at);
    expect(stored?.count).toBe(state().count);
  });
});
