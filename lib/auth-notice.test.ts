import { describe, it, expect } from "vitest";
import {
  authNotice,
  authParamFromSearch,
  searchWithoutAuthParam,
} from "./auth-notice";

describe("authNotice", () => {
  it("reports a successful connection", () => {
    expect(authNotice("success")).toEqual({
      message: "Gmail connected",
      tone: "success",
    });
  });

  it("explains a refused account as an error", () => {
    const notice = authNotice("forbidden");
    expect(notice?.tone).toBe("error");
    expect(notice?.message).toContain("not allowed");
  });

  it("explains a cancelled consent screen as an error", () => {
    expect(authNotice("denied")?.tone).toBe("error");
  });

  it("explains a failed exchange as an error", () => {
    expect(authNotice("error")?.tone).toBe("error");
  });

  it("gives every outcome a non-empty message", () => {
    for (const value of ["success", "denied", "error", "forbidden"]) {
      expect(authNotice(value)?.message).toBeTruthy();
    }
  });

  it("gives each outcome a distinct message", () => {
    const messages = ["success", "denied", "error", "forbidden"].map(
      (value) => authNotice(value)?.message
    );
    expect(new Set(messages).size).toBe(4);
  });

  it("stays silent when there is no auth parameter", () => {
    expect(authNotice(null)).toBeNull();
    expect(authNotice(undefined)).toBeNull();
    expect(authNotice("")).toBeNull();
  });

  it("stays silent for an unknown value", () => {
    expect(authNotice("banana")).toBeNull();
    expect(authNotice("SUCCESS")).toBeNull();
  });

  it("stays silent for inherited object properties", () => {
    expect(authNotice("constructor")).toBeNull();
    expect(authNotice("__proto__")).toBeNull();
    expect(authNotice("toString")).toBeNull();
  });
});

describe("authParamFromSearch", () => {
  it("reads the value the callback redirected with", () => {
    expect(authParamFromSearch("?auth=forbidden")).toBe("forbidden");
    expect(authParamFromSearch("auth=success")).toBe("success");
  });

  it("reads it alongside other parameters", () => {
    expect(authParamFromSearch("?view=stats&auth=error")).toBe("error");
  });

  it("returns null when absent", () => {
    expect(authParamFromSearch("")).toBeNull();
    expect(authParamFromSearch("?view=stats")).toBeNull();
  });
});

describe("searchWithoutAuthParam", () => {
  it("empties a search string that held only the notice", () => {
    expect(searchWithoutAuthParam("?auth=success")).toBe("");
  });

  it("keeps the other parameters", () => {
    expect(searchWithoutAuthParam("?view=stats&auth=error")).toBe("?view=stats");
  });

  it("leaves a search string with no notice alone", () => {
    expect(searchWithoutAuthParam("?view=stats")).toBe("?view=stats");
    expect(searchWithoutAuthParam("")).toBe("");
  });

  it("removes every repeat of the parameter", () => {
    expect(searchWithoutAuthParam("?auth=success&auth=error")).toBe("");
  });

  it("round-trips so the notice is shown only once", () => {
    const cleaned = searchWithoutAuthParam("?auth=forbidden");
    expect(authParamFromSearch(cleaned)).toBeNull();
  });
});
