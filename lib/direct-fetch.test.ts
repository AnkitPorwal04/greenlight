import { describe, it, expect, vi } from "vitest";
import {
  classifyInBursts,
  DIRECT_CLASSIFY_BUDGET_MS,
  DIRECT_CLASSIFY_CHUNK_SIZE,
  DIRECT_MAX_NEW_CLASSIFICATIONS,
} from "./direct-fetch";
import type { ClassifyJob, SaveClassification } from "./direct-fetch";
import type { Classifier, DirectClassification } from "./classify";

function answer(over: Partial<DirectClassification> = {}): DirectClassification {
  return {
    isRequest: true,
    kind: "leave",
    fromDate: "2026-09-10",
    toDate: "2026-09-10",
    leaveType: null,
    confidence: 0.9,
    ...over,
  };
}

function job(id: string): ClassifyJob {
  return {
    id,
    input: {
      subject: id,
      from: "jane.doe@example.com",
      bodyText: "Taking tomorrow off.",
    },
  };
}

function jobs(count: number): ClassifyJob[] {
  return Array.from({ length: count }, (_, i) => job(`m${i}`));
}

function recorder() {
  const saved = new Map<string, DirectClassification>();
  const save: SaveClassification = async (id, classification) => {
    saved.set(id, classification);
  };
  return { saved, save };
}

const noopSave: SaveClassification = async () => {};

const always: Classifier = async () => answer();

describe("burst defaults", () => {
  it("bursts five at a time with room for a whole backlog in one run", () => {
    expect(DIRECT_CLASSIFY_CHUNK_SIZE).toBe(5);
    expect(DIRECT_MAX_NEW_CLASSIFICATIONS).toBe(40);
    expect(DIRECT_CLASSIFY_BUDGET_MS).toBe(45000);
  });
});

describe("classifyInBursts", () => {
  it("classifies a sixteen mail backlog in a single run", async () => {
    const classify = vi.fn(always);
    const { saved, save } = recorder();

    const out = await classifyInBursts(jobs(16), classify, save);

    expect(classify).toHaveBeenCalledTimes(16);
    expect(out.size).toBe(16);
    expect(saved.size).toBe(16);
  });

  it("runs the calls inside a chunk in parallel", async () => {
    let inFlight = 0;
    let peak = 0;
    const classify: Classifier = async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return answer();
    };

    await classifyInBursts(jobs(12), classify, noopSave);

    expect(peak).toBe(DIRECT_CLASSIFY_CHUNK_SIZE);
  });

  it("classifies newest first and keeps the answers in that order", async () => {
    const seen: string[] = [];
    const classify: Classifier = async (input) => {
      seen.push(input.subject);
      return answer();
    };
    const list = jobs(16);

    const out = await classifyInBursts(list, classify, noopSave);

    expect(seen).toEqual(list.map((j) => j.id));
    expect([...out.keys()]).toEqual(list.map((j) => j.id));
  });

  it("hands the classifier the whole mail, not just the id", async () => {
    const classify = vi.fn(always);

    await classifyInBursts([job("m0")], classify, noopSave);

    expect(classify.mock.calls[0][0]).toEqual({
      subject: "m0",
      from: "jane.doe@example.com",
      bodyText: "Taking tomorrow off.",
    });
  });

  it("caches every answer it gets", async () => {
    const { saved, save } = recorder();

    await classifyInBursts(
      [job("m0")],
      async () => answer({ confidence: 0.42 }),
      save
    );

    expect(saved.get("m0")).toEqual(answer({ confidence: 0.42 }));
  });

  it("stops the run when an entire chunk fails", async () => {
    let calls = 0;
    const classify: Classifier = async () => {
      calls += 1;
      return calls <= 5 ? answer() : null;
    };

    const out = await classifyInBursts(jobs(16), classify, noopSave);

    expect(calls).toBe(10);
    expect(out.size).toBe(5);
  });

  it("stops on the very first chunk when nothing works at all", async () => {
    const classify = vi.fn(async () => null);

    const out = await classifyInBursts(jobs(16), classify, noopSave);

    expect(classify).toHaveBeenCalledTimes(5);
    expect(out.size).toBe(0);
  });

  it("keeps going when only part of a chunk fails", async () => {
    let calls = 0;
    const classify: Classifier = async () => {
      calls += 1;
      return calls % 3 === 0 ? null : answer();
    };
    const { saved, save } = recorder();

    const out = await classifyInBursts(jobs(16), classify, save);

    expect(calls).toBe(16);
    expect(out.size).toBe(11);
    expect(saved.size).toBe(11);
  });

  it("never caches a failure, leaving it to be retried next refresh", async () => {
    const classify: Classifier = async (input) =>
      input.subject === "m2" ? null : answer();
    const { saved, save } = recorder();

    const out = await classifyInBursts(jobs(6), classify, save);

    expect(out.has("m2")).toBe(false);
    expect(saved.has("m2")).toBe(false);
    expect(saved.size).toBe(5);
  });

  it("treats a thrown classifier error as a failure", async () => {
    const classify: Classifier = async () => {
      throw new Error("boom");
    };

    const out = await classifyInBursts(jobs(16), classify, noopSave);

    expect(out.size).toBe(0);
  });

  it("stops after the current chunk when Gemini rate-limits", async () => {
    let calls = 0;
    const classify: Classifier = async (_input, meta) => {
      calls += 1;
      if (calls === 3 && meta) meta.rateLimited = true;
      return answer();
    };
    const { saved, save } = recorder();

    const out = await classifyInBursts(jobs(16), classify, save);

    expect(calls).toBe(5);
    expect(out.size).toBe(5);
    expect(saved.size).toBe(5);
  });

  it("respects the per-run budget of new classifications", async () => {
    const classify = vi.fn(always);

    const out = await classifyInBursts(jobs(60), classify, noopSave);

    expect(classify).toHaveBeenCalledTimes(DIRECT_MAX_NEW_CLASSIFICATIONS);
    expect(out.size).toBe(DIRECT_MAX_NEW_CLASSIFICATIONS);
  });

  it("honours a caller supplied budget", async () => {
    const classify = vi.fn(always);

    await classifyInBursts(jobs(60), classify, noopSave, { maxNew: 7 });

    expect(classify).toHaveBeenCalledTimes(7);
  });

  it("stops between chunks once the wall clock is spent", async () => {
    const classify = vi.fn(always);
    let clock = 0;

    const out = await classifyInBursts(jobs(40), classify, noopSave, {
      budgetMs: 100,
      now: () => (clock += 200),
    });

    expect(classify).toHaveBeenCalledTimes(5);
    expect(out.size).toBe(5);
  });

  it("always runs the first chunk even on an exhausted clock", async () => {
    const classify = vi.fn(always);
    let clock = 0;

    await classifyInBursts(jobs(40), classify, noopSave, {
      budgetMs: 0,
      now: () => (clock += 1000),
    });

    expect(classify).toHaveBeenCalledTimes(5);
  });

  it("honours a caller supplied chunk size", async () => {
    let peak = 0;
    let inFlight = 0;
    const classify: Classifier = async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
      return answer();
    };

    await classifyInBursts(jobs(8), classify, noopSave, { chunkSize: 2 });

    expect(peak).toBe(2);
  });

  it("refuses a chunk size below one", async () => {
    const classify = vi.fn(always);

    const out = await classifyInBursts(jobs(3), classify, noopSave, {
      chunkSize: 0,
    });

    expect(classify).toHaveBeenCalledTimes(3);
    expect(out.size).toBe(3);
  });

  it("does nothing for an empty backlog", async () => {
    const classify = vi.fn(always);

    const out = await classifyInBursts([], classify, noopSave);

    expect(out.size).toBe(0);
    expect(classify).not.toHaveBeenCalled();
  });
});
