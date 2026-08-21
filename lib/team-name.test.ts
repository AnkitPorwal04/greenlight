import { describe, it, expect } from "vitest";
import {
  DEFAULT_TEAM_NAME,
  TEAM_NAME_MAX_LENGTH,
  initialsFromName,
  managerDisplayName,
  normalizeTeamName,
  prettifyEmailName,
  teamNameOrDefault,
} from "./team-name";

describe("normalizeTeamName", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeTeamName("  Platform Squad  ")).toBe("Platform Squad");
  });

  it("returns an empty string for blank input", () => {
    expect(normalizeTeamName("")).toBe("");
    expect(normalizeTeamName("   \n\t ")).toBe("");
  });

  it("collapses runs of inner whitespace", () => {
    expect(normalizeTeamName("Platform    Squad")).toBe("Platform Squad");
    expect(normalizeTeamName("Platform\n\tSquad")).toBe("Platform Squad");
  });

  it("caps the name at 40 characters", () => {
    const long = "A".repeat(60);
    expect(normalizeTeamName(long)).toHaveLength(TEAM_NAME_MAX_LENGTH);
    expect(normalizeTeamName(long)).toBe("A".repeat(40));
  });

  it("does not leave a dangling space when it cuts at the cap", () => {
    const name = `${"A".repeat(39)} tail`;
    expect(normalizeTeamName(name)).toBe("A".repeat(39));
  });

  it("ignores values that are not strings", () => {
    expect(normalizeTeamName(null)).toBe("");
    expect(normalizeTeamName(undefined)).toBe("");
    expect(normalizeTeamName(42)).toBe("");
    expect(normalizeTeamName(["Platform Squad"])).toBe("");
  });
});

describe("teamNameOrDefault", () => {
  it("keeps a real name", () => {
    expect(teamNameOrDefault("Platform Squad")).toBe("Platform Squad");
  });

  it("falls back to the default when unset or blank", () => {
    expect(teamNameOrDefault(null)).toBe(DEFAULT_TEAM_NAME);
    expect(teamNameOrDefault("")).toBe(DEFAULT_TEAM_NAME);
    expect(teamNameOrDefault("   ")).toBe(DEFAULT_TEAM_NAME);
  });
});

describe("prettifyEmailName", () => {
  it("turns a dotted local part into a display name", () => {
    expect(prettifyEmailName("ankit.porwal@ethara.ai")).toBe("Ankit Porwal");
  });

  it("handles a single-word local part", () => {
    expect(prettifyEmailName("ankit@ethara.ai")).toBe("Ankit");
  });

  it("normalizes shouty and mixed casing", () => {
    expect(prettifyEmailName("ANKIT.PORWAL@ETHARA.AI")).toBe("Ankit Porwal");
    expect(prettifyEmailName("  aNkIt.PoRwAl@ethara.ai ")).toBe("Ankit Porwal");
  });

  it("splits underscores, hyphens and plus tags", () => {
    expect(prettifyEmailName("ankit_porwal@x.io")).toBe("Ankit Porwal");
    expect(prettifyEmailName("ankit-porwal-singh@x.io")).toBe(
      "Ankit Porwal Singh"
    );
    expect(prettifyEmailName("ankit+leave@x.io")).toBe("Ankit Leave");
  });

  it("copes with a bare local part and with junk", () => {
    expect(prettifyEmailName("ankit.porwal")).toBe("Ankit Porwal");
    expect(prettifyEmailName("")).toBe("");
    expect(prettifyEmailName(null)).toBe("");
  });
});

describe("managerDisplayName", () => {
  const directory = [
    { code: "GRP1042", name: "Aarav Sharma", email: "aarav.sharma@ethara.ai" },
    { code: "GRP1941", name: "Nitin Kumar", email: "NITIN@ethara.ai" },
    { code: "GRP0500", name: "", email: "blank@ethara.ai" },
  ];

  it("prefers the directory name for a known manager", () => {
    expect(managerDisplayName("aarav.sharma@ethara.ai", directory)).toBe(
      "Aarav Sharma"
    );
  });

  it("matches the directory case-insensitively", () => {
    expect(managerDisplayName("AARAV.SHARMA@ETHARA.AI", directory)).toBe(
      "Aarav Sharma"
    );
    expect(managerDisplayName("nitin@ethara.ai", directory)).toBe("Nitin Kumar");
  });

  it("prettifies the email when the manager is not in the directory", () => {
    expect(managerDisplayName("ankit.porwal@ethara.ai", directory)).toBe(
      "Ankit Porwal"
    );
  });

  it("prettifies when the directory row has no usable name", () => {
    expect(managerDisplayName("blank@ethara.ai", directory)).toBe("Blank");
  });

  it("returns nothing without an email", () => {
    expect(managerDisplayName("", directory)).toBe("");
    expect(managerDisplayName(null, directory)).toBe("");
  });

  it("survives an empty directory", () => {
    expect(managerDisplayName("ankit.porwal@ethara.ai", [])).toBe(
      "Ankit Porwal"
    );
  });
});

describe("initialsFromName", () => {
  it("uses the first and last word", () => {
    expect(initialsFromName("Ankit Porwal")).toBe("AP");
    expect(initialsFromName("Aarav Kumar Sharma")).toBe("AS");
  });

  it("uses a single initial for a one-word name", () => {
    expect(initialsFromName("Ankit")).toBe("A");
  });

  it("uppercases and tolerates stray whitespace", () => {
    expect(initialsFromName("  ankit   porwal ")).toBe("AP");
  });

  it("returns an empty string when there is no name", () => {
    expect(initialsFromName("")).toBe("");
    expect(initialsFromName("   ")).toBe("");
    expect(initialsFromName(null)).toBe("");
  });
});
