import { describe, it, expect } from "vitest";
import {
  curveSegments,
  smoothAreaPath,
  smoothLinePath,
  type ChartPoint,
  type CurveSegment,
} from "./chart";

const CHART_WIDTH = 300;
const CHART_TOP = 6;
const CHART_BASELINE = 82;

function plot(people: number[], ceiling: number): ChartPoint[] {
  return people.map((count, i) => ({
    x: ((i + 0.5) / people.length) * CHART_WIDTH,
    y: CHART_BASELINE - (count / ceiling) * (CHART_BASELINE - CHART_TOP),
  }));
}

function alongSegment(segment: CurveSegment, t: number): ChartPoint {
  const u = 1 - t;
  const blend = (a: number, b: number, c: number, d: number) =>
    u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
  return {
    x: blend(segment.from.x, segment.c1.x, segment.c2.x, segment.to.x),
    y: blend(segment.from.y, segment.c1.y, segment.c2.y, segment.to.y),
  };
}

function sample(points: ChartPoint[], steps = 64): ChartPoint[] {
  const drawn: ChartPoint[] = [];
  for (const segment of curveSegments(points)) {
    for (let step = 0; step <= steps; step += 1) {
      drawn.push(alongSegment(segment, step / steps));
    }
  }
  return drawn;
}

const NOT_A_NUMBER = /NaN|Infinity|undefined|null/;

describe("smoothLinePath", () => {
  it("has nothing to draw without any points", () => {
    expect(smoothLinePath([])).toBe("");
    expect(curveSegments([])).toEqual([]);
  });

  it("still draws a readable mark for a single day", () => {
    const d = smoothLinePath([{ x: 10, y: 20 }]);

    expect(d).toBe("M10.00 20.00 L10.00 20.00");
    expect(d).not.toMatch(NOT_A_NUMBER);
  });

  it("starts at the first day and ends on the last", () => {
    const points = plot([0, 3, 1], 3);
    const d = smoothLinePath(points);

    expect(d.startsWith(`M${points[0].x.toFixed(2)}`)).toBe(true);
    expect(
      d.endsWith(`${points[2].x.toFixed(2)} ${points[2].y.toFixed(2)}`)
    ).toBe(true);
  });

  it("passes through every plotted day exactly", () => {
    const points = plot([0, 0, 4, 0, 1, 2, 0], 4);
    const segments = curveSegments(points);

    expect(segments).toHaveLength(points.length - 1);
    segments.forEach((segment, i) => {
      expect(alongSegment(segment, 0).y).toBeCloseTo(points[i].y, 9);
      expect(alongSegment(segment, 1).y).toBeCloseTo(points[i + 1].y, 9);
      expect(alongSegment(segment, 0).x).toBeCloseTo(points[i].x, 9);
    });
  });

  it("never dips below the baseline on spiky days", () => {
    const points = plot([0, 0, 4, 0, 1, 0, 0, 3, 0], 4);

    for (const drawn of sample(points)) {
      expect(drawn.y).toBeLessThanOrEqual(CHART_BASELINE + 1e-9);
    }
  });

  it("never climbs above the top tick", () => {
    const months = [
      [0, 0, 4, 0, 1, 0, 0, 3, 0],
      [0, 1, 4, 4, 0, 2, 0],
      [0, 2, 4, 4, 4, 1, 0],
      [0, 1, 3, 4, 4, 0],
    ];

    for (const people of months) {
      for (const drawn of sample(plot(people, 4))) {
        expect(drawn.y).toBeGreaterThanOrEqual(CHART_TOP - 1e-9);
      }
    }
  });

  it("never dips below the baseline on a busy month either", () => {
    const months = [
      [0, 1, 4, 4, 0, 2, 0],
      [0, 0, 1, 4, 0, 0],
      [4, 0, 0, 4, 0, 0, 4],
    ];

    for (const people of months) {
      for (const drawn of sample(plot(people, 4))) {
        expect(drawn.y).toBeLessThanOrEqual(CHART_BASELINE + 1e-9);
      }
    }
  });

  it("stays inside the two days either side of it, everywhere", () => {
    const months = [
      [0, 0, 4, 0, 1, 0, 0, 3, 0, 2, 2, 0],
      [0, 1, 4, 4, 0, 2, 0],
      [0, 2, 4, 4, 4, 1, 0],
      [3, 0, 0, 0, 3, 3, 1, 0, 5, 0],
      [0, 6, 7, 7, 0],
      [7, 7, 6, 0],
      [0, 0, 6, 7, 7, 0],
    ];

    for (const people of months) {
      curveSegments(plot(people, 9)).forEach((segment) => {
        const low = Math.min(segment.from.y, segment.to.y);
        const high = Math.max(segment.from.y, segment.to.y);
        for (let step = 0; step <= 64; step += 1) {
          const drawn = alongSegment(segment, step / 64);
          expect(drawn.y).toBeGreaterThanOrEqual(low - 1e-9);
          expect(drawn.y).toBeLessThanOrEqual(high + 1e-9);
        }
      });
    }
  });

  it("does not bulge past a day only slightly busier than the one before", () => {
    const points = plot([0, 6, 7, 7, 0], 7);
    const highest = Math.min(...points.map((point) => point.y));

    for (const drawn of sample(points)) {
      expect(drawn.y).toBeGreaterThanOrEqual(highest - 1e-9);
      expect(drawn.y).toBeGreaterThanOrEqual(CHART_TOP - 1e-9);
    }
  });

  it("keeps a run of rising days rising, with no wobble back down", () => {
    const drawn = sample(plot([0, 1, 2, 3, 4], 4));

    for (let i = 1; i < drawn.length; i += 1) {
      expect(drawn[i].y).toBeLessThanOrEqual(drawn[i - 1].y + 1e-9);
    }
  });

  it("keeps a run of falling days falling", () => {
    const drawn = sample(plot([4, 3, 2, 1, 0], 4));

    for (let i = 1; i < drawn.length; i += 1) {
      expect(drawn[i].y).toBeGreaterThanOrEqual(drawn[i - 1].y - 1e-9);
    }
  });

  it("meets every day at the same angle from both sides", () => {
    const segments = curveSegments(plot([0, 1, 3, 2, 4, 4, 1], 4));

    for (let i = 1; i < segments.length; i += 1) {
      const before = segments[i - 1];
      const after = segments[i];
      const incoming = (before.to.y - before.c2.y) / (before.to.x - before.c2.x);
      const outgoing = (after.c1.y - after.from.y) / (after.c1.x - after.from.x);

      expect(outgoing).toBeCloseTo(incoming, 9);
    }

    expect(
      segments.some((segment) => Math.abs(segment.c1.y - segment.from.y) > 1e-6)
    ).toBe(true);
    expect(
      segments.some((segment) => Math.abs(segment.c2.y - segment.to.y) > 1e-6)
    ).toBe(true);
  });

  it("bends between days instead of cornering at them", () => {
    const points = plot([0, 1, 3, 2, 4, 1], 4);
    const chords = curveSegments(points).map((segment) => {
      const middle = alongSegment(segment, 0.5);
      return Math.abs(middle.y - (segment.from.y + segment.to.y) / 2);
    });

    expect(Math.max(...chords)).toBeGreaterThan(0.5);
  });

  it("draws a flat line through days that all read the same", () => {
    const points = plot([2, 2, 2, 2], 4);

    for (const drawn of sample(points)) {
      expect(drawn.y).toBeCloseTo(points[0].y, 9);
    }
  });

  it("flattens out on the quiet days either side of a lone spike", () => {
    const points = plot([0, 0, 0, 5, 0, 0, 0], 5);
    const segments = curveSegments(points);

    expect(segments[0].c1.y).toBeCloseTo(CHART_BASELINE, 9);
    expect(segments[0].c2.y).toBeCloseTo(CHART_BASELINE, 9);
    for (const drawn of sample(points)) {
      expect(drawn.y).toBeLessThanOrEqual(CHART_BASELINE + 1e-9);
    }
  });

  it("draws a month where nobody was off as a flat line on the baseline", () => {
    const points = plot(new Array(30).fill(0), 1);
    const d = smoothLinePath(points);

    expect(d).not.toMatch(NOT_A_NUMBER);
    expect(d.includes(`${CHART_BASELINE.toFixed(2)}`)).toBe(true);
    for (const drawn of sample(points)) {
      expect(drawn.y).toBeCloseTo(CHART_BASELINE, 9);
    }
  });

  it("emits a usable path for every month length", () => {
    for (const days of [28, 29, 30, 31]) {
      const people = Array.from({ length: days }, (_, i) => (i % 7 === 3 ? 4 : 0));
      const points = plot(people, 4);
      const d = smoothLinePath(points);

      expect(d).not.toMatch(NOT_A_NUMBER);
      expect(d.startsWith("M")).toBe(true);
      expect(d.split("C")).toHaveLength(days);
    }
  });

  it("ignores days whose coordinates are not real numbers", () => {
    const d = smoothLinePath([
      { x: 0, y: 10 },
      { x: Number.NaN, y: 20 },
      { x: 20, y: Number.POSITIVE_INFINITY },
      { x: 30, y: 40 },
    ]);

    expect(d).not.toMatch(NOT_A_NUMBER);
    expect(d).toBe("M0.00 10.00 C10.00 20.00 20.00 30.00 30.00 40.00");
  });

  it("does not blow up when two days land on the same spot", () => {
    const d = smoothLinePath([
      { x: 10, y: 40 },
      { x: 10, y: 20 },
      { x: 20, y: 20 },
    ]);

    expect(d).not.toMatch(NOT_A_NUMBER);
  });
});

describe("smoothAreaPath", () => {
  it("has nothing to fill without any points", () => {
    expect(smoothAreaPath([], CHART_BASELINE)).toBe("");
  });

  it("has nothing to fill without a real baseline", () => {
    const points = plot([0, 2, 0], 2);

    expect(smoothAreaPath(points, Number.NaN)).toBe("");
    expect(smoothAreaPath(points, Number.POSITIVE_INFINITY)).toBe("");
  });

  it("drops to the baseline at both ends and closes", () => {
    const points = plot([0, 2, 1], 2);
    const area = smoothAreaPath(points, CHART_BASELINE);

    expect(area.startsWith(smoothLinePath(points))).toBe(true);
    expect(area).toBe(
      `${smoothLinePath(points)} L${points[2].x.toFixed(2)} 82.00 L${points[0].x.toFixed(
        2
      )} 82.00 Z`
    );
  });

  it("follows the same curve the line does", () => {
    const points = plot([0, 0, 4, 0, 1], 4);
    const area = smoothAreaPath(points, CHART_BASELINE);

    expect(area).not.toMatch(NOT_A_NUMBER);
    expect(area.split("C")).toHaveLength(points.length);
  });
});
