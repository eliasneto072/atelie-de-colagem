/** Smart-guide snapping: pure maths, no DOM. */

/** A line something can snap to: position `v` on one axis, spanning `from`–`to` on the other. */
export interface SnapCandidate {
  v: number;
  from: number;
  to: number;
}

/** A guide to draw: vertical (`v: true`, at x = `at`) or horizontal (at y = `at`). */
export interface Guide {
  v: boolean;
  at: number;
  from: number;
  to: number;
}

export interface Bounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  cx: number;
  cy: number;
}

/** The three lines of a box on each axis: start, centre and end. */
export function boxCandidates(b: Bounds): { xs: SnapCandidate[]; ys: SnapCandidate[] } {
  return {
    xs: [b.x0, b.cx, b.x1].map((v) => ({ v, from: b.y0, to: b.y1 })),
    ys: [b.y0, b.cy, b.y1].map((v) => ({ v, from: b.x0, to: b.x1 })),
  };
}

/**
 * Smallest correction that puts one of the moving box's lines (`pos + offset`) on a candidate
 * within `threshold`. Returns 0 when nothing is close enough.
 */
export function snapAxis(
  pos: number,
  offsets: readonly number[],
  cands: readonly SnapCandidate[],
  threshold: number,
): number {
  let best: number | null = null;
  for (const o of offsets) {
    for (const c of cands) {
      const d = c.v - (pos + o);
      if (Math.abs(d) <= threshold && (best === null || Math.abs(d) < Math.abs(best))) best = d;
    }
  }
  return best ?? 0;
}

/** Guides for every candidate the moving box now touches, long enough to cover both boxes. */
export function guideLines(
  pos: number,
  offsets: readonly number[],
  cands: readonly SnapCandidate[],
  mine0: number,
  mine1: number,
  vertical: boolean,
): Guide[] {
  const out: Guide[] = [];
  for (const o of offsets) {
    for (const c of cands) {
      if (Math.abs(c.v - (pos + o)) < 0.5) {
        out.push({ v: vertical, at: c.v, from: Math.min(c.from, mine0), to: Math.max(c.to, mine1) });
      }
    }
  }
  return out;
}

export type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom' | 'center';

/** How far to move box `m` so it lines up with box `t`. */
export function alignDelta(mode: AlignMode, t: Bounds, m: Bounds): { dx: number; dy: number } {
  switch (mode) {
    case 'left':
      return { dx: t.x0 - m.x0, dy: 0 };
    case 'hcenter':
      return { dx: t.cx - m.cx, dy: 0 };
    case 'right':
      return { dx: t.x1 - m.x1, dy: 0 };
    case 'top':
      return { dx: 0, dy: t.y0 - m.y0 };
    case 'vcenter':
      return { dx: 0, dy: t.cy - m.cy };
    case 'bottom':
      return { dx: 0, dy: t.y1 - m.y1 };
    case 'center':
      return { dx: t.cx - m.cx, dy: t.cy - m.cy };
  }
}
