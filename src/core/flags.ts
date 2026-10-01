/**
 * Pixel masks stored as one byte per pixel (1 = inside, 0 = outside).
 * Used by the magic wand, the paint bucket and the background fill.
 */

/** Grow a mask by `r` pixels (square neighbourhood), in two separable passes. */
export function dilateFlags(m: ArrayLike<number>, w: number, h: number, r: number): Uint8Array<ArrayBuffer> {
  const t = new Uint8Array(w * h),
    o = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    let last = -1e9;
    for (let x = 0; x < w; x++) {
      if (m[y * w + x]) last = x;
      if (x - last <= r) t[y * w + x] = 1;
    }
    last = 1e9;
    for (let x = w - 1; x >= 0; x--) {
      if (m[y * w + x]) last = x;
      if (last - x <= r) t[y * w + x] = 1;
    }
  }
  for (let x = 0; x < w; x++) {
    let last = -1e9;
    for (let y = 0; y < h; y++) {
      if (t[y * w + x]) last = y;
      if (y - last <= r) o[y * w + x] = 1;
    }
    last = 1e9;
    for (let y = h - 1; y >= 0; y--) {
      if (t[y * w + x]) last = y;
      if (last - y <= r) o[y * w + x] = 1;
    }
  }
  return o;
}

export interface FloodResult {
  /** Top-left of the bounding box, in image pixels. */
  minX: number;
  minY: number;
  /** Size of the bounding box. */
  bw: number;
  bh: number;
  /** Mask cropped to the bounding box (`bw * bh`). */
  bf: Uint8Array<ArrayBuffer>;
}

/**
 * Pixels similar to the one at (ix, iy): each RGBA channel within `tol`.
 * Clicking a transparent pixel selects pixels whose alpha is within `tol`.
 * `contig` limits the result to the area connected to the start pixel.
 */
export function floodFlags(
  d: ArrayLike<number>,
  w: number,
  h: number,
  ix: number,
  iy: number,
  tol: number,
  contig: boolean,
): FloodResult | null {
  const s0 = (iy * w + ix) * 4,
    r0 = d[s0],
    g0 = d[s0 + 1],
    b0 = d[s0 + 2],
    a0 = d[s0 + 3];
  const match =
    a0 === 0
      ? (j: number) => d[j + 3] <= tol
      : (j: number) =>
          Math.abs(d[j] - r0) <= tol &&
          Math.abs(d[j + 1] - g0) <= tol &&
          Math.abs(d[j + 2] - b0) <= tol &&
          Math.abs(d[j + 3] - a0) <= tol;
  const n = w * h,
    f = new Uint8Array(n);
  let minX = w,
    minY = h,
    maxX = -1,
    maxY = -1;
  const grow = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };
  if (contig) {
    const st = new Int32Array(n);
    let sp = 0;
    const start = iy * w + ix;
    f[start] = 1;
    st[sp++] = start;
    while (sp) {
      const i = st[--sp],
        x = i % w,
        y = (i - x) / w;
      grow(x, y);
      const visit = (j: number) => {
        if (!f[j] && match(j * 4)) {
          f[j] = 1;
          st[sp++] = j;
        }
      };
      if (x > 0) visit(i - 1);
      if (x < w - 1) visit(i + 1);
      if (y > 0) visit(i - w);
      if (y < h - 1) visit(i + w);
    }
  } else {
    for (let i = 0; i < n; i++) {
      if (!match(i * 4)) continue;
      f[i] = 1;
      const x = i % w;
      grow(x, (i - x) / w);
    }
  }
  if (maxX < 0) return null;
  const bw = maxX - minX + 1,
    bh = maxY - minY + 1,
    bf = new Uint8Array(bw * bh);
  for (let y = 0; y < bh; y++) {
    const row = (y + minY) * w + minX;
    bf.set(f.subarray(row, row + bw), y * bw);
  }
  return { minX, minY, bw, bh, bf };
}

/** Mask of pixels whose alpha is above `threshold`; null when none are. */
export function alphaFlags(
  d: ArrayLike<number>,
  w: number,
  h: number,
  threshold = 10,
): Uint8Array<ArrayBuffer> | null {
  const f = new Uint8Array(w * h);
  let any = false;
  for (let i = 0; i < w * h; i++) {
    if (d[i * 4 + 3] > threshold) {
      f[i] = 1;
      any = true;
    }
  }
  return any ? f : null;
}

/**
 * Transparent pixels enclosed by the picture (holes left by cuts), as opposed to the open
 * transparent area around a cut-out. Grown by 2 px so the fill blends into the edge.
 */
export function interiorHoleFlags(
  d: ArrayLike<number>,
  w: number,
  h: number,
): Uint8Array<ArrayBuffer> | null {
  const n = w * h,
    tr = new Uint8Array(n);
  for (let i = 0; i < n; i++) tr[i] = d[i * 4 + 3] < 250 ? 1 : 0;
  // flood from the border: whatever transparency touches the edge is "outside"
  const out = new Uint8Array(n),
    st = new Int32Array(n);
  let sp = 0;
  const push = (i: number) => {
    if (tr[i] && !out[i]) {
      out[i] = 1;
      st[sp++] = i;
    }
  };
  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
  }
  while (sp) {
    const i = st[--sp],
      x = i % w;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (i >= w) push(i - w);
    if (i < n - w) push(i + w);
  }
  const f = new Uint8Array(n);
  let any = false;
  for (let i = 0; i < n; i++) {
    if (tr[i] && !out[i]) {
      f[i] = 1;
      any = true;
    }
  }
  return any ? dilateFlags(f, w, h, 2) : null;
}
