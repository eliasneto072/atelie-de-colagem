/** Paint brush, eraser and restore brush (soft or pixel tip). */
import { hexToRgb } from '../core/color';
import { pixelRect, type Vec } from '../core/geometry';
import { ctx2d, mkCanvas, P } from './dom';
import { active, avgScale, layerMatrix, pixelCtx } from './layer';
import { markScene, opts, rt } from './state';
import type { BrushAct, BrushMode, Layer } from './types';
import { toast } from '../ui/chrome';

let scratch = mkCanvas(64, 64);

export const brushLabel = (m: BrushMode): string =>
  m === 'erase' ? 'Borracha' : m === 'paint' ? 'Pincel' : 'Restaurar';

function brushGrad(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  rgb = '0,0,0',
): CanvasGradient {
  const a = opts.brushStrength / 100,
    hard = Math.min(opts.brushHard / 100, 0.98);
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${a})`);
  g.addColorStop(hard, `rgba(${rgb},${a})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  return g;
}

/** One dab of the brush at (lx, ly) in layer pixels. */
function stamp(
  l: Layer,
  ctx: CanvasRenderingContext2D,
  lx: number,
  ly: number,
  r: number,
  mode: BrushMode,
  rgb: string,
): void {
  const x0 = Math.max(0, Math.floor(lx - r)),
    y0 = Math.max(0, Math.floor(ly - r)),
    x1 = Math.min(l.canvas.width, Math.ceil(lx + r)),
    y1 = Math.min(l.canvas.height, Math.ceil(ly + r));
  if (x1 <= x0 || y1 <= y0) return;
  const rw = x1 - x0,
    rh = y1 - y0;
  if (opts.paintTip === 'pixel' && (mode === 'paint' || mode === 'erase')) {
    // hard, solid pixels: a filled disc built from 1-px rows
    const { n, x0: px, y0: py } = pixelRect(lx, ly, r);
    ctx.globalCompositeOperation =
      mode === 'erase' ? 'destination-out' : opts.paintLock ? 'source-atop' : 'source-over';
    ctx.fillStyle = mode === 'erase' ? '#000' : `rgb(${rgb})`;
    if (n <= 3) ctx.fillRect(px, py, n, n);
    else {
      const c = (n - 1) / 2,
        rr = n / 2;
      for (let j = 0; j < n; j++) {
        const half = Math.sqrt(Math.max(0, rr * rr - (j - c) * (j - c))),
          i0 = Math.ceil(c - half),
          i1 = Math.floor(c + half);
        if (i1 >= i0) ctx.fillRect(px + i0, py + j, i1 - i0 + 1, 1);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    return;
  }
  if (mode === 'paint') {
    ctx.globalCompositeOperation = opts.paintLock ? 'source-atop' : 'source-over';
    ctx.fillStyle = brushGrad(ctx, lx, ly, r, rgb);
    ctx.fillRect(x0, y0, rw, rh);
    ctx.globalCompositeOperation = 'source-over';
    return;
  }
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = brushGrad(ctx, lx, ly, r);
  ctx.fillRect(x0, y0, rw, rh);
  if (mode === 'restore') {
    // current·(1−b) + original·b : the original pixels come back exactly
    if (scratch.width < rw || scratch.height < rh)
      scratch = mkCanvas(Math.max(rw, scratch.width), Math.max(rh, scratch.height));
    const t = ctx2d(scratch);
    t.setTransform(1, 0, 0, 1, 0, 0);
    t.globalCompositeOperation = 'copy';
    t.drawImage(l.source, x0, y0, rw, rh, 0, 0, rw, rh);
    t.globalCompositeOperation = 'destination-in';
    t.fillStyle = brushGrad(t, lx - x0, ly - y0, r);
    t.fillRect(0, 0, rw, rh);
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(scratch, 0, 0, rw, rh, x0, y0, rw, rh);
  }
  ctx.globalCompositeOperation = 'source-over';
}

/** Begin a stroke at document point `dp`; `straight` joins it to the end of the previous stroke. */
export function startBrush(dp: Vec, mode: BrushMode, straight: boolean): void {
  const l = active();
  if (!l) {
    toast('Escolha uma camada no painel');
    return;
  }
  if (!l.visible) {
    toast('A camada ativa está oculta');
    return;
  }
  const ctx = pixelCtx(l),
    inv = layerMatrix(l).inverse(),
    q = inv.transformPoint(P(dp.x, dp.y));
  const r = Math.max(0.5, opts.brushSize / 2 / avgScale(l));
  const rgb = hexToRgb(opts.color).join(',');
  const pix = opts.paintTip === 'pixel' && mode !== 'restore';
  const a: BrushAct = {
    kind: 'brush',
    l,
    ctx,
    inv,
    r,
    rgb,
    last: { x: q.x, y: q.y },
    end: { x: q.x, y: q.y },
    mode,
    spacing: pix ? Math.max(1, Math.round(r * 2) / 4) : Math.max(0.5, r * 0.16),
  };
  rt.act = a;
  const ls = rt.lastStroke;
  if (straight && ls && ls.id === l.id && ls.mode === mode) {
    a.last = { x: ls.x, y: ls.y };
    brushMove(a, dp);
  } else stamp(l, ctx, q.x, q.y, r, mode, rgb);
  l._fc = null;
  markScene();
}

export function brushMove(a: BrushAct, dp: Vec): void {
  const q = a.inv.transformPoint(P(dp.x, dp.y)),
    dx = q.x - a.last.x,
    dy = q.y - a.last.y,
    d = Math.hypot(dx, dy);
  a.end = { x: q.x, y: q.y };
  if (d < a.spacing) return;
  const ux = dx / d,
    uy = dy / d;
  let t = a.spacing;
  while (t <= d) {
    stamp(a.l, a.ctx, a.last.x + ux * t, a.last.y + uy * t, a.r, a.mode, a.rgb);
    t += a.spacing;
  }
  const used = t - a.spacing;
  a.last = { x: a.last.x + ux * used, y: a.last.y + uy * used };
  a.l._fc = null;
  markScene();
}
