import { describe, expect, it } from "vitest";
import { isRecordedStatus, recordedNote, recordedToast } from "./outcome";

describe("isRecordedStatus", () => {
  it("accepts the three recordable outcomes", () => {
    expect(isRecordedStatus("approved")).toBe(true);
    expect(isRecordedStatus("rejected")).toBe(true);
    expect(isRecordedStatus("handled")).toBe(true);
  });

  it("rejects pending and anything else", () => {
    expect(isRecordedStatus("pending")).toBe(false);
    expect(isRecordedStatus("Approved")).toBe(false);
    expect(isRecordedStatus("")).toBe(false);
    expect(isRecordedStatus(undefined)).toBe(false);
    expect(isRecordedStatus(null)).toBe(false);
    expect(isRecordedStatus(1)).toBe(false);
  });
});

describe("recordedNote", () => {
  it("keeps the handled note unchanged", () => {
    expect(recordedNote("handled")).toBe(
      "Marked as handled (dealt with outside Greenlight)"
    );
  });

  it("marks accepted and rejected as resolved outside the app", () => {
    expect(recordedNote("approved")).toContain("accepted");
    expect(recordedNote("rejected")).toContain("rejected");
    expect(recordedNote("approved")).toContain("outside Greenlight");
    expect(recordedNote("rejected")).toContain("outside Greenlight");
  });
});

describe("recordedToast", () => {
  it("says no mail was sent for a single request", () => {
    expect(recordedToast("approved", 1)).toBe(
      "Recorded as accepted — no mail sent"
    );
    expect(recordedToast("rejected", 1)).toBe(
      "Recorded as rejected — no mail sent"
    );
    expect(recordedToast("handled", 1)).toBe(
      "Marked as handled — no mail sent"
    );
  });

  it("counts bulk marks", () => {
    expect(recordedToast("handled", 4)).toBe("4 requests marked as handled");
    expect(recordedToast("approved", 2)).toBe("2 requests recorded as approved");
  });
});
