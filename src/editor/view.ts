/** The stage: canvases, zoom/pan, and document ↔ screen coordinates. */
import { clamp, type Vec } from '../core/geometry';
import { ctx2d, el, mkCanvas } from './dom';
import { S, dirtyAll, theme } from './state';
import { renderLayers } from '../ui/layersPanel';

export const stage = el('stage');
export const scene = el<HTMLCanvasElement>('scene');
export const overlay = el<HTMLCanvasElement>('overlay');
export const sctx = ctx2d(scene);
export const octx = ctx2d(overlay);
/** Off-screen buffer with exactly what is on the sheet (used by the eyedropper and loupe). */
export const buf = document.createElement('canvas');
export const bctx = ctx2d(buf, { willReadFrequently: true });

export const mqMobile = matchMedia('(max-width: 820px)');

/** Viewport size in CSS px and the device pixel ratio in use. */
export const vp = { W: 0, H: 0, dpr: 1, viewInit: false, viewTouched: false };

export let checkerPat: CanvasPattern | null = null;

export function readColors(): void {
  const cs = getComputedStyle(document.documentElement),
    g = (n: string) => cs.getPropertyValue(n).trim();
  theme.accent = g('--accent') || theme.accent;
  theme.rulerBg = g('--ruler-bg') || theme.rulerBg;
  theme.rulerDoc = g('--ruler-doc') || theme.rulerDoc;
  theme.rulerInk = g('--ruler-ink') || theme.rulerInk;
  theme.checkA = g('--check-a') || theme.checkA;
  theme.checkB = g('--check-b') || theme.checkB;
  makeChecker();
  dirtyAll();
  if (S.layers.length) renderLayers();
}

function makeChecker(): void {
  const n = 8 * vp.dpr,
    c = mkCanvas(2 * n, 2 * n),
    x = ctx2d(c);
  x.fillStyle = theme.checkA;
  x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = theme.checkB;
  x.fillRect(0, 0, n, n);
  x.fillRect(n, n, n, n);
  checkerPat = sctx.createPattern(c, 'repeat');
}

export function resize(): void {
  const r = stage.getBoundingClientRect(),
    ndpr = Math.min(window.devicePixelRatio || 1, 2);
  const oldW = vp.W,
    oldH = vp.H;
  vp.W = r.width;
  vp.H = r.height;
  const dprChanged = ndpr !== vp.dpr;
  vp.dpr = ndpr;
  for (const c of [scene, overlay, buf]) {
    c.width = Math.max(1, Math.round(vp.W * vp.dpr));
    c.height = Math.max(1, Math.round(vp.H * vp.dpr));
  }
  if (dprChanged || !checkerPat) makeChecker();
  // keep fitting until the user zooms or pans on purpose
  if ((!vp.viewInit || !vp.viewTouched) && vp.W > 0) {
    vp.viewInit = true;
    fitView();
  } else if (oldW) {
    S.view.x += (vp.W - oldW) / 2;
    S.view.y += (vp.H - oldH) / 2;
  }
  dirtyAll();
}

/** Document → device pixels of the scene canvases. */
export const viewMatrix = (): DOMMatrix =>
  new DOMMatrix([S.view.s * vp.dpr, 0, 0, S.view.s * vp.dpr, S.view.x * vp.dpr, S.view.y * vp.dpr]);
export const toDoc = (sp: Vec): Vec => ({ x: (sp.x - S.view.x) / S.view.s, y: (sp.y - S.view.y) / S.view.s });
export const toScreen = (p: Vec): Vec => ({ x: p.x * S.view.s + S.view.x, y: p.y * S.view.s + S.view.y });

export function fitView(): void {
  if (!vp.W) return;
  const phone = mqMobile.matches,
    pad = phone ? 14 : 44,
    off = phone ? 0 : 9; // room for the rulers
  const s = Math.min((vp.W - pad * 2) / S.doc.w, (vp.H - pad * 2) / S.doc.h, 4);
  S.view.s = s > 0 ? s : 1;
  S.view.x = (vp.W - S.doc.w * S.view.s) / 2 + off;
  S.view.y = (vp.H - S.doc.h * S.view.s) / 2 + off;
  vp.viewTouched = false;
  updateZoomUI();
  dirtyAll();
}

export function zoomAt(px: number, py: number, f: number): void {
  const v = S.view,
    ns = clamp(v.s * f, 0.02, 32),
    dx = (px - v.x) / v.s,
    dy = (py - v.y) / v.s;
  v.s = ns;
  v.x = px - dx * ns;
  v.y = py - dy * ns;
  vp.viewTouched = true;
  updateZoomUI();
  dirtyAll();
}

export const zoomTo = (s: number): void => zoomAt(vp.W / 2, vp.H / 2, s / S.view.s);
export const zoomBy = (f: number): void => zoomAt(vp.W / 2, vp.H / 2, f);

export function updateZoomUI(): void {
  el('z-val').textContent = Math.round(S.view.s * 100) + '%';
}

/** Pointer position relative to the stage. */
export function local(e: { clientX: number; clientY: number }): Vec {
  const r = overlay.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}
