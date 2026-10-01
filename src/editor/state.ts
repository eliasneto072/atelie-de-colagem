/**
 * Shared editor state.
 *
 * - `S`: the document (what undo/redo snapshots).
 * - `opts`: user preferences, remembered in localStorage.
 * - `rt`: transient runtime state (current drag, drafts, flags), never saved.
 */
import type { Pt } from '../core/geometry';
import type { Action, EditorState, Layer, SelMode } from './types';

export const S: EditorState = {
  doc: { w: 1200, h: 800, bg: 'transparent' },
  layers: [],
  activeId: null,
  sel: null,
  tool: 'move',
  view: { s: 1, x: 0, y: 0 },
};

export interface Options {
  selMode: SelMode;
  feather: number;
  wandTol: number;
  wandContig: boolean;
  brushSize: number;
  brushHard: number;
  brushStrength: number;
  autoSelect: boolean;
  color: string;
  paintLock: boolean;
  pickSize: number;
  paintTip: 'soft' | 'pixel';
  bucketTol: number;
  bucketContig: boolean;
  bucketAll: boolean;
  bucketGrow: boolean;
  lineMode: boolean;
  removeSize: number;
  healCut: boolean;
  keepRatio: boolean;
  snap: boolean;
  /** 'doc' or a layer id */
  alignTo: string;
}

const DEFAULT_OPTS: Options = {
  selMode: 'new',
  feather: 0,
  wandTol: 32,
  wandContig: true,
  brushSize: 60,
  brushHard: 55,
  brushStrength: 100,
  autoSelect: true,
  color: '#d9573f',
  paintLock: false,
  pickSize: 3,
  paintTip: 'soft',
  bucketTol: 32,
  bucketContig: true,
  bucketAll: false,
  bucketGrow: true,
  lineMode: false,
  removeSize: 40,
  healCut: true,
  keepRatio: true,
  snap: true,
  alignTo: 'doc',
};

const OPTS_KEY = 'atelie-opts';

/** Saved preferences, accepting only keys whose type matches the default. */
function loadOpts(): Options {
  const o: Options = { ...DEFAULT_OPTS };
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(OPTS_KEY) ?? '{}');
    if (saved && typeof saved === 'object') {
      const rec = o as unknown as Record<string, unknown>;
      for (const [k, v] of Object.entries(saved as Record<string, unknown>)) {
        if (k in rec && typeof v === typeof rec[k]) rec[k] = v;
      }
    }
  } catch {
    // storage blocked or corrupt: keep the defaults
  }
  return o;
}

export const opts: Options = loadOpts();

export function saveOpts(): void {
  try {
    localStorage.setItem(OPTS_KEY, JSON.stringify(opts));
  } catch {
    // private window or storage blocked: preferences just aren't remembered
  }
}

export interface RemoveMask {
  id: number;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  busy: boolean;
}

export interface Clip {
  canvas: HTMLCanvasElement;
  props: Partial<Layer>;
  time: number;
}

export const rt = {
  /** What the current pointer drag is doing. */
  act: null as Action | null,
  /** Outline being drawn with a box or lasso tool. */
  draft: null as { pts: Pt[]; closed: boolean } | null,
  /** Polygonal lasso in progress. */
  polyDraft: null as { pts: Pt[]; op: SelMode } | null,
  /** One-shot eyedropper started from a panel button. */
  pickOnce: null as { apply(hex: string): void; current: string } | null,
  /** Phone panel to reopen once the one-shot eyedropper finishes. */
  pickReopen: null as string | null,
  /** Which floating action bar is showing ('poly', 'pick', 'heal', 'retry'). */
  barMode: null as string | null,
  spaceDown: false,
  lastPointerType: 'mouse',
  sceneDirty: true,
  overlayDirty: true,
  /** The built-in example is on screen (replaced by the first real image). */
  sampleActive: false,
  /** End of the previous brush stroke, for straight lines. */
  lastStroke: null as { id: number; mode: string; x: number; y: number } | null,
  removeMask: null as RemoveMask | null,
  clip: null as Clip | null,
  lastBlur: 0,
  pendingPaste: false,
  nudgeTimer: null as ReturnType<typeof setTimeout> | null,
};

/** Colours read from the CSS tokens, used when drawing on canvas. */
export const theme = {
  accent: '#f2b13f',
  rulerBg: 'rgba(16,19,18,.84)',
  rulerDoc: 'rgba(242,177,63,.13)',
  rulerInk: '#a3ada5',
  checkA: '#3a3e3b',
  checkB: '#2d312f',
};

export const coarse = (): boolean => rt.lastPointerType === 'touch';
/** Handle hit radius in screen px: bigger for fingers. */
export const ht = (): number => (coarse() ? 24 : rt.lastPointerType === 'pen' ? 14 : 11);

export const markScene = (): void => {
  rt.sceneDirty = true;
};
export const markOverlay = (): void => {
  rt.overlayDirty = true;
};
export const dirtyAll = (): void => {
  rt.sceneDirty = true;
  rt.overlayDirty = true;
};
