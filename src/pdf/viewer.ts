/**
 * "Editar e assinar": pages shown large, one under the other, with the person's edits on top.
 * Edits are HTML elements over each page while editing; the builder draws them into the PDF.
 */
import { lineNear, type FontId } from '../core/fonts';
import { pageToView, viewSize, viewToPage, type Rot } from '../core/pages';
import { docLines, lineColor, prefetchDocText } from './docText';
import { firstBaseline, LINE_HEIGHT, type Edit, type MarkEdit, type RectEdit, type TextEdit } from './edits';
import { baselineShift, CSS_FAMILY, loadScreenFont, screenFontReady } from './fontFiles';
import { frameOf, paintPage, type Frame } from './paint';
import { openSignaturePad } from './signature';
import { newId, pageRot, remember, st, type Page, type Tool } from './state';
import { $, toast } from './ui';

type Listener = () => void;
const listeners: Listener[] = [];
/** Edits or the tool changed: refresh the panel and toolbar. */
export const onEditChange = (fn: Listener): void => void listeners.push(fn);
const changed = () => listeners.forEach((fn) => fn());

/** Last text settings, reused for the next text when there is no document text nearby. */
export const textStyle = { size: 12, color: '#111111', bold: false, font: 'sans' as FontId, italic: false };
export const markStyle = { size: 14, color: '#111111' };
const RECT_COLORS: Record<RectEdit['style'], string> = {
  redact: '#000000',
  cover: '#ffffff',
  highlight: '#ffe14d',
};
const DPR = () => Math.min(2, window.devicePixelRatio || 1);

interface View {
  page: Page;
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  layer: HTMLElement;
  /** Scale (CSS px per point) the page is laid out at. */
  s: number;
  painted: string;
  els: Map<number, HTMLElement>;
}
const views = new Map<number, View>();
let editing: { view: View; edit: Edit; el: HTMLElement } | null = null;

// ---- the fonts the overlay uses: same letter widths as the PDF's fonts (see fontFiles.ts) ----
/** Load a font for the screen, then lay this page's texts out again with it. */
function useFont(font: FontId, page: Page): void {
  if (screenFontReady(font)) return;
  void loadScreenFont(font).then(() => refreshPage(page));
}

// ---- layout ----
/** 1 = pages fit the board's width. */
let zoom = 1;
export const zoomLevel = (): number => zoom;
export function zoomBy(k: number): void {
  zoom = Math.max(0.5, Math.min(4, Math.round(zoom * k * 100) / 100));
  renderViewer();
  changed();
}

function scaleFor(f: Frame): number {
  const board = $('board');
  const avail = Math.max(200, board.clientWidth - (board.clientWidth < 600 ? 20 : 48));
  const [vw] = viewSize(f.w, f.h, f.rot);
  return Math.min(1.4, avail / vw) * zoom;
}

const painter = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      const view = [...views.values()].find((v) => v.root === e.target);
      if (!view) continue;
      if (e.isIntersecting) void paint(view);
      else if (view.painted) {
        // free the bitmap of pages far from the screen
        view.canvas.width = view.canvas.height = 0;
        view.painted = '';
      }
    }
  },
  { rootMargin: '1200px 0px' },
);

async function paint(view: View): Promise<void> {
  const f = frameOf(view.page);
  const key = `${view.s}|${f.rot}|${f.w}x${f.h}|${f.photo ? Object.values(f.photo).join(',') : ''}`;
  if (view.painted === key) return;
  view.painted = key;
  const c = document.createElement('canvas');
  const ok = await paintPage(view.page, f.rot, view.s * DPR(), c).catch(() => false);
  if (view.painted !== key) return; // a newer paint started meanwhile
  if (!ok) {
    view.root.classList.add('broken');
    return;
  }
  view.canvas.replaceWith(c);
  view.canvas = c;
  // read the page's text now, so a click can take its font at once
  prefetchDocText(view.page);
}

function createView(page: Page): View {
  const root = document.createElement('div');
  root.className = 'vpage';
  root.dataset.id = String(page.id);
  root.innerHTML = `<div class="vlabel"></div><div class="vsheet"><canvas></canvas><div class="layer"></div></div>`;
  const view: View = {
    page,
    root,
    canvas: root.querySelector('canvas')!,
    layer: root.querySelector('.layer')!,
    s: 1,
    painted: '',
    els: new Map(),
  };
  wireLayer(view);
  painter.observe(root);
  return view;
}

/** Bring the viewer in line with the pages, their order and their edits. */
export function renderViewer(): void {
  void loadScreenFont('sans');
  const root = $('viewer');
  const alive = new Set<number>();
  st.pages.forEach((page, i) => {
    alive.add(page.id);
    let view = views.get(page.id);
    if (!view) views.set(page.id, (view = createView(page)));
    if (root.children[i] !== view.root) root.insertBefore(view.root, root.children[i] ?? null);
    const f = frameOf(page);
    view.s = scaleFor(f);
    const [vw, vh] = viewSize(f.w, f.h, f.rot, view.s);
    const sheet = view.root.querySelector<HTMLElement>('.vsheet')!;
    sheet.style.width = `${vw}px`;
    sheet.style.height = `${vh}px`;
    view.root.querySelector('.vlabel')!.textContent =
      `Página ${i + 1} · ${page.source.name}${page.source.kind === 'pdf' ? ` (p. ${page.index + 1})` : ''}`;
    if (view.painted && !view.painted.startsWith(`${view.s}|${f.rot}|`)) void paint(view);
    renderEdits(view);
    renderPreviews(view, i, vw, vh);
  });
  for (const [id, view] of views) {
    if (alive.has(id)) continue;
    painter.unobserve(view.root);
    view.root.remove();
    views.delete(id);
  }
  document.body.dataset.tool = st.tool;
}

// ---- watermark and page number previews (drawn for real by the builder) ----
let measure: CanvasRenderingContext2D | null = null;
function textWidth(text: string, px: number, bold: boolean): number {
  measure ??= document.createElement('canvas').getContext('2d');
  if (!measure) return text.length * px * 0.55;
  measure.font = `${bold ? 700 : 400} ${px}px AtelieSans, Arial, sans-serif`;
  return measure.measureText(text).width;
}

function renderPreviews(view: View, index: number, vw: number, vh: number): void {
  const sheet = view.layer;
  let wm = sheet.querySelector<HTMLElement>('.wm-preview');
  const w = st.watermark;
  if (w.on && w.text.trim()) {
    if (!wm) {
      wm = document.createElement('div');
      wm.className = 'wm-preview';
      sheet.prepend(wm);
    }
    const diag = Math.hypot(vw, vh);
    const px = Math.min(110 * view.s, (0.78 * diag) / (textWidth(w.text.trim(), 100, true) / 100));
    wm.textContent = w.text.trim();
    wm.style.fontSize = `${px}px`;
    wm.style.color = w.color;
    wm.style.opacity = String(w.opacity);
    wm.style.transform = `translate(-50%, -50%) rotate(${(-Math.atan2(vh, vw) * 180) / Math.PI}deg)`;
  } else wm?.remove();

  let nbEl = sheet.querySelector<HTMLElement>('.nb-preview');
  const nb = st.numbering;
  if (nb.on && !(nb.skipFirst && index === 0)) {
    if (!nbEl) {
      nbEl = document.createElement('div');
      nbEl.className = 'nb-preview';
      sheet.prepend(nbEl);
    }
    const total = nb.start + st.pages.length - 1;
    const label =
      nb.format === 'n'
        ? `${nb.start + index}`
        : nb.format === 'n/N'
          ? `${nb.start + index} / ${total}`
          : `Página ${nb.start + index} de ${total}`;
    const size = nb.size * view.s;
    const m = Math.min(28 * view.s, vw * 0.06, vh * 0.06);
    const tw = textWidth(label, size, false);
    nbEl.textContent = label;
    nbEl.style.fontSize = `${size}px`;
    nbEl.style.left = `${nb.position === 'bottom-center' ? (vw - tw) / 2 : vw - m - tw}px`;
    // the box top sits so that its baseline lands where the builder puts it
    const baseline = nb.position === 'top-right' ? m + size * 0.75 : vh - m;
    nbEl.style.top = `${baseline - size * 0.9465}px`;
  } else nbEl?.remove();
}

// ---- edits on screen ----
const MARK_SVG: Record<MarkEdit['mark'], string> = {
  check: '<path d="M14 55 40 80 88 18" />',
  x: '<path d="M18 18 82 82M82 18 18 82" />',
  dot: '<circle cx="50" cy="50" r="20" fill="currentColor" stroke="none" />',
};

function placeEl(view: View, e: Edit, el: HTMLElement): void {
  const f = frameOf(view.page);
  const [px, py] = pageToView(e.x, e.y, f.w, f.h, f.rot, view.s);
  el.style.left = `${px}px`;
  el.style.top = `${py}px`;
  const turn = (((f.rot - e.rot) % 360) + 360) % 360;
  el.style.transform = turn ? `rotate(${turn}deg)` : '';
  const s = view.s;
  if (e.kind === 'text') {
    const font = e.font ?? 'sans';
    el.style.fontSize = `${e.size * s}px`;
    el.style.lineHeight = String(LINE_HEIGHT);
    el.style.color = e.color;
    el.style.fontWeight = e.bold ? '700' : '400';
    el.style.fontStyle = e.italic ? 'italic' : 'normal';
    el.style.fontFamily = CSS_FAMILY[font];
    // the browser's baseline may sit a little off the PDF's: move the letters, not the box
    (el.firstElementChild as HTMLElement).style.top = `${baselineShift(font) * e.size * s}px`;
    useFont(font, view.page);
  } else if (e.kind === 'mark') {
    el.style.width = el.style.height = `${e.size * s}px`;
    el.style.color = e.color;
  } else {
    el.style.width = `${e.w * s}px`;
    el.style.height = `${e.h * s}px`;
    if (e.kind === 'rect') el.style.background = e.style === 'redact' ? '#000' : e.color;
  }
}

function createEl(e: Edit): HTMLElement {
  const el = document.createElement('div');
  el.className = `edit ${e.kind}${e.kind === 'rect' ? ` ${e.style}` : ''}`;
  el.dataset.edit = String(e.id);
  if (e.kind === 'text') {
    const t = document.createElement('span');
    t.className = 't';
    t.textContent = e.text;
    el.append(t);
  } else if (e.kind === 'image') {
    const img = document.createElement('img');
    img.src = e.sig.url;
    img.alt = 'Assinatura';
    img.draggable = false;
    el.append(img);
  } else if (e.kind === 'mark') {
    el.innerHTML = `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="13" stroke-linecap="round" stroke-linejoin="round">${MARK_SVG[e.mark]}</svg>`;
  }
  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'edit-del';
  del.title = 'Excluir';
  del.setAttribute('aria-label', 'Excluir');
  del.textContent = '×';
  el.append(del);
  if (e.kind === 'image' || e.kind === 'rect') {
    const rs = document.createElement('span');
    rs.className = 'edit-resize';
    rs.setAttribute('aria-hidden', 'true');
    el.append(rs);
  }
  return el;
}

function renderEdits(view: View): void {
  const alive = new Set<number>();
  for (const e of view.page.edits) {
    alive.add(e.id);
    let el = view.els.get(e.id);
    if (!el) {
      view.els.set(e.id, (el = createEl(e)));
      view.layer.append(el);
    }
    if (e.kind === 'text' && editing?.edit !== e) {
      const t = el.querySelector('.t')!;
      if (t.textContent !== e.text) t.textContent = e.text;
    }
    el.classList.toggle('sel', st.current?.edit === e);
    placeEl(view, e, el);
  }
  for (const [id, el] of view.els) {
    if (alive.has(id)) continue;
    el.remove();
    view.els.delete(id);
  }
}

const refreshPage = (page: Page) => {
  const v = views.get(page.id);
  if (v) renderEdits(v);
};

// ---- editing operations (also used by the panel) ----
export function select(page: Page | null, edit: Edit | null): void {
  const prev = st.current;
  st.current = page && edit ? { page, edit } : null;
  if (prev) refreshPage(prev.page);
  if (page) refreshPage(page);
  changed();
}

export function updateCurrent(patch: Partial<Edit>): void {
  const cur = st.current;
  if (!cur) return;
  remember();
  Object.assign(cur.edit, patch);
  if (cur.edit.kind === 'text') {
    const { size, color, bold, font = 'sans', italic = false } = cur.edit;
    Object.assign(textStyle, { size, color, bold, font, italic });
  }
  if (cur.edit.kind === 'mark') Object.assign(markStyle, { size: cur.edit.size, color: cur.edit.color });
  refreshPage(cur.page);
  changed();
}

export function removeEdit(page: Page, edit: Edit, record = true): void {
  if (record) remember();
  page.edits = page.edits.filter((e) => e !== edit);
  if (st.current?.edit === edit) st.current = null;
  if (editing?.edit === edit) editing = null;
  refreshPage(page);
  changed();
}

export const removeCurrent = (): void => {
  if (st.current) removeEdit(st.current.page, st.current.edit);
};

/** Copy the selected edit to every other page, at the same spot relative to each page. */
export function repeatCurrent(): number {
  const cur = st.current;
  if (!cur) return 0;
  remember();
  const src = frameOf(cur.page);
  const [vw, vh] = viewSize(src.w, src.h, cur.edit.rot);
  const [px, py] = pageToView(cur.edit.x, cur.edit.y, src.w, src.h, cur.edit.rot);
  let n = 0;
  for (const page of st.pages) {
    if (page === cur.page) continue;
    const f = frameOf(page);
    const [tw, th] = viewSize(f.w, f.h, f.rot);
    const [x, y] = viewToPage((px / vw) * tw, (py / vh) * th, f.w, f.h, f.rot);
    page.edits.push({ ...cur.edit, id: newId(), x, y, rot: f.rot } as Edit);
    refreshPage(page);
    n++;
  }
  changed();
  return n;
}

export function setTool(tool: Tool): void {
  if (editing) (editing.el.querySelector('.t') as HTMLElement).blur();
  st.tool = tool;
  document.body.dataset.tool = tool;
  if (tool !== 'select') select(null, null);
  changed();
}

/** Choose (or draw) the signature the "Assinatura" tool places. */
export async function pickSignature(): Promise<boolean> {
  const sig = await openSignaturePad();
  if (!sig) return false;
  st.signature = sig;
  changed();
  return true;
}

// ---- text editing ----
function startEditing(view: View, edit: Edit): void {
  const el = view.els.get(edit.id);
  if (!el || edit.kind !== 'text') return;
  const t = el.querySelector<HTMLElement>('.t')!;
  editing = { view, edit, el };
  el.classList.add('editing');
  try {
    t.contentEditable = 'plaintext-only';
  } catch {
    t.contentEditable = 'true';
  }
  if (t.contentEditable !== 'plaintext-only') t.contentEditable = 'true';
  t.spellcheck = false;
  t.focus();
  // caret at the end
  const r = document.createRange();
  r.selectNodeContents(t);
  r.collapse(false);
  const sel = getSelection();
  sel?.removeAllRanges();
  sel?.addRange(r);
  t.addEventListener('input', () => {
    edit.text = t.innerText.replace(/\n$/, '');
  });
  t.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      t.blur();
    }
    ev.stopPropagation();
  });
  t.addEventListener(
    'blur',
    () => {
      t.contentEditable = 'false';
      el.classList.remove('editing');
      editing = null;
      edit.text = t.innerText.replace(/\n$/, '');
      if (!edit.text.trim()) removeEdit(view.page, edit, false);
      else changed();
    },
    { once: true },
  );
}

// ---- pointer handling on a page ----
interface Gesture {
  view: View;
  mode: 'move' | 'resize' | 'draw' | 'tap';
  edit?: Edit;
  x0: number;
  y0: number;
  ex: number;
  ey: number;
  ew: number;
  eh: number;
  moved: boolean;
  pointerId: number;
}
let gesture: Gesture | null = null;

const localPoint = (view: View, e: PointerEvent): [number, number] => {
  const r = view.layer.getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top];
};

/** Page-space displacement for a screen displacement on this page. */
function pageDelta(view: View, dx: number, dy: number): [number, number] {
  const f = frameOf(view.page);
  const [ax, ay] = viewToPage(0, 0, f.w, f.h, f.rot, view.s);
  const [bx, by] = viewToPage(dx, dy, f.w, f.h, f.rot, view.s);
  return [bx - ax, by - ay];
}

/** A screen displacement measured along an edit's own axes (it may be turned with the page). */
function localDelta(view: View, edit: Edit, dx: number, dy: number): [number, number] {
  const turn = ((((pageRot(view.page) - edit.rot) % 360) + 360) % 360) as Rot;
  const t = (-turn * Math.PI) / 180;
  return [(dx * Math.cos(t) - dy * Math.sin(t)) / view.s, (dx * Math.sin(t) + dy * Math.cos(t)) / view.s];
}

/**
 * A new text where the person clicked. Near the document's own text it takes that text's
 * font, size and colour, and on the same line it sits on that line's baseline (filling in
 * "Nome: ______", say). Elsewhere it uses the last settings.
 */
function newText(view: View, px: number, py: number): TextEdit {
  const f = frameOf(view.page);
  const s = view.s;
  const style = { ...textStyle, from: undefined as string | undefined };
  const near = lineNear(docLines(view.page, f), px / s, py / s);
  let top = py / s - style.size * 0.6;
  if (near) {
    const { line, snap } = near;
    Object.assign(style, {
      font: line.style.font,
      bold: line.style.bold,
      italic: line.style.italic,
      size: Math.max(5, Math.min(144, Math.round(line.size * 2) / 2)),
      from: line.style.family,
    });
    const [vw] = viewSize(f.w, f.h, f.rot);
    style.color = lineColor(view.canvas, line, vw) ?? style.color;
    top = snap ? line.y - firstBaseline(style.font) * style.size : py / s - style.size * 0.6;
  }
  const [x, y] = viewToPage(px - 2, top * s, f.w, f.h, f.rot, s);
  return { kind: 'text', id: newId(), x, y, rot: f.rot, text: '', ...style };
}

function place(view: View, px: number, py: number): void {
  const page = view.page;
  const f = frameOf(page);
  const rot = f.rot;
  const s = view.s;
  const at = (sx: number, sy: number) => viewToPage(sx, sy, f.w, f.h, rot, s);
  let edit: Edit | null = null;
  if (st.tool === 'text') {
    edit = newText(view, px, py);
  } else if (st.tool === 'check' || st.tool === 'x' || st.tool === 'dot') {
    const size = markStyle.size;
    const [x, y] = at(px - (size * s) / 2, py - (size * s) / 2);
    edit = { kind: 'mark', id: newId(), x, y, rot, mark: st.tool, size, color: markStyle.color };
  } else if (st.tool === 'sign' && st.signature) {
    const [vw] = viewSize(f.w, f.h, rot);
    const w = Math.min(160, vw * 0.4);
    const h = w / st.signature.aspect;
    const [x, y] = at(px - (w * s) / 2, py - (h * s) / 2);
    edit = { kind: 'image', id: newId(), x, y, rot, w, h, sig: st.signature };
  }
  if (!edit) return;
  remember();
  page.edits.push(edit);
  renderEdits(view);
  if (edit.kind === 'text') {
    select(page, edit);
    startEditing(view, edit);
  } else if (edit.kind === 'image') {
    // a signature is usually placed once: select it, ready to move or resize
    setTool('select');
    select(page, edit);
  } else changed(); // marks: the tool stays on for the next box, with nothing selected in the way
}

let warnedRedact = false;

function wireLayer(view: View): void {
  const layer = view.layer;

  layer.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    const el = target.closest<HTMLElement>('.edit');
    const edit = el ? view.page.edits.find((x) => x.id === Number(el.dataset.edit)) : undefined;
    const [px, py] = localPoint(view, e);
    const base = { view, x0: px, y0: py, ex: 0, ey: 0, ew: 0, eh: 0, moved: false, pointerId: e.pointerId };

    if (edit && el) {
      if (target.closest('.edit-del')) {
        e.preventDefault();
        removeEdit(view.page, edit);
        return;
      }
      if (editing?.edit === edit) return; // clicks inside the text being typed
      e.preventDefault();
      select(view.page, edit);
      const w = 'w' in edit ? edit.w : 0,
        h = 'h' in edit ? edit.h : 0;
      gesture = {
        ...base,
        mode: target.closest('.edit-resize') ? 'resize' : 'move',
        edit,
        ex: edit.x,
        ey: edit.y,
        ew: w,
        eh: h,
      };
      layer.setPointerCapture(e.pointerId);
      return;
    }

    if (st.tool === 'cover' || st.tool === 'redact' || st.tool === 'highlight') {
      e.preventDefault();
      const f = frameOf(view.page);
      const [x, y] = viewToPage(px, py, f.w, f.h, f.rot, view.s);
      const style = st.tool;
      const rect: RectEdit = {
        kind: 'rect',
        id: newId(),
        x,
        y,
        rot: f.rot,
        w: 0,
        h: 0,
        style,
        color: RECT_COLORS[style],
      };
      remember();
      view.page.edits.push(rect);
      gesture = { ...base, mode: 'draw', edit: rect };
      layer.setPointerCapture(e.pointerId);
      renderEdits(view);
      return;
    }
    // text, marks, signature and select: decided on release, so a swipe can still scroll
    gesture = { ...base, mode: 'tap' };
  });

  layer.addEventListener('pointermove', (e) => {
    const g = gesture;
    if (!g || g.view !== view || e.pointerId !== g.pointerId) return;
    const [px, py] = localPoint(view, e);
    const dx = px - g.x0,
      dy = py - g.y0;
    if (!g.moved && Math.hypot(dx, dy) < 4) return;
    if (g.mode === 'tap') return;
    if (!g.moved && g.mode !== 'draw') remember();
    g.moved = true;
    const edit = g.edit!;
    if (g.mode === 'move') {
      const [ddx, ddy] = pageDelta(view, dx, dy);
      edit.x = g.ex + ddx;
      edit.y = g.ey + ddy;
    } else if (g.mode === 'resize' && (edit.kind === 'image' || edit.kind === 'rect')) {
      const [lx, ly] = localDelta(view, edit, dx, dy);
      edit.w = Math.max(6, g.ew + lx);
      edit.h = edit.kind === 'image' ? edit.w / edit.sig.aspect : Math.max(4, g.eh + ly);
    } else if (g.mode === 'draw' && edit.kind === 'rect') {
      // keep the corner where the drag started, whatever the direction
      const f = frameOf(view.page);
      const [x, y] = viewToPage(Math.min(px, g.x0), Math.min(py, g.y0), f.w, f.h, f.rot, view.s);
      edit.x = x;
      edit.y = y;
      edit.w = Math.abs(dx) / view.s;
      edit.h = Math.abs(dy) / view.s;
    }
    const el = view.els.get(edit.id);
    if (el) placeEl(view, edit, el);
  });

  const end = (e: PointerEvent, cancelled: boolean) => {
    const g = gesture;
    if (!g || g.view !== view || e.pointerId !== g.pointerId) return;
    gesture = null;
    if (g.mode === 'tap') {
      if (cancelled) return;
      const [px, py] = localPoint(view, e);
      if (Math.hypot(px - g.x0, py - g.y0) > 8) return;
      if (st.tool === 'select') return select(null, null);
      if (st.tool === 'sign' && !st.signature) {
        void pickSignature().then((ok) => ok && place(view, px, py));
        return;
      }
      place(view, px, py);
      return;
    }
    const edit = g.edit!;
    if (g.mode === 'draw' && edit.kind === 'rect') {
      if (edit.w < 4 || edit.h < 3) {
        removeEdit(view.page, edit, false);
        return;
      }
      if (edit.style === 'redact' && !warnedRedact) {
        warnedRedact = true;
        toast('A tarja apaga de verdade o que está embaixo: no arquivo final, esta página vira imagem.');
      }
      select(view.page, edit);
      return;
    }
    // a click (no drag) on a selected text starts typing in it
    if (!g.moved && edit.kind === 'text' && !cancelled) startEditing(view, edit);
    changed();
  };
  layer.addEventListener('pointerup', (e) => end(e, false));
  layer.addEventListener('pointercancel', (e) => end(e, true));
  layer.addEventListener('dblclick', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('.edit.text');
    const edit = el && view.page.edits.find((x) => x.id === Number(el.dataset.edit));
    if (edit) startEditing(view, edit);
  });
}

/** Keyboard: delete, nudge and leave the selection. Returns true when it handled the key. */
export function viewerKey(e: KeyboardEvent): boolean {
  if (editing) return false;
  const cur = st.current;
  if (e.key === 'Escape') {
    if (cur) select(null, null);
    else if (st.tool !== 'select') setTool('select');
    else return false;
    return true;
  }
  if (!cur) return false;
  if (e.key === 'Delete' || e.key === 'Backspace') {
    removeCurrent();
    return true;
  }
  const step = e.shiftKey ? 10 : 1;
  const dirs: Record<string, [number, number]> = {
    ArrowLeft: [-step, 0],
    ArrowRight: [step, 0],
    ArrowUp: [0, -step],
    ArrowDown: [0, step],
  };
  const d = dirs[e.key];
  if (!d) return false;
  const view = views.get(cur.page.id);
  if (!view) return false;
  remember();
  const [dx, dy] = pageDelta(view, d[0] * view.s, d[1] * view.s);
  cur.edit.x += dx;
  cur.edit.y += dy;
  refreshPage(cur.page);
  return true;
}

export const isTyping = (): boolean => editing !== null;
