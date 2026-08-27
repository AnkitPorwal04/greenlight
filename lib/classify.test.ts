import { describe, it, expect } from "vitest";
import {
  buildClassifyPrompt,
  isUnclassifiable,
  parseClassification,
  MAX_BODY_CHARS,
  UNCLASSIFIABLE,
} from "./classify";

function json(value: Record<string, unknown>): string {
  return JSON.stringify(value);
}

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
