import { describe, it, expect } from "vitest";
import {
  filterPeople,
  matchesPerson,
  normalizeTerm,
  parseFilterTerms,
  personCodes,
  type Person,
} from "./team-filter";

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

describe("parseFilterTerms", () => {
  it("returns no terms for a blank query", () => {
    expect(parseFilterTerms("")).toEqual([]);
    expect(parseFilterTerms("  \n , ; ")).toEqual([]);
  });

  it("returns a single term unchanged", () => {
    expect(parseFilterTerms("  GRP1042 ")).toEqual(["grp1042"]);
  });

  it("splits commas, spaces, newlines and semicolons", () => {
    expect(
      parseFilterTerms("a@x.io, b@x.io;c@x.io\nd@x.io e@x.io")
    ).toEqual(["a@x.io", "b@x.io", "c@x.io", "d@x.io", "e@x.io"]);
  });

  it("de-duplicates repeated values", () => {
    expect(parseFilterTerms("GRP1, grp1, GRP2")).toEqual(["grp1", "grp2"]);
  });
});

describe("filterPeople", () => {
  const roster: Person[] = [
    person(),
    person({ code: "GRP1941", name: "Nitin Kumar", email: "nitin@ethara.ai" }),
    person({ code: "GRP0500", name: "Priya Menon", email: "priya@ethara.ai" }),
    person({ code: "GRP0777", name: "Rahul Roy", email: "rahul@other.com" }),
  ];

  it("returns everyone when the query is empty", () => {
    expect(filterPeople(roster, "  ")).toHaveLength(4);
  });

  it("behaves like a plain substring search for a single term", () => {
    expect(filterPeople(roster, "priya").map((p) => p.code)).toEqual([
      "GRP0500",
    ]);
    expect(filterPeople(roster, "@ethara.ai")).toHaveLength(3);
  });

  it("unions matches across a pasted comma-separated list", () => {
    const pasted = "nitin@ethara.ai, priya@ethara.ai";
    expect(filterPeople(roster, pasted).map((p) => p.code)).toEqual([
      "GRP1941",
      "GRP0500",
    ]);
  });

  it("unions matches across mixed codes and emails on separate lines", () => {
    const pasted = "GRP1042\nrahul@other.com";
    expect(filterPeople(roster, pasted).map((p) => p.code)).toEqual([
      "GRP1042",
      "GRP0777",
    ]);
  });

  it("keeps a person only once when several terms match them", () => {
    expect(filterPeople(roster, "nitin, GRP1941")).toHaveLength(1);
  });

  it("drops terms that match nobody without dropping the rest", () => {
    expect(filterPeople(roster, "ghost@nowhere.io, priya")).toHaveLength(1);
  });

  it("gives select-all the shown rows only, never the whole roster", () => {
    const shown = filterPeople(roster, "nitin@ethara.ai, priya@ethara.ai");
    expect(personCodes(shown)).toEqual(["GRP1941", "GRP0500"]);
    expect(personCodes(shown)).not.toContain("GRP1042");
  });
});

describe("personCodes", () => {
  it("uppercases and trims codes", () => {
    expect(personCodes([{ code: " grp1 " }, { code: "GRP2" }])).toEqual([
      "GRP1",
      "GRP2",
    ]);
  });

  it("skips people without a usable code", () => {
    expect(personCodes([{ code: "" }, { name: "No Code" }, { code: "A1" }])).toEqual(
      ["A1"]
    );
  });
});
