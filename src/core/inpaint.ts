/**
 * Content-aware fill ("rebuild the background").
 *
 * Multi-scale PatchMatch (Barnes et al., 2009) with EM-style voting (Wexler et al., 2007):
 * every missing pixel is rebuilt from 7×7 patches copied from the rest of the image,
 * coarse to fine. A smooth (harmonic) fill then corrects the low frequencies, so smooth
 * gradients come out smooth while textures keep their grain.
 *
 * Pure function: no DOM, safe to run inside a Web Worker. See docs/ARQUITETURA.md.
 */
import { dilateFlags } from './flags';

export interface InpaintOptions {
  /** Random source in [0, 1). Inject a seeded one for reproducible runs. */
  random?: () => number;
}

interface Level {
  w: number;
  h: number;
  /** Premultiplied RGBA, channels 0–255. */
  img: Float32Array;
  hole: Uint8Array;
  bad: Uint8Array;
  valid?: Uint8Array;
  validList?: Int32Array;
  targets?: Int32Array;
}

interface PreparedLevel extends Level {
  valid: Uint8Array;
  validList: Int32Array;
  targets: Int32Array;
}

interface SimpleLevel {
  w: number;
  h: number;
  img: Float32Array;
  hole: Uint8Array;
}

/** Tuned on smooth gradients, noise textures and regular brick walls. */
const TUNING = {
  /** EM iterations at the finest, second-finest and coarser levels. */
  emFinest: 4,
  emSecond: 6,
  emCoarse: 10,
  /** Percentile of patch distances that sets the vote weighting. */
  votePercentile: 0.75,
  /** Random restarts at the coarsest level; the lowest-energy one wins. */
  restarts: 4,
  /** Full coarse-to-second-finest drafts; only the best one is refined at full size. */
  drafts: 3,
};
const R = 3; // patch radius → 7×7 patches
const PS = 2 * R + 1;

/**
 * @param src  RGBA bytes, `W * H * 4`.
 * @param hole1 1 = pixel to rebuild.
 * @param bad1  1 = pixel that must not be copied from (e.g. transparent), besides the hole.
 * @returns A copy of `src` with the hole filled in.
 */
export function inpaint(
  src: ArrayLike<number>,
  W: number,
  H: number,
  hole1: Uint8Array,
  bad1: Uint8Array,
  options: InpaintOptions = {},
): Uint8ClampedArray<ArrayBuffer> {
  const rand = options.random ?? Math.random;

  const n0 = W * H,
    img0 = new Float32Array(n0 * 4);
  for (let i = 0; i < n0; i++) {
    const a = src[i * 4 + 3],
      k = a / 255;
    img0[i * 4] = src[i * 4] * k;
    img0[i * 4 + 1] = src[i * 4 + 1] * k;
    img0[i * 4 + 2] = src[i * 4 + 2] * k;
    img0[i * 4 + 3] = a;
  }
  const bad0 = new Uint8Array(n0);
  for (let i = 0; i < n0; i++) bad0[i] = bad1[i] || hole1[i] ? 1 : 0;

  // ---- image pyramid: halve until the hole is about one patch wide ----
  const levels: Level[] = [{ w: W, h: H, img: img0, hole: hole1, bad: bad0 }];
  while (levels.length < 9) {
    const L = levels[levels.length - 1],
      bb = holeBox(L);
    if (!bb || Math.max(bb.w, bb.h) <= PS) break;
    const w = L.w >> 1,
      h = L.h >> 1;
    if (w < PS * 3 || h < PS * 3) break;
    const img = new Float32Array(w * h * 4),
      hole = new Uint8Array(w * h),
      bad = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        let hh = 0,
          bd = 0;
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            const j = (2 * y + dy) * L.w + 2 * x + dx;
            hh |= L.hole[j];
            bd |= L.bad[j];
            for (let c = 0; c < 4; c++) img[i * 4 + c] += L.img[j * 4 + c] * 0.25;
          }
        }
        hole[i] = hh;
        bad[i] = bd | hh;
      }
    }
    levels.push({ w, h, img, hole, bad });
  }

  function prepare(L: Level): PreparedLevel {
    if (L.valid && L.validList && L.targets) return L as PreparedLevel;
    const { w, h } = L,
      near = dilateFlags(L.hole, w, h, R),
      badD = dilateFlags(L.bad, w, h, R);
    const valid = new Uint8Array(w * h),
      vl: number[] = [],
      tg: number[] = [];
    // a source patch must sit fully inside the image and away from anything unusable
    for (let y = R; y < h - R; y++) {
      for (let x = R; x < w - R; x++) {
        const i = y * w + x;
        if (!badD[i]) {
          valid[i] = 1;
          vl.push(i);
        }
      }
    }
    for (let i = 0; i < w * h; i++) if (near[i]) tg.push(i);
    L.valid = valid;
    L.validList = Int32Array.from(vl);
    L.targets = Int32Array.from(tg);
    return L as PreparedLevel;
  }

  /** Sum of squared differences between the patches around t and s (stops early past maxD). */
  function patchDist(L: Level, t: number, s: number, maxD: number): number {
    const w = L.w,
      h = L.h,
      img = L.img,
      tx = t % w,
      ty = (t - tx) / w,
      sx = s % w,
      sy = (s - sx) / w;
    let d = 0;
    for (let dy = -R; dy <= R; dy++) {
      const ty2 = ty + dy;
      if (ty2 < 0 || ty2 >= h) continue;
      const tr = ty2 * w,
        sr = (sy + dy) * w + sx;
      for (let dx = -R; dx <= R; dx++) {
        const tx2 = tx + dx;
        if (tx2 < 0 || tx2 >= w) continue;
        const a = (tr + tx2) * 4,
          b = (sr + dx) * 4;
        const e0 = img[a] - img[b],
          e1 = img[a + 1] - img[b + 1],
          e2 = img[a + 2] - img[b + 2],
          e3 = img[a + 3] - img[b + 3];
        d += e0 * e0 + e1 * e1 + e2 * e2 + e3 * e3;
      }
      if (d >= maxD) return d;
    }
    return d;
  }

  function patchmatch(L: PreparedLevel, nnf: Int32Array, nd: Float32Array, iters: number): void {
    const { w, h, targets, valid, validList } = L,
      nT = targets.length,
      maxR = Math.max(w, h),
      nV = validList.length;
    const tryCand = (t: number, c: number, best: { s: number; d: number }) => {
      if (c === best.s) return;
      const d = patchDist(L, t, c, best.d);
      if (d < best.d) {
        best.s = c;
        best.d = d;
      }
    };
    for (let it = 0; it < iters; it++) {
      const fwd = it % 2 === 0,
        off = fwd ? -1 : 1;
      for (let k = fwd ? 0 : nT - 1; fwd ? k < nT : k >= 0; k += fwd ? 1 : -1) {
        const t = targets[k],
          tx = t % w,
          ty = (t - tx) / w;
        const best = { s: nnf[t], d: nd[t] };
        // propagation from the left/right and top/bottom neighbours
        if (tx + off >= 0 && tx + off < w) {
          const s0 = nnf[t + off];
          if (s0 >= 0) {
            const c = s0 - off;
            if (c >= 0 && c < w * h && valid[c]) tryCand(t, c, best);
          }
        }
        if (ty + off >= 0 && ty + off < h) {
          const s0 = nnf[t + off * w];
          if (s0 >= 0) {
            const c = s0 - off * w;
            if (c >= 0 && c < w * h && valid[c]) tryCand(t, c, best);
          }
        }
        // random search in shrinking windows around the current best
        for (let r = maxR; r >= 1; r >>= 1) {
          const bx = best.s % w,
            by = (best.s - bx) / w;
          const cx = bx + Math.round((rand() * 2 - 1) * r),
            cy = by + Math.round((rand() * 2 - 1) * r);
          if (cx < R || cy < R || cx >= w - R || cy >= h - R) continue;
          const c = cy * w + cx;
          if (valid[c]) tryCand(t, c, best);
        }
        // one global guess, so the field can jump to a far-away match
        tryCand(t, validList[(rand() * nV) | 0], best);
        nnf[t] = best.s;
        nd[t] = best.d;
      }
    }
  }

  /** Every hole pixel becomes the weighted average of the patches that cover it. */
  function vote(L: PreparedLevel, nnf: Int32Array, nd: Float32Array, sharp: boolean): void {
    const { w, h, img, hole, targets } = L,
      n = w * h,
      acc = new Float32Array(n * 4),
      ws = new Float32Array(n);
    let s2 = 1;
    if (sharp && targets.length) {
      const ds = Float32Array.from(targets, (t) => nd[t]).sort();
      s2 = Math.max(1, ds[Math.floor(ds.length * TUNING.votePercentile)]);
    }
    for (let k = 0; k < targets.length; k++) {
      const t = targets[k],
        s = nnf[t];
      if (s < 0) continue;
      const wt = sharp ? Math.exp(-nd[t] / (2 * s2)) + 1e-4 : 1;
      const tx = t % w,
        ty = (t - tx) / w,
        sx = s % w,
        sy = (s - sx) / w;
      for (let dy = -R; dy <= R; dy++) {
        const py = ty + dy;
        if (py < 0 || py >= h) continue;
        for (let dx = -R; dx <= R; dx++) {
          const px = tx + dx;
          if (px < 0 || px >= w) continue;
          const p = py * w + px;
          if (!hole[p]) continue;
          const q = ((sy + dy) * w + sx + dx) * 4,
            a = p * 4;
          acc[a] += img[q] * wt;
          acc[a + 1] += img[q + 1] * wt;
          acc[a + 2] += img[q + 2] * wt;
          acc[a + 3] += img[q + 3] * wt;
          ws[p] += wt;
        }
      }
    }
    for (let p = 0; p < n; p++) {
      if (hole[p] && ws[p] > 0) {
        const a = p * 4,
          k = 1 / ws[p];
        img[a] = acc[a] * k;
        img[a + 1] = acc[a + 1] * k;
        img[a + 2] = acc[a + 2] * k;
        img[a + 3] = acc[a + 3] * k;
      }
    }
  }

  const C = levels.length - 1;

  /** One pyramid level: seed the field (from the coarser level or at random), then EM iterations. */
  function solveLevel(li: number, nnfPrev: Int32Array | null): { nnf: Int32Array | null; E: number } {
    const L = prepare(levels[li]);
    const n = L.w * L.h,
      nnf = new Int32Array(n).fill(-1),
      nd = new Float32Array(n);
    if (li < C) {
      const Pv = levels[li + 1];
      for (let p = 0; p < n; p++) {
        if (!L.hole[p]) continue;
        const x = p % L.w,
          y = (p - x) / L.w,
          q = (Math.min(Pv.h - 1, y >> 1) * Pv.w + Math.min(Pv.w - 1, x >> 1)) * 4;
        for (let c = 0; c < 4; c++) L.img[p * 4 + c] = Pv.img[q + c];
      }
    } else onion(L);
    if (!L.validList.length) return { nnf: null, E: 0 };
    for (let k = 0; k < L.targets.length; k++) {
      const t = L.targets[k];
      let cand = -1;
      if (nnfPrev && li < C) {
        const Pv = levels[li + 1],
          x = t % L.w,
          y = (t - x) / L.w,
          pc = Math.min(Pv.h - 1, y >> 1) * Pv.w + Math.min(Pv.w - 1, x >> 1),
          ps = nnfPrev[pc];
        if (ps >= 0) {
          const sx = (ps % Pv.w) * 2 + (x & 1),
            sy = ((ps / Pv.w) | 0) * 2 + (y & 1);
          if (sx >= R && sy >= R && sx < L.w - R && sy < L.h - R && L.valid[sy * L.w + sx])
            cand = sy * L.w + sx;
        }
      }
      nnf[t] = cand >= 0 ? cand : L.validList[(rand() * L.validList.length) | 0];
    }
    if (li < C && nnfPrev) {
      for (const t of L.targets) nd[t] = patchDist(L, t, nnf[t], Infinity);
      vote(L, nnf, nd, false);
    }
    const em = li === 0 ? TUNING.emFinest : li === 1 ? TUNING.emSecond : TUNING.emCoarse;
    const runEM = (nf: Int32Array, ndd: Float32Array): number => {
      for (let e = 0; e < em; e++) {
        for (const t of L.targets) ndd[t] = patchDist(L, t, nf[t], Infinity);
        patchmatch(L, nf, ndd, 2);
        vote(L, nf, ndd, true);
      }
      let E = 0;
      for (const t of L.targets) {
        ndd[t] = patchDist(L, t, nf[t], Infinity);
        E += ndd[t];
      }
      return E;
    };
    if (li === C && TUNING.restarts > 1) {
      const base = Float32Array.from(L.img);
      let best: { E: number; img: Float32Array; nf: Int32Array } | null = null;
      for (let r = 0; r < TUNING.restarts; r++) {
        L.img.set(base);
        const nf = new Int32Array(n).fill(-1),
          ndd = new Float32Array(n);
        for (const t of L.targets) nf[t] = L.validList[(rand() * L.validList.length) | 0];
        const E = runEM(nf, ndd);
        if (!best || E < best.E) best = { E, img: Float32Array.from(L.img), nf };
      }
      if (best) {
        L.img.set(best.img);
        return { nnf: best.nf, E: best.E };
      }
    }
    return { nnf, E: runEM(nnf, nd) };
  }

  // several cheap drafts down to the second-finest level; only the best one is refined at full size
  let nnfPrev: Int32Array | null = null;
  if (C >= 1) {
    let best: { E: number; nnf: Int32Array | null; img: Float32Array } | null = null;
    for (let d = 0; d < TUNING.drafts; d++) {
      let np: Int32Array | null = null,
        E = 0;
      for (let li = C; li >= 1; li--) {
        const r = solveLevel(li, np);
        np = r.nnf;
        E = r.E;
      }
      if (!best || E < best.E) best = { E, nnf: np, img: Float32Array.from(levels[1].img) };
    }
    if (best) {
      levels[1].img.set(best.img);
      nnfPrev = best.nnf;
    }
  }
  solveLevel(0, nnfPrev);

  // ---- low-frequency correction: blend toward a smooth fill when the surroundings are smooth ----
  const img = levels[0].img;
  {
    const Sm = harmonic(img, W, H, hole1),
      G = boxBlur(img, W, H, 2),
      ring = dilateFlags(hole1, W, H, 6);
    let e = 0,
      cnt = 0;
    for (let p = 0; p < n0; p++) {
      if (!ring[p] || hole1[p]) continue;
      for (let c = 0; c < 3; c++) {
        const v = img[p * 4 + c] - G[p * 4 + c];
        e += v * v;
      }
      cnt += 3;
    }
    const rms = cnt ? Math.sqrt(e / cnt) : 0,
      wS = Math.max(0, Math.min(1, (12 - rms) / 9));
    for (let p = 0; p < n0; p++) {
      if (hole1[p]) for (let c = 0; c < 4; c++) img[p * 4 + c] += wS * (Sm[p * 4 + c] - G[p * 4 + c]);
    }
  }

  const out = new Uint8ClampedArray(src);
  for (let p = 0; p < n0; p++) {
    if (!hole1[p]) continue;
    const a = img[p * 4 + 3];
    if (a <= 0.5) {
      out[p * 4 + 3] = 0;
      continue;
    }
    const k = 255 / a;
    out[p * 4] = img[p * 4] * k;
    out[p * 4 + 1] = img[p * 4 + 1] * k;
    out[p * 4 + 2] = img[p * 4 + 2] * k;
    out[p * 4 + 3] = a;
  }
  return out;
}

function holeBox(L: { w: number; h: number; hole: Uint8Array }): { w: number; h: number } | null {
  let x0 = L.w,
    y0 = L.h,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < L.h; y++) {
    for (let x = 0; x < L.w; x++) {
      if (!L.hole[y * L.w + x]) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Fill the hole ring by ring from its edge with the average of known neighbours (initial guess). */
function onion(L: SimpleLevel): void {
  const { w, h, img, hole } = L,
    known = new Uint8Array(w * h);
  let left = 0;
  for (let i = 0; i < w * h; i++) {
    known[i] = hole[i] ? 0 : 1;
    if (hole[i]) left++;
  }
  while (left > 0) {
    const fill: number[] = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (known[i]) continue;
        let c0 = 0,
          c1 = 0,
          c2 = 0,
          c3 = 0,
          k = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx,
              yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
            const j = yy * w + xx;
            if (!known[j]) continue;
            c0 += img[j * 4];
            c1 += img[j * 4 + 1];
            c2 += img[j * 4 + 2];
            c3 += img[j * 4 + 3];
            k++;
          }
        }
        if (k) fill.push(i, c0 / k, c1 / k, c2 / k, c3 / k);
      }
    }
    if (!fill.length) {
      // nothing known anywhere: neutral grey
      for (let i = 0; i < w * h; i++) {
        if (known[i]) continue;
        img[i * 4] = img[i * 4 + 1] = img[i * 4 + 2] = 128;
        img[i * 4 + 3] = 255;
      }
      break;
    }
    for (let q = 0; q < fill.length; q += 5) {
      const i = fill[q];
      img[i * 4] = fill[q + 1];
      img[i * 4 + 1] = fill[q + 2];
      img[i * 4 + 2] = fill[q + 3];
      img[i * 4 + 3] = fill[q + 4];
      known[i] = 1;
      left--;
    }
  }
}

/** Smooth fill of the hole (Laplace equation, solved coarse to fine with Gauss–Seidel). */
function harmonic(F: Float32Array, w: number, h: number, holeM: Uint8Array): Float32Array {
  const lv: SimpleLevel[] = [{ w, h, img: Float32Array.from(F), hole: Uint8Array.from(holeM) }];
  while (lv.length < 12) {
    const L = lv[lv.length - 1],
      bb = holeBox(L);
    if (!bb || Math.max(bb.w, bb.h) <= 3 || Math.min(L.w, L.h) < 6) break;
    const cw = L.w >> 1,
      ch = L.h >> 1,
      img = new Float32Array(cw * ch * 4),
      hl = new Uint8Array(cw * ch);
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const i = y * cw + x;
        let k = 0,
          a0 = 0,
          a1 = 0,
          a2 = 0,
          a3 = 0;
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            const j = (2 * y + dy) * L.w + 2 * x + dx;
            if (L.hole[j]) continue;
            a0 += L.img[j * 4];
            a1 += L.img[j * 4 + 1];
            a2 += L.img[j * 4 + 2];
            a3 += L.img[j * 4 + 3];
            k++;
          }
        }
        if (k) {
          img[i * 4] = a0 / k;
          img[i * 4 + 1] = a1 / k;
          img[i * 4 + 2] = a2 / k;
          img[i * 4 + 3] = a3 / k;
        } else hl[i] = 1;
      }
    }
    lv.push({ w: cw, h: ch, img, hole: hl });
  }
  for (let li = lv.length - 1; li >= 0; li--) {
    const L = lv[li],
      list: number[] = [];
    for (let i = 0; i < L.w * L.h; i++) if (L.hole[i]) list.push(i);
    if (li === lv.length - 1) onion(L);
    else {
      const Pv = lv[li + 1];
      for (const p of list) {
        const x = p % L.w,
          y = (p - x) / L.w,
          q = (Math.min(Pv.h - 1, y >> 1) * Pv.w + Math.min(Pv.w - 1, x >> 1)) * 4;
        for (let c = 0; c < 4; c++) L.img[p * 4 + c] = Pv.img[q + c];
      }
    }
    const iters = li === lv.length - 1 ? 150 : 40,
      im = L.img,
      lw = L.w,
      lh = L.h;
    for (let it = 0; it < iters; it++) {
      for (const p of list) {
        const x = p % lw,
          y = (p - x) / lw;
        let k = 0,
          a0 = 0,
          a1 = 0,
          a2 = 0,
          a3 = 0;
        const add = (j: number) => {
          a0 += im[j];
          a1 += im[j + 1];
          a2 += im[j + 2];
          a3 += im[j + 3];
          k++;
        };
        if (x > 0) add((p - 1) * 4);
        if (x < lw - 1) add((p + 1) * 4);
        if (y > 0) add((p - lw) * 4);
        if (y < lh - 1) add((p + lw) * 4);
        if (k) {
          im[p * 4] = a0 / k;
          im[p * 4 + 1] = a1 / k;
          im[p * 4 + 2] = a2 / k;
          im[p * 4 + 3] = a3 / k;
        }
      }
    }
  }
  return lv[0].img;
}

/** Three passes of a box blur ≈ a Gaussian blur of radius `r`. */
function boxBlur(A: Float32Array, w: number, h: number, r: number): Float32Array {
  const a = Float32Array.from(A),
    b = new Float32Array(A.length);
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < h; y++) {
      for (let c = 0; c < 4; c++) {
        let s = 0,
          k = 0;
        for (let x = 0; x <= r && x < w; x++) {
          s += a[(y * w + x) * 4 + c];
          k++;
        }
        for (let x = 0; x < w; x++) {
          b[(y * w + x) * 4 + c] = s / k;
          const xo = x - r,
            xi = x + r + 1;
          if (xo >= 0) {
            s -= a[(y * w + xo) * 4 + c];
            k--;
          }
          if (xi < w) {
            s += a[(y * w + xi) * 4 + c];
            k++;
          }
        }
      }
    }
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < 4; c++) {
        let s = 0,
          k = 0;
        for (let y = 0; y <= r && y < h; y++) {
          s += b[(y * w + x) * 4 + c];
          k++;
        }
        for (let y = 0; y < h; y++) {
          a[(y * w + x) * 4 + c] = s / k;
          const yo = y - r,
            yi = y + r + 1;
          if (yo >= 0) {
            s -= b[(yo * w + x) * 4 + c];
            k--;
          }
          if (yi < h) {
            s += b[(yi * w + x) * 4 + c];
            k++;
          }
        }
      }
    }
  }
  return a;
}
