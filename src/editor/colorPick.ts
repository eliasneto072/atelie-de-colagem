/** Colour tools: eyedropper, current colour, and "remove a background colour". */
import { colorToAlphaPixels, isHex, toHex } from '../core/color';
import type { Vec } from '../core/geometry';
import { ctx2d, el, maybe, mkCanvas } from './dom';
import { commit } from './history';
import { pixelCtx } from './layer';
import { S, markOverlay, opts, rt, saveOpts } from './state';
import type { Layer } from './types';
import { bctx, buf, mqMobile, vp } from './view';
import { drawLayerList } from './render';
import { pointer, updateCursor } from './pointer';
import { toolHint } from './tools';
import { afterStructural, closeSheet, hideBar, openSheet, panelEl, showBar, toast } from '../ui/chrome';

/** Average colour of an n×n square of the composed picture around document point `dp`. */
export function sampleDoc(dp: Vec, n: number): string | null {
  const c = mkCanvas(n, n),
    x = ctx2d(c, { willReadFrequently: true }),
    ox = Math.floor(dp.x) - (n - 1) / 2,
    oy = Math.floor(dp.y) - (n - 1) / 2;
  if (S.doc.bg !== 'transparent') {
    x.fillStyle = S.doc.bg;
    x.fillRect(0, 0, n, n);
  }
  drawLayerList(x, new DOMMatrix().translate(-ox, -oy), 1);
  const d = x.getImageData(0, 0, n, n).data;
  let r = 0,
    g = 0,
    b = 0,
    a = 0;
  // alpha-weighted, so half-transparent edge pixels don't darken the result
  for (let i = 0; i < d.length; i += 4) {
    const al = d[i + 3];
    r += d[i] * al;
    g += d[i + 1] * al;
    b += d[i + 2] * al;
    a += al;
  }
  return a ? toHex(r / a, g / a, b / a) : null;
}

/** Colour on screen under the pointer (cheap: reads the composed buffer). */
export function sampleBuf(sp: Vec | null): string | null {
  if (!S.layers.length || !sp) return null;
  const x = Math.floor(sp.x * vp.dpr),
    y = Math.floor(sp.y * vp.dpr);
  if (x < 0 || y < 0 || x >= buf.width || y >= buf.height) return null;
  const d = bctx.getImageData(x, y, 1, 1).data;
  return d[3] ? toHex(d[0], d[1], d[2]) : null;
}

export function setCurrentColor(hex: string, quiet = false): void {
  if (!isHex(hex)) return;
  opts.color = hex.toLowerCase();
  saveOpts();
  for (const id of ['cur-color', 'opt-color']) {
    const e = maybe<HTMLInputElement>(id);
    if (e && e.value !== opts.color) e.value = opts.color;
  }
  const t = maybe('opt-color-hex');
  if (t) t.textContent = opts.color;
  const dot = maybe('sa-fill-dot');
  if (dot) dot.style.background = opts.color;
  markOverlay();
  if (!quiet) toast(`Cor ${opts.color} pega · o Pincel já usa essa cor`);
}

/** Eyedropper started from a panel button: the next click on the picture calls `apply`. */
export function startPickOnce(apply: (hex: string) => void, current: string, msg?: string): void {
  if (!S.layers.length) return;
  rt.pickOnce = { apply, current };
  // on a phone the panel covers the picture: hide it while picking, bring it back after
  rt.pickReopen =
    mqMobile.matches && panelEl.classList.contains('is-open') ? (panelEl.dataset.sheet ?? null) : null;
  if (rt.pickReopen) closeSheet();
  el('st-hint').textContent = 'Clique na cor que quer copiar · Esc cancela';
  const text = mqMobile.matches
    ? (msg ?? 'Toque na cor que quer copiar').replace(/^Agora clique/, 'Toque').replace(' · Esc cancela', '')
    : (msg ?? 'Clique na cor que quer copiar · Esc cancela');
  showBar('pick', text, [['Cancelar', () => endPickOnce()]]);
  updateCursor(pointer.sp);
  markOverlay();
}

export function endPickOnce(): void {
  rt.pickOnce = null;
  hideBar('pick');
  el('st-hint').textContent = toolHint();
  updateCursor(pointer.sp);
  markOverlay();
  if (rt.pickReopen) {
    const id = rt.pickReopen;
    rt.pickReopen = null;
    openSheet(id);
  }
}

/** Pick the colour at `dp` for the one-shot eyedropper or as the current colour. */
export function pickAt(dp: Vec): void {
  const hex = sampleDoc(dp, opts.pickSize);
  if (!hex) {
    toast('Aí está transparente: escolha um ponto com cor');
    return;
  }
  const p = rt.pickOnce;
  if (p) {
    endPickOnce();
    p.apply(hex);
  } else setCurrentColor(hex);
}

/** Make one colour of a layer transparent, keeping soft edges. */
export function removeColor(l: Layer, hex: string, tolPct: number): void {
  const ctx = pixelCtx(l),
    w = l.canvas.width,
    h = l.canvas.height,
    id = ctx.getImageData(0, 0, w, h);
  const changed = colorToAlphaPixels(id.data, hex, tolPct);
  ctx.putImageData(id, 0, 0);
  commit('Tirar cor do fundo');
  afterStructural();
  toast(changed ? 'Fundo tirado · agora dá para cobrir com a cor nova' : 'Não achei essa cor nesta camada');
}
