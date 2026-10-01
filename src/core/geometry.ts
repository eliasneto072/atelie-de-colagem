/** Small geometry helpers shared by the editor and the tests. No DOM access. */

export interface Vec {
  x: number;
  y: number;
}

/** A point stored as a tuple, used for selection outlines. */
export type Pt = [number, number];

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

export const dist = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y);

/** Even-odd point-in-polygon test. */
export function pointInPoly(pts: readonly Vec[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i],
      b = pts[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Axis-aligned bounding box of points given either as `{x, y}` or `[x, y]`. */
export function bboxOf(pts: ReadonlyArray<Vec | Pt>): Box {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const p of pts) {
    const x = Array.isArray(p) ? p[0] : (p as Vec).x;
    const y = Array.isArray(p) ? p[1] : (p as Vec).y;
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Rectangle or ellipse outline between two corners, snapped to whole pixels so cuts line up. */
export function boxPts(kind: 'rect' | 'ellipse', a: Vec, b: Vec): Pt[] {
  const x0 = Math.round(Math.min(a.x, b.x)),
    y0 = Math.round(Math.min(a.y, b.y)),
    x1 = Math.round(Math.max(a.x, b.x)),
    y1 = Math.round(Math.max(a.y, b.y));
  if (kind === 'rect') {
    return [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ];
  }
  const cx = (x0 + x1) / 2,
    cy = (y0 + y1) / 2,
    rx = (x1 - x0) / 2,
    ry = (y1 - y0) / 2,
    n = 96,
    pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    pts.push([cx + Math.cos(t) * rx, cy + Math.sin(t) * ry]);
  }
  return pts;
}

/** Points along a quadratic Bézier curve, excluding the start point. */
export function quadPts(p0: Pt, c: Pt, p1: Pt, n: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n,
      u = 1 - t;
    out.push([
      u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0],
      u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1],
    ]);
  }
  return out;
}

/** Ruler tick spacing: the smallest "nice" step that is at least `min`. */
export function niceStep(min: number): number {
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000];
  return steps.find((v) => v >= min) ?? 10000;
}

/** Pick a CSS resize cursor for a handle that sits in direction (dx, dy) from the centre. */
export function resizeCursor(dx: number, dy: number): string {
  const a = ((((Math.atan2(dy, dx) * 180) / Math.PI) % 180) + 180) % 180;
  return a < 22.5 || a >= 157.5
    ? 'ew-resize'
    : a < 67.5
      ? 'nwse-resize'
      : a < 112.5
        ? 'ns-resize'
        : 'nesw-resize';
}

/** Square of pixels a pixel-tip brush of radius `r` covers around (lx, ly). */
export function pixelRect(lx: number, ly: number, r: number): { n: number; x0: number; y0: number } {
  const n = Math.max(1, Math.round(r * 2));
  return { n, x0: Math.floor(lx - (n - 1) / 2), y0: Math.floor(ly - (n - 1) / 2) };
}
