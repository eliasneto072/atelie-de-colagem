/**
 * Undo/redo. Each step stores a shallow copy of the document; layer canvases are shared
 * between steps because pixel edits always work on a fresh copy (see pixelCtx).
 */
import { cloneLayer } from './layer';
import { button, el } from './dom';
import { S, rt } from './state';
import { afterStructural, toast } from '../ui/chrome';
import type { DocState, Layer } from './types';

interface Snapshot {
  doc: DocState;
  layers: Layer[];
  activeId: number | null;
}

const MAX_STEPS = 60;
const MAX_BYTES = 900e6;

export const H: { stack: { label: string; state: Snapshot }[]; idx: number } = { stack: [], idx: -1 };

const snapshot = (): Snapshot => ({
  doc: { ...S.doc },
  layers: S.layers.map(cloneLayer),
  activeId: S.activeId,
});

function historyBytes(): number {
  const seen = new Set<HTMLCanvasElement>();
  let b = 0;
  for (const e of H.stack) {
    for (const l of e.state.layers) {
      for (const c of [l.canvas, l.source]) {
        if (!seen.has(c)) {
          seen.add(c);
          b += c.width * c.height * 4;
        }
      }
    }
  }
  return b;
}

/** Record the current state as a named step. */
export function commit(label: string): void {
  if (rt.nudgeTimer && label !== 'Empurrar') {
    // pending arrow-key nudges fold into this step
    clearTimeout(rt.nudgeTimer);
    rt.nudgeTimer = null;
  }
  H.stack = H.stack.slice(0, H.idx + 1);
  H.stack.push({ label, state: snapshot() });
  while (H.stack.length > MAX_STEPS) H.stack.shift();
  while (H.stack.length > 3 && historyBytes() > MAX_BYTES) H.stack.shift();
  H.idx = H.stack.length - 1;
  if (label !== 'Exemplo' && label !== 'Início') el('note').hidden = true;
  updateUndoUI();
}

/** Forget every step (a new project). */
export function resetHistory(): void {
  H.stack = [];
  H.idx = -1;
}

export const lastLabel = (): string | null => H.stack[H.idx]?.label ?? null;

function restore(st: Snapshot): void {
  S.doc = { ...st.doc };
  S.layers = st.layers.map(cloneLayer);
  S.activeId = st.activeId;
  afterStructural();
}

export function undo(): void {
  if (H.idx <= 0) return;
  const lbl = H.stack[H.idx].label;
  H.idx--;
  restore(H.stack[H.idx].state);
  toast(`Desfeito: ${lbl}`);
}

export function redo(): void {
  if (H.idx >= H.stack.length - 1) return;
  H.idx++;
  restore(H.stack[H.idx].state);
  toast(`Refeito: ${H.stack[H.idx].label}`);
}

export function updateUndoUI(): void {
  const u = button('btn-undo'),
    r = button('btn-redo');
  u.disabled = H.idx <= 0;
  r.disabled = H.idx >= H.stack.length - 1;
  u.title = u.disabled ? 'Desfazer (Ctrl+Z)' : `Desfazer: ${H.stack[H.idx].label} (Ctrl+Z)`;
  r.title = r.disabled ? 'Refazer (Ctrl+Shift+Z)' : `Refazer: ${H.stack[H.idx + 1].label} (Ctrl+Shift+Z)`;
}
