import { describe, expect, it } from 'vitest';
import {
  bboxOf,
  boxPts,
  clamp,
  niceStep,
  pixelRect,
  pointInPoly,
  quadPts,
  resizeCursor,
} from '../src/core/geometry';

describe('clamp', () => {
  it('keeps values inside the range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-3, 0, 10)).toBe(0);
    expect(clamp(42, 0, 10)).toBe(10);
  });
});

describe('pointInPoly', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];
  it('finds points inside and outside a square', () => {
    expect(pointInPoly(square, 5, 5)).toBe(true);
    expect(pointInPoly(square, 15, 5)).toBe(false);
    expect(pointInPoly(square, -1, -1)).toBe(false);
  });
  it('handles a concave outline', () => {
    // a "U": the notch at the top middle is outside
    const u = [
      { x: 0, y: 0 },
      { x: 3, y: 0 },
      { x: 3, y: 6 },
      { x: 6, y: 6 },
      { x: 6, y: 0 },
      { x: 9, y: 0 },
      { x: 9, y: 9 },
      { x: 0, y: 9 },
    ];
    expect(pointInPoly(u, 4.5, 3)).toBe(false);
    expect(pointInPoly(u, 1.5, 3)).toBe(true);
    expect(pointInPoly(u, 4.5, 8)).toBe(true);
  });
});

describe('bboxOf', () => {
  it('accepts objects and tuples', () => {
    expect(
      bboxOf([
        { x: 2, y: 3 },
        { x: -1, y: 7 },
      ]),
    ).toEqual({ x: -1, y: 3, w: 3, h: 4 });
    expect(
      bboxOf([
        [5, 5],
        [9, 1],
      ]),
    ).toEqual({ x: 5, y: 1, w: 4, h: 4 });
  });
});

describe('boxPts', () => {
  it('snaps rectangles to whole pixels whatever the drag direction', () => {
    expect(boxPts('rect', { x: 10.6, y: 8.2 }, { x: 2.4, y: 1.5 })).toEqual([
      [2, 2],
      [11, 2],
      [11, 8],
      [2, 8],
    ]);
  });
  it('keeps ellipse points on the ellipse', () => {
    const pts = boxPts('ellipse', { x: 0, y: 0 }, { x: 20, y: 10 });
    expect(pts).toHaveLength(96);
    for (const [x, y] of pts) expect(((x - 10) / 10) ** 2 + ((y - 5) / 5) ** 2).toBeCloseTo(1, 6);
  });
});

describe('quadPts', () => {
  it('ends on the last point and skips the first', () => {
    const pts = quadPts([0, 0], [5, 10], [10, 0], 4);
    expect(pts).toHaveLength(4);
    expect(pts[3]).toEqual([10, 0]);
    expect(pts[1]).toEqual([5, 5]); // t = 0.5
  });
});

describe('niceStep', () => {
  it('rounds up to a readable ruler step', () => {
    expect(niceStep(0.3)).toBe(1);
    expect(niceStep(3)).toBe(5);
    expect(niceStep(21)).toBe(25);
    expect(niceStep(1e6)).toBe(10000);
  });
});

describe('resizeCursor', () => {
  it('matches the handle direction', () => {
    expect(resizeCursor(1, 0)).toBe('ew-resize');
    expect(resizeCursor(0, 1)).toBe('ns-resize');
    expect(resizeCursor(1, 1)).toBe('nwse-resize');
    expect(resizeCursor(-1, 1)).toBe('nesw-resize');
  });
});

describe('pixelRect', () => {
  it('covers an n×n square centred on the pointer', () => {
    expect(pixelRect(10.5, 10.5, 0.5)).toEqual({ n: 1, x0: 10, y0: 10 });
    expect(pixelRect(10, 10, 2)).toEqual({ n: 4, x0: 8, y0: 8 });
  });
});
