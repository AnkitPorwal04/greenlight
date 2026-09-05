import { describe, expect, it } from "vitest";
import { cachedIdsSince, resolveWindowRefs } from "./cached-window";

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

describe("resolveWindowRefs", () => {
  const entries = {
    a: { t: 1_000, m: { threadId: "ta" } },
    b: { t: 3_000, m: { threadId: "tb" } },
    c: { t: 5_000, m: { threadId: "tc" } },
    d: { t: 7_000, m: { threadId: "td" } },
  };
  const cachedIds = ["d", "c", "b", "a"];

  const ids = (refs: { id: string }[]) => refs.map((r) => r.id);

  it("serves cached ids when the detector says nothing changed", () => {
    const refs = resolveWindowRefs({
      scan: false,
      degraded: false,
      listed: [],
      cachedIds,
      entries,
      cap: 500,
    });
    expect(refs).toEqual([
      { id: "d", threadId: "td" },
      { id: "c", threadId: "tc" },
      { id: "b", threadId: "tb" },
      { id: "a", threadId: "ta" },
    ]);
  });

  it("returns the listing untouched on a healthy scan", () => {
    const listed = [
      { id: "b", threadId: "fresh-b" },
      { id: "d", threadId: "fresh-d" },
    ];
    const refs = resolveWindowRefs({
      scan: true,
      degraded: false,
      listed,
      cachedIds,
      entries,
      cap: 500,
    });
    expect(refs).toEqual(listed);
  });

  it("does not reorder a healthy scan even when the cache disagrees", () => {
    const listed = [{ id: "a" }, { id: "d" }, { id: "c" }];
    const refs = resolveWindowRefs({
      scan: true,
      degraded: false,
      listed,
      cachedIds,
      entries,
      cap: 500,
    });
    expect(ids(refs)).toEqual(["a", "d", "c"]);
  });

  it("falls back to cache when the scan was refused before its first page", () => {
    const refs = resolveWindowRefs({
      scan: true,
      degraded: true,
      listed: [],
      cachedIds,
      entries,
      cap: 500,
    });
    expect(ids(refs)).toEqual(["d", "c", "b", "a"]);
  });

  it("merges a short listing into the cache in one newest-first run", () => {
    const refs = resolveWindowRefs({
      scan: true,
      degraded: true,
      listed: [{ id: "fresh" }, { id: "d" }, { id: "b" }],
      cachedIds,
      entries,
      cap: 500,
    });
    expect(ids(refs)).toEqual(["fresh", "d", "c", "b", "a"]);
  });

  it("keeps genuinely new mail the cache has never seen", () => {
    const refs = resolveWindowRefs({
      scan: true,
      degraded: true,
      listed: [{ id: "brand-new", threadId: "tn" }],
      cachedIds,
      entries,
      cap: 500,
    });
    expect(ids(refs)).toContain("brand-new");
    expect(refs[0]).toEqual({ id: "brand-new", threadId: "tn" });
  });

  it("orders unknown-timestamp ids first, in the order the listing gave them", () => {
    const refs = resolveWindowRefs({
      scan: true,
      degraded: true,
      listed: [{ id: "n1" }, { id: "n2" }, { id: "n3" }],
      cachedIds,
      entries,
      cap: 500,
    });
    expect(ids(refs)).toEqual(["n1", "n2", "n3", "d", "c", "b", "a"]);
  });

  it("prefers the listing's threadId and falls back to the cached one", () => {
    const refs = resolveWindowRefs({
      scan: true,
      degraded: true,
      listed: [
        { id: "d", threadId: "fresh-d" },
        { id: "c" },
      ],
      cachedIds,
      entries,
      cap: 500,
    });
    expect(refs).toEqual([
      { id: "d", threadId: "fresh-d" },
      { id: "c", threadId: "tc" },
      { id: "b", threadId: "tb" },
      { id: "a", threadId: "ta" },
    ]);
  });

  it("truncates the union from the oldest end at the cap", () => {
    const refs = resolveWindowRefs({
      scan: true,
      degraded: true,
      listed: [{ id: "fresh" }],
      cachedIds,
      entries,
      cap: 3,
    });
    expect(ids(refs)).toEqual(["fresh", "d", "c"]);
  });

  it("returns nothing when the cap is zero", () => {
    const refs = resolveWindowRefs({
      scan: true,
      degraded: true,
      listed: [{ id: "fresh" }],
      cachedIds,
      entries,
      cap: 0,
    });
    expect(refs).toEqual([]);
  });

  it("keeps the union free of duplicates", () => {
    const refs = resolveWindowRefs({
      scan: true,
      degraded: true,
      listed: [{ id: "d" }, { id: "d" }, { id: "c" }],
      cachedIds,
      entries,
      cap: 500,
    });
    expect(ids(refs)).toEqual(["d", "c", "b", "a"]);
  });

  it("breaks timestamp ties the way cachedIdsSince does", () => {
    const tied = { y: { t: 5 }, x: { t: 5 } };
    const refs = resolveWindowRefs({
      scan: true,
      degraded: true,
      listed: [{ id: "y" }],
      cachedIds: ["x", "y"],
      entries: tied,
      cap: 500,
    });
    expect(ids(refs)).toEqual(["x", "y"]);
  });

  it("degrades to the listing alone when the cache is cold", () => {
    const refs = resolveWindowRefs({
      scan: true,
      degraded: true,
      listed: [{ id: "one" }, { id: "two" }],
      cachedIds: [],
      entries: {},
      cap: 500,
    });
    expect(ids(refs)).toEqual(["one", "two"]);
  });

  it("skips empty ids rather than emitting them", () => {
    const refs = resolveWindowRefs({
      scan: true,
      degraded: true,
      listed: [{ id: "" }, { id: "d" }],
      cachedIds: ["", "c"],
      entries,
      cap: 500,
    });
    expect(ids(refs)).toEqual(["d", "c"]);
  });

  it("treats a cached id with an unusable timestamp as fresher than none", () => {
    const messy = {
      good: { t: 10 },
      broken: { t: Number.NaN },
    } as unknown as Record<string, { t: number }>;
    const refs = resolveWindowRefs({
      scan: true,
      degraded: true,
      listed: [{ id: "broken" }],
      cachedIds: ["good"],
      entries: messy,
      cap: 500,
    });
    expect(ids(refs)).toEqual(["broken", "good"]);
  });
});
