import { describe, it, expect } from "vitest";
import {
  cancelledLeaveTimes,
  isEffectiveCancellation,
  isLeaveCancelled,
  type CancellableRow,
  type DatedRow,
} from "./cancellation";

const APPLIED_AT = "2026-08-10T09:00:00.000Z";
const CANCELLED_AT = "2026-08-12T09:00:00.000Z";
const REAPPLIED_AT = "2026-08-13T09:00:00.000Z";

const leave = {
  employeeCode: "GRP0761",
  fromDate: "22 Aug 2026",
  toDate: "26 Aug 2026",
};

function cancellation(over: Partial<CancellableRow> = {}): CancellableRow {
  return {
    employeeCode: "GRP0761",
    fromDate: "22 Aug 2026",
    toDate: "26 Aug 2026",
    status: "approved",
    kind: "cancellation",
    ...over,
  };
}

function request(over: Partial<DatedRow> = {}): DatedRow {
  return { ...leave, ...over };
}

describe("isEffectiveCancellation", () => {
  it("is true for an approved or handled cancellation", () => {
    expect(isEffectiveCancellation({ kind: "cancellation", status: "approved" })).toBe(true);
    expect(isEffectiveCancellation({ kind: "cancellation", status: "handled" })).toBe(true);
  });
  it("is false while the cancellation is pending or rejected", () => {
    expect(isEffectiveCancellation({ kind: "cancellation", status: "pending" })).toBe(false);
    expect(isEffectiveCancellation({ kind: "cancellation", status: "rejected" })).toBe(false);
  });
  it("is false for a normal leave regardless of status", () => {
    expect(isEffectiveCancellation({ kind: "leave", status: "approved" })).toBe(false);
  });
});

describe("cancelledLeaveTimes / isLeaveCancelled", () => {
  it("matches a leave to its approved cancellation by employee + dates", () => {
    const keys = cancelledLeaveTimes([cancellation()]);
    expect(isLeaveCancelled(leave, keys)).toBe(true);
  });

  it("does not suppress the leave while the cancellation is still pending", () => {
    const keys = cancelledLeaveTimes([cancellation({ status: "pending" })]);
    expect(isLeaveCancelled(leave, keys)).toBe(false);
  });

  it("does not suppress the leave when the cancellation was rejected", () => {
    const keys = cancelledLeaveTimes([cancellation({ status: "rejected" })]);
    expect(isLeaveCancelled(leave, keys)).toBe(false);
  });

  it("does not suppress the leave when the cancellation was withdrawn", () => {
    const keys = cancelledLeaveTimes([cancellation({ status: "withdrawn" })]);
    expect(isLeaveCancelled(leave, keys)).toBe(false);
  });

  it("ignores leave type when matching (same person + span is the same leave)", () => {
    const keys = cancelledLeaveTimes([cancellation()]);
    expect(isLeaveCancelled({ ...leave }, keys)).toBe(true);
  });

  it("does not suppress a different employee's leave on the same dates", () => {
    const keys = cancelledLeaveTimes([cancellation()]);
    expect(isLeaveCancelled({ ...leave, employeeCode: "GRP9999" }, keys)).toBe(false);
  });

  it("does not suppress a leave on different dates", () => {
    const keys = cancelledLeaveTimes([cancellation()]);
    expect(isLeaveCancelled({ ...leave, toDate: "27 Aug 2026" }, keys)).toBe(false);
  });

  it("normalizes the employee code case when matching", () => {
    const keys = cancelledLeaveTimes([cancellation({ employeeCode: "grp0761" })]);
    expect(isLeaveCancelled(leave, keys)).toBe(true);
  });

  it("returns no keys when there are no effective cancellations", () => {
    expect(cancelledLeaveTimes([{ ...leave, status: "approved", kind: "leave" }]).size).toBe(0);
  });
});

describe("isLeaveCancelled ordering in time", () => {
  it("keeps a request re-applied for the same span after the cancellation", () => {
    const keys = cancelledLeaveTimes([
      cancellation({ receivedAt: CANCELLED_AT }),
    ]);
    expect(isLeaveCancelled(request({ receivedAt: REAPPLIED_AT }), keys)).toBe(false);
  });

  it("still suppresses the earlier leave the cancellation actually cancels", () => {
    const keys = cancelledLeaveTimes([
      cancellation({ receivedAt: CANCELLED_AT }),
    ]);
    expect(isLeaveCancelled(request({ receivedAt: APPLIED_AT }), keys)).toBe(true);
  });

  it("suppresses the original leave but keeps the re-application together", () => {
    const keys = cancelledLeaveTimes([
      cancellation({ receivedAt: CANCELLED_AT }),
    ]);
    const applied = request({ receivedAt: APPLIED_AT });
    const reapplied = request({ receivedAt: REAPPLIED_AT });
    expect([applied, reapplied].filter((r) => !isLeaveCancelled(r, keys))).toEqual([
      reapplied,
    ]);
  });

  it("suppresses a leave arriving at the very same moment as the cancellation", () => {
    const keys = cancelledLeaveTimes([
      cancellation({ receivedAt: CANCELLED_AT }),
    ]);
    expect(isLeaveCancelled(request({ receivedAt: CANCELLED_AT }), keys)).toBe(true);
  });

  it("suppresses a leave arriving a millisecond before the cancellation", () => {
    const keys = cancelledLeaveTimes([cancellation({ receivedAt: 1000 })]);
    expect(isLeaveCancelled(request({ receivedAt: 999 }), keys)).toBe(true);
  });

  it("keeps a leave arriving a millisecond after the cancellation", () => {
    const keys = cancelledLeaveTimes([cancellation({ receivedAt: 1000 })]);
    expect(isLeaveCancelled(request({ receivedAt: 1001 }), keys)).toBe(false);
  });

  it("reads epoch milliseconds and ISO strings as the same instant", () => {
    const keys = cancelledLeaveTimes([
      cancellation({ receivedAt: Date.parse(CANCELLED_AT) }),
    ]);
    expect(isLeaveCancelled(request({ receivedAt: APPLIED_AT }), keys)).toBe(true);
    expect(isLeaveCancelled(request({ receivedAt: REAPPLIED_AT }), keys)).toBe(false);
  });
});

describe("isLeaveCancelled with unusable timestamps", () => {
  it("suppresses a leave with no received time at all", () => {
    const keys = cancelledLeaveTimes([
      cancellation({ receivedAt: CANCELLED_AT }),
    ]);
    expect(isLeaveCancelled(request(), keys)).toBe(true);
  });

  it("suppresses a leave whose received time cannot be parsed", () => {
    const keys = cancelledLeaveTimes([
      cancellation({ receivedAt: CANCELLED_AT }),
    ]);
    expect(isLeaveCancelled(request({ receivedAt: "last tuesday" }), keys)).toBe(true);
    expect(isLeaveCancelled(request({ receivedAt: "" }), keys)).toBe(true);
    expect(isLeaveCancelled(request({ receivedAt: Number.NaN }), keys)).toBe(true);
  });

  it("lets a cancellation with no received time cover the whole span", () => {
    const keys = cancelledLeaveTimes([cancellation()]);
    expect(isLeaveCancelled(request({ receivedAt: APPLIED_AT }), keys)).toBe(true);
    expect(isLeaveCancelled(request({ receivedAt: REAPPLIED_AT }), keys)).toBe(true);
  });

  it("lets a cancellation with an unparseable received time cover the whole span", () => {
    const keys = cancelledLeaveTimes([cancellation({ receivedAt: "someday" })]);
    expect(isLeaveCancelled(request({ receivedAt: REAPPLIED_AT }), keys)).toBe(true);
  });
});

describe("cancelledLeaveTimes with several cancellations", () => {
  it("lets the latest cancellation for a span define the window", () => {
    const keys = cancelledLeaveTimes([
      cancellation({ receivedAt: APPLIED_AT }),
      cancellation({ receivedAt: REAPPLIED_AT }),
    ]);
    expect(keys.get("GRP0761|2026-08-22|2026-08-26")).toBe(Date.parse(REAPPLIED_AT));
    expect(isLeaveCancelled(request({ receivedAt: CANCELLED_AT }), keys)).toBe(true);
  });

  it("takes the latest cancellation whatever order they arrive in", () => {
    const keys = cancelledLeaveTimes([
      cancellation({ receivedAt: REAPPLIED_AT }),
      cancellation({ receivedAt: APPLIED_AT }),
    ]);
    expect(isLeaveCancelled(request({ receivedAt: CANCELLED_AT }), keys)).toBe(true);
  });

  it("ignores a pending cancellation when picking the latest", () => {
    const keys = cancelledLeaveTimes([
      cancellation({ receivedAt: APPLIED_AT }),
      cancellation({ receivedAt: REAPPLIED_AT, status: "pending" }),
    ]);
    expect(isLeaveCancelled(request({ receivedAt: CANCELLED_AT }), keys)).toBe(false);
  });

  it("keeps each employee's span on its own clock", () => {
    const keys = cancelledLeaveTimes([
      cancellation({ receivedAt: APPLIED_AT }),
      cancellation({ employeeCode: "GRP9999", receivedAt: REAPPLIED_AT }),
    ]);
    expect(isLeaveCancelled(request({ receivedAt: CANCELLED_AT }), keys)).toBe(false);
    expect(
      isLeaveCancelled(
        request({ employeeCode: "GRP9999", receivedAt: CANCELLED_AT }),
        keys
      )
    ).toBe(true);
  });
});
