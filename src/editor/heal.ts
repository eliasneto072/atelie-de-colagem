/** "Rebuild the background": remove objects, fill holes, heal after a cut. */
import { dilateFlags, interiorHoleFlags } from '../core/flags';
import type { Vec } from '../core/geometry';
import { inpaint } from '../core/inpaint';
import { ctx2d, mkCanvas, P } from './dom';
import { H, commit, lastLabel, undo } from './history';
import { active, avgScale, layerById, layerMatrix, opaqueAt, pickLayer, pixelCtx } from './layer';
import { S, markOverlay, opts, rt } from './state';
import type { Layer, RemoveAct } from './types';
import { buildMask, maskToFlags, needSelLayer } from './selection';
import { setActive } from './layerOps';
import { afterStructural, hideBar, showBar, toast } from '../ui/chrome';
import type { InpaintJob } from '../workers/inpaint.worker';

/** Above this many hole pixels the job is scaled down first, so it stays quick. */
const MAX_HOLE_PX = 45000;
const MAX_REGION_SIDE = 900;

let healing = 0;
let lastHeal: { id: number; hole: Uint8Array; label: string } | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

/** Results that arrive in the middle of a drag wait until the pointer lets go. */
const deferred: (() => void)[] = [];
export function flushDeferred(): void {
  while (deferred.length && !rt.act) deferred.shift()?.();
}

/** Run the fill in a Web Worker so the page never freezes; fall back to the main thread. */
function runInpaint(job: InpaintJob): Promise<Uint8ClampedArray> {
  return new Promise((resolve) => {
    const onMain = () => setTimeout(() => resolve(inpaint(job.src, job.W, job.H, job.hole, job.bad)), 30);
    let wk: Worker;
    try {
      wk = new Worker(new URL('../workers/inpaint.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      onMain();
      return;
    }
    let done = false;
    wk.onmessage = (e: MessageEvent<Uint8ClampedArray>) => {
      if (done) return;
      done = true;
      wk.terminate();
      resolve(e.data);
    };
    wk.onerror = (ev) => {
      if (done) return;
      done = true;
      wk.terminate();
      ev.preventDefault();
      onMain();
    };
    // copies are sent, so the job's own buffers stay usable for the fallback
    wk.postMessage(job);
  });
}

/**
 * Rebuild the pixels of `l` marked in `hole` (layer-sized flags) from their surroundings.
 * Works on a region around the hole, scaled down for big jobs.
 */
export async function healLayer(l: Layer, hole: Uint8Array, label: string): Promise<boolean> {
  const id = l.id,
    startCanvas = l.canvas,
    w = startCanvas.width,
    h = startCanvas.height;
  let x0 = w,
    y0 = h,
    x1 = -1,
    y1 = -1,
    count = 0;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (!hole[row + x]) continue;
      count++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) {
    toast('Não há nada para preencher aqui');
    return false;
  }
  // a margin around the hole gives the fill enough material to copy from
  const m = Math.max(24, Math.round(Math.max(x1 - x0, y1 - y0) * 0.9));
  const rx0 = Math.max(0, x0 - m),
    ry0 = Math.max(0, y0 - m),
    rx1 = Math.min(w, x1 + 1 + m),
    ry1 = Math.min(h, y1 + 1 + m),
    rw = rx1 - rx0,
    rh = ry1 - ry0;
  const k = Math.min(1, Math.sqrt(MAX_HOLE_PX / count), MAX_REGION_SIDE / Math.max(rw, rh));
  const orig = ctx2d(startCanvas).getImageData(rx0, ry0, rw, rh);
  let sw = rw,
    sh = rh,
    src: Uint8ClampedArray<ArrayBuffer>,
    holeS: Uint8Array<ArrayBuffer>;
  if (k < 0.999) {
    sw = Math.max(16, Math.round(rw * k));
    sh = Math.max(16, Math.round(rh * k));
    const c = mkCanvas(sw, sh),
      cx = ctx2d(c);
    cx.imageSmoothingQuality = 'high';
    cx.drawImage(startCanvas, rx0, ry0, rw, rh, 0, 0, sw, sh);
    src = cx.getImageData(0, 0, sw, sh).data;
    const hs = new Uint8Array(sw * sh);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (hole[y * w + x])
          hs[
            Math.min(sh - 1, Math.floor(((y - ry0) * sh) / rh)) * sw +
              Math.min(sw - 1, Math.floor(((x - rx0) * sw) / rw))
          ] = 1;
      }
    }
    holeS = dilateFlags(hs, sw, sh, 1);
  } else {
    src = new Uint8ClampedArray(orig.data);
    holeS = new Uint8Array(rw * rh);
    for (let y = 0; y < rh; y++)
      for (let x = 0; x < rw; x++) holeS[y * rw + x] = hole[(y + ry0) * w + x + rx0];
  }
  // transparent pixels outside the hole are not material to copy from
  const bad = new Uint8Array(sw * sh);
  for (let i = 0; i < sw * sh; i++) if (src[i * 4 + 3] < 200 && !holeS[i]) bad[i] = 1;

  healing++;
  if (!rt.barMode || rt.barMode === 'heal' || rt.barMode === 'retry')
    showBar('heal', 'Refazendo o fundo…', []);
  let res: Uint8ClampedArray;
  try {
    res = await runInpaint({ src, W: sw, H: sh, hole: holeS, bad });
  } finally {
    healing--;
    if (!healing) hideBar('heal');
  }
  let filled: ArrayLike<number> = res;
  if (k < 0.999) {
    const c = mkCanvas(sw, sh);
    ctx2d(c).putImageData(new ImageData(new Uint8ClampedArray(res), sw, sh), 0, 0);
    const u = mkCanvas(rw, rh),
      ux = ctx2d(u);
    ux.imageSmoothingQuality = 'high';
    ux.drawImage(c, 0, 0, rw, rh);
    filled = ux.getImageData(0, 0, rw, rh).data;
  }
  const out = orig.data;
  for (let y = 0; y < rh; y++) {
    for (let x = 0; x < rw; x++) {
      if (!hole[(y + ry0) * w + x + rx0]) continue;
      const j = (y * rw + x) * 4;
      out[j] = filled[j];
      out[j + 1] = filled[j + 1];
      out[j + 2] = filled[j + 2];
      out[j + 3] = filled[j + 3];
    }
  }
  const apply = () => {
    const L = layerById(id);
    if (!L || L.canvas !== startCanvas) {
      toast('A camada mudou enquanto o fundo era refeito. Tente de novo.');
      return;
    }
    pixelCtx(L).putImageData(orig, rx0, ry0);
    commit(label);
    afterStructural();
    // every run comes out a little different: offer another take right away
    lastHeal = { id, hole, label };
    if (!rt.barMode || rt.barMode === 'retry') {
      showBar('retry', 'Fundo refeito', [
        ['Tentar outra versão', retryHeal],
        ['Ok', () => hideBar('retry')],
      ]);
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = setTimeout(() => hideBar('retry'), 9000);
    }
  };
  if (rt.act) deferred.push(apply);
  else apply();
  return true;
}

function retryHeal(): void {
  hideBar('retry');
  const h = lastHeal;
  if (!h) return;
  if (!H.stack[H.idx] || lastLabel() !== h.label) {
    toast('Outra mudança veio depois; desfaça até lá para tentar de novo');
    return;
  }
  undo();
  const L = layerById(h.id);
  if (L) void healLayer(L, h.hole, h.label);
}

export function healSelection(): void {
  const l = needSelLayer();
  if (!l) return;
  if (!l.visible) {
    toast('A camada ativa está oculta');
    return;
  }
  const f = maskToFlags(buildMask(l), l.canvas.width, l.canvas.height, 2);
  if (!f) {
    toast('A seleção não pega a camada ativa');
    return;
  }
  void healLayer(l, f, 'Remover e refazer o fundo');
}

export function healHoles(): void {
  const l = active();
  if (!l) return;
  const d = ctx2d(l.canvas).getImageData(0, 0, l.canvas.width, l.canvas.height).data;
  const f = interiorHoleFlags(d, l.canvas.width, l.canvas.height);
  if (!f) {
    toast('Esta camada não tem buracos para tapar');
    return;
  }
  void healLayer(l, f, 'Tapar buracos');
}

// ---- the Remove tool: paint over the object, release to rebuild ----
export function startRemove(dp: Vec): void {
  let l = active();
  // painting over pixels the active layer doesn't have: work on the picture actually under the finger
  if (!l || !l.visible || !opaqueAt(l, dp)) {
    const t = pickLayer(dp);
    if (t && t !== l) {
      setActive(t.id);
      l = t;
      toast(`Removendo de: ${t.name}`);
    }
  }
  if (!l) {
    toast('Escolha uma camada no painel');
    return;
  }
  if (!l.visible) {
    toast('A camada ativa está oculta');
    return;
  }
  if (rt.removeMask?.busy) {
    toast('Espere terminar o objeto anterior');
    return;
  }
  const inv = layerMatrix(l).inverse(),
    q = inv.transformPoint(P(dp.x, dp.y)),
    r = Math.max(1, opts.removeSize / 2 / avgScale(l));
  const c = mkCanvas(l.canvas.width, l.canvas.height),
    x = ctx2d(c);
  x.strokeStyle = x.fillStyle = '#ff3b30';
  x.lineCap = x.lineJoin = 'round';
  x.lineWidth = r * 2;
  x.beginPath();
  x.arc(q.x, q.y, r, 0, Math.PI * 2);
  x.fill();
  rt.removeMask = { id: l.id, canvas: c, ctx: x, busy: false };
  rt.act = { kind: 'remove', inv, last: { x: q.x, y: q.y } };
  markOverlay();
}

export function removeMove(a: RemoveAct, dp: Vec): void {
  const rm = rt.removeMask;
  if (!rm) return;
  const q = a.inv.transformPoint(P(dp.x, dp.y)),
    x = rm.ctx;
  x.beginPath();
  x.moveTo(a.last.x, a.last.y);
  x.lineTo(q.x, q.y);
  x.stroke();
  a.last = { x: q.x, y: q.y };
  markOverlay();
}

export async function finishRemove(): Promise<void> {
  const rm = rt.removeMask;
  if (!rm) return;
  rm.busy = true;
  markOverlay();
  const w = rm.canvas.width,
    h = rm.canvas.height,
    d = rm.ctx.getImageData(0, 0, w, h).data,
    f = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) if (d[i * 4 + 3] > 0) f[i] = 1;
  const L = S.layers.find((x) => x.id === rm.id);
  try {
    if (L) await healLayer(L, dilateFlags(f, w, h, 1), 'Remover objeto');
  } finally {
    if (rt.removeMask === rm) rt.removeMask = null;
    markOverlay();
  }
}
