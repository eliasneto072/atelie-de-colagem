import { describe, expect, it } from 'vitest';
import { alphaFlags, dilateFlags, floodFlags, interiorHoleFlags } from '../src/core/flags';
import { count, image, mask } from './helpers';

describe('dilateFlags', () => {
  it('grows a single pixel into a square', () => {
    const m = mask(9, 9, (x, y) => x === 4 && y === 4);
    const g = dilateFlags(m, 9, 9, 2);
    expect(count(g)).toBe(25);
    expect(g[2 * 9 + 2]).toBe(1);
    expect(g[1 * 9 + 4]).toBe(0);
  });
  it('clips at the image border', () => {
    const g = dilateFlags(
      mask(5, 5, (x, y) => x === 0 && y === 0),
      5,
      5,
      1,
    );
    expect(count(g)).toBe(4);
  });
});

describe('floodFlags', () => {
  // two red squares on white, not touching
  const W = 12,
    H = 6;
  const red = (x: number, y: number) => y >= 1 && y <= 4 && ((x >= 1 && x <= 3) || (x >= 8 && x <= 10));
  const img = image(W, H, (x, y) => (red(x, y) ? [220, 30, 30] : [255, 255, 255]));

  it('selects only the connected area in contiguous mode', () => {
    const r = floodFlags(img, W, H, 2, 2, 10, true)!;
    expect(r).toMatchObject({ minX: 1, minY: 1, bw: 3, bh: 4 });
    expect(count(r.bf)).toBe(12);
  });

  it('selects every similar pixel in global mode', () => {
    const r = floodFlags(img, W, H, 2, 2, 10, false)!;
    expect(r).toMatchObject({ minX: 1, minY: 1, bw: 10, bh: 4 });
    expect(count(r.bf)).toBe(24);
  });

  it('respects the tolerance', () => {
    const grad = image(10, 1, (x) => [x * 10, 0, 0]);
    expect(count(floodFlags(grad, 10, 1, 0, 0, 0, true)!.bf)).toBe(1);
    expect(count(floodFlags(grad, 10, 1, 0, 0, 25, true)!.bf)).toBe(3);
  });

  it('matches transparent pixels by alpha only', () => {
    const d = image(4, 1, (x) => (x < 2 ? [10, 200, 30, 0] : [0, 0, 0, 255]));
    d.set([255, 0, 0, 0], 4); // different colour, still transparent
    expect(count(floodFlags(d, 4, 1, 0, 0, 5, true)!.bf)).toBe(2);
  });
});

describe('alphaFlags', () => {
  it('marks visible pixels and returns null for an empty layer', () => {
    const d = image(3, 1, (x) => [0, 0, 0, x === 1 ? 255 : 5]);
    expect([...alphaFlags(d, 3, 1)!]).toEqual([0, 1, 0]);
    expect(
      alphaFlags(
        image(3, 1, () => [0, 0, 0, 0]),
        3,
        1,
      ),
    ).toBeNull();
  });
});

describe('interiorHoleFlags', () => {
  it('finds a hole cut inside the picture, not the open space around it', () => {
    const W = 20,
      H = 20;
    // opaque picture with a transparent margin and a 4×4 hole in the middle
    const d = image(W, H, (x, y) => {
      const margin = x < 2 || y < 2 || x > 17 || y > 17;
      const hole = x >= 8 && x < 12 && y >= 8 && y < 12;
      return [100, 100, 100, margin || hole ? 0 : 255];
    });
    const f = interiorHoleFlags(d, W, H)!;
    expect(f).not.toBeNull();
    expect(f[10 * W + 10]).toBe(1); // inside the hole
    expect(f[7 * W + 7]).toBe(1); // grown by 2 px
    expect(f[0]).toBe(0); // open margin is not a hole
    expect(f[4 * W + 4]).toBe(0); // far from the hole
  });

  it('returns null when nothing is enclosed', () => {
    const d = image(6, 6, (x) => [0, 0, 0, x < 2 ? 0 : 255]);
    expect(interiorHoleFlags(d, 6, 6)).toBeNull();
  });
});
