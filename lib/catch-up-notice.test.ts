import { describe, expect, it } from "vitest";
import { CATCH_UP_MESSAGE, catchUpSuffix } from "./catch-up-notice";

describe("catchUpSuffix", () => {
  it("says nothing extra when there is no retry time", () => {
    expect(catchUpSuffix(null, 0)).toBe(".");
    expect(catchUpSuffix(Number.NaN, 0)).toBe(".");
    expect(catchUpSuffix(Number.POSITIVE_INFINITY, 0)).toBe(".");
  });

  it("counts down in seconds for a short wait", () => {
    expect(catchUpSuffix(30_000, 0)).toBe(". Retrying in about 30s.");
    expect(catchUpSuffix(1_000, 0)).toBe(". Retrying in about 1s.");
  });

  it("switches to minutes for a long wait", () => {
    expect(catchUpSuffix(30 * 60_000, 0)).toBe(". Retrying in about 30 min.");
    expect(catchUpSuffix(90_000, 0)).toBe(". Retrying in about 2 min.");
  });

  it("invites a refresh once the wait has passed", () => {
    expect(catchUpSuffix(0, 0)).toBe(". Refresh to try again.");
    expect(catchUpSuffix(-5_000, 0)).toBe(". Refresh to try again.");
  });

  it("never blames the manager or shows a raw error", () => {
    const wordings = [
      CATCH_UP_MESSAGE + catchUpSuffix(null, 0),
      CATCH_UP_MESSAGE + catchUpSuffix(30_000, 0),
      CATCH_UP_MESSAGE + catchUpSuffix(0, 0),
    ];
    for (const text of wordings) {
      expect(text).toMatch(/^Catching up with Gmail\./);
      expect(text).not.toMatch(/quota|error|403|429|failed/i);
    }
  });
});
