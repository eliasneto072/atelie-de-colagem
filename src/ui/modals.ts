/** Dialogs: canvas size/background, export, and about. */
import { bboxOf, clamp } from '../core/geometry';
import { button, ctx2d, el, input, mkCanvas } from '../editor/dom';
import { commit } from '../editor/history';
import { active, layerCornersDoc } from '../editor/layer';
import { S } from '../editor/state';
import { fitView } from '../editor/view';
import { drawLayerList } from '../editor/render';
import { selChanged } from '../editor/selection';
import { afterStructural, toast } from './chrome';

const MODALS = ['modal-canvas', 'modal-export', 'modal-about'];
let lastFocus: HTMLElement | null = null;

function openModal(id: string): void {
  lastFocus = document.activeElement as HTMLElement | null;
  const m = el(id);
  m.hidden = false;
  m.querySelector<HTMLElement>('input, button.primary, [data-close]')?.focus();
}

export function closeModals(): void {
  for (const id of MODALS) el(id).hidden = true;
  lastFocus?.focus();
  lastFocus = null;
}

// ---- canvas size and background ----
function openCanvasModal(): void {
  input('mc-w').value = String(S.doc.w);
  input('mc-h').value = String(S.doc.h);
  const bg = S.doc.bg;
  const r =
    bg === 'transparent'
      ? 'mc-bg-t'
      : bg === '#ffffff'
        ? 'mc-bg-w'
        : bg === '#000000'
          ? 'mc-bg-k'
          : 'mc-bg-c';
  if (r === 'mc-bg-c') input('mc-color').value = bg;
  input(r).checked = true;
  openModal('modal-canvas');
}

function applyCanvasModal(): void {
  const w = clamp(Math.round(Number(input('mc-w').value) || S.doc.w), 1, 12000),
    h = clamp(Math.round(Number(input('mc-h').value) || S.doc.h), 1, 12000);
  const sel = document.querySelector<HTMLInputElement>('input[name="mc-bg"]:checked');
  const bg = !sel ? S.doc.bg : sel.value === 'custom' ? input('mc-color').value : sel.value;
  const resized = w !== S.doc.w || h !== S.doc.h;
  if (resized) {
    // keep the content centred on the new canvas
    const dx = (w - S.doc.w) / 2,
      dy = (h - S.doc.h) / 2;
    for (const l of S.layers) {
      l.x += dx;
      l.y += dy;
    }
    S.sel = null;
    selChanged();
  }
  S.doc = { w, h, bg };
  commit(resized ? 'Tamanho da tela' : 'Fundo da tela');
  closeModals();
  if (resized) fitView();
  afterStructural();
}

function fitCanvasToLayer(): void {
  const l = active();
  if (!l) {
    toast('Escolha uma camada');
    return;
  }
  const bb = bboxOf(layerCornersDoc(l)),
    x0 = Math.floor(bb.x),
    y0 = Math.floor(bb.y),
    w = Math.ceil(bb.x + bb.w) - x0,
    h = Math.ceil(bb.y + bb.h) - y0;
  for (const q of S.layers) {
    q.x -= x0;
    q.y -= y0;
  }
  S.doc.w = w;
  S.doc.h = h;
  S.sel = null;
  selChanged();
  commit('Tela do tamanho da camada');
  closeModals();
  fitView();
  afterStructural();
}

// ---- export ----
/** Above this many pixels an export size is offered disabled (browsers refuse huge canvases). */
const MAX_EXPORT_PX = 120e6;

export function openExport(): void {
  if (!S.layers.length) {
    toast('Nada para exportar ainda');
    return;
  }
  const big = (k: number) => S.doc.w * k * S.doc.h * k > MAX_EXPORT_PX;
  for (const [id, k] of [
    ['me-s05', 0.5],
    ['me-s1', 1],
    ['me-s2', 2],
  ] as const) {
    input(id).disabled = big(k);
    el(id + '-t').textContent =
      `${Math.round(k * 100)}% · ${Math.round(S.doc.w * k)} × ${Math.round(S.doc.h * k)}`;
  }
  if (input('me-s2').checked && big(2)) input('me-s1').checked = true;
  el('me-fallback').hidden = true;
  openModal('modal-export');
}

/** Every visible layer flattened at scale `k`; `flatten` paints a background under transparency. */
function renderComposite(k: number, flatten: string | null): HTMLCanvasElement {
  const c = mkCanvas(S.doc.w * k, S.doc.h * k),
    x = ctx2d(c);
  const bg = S.doc.bg !== 'transparent' ? S.doc.bg : flatten;
  if (bg) {
    x.fillStyle = bg;
    x.fillRect(0, 0, c.width, c.height);
  }
  drawLayerList(x, new DOMMatrix().scale(k, k), k);
  return c;
}

let fallbackUrl: string | null = null;
function showFallback(blob: Blob): void {
  if (fallbackUrl) URL.revokeObjectURL(fallbackUrl);
  fallbackUrl = URL.createObjectURL(blob);
  el<HTMLImageElement>('me-img').src = fallbackUrl;
  el('me-fallback').hidden = false;
}

async function saveExport(): Promise<void> {
  const jpg = input('me-jpg').checked,
    k = Number(document.querySelector<HTMLInputElement>('input[name="me-scale"]:checked')?.value ?? 1);
  const name = (input('me-name').value.trim() || 'colagem').replace(/[\\/:*?"<>|]+/g, '-');
  const filename = `${name}.${jpg ? 'jpg' : 'png'}`;
  const btn = button('me-save');
  btn.disabled = true;
  btn.textContent = 'Gerando…';
  try {
    const c = renderComposite(k, jpg ? '#ffffff' : null);
    const blob = await new Promise<Blob | null>((r) =>
      c.toBlob(r, jpg ? 'image/jpeg' : 'image/png', Number(input('me-q').value) / 100),
    );
    if (!blob) throw new Error('toBlob falhou');
    if ('download' in HTMLAnchorElement.prototype) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      toast(`Salvo: ${filename}`);
      closeModals();
    } else showFallback(blob);
  } catch {
    toast('Não consegui gerar a imagem. Tente um tamanho menor.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Salvar arquivo';
  }
}

export function initModals(): void {
  document.querySelectorAll<HTMLElement>('.modal').forEach((m) =>
    m.addEventListener('click', (e) => {
      if (e.target === m || (e.target as HTMLElement).closest('[data-close]')) closeModals();
    }),
  );
  button('btn-canvas').addEventListener('click', openCanvasModal);
  input('mc-color').addEventListener('input', () => (input('mc-bg-c').checked = true));
  button('mc-apply').addEventListener('click', applyCanvasModal);
  button('mc-fit').addEventListener('click', fitCanvasToLayer);

  button('btn-export').addEventListener('click', openExport);
  document
    .querySelectorAll<HTMLInputElement>('input[name="me-fmt"]')
    .forEach((r) => r.addEventListener('change', () => (el('me-q-row').hidden = !input('me-jpg').checked)));
  input('me-q').addEventListener('input', () => (el('me-q-v').textContent = input('me-q').value));
  button('me-save').addEventListener('click', () => void saveExport());

  button('btn-about').addEventListener('click', () => openModal('modal-about'));
  el('about-version').textContent = `versão ${__APP_VERSION__}`;
}
