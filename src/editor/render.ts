/** Drawing: the composed picture (scene) and everything on top of it (overlay). */
import { dist, niceStep, pixelRect, type Vec } from '../core/geometry';
import { BRUSH_TOOLS, FILTER_OK, REDUCED_MOTION } from './constants';
import { ctx2d, mkCanvas, P } from './dom';
import { active, avgScale, displayCanvas, filterStr, layerCornersDoc, layerMatrix } from './layer';
import { S, coarse, ht, opts, rt, theme } from './state';
import type { Layer } from './types';
import {
  bctx,
  buf,
  checkerPat,
  mqMobile,
  octx,
  overlay,
  sctx,
  scene,
  toScreen,
  viewMatrix,
  vp,
} from './view';
import { pointer } from './pointer';

/**
 * Draw every visible layer through `base` (document → target pixels).
 * `ghost` draws faintly with no blending (what hangs off the sheet);
 * `screen` shows crisp pixels when zoomed in.
 */
export function drawLayerList(
  ctx: CanvasRenderingContext2D,
  base: DOMMatrix,
  blurK: number,
  ghost = false,
  screen = false,
): void {
  ctx.imageSmoothingQuality = 'high';
  for (const l of S.layers) {
    if (!l.visible || l.opacity <= 0) continue;
    ctx.imageSmoothingEnabled = !(screen && S.view.s * avgScale(l) >= 2);
    ctx.setTransform(base.multiply(layerMatrix(l)));
    ctx.globalAlpha = l.opacity * (ghost ? 0.26 : 1);
    ctx.globalCompositeOperation = ghost ? 'source-over' : l.blend;
    if (FILTER_OK) ctx.filter = filterStr(l, blurK);
    ctx.drawImage(displayCanvas(l), 0, 0);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  if (FILTER_OK) ctx.filter = 'none';
}

function renderScene(): void {
  const ctx = sctx,
    dpr = vp.dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, scene.width, scene.height);
  if (!S.layers.length) return;
  const s = S.view.s,
    dx = S.view.x * dpr,
    dy = S.view.y * dpr,
    dw = S.doc.w * s * dpr,
    dh = S.doc.h * s * dpr;
  // the sheet, with a soft shadow on the cutting mat
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.38)';
  ctx.shadowBlur = 26 * dpr;
  ctx.shadowOffsetY = 8 * dpr;
  ctx.fillStyle = S.doc.bg === 'transparent' ? (checkerPat ?? '#fff') : S.doc.bg;
  ctx.fillRect(dx, dy, dw, dh);
  ctx.restore();
  const base = viewMatrix();
  // whatever hangs off the sheet shows faintly, so you can see what you're dragging
  ctx.save();
  const out = new Path2D();
  out.rect(0, 0, scene.width, scene.height);
  out.rect(dx, dy, dw, dh);
  ctx.clip(out, 'evenodd');
  drawLayerList(ctx, base, s * dpr, true, true);
  ctx.restore();
  bctx.setTransform(1, 0, 0, 1, 0, 0);
  bctx.clearRect(0, 0, buf.width, buf.height);
  bctx.save();
  bctx.beginPath();
  bctx.rect(dx, dy, dw, dh);
  bctx.clip();
  if (S.doc.bg !== 'transparent') {
    bctx.fillStyle = S.doc.bg;
    bctx.fillRect(dx, dy, dw, dh);
  }
  drawLayerList(bctx, base, s * dpr, false, true);
  bctx.restore();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(buf, 0, 0);
}

// ---- marching ants: a diagonal stripe pattern held still in screen space and slid along ----
const antTile = mkCanvas(8, 8);
{
  const x = ctx2d(antTile);
  x.fillStyle = '#fff';
  x.fillRect(0, 0, 8, 8);
  x.fillStyle = '#111';
  x.beginPath();
  x.moveTo(0, 0);
  x.lineTo(4, 0);
  x.lineTo(0, 4);
  x.closePath();
  x.fill();
  x.beginPath();
  x.moveTo(8, 0);
  x.lineTo(8, 4);
  x.lineTo(4, 8);
  x.lineTo(0, 8);
  x.closePath();
  x.fill();
}
let antOff = 0,
  lastAnt = 0;

function strokeAnts(ctx: CanvasRenderingContext2D, path: Path2D, m: DOMMatrix): void {
  ctx.setTransform(m);
  const k = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1;
  const pat = ctx.createPattern(antTile, 'repeat');
  if (!pat) return;
  pat.setTransform(m.inverse().multiply(new DOMMatrix().scale(vp.dpr, vp.dpr).translate(antOff, 0)));
  ctx.strokeStyle = pat;
  ctx.lineWidth = (1.3 * vp.dpr) / k;
  ctx.lineJoin = 'round';
  ctx.stroke(path);
}

export function polyPath(pts: readonly [number, number][], closed: boolean): Path2D {
  const p = new Path2D();
  pts.forEach((q, i) => (i ? p.lineTo(q[0], q[1]) : p.moveTo(q[0], q[1])));
  if (closed) p.closePath();
  return p;
}

// ---- transform handles ----
export interface Handles {
  corners: Vec[];
  /** Middles of the top, right, bottom and left sides. */
  edges: Vec[];
  /** Whether each side handle is big enough on screen to be shown and grabbed. */
  edgeOn: boolean[];
  ctr: Vec;
  tm: Vec;
  rotH: Vec;
}

export function handlesScreen(l: Layer): Handles {
  const c = layerCornersDoc(l).map(toScreen),
    ctr = toScreen({ x: l.x, y: l.y });
  const tm = { x: (c[0].x + c[1].x) / 2, y: (c[0].y + c[1].y) / 2 };
  let ux = tm.x - ctr.x,
    uy = tm.y - ctr.y;
  const len = Math.hypot(ux, uy) || 1;
  ux /= len;
  uy /= len;
  const off = coarse() ? 38 : 26,
    mid = (a: Vec, b: Vec) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const edges = [mid(c[0], c[1]), mid(c[1], c[2]), mid(c[2], c[3]), mid(c[3], c[0])];
  const wOk = dist(c[0], c[1]) > 3 * ht(),
    hOk = dist(c[1], c[2]) > 3 * ht();
  return {
    corners: c,
    edges,
    edgeOn: [wOk, hOk, wOk, hOk],
    ctr,
    tm,
    rotH: { x: tm.x + ux * off, y: tm.y + uy * off },
  };
}

export const edgeAt = (hs: Handles, sp: Vec): number =>
  hs.edges.findIndex((q, i) => hs.edgeOn[i] && dist(sp, q) <= ht());

function drawHandles(ctx: CanvasRenderingContext2D): void {
  const l = active();
  if (!l || !l.visible) return;
  const hs = handlesScreen(l);
  ctx.setTransform(vp.dpr, 0, 0, vp.dpr, 0, 0);
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = theme.accent;
  ctx.beginPath();
  hs.corners.forEach((c, i) => (i ? ctx.lineTo(c.x, c.y) : ctx.moveTo(c.x, c.y)));
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(hs.tm.x, hs.tm.y);
  ctx.lineTo(hs.rotH.x, hs.rotH.y);
  ctx.stroke();
  ctx.fillStyle = '#fff';
  const hs2 = coarse() ? 7 : 4.5,
    rr = coarse() ? 9 : 5.5;
  for (const c of hs.corners) {
    ctx.beginPath();
    ctx.rect(c.x - hs2, c.y - hs2, hs2 * 2, hs2 * 2);
    ctx.fill();
    ctx.stroke();
  }
  // side handles stretch in one direction: small bars lying along their edge
  const hl = coarse() ? 9 : 6,
    hw = coarse() ? 4 : 2.8;
  hs.edges.forEach((q, i) => {
    if (!hs.edgeOn[i]) return;
    const a = hs.corners[i],
      b = hs.corners[(i + 1) % 4];
    ctx.save();
    ctx.translate(q.x, q.y);
    ctx.rotate(Math.atan2(b.y - a.y, b.x - a.x));
    ctx.beginPath();
    ctx.roundRect(-hl, -hw, hl * 2, hw * 2, hw);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  });
  ctx.beginPath();
  ctx.arc(hs.rotH.x, hs.rotH.y, rr, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function drawGuides(ctx: CanvasRenderingContext2D): void {
  const a = rt.act;
  if (!a || a.kind !== 'move' || !a.guides.length) return;
  ctx.setTransform(vp.dpr, 0, 0, vp.dpr, 0, 0);
  ctx.strokeStyle = '#ff2d87';
  ctx.lineWidth = coarse() ? 1.6 : 1;
  ctx.beginPath();
  for (const g of a.guides) {
    if (g.v) {
      const p = toScreen({ x: g.at, y: g.from }),
        q = toScreen({ x: g.at, y: g.to }),
        x = Math.round(p.x) + 0.5;
      ctx.moveTo(x, p.y);
      ctx.lineTo(x, q.y);
    } else {
      const p = toScreen({ x: g.from, y: g.at }),
        q = toScreen({ x: g.to, y: g.at }),
        y = Math.round(p.y) + 0.5;
      ctx.moveTo(p.x, y);
      ctx.lineTo(q.x, y);
    }
  }
  ctx.stroke();
}

function drawSizeLabel(ctx: CanvasRenderingContext2D, l: Layer): void {
  const p = pointer.sp;
  if (!p) return;
  const txt = `${Math.round(l.canvas.width * l.sx)} × ${Math.round(l.canvas.height * l.sy)} px`;
  ctx.setTransform(vp.dpr, 0, 0, vp.dpr, 0, 0);
  ctx.font = '500 11px "IBM Plex Mono", ui-monospace, monospace';
  const w = ctx.measureText(txt).width + 14,
    x = Math.min(vp.W - w - 6, p.x + 16),
    y = Math.min(vp.H - 28, p.y + 18);
  ctx.fillStyle = 'rgba(20,23,22,.86)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, 22, 6);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'middle';
  ctx.fillText(txt, x + 7, y + 11.5);
}

function drawPixelGrid(ctx: CanvasRenderingContext2D): void {
  const s = S.view.s;
  ctx.setTransform(vp.dpr, 0, 0, vp.dpr, 0, 0);
  const x0 = Math.max(0, Math.floor(-S.view.x / s)),
    x1 = Math.min(S.doc.w, Math.ceil((vp.W - S.view.x) / s));
  const y0 = Math.max(0, Math.floor(-S.view.y / s)),
    y1 = Math.min(S.doc.h, Math.ceil((vp.H - S.view.y) / s));
  if (x1 <= x0 || y1 <= y0) return;
  ctx.beginPath();
  for (let x = x0; x <= x1; x++) {
    const sx = Math.round(S.view.x + x * s) + 0.5;
    ctx.moveTo(sx, S.view.y + y0 * s);
    ctx.lineTo(sx, S.view.y + y1 * s);
  }
  for (let y = y0; y <= y1; y++) {
    const sy = Math.round(S.view.y + y * s) + 0.5;
    ctx.moveTo(S.view.x + x0 * s, sy);
    ctx.lineTo(S.view.x + x1 * s, sy);
  }
  ctx.strokeStyle = 'rgba(128,128,128,.32)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

const pixelTip = () => opts.paintTip === 'pixel' && (S.tool === 'paint' || S.tool === 'erase');

function drawBrushCursor(ctx: CanvasRenderingContext2D): void {
  const p = pointer.sp;
  if (!p) return;
  const l = active();
  if (pixelTip() && l && pointer.doc) {
    // outline exactly the pixels the next stamp will cover
    const m = layerMatrix(l),
      q = m.inverse().transformPoint(P(pointer.doc.x, pointer.doc.y)),
      { n, x0, y0 } = pixelRect(q.x, q.y, opts.brushSize / 2 / avgScale(l));
    const cs = [
      [x0, y0],
      [x0 + n, y0],
      [x0 + n, y0 + n],
      [x0, y0 + n],
    ].map(([x, y]) => toScreen(m.transformPoint(P(x, y))));
    ctx.setTransform(vp.dpr, 0, 0, vp.dpr, 0, 0);
    ctx.beginPath();
    cs.forEach((c, i) => (i ? ctx.lineTo(c.x, c.y) : ctx.moveTo(c.x, c.y)));
    ctx.closePath();
    ctx.strokeStyle = 'rgba(0,0,0,.6)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    return;
  }
  const r = Math.max(1.5, ((S.tool === 'remove' ? opts.removeSize : opts.brushSize) / 2) * S.view.s);
  ctx.setTransform(vp.dpr, 0, 0, vp.dpr, 0, 0);
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(0,0,0,.55)';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  if (opts.brushHard < 98 && r > 8 && S.tool !== 'remove') {
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(p.x, p.y, (r * opts.brushHard) / 100, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,.7)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawRulers(ctx: CanvasRenderingContext2D): void {
  const R = 18,
    s = S.view.s,
    { W, H } = vp;
  ctx.setTransform(vp.dpr, 0, 0, vp.dpr, 0, 0);
  ctx.fillStyle = theme.rulerBg;
  ctx.fillRect(0, 0, W, R);
  ctx.fillRect(0, R, R, H - R);
  ctx.fillStyle = theme.rulerDoc;
  const dx0 = Math.max(R, S.view.x),
    dx1 = Math.min(W, S.view.x + S.doc.w * s);
  if (dx1 > dx0) ctx.fillRect(dx0, 0, dx1 - dx0, R);
  const dy0 = Math.max(R, S.view.y),
    dy1 = Math.min(H, S.view.y + S.doc.h * s);
  if (dy1 > dy0) ctx.fillRect(0, dy0, R, dy1 - dy0);
  const major = niceStep(64 / s),
    ratio = String(major)[0] === '2' && major % 25 !== 0 ? 4 : 5,
    minor = major / ratio;
  const isMaj = (i: number) => ((i % ratio) + ratio) % ratio === 0;
  ctx.strokeStyle = theme.rulerInk;
  ctx.fillStyle = theme.rulerInk;
  ctx.lineWidth = 1;
  ctx.font = '9px "IBM Plex Mono", ui-monospace, monospace';
  ctx.textBaseline = 'top';
  ctx.beginPath();
  for (let i = Math.floor((R - S.view.x) / s / minor); ; i++) {
    const d = i * minor,
      x = Math.round(S.view.x + d * s) + 0.5;
    if (x > W) break;
    if (x < R) continue;
    const mj = isMaj(i);
    ctx.moveTo(x, R);
    ctx.lineTo(x, R - (mj ? 9 : 4));
    if (mj) ctx.fillText(String(Math.round(d)), x + 3, 2);
  }
  for (let i = Math.floor((R - S.view.y) / s / minor); ; i++) {
    const d = i * minor,
      y = Math.round(S.view.y + d * s) + 0.5;
    if (y > H) break;
    if (y < R) continue;
    const mj = isMaj(i);
    ctx.moveTo(R, y);
    ctx.lineTo(R - (mj ? 9 : 4), y);
    if (mj) {
      ctx.save();
      ctx.translate(2, y - 3);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(String(Math.round(d)), 0, 0);
      ctx.restore();
    }
  }
  ctx.stroke();
  if (pointer.inside && pointer.sp) {
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(pointer.sp.x, 0);
    ctx.lineTo(pointer.sp.x, R);
    ctx.moveTo(0, pointer.sp.y);
    ctx.lineTo(R, pointer.sp.y);
    ctx.stroke();
  }
}

/** Finger picking: a magnifier above the finger shows exactly what will be picked. */
function drawLoupe(ctx: CanvasRenderingContext2D): void {
  const p = pointer.sp;
  if (!p) return;
  const R = 48,
    Z = 6,
    dpr = vp.dpr,
    cx = p.x,
    cy = p.y - 100 > R + 6 ? p.y - 100 : p.y + 100;
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = theme.checkB;
  ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  const sw = ((2 * R) / Z) * dpr;
  ctx.drawImage(
    buf,
    p.x * dpr - sw / 2,
    p.y * dpr - sw / 2,
    sw,
    sw,
    (cx - R) * dpr,
    (cy - R) * dpr,
    2 * R * dpr,
    2 * R * dpr,
  );
  ctx.restore();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.lineWidth = 8;
  ctx.strokeStyle = pointer.hoverColor ?? 'rgba(0,0,0,.25)';
  ctx.beginPath();
  ctx.arc(cx, cy, R + 4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(0,0,0,.55)';
  ctx.beginPath();
  ctx.arc(cx, cy, R + 8, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = '#000';
  ctx.strokeRect(cx - Z / 2 - 1, cy - Z / 2 - 1, Z + 2, Z + 2);
  ctx.strokeStyle = '#fff';
  ctx.strokeRect(cx - Z / 2, cy - Z / 2, Z, Z);
}

/** Mouse picking: the ring shows the colour under the cursor (top) and the current one (bottom). */
function drawPickRing(ctx: CanvasRenderingContext2D): void {
  const p = pointer.sp;
  if (!p) return;
  const r = 20,
    now = pointer.hoverColor,
    cur = rt.pickOnce ? rt.pickOnce.current : opts.color;
  ctx.setTransform(vp.dpr, 0, 0, vp.dpr, 0, 0);
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, Math.PI, Math.PI * 2);
  ctx.strokeStyle = now ?? 'rgba(0,0,0,0)';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI);
  ctx.strokeStyle = cur || now || 'rgba(0,0,0,0)';
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(0,0,0,.55)';
  ctx.beginPath();
  ctx.arc(p.x, p.y, r + 5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(p.x, p.y, r - 5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,.9)';
  ctx.beginPath();
  ctx.arc(p.x, p.y, r + 6, 0, Math.PI * 2);
  ctx.stroke();
}

function renderOverlay(): void {
  const ctx = octx;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  if (!S.layers.length) return;
  const base = viewMatrix(),
    a = rt.act;
  if (S.view.s >= 8) drawPixelGrid(ctx);
  drawGuides(ctx);
  if (S.tool === 'move' && !(a && a.kind === 'pinch')) drawHandles(ctx);
  if (a && a.kind === 'scale' && a.moved) drawSizeLabel(ctx, a.l);
  if (S.sel) {
    for (const sh of S.sel.shapes)
      strokeAnts(ctx, sh.path, sh.type === 'poly' ? base : base.multiply(sh.matrix));
    if (S.sel.inverted) {
      const p = new Path2D();
      p.rect(0, 0, S.doc.w, S.doc.h);
      strokeAnts(ctx, p, base);
    }
  }
  const rm = rt.removeMask;
  if (rm) {
    const L = S.layers.find((x) => x.id === rm.id);
    if (L && L.canvas.width === rm.canvas.width && L.canvas.height === rm.canvas.height) {
      ctx.save();
      ctx.setTransform(base.multiply(layerMatrix(L)));
      ctx.globalAlpha = rm.busy ? 0.28 : 0.45;
      ctx.drawImage(rm.canvas, 0, 0);
      ctx.restore();
    }
  }
  if (rt.draft) strokeAnts(ctx, polyPath(rt.draft.pts, rt.draft.closed), base);
  if (rt.polyDraft) {
    const pts = rt.polyDraft.pts.slice();
    if (pointer.inside && pointer.doc) pts.push([pointer.doc.x, pointer.doc.y]);
    strokeAnts(ctx, polyPath(pts, false), base);
    ctx.setTransform(vp.dpr, 0, 0, vp.dpr, 0, 0);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 1;
    rt.polyDraft.pts.forEach((q, i) => {
      const sp = toScreen({ x: q[0], y: q[1] });
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, i === 0 ? 5 : 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
  }
  if (BRUSH_TOOLS.includes(S.tool) && !rt.pickOnce && pointer.inside && !rt.spaceDown) drawBrushCursor(ctx);
  if (a && a.kind === 'pick') drawLoupe(ctx);
  else if ((S.tool === 'picker' || rt.pickOnce) && pointer.inside && !rt.spaceDown && !coarse())
    drawPickRing(ctx);
  if (!mqMobile.matches) drawRulers(ctx);
}

function frame(t: number): void {
  if (rt.sceneDirty) {
    renderScene();
    rt.sceneDirty = false;
    rt.overlayDirty = true;
  }
  if ((S.sel || rt.draft || rt.polyDraft) && !REDUCED_MOTION && t - lastAnt > 85) {
    antOff = (antOff + 1) % 8;
    lastAnt = t;
    rt.overlayDirty = true;
  }
  if (rt.overlayDirty) {
    renderOverlay();
    rt.overlayDirty = false;
  }
  requestAnimationFrame(frame);
}

export function startRenderLoop(): void {
  requestAnimationFrame(frame);
}
