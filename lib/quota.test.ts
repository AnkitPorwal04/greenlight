import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const incrBy = vi.hoisted(() => vi.fn());

vi.mock("./storage", () => ({ incrBy }));

import {
  GMAIL_BUDGET_UNITS,
  GMAIL_UNIT_COST,
  QUOTA_WINDOW_MS,
  budgetUnits,
  createLedger,
  quotaKey,
  quotaWindow,
  reserveUnits,
  unitsFor,
  windowResetAt,
} from "./quota";

let seq = 0;
function freshEmail(): string {
  seq += 1;
  return `m${seq}@example.com`;
}

function backedByCounter() {
  const counters = new Map<string, number>();
  incrBy.mockImplementation(async (key: string, amount: number) => {
    const next = (counters.get(key) ?? 0) + amount;
    counters.set(key, next);
    return next;
  });
  return counters;
}

beforeEach(() => {
  incrBy.mockReset();
  backedByCounter();
});

afterEach(() => {
  delete process.env.GMAIL_UNITS_PER_MINUTE;
});

describe("cost table", () => {
  it("prices the methods at the May 2026 rates", () => {
    expect(GMAIL_UNIT_COST["messages.get"]).toBe(20);
    expect(GMAIL_UNIT_COST["threads.get"]).toBe(40);
    expect(GMAIL_UNIT_COST["messages.list"]).toBe(5);
    expect(GMAIL_UNIT_COST["threads.list"]).toBe(10);
    expect(GMAIL_UNIT_COST["messages.send"]).toBe(100);
    expect(GMAIL_UNIT_COST["history.list"]).toBe(2);
    expect(GMAIL_UNIT_COST.getProfile).toBe(1);
    expect(GMAIL_UNIT_COST["settings.sendAs.list"]).toBe(1);
  });

  it("multiplies by the number of calls in the batch", () => {
    expect(unitsFor("messages.get", 25)).toBe(500);
    expect(unitsFor("threads.get", 25)).toBe(1000);
    expect(unitsFor("messages.get")).toBe(20);
  });

  it("treats a non-positive batch as free", () => {
    expect(unitsFor("messages.get", 0)).toBe(0);
    expect(unitsFor("messages.get", -3)).toBe(0);
  });
});

describe("budgetUnits", () => {
  it("defaults below Google's real 6000 to leave headroom", () => {
    expect(budgetUnits({})).toBe(GMAIL_BUDGET_UNITS);
    expect(GMAIL_BUDGET_UNITS).toBe(5200);
    expect(GMAIL_BUDGET_UNITS).toBeLessThan(6000);
  });

  it("honours GMAIL_UNITS_PER_MINUTE", () => {
    expect(budgetUnits({ GMAIL_UNITS_PER_MINUTE: "900" })).toBe(900);
  });

  it("falls back to the default for junk values", () => {
    expect(budgetUnits({ GMAIL_UNITS_PER_MINUTE: "" })).toBe(GMAIL_BUDGET_UNITS);
    expect(budgetUnits({ GMAIL_UNITS_PER_MINUTE: "nope" })).toBe(
      GMAIL_BUDGET_UNITS
    );
    expect(budgetUnits({ GMAIL_UNITS_PER_MINUTE: "-5" })).toBe(
      GMAIL_BUDGET_UNITS
    );
    expect(budgetUnits({ GMAIL_UNITS_PER_MINUTE: "0" })).toBe(
      GMAIL_BUDGET_UNITS
    );
  });
});

describe("window keying", () => {
  it("keys on the wall-clock minute and the account", () => {
    expect(quotaKey("Manager@Example.com", 120_000)).toBe(
      "gq:manager@example.com:2"
    );
  });

  it("gives the two managers independent buckets", () => {
    expect(quotaKey("a@x.com", 60_000)).not.toBe(quotaKey("b@x.com", 60_000));
  });

  it("rolls to a new key when the minute ticks over", () => {
    expect(quotaWindow(59_999)).toBe(0);
    expect(quotaWindow(60_000)).toBe(1);
    expect(quotaKey("a@x.com", 59_999)).not.toBe(quotaKey("a@x.com", 60_000));
  });

  it("resets at the end of the current minute", () => {
    expect(windowResetAt(60_001)).toBe(120_000);
    expect(windowResetAt(0)).toBe(QUOTA_WINDOW_MS);
  });
});

describe("reserveUnits", () => {
  it("allows spend inside the budget and reports what is left", async () => {
    const email = freshEmail();
    const res = await reserveUnits(email, 200, 0);
    expect(res.allowed).toBe(true);
    expect(res.remaining).toBe(GMAIL_BUDGET_UNITS - 200);
    expect(res.degraded).toBe(false);
    expect(res.resetAtMs).toBe(QUOTA_WINDOW_MS);
  });

  it("refuses the batch that would cross the budget", async () => {
    process.env.GMAIL_UNITS_PER_MINUTE = "1000";
    const email = freshEmail();
    expect((await reserveUnits(email, 600, 0)).allowed).toBe(true);
    const refused = await reserveUnits(email, 600, 0);
    expect(refused.allowed).toBe(false);
    expect(refused.remaining).toBe(400);
  });

  it("refunds a refused batch so a smaller one still fits", async () => {
    process.env.GMAIL_UNITS_PER_MINUTE = "1000";
    const email = freshEmail();
    await reserveUnits(email, 600, 0);
    expect((await reserveUnits(email, 600, 0)).allowed).toBe(false);
    expect((await reserveUnits(email, 400, 0)).allowed).toBe(true);
  });

  it("accumulates across concurrent callers rather than under-counting", async () => {
    process.env.GMAIL_UNITS_PER_MINUTE = "1000";
    const email = freshEmail();
    const results = await Promise.all([
      reserveUnits(email, 500, 0),
      reserveUnits(email, 500, 0),
      reserveUnits(email, 500, 0),
    ]);
    expect(results.filter((r) => r.allowed)).toHaveLength(2);
  });

  it("starts fresh in the next minute", async () => {
    process.env.GMAIL_UNITS_PER_MINUTE = "1000";
    const email = freshEmail();
    await reserveUnits(email, 1000, 0);
    expect((await reserveUnits(email, 900, 0)).allowed).toBe(false);
    expect((await reserveUnits(email, 900, 60_000)).allowed).toBe(true);
  });

  it("charges each account separately", async () => {
    process.env.GMAIL_UNITS_PER_MINUTE = "1000";
    const a = freshEmail();
    const b = freshEmail();
    await reserveUnits(a, 1000, 0);
    expect((await reserveUnits(a, 100, 0)).allowed).toBe(false);
    expect((await reserveUnits(b, 1000, 0)).allowed).toBe(true);
  });

  it("passes a TTL that expires with the minute", async () => {
    await reserveUnits(freshEmail(), 20, 30_000);
    expect(incrBy).toHaveBeenCalledWith(expect.any(String), 20, 30);
  });

  it("does not charge for an empty batch", async () => {
    const res = await reserveUnits(freshEmail(), 0, 0);
    expect(res.allowed).toBe(true);
    expect(incrBy).not.toHaveBeenCalled();
  });
});

describe("reserveUnits when storage is down", () => {
  it("still enforces the budget from the in-process counter", async () => {
    process.env.GMAIL_UNITS_PER_MINUTE = "1000";
    incrBy.mockRejectedValue(new Error("redis unreachable"));
    const email = freshEmail();

    const first = await reserveUnits(email, 600, 0);
    expect(first.allowed).toBe(true);
    expect(first.degraded).toBe(true);

    const second = await reserveUnits(email, 600, 0);
    expect(second.allowed).toBe(false);
    expect(second.degraded).toBe(true);
  });

  it("does not hand out unlimited spend while storage is down", async () => {
    process.env.GMAIL_UNITS_PER_MINUTE = "1000";
    incrBy.mockRejectedValue(new Error("redis unreachable"));
    const email = freshEmail();

    let allowed = 0;
    for (let i = 0; i < 50; i += 1) {
      if ((await reserveUnits(email, 100, 0)).allowed) allowed += 1;
    }
    expect(allowed).toBe(10);
  });

  it("recovers in the next minute so nobody is locked out", async () => {
    process.env.GMAIL_UNITS_PER_MINUTE = "1000";
    incrBy.mockRejectedValue(new Error("redis unreachable"));
    const email = freshEmail();
    await reserveUnits(email, 1000, 0);
    expect((await reserveUnits(email, 900, 0)).allowed).toBe(false);
    expect((await reserveUnits(email, 900, 60_000)).allowed).toBe(true);
  });

  it("keeps the shadow counter in step so a later outage is still bounded", async () => {
    process.env.GMAIL_UNITS_PER_MINUTE = "1000";
    const email = freshEmail();
    expect((await reserveUnits(email, 900, 0)).allowed).toBe(true);

    incrBy.mockRejectedValue(new Error("redis unreachable"));
    const afterOutage = await reserveUnits(email, 900, 0);
    expect(afterOutage.allowed).toBe(false);
    expect(afterOutage.degraded).toBe(true);
  });
});

describe("createLedger", () => {
  it("lets a route ask whether it can afford the next batch", async () => {
    const ledger = createLedger(freshEmail(), () => 0);
    expect(await ledger.afford("messages.get", 25)).toBe(true);
    expect(ledger.spent).toBe(500);
    expect(ledger.exhausted).toBe(false);
  });

  it("stops cleanly once the budget is gone and stays stopped", async () => {
    process.env.GMAIL_UNITS_PER_MINUTE = "500";
    const ledger = createLedger(freshEmail(), () => 0);

    expect(await ledger.afford("threads.get", 25)).toBe(false);
    expect(ledger.exhausted).toBe(true);
    expect(ledger.spent).toBe(0);

    const callsWhenExhausted = incrBy.mock.calls.length;
    expect(await ledger.afford("getProfile", 1)).toBe(false);
    expect(incrBy.mock.calls.length).toBe(callsWhenExhausted);
  });

  it("spends down a real cold budget batch by batch", async () => {
    const ledger = createLedger(freshEmail(), () => 0);
    let batches = 0;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if (!(await ledger.afford("messages.get", 40))) break;
      batches += 1;
    }
    expect(batches).toBe(6);
    expect(ledger.spent).toBe(4800);
    expect(ledger.exhausted).toBe(true);
  });

  it("reports the degraded flag through to the route", async () => {
    incrBy.mockRejectedValue(new Error("redis unreachable"));
    const ledger = createLedger(freshEmail(), () => 0);
    expect(await ledger.afford("messages.get", 1)).toBe(true);
    expect(ledger.degraded).toBe(true);
  });

  it("charges an unavoidable call without ever refusing it", async () => {
    process.env.GMAIL_UNITS_PER_MINUTE = "500";
    const ledger = createLedger(freshEmail(), () => 0);

    expect(await ledger.afford("threads.get", 25)).toBe(false);
    expect(ledger.exhausted).toBe(true);

    await ledger.charge("getProfile");
    expect(ledger.spent).toBe(1);
  });

  it("counts a charged call against the same window budget", async () => {
    process.env.GMAIL_UNITS_PER_MINUTE = "1000";
    const email = freshEmail();
    const ledger = createLedger(email, () => 0);

    await ledger.charge("messages.send");
    expect(ledger.spent).toBe(100);
    expect((await reserveUnits(email, 901, 0)).allowed).toBe(false);
  });

  it("exposes when the window resets", async () => {
    const ledger = createLedger(freshEmail(), () => 90_000);
    await ledger.afford("getProfile");
    expect(ledger.resetAtMs).toBe(120_000);
  });

  it("treats a zero-sized batch as free without touching storage", async () => {
    const ledger = createLedger(freshEmail(), () => 0);
    expect(await ledger.afford("messages.get", 0)).toBe(true);
    expect(incrBy).not.toHaveBeenCalled();
  });
});
