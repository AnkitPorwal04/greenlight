import { describe, it, expect, vi } from "vitest";
import {
  calendarWindowStart,
  collectMessageRefs,
  leavesWindowStart,
  windowedQuery,
  CALENDAR_MAX_MESSAGES,
  LEAVES_MAX_MESSAGES,
  SENT_MAIL_QUERY,
  SENT_PROBE_MAX_MESSAGES,
  GMAIL_PAGE_SIZE,
  type MessageRefPage,
} from "./gmail-window";
import { monthStart } from "./history";

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

describe("calendarWindowStart", () => {
  it("starts at the first day of a month well before the inbox window", () => {
    expect(calendarWindowStart(new Date(2026, 7, 27))).toEqual(
      new Date(2026, 1, 1),
    );
  });

  it("rolls back across a year boundary", () => {
    expect(calendarWindowStart(new Date(2026, 2, 9))).toEqual(
      new Date(2025, 8, 1),
    );
  });

  it("covers a leave applied months before the day it starts", () => {
    const now = new Date(2026, 7, 27);
    const appliedAt = new Date(2026, 2, 10);

    expect(monthStart(now, 2).getTime()).toBeGreaterThan(appliedAt.getTime());
    expect(calendarWindowStart(now).getTime()).toBeLessThanOrEqual(
      appliedAt.getTime(),
    );
  });

  it("reaches further back than the leaves window", () => {
    const now = new Date(2026, 7, 27);
    expect(calendarWindowStart(now).getTime()).toBeLessThan(
      leavesWindowStart(now).getTime(),
    );
  });
});

describe("calendar message paging", () => {
  it("collects more than one Gmail page of applications", async () => {
    const pageOf = (prefix: string, token?: string): MessageRefPage => ({
      refs: Array.from({ length: GMAIL_PAGE_SIZE }, (_, i) => ({
        id: `${prefix}-${i}`,
      })),
      nextPageToken: token,
    });
    const { fetchPage } = pager([
      pageOf("a", "p2"),
      pageOf("b", "p3"),
      pageOf("c"),
    ]);

    const result = await collectMessageRefs(CALENDAR_MAX_MESSAGES, fetchPage);

    expect(result.refs).toHaveLength(GMAIL_PAGE_SIZE * 3);
    expect(result.capped).toBe(false);
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it("keeps a cap above a single Gmail page", () => {
    expect(CALENDAR_MAX_MESSAGES).toBeGreaterThan(GMAIL_PAGE_SIZE);
  });
});

describe("sent mail probe", () => {
  it("asks Gmail only for the manager's own mail", () => {
    expect(SENT_MAIL_QUERY).toBe("from:me");
  });

  it("windows the probe to the same period as the leave query", () => {
    const since = new Date(2026, 6, 1);
    expect(windowedQuery(SENT_MAIL_QUERY, since)).toBe("from:me after:2026/07/01");
  });

  it("pages deep enough to cover a busy manager's window", () => {
    expect(SENT_PROBE_MAX_MESSAGES).toBeGreaterThanOrEqual(LEAVES_MAX_MESSAGES);
    expect(SENT_PROBE_MAX_MESSAGES % GMAIL_PAGE_SIZE).toBe(0);
  });
});
