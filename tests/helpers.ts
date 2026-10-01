/** Shared helpers for the unit tests. */

/** Small seeded random generator (mulberry32), so inpainting runs are reproducible. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** RGBA image filled by `f(x, y) → [r, g, b, a]`. */
export function image(w: number, h: number, f: (x: number, y: number) => number[]): Uint8ClampedArray {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, g, b, a = 255] = f(x, y);
      d.set([r, g, b, a], (y * w + x) * 4);
    }
  return d;
}

/** One-byte-per-pixel mask from `f(x, y) → boolean`. */
export function mask(w: number, h: number, f: (x: number, y: number) => boolean): Uint8Array {
  const m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) m[y * w + x] = f(x, y) ? 1 : 0;
  return m;
}

export const count = (m: ArrayLike<number>): number => {
  let n = 0;
  for (let i = 0; i < m.length; i++) if (m[i]) n++;
  return n;
};
