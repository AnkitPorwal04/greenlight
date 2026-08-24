import { describe, it, expect, beforeEach, vi } from "vitest";

const store = new Map<string, unknown>();
let failStorage = false;

vi.mock("./storage", () => ({
  getJSON: vi.fn(async (key: string) => {
    if (failStorage) throw new Error("redis is down");
    return store.get(key) ?? null;
  }),
  setJSON: vi.fn(async (key: string, value: unknown) => {
    if (failStorage) throw new Error("redis is down");
    store.set(key, value);
  }),
}));

const { checkRateLimit, clientIp, rateLimitKey, PASSCODE_ATTEMPTS, REFETCH } =
  await import("./rate-limit");

const RULE = { limit: 3, windowMs: 1000 };

beforeEach(() => {
  store.clear();
  failStorage = false;
});

describe("checkRateLimit", () => {
  it("allows requests under the limit", async () => {
    const first = await checkRateLimit("test", "ip", RULE, 0);
    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(2);

    expect((await checkRateLimit("test", "ip", RULE, 10)).allowed).toBe(true);
    const third = await checkRateLimit("test", "ip", RULE, 20);
    expect(third.allowed).toBe(true);
    expect(third.remaining).toBe(0);
  });

  it("blocks once the limit is used up", async () => {
    for (let i = 0; i < RULE.limit; i += 1) {
      expect((await checkRateLimit("test", "ip", RULE, i)).allowed).toBe(true);
    }
    const blocked = await checkRateLimit("test", "ip", RULE, 100);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBe(1);
  });

  it("keeps blocking without extending the window", async () => {
    for (let i = 0; i < RULE.limit; i += 1) {
      await checkRateLimit("test", "ip", RULE, 0);
    }
    expect((await checkRateLimit("test", "ip", RULE, 100)).allowed).toBe(false);
    expect((await checkRateLimit("test", "ip", RULE, 900)).allowed).toBe(false);
    expect((await checkRateLimit("test", "ip", RULE, 1000)).allowed).toBe(true);
  });

  it("resets when the window expires", async () => {
    for (let i = 0; i < RULE.limit; i += 1) {
      await checkRateLimit("test", "ip", RULE, 0);
    }
    expect((await checkRateLimit("test", "ip", RULE, 999)).allowed).toBe(false);

    const afterExpiry = await checkRateLimit("test", "ip", RULE, 1001);
    expect(afterExpiry.allowed).toBe(true);
    expect(afterExpiry.remaining).toBe(2);
  });

  it("counts each id separately", async () => {
    for (let i = 0; i < RULE.limit; i += 1) {
      await checkRateLimit("test", "a", RULE, 0);
    }
    expect((await checkRateLimit("test", "a", RULE, 0)).allowed).toBe(false);
    expect((await checkRateLimit("test", "b", RULE, 0)).allowed).toBe(true);
  });

  it("counts each bucket separately", async () => {
    for (let i = 0; i < RULE.limit; i += 1) {
      await checkRateLimit("one", "ip", RULE, 0);
    }
    expect((await checkRateLimit("one", "ip", RULE, 0)).allowed).toBe(false);
    expect((await checkRateLimit("two", "ip", RULE, 0)).allowed).toBe(true);
  });

  it("fails open when storage is unavailable", async () => {
    failStorage = true;
    for (let i = 0; i < RULE.limit + 5; i += 1) {
      const result = await checkRateLimit("test", "ip", RULE, i);
      expect(result.allowed).toBe(true);
    }
  });

  it("ignores a corrupt stored window", async () => {
    store.set(rateLimitKey("test", "ip"), { nonsense: true });
    const result = await checkRateLimit("test", "ip", RULE, 500);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
  });
});

describe("rateLimitKey", () => {
  it("namespaces by bucket and id", () => {
    expect(rateLimitKey("passcode", "1.2.3.4")).toBe("rl:passcode:1.2.3.4");
  });
});

describe("clientIp", () => {
  const req = (value: string | null) => ({
    headers: { get: (name: string) => (name === "x-forwarded-for" ? value : null) },
  });

  it("takes the first forwarded address", () => {
    expect(clientIp(req("1.2.3.4, 5.6.7.8"))).toBe("1.2.3.4");
    expect(clientIp(req("  1.2.3.4  "))).toBe("1.2.3.4");
  });

  it("falls back to unknown", () => {
    expect(clientIp(req(null))).toBe("unknown");
    expect(clientIp(req(""))).toBe("unknown");
    expect(clientIp(req(" , 5.6.7.8"))).toBe("unknown");
  });
});

describe("configured rules", () => {
  it("allows ten passcode attempts per quarter hour", () => {
    expect(PASSCODE_ATTEMPTS).toEqual({ limit: 10, windowMs: 15 * 60 * 1000 });
  });

  it("leaves room for bursts of dashboard refetches", () => {
    expect(REFETCH.limit).toBeGreaterThanOrEqual(10);
    expect(REFETCH.windowMs).toBeLessThanOrEqual(10 * 1000);
  });
});
