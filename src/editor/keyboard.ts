/** Keyboard shortcuts (see the table in the README). */
import { clamp } from '../core/geometry';
import { TOOLS } from './constants';
import { commit, redo, undo } from './history';
import { active } from './layer';
import { S, dirtyAll, markOverlay, opts, rt, saveOpts } from './state';
import { fitView, overlay, zoomBy, zoomTo } from './view';
import { clearSel, deleteSel, finishPoly, invertSel, selectAll, selToLayer } from './selection';
import { copyClip, pasteClip } from './clipboard';
import { deleteLayer, duplicateLayer, mergeDown } from './layerOps';
import { endPickOnce } from './colorPick';
import { fillSel } from './fills';
import { openPicker } from './files';
import { pointer, updateCursor } from './pointer';
import { renderToolOpts, setTool, syncXform } from './tools';
import { syncPolyBar, toast } from '../ui/chrome';
import { closeModals, openExport } from '../ui/modals';

const modalOpen = () => [...document.querySelectorAll<HTMLElement>('.modal')].some((m) => !m.hidden);

function onKeyDown(e: KeyboardEvent): void {
  const tg = e.target as HTMLElement,
    tag = (tg.tagName || '').toLowerCase();
  if (modalOpen()) {
    if (e.key === 'Escape') closeModals();
    return;
  }
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || tg.isContentEditable) return;
  const mod = e.ctrlKey || e.metaKey,
    k = e.key.toLowerCase();
  if (e.code === 'Space') {
    if (!rt.spaceDown) {
      rt.spaceDown = true;
      if (!rt.act) overlay.style.cursor = 'grab';
      markOverlay();
    }
    e.preventDefault();
    return;
  }
  if (mod) {
    if (k === 'v') {
      // let a real paste event (an image from another program) win; otherwise paste ours
      rt.pendingPaste = true;
      setTimeout(() => {
        if (rt.pendingPaste) {
          rt.pendingPaste = false;
          pasteClip();
        }
      }, 80);
      return;
    }
    if (k === 'z' && !e.shiftKey) undo();
    else if ((k === 'z' && e.shiftKey) || k === 'y') redo();
    else if (k === 'a') selectAll();
    else if (k === 'd') clearSel();
    else if (k === 'i' && e.shiftKey) invertSel();
    else if (k === 'j') {
      if (S.sel) selToLayer(e.shiftKey ? 'cut' : 'copy');
      else duplicateLayer();
    } else if (k === 'c') copyClip(false);
    else if (k === 'x') copyClip(true);
    else if (k === '0') fitView();
    else if (k === '1') zoomTo(1);
    else if (k === '=' || k === '+') zoomBy(1.25);
    else if (k === '-') zoomBy(0.8);
    else if (k === 'e') mergeDown();
    else if (k === 's') openExport();
    else if (k === 'o') openPicker();
    else return;
    e.preventDefault();
    return;
  }
  if (rt.pickOnce && k === 'escape') {
    endPickOnce();
    toast('Conta-gotas cancelado');
    return;
  }
  const pd = rt.polyDraft;
  if (pd && k === 'enter') {
    finishPoly();
    e.preventDefault();
    return;
  }
  if (pd && k === 'escape') {
    rt.polyDraft = null;
    syncPolyBar();
    markOverlay();
    return;
  }
  if (pd && k === 'backspace') {
    pd.pts.pop();
    if (!pd.pts.length) rt.polyDraft = null;
    syncPolyBar();
    markOverlay();
    e.preventDefault();
    return;
  }
  if (k === 'escape') {
    clearSel();
    return;
  }
  if ((k === 'delete' || k === 'backspace') && e.altKey) {
    if (S.sel) fillSel();
    else toast('Faça uma seleção para pintar');
    e.preventDefault();
    return;
  }
  if (k === 'delete' || k === 'backspace') {
    if (S.sel) deleteSel();
    else deleteLayer();
    e.preventDefault();
    return;
  }
  if (k === '[' || k === ']') {
    const remove = S.tool === 'remove',
      key = remove ? 'removeSize' : 'brushSize',
      lo = remove ? 4 : 1,
      hi = remove ? 400 : 1000,
      sz = opts[key];
    opts[key] = clamp(
      k === ']' ? Math.max(sz + 1, Math.round(sz * 1.2)) : Math.min(sz - 1, Math.round(sz / 1.2)),
      lo,
      hi,
    );
    saveOpts();
    renderToolOpts();
    markOverlay();
    return;
  }
  const l = active();
  if (k.startsWith('arrow') && S.tool === 'move' && l) {
    const st = e.shiftKey ? 10 : 1;
    if (k === 'arrowleft') l.x -= st;
    if (k === 'arrowright') l.x += st;
    if (k === 'arrowup') l.y -= st;
    if (k === 'arrowdown') l.y += st;
    dirtyAll();
    syncXform();
    // a burst of nudges becomes one undo step
    if (rt.nudgeTimer) clearTimeout(rt.nudgeTimer);
    rt.nudgeTimer = setTimeout(() => {
      rt.nudgeTimer = null;
      commit('Empurrar');
    }, 400);
    e.preventDefault();
    return;
  }
  if (e.altKey) return;
  const t = TOOLS.find((x) => x.key === k);
  if (t) setTool(t.id);
}

export function initKeyboard(): void {
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
      rt.spaceDown = false;
      updateCursor(pointer.sp);
      markOverlay();
    }
  });
  window.addEventListener('blur', () => {
    rt.spaceDown = false;
    rt.lastBlur = Date.now();
  });
}
