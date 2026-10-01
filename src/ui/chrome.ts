/** Page chrome around the stage: toasts, the floating action bar, the phone sheet, status. */
import { button, el } from '../editor/dom';
import { redo, undo, updateUndoUI } from '../editor/history';
import { active } from '../editor/layer';
import { S, dirtyAll, markOverlay, rt } from '../editor/state';
import { fitView, mqMobile, zoomBy, zoomTo } from '../editor/view';
import { finishPoly, selChanged } from '../editor/selection';
import { syncXform } from '../editor/tools';
import { openPicker } from '../editor/files';
import { clearAll } from '../editor/project';
import { renderLayers } from './layersPanel';

let toastTimer: ReturnType<typeof setTimeout> | null = null;

export function toast(msg: string): void {
  const t = el('toast');
  t.textContent = msg;
  t.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

// ---- floating action bar (polygon lasso, one-shot eyedropper, background fill) ----
export type BarButton = [label: string, onClick: () => void, primary?: boolean];

export function showBar(mode: string, text: string, btns: BarButton[]): void {
  rt.barMode = mode;
  el('actionbar-text').textContent = text;
  const box = el('actionbar-btns');
  box.innerHTML = '';
  for (const [label, fn, primary] of btns) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn small' + (primary ? ' primary' : '');
    b.textContent = label;
    b.addEventListener('click', fn);
    box.appendChild(b);
  }
  el('actionbar').hidden = false;
}

export function hideBar(mode?: string): void {
  if (mode && rt.barMode !== mode) return;
  rt.barMode = null;
  el('actionbar').hidden = true;
}

/** The polygonal lasso's buttons, so it works without a keyboard. */
export function syncPolyBar(): void {
  const pd = rt.polyDraft;
  if (!pd) {
    hideBar('poly');
    return;
  }
  const n = pd.pts.length;
  showBar('poly', `${n} ${n === 1 ? 'ponto' : 'pontos'}`, [
    [
      'Voltar ponto',
      () => {
        pd.pts.pop();
        if (!pd.pts.length) rt.polyDraft = null;
        syncPolyBar();
        markOverlay();
      },
    ],
    [
      'Cancelar',
      () => {
        rt.polyDraft = null;
        syncPolyBar();
        markOverlay();
      },
    ],
    ['Fechar contorno', () => finishPoly(), true],
  ]);
}

// ---- phone: the panel becomes a sheet opened from the dock tabs ----
export const panelEl = el('panel');

export function openSheet(id: string): void {
  if (panelEl.classList.contains('is-open') && panelEl.dataset.sheet === id) {
    closeSheet();
    return;
  }
  panelEl.dataset.sheet = id;
  panelEl.classList.add('is-open');
  panelEl.scrollTop = 0;
  syncDockTabs();
}

export function closeSheet(): void {
  panelEl.classList.remove('is-open');
  syncDockTabs();
}

function syncDockTabs(): void {
  const open = panelEl.classList.contains('is-open');
  document
    .querySelectorAll<HTMLElement>('#dock-tabs [data-sheet]')
    .forEach((b) =>
      b.setAttribute('aria-pressed', String(open && panelEl.dataset.sheet === b.dataset.sheet)),
    );
}

/** After an action from the sheet, close it on phones so the result is visible. */
export const mobileClose = (): void => {
  if (mqMobile.matches) closeSheet();
};

export function hideNote(): void {
  el('note').hidden = true;
}

function updateStatus(): void {
  el('st-doc').innerHTML = S.layers.length ? `tela <b>${S.doc.w} × ${S.doc.h}</b> px` : 'tela vazia';
}

/** Refresh every view of the document after layers were added, removed or reordered. */
export function afterStructural(): void {
  if (S.activeId != null && !active()) S.activeId = S.layers.length ? S.layers[S.layers.length - 1].id : null;
  el('empty').hidden = S.layers.length > 0;
  el('zoom').hidden = !S.layers.length;
  dirtyAll();
  renderLayers();
  selChanged();
  updateUndoUI();
  syncXform();
  updateStatus();
}

export function initChrome(): void {
  el('dock-tabs').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-sheet]');
    if (b?.dataset.sheet) openSheet(b.dataset.sheet);
  });
  button('sheet-close').addEventListener('click', closeSheet);
  mqMobile.addEventListener('change', () => {
    closeSheet();
    dirtyAll();
  });

  button('btn-open').addEventListener('click', openPicker);
  button('btn-open-2').addEventListener('click', openPicker);
  button('btn-undo').addEventListener('click', undo);
  button('btn-redo').addEventListener('click', redo);
  button('z-in').addEventListener('click', () => zoomBy(1.25));
  button('z-out').addEventListener('click', () => zoomBy(0.8));
  button('z-val').addEventListener('click', () => zoomTo(1));
  button('z-fit').addEventListener('click', fitView);

  button('note-close').addEventListener('click', hideNote);
  button('note-open').addEventListener('click', () => {
    clearAll();
    hideNote();
    openPicker();
  });
}
