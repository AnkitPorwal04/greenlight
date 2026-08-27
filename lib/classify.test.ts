import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import {
  buildClassifyPrompt,
  classifyMail,
  isUnclassifiable,
  parseClassification,
  parseModelChain,
  resetModelCooldowns,
  CLASSIFY_TIMEOUT_MS,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_MODEL_CHAIN,
  MAX_BODY_CHARS,
  UNCLASSIFIABLE,
} from "./classify";
import type { ClassifyMeta } from "./classify";

function json(value: Record<string, unknown>): string {
  return JSON.stringify(value);
}

beforeEach(() => {
  resetModelCooldowns();
});

const valid = {
  isRequest: true,
  kind: "leave",
  fromDate: "2026-09-05",
  toDate: "2026-09-07",
  leaveType: "Sick Leave",
  confidence: 0.92,
};

describe("parseClassification", () => {
  it("reads a well-formed positive classification", () => {
    expect(parseClassification(json(valid))).toEqual({
      isRequest: true,
      kind: "leave",
      fromDate: "2026-09-05",
      toDate: "2026-09-07",
      leaveType: "Sick Leave",
      confidence: 0.92,
    });
  });

  it("reads a well-formed negative classification", () => {
    expect(
      parseClassification(
        json({
          isRequest: false,
          kind: "leave",
          fromDate: null,
          toDate: null,
          leaveType: null,
          confidence: 0.05,
        })
      )
    ).toEqual({
      isRequest: false,
      kind: "leave",
      fromDate: null,
      toDate: null,
      leaveType: null,
      confidence: 0.05,
    });
  });

  it("unwraps a fenced code block", () => {
    const parsed = parseClassification("```json\n" + json(valid) + "\n```");
    expect(parsed?.fromDate).toBe("2026-09-05");
  });

  it("returns null for malformed JSON", () => {
    expect(parseClassification("{ not json")).toBeNull();
    expect(parseClassification("")).toBeNull();
    expect(parseClassification("   ")).toBeNull();
  });

  it("returns null for JSON that is not an object", () => {
    expect(parseClassification("[1,2,3]")).toBeNull();
    expect(parseClassification('"approved"')).toBeNull();
    expect(parseClassification("null")).toBeNull();
  });

  it("returns null when isRequest is missing or not a boolean", () => {
    expect(parseClassification(json({ ...valid, isRequest: undefined }))).toBeNull();
    expect(parseClassification(json({ ...valid, isRequest: "true" }))).toBeNull();
    expect(parseClassification(json({ ...valid, isRequest: 1 }))).toBeNull();
  });

  it("clamps an out-of-range confidence", () => {
    expect(parseClassification(json({ ...valid, confidence: 7 }))?.confidence).toBe(1);
    expect(parseClassification(json({ ...valid, confidence: -3 }))?.confidence).toBe(0);
    expect(parseClassification(json({ ...valid, confidence: 95 }))?.confidence).toBe(1);
  });

  it("treats an unusable confidence as zero", () => {
    expect(parseClassification(json({ ...valid, confidence: "high" }))?.confidence).toBe(0);
    expect(parseClassification(json({ ...valid, confidence: null }))?.confidence).toBe(0);
  });

  it("normalizes a work-from-home kind", () => {
    expect(parseClassification(json({ ...valid, kind: "WFH" }))?.kind).toBe("wfh");
    expect(parseClassification(json({ ...valid, kind: "work from home" }))?.kind).toBe(
      "wfh"
    );
    expect(parseClassification(json({ ...valid, kind: "work_from_home" }))?.kind).toBe(
      "wfh"
    );
  });

  it("normalizes a cancellation kind", () => {
    expect(parseClassification(json({ ...valid, kind: "Cancellation" }))?.kind).toBe(
      "cancellation"
    );
    expect(parseClassification(json({ ...valid, kind: "cancel" }))?.kind).toBe(
      "cancellation"
    );
  });

  it("falls back to leave for an unknown or missing kind", () => {
    expect(parseClassification(json({ ...valid, kind: "sabbatical" }))?.kind).toBe(
      "leave"
    );
    expect(parseClassification(json({ ...valid, kind: 42 }))?.kind).toBe("leave");
    expect(parseClassification(json({ ...valid, kind: undefined }))?.kind).toBe("leave");
  });

  it("drops dates that are not real YYYY-MM-DD days", () => {
    const parsed = parseClassification(
      json({ ...valid, fromDate: "2026-02-31", toDate: "5th Sept" })
    );
    expect(parsed?.fromDate).toBeNull();
    expect(parsed?.toDate).toBeNull();
  });

  it("falls back to the start date when only the end date is unusable", () => {
    const parsed = parseClassification(json({ ...valid, toDate: null }));
    expect(parsed?.toDate).toBe("2026-09-05");
  });

  it("blanks an empty leave type", () => {
    expect(parseClassification(json({ ...valid, leaveType: "   " }))?.leaveType).toBeNull();
    expect(parseClassification(json({ ...valid, leaveType: 7 }))?.leaveType).toBeNull();
  });

  it("collapses whitespace in a leave type", () => {
    expect(
      parseClassification(json({ ...valid, leaveType: "  casual   leave " }))?.leaveType
    ).toBe("casual leave");
  });
});

describe("isUnclassifiable", () => {
  it("marks the answer used when Gemini refuses to answer", () => {
    expect(isUnclassifiable(UNCLASSIFIABLE)).toBe(true);
    expect(UNCLASSIFIABLE.isRequest).toBe(false);
    expect(UNCLASSIFIABLE.fromDate).toBeNull();
  });

  it("survives being cached and read back", () => {
    expect(isUnclassifiable(JSON.parse(JSON.stringify(UNCLASSIFIABLE)))).toBe(true);
  });

  it("never marks a real model answer, even one that claims the flag", () => {
    expect(parseClassification(json(valid))?.unclassifiable).toBeUndefined();
    expect(
      parseClassification(json({ ...valid, unclassifiable: true }))?.unclassifiable
    ).toBeUndefined();
    expect(isUnclassifiable(parseClassification(json(valid)))).toBe(false);
  });

  it("treats a missing answer as not unclassifiable", () => {
    expect(isUnclassifiable(null)).toBe(false);
    expect(isUnclassifiable(undefined)).toBe(false);
  });
});

describe("buildClassifyPrompt", () => {
  it("truncates a long body", () => {
    const prompt = buildClassifyPrompt({
      subject: "hi",
      from: "jane@example.com",
      bodyText: "x".repeat(MAX_BODY_CHARS * 3),
    });
    expect(prompt.length).toBeLessThan(MAX_BODY_CHARS + 500);
  });

  it("includes the received date when it is usable", () => {
    const prompt = buildClassifyPrompt({
      subject: "kal chutti",
      from: "jane@example.com",
      bodyText: "kal nahi aa paunga",
      receivedAt: "2026-09-04T06:30:00.000Z",
    });
    expect(prompt).toContain("Received: 2026-09-04");
  });

  it("omits the received date when it cannot be read", () => {
    const prompt = buildClassifyPrompt({
      subject: "kal chutti",
      from: "jane@example.com",
      bodyText: "kal nahi aa paunga",
      receivedAt: "not a date",
    });
    expect(prompt).not.toContain("Received:");
  });
});

describe("classifyMail rate limit reporting", () => {
  const input = {
    subject: "Leave tomorrow",
    from: "jane@example.com",
    bodyText: "Taking tomorrow off.",
  };

  function respond(status: number, body: unknown = {}) {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
      }))
    );
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("flags a 429 so the caller can stop bursting", async () => {
    respond(429);
    const meta: ClassifyMeta = {};

    expect(await classifyMail(input, meta)).toBeNull();
    expect(meta.status).toBe(429);
    expect(meta.rateLimited).toBe(true);
  });

  it("does not mistake an ordinary server error for a rate limit", async () => {
    respond(500);
    const meta: ClassifyMeta = {};

    expect(await classifyMail(input, meta)).toBeNull();
    expect(meta.status).toBe(500);
    expect(meta.rateLimited).toBe(false);
  });

  it("reports a healthy call as not rate limited", async () => {
    respond(200, {
      candidates: [{ content: { parts: [{ text: json(valid) }] } }],
    });
    const meta: ClassifyMeta = {};

    expect(await classifyMail(input, meta)).toMatchObject({
      isRequest: true,
      fromDate: "2026-09-05",
    });
    expect(meta.status).toBe(200);
    expect(meta.rateLimited).toBe(false);
  });

  it("keeps working for callers that pass no meta at all", async () => {
    respond(429);
    expect(await classifyMail(input)).toBeNull();
  });

  it("leaves the meta untouched when there is no API key", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const meta: ClassifyMeta = {};

    expect(await classifyMail(input, meta)).toBeNull();
    expect(meta).toEqual({});
  });
});

describe("parseModelChain", () => {
  it("falls back to the built-in chain when nothing is set", () => {
    expect(parseModelChain(undefined)).toEqual(DEFAULT_MODEL_CHAIN);
    expect(parseModelChain("")).toEqual(DEFAULT_MODEL_CHAIN);
    expect(parseModelChain("   ")).toEqual(DEFAULT_MODEL_CHAIN);
    expect(parseModelChain(",, ,")).toEqual(DEFAULT_MODEL_CHAIN);
  });

  it("leads the built-in chain with the flash-lite primary", () => {
    expect(DEFAULT_MODEL_CHAIN[0]).toBe(DEFAULT_GEMINI_MODEL);
    expect(DEFAULT_MODEL_CHAIN.length).toBeGreaterThan(1);
  });

  it("reads a single model as a chain of one", () => {
    expect(parseModelChain("gemini-3.1-flash-lite")).toEqual([
      "gemini-3.1-flash-lite",
    ]);
  });

  it("reads a comma separated list in order", () => {
    expect(parseModelChain("model-a,model-b,model-c")).toEqual([
      "model-a",
      "model-b",
      "model-c",
    ]);
  });

  it("trims spacing and drops blank entries", () => {
    expect(parseModelChain("  model-a , , model-b ,")).toEqual([
      "model-a",
      "model-b",
    ]);
  });

  it("keeps only the first mention of a repeated model", () => {
    expect(parseModelChain("model-a,model-b,model-a")).toEqual([
      "model-a",
      "model-b",
    ]);
  });

  it("does not hand out the shared default array", () => {
    const chain = parseModelChain("");
    chain.push("scribbled-on");
    expect(parseModelChain("")).toEqual(DEFAULT_MODEL_CHAIN);
  });
});

describe("classifyMail model rotation", () => {
  const input = {
    subject: "Leave tomorrow",
    from: "jane@example.com",
    bodyText: "Taking tomorrow off.",
  };

  type Reply = { status: number; body?: unknown } | "throw" | "hang";

  const answer = {
    candidates: [{ content: { parts: [{ text: json(valid) }] } }],
  };

  let calls: string[] = [];

  function route(replies: Record<string, Reply>) {
    calls = [];
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: { signal: AbortSignal }) => {
        const model = decodeURIComponent(
          url.match(/models\/([^:]+):generateContent/)?.[1] ?? ""
        );
        calls.push(model);

        const reply = replies[model] ?? { status: 404 };
        if (reply === "throw") throw new Error("network down");
        if (reply === "hang") {
          return new Promise((_resolve, reject) => {
            init.signal.addEventListener("abort", () =>
              reject(new Error("The operation was aborted."))
            );
          });
        }
        return {
          ok: reply.status >= 200 && reply.status < 300,
          status: reply.status,
          json: async () => reply.body ?? {},
        };
      })
    );
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("rotates past a rate limited primary to a working backup", async () => {
    vi.stubEnv("GEMINI_MODEL", "model-a,model-b");
    route({ "model-a": { status: 429 }, "model-b": { status: 200, body: answer } });
    const meta: ClassifyMeta = {};

    expect(await classifyMail(input, meta)).toMatchObject({
      isRequest: true,
      fromDate: "2026-09-05",
    });
    expect(calls).toEqual(["model-a", "model-b"]);
    expect(meta.status).toBe(200);
    expect(meta.rateLimited).toBe(false);
  });

  it("rotates past a retired model that answers 404", async () => {
    vi.stubEnv("GEMINI_MODEL", "model-a,model-b");
    route({ "model-a": { status: 404 }, "model-b": { status: 200, body: answer } });

    expect(await classifyMail(input)).toMatchObject({ isRequest: true });
    expect(calls).toEqual(["model-a", "model-b"]);
  });

  it("rotates past a server error", async () => {
    vi.stubEnv("GEMINI_MODEL", "model-a,model-b");
    route({ "model-a": { status: 503 }, "model-b": { status: 200, body: answer } });

    expect(await classifyMail(input)).toMatchObject({ isRequest: true });
    expect(calls).toEqual(["model-a", "model-b"]);
  });

  it("rotates past a network failure", async () => {
    vi.stubEnv("GEMINI_MODEL", "model-a,model-b");
    route({ "model-a": "throw", "model-b": { status: 200, body: answer } });

    expect(await classifyMail(input)).toMatchObject({ isRequest: true });
    expect(calls).toEqual(["model-a", "model-b"]);
  });

  it("rotates past a primary that never answers in time", async () => {
    vi.stubEnv("GEMINI_MODEL", "model-a,model-b");
    route({ "model-a": "hang", "model-b": { status: 200, body: answer } });
    vi.useFakeTimers();

    try {
      const pending = classifyMail(input);
      await vi.advanceTimersByTimeAsync(CLASSIFY_TIMEOUT_MS);
      expect(await pending).toMatchObject({ isRequest: true });
    } finally {
      vi.useRealTimers();
    }
    expect(calls).toEqual(["model-a", "model-b"]);
  });

  it("gives up only once the whole chain is exhausted", async () => {
    vi.stubEnv("GEMINI_MODEL", "model-a,model-b,model-c");
    route({
      "model-a": { status: 429 },
      "model-b": { status: 429 },
      "model-c": { status: 429 },
    });
    const meta: ClassifyMeta = {};

    expect(await classifyMail(input, meta)).toBeNull();
    expect(calls).toEqual(["model-a", "model-b", "model-c"]);
    expect(meta.status).toBe(429);
    expect(meta.rateLimited).toBe(true);
  });

  it("only calls it a rate limit when every model was rate limited", async () => {
    vi.stubEnv("GEMINI_MODEL", "model-a,model-b");
    route({ "model-a": { status: 429 }, "model-b": { status: 500 } });
    const meta: ClassifyMeta = {};

    expect(await classifyMail(input, meta)).toBeNull();
    expect(meta.status).toBe(500);
    expect(meta.rateLimited).toBe(false);
  });

  it("stops at a bad request instead of rotating", async () => {
    vi.stubEnv("GEMINI_MODEL", "model-a,model-b");
    route({ "model-a": { status: 400 }, "model-b": { status: 200, body: answer } });
    const meta: ClassifyMeta = {};

    expect(await classifyMail(input, meta)).toBeNull();
    expect(calls).toEqual(["model-a"]);
    expect(meta.status).toBe(400);
    expect(meta.rateLimited).toBe(false);
  });

  it("treats a blocked answer as an answer rather than rotating", async () => {
    vi.stubEnv("GEMINI_MODEL", "model-a,model-b");
    route({
      "model-a": { status: 200, body: { candidates: [{ content: { parts: [] } }] } },
      "model-b": { status: 200, body: answer },
    });
    const meta: ClassifyMeta = {};

    const result = await classifyMail(input, meta);
    expect(isUnclassifiable(result)).toBe(true);
    expect(calls).toEqual(["model-a"]);
    expect(meta.status).toBe(200);
    expect(meta.rateLimited).toBe(false);
  });

  it("skips a model already known to be down for the rest of the run", async () => {
    vi.stubEnv("GEMINI_MODEL", "model-a,model-b");
    route({ "model-a": { status: 429 }, "model-b": { status: 200, body: answer } });

    expect(await classifyMail(input)).toMatchObject({ isRequest: true });
    expect(calls).toEqual(["model-a", "model-b"]);

    calls.length = 0;
    expect(await classifyMail(input)).toMatchObject({ isRequest: true });
    expect(calls).toEqual(["model-b"]);
  });

  it("asks the dead model again once the cooldown is cleared", async () => {
    vi.stubEnv("GEMINI_MODEL", "model-a,model-b");
    route({ "model-a": { status: 429 }, "model-b": { status: 200, body: answer } });

    await classifyMail(input);
    resetModelCooldowns();

    calls.length = 0;
    expect(await classifyMail(input)).toMatchObject({ isRequest: true });
    expect(calls).toEqual(["model-a", "model-b"]);
  });

  it("reports nothing when every model in the chain is cooling down", async () => {
    vi.stubEnv("GEMINI_MODEL", "model-a,model-b");
    route({ "model-a": { status: 429 }, "model-b": { status: 429 } });

    expect(await classifyMail(input)).toBeNull();

    calls.length = 0;
    const meta: ClassifyMeta = {};
    expect(await classifyMail(input, meta)).toBeNull();
    expect(calls).toEqual([]);
    expect(meta).toEqual({});
  });
});
