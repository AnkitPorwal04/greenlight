import { describe, expect, it, vi, beforeEach } from "vitest";

const getJSON = vi.hoisted(() => vi.fn());
const setJSON = vi.hoisted(() => vi.fn());

vi.mock("./storage", () => ({ getJSON, setJSON }));

import {
  DEFAULT_COOLDOWN_MS,
  HARD_LIMIT_COOLDOWN_MS,
  MAX_COOLDOWN_MS,
  breakerKey,
  cooldownFor,
  isGmailRateLimit,
  isOpen,
  noteGmailFailure,
  parseRetryAfter,
  readBreaker,
  readGmailLimit,
  stateFrom,
  tripBreaker,
} from "./gmail-breaker";

function gaxios(
  status: number,
  reason?: string,
  headers?: Record<string, string>
) {
  return {
    response: {
      status,
      headers: headers ?? {},
      data: reason ? { error: { errors: [{ reason }] } } : undefined,
    },
  };
}

beforeEach(() => {
  getJSON.mockReset();
  setJSON.mockReset();
  getJSON.mockResolvedValue(null);
  setJSON.mockResolvedValue(undefined);
});

describe("readGmailLimit", () => {
  it("detects a plain 429", () => {
    expect(readGmailLimit(gaxios(429))).toMatchObject({ kind: "rate" });
  });

  it("detects 403 rateLimitExceeded", () => {
    expect(readGmailLimit(gaxios(403, "rateLimitExceeded"))).toMatchObject({
      kind: "rate",
      reason: "rateLimitExceeded",
    });
  });

  it("detects 403 userRateLimitExceeded", () => {
    expect(readGmailLimit(gaxios(403, "userRateLimitExceeded"))).toMatchObject({
      kind: "rate",
      reason: "userRateLimitExceeded",
    });
  });

  it("treats dailyLimitExceeded as a hard limit, not a retryable one", () => {
    const limit = readGmailLimit(gaxios(403, "dailyLimitExceeded"));
    expect(limit).toMatchObject({ kind: "hard" });
    expect(isGmailRateLimit(gaxios(403, "dailyLimitExceeded"))).toBe(false);
  });

  it("ignores a 403 that is not about rate at all", () => {
    expect(readGmailLimit(gaxios(403, "insufficientPermissions"))).toBeNull();
    expect(readGmailLimit(gaxios(403))).toBeNull();
  });

  it("ignores unrelated failures", () => {
    expect(readGmailLimit(gaxios(500))).toBeNull();
    expect(readGmailLimit(gaxios(404))).toBeNull();
    expect(readGmailLimit(null)).toBeNull();
    expect(readGmailLimit(undefined)).toBeNull();
    expect(readGmailLimit(new Error("boom"))).toBeNull();
    expect(readGmailLimit("nope")).toBeNull();
  });

  it("reads a bare status when there is no response envelope", () => {
    expect(readGmailLimit({ status: 429 })).toMatchObject({ kind: "rate" });
  });

  it("says a 429 carrying a daily reason is still a hard limit", () => {
    expect(readGmailLimit(gaxios(429, "dailyLimitExceeded"))).toMatchObject({
      kind: "hard",
    });
  });

  it("classifies the rate-limit family for isGmailRateLimit", () => {
    expect(isGmailRateLimit(gaxios(429))).toBe(true);
    expect(isGmailRateLimit(gaxios(403, "userRateLimitExceeded"))).toBe(true);
    expect(isGmailRateLimit(gaxios(403, "rateLimitExceeded"))).toBe(true);
    expect(isGmailRateLimit(gaxios(403, "insufficientPermissions"))).toBe(false);
    expect(isGmailRateLimit(gaxios(500))).toBe(false);
  });
});

describe("parseRetryAfter", () => {
  it("reads integer seconds", () => {
    expect(parseRetryAfter("30", 0)).toBe(30_000);
    expect(parseRetryAfter("0", 0)).toBe(0);
  });

  it("reads an HTTP-date", () => {
    const now = Date.parse("2026-05-01T10:00:00Z");
    expect(parseRetryAfter("Fri, 01 May 2026 10:00:45 GMT", now)).toBe(45_000);
  });

  it("clamps a date already in the past to zero", () => {
    const now = Date.parse("2026-05-01T10:01:00Z");
    expect(parseRetryAfter("Fri, 01 May 2026 10:00:00 GMT", now)).toBe(0);
  });

  it("caps an absurd value", () => {
    expect(parseRetryAfter("999999", 0)).toBe(MAX_COOLDOWN_MS);
  });

  it("returns null for junk or absence", () => {
    expect(parseRetryAfter(null, 0)).toBeNull();
    expect(parseRetryAfter(undefined, 0)).toBeNull();
    expect(parseRetryAfter("", 0)).toBeNull();
    expect(parseRetryAfter("soon", 0)).toBeNull();
  });

  it("is picked up from plain header bags and from Headers", () => {
    expect(
      readGmailLimit(gaxios(429, undefined, { "Retry-After": "12" }), 0)
        ?.retryAfterMs
    ).toBe(12_000);

    const err = {
      response: { status: 429, headers: new Headers({ "retry-after": "7" }) },
    };
    expect(readGmailLimit(err, 0)?.retryAfterMs).toBe(7_000);
  });
});

describe("cooldownFor", () => {
  it("honours Retry-After when Gmail sends one", () => {
    expect(
      cooldownFor({ kind: "rate", reason: "r", retryAfterMs: 15_000 })
    ).toBe(15_000);
  });

  it("falls back to a minute for a soft rate limit", () => {
    expect(cooldownFor({ kind: "rate", reason: "r", retryAfterMs: null })).toBe(
      DEFAULT_COOLDOWN_MS
    );
  });

  it("waits much longer for a hard daily limit backoff cannot fix", () => {
    expect(cooldownFor({ kind: "hard", reason: "d", retryAfterMs: null })).toBe(
      HARD_LIMIT_COOLDOWN_MS
    );
    expect(HARD_LIMIT_COOLDOWN_MS).toBeGreaterThan(DEFAULT_COOLDOWN_MS);
  });
});

describe("breaker state", () => {
  it("is open until retryAt passes", () => {
    const state = stateFrom(
      { kind: "rate", reason: "userRateLimitExceeded", retryAfterMs: null },
      1000
    );
    expect(state.retryAt).toBe(1000 + DEFAULT_COOLDOWN_MS);
    expect(state.detectedAt).toBe(1000);
    expect(state.reason).toBe("userRateLimitExceeded");

    expect(isOpen(state, 1000)).toBe(true);
    expect(isOpen(state, state.retryAt - 1)).toBe(true);
    expect(isOpen(state, state.retryAt)).toBe(false);
    expect(isOpen(state, state.retryAt + 1)).toBe(false);
  });

  it("is closed when there is nothing stored", () => {
    expect(isOpen(null, 0)).toBe(false);
    expect(isOpen({} as never, 0)).toBe(false);
  });

  it("keys per user so one manager does not silence the other", () => {
    expect(breakerKey("A@x.com")).toBe("gbrk:a@x.com");
    expect(breakerKey("a@x.com")).not.toBe(breakerKey("b@x.com"));
  });
});

describe("persistence", () => {
  it("stores the trip with a TTL that matches the cooldown", async () => {
    await tripBreaker(
      "m@x.com",
      { kind: "rate", reason: "rateLimitExceeded", retryAfterMs: 30_000 },
      1000
    );
    expect(setJSON).toHaveBeenCalledWith(
      "gbrk:m@x.com",
      expect.objectContaining({ retryAt: 31_000, reason: "rateLimitExceeded" }),
      30
    );
  });

  it("opens the breaker from a real Gmail rate-limit error", async () => {
    const state = await noteGmailFailure(
      "m@x.com",
      gaxios(403, "userRateLimitExceeded"),
      0
    );
    expect(state).toMatchObject({ kind: "rate" });
    expect(setJSON).toHaveBeenCalled();
  });

  it("does not open the breaker for an unrelated error", async () => {
    expect(await noteGmailFailure("m@x.com", gaxios(500), 0)).toBeNull();
    expect(await noteGmailFailure("m@x.com", new Error("boom"), 0)).toBeNull();
    expect(setJSON).not.toHaveBeenCalled();
  });

  it("reads back an open breaker", async () => {
    getJSON.mockResolvedValue({
      retryAt: 60_000,
      detectedAt: 0,
      reason: "rateLimitExceeded",
      kind: "rate",
    });
    expect(await readBreaker("m@x.com", 0)).toMatchObject({ retryAt: 60_000 });
  });

  it("ignores a breaker whose cooldown has elapsed", async () => {
    getJSON.mockResolvedValue({
      retryAt: 60_000,
      detectedAt: 0,
      reason: "rateLimitExceeded",
      kind: "rate",
    });
    expect(await readBreaker("m@x.com", 60_001)).toBeNull();
  });

  it("treats a storage outage as a closed breaker rather than a hang", async () => {
    getJSON.mockRejectedValue(new Error("redis down"));
    expect(await readBreaker("m@x.com", 0)).toBeNull();
  });

  it("survives a storage outage while tripping", async () => {
    setJSON.mockRejectedValue(new Error("redis down"));
    const state = await tripBreaker(
      "m@x.com",
      { kind: "rate", reason: "r", retryAfterMs: null },
      0
    );
    expect(state.retryAt).toBe(DEFAULT_COOLDOWN_MS);
  });
});
