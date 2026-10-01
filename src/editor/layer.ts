/** The layer model: creation, transforms and how a layer is drawn. */
import { ctx2d, cloneCanvas, mkCanvas } from './dom';
import { S } from './state';
import type { Adjust, Layer, LayerFill } from './types';

let uid = 1;
export const nextId = (): number => uid++;

export const defAdj = (): Adjust => ({ b: 100, c: 100, s: 100, h: 0, blur: 0 });
export const defFill = (): LayerFill => ({ on: false, color: '#000000', amount: 100 });

export const cloneLayer = (l: Layer): Layer => ({ ...l, adj: { ...l.adj }, fill: { ...l.fill } });

export function newLayer(canvas: HTMLCanvasElement, props: Partial<Layer> = {}): Layer {
  return {
    id: nextId(),
    name: 'Camada',
    canvas,
    source: canvas,
    x: canvas.width / 2,
    y: canvas.height / 2,
    sx: 1,
    sy: 1,
    rot: 0,
    flipX: false,
    flipY: false,
    opacity: 1,
    blend: 'source-over',
    visible: true,
    adj: defAdj(),
    fill: defFill(),
    ...props,
  };
}

export const active = (): Layer | null => S.layers.find((l) => l.id === S.activeId) ?? null;
export const layerById = (id: number): Layer | null => S.layers.find((l) => l.id === id) ?? null;

/** Layer pixels → document pixels. */
export function layerMatrix(l: Layer): DOMMatrix {
  return new DOMMatrix()
    .translate(l.x, l.y)
    .rotate(l.rot)
    .scale(l.sx * (l.flipX ? -1 : 1), l.sy * (l.flipY ? -1 : 1))
    .translate(-l.canvas.width / 2, -l.canvas.height / 2);
}

export const avgScale = (l: Layer): number => Math.sqrt(Math.abs(l.sx * l.sy)) || 1;

export function layerCornersDoc(l: Layer): DOMPoint[] {
  const m = layerMatrix(l),
    w = l.canvas.width,
    h = l.canvas.height;
  return [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ].map(([x, y]) => m.transformPoint(new DOMPoint(x, y)));
}

/** CSS filter string for the colour adjustments; blur is scaled to the drawing scale. */
export function filterStr(l: Layer, blurK: number): string {
  const a = l.adj,
    p: string[] = [];
  if (a.b !== 100) p.push(`brightness(${a.b}%)`);
  if (a.c !== 100) p.push(`contrast(${a.c}%)`);
  if (a.s !== 100) p.push(`saturate(${a.s}%)`);
  if (a.h) p.push(`hue-rotate(${a.h}deg)`);
  if (a.blur > 0) p.push(`blur(${(a.blur * blurK).toFixed(2)}px)`);
  return p.length ? p.join(' ') : 'none';
}

/** What a layer looks like on screen: its pixels, optionally covered by a solid colour (alpha kept). */
export function displayCanvas(l: Layer): HTMLCanvasElement {
  const f = l.fill;
  if (!f || !f.on || f.amount <= 0) return l.canvas;
  const key = f.color + '|' + f.amount;
  if (l._fc && l._fc.src === l.canvas && l._fc.key === key) return l._fc.canvas;
  const c = mkCanvas(l.canvas.width, l.canvas.height),
    x = ctx2d(c);
  x.drawImage(l.canvas, 0, 0);
  x.globalCompositeOperation = 'source-atop';
  x.globalAlpha = f.amount / 100;
  x.fillStyle = f.color;
  x.fillRect(0, 0, c.width, c.height);
  l._fc = { src: l.canvas, key, canvas: c };
  return c;
}

/**
 * Context for editing a layer's pixels. The canvas is copied first, so history
 * snapshots that still point at the old canvas keep their pixels.
 */
export function pixelCtx(l: Layer): CanvasRenderingContext2D {
  l.canvas = cloneCanvas(l.canvas);
  return ctx2d(l.canvas);
}

/** True when the layer has a visible pixel under document point `dp`. */
export function opaqueAt(l: Layer, dp: { x: number; y: number }): boolean {
  const q = layerMatrix(l).inverse().transformPoint(new DOMPoint(dp.x, dp.y)),
    ix = Math.floor(q.x),
    iy = Math.floor(q.y);
  if (ix < 0 || iy < 0 || ix >= l.canvas.width || iy >= l.canvas.height) return false;
  return ctx2d(l.canvas).getImageData(ix, iy, 1, 1).data[3] > 10;
}

/** Topmost visible layer with a pixel under `dp`. */
export function pickLayer(dp: { x: number; y: number }): Layer | null {
  for (let i = S.layers.length - 1; i >= 0; i--) {
    const l = S.layers[i];
    if (l.visible && opaqueAt(l, dp)) return l;
  }
  return null;
}

/** Strip " · recorte" / " · cópia" so names don't grow on every copy. */
export const baseName = (n: string): string => n.replace(/( · (recorte|cópia))+$/, '');
