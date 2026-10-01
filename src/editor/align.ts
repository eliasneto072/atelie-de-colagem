/** Alignment: visible-content boxes, smart-guide setup and the align buttons. */
import { bboxOf } from '../core/geometry';
import { alignDelta, boxCandidates, type AlignMode, type Bounds, type SnapCandidate } from '../core/snap';
import { ctx2d, maybe, P } from './dom';
import { commit } from './history';
import { active, layerMatrix } from './layer';
import { S, dirtyAll, opts } from './state';
import type { Layer, SnapSetup } from './types';
import { syncXform } from './tools';

/** Bounding box of the pixels you can actually see (cut-outs often carry transparent margins). */
export function contentBox(l: Layer): { x0: number; y0: number; x1: number; y1: number } {
  const c = l.canvas;
  if (l._cb && l._cb.src === c) return l._cb;
  let x0 = 0,
    y0 = 0,
    x1 = c.width,
    y1 = c.height;
  // very large canvases use their full size: scanning them would stall the drag
  if (c.width * c.height <= 16e6) {
    const d = ctx2d(c).getImageData(0, 0, c.width, c.height).data,
      w = c.width;
    let a = w,
      b = c.height,
      e = -1,
      f = -1;
    for (let y = 0; y < c.height; y++) {
      const row = y * w * 4;
      for (let x = 0; x < w; x++) {
        if (d[row + x * 4 + 3] > 8) {
          if (x < a) a = x;
          if (x > e) e = x;
          if (y < b) b = y;
          if (y > f) f = y;
        }
      }
    }
    if (e >= 0) {
      x0 = a;
      y0 = b;
      x1 = e + 1;
      y1 = f + 1;
    }
  }
  l._cb = { src: c, x0, y0, x1, y1 };
  return l._cb;
}

/** Visible content of a layer as an axis-aligned box in document pixels. */
export function layerBoxDoc(l: Layer): Bounds {
  const b = contentBox(l),
    m = layerMatrix(l);
  const bb = bboxOf(
    [
      [b.x0, b.y0],
      [b.x1, b.y0],
      [b.x1, b.y1],
      [b.x0, b.y1],
    ].map(([x, y]) => m.transformPoint(P(x, y))),
  );
  return { x0: bb.x, y0: bb.y, x1: bb.x + bb.w, y1: bb.y + bb.h, cx: bb.x + bb.w / 2, cy: bb.y + bb.h / 2 };
}

const docBox = (): Bounds => ({ x0: 0, y0: 0, x1: S.doc.w, y1: S.doc.h, cx: S.doc.w / 2, cy: S.doc.h / 2 });

/** Everything the moving layer can snap to: the sheet and every other visible layer. */
export function snapSetup(l: Layer): SnapSetup {
  const me = layerBoxDoc(l),
    xs: SnapCandidate[] = [],
    ys: SnapCandidate[] = [];
  for (const b of [
    docBox(),
    ...S.layers.filter((o) => o !== l && o.visible && o.opacity > 0).map(layerBoxDoc),
  ]) {
    const c = boxCandidates(b);
    xs.push(...c.xs);
    ys.push(...c.ys);
  }
  return {
    xs,
    ys,
    offX: [me.x0 - l.x, me.cx - l.x, me.x1 - l.x],
    offY: [me.y0 - l.y, me.cy - l.y, me.y1 - l.y],
  };
}

/** Fill the "Align with" list with the other layers (top first). */
export function fillAlignTargets(): void {
  const sel = maybe<HTMLSelectElement>('al-to');
  if (!sel) return;
  const others = S.layers.filter((x) => x.id !== S.activeId).reverse();
  const sig = others.map((x) => x.id + ':' + x.name).join('|');
  if (sel.dataset.sig !== sig) {
    sel.innerHTML = '';
    sel.append(new Option('A tela', 'doc'));
    for (const x of others) sel.append(new Option(x.name, String(x.id)));
    sel.dataset.sig = sig;
  }
  sel.value = others.some((x) => String(x.id) === opts.alignTo) ? opts.alignTo : 'doc';
}

export function alignActive(mode: AlignMode): void {
  const l = active();
  if (!l) return;
  const t =
    opts.alignTo !== 'doc' ? S.layers.find((x) => String(x.id) === opts.alignTo && x.id !== l.id) : undefined;
  const { dx, dy } = alignDelta(mode, t ? layerBoxDoc(t) : docBox(), layerBoxDoc(l));
  l.x += dx;
  l.y += dy;
  commit(t ? `Alinhar com ${t.name}` : 'Alinhar com a tela');
  dirtyAll();
  syncXform();
}
