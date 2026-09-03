import { describe, it, expect } from "vitest";
import { isEmailAllowed, parseAllowedEmails } from "./oauth-allowlist";

const BOTH_MANAGERS = "ankit@ethara.ai,archana@ethara.ai";

describe("parseAllowedEmails", () => {
  it("splits a comma-separated list", () => {
    expect(parseAllowedEmails(BOTH_MANAGERS)).toEqual([
      "ankit@ethara.ai",
      "archana@ethara.ai",
    ]);
  });

  it("trims whitespace around each entry", () => {
    expect(parseAllowedEmails("  ankit@ethara.ai ,  archana@ethara.ai  ")).toEqual(
      ["ankit@ethara.ai", "archana@ethara.ai"]
    );
  });

  it("lowercases every entry", () => {
    expect(parseAllowedEmails("Ankit@Ethara.AI")).toEqual(["ankit@ethara.ai"]);
  });

  it("drops blank entries from stray commas", () => {
    expect(parseAllowedEmails("ankit@ethara.ai,,  ,archana@ethara.ai,")).toEqual(
      ["ankit@ethara.ai", "archana@ethara.ai"]
    );
  });

  it("strips a trailing newline pasted into a dashboard field", () => {
    expect(parseAllowedEmails("ankit@ethara.ai\n")).toEqual(["ankit@ethara.ai"]);
  });

  it("returns an empty list when unset", () => {
    expect(parseAllowedEmails(undefined)).toEqual([]);
    expect(parseAllowedEmails(null)).toEqual([]);
  });

  it("returns an empty list when empty or whitespace only", () => {
    expect(parseAllowedEmails("")).toEqual([]);
    expect(parseAllowedEmails("   ")).toEqual([]);
    expect(parseAllowedEmails(",")).toEqual([]);
    expect(parseAllowedEmails(" , , ")).toEqual([]);
  });
});

describe("isEmailAllowed with no allowlist configured", () => {
  it("allows anyone when the variable is unset", () => {
    expect(isEmailAllowed("stranger@example.com", undefined)).toBe(true);
    expect(isEmailAllowed("stranger@example.com", null)).toBe(true);
  });

  it("allows anyone when the variable is empty", () => {
    expect(isEmailAllowed("stranger@example.com", "")).toBe(true);
  });

  it("allows anyone when the variable is whitespace only", () => {
    expect(isEmailAllowed("stranger@example.com", "   ")).toBe(true);
    expect(isEmailAllowed("stranger@example.com", " , , ")).toBe(true);
  });
});

describe("isEmailAllowed with an allowlist configured", () => {
  it("allows a listed address", () => {
    expect(isEmailAllowed("ankit@ethara.ai", BOTH_MANAGERS)).toBe(true);
    expect(isEmailAllowed("archana@ethara.ai", BOTH_MANAGERS)).toBe(true);
  });

  it("refuses an address that is not listed", () => {
    expect(isEmailAllowed("attacker@example.com", BOTH_MANAGERS)).toBe(false);
  });

  it("ignores case on the incoming address", () => {
    expect(isEmailAllowed("Ankit@Ethara.ai", BOTH_MANAGERS)).toBe(true);
    expect(isEmailAllowed("ANKIT@ETHARA.AI", BOTH_MANAGERS)).toBe(true);
  });

  it("ignores surrounding whitespace on the incoming address", () => {
    expect(isEmailAllowed("  ankit@ethara.ai  ", BOTH_MANAGERS)).toBe(true);
  });

  it("matches an address that is both mixed case and padded", () => {
    expect(isEmailAllowed("Ankit@Ethara.ai ", BOTH_MANAGERS)).toBe(true);
  });

  it("matches when the configured entry is the mixed case one", () => {
    expect(isEmailAllowed("ankit@ethara.ai", " Ankit@Ethara.AI ")).toBe(true);
  });

  it("refuses a missing address", () => {
    expect(isEmailAllowed(undefined, BOTH_MANAGERS)).toBe(false);
    expect(isEmailAllowed(null, BOTH_MANAGERS)).toBe(false);
    expect(isEmailAllowed("", BOTH_MANAGERS)).toBe(false);
    expect(isEmailAllowed("   ", BOTH_MANAGERS)).toBe(false);
  });

  it("requires a whole address rather than a substring", () => {
    expect(isEmailAllowed("ankit@ethara.ai.evil.com", BOTH_MANAGERS)).toBe(
      false
    );
    expect(isEmailAllowed("not-ankit@ethara.ai", BOTH_MANAGERS)).toBe(false);
    expect(isEmailAllowed("ankit@ethara.a", BOTH_MANAGERS)).toBe(false);
  });

  it("supports a single-entry allowlist", () => {
    expect(isEmailAllowed("ankit@ethara.ai", "ankit@ethara.ai")).toBe(true);
    expect(isEmailAllowed("archana@ethara.ai", "ankit@ethara.ai")).toBe(false);
  });
});
