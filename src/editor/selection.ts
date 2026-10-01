/** Selections: building them, testing them and cutting pixels out with them. */
import { bboxOf, clamp, type Box, type Pt, type Vec } from '../core/geometry';
import { alphaFlags, dilateFlags, floodFlags } from '../core/flags';
import { FILTER_OK } from './constants';
import { cloneCanvas, ctx2d, el, mkCanvas, P, trim } from './dom';
import { commit } from './history';
import { active, avgScale, baseName, layerMatrix, newLayer, pixelCtx } from './layer';
import { S, markOverlay, opts, rt } from './state';
import type { Layer, Mask, PolyShape, RasterShape, SelMode, SelShape } from './types';
import { fitView } from './view';
import { polyPath } from './render';
import { afterStructural, hideNote, syncPolyBar, toast } from '../ui/chrome';
import { setTool } from './tools';
import { healLayer } from './heal';

const hitCtx = ctx2d(mkCanvas(1, 1));

export function makePoly(pts: Pt[]): PolyShape {
  return { type: 'poly', pts, path: polyPath(pts, true), bb: bboxOf(pts), op: 'add' };
}

/** Combine a new shape with the current selection according to `op`. */
export function applySel(shape: SelShape, op: SelMode): void {
  if (op === 'new' || !S.sel) {
    if (op === 'sub') return;
    shape.op = 'add';
    S.sel = { shapes: [shape], inverted: false };
  } else {
    const add = op === 'add';
    // on an inverted selection, adding means subtracting from what is excluded
    shape.op = add !== S.sel.inverted ? 'add' : 'sub';
    S.sel = { shapes: [...S.sel.shapes, shape], inverted: S.sel.inverted };
  }
  selChanged();
}

function shapeContains(sh: SelShape, p: Vec): boolean {
  if (sh.type === 'poly') return hitCtx.isPointInPath(sh.path, p.x, p.y);
  const q = sh.inv.transformPoint(P(p.x, p.y)),
    ix = Math.floor(q.x),
    iy = Math.floor(q.y);
  return ix >= 0 && iy >= 0 && ix < sh.w && iy < sh.h && sh.flags[iy * sh.w + ix] === 1;
}

export function selContains(p: Vec): boolean {
  if (!S.sel) return false;
  let inside = false;
  for (const sh of S.sel.shapes) if (shapeContains(sh, p)) inside = sh.op === 'add';
  return S.sel.inverted ? !inside : inside;
}

export function selBBoxDoc(): Box | null {
  if (!S.sel) return null;
  if (S.sel.inverted) return { x: 0, y: 0, w: S.doc.w, h: S.doc.h };
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const sh of S.sel.shapes) {
    if (sh.op !== 'add') continue;
    x0 = Math.min(x0, sh.bb.x);
    y0 = Math.min(y0, sh.bb.y);
    x1 = Math.max(x1, sh.bb.x + sh.bb.w);
    y1 = Math.max(y1, sh.bb.y + sh.bb.h);
  }
  return isFinite(x0) ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

/** Refresh everything that shows the selection. */
export function selChanged(): void {
  const has = !!S.sel;
  document.querySelectorAll<HTMLButtonElement>('[data-needs-sel]').forEach((b) => (b.disabled = !has));
  const bb = selBBoxDoc();
  el('sel-size').textContent = bb
    ? `${Math.round(bb.w)} × ${Math.round(bb.h)} px${S.sel?.inverted ? ' · invertida' : ''}`
    : 'nenhuma';
  el('dock-sel-pip').hidden = !has;
  el('st-sel').innerHTML = bb ? `seleção <b>${Math.round(bb.w)} × ${Math.round(bb.h)}</b>` : '';
  markOverlay();
}

export function clearSel(): void {
  if (!S.sel) return;
  S.sel = null;
  selChanged();
}

export function selectAll(): void {
  const w = S.doc.w,
    h = S.doc.h;
  applySel(
    makePoly([
      [0, 0],
      [w, 0],
      [w, h],
      [0, h],
    ]),
    'new',
  );
}

export function invertSel(): void {
  if (!S.sel) return;
  S.sel = { shapes: S.sel.shapes, inverted: !S.sel.inverted };
  selChanged();
}

/** The selection rasterised in a layer's own pixel space, so cuts keep full resolution. */
export function buildMask(l: Layer): Mask {
  const sel = S.sel;
  const w = l.canvas.width,
    h = l.canvas.height,
    inv = layerMatrix(l).inverse();
  const f = FILTER_OK ? opts.feather / avgScale(l) : 0,
    Pd = f > 0 ? Math.ceil(f * 3) + 2 : 0;
  const mk = mkCanvas(w + 2 * Pd, h + 2 * Pd),
    x = ctx2d(mk),
    B = new DOMMatrix().translate(Pd, Pd).multiply(inv);
  x.fillStyle = '#fff';
  for (const sh of sel?.shapes ?? []) {
    x.globalCompositeOperation = sh.op === 'add' ? 'source-over' : 'destination-out';
    if (sh.type === 'poly') {
      x.setTransform(B);
      x.fill(sh.path);
    } else {
      x.setTransform(B.multiply(sh.matrix));
      x.drawImage(sh.canvas, 0, 0);
    }
  }
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.globalCompositeOperation = 'source-over';
  let out = mk;
  if (sel?.inverted) {
    const t = mkCanvas(mk.width, mk.height),
      tx = ctx2d(t);
    tx.fillStyle = '#fff';
    tx.fillRect(0, 0, t.width, t.height);
    tx.globalCompositeOperation = 'destination-out';
    tx.drawImage(mk, 0, 0);
    out = t;
  }
  if (f > 0) {
    const b = mkCanvas(out.width, out.height),
      bx = ctx2d(b);
    bx.filter = `blur(${f}px)`;
    bx.drawImage(out, 0, 0);
    out = b;
  }
  return { canvas: out, P: Pd, f };
}

/** The part of the layer the selection can touch, in layer pixels. */
function selLocalRect(l: Layer, mask: Mask): Box | null {
  const w = l.canvas.width,
    h = l.canvas.height;
  if (S.sel?.inverted) return { x: 0, y: 0, w, h };
  const bb = selBBoxDoc();
  if (!bb) return null;
  const inv = layerMatrix(l).inverse();
  const lb = bboxOf(
    [
      [bb.x, bb.y],
      [bb.x + bb.w, bb.y],
      [bb.x + bb.w, bb.y + bb.h],
      [bb.x, bb.y + bb.h],
    ].map(([x, y]) => inv.transformPoint(P(x, y))),
  );
  const pad = mask.f * 3 + 2;
  const x0 = clamp(Math.floor(lb.x - pad), 0, w),
    y0 = clamp(Math.floor(lb.y - pad), 0, h),
    x1 = clamp(Math.ceil(lb.x + lb.w + pad), 0, w),
    y1 = clamp(Math.ceil(lb.y + lb.h + pad), 0, h);
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

/** The selected pixels of a layer, trimmed, plus where they sit inside it. */
export function extract(l: Layer): { canvas: HTMLCanvasElement; lx: number; ly: number; mask: Mask } | null {
  const mask = buildMask(l),
    r = selLocalRect(l, mask);
  if (!r) return null;
  const c = mkCanvas(r.w, r.h),
    x = ctx2d(c);
  x.drawImage(l.canvas, -r.x, -r.y);
  x.globalCompositeOperation = 'destination-in';
  x.drawImage(mask.canvas, -r.x - mask.P, -r.y - mask.P);
  const t = trim(c);
  if (!t) return null;
  return { canvas: t.canvas, lx: r.x + t.x, ly: r.y + t.y, mask };
}

export function eraseWithMask(l: Layer, mask: Mask): void {
  const x = pixelCtx(l);
  x.globalCompositeOperation = 'destination-out';
  x.drawImage(mask.canvas, -mask.P, -mask.P);
  x.globalCompositeOperation = 'source-over';
}

/** Mask pixels (alpha > 10) as flags in layer space, optionally grown by `grow` px. */
export function maskToFlags(mask: Mask, w: number, h: number, grow: number): Uint8Array | null {
  const d = ctx2d(mask.canvas).getImageData(mask.P, mask.P, w, h).data;
  const f = alphaFlags(d, w, h, 10);
  return f && grow ? dilateFlags(f, w, h, grow) : f;
}

/** A new layer made of pixels taken from `parent`, placed exactly where they were. */
function childLayer(parent: Layer, canvas: HTMLCanvasElement, lx: number, ly: number, suffix: string): Layer {
  const c = layerMatrix(parent).transformPoint(P(lx + canvas.width / 2, ly + canvas.height / 2));
  return newLayer(canvas, {
    name: `${baseName(parent.name)} · ${suffix}`,
    x: c.x,
    y: c.y,
    sx: parent.sx,
    sy: parent.sy,
    rot: parent.rot,
    flipX: parent.flipX,
    flipY: parent.flipY,
    opacity: parent.opacity,
    blend: parent.blend,
    adj: { ...parent.adj },
    fill: { ...parent.fill },
  });
}

export function needSelLayer(): Layer | null {
  const l = active();
  if (!S.sel) {
    toast('Faça uma seleção primeiro');
    return null;
  }
  if (!l) {
    toast('Escolha uma camada no painel');
    return null;
  }
  return l;
}

/** Copy or cut the selection into a new layer right above the active one. */
export function selToLayer(mode: 'cut' | 'copy', o: { noCommit?: boolean } = {}): Layer | null {
  const l = needSelLayer();
  if (!l) return null;
  const e = extract(l);
  if (!e) {
    toast('A seleção não pega nenhum pixel da camada ativa');
    return null;
  }
  if (mode === 'cut') eraseWithMask(l, e.mask);
  const healFlags =
    mode === 'cut' && opts.healCut ? maskToFlags(e.mask, l.canvas.width, l.canvas.height, 2) : null;
  const nl = childLayer(l, e.canvas, e.lx, e.ly, mode === 'cut' ? 'recorte' : 'cópia');
  S.layers.splice(S.layers.indexOf(l) + 1, 0, nl);
  S.activeId = nl.id;
  S.sel = null;
  selChanged();
  if (!o.noCommit) {
    commit(mode === 'cut' ? 'Recortar para nova camada' : 'Copiar para nova camada');
    setTool('move');
    toast('Nova camada criada · arraste para posicionar');
  }
  afterStructural();
  if (healFlags) void healLayer(l, healFlags, 'Tapar o buraco');
  return nl;
}

/** Erase everything outside the selection and trim the layer to what is left. */
export function keepOnlySel(): void {
  const l = needSelLayer();
  if (!l) return;
  const mask = buildMask(l),
    c = cloneCanvas(l.canvas),
    x = ctx2d(c);
  x.globalCompositeOperation = 'destination-in';
  x.drawImage(mask.canvas, -mask.P, -mask.P);
  const t = trim(c);
  if (!t) {
    toast('A seleção não pega nenhum pixel da camada ativa');
    return;
  }
  const src = mkCanvas(t.canvas.width, t.canvas.height);
  ctx2d(src).drawImage(l.source, -t.x, -t.y);
  const ctr = layerMatrix(l).transformPoint(P(t.x + t.canvas.width / 2, t.y + t.canvas.height / 2));
  l.canvas = t.canvas;
  l.source = src;
  l.x = ctr.x;
  l.y = ctr.y;
  S.sel = null;
  selChanged();
  commit('Manter só a seleção');
  setTool('move');
  afterStructural();
  toast('Recortado · agora é só arrastar para posicionar');
  hideNote();
}

export function deleteSel(): void {
  const l = needSelLayer();
  if (!l) return;
  eraseWithMask(l, buildMask(l));
  commit('Apagar área');
  afterStructural();
}

export function cropToSel(): void {
  const bb = selBBoxDoc();
  if (!bb) return;
  const x0 = Math.max(0, Math.floor(bb.x)),
    y0 = Math.max(0, Math.floor(bb.y)),
    x1 = Math.min(S.doc.w, Math.ceil(bb.x + bb.w)),
    y1 = Math.min(S.doc.h, Math.ceil(bb.y + bb.h));
  if (x1 - x0 < 1 || y1 - y0 < 1) {
    toast('A seleção está fora da tela');
    return;
  }
  for (const l of S.layers) {
    l.x -= x0;
    l.y -= y0;
  }
  S.doc.w = x1 - x0;
  S.doc.h = y1 - y0;
  S.sel = null;
  selChanged();
  commit('Cortar a tela');
  fitView();
  afterStructural();
}

/** Outline of a pixel mask as horizontal and vertical edge segments (for the marching ants). */
function edgesPath(f: Uint8Array, w: number, h: number): Path2D {
  const p = new Path2D();
  for (let y = 0; y <= h; y++) {
    let run = -1;
    for (let x = 0; x <= w; x++) {
      const e = x < w && (y > 0 ? f[(y - 1) * w + x] : 0) !== (y < h ? f[y * w + x] : 0);
      if (e && run < 0) run = x;
      else if (!e && run >= 0) {
        p.moveTo(run, y);
        p.lineTo(x, y);
        run = -1;
      }
    }
  }
  for (let x = 0; x <= w; x++) {
    let run = -1;
    for (let y = 0; y <= h; y++) {
      const e = y < h && (x > 0 ? f[y * w + x - 1] : 0) !== (x < w ? f[y * w + x] : 0);
      if (e && run < 0) run = y;
      else if (!e && run >= 0) {
        p.moveTo(x, run);
        p.lineTo(x, y);
        run = -1;
      }
    }
  }
  return p;
}

/** Magic wand: select pixels of the active layer similar to the one under `dp`. */
export function wandAt(dp: Vec, op: SelMode): void {
  const l = active();
  if (!l) {
    toast('Escolha uma camada no painel');
    return;
  }
  const m = layerMatrix(l),
    q = m.inverse().transformPoint(P(dp.x, dp.y));
  const w = l.canvas.width,
    h = l.canvas.height,
    ix = Math.floor(q.x),
    iy = Math.floor(q.y);
  if (ix < 0 || iy < 0 || ix >= w || iy >= h) {
    toast('Clique dentro da camada ativa');
    return;
  }
  const fl = floodFlags(
    ctx2d(l.canvas).getImageData(0, 0, w, h).data,
    w,
    h,
    ix,
    iy,
    opts.wandTol,
    opts.wandContig,
  );
  if (!fl) return;
  const { minX, minY, bw, bh, bf } = fl;
  const c = mkCanvas(bw, bh),
    cx = ctx2d(c),
    id = cx.createImageData(bw, bh),
    dd = id.data;
  for (let i = 0; i < bf.length; i++) {
    if (bf[i]) {
      const j = i * 4;
      dd[j] = dd[j + 1] = dd[j + 2] = dd[j + 3] = 255;
    }
  }
  cx.putImageData(id, 0, 0);
  const matrix = m.translate(minX, minY);
  const shape: RasterShape = {
    type: 'raster',
    canvas: c,
    flags: bf,
    w: bw,
    h: bh,
    matrix,
    inv: matrix.inverse(),
    path: edgesPath(bf, bw, bh),
    bb: bboxOf(
      [
        [0, 0],
        [bw, 0],
        [bw, bh],
        [0, bh],
      ].map(([x, y]) => matrix.transformPoint(P(x, y))),
    ),
    op: 'add',
  };
  applySel(shape, op);
}

/** Close the polygonal lasso (dropping duplicate clicks). */
export function finishPoly(): void {
  const pd = rt.polyDraft;
  if (!pd) return;
  const tol = 2 / S.view.s,
    pts: Pt[] = [];
  for (const q of pd.pts) {
    const p = pts[pts.length - 1];
    if (!p || Math.hypot(q[0] - p[0], q[1] - p[1]) > tol) pts.push(q);
  }
  rt.polyDraft = null;
  syncPolyBar();
  if (pts.length >= 3) applySel(makePoly(pts), pd.op);
  markOverlay();
}
