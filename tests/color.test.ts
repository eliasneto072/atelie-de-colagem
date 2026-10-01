import { describe, expect, it } from 'vitest';
import { colorToAlphaPixels, hexToRgb, isHex, toHex } from '../src/core/color';

describe('hex colours', () => {
  it('converts both ways', () => {
    expect(toHex(242, 177, 63)).toBe('#f2b13f');
    expect(hexToRgb('#f2b13f')).toEqual([242, 177, 63]);
  });
  it('rounds and clamps channels', () => {
    expect(toHex(-5, 127.6, 300)).toBe('#0080ff');
  });
  it('validates #rrggbb only', () => {
    expect(isHex('#A0b1C2')).toBe(true);
    expect(isHex('#abc')).toBe(false);
    expect(isHex('a0b1c2')).toBe(false);
  });
});

const px = (...rgba: number[]) => new Uint8ClampedArray(rgba);

describe('colorToAlphaPixels', () => {
  it('makes the exact background colour transparent', () => {
    const d = px(255, 255, 255, 255);
    expect(colorToAlphaPixels(d, '#ffffff', 0)).toBe(1);
    expect(d[3]).toBe(0);
  });

  it('leaves pixels far from the background opaque and unchanged', () => {
    const d = px(0, 0, 0, 255);
    expect(colorToAlphaPixels(d, '#ffffff', 0)).toBe(0);
    expect([...d]).toEqual([0, 0, 0, 255]);
  });

  it('turns a blended edge into the true colour with partial alpha', () => {
    // 50% black over white = mid grey; it should come back as black at ~50% alpha
    const d = px(128, 128, 128, 255);
    colorToAlphaPixels(d, '#ffffff', 0);
    expect(d[0]).toBeLessThan(3);
    expect(d[3]).toBeGreaterThan(120);
    expect(d[3]).toBeLessThan(135);
  });

  it('removes near-background pixels when the tolerance grows', () => {
    const near = () => px(245, 245, 245, 255);
    const a = near();
    colorToAlphaPixels(a, '#ffffff', 0);
    expect(a[3]).toBeGreaterThan(0);
    const b = near();
    colorToAlphaPixels(b, '#ffffff', 10);
    expect(b[3]).toBe(0);
  });

  it('skips pixels that are already transparent', () => {
    const d = px(255, 255, 255, 0);
    expect(colorToAlphaPixels(d, '#ffffff', 0)).toBe(0);
  });
});
