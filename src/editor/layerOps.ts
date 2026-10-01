/** Layer operations behind the panel buttons and shortcuts. */
import { FILTER_OK } from './constants';
import { ctx2d, mkCanvas, P } from './dom';
import { commit } from './history';
import {
  active,
  avgScale,
  baseName,
  cloneLayer,
  defAdj,
  displayCanvas,
  filterStr,
  layerMatrix,
  newLayer,
  nextId,
} from './layer';
import { S, dirtyAll, markOverlay } from './state';
import type { Layer } from './types';
import { fitView } from './view';
import { syncXform } from './tools';
import { renderLayers } from '../ui/layersPanel';
import { afterStructural, toast } from '../ui/chrome';
import type { Vec } from '../core/geometry';

export function setActive(id: number): void {
  S.activeId = id;
  renderLayers();
  syncXform();
  markOverlay();
}

/** Add an image as a layer. The first image sets the canvas size; later ones fit inside it. */
export function addImageLayer(c: HTMLCanvasElement, name: string, at: Vec | null): Layer {
  const first = S.layers.length === 0;
  if (first) {
    S.doc.w = c.width;
    S.doc.h = c.height;
  }
  const k = first ? 1 : Math.min(1, (S.doc.w * 0.9) / c.width, (S.doc.h * 0.9) / c.height);
  const l = newLayer(c, {
    name: name || 'Imagem',
    sx: k,
    sy: k,
    x: at ? at.x : S.doc.w / 2,
    y: at ? at.y : S.doc.h / 2,
  });
  S.layers.push(l);
  S.activeId = l.id;
  if (first) fitView();
  return l;
}

export function newEmptyLayer(): void {
  const nl = newLayer(mkCanvas(S.doc.w, S.doc.h), {
    name: `Camada ${S.layers.length + 1}`,
    x: S.doc.w / 2,
    y: S.doc.h / 2,
  });
  const l = active();
  S.layers.splice(l ? S.layers.indexOf(l) + 1 : S.layers.length, 0, nl);
  S.activeId = nl.id;
  commit('Nova camada');
  afterStructural();
  toast('Camada vazia criada · use o Pincel (B) para pintar nela');
}

export function duplicateLayer(): void {
  const l = active();
  if (!l) return;
  const nl = { ...cloneLayer(l), id: nextId(), name: `${baseName(l.name)} · cópia` };
  S.layers.splice(S.layers.indexOf(l) + 1, 0, nl);
  S.activeId = nl.id;
  commit('Duplicar camada');
  afterStructural();
}

export function moveLayer(dir: 1 | -1): void {
  const l = active();
  if (!l) return;
  const i = S.layers.indexOf(l),
    j = i + dir;
  if (j < 0 || j >= S.layers.length) return;
  S.layers.splice(i, 1);
  S.layers.splice(j, 0, l);
  commit(dir > 0 ? 'Subir camada' : 'Descer camada');
  afterStructural();
}

export function deleteLayer(): void {
  const l = active();
  if (!l) return;
  const i = S.layers.indexOf(l);
  S.layers.splice(i, 1);
  const nx = S.layers[Math.min(i, S.layers.length - 1)];
  S.activeId = nx ? nx.id : null;
  commit('Excluir camada');
  afterStructural();
  toast('Camada excluída · Ctrl+Z desfaz');
}

/** Merge the active layer into the one below, keeping both transforms. */
export function mergeDown(): void {
  const up = active();
  if (!up) return;
  const i = S.layers.indexOf(up);
  if (i <= 0) {
    toast('Não há camada abaixo para mesclar');
    return;
  }
  const lo = S.layers[i - 1],
    mLo = layerMatrix(lo),
    rel = mLo.inverse().multiply(layerMatrix(up));
  const wU = up.canvas.width,
    hU = up.canvas.height;
  const cs = [
    [0, 0],
    [wU, 0],
    [wU, hU],
    [0, hU],
  ].map(([x, y]) => rel.transformPoint(P(x, y)));
  const minX = Math.floor(Math.min(0, ...cs.map((p) => p.x))),
    minY = Math.floor(Math.min(0, ...cs.map((p) => p.y)));
  const maxX = Math.ceil(Math.max(lo.canvas.width, ...cs.map((p) => p.x))),
    maxY = Math.ceil(Math.max(lo.canvas.height, ...cs.map((p) => p.y)));
  if ((maxX - minX) * (maxY - minY) > 80e6) {
    toast('Grande demais para mesclar: diminua a camada de cima');
    return;
  }
  const c = mkCanvas(maxX - minX, maxY - minY),
    x = ctx2d(c);
  x.imageSmoothingQuality = 'high';
  if (FILTER_OK) x.filter = filterStr(lo, 1 / avgScale(lo));
  x.drawImage(displayCanvas(lo), -minX, -minY);
  if (up.visible) {
    x.setTransform(new DOMMatrix().translate(-minX, -minY).multiply(rel));
    x.globalAlpha = up.opacity;
    x.globalCompositeOperation = up.blend;
    if (FILTER_OK) x.filter = filterStr(up, 1 / avgScale(lo));
    x.drawImage(displayCanvas(up), 0, 0);
  }
  const ctr = mLo.transformPoint(P((minX + maxX) / 2, (minY + maxY) / 2));
  lo.canvas = c;
  lo.source = c;
  lo.x = ctr.x;
  lo.y = ctr.y;
  lo.adj = defAdj();
  lo.fill = { ...lo.fill, on: false };
  S.layers.splice(i, 1);
  S.activeId = lo.id;
  commit('Mesclar abaixo');
  afterStructural();
}

export type XformAction = 'flipx' | 'flipy' | 'rot90' | 'center' | 'fit' | 'cover' | 'reset';
const XFORM_LABEL: Record<XformAction, string> = {
  flipx: 'Espelhar',
  flipy: 'Espelhar',
  rot90: 'Girar 90°',
  center: 'Centralizar',
  fit: 'Caber na tela',
  cover: 'Cobrir a tela',
  reset: 'Redefinir',
};

export function xformAction(a: XformAction): void {
  const l = active();
  if (!l) return;
  const centre = () => {
    l.x = S.doc.w / 2;
    l.y = S.doc.h / 2;
  };
  if (a === 'flipx') l.flipX = !l.flipX;
  else if (a === 'flipy') l.flipY = !l.flipY;
  else if (a === 'rot90') l.rot = ((l.rot + 90 + 180) % 360) - 180;
  else if (a === 'center') centre();
  else if (a === 'fit' || a === 'cover') {
    const f = a === 'fit' ? Math.min : Math.max;
    l.sx = l.sy = f(S.doc.w / l.canvas.width, S.doc.h / l.canvas.height);
    l.rot = 0;
    centre();
  } else if (a === 'reset') {
    l.sx = l.sy = 1;
    l.rot = 0;
    l.flipX = l.flipY = false;
  }
  commit(XFORM_LABEL[a]);
  dirtyAll();
  syncXform();
}
