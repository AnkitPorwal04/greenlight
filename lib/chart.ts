export interface ChartPoint {
  x: number;
  y: number;
}

export interface CurveSegment {
  from: ChartPoint;
  c1: ChartPoint;
  c2: ChartPoint;
  to: ChartPoint;
}

const DECIMALS = 2;
const TANGENT_LIMIT = 3;

function fixed(value: number): string {
  return value.toFixed(DECIMALS);
}

function usable(points: ChartPoint[]): ChartPoint[] {
  return (Array.isArray(points) ? points : []).filter(
    (point) =>
      !!point && Number.isFinite(point.x) && Number.isFinite(point.y)
  );
}

function tangents(points: ChartPoint[]): number[] {
  const last = points.length - 1;

  const secants: number[] = [];
  for (let i = 0; i < last; i += 1) {
    const run = points[i + 1].x - points[i].x;
    secants.push(run > 0 ? (points[i + 1].y - points[i].y) / run : 0);
  }

  const slopes: number[] = [secants[0]];
  for (let i = 1; i < last; i += 1) {
    slopes.push((secants[i - 1] + secants[i]) / 2);
  }
  slopes.push(secants[last - 1]);

  for (let i = 0; i < last; i += 1) {
    const secant = secants[i];
    if (secant === 0) {
      slopes[i] = 0;
      slopes[i + 1] = 0;
      continue;
    }

    let left = slopes[i] / secant;
    let right = slopes[i + 1] / secant;
    if (left < 0) {
      slopes[i] = 0;
      left = 0;
    }
    if (right < 0) {
      slopes[i + 1] = 0;
      right = 0;
    }

    const reach = Math.hypot(left, right);
    if (reach > TANGENT_LIMIT) {
      const pull = TANGENT_LIMIT / reach;
      slopes[i] = pull * left * secant;
      slopes[i + 1] = pull * right * secant;
    }
  }

  return slopes;
}

export function curveSegments(points: ChartPoint[]): CurveSegment[] {
  const plotted = usable(points);
  if (plotted.length < 2) return [];

  const slopes = tangents(plotted);
  const segments: CurveSegment[] = [];
  for (let i = 0; i < plotted.length - 1; i += 1) {
    const reach = (plotted[i + 1].x - plotted[i].x) / 3;
    segments.push({
      from: plotted[i],
      c1: {
        x: plotted[i].x + reach,
        y: plotted[i].y + slopes[i] * reach,
      },
      c2: {
        x: plotted[i + 1].x - reach,
        y: plotted[i + 1].y - slopes[i + 1] * reach,
      },
      to: plotted[i + 1],
    });
  }
  return segments;
}

export function smoothLinePath(points: ChartPoint[]): string {
  const plotted = usable(points);
  if (plotted.length === 0) return "";

  const start = `M${fixed(plotted[0].x)} ${fixed(plotted[0].y)}`;
  if (plotted.length === 1) {
    return `${start} L${fixed(plotted[0].x)} ${fixed(plotted[0].y)}`;
  }

  const curves = curveSegments(plotted).map(
    (segment) =>
      `C${fixed(segment.c1.x)} ${fixed(segment.c1.y)} ${fixed(
        segment.c2.x
      )} ${fixed(segment.c2.y)} ${fixed(segment.to.x)} ${fixed(segment.to.y)}`
  );
  return [start, ...curves].join(" ");
}

export function smoothAreaPath(
  points: ChartPoint[],
  baseline: number
): string {
  const plotted = usable(points);
  const line = smoothLinePath(plotted);
  if (!line || !Number.isFinite(baseline)) return "";

  const first = plotted[0];
  const last = plotted[plotted.length - 1];
  return `${line} L${fixed(last.x)} ${fixed(baseline)} L${fixed(
    first.x
  )} ${fixed(baseline)} Z`;
}
