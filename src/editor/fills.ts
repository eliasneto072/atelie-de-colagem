/** Big fills with the current colour: the paint bucket and "fill the selection". */
import { hexToRgb } from '../core/color';
import { floodFlags } from '../core/flags';
import type { Vec } from '../core/geometry';
import { cloneCanvas, ctx2d, mkCanvas, P } from './dom';
import { commit } from './history';
import { active, avgScale, layerMatrix, pixelCtx } from './layer';
import { S, opts } from './state';
import type { Layer } from './types';
import { drawLayerList } from './render';
import { buildMask, needSelLayer } from './selection';
import { afterStructural, toast } from '../ui/chrome';

function paintPatch(l: Layer, patch: HTMLCanvasElement, x: number, y: number, label: string): void {
  const ctx = pixelCtx(l);
  ctx.globalAlpha = opts.brushStrength / 100;
  ctx.globalCompositeOperation = opts.paintLock ? 'source-atop' : 'source-over';
  ctx.drawImage(patch, x, y);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  commit(label);
  afterStructural();
}

export function bucketAt(dp: Vec): void {
  const l = active();
  if (!l) {
    toast('Escolha uma camada no painel');
    return;
  }
  if (!l.visible) {
    toast('A camada ativa está oculta');
    return;
  }
  const m = layerMatrix(l),
    inv = m.inverse(),
    q = inv.transformPoint(P(dp.x, dp.y)),
    w = l.canvas.width,
    h = l.canvas.height,
    ix = Math.floor(q.x),
    iy = Math.floor(q.y);
  if (ix < 0 || iy < 0 || ix >= w || iy >= h) {
    toast('Clique dentro da camada ativa (ou crie uma camada Nova do tamanho da tela)');
    return;
  }
  let d: Uint8ClampedArray;
  if (opts.bucketAll) {
    // look at everything visible, mapped into this layer's own pixels
    const c = mkCanvas(w, h),
      x = ctx2d(c, { willReadFrequently: true });
    if (S.doc.bg !== 'transparent') {
      x.setTransform(inv);
      x.fillStyle = S.doc.bg;
      x.fillRect(0, 0, S.doc.w, S.doc.h);
    }
    drawLayerList(x, inv, 1 / avgScale(l));
    d = x.getImageData(0, 0, w, h).data;
  } else d = ctx2d(l.canvas).getImageData(0, 0, w, h).data;
  const fl = floodFlags(d, w, h, ix, iy, opts.bucketTol, opts.bucketContig);
  if (!fl) return;
  const g1 = opts.bucketGrow ? 1 : 0; // grow 1 px to cover the soft fringe around shapes and letters
  const [r, g, b] = hexToRgb(opts.color),
    patch = mkCanvas(fl.bw + 2 * g1, fl.bh + 2 * g1),
    px = ctx2d(patch),
    id = px.createImageData(fl.bw, fl.bh),
    dd = id.data;
  for (let i = 0; i < fl.bf.length; i++) {
    if (!fl.bf[i]) continue;
    const j = i * 4;
    dd[j] = r;
    dd[j + 1] = g;
    dd[j + 2] = b;
    dd[j + 3] = 255;
  }
  px.putImageData(id, g1, g1);
  if (g1) {
    const c = cloneCanvas(patch);
    for (const [ox, oy] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ])
      px.drawImage(c, ox, oy);
  }
  const ox = fl.minX - g1,
    oy = fl.minY - g1;
  if (S.sel) {
    const mask = buildMask(l);
    px.globalCompositeOperation = 'destination-in';
    px.drawImage(mask.canvas, -ox - mask.P, -oy - mask.P);
  }
  paintPatch(l, patch, ox, oy, 'Balde de tinta');
}

export function fillSel(): void {
  const l = needSelLayer();
  if (!l) return;
  if (!l.visible) {
    toast('A camada ativa está oculta');
    return;
  }
  const mask = buildMask(l),
    patch = mkCanvas(mask.canvas.width, mask.canvas.height),
    x = ctx2d(patch);
  x.drawImage(mask.canvas, 0, 0);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = opts.color;
  x.fillRect(0, 0, patch.width, patch.height);
  paintPatch(l, patch, -mask.P, -mask.P, 'Pintar a seleção');
}
