import { describe, expect, it } from 'vitest';
import { alignDelta, boxCandidates, guideLines, snapAxis, type Bounds } from '../src/core/snap';

const box = (x0: number, y0: number, w: number, h: number): Bounds => ({
  x0,
  y0,
  x1: x0 + w,
  y1: y0 + h,
  cx: x0 + w / 2,
  cy: y0 + h / 2,
});

describe('boxCandidates', () => {
  it('offers start, centre and end on each axis', () => {
    const { xs, ys } = boxCandidates(box(0, 0, 100, 50));
    expect(xs.map((c) => c.v)).toEqual([0, 50, 100]);
    expect(ys.map((c) => c.v)).toEqual([0, 25, 50]);
    expect(xs[0]).toMatchObject({ from: 0, to: 50 });
  });
});

describe('snapAxis', () => {
  const canvas = boxCandidates(box(0, 0, 1000, 600));
  const offsets = [0, 50, 100]; // a 100 px wide box: left, centre, right

  it('pulls the nearest line onto a candidate within the threshold', () => {
    // centre at 503 → snaps to the canvas centre 500
    expect(snapAxis(453, offsets, canvas.xs, 6)).toBe(-3);
  });

  it('prefers the smallest correction', () => {
    // left at 2 (→ 0 needs -2) and right at 102: only the left edge is close
    expect(snapAxis(2, offsets, canvas.xs, 6)).toBe(-2);
  });

  it('does nothing when no line is close', () => {
    expect(snapAxis(200, offsets, canvas.xs, 6)).toBe(0);
  });
});

describe('guideLines', () => {
  it('draws a guide for every touching line, spanning both boxes', () => {
    const cands = boxCandidates(box(0, 100, 1000, 200)).xs;
    const lines = guideLines(450, [0, 50, 100], cands, 20, 60, true);
    expect(lines).toEqual([{ v: true, at: 500, from: 20, to: 300 }]);
  });
});

describe('alignDelta', () => {
  const target = box(0, 0, 1000, 600);
  const moving = box(100, 100, 200, 100);
  it.each([
    ['left', -100, 0],
    ['hcenter', 300, 0],
    ['right', 700, 0],
    ['top', 0, -100],
    ['vcenter', 0, 150],
    ['bottom', 0, 400],
    ['center', 300, 150],
  ] as const)('%s', (mode, dx, dy) => {
    expect(alignDelta(mode, target, moving)).toEqual({ dx, dy });
  });
});
