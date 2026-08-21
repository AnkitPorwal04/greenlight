import { describe, it, expect } from "vitest";
import { matchesPerson, normalizeTerm, type Person } from "./team-filter";

function person(over: Partial<Person> = {}): Person {
  return {
    code: "GRP1042",
    name: "Aarav Sharma",
    email: "aarav.sharma@ethara.ai",
    ...over,
  };
}

describe("matchesPerson", () => {
  it("matches on name and code as before", () => {
    expect(matchesPerson(person(), "aarav")).toBe(true);
    expect(matchesPerson(person(), "grp1042")).toBe(true);
    expect(matchesPerson(person(), "nitin")).toBe(false);
  });

  it("matches on the email address, case-insensitively", () => {
    expect(matchesPerson(person(), "aarav.sharma@ethara.ai")).toBe(true);
    expect(matchesPerson(person(), "AARAV.SHARMA@ETHARA.AI")).toBe(true);
    expect(matchesPerson(person(), "@ethara.ai")).toBe(true);
    expect(matchesPerson(person(), "sharma@")).toBe(true);
  });

  it("matches an email fragment that appears in no other field", () => {
    const p = person({ code: "GRP9", name: "Zoya Khan", email: "zk99@x.io" });
    expect(matchesPerson(p, "zk99")).toBe(true);
  });

  it("tolerates people with a missing email", () => {
    const p = { code: "GRP7", name: "No Mail" };
    expect(matchesPerson(p, "no mail")).toBe(true);
    expect(matchesPerson(p, "@ethara.ai")).toBe(false);
  });

  it("returns everything for a blank term", () => {
    expect(matchesPerson(person(), "   ")).toBe(true);
  });

  it("strips pasted punctuation and angle brackets around a term", () => {
    expect(normalizeTerm("<aarav.sharma@ethara.ai>")).toBe(
      "aarav.sharma@ethara.ai"
    );
    expect(matchesPerson(person(), "<aarav.sharma@ethara.ai>,")).toBe(true);
  });
});
