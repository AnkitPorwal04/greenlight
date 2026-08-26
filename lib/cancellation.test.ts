import { describe, it, expect } from "vitest";
import {
  cancelledLeaveKeys,
  isEffectiveCancellation,
  isLeaveCancelled,
  type CancellableRow,
} from "./cancellation";

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

describe("cancelledLeaveKeys / isLeaveCancelled", () => {
  it("matches a leave to its approved cancellation by employee + dates", () => {
    const keys = cancelledLeaveKeys([cancellation()]);
    expect(isLeaveCancelled(leave, keys)).toBe(true);
  });

  it("does not suppress the leave while the cancellation is still pending", () => {
    const keys = cancelledLeaveKeys([cancellation({ status: "pending" })]);
    expect(isLeaveCancelled(leave, keys)).toBe(false);
  });

  it("does not suppress the leave when the cancellation was rejected", () => {
    const keys = cancelledLeaveKeys([cancellation({ status: "rejected" })]);
    expect(isLeaveCancelled(leave, keys)).toBe(false);
  });

  it("ignores leave type when matching (same person + span is the same leave)", () => {
    const keys = cancelledLeaveKeys([cancellation()]);
    expect(isLeaveCancelled({ ...leave }, keys)).toBe(true);
  });

  it("does not suppress a different employee's leave on the same dates", () => {
    const keys = cancelledLeaveKeys([cancellation()]);
    expect(isLeaveCancelled({ ...leave, employeeCode: "GRP9999" }, keys)).toBe(false);
  });

  it("does not suppress a leave on different dates", () => {
    const keys = cancelledLeaveKeys([cancellation()]);
    expect(isLeaveCancelled({ ...leave, toDate: "27 Aug 2026" }, keys)).toBe(false);
  });

  it("normalizes the employee code case when matching", () => {
    const keys = cancelledLeaveKeys([cancellation({ employeeCode: "grp0761" })]);
    expect(isLeaveCancelled(leave, keys)).toBe(true);
  });

  it("returns no keys when there are no effective cancellations", () => {
    expect(cancelledLeaveKeys([{ ...leave, status: "approved", kind: "leave" }]).size).toBe(0);
  });
});
