import { describe, it, expect } from "vitest";
import { dedupeLeaves, type DedupableRow } from "./dedupe";

function row(over: Partial<DedupableRow> = {}): DedupableRow {
  return {
    id: "m1",
    employeeCode: "GRP0761",
    fromDate: "22 Aug 2026",
    toDate: "26 Aug 2026",
    status: "pending",
    receivedAt: "2026-08-20T09:00:00.000Z",
    ...over,
  };
}

function ids(rows: DedupableRow[]): string[] {
  return rows.map((r) => r.id);
}

describe("dedupeLeaves", () => {
  it("keeps a single row untouched", () => {
    const rows = [row()];
    expect(dedupeLeaves(rows)).toEqual(rows);
  });

  it("keeps only the newest of two identical applications", () => {
    const older = row({ id: "a", receivedAt: "2026-08-20T09:00:00.000Z" });
    const newer = row({ id: "b", receivedAt: "2026-08-21T09:00:00.000Z" });
    expect(ids(dedupeLeaves([older, newer]))).toEqual(["b"]);
    expect(ids(dedupeLeaves([newer, older]))).toEqual(["b"]);
  });

  it("matches on employee code case-insensitively and ignores leave type", () => {
    const a = { ...row({ id: "a", employeeCode: "grp0761" }), leaveType: "Casual" };
    const b = { ...row({ id: "b", employeeCode: " GRP0761 " }), leaveType: "Earned" };
    const out = dedupeLeaves([a, b]);
    expect(out).toHaveLength(1);
    expect(out[0].leaveType).toBe("Earned");
  });

  it("prefers a decided row over a pending duplicate", () => {
    const decided = row({ id: "a", status: "approved", receivedAt: "2026-08-20T09:00:00.000Z" });
    const pending = row({ id: "b", status: "pending", receivedAt: "2026-08-25T09:00:00.000Z" });
    expect(ids(dedupeLeaves([decided, pending]))).toEqual(["a"]);
    expect(ids(dedupeLeaves([pending, decided]))).toEqual(["a"]);
  });

  it("prefers greythr over a direct mail when both are pending", () => {
    const direct = row({ id: "a", source: "direct", receivedAt: "2026-08-25T09:00:00.000Z" });
    const greythr = row({ id: "b", source: "greythr", receivedAt: "2026-08-20T09:00:00.000Z" });
    expect(ids(dedupeLeaves([direct, greythr]))).toEqual(["b"]);
  });

  it("treats a missing source as greythr", () => {
    const direct = row({ id: "a", source: "direct" });
    const unsourced = row({ id: "b" });
    expect(ids(dedupeLeaves([direct, unsourced]))).toEqual(["b"]);
  });

  it("prefers a decided direct row over a pending greythr row", () => {
    const direct = row({ id: "a", source: "direct", status: "handled" });
    const greythr = row({ id: "b", source: "greythr", status: "pending" });
    expect(ids(dedupeLeaves([greythr, direct]))).toEqual(["a"]);
  });

  it("falls back to the larger id when everything else ties", () => {
    const a = row({ id: "a" });
    const b = row({ id: "b" });
    expect(ids(dedupeLeaves([a, b]))).toEqual(["b"]);
    expect(ids(dedupeLeaves([b, a]))).toEqual(["b"]);
  });

  it("treats an unparseable receivedAt as the oldest", () => {
    const broken = row({ id: "z", receivedAt: "not a date" });
    const dated = row({ id: "a", receivedAt: "2026-08-20T09:00:00.000Z" });
    expect(ids(dedupeLeaves([broken, dated]))).toEqual(["a"]);
  });

  it("never dedupes cancellations against the leave they cancel", () => {
    const leave = row({ id: "a" });
    const cancellation = row({ id: "b", kind: "cancellation" });
    expect(ids(dedupeLeaves([leave, cancellation]))).toEqual(["a", "b"]);
  });

  it("keeps two cancellations for the same span", () => {
    const first = row({ id: "a", kind: "cancellation" });
    const second = row({ id: "b", kind: "cancellation" });
    expect(ids(dedupeLeaves([first, second]))).toEqual(["a", "b"]);
  });

  it("passes through rows with an unparseable from date", () => {
    const a = row({ id: "a", fromDate: "" });
    const b = row({ id: "b", fromDate: "" });
    expect(ids(dedupeLeaves([a, b]))).toEqual(["a", "b"]);
  });

  it("passes through rows with an unparseable to date", () => {
    const a = row({ id: "a", toDate: "sometime" });
    const b = row({ id: "b", toDate: "sometime" });
    expect(ids(dedupeLeaves([a, b]))).toEqual(["a", "b"]);
  });

  it("passes through rows with a blank employee code", () => {
    const a = row({ id: "a", employeeCode: "" });
    const b = row({ id: "b", employeeCode: "   " });
    expect(ids(dedupeLeaves([a, b]))).toEqual(["a", "b"]);
  });

  it("does not dedupe across different spans or different people", () => {
    const rows = [
      row({ id: "a" }),
      row({ id: "b", toDate: "27 Aug 2026" }),
      row({ id: "c", employeeCode: "GRP0999" }),
    ];
    expect(ids(dedupeLeaves(rows))).toEqual(["a", "b", "c"]);
  });

  it("preserves the input order of the survivors", () => {
    const rows = [
      row({ id: "d1", employeeCode: "GRP0001" }),
      row({ id: "d2", employeeCode: "GRP0002", receivedAt: "2026-08-19T09:00:00.000Z" }),
      row({ id: "d3", employeeCode: "GRP0003" }),
      row({ id: "d4", employeeCode: "GRP0002", receivedAt: "2026-08-21T09:00:00.000Z" }),
      row({ id: "d5", employeeCode: "GRP0004" }),
    ];
    expect(ids(dedupeLeaves(rows))).toEqual(["d1", "d3", "d4", "d5"]);
  });

  it("collapses three copies of the same application into one", () => {
    const rows = [
      row({ id: "a", receivedAt: "2026-08-18T09:00:00.000Z" }),
      row({ id: "b", receivedAt: "2026-08-19T09:00:00.000Z" }),
      row({ id: "c", source: "direct", receivedAt: "2026-08-25T09:00:00.000Z" }),
    ];
    expect(ids(dedupeLeaves(rows))).toEqual(["b"]);
  });

  it("returns a new array and leaves the input untouched", () => {
    const rows = [row({ id: "a" }), row({ id: "b" })];
    const out = dedupeLeaves(rows);
    expect(out).not.toBe(rows);
    expect(rows).toHaveLength(2);
  });

  it("handles an empty input", () => {
    expect(dedupeLeaves([])).toEqual([]);
  });
});
