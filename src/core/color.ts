import { clamp } from './geometry';

/** `#rrggbb` from 0–255 channels (rounded and clamped). */
export const toHex = (r: number, g: number, b: number): string =>
  '#' +
  [r, g, b]
    .map((v) =>
      Math.round(clamp(v, 0, 255))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('');

/** `[r, g, b]` from `#rrggbb`; invalid digits read as 0. */
export const hexToRgb = (h: string): [number, number, number] => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) || 0);
  return [r, g, b];
};

export const isHex = (h: string): boolean => /^#[0-9a-f]{6}$/i.test(h);

/**
 * "Colour to alpha" (the GIMP filter): the chosen colour becomes transparent while the
 * pixels around it keep their true colour and a soft alpha, so anti-aliased edges stay smooth.
 *
 * Works in place on RGBA bytes. `tolPct` (0–100) widens what counts as the background.
 * Returns how many pixels changed.
 */
export function colorToAlphaPixels(d: Uint8ClampedArray, hex: string, tolPct: number): number {
  const [br, bg, bb] = hexToRgb(hex).map((v) => v / 255);
  const t = tolPct / 100;
  // how far a channel is from the background colour, relative to how far it could go
  const comp = (c: number, b: number) =>
    c > b ? (b < 1 ? (c - b) / (1 - b) : 0) : c < b ? (b > 0 ? (b - c) / b : 0) : 0;
  let changed = 0;
  for (let i = 0; i < d.length; i += 4) {
    const a0 = d[i + 3];
    if (!a0) continue;
    const r = d[i] / 255,
      g = d[i + 1] / 255,
      b = d[i + 2] / 255;
    const a = Math.max(comp(r, br), comp(g, bg), comp(b, bb));
    const na = t > 0 ? clamp((a - t) / (1 - t), 0, 1) : a;
    if (na >= 0.999) continue;
    changed++;
    if (na <= 0) {
      d[i + 3] = 0;
      continue;
    }
    d[i] = ((r - br) / a + br) * 255;
    d[i + 1] = ((g - bg) / a + bg) * 255;
    d[i + 2] = ((b - bb) / a + bb) * 255;
    d[i + 3] = Math.round(na * a0);
  }
  return changed;
}
