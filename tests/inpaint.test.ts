import { describe, expect, it } from 'vitest';
import { inpaint } from '../src/core/inpaint';
import { image, mask, seeded } from './helpers';

/** Mean absolute error over the RGB channels of the masked pixels. */
function holeError(a: ArrayLike<number>, b: ArrayLike<number>, m: Uint8Array): number {
  let sum = 0,
    n = 0;
  for (let i = 0; i < m.length; i++) {
    if (!m[i]) continue;
    for (let c = 0; c < 3; c++) sum += Math.abs(a[i * 4 + c] - b[i * 4 + c]);
    n += 3;
  }
  return sum / n;
}

const W = 96,
  H = 64;
const none = new Uint8Array(W * H);
// a "letter" sized hole in the middle
const hole = mask(W, H, (x, y) => x >= 40 && x < 58 && y >= 22 && y < 44);

describe('inpaint', () => {
  const gradient = image(W, H, (x, y) => [40 + x * 2, 60 + y, 200 - x]);

  it('never touches the pixels outside the hole', () => {
    const out = inpaint(gradient, W, H, hole, none, { random: seeded(1) });
    for (let i = 0; i < W * H; i++) {
      if (hole[i]) continue;
      for (let c = 0; c < 4; c++) expect(out[i * 4 + c]).toBe(gradient[i * 4 + c]);
    }
  });

  it('continues a smooth gradient through the hole', () => {
    const out = inpaint(gradient, W, H, hole, none, { random: seeded(2) });
    const err = holeError(out, gradient, hole);
    expect(err).toBeLessThan(4);
    // and the hole is opaque again
    for (let i = 0; i < W * H; i++) if (hole[i]) expect(out[i * 4 + 3]).toBe(255);
  });

  it('rebuilds a regular texture', () => {
    // vertical stripes, 6 px period
    const stripes = image(W, H, (x) => (x % 6 < 3 ? [230, 200, 80] : [40, 70, 120]));
    const out = inpaint(stripes, W, H, hole, none, { random: seeded(3) });
    const err = holeError(out, stripes, hole);
    // a blurry average would be ~95 off on every pixel
    expect(err).toBeLessThan(25);
  });

  it('is reproducible with a seeded random source', () => {
    const a = inpaint(gradient, W, H, hole, none, { random: seeded(7) });
    const b = inpaint(gradient, W, H, hole, none, { random: seeded(7) });
    expect(a).toEqual(b);
  });

  it('does not copy from pixels marked as bad', () => {
    // left half is red and marked bad; the fill must come from the blue right half
    const img = image(W, H, (x) => (x < 30 ? [255, 0, 0] : [0, 0, 255]));
    const bad = mask(W, H, (x) => x < 30);
    const out = inpaint(img, W, H, hole, bad, { random: seeded(4) });
    let red = 0;
    for (let i = 0; i < W * H; i++) if (hole[i] && out[i * 4] > 128) red++;
    expect(red).toBe(0);
  });
});
