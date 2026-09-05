import { describe, expect, it } from "vitest";
import { cachedIdsSince } from "./cached-window";

describe("cachedIdsSince", () => {
  const entries = {
    old: { t: 1_000 },
    mid: { t: 5_000 },
    new: { t: 9_000 },
  };

  it("keeps only what falls inside the window", () => {
    expect(cachedIdsSince(entries, 5_000)).toEqual(["new", "mid"]);
  });

  it("orders newest first, the way messages.list would have", () => {
    expect(cachedIdsSince(entries, 0)).toEqual(["new", "mid", "old"]);
  });

  it("includes an entry sitting exactly on the boundary", () => {
    expect(cachedIdsSince(entries, 9_000)).toEqual(["new"]);
  });

  it("returns nothing when the cache is empty or cold", () => {
    expect(cachedIdsSince({}, 0)).toEqual([]);
    expect(cachedIdsSince(entries, 10_000)).toEqual([]);
  });

  it("honours a cap so a huge cache cannot blow the window", () => {
    expect(cachedIdsSince(entries, 0, 2)).toEqual(["new", "mid"]);
    expect(cachedIdsSince(entries, 0, 0)).toEqual([]);
  });

  it("breaks ties deterministically", () => {
    const tied = { b: { t: 5 }, a: { t: 5 } };
    expect(cachedIdsSince(tied, 0)).toEqual(["a", "b"]);
  });

  it("skips malformed entries rather than throwing", () => {
    const messy = {
      good: { t: 10 },
      nan: { t: Number.NaN },
      missing: {},
      nulled: null,
    } as unknown as Record<string, { t: number }>;
    expect(cachedIdsSince(messy, 0)).toEqual(["good"]);
  });
});
