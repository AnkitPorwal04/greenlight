import { describe, it, expect, vi } from "vitest";
import {
  collectMessageRefs,
  leavesWindowStart,
  windowedQuery,
  type MessageRefPage,
} from "./gmail-window";

function refs(...ids: string[]) {
  return ids.map((id) => ({ id, threadId: `t-${id}` }));
}

function pager(pages: MessageRefPage[]) {
  const calls: (string | undefined)[] = [];
  const fetchPage = vi.fn(async (pageToken?: string) => {
    calls.push(pageToken);
    return pages[calls.length - 1] ?? { refs: [] };
  });
  return { calls, fetchPage };
}

describe("windowedQuery", () => {
  it("appends the gmail after: bound to the search query", () => {
    expect(windowedQuery("from:hr subject:leave", new Date(2026, 6, 1))).toBe(
      "from:hr subject:leave after:2026/07/01",
    );
  });
});

describe("leavesWindowStart", () => {
  it("starts at the first day of the previous month", () => {
    expect(leavesWindowStart(new Date(2026, 7, 18))).toEqual(
      new Date(2026, 6, 1),
    );
  });

  it("rolls back across a year boundary", () => {
    expect(leavesWindowStart(new Date(2026, 0, 5))).toEqual(
      new Date(2025, 11, 1),
    );
  });
});

describe("collectMessageRefs", () => {
  it("walks every page until the token runs out", async () => {
    const { calls, fetchPage } = pager([
      { refs: refs("a", "b"), nextPageToken: "p2" },
      { refs: refs("c", "d"), nextPageToken: "p3" },
      { refs: refs("e") },
    ]);

    const result = await collectMessageRefs(500, fetchPage);

    expect(result.refs.map((r) => r.id)).toEqual(["a", "b", "c", "d", "e"]);
    expect(result.capped).toBe(false);
    expect(calls).toEqual([undefined, "p2", "p3"]);
  });

  it("keeps the thread id alongside each message id", async () => {
    const { fetchPage } = pager([{ refs: refs("a") }]);

    const result = await collectMessageRefs(500, fetchPage);

    expect(result.refs).toEqual([{ id: "a", threadId: "t-a" }]);
  });

  it("drops ids repeated across pages", async () => {
    const { fetchPage } = pager([
      { refs: refs("a", "b"), nextPageToken: "p2" },
      { refs: refs("b", "c") },
    ]);

    const result = await collectMessageRefs(500, fetchPage);

    expect(result.refs.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(result.capped).toBe(false);
  });

  it("stops at the cap and reports capped when more pages remain", async () => {
    const { calls, fetchPage } = pager([
      { refs: refs("a", "b"), nextPageToken: "p2" },
      { refs: refs("c", "d"), nextPageToken: "p3" },
      { refs: refs("e", "f"), nextPageToken: "p4" },
    ]);

    const result = await collectMessageRefs(3, fetchPage);

    expect(result.refs.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(result.capped).toBe(true);
    expect(calls).toEqual([undefined, "p2"]);
  });

  it("reports capped when a single page overflows the cap", async () => {
    const { fetchPage } = pager([{ refs: refs("a", "b", "c") }]);

    const result = await collectMessageRefs(2, fetchPage);

    expect(result.refs.map((r) => r.id)).toEqual(["a", "b"]);
    expect(result.capped).toBe(true);
  });

  it("is not capped when the last page ends exactly on the cap", async () => {
    const { fetchPage } = pager([{ refs: refs("a", "b") }]);

    const result = await collectMessageRefs(2, fetchPage);

    expect(result.refs.map((r) => r.id)).toEqual(["a", "b"]);
    expect(result.capped).toBe(false);
  });

  it("handles an empty mailbox", async () => {
    const { calls, fetchPage } = pager([{ refs: [] }]);

    const result = await collectMessageRefs(500, fetchPage);

    expect(result.refs).toEqual([]);
    expect(result.capped).toBe(false);
    expect(calls).toEqual([undefined]);
  });

  it("ignores an empty trailing page token", async () => {
    const { calls, fetchPage } = pager([
      { refs: refs("a"), nextPageToken: "" },
    ]);

    const result = await collectMessageRefs(500, fetchPage);

    expect(result.refs.map((r) => r.id)).toEqual(["a"]);
    expect(result.capped).toBe(false);
    expect(calls).toEqual([undefined]);
  });
});
