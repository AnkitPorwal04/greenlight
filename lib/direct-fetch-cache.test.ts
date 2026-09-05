import { describe, it, expect, vi, beforeEach } from "vitest";
import type { gmail_v1 } from "@googleapis/gmail";
import type { DirectCache } from "./direct-cache";
import type { DirectClassification } from "./classify";

const store = vi.hoisted(() => ({
  directCache: { v: 1, entries: {} } as DirectCache,
  classifications: new Map<string, DirectClassification>(),
  dismissed: [] as string[],
  saves: 0,
}));

vi.mock("./employees", () => ({
  loadEmployees: async () => ({
    GRP1: { code: "GRP1", name: "Jane Doe", email: "jane.doe@ethara-ai.com" },
    GRP2: { code: "GRP2", name: "Ravi Kumar", email: "ravi.kumar@ethara-ai.com" },
  }),
}));

vi.mock("./store", () => ({
  loadDirectCache: async () => store.directCache,
  saveDirectCache: async (_e: string, cache: DirectCache) => {
    store.saves += 1;
    store.directCache = JSON.parse(JSON.stringify(cache));
  },
  loadDismissed: async () => store.dismissed,
  loadClassification: async (_e: string, id: string) =>
    store.classifications.get(id) ?? null,
  saveClassification: async (
    _e: string,
    id: string,
    c: DirectClassification,
  ) => {
    store.classifications.set(id, c);
  },
}));

const { fetchDirectRequests } = await import("./direct-fetch");

const SELF = "manager@ethara-ai.com";
const NOW = Date.UTC(2026, 8, 1, 9, 0, 0);

function message(
  id: string,
  over: { from?: string; subject?: string; text?: string; at?: number } = {},
): gmail_v1.Schema$Message {
  return {
    id,
    threadId: `t-${id}`,
    internalDate: String(over.at ?? NOW),
    payload: {
      mimeType: "text/plain",
      body: {
        data: Buffer.from(
          over.text ?? "Taking Monday off, please approve.",
          "utf8",
        ).toString("base64url"),
      },
      headers: [
        { name: "From", value: over.from ?? "Jane Doe <jane.doe@ethara-ai.com>" },
        { name: "To", value: SELF },
        { name: "Subject", value: over.subject ?? "Leave on Monday" },
      ],
    },
  };
}

function fakeGmail(messages: gmail_v1.Schema$Message[]) {
  const byId = new Map(messages.map((m) => [m.id ?? "", m]));
  const calls = { list: 0, get: [] as string[] };
  const gmail = {
    users: {
      messages: {
        list: async () => {
          calls.list += 1;
          return {
            data: {
              messages: messages.map((m) => ({
                id: m.id,
                threadId: m.threadId,
              })),
            },
          };
        },
        get: async ({ id }: { id: string }) => {
          calls.get.push(id);
          const found = byId.get(id);
          if (!found) throw new Error(`no such message ${id}`);
          return { data: found };
        },
      },
    },
  };
  return { gmail: gmail as unknown as gmail_v1.Gmail, calls };
}

function ctx(over: Partial<Parameters<typeof fetchDirectRequests>[3]> = {}) {
  return { selfEmail: SELF, team: [], decisions: {}, ...over };
}

const classified: DirectClassification = {
  isRequest: true,
  kind: "leave",
  fromDate: "2026-09-07",
  toDate: "2026-09-07",
  leaveType: "Casual Leave",
  confidence: 0.95,
};

beforeEach(() => {
  store.directCache = { v: 1, entries: {} };
  store.classifications = new Map();
  store.dismissed = [];
  store.saves = 0;
  process.env.GEMINI_API_KEY = "test-key";
});

describe("fetchDirectRequests message cache", () => {
  it("fetches each message once on a cold run", async () => {
    const msgs = [message("m1"), message("m2")];
    const { gmail, calls } = fakeGmail(msgs);
    store.classifications.set("m1", classified);
    store.classifications.set("m2", classified);

    await fetchDirectRequests(gmail, SELF, "2026/08/01", ctx());

    expect(calls.get.sort()).toEqual(["m1", "m2"]);
    expect(store.saves).toBe(1);
  });

  it("makes zero messages.get calls once the cache is warm", async () => {
    const msgs = [message("m1"), message("m2")];
    store.classifications.set("m1", classified);
    store.classifications.set("m2", classified);

    const cold = fakeGmail(msgs);
    const first = await fetchDirectRequests(cold.gmail, SELF, "2026/08/01", ctx());

    const warm = fakeGmail(msgs);
    const second = await fetchDirectRequests(warm.gmail, SELF, "2026/08/01", ctx());

    expect(cold.calls.get).toHaveLength(2);
    expect(warm.calls.get).toEqual([]);
    expect(warm.calls.list).toBeGreaterThan(0);
    expect(second).toEqual(first);
  });

  it("does not rewrite the cache when nothing new was fetched", async () => {
    const msgs = [message("m1")];
    store.classifications.set("m1", classified);
    const first = fakeGmail(msgs);
    await fetchDirectRequests(first.gmail, SELF, "2026/08/01", ctx());
    expect(store.saves).toBe(1);

    const second = fakeGmail(msgs);
    await fetchDirectRequests(second.gmail, SELF, "2026/08/01", ctx());
    expect(store.saves).toBe(1);
  });

  it("only fetches the messages it has never seen", async () => {
    store.classifications.set("m1", classified);
    store.classifications.set("m2", classified);

    const first = fakeGmail([message("m1")]);
    await fetchDirectRequests(first.gmail, SELF, "2026/08/01", ctx());

    const second = fakeGmail([message("m1"), message("m2")]);
    await fetchDirectRequests(second.gmail, SELF, "2026/08/01", ctx());

    expect(second.calls.get).toEqual(["m2"]);
  });

  it("caches mail from a sender who is not in the directory yet", async () => {
    const msgs = [
      message("m1", { from: "New Joiner <new.joiner@ethara-ai.com>" }),
    ];
    const cold = fakeGmail(msgs);
    const rows = await fetchDirectRequests(cold.gmail, SELF, "2026/08/01", ctx());

    expect(rows).toEqual([]);
    expect(cold.calls.get).toEqual(["m1"]);

    const warm = fakeGmail(msgs);
    await fetchDirectRequests(warm.gmail, SELF, "2026/08/01", ctx());
    expect(warm.calls.get).toEqual([]);
  });

  it("never caches a message.get that failed, so it is retried", async () => {
    const gmail = {
      users: {
        messages: {
          list: async () => ({ data: { messages: [{ id: "m1", threadId: "t1" }] } }),
          get: async () => {
            throw new Error("rate limited");
          },
        },
      },
    } as unknown as gmail_v1.Gmail;

    await fetchDirectRequests(gmail, SELF, "2026/08/01", ctx());

    expect(store.directCache.entries.m1).toBeUndefined();
  });

  it("re-resolves the person from the live directory on a warm read", async () => {
    const msgs = [message("m1")];
    store.classifications.set("m1", classified);

    const cold = fakeGmail(msgs);
    const before = await fetchDirectRequests(cold.gmail, SELF, "2026/08/01", ctx());
    expect(before[0].employeeCode).toBe("GRP1");

    const warm = fakeGmail(msgs);
    const after = await fetchDirectRequests(
      warm.gmail,
      SELF,
      "2026/08/01",
      ctx({ team: ["GRP2"] }),
    );

    expect(warm.calls.get).toEqual([]);
    expect(after).toEqual([]);
  });

  it("takes the manager address from the request, not from the cache", async () => {
    const msgs = [message("m1")];
    store.classifications.set("m1", classified);

    const cold = fakeGmail(msgs);
    await fetchDirectRequests(cold.gmail, SELF, "2026/08/01", ctx());

    const warm = fakeGmail(msgs);
    const rows = await fetchDirectRequests(
      warm.gmail,
      "jane.doe@ethara-ai.com",
      "2026/08/01",
      ctx({ selfEmail: "jane.doe@ethara-ai.com" }),
    );

    expect(warm.calls.get).toEqual([]);
    expect(rows).toEqual([]);
  });

  it("keeps newest first ordering across cached and freshly fetched mail", async () => {
    store.classifications.set("old", classified);
    store.classifications.set("new", classified);

    const first = fakeGmail([message("old", { at: NOW - 86_400_000 })]);
    await fetchDirectRequests(first.gmail, SELF, "2026/08/01", ctx());

    const second = fakeGmail([
      message("old", { at: NOW - 86_400_000 }),
      message("new", { at: NOW }),
    ]);
    const rows = await fetchDirectRequests(second.gmail, SELF, "2026/08/01", ctx());

    expect(second.calls.get).toEqual(["new"]);
    expect(rows.map((r) => r.id)).toEqual(["new", "old"]);
  });
});
