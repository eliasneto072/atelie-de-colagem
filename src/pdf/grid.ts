/**
 * The page board: one card per page, in the order they will come out. Click selects, the
 * card buttons rotate or remove, dragging reorders (on touch screens: hold, then drag).
 */
import { normalizeRotation } from '../core/pages';
import { remember, selectedPages, st, undo, type Page } from './state';
import { prioritize, thumbnail } from './thumbs';
import { $, plural, toast } from './ui';

type Listener = () => void;
const listeners: Listener[] = [];
/** Something changed (order, selection, rotation, pages): refresh whatever depends on it. */
export const onChange = (fn: Listener): void => void listeners.push(fn);
const changed = () => listeners.forEach((fn) => fn());

const grid = () => $('pages');
const cards = new Map<number, HTMLElement>();
const pageOf = (card: Element | null): Page | undefined =>
  card ? st.pages.find((p) => p.id === Number((card as HTMLElement).dataset.id)) : undefined;

const ICON = {
  left: '<path d="M4 9a8 8 0 1 1 2.3 5.7"/><path d="M4 4v5h5"/>',
  right: '<path d="M20 9a8 8 0 1 0-2.3 5.7"/><path d="M20 4v5h-5"/>',
  del: '<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>',
};
const icon = (d: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

// ---- thumbnails load when cards come into view ----
const seen = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const page = pageOf(e.target);
      if (!page) continue;
      seen.unobserve(e.target);
      prioritize(page);
      void thumbnail(page).then((url) => {
        const img = e.target.querySelector('img');
        if (url && img) img.src = url;
        else e.target.classList.add('broken');
      });
    }
  },
  { rootMargin: '400px 0px' },
);

function createCard(page: Page): HTMLElement {
  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.id = String(page.id);
  card.tabIndex = 0;
  card.setAttribute('role', 'option');
  const label =
    page.source.kind === 'pdf' ? `${page.source.name}, página ${page.index + 1}` : page.source.name;
  card.innerHTML = `
    <div class="thumb"><img alt="" draggable="false" /><span class="broken-msg">Não deu para mostrar</span></div>
    <div class="card-meta">
      <span class="num"></span>
      <span class="file" title=""><i></i><span class="fn"></span><span class="fp"></span></span>
    </div>
    <div class="card-actions">
      <button type="button" data-act="left" title="Girar para a esquerda" aria-label="Girar para a esquerda">${icon(ICON.left)}</button>
      <button type="button" data-act="right" title="Girar para a direita" aria-label="Girar para a direita">${icon(ICON.right)}</button>
      <button type="button" data-act="del" title="Tirar esta página" aria-label="Tirar esta página">${icon(ICON.del)}</button>
    </div>
    <span class="check" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10"/></svg></span>`;
  const file = card.querySelector<HTMLElement>('.file')!;
  file.title = label;
  file.style.setProperty('--c', page.source.color);
  file.querySelector('.fn')!.textContent = page.source.name;
  if (page.source.kind === 'pdf') file.querySelector('.fp')!.textContent = `p. ${page.index + 1}`;
  if (page.thumb) card.querySelector('img')!.src = page.thumb;
  else seen.observe(card);
  return card;
}

/** Fit the (possibly rotated) thumbnail in its 3:4 box using container units. */
function layoutThumb(card: HTMLElement, page: Page): void {
  const img = card.querySelector('img')!;
  const turned = page.rotation % 180 !== 0;
  const aspect = turned ? page.h / page.w : page.w / page.h;
  const box = 3 / 4;
  const dispW = aspect >= box ? '92cqw' : `calc(92cqh * ${aspect})`;
  const dispH = aspect >= box ? `calc(92cqw / ${aspect})` : '92cqh';
  img.style.width = turned ? dispH : dispW;
  img.style.height = turned ? dispW : dispH;
  img.style.transform = `translate(-50%, -50%) rotate(${page.rotation}deg)`;
}

/** Bring the DOM in line with st.pages. Cards are reused, so thumbnails stay put. */
export function renderGrid(): void {
  const root = grid();
  const alive = new Set<number>();
  st.pages.forEach((page, i) => {
    alive.add(page.id);
    let card = cards.get(page.id);
    if (!card) cards.set(page.id, (card = createCard(page)));
    if (root.children[i] !== card) root.insertBefore(card, root.children[i] ?? null);
    card.querySelector('.num')!.textContent = String(i + 1);
    card.classList.toggle('selected', page.selected);
    card.setAttribute('aria-selected', String(page.selected));
    card.setAttribute(
      'aria-label',
      `Página ${i + 1}${page.rotation ? `, girada ${page.rotation}°` : ''}${page.selected ? ', selecionada' : ''}`,
    );
    layoutThumb(card, page);
  });
  for (const [id, card] of cards) {
    if (alive.has(id)) continue;
    seen.unobserve(card);
    card.remove();
    cards.delete(id);
  }
}

// ---- editing ----
export function rotate(pages: Page[], delta: 90 | -90): void {
  if (!pages.length) return;
  remember();
  for (const p of pages) p.rotation = normalizeRotation(p.rotation + delta);
  changed();
}

export function removePages(pages: Page[]): void {
  if (!pages.length) return;
  remember();
  const gone = new Set(pages);
  st.pages = st.pages.filter((p) => !gone.has(p));
  changed();
  toast(plural(pages.length, 'página tirada', 'páginas tiradas'), { label: 'Desfazer', run: doUndo });
}

/** Move pages one step earlier or later, keeping their relative order. */
export function shift(pages: Page[], delta: -1 | 1): void {
  if (!pages.length) return;
  const list = [...st.pages];
  const moving = new Set(pages);
  const idx = list.map((p, i) => (moving.has(p) ? i : -1)).filter((i) => i >= 0);
  if (delta < 0 ? idx[0] === 0 : idx[idx.length - 1] === list.length - 1) return;
  remember();
  for (const i of delta < 0 ? idx : [...idx].reverse())
    [list[i], list[i + delta]] = [list[i + delta], list[i]];
  st.pages = list;
  changed();
}

export function selectAll(on: boolean): void {
  for (const p of st.pages) p.selected = on;
  st.anchor = null;
  changed();
}

export function doUndo(): void {
  if (undo()) changed();
  else toast('Nada para desfazer');
}

function toggle(page: Page, range: boolean): void {
  if (range && st.anchor !== null) {
    const a = st.pages.findIndex((p) => p.id === st.anchor),
      b = st.pages.indexOf(page);
    if (a >= 0) {
      const [from, to] = a < b ? [a, b] : [b, a];
      for (let i = from; i <= to; i++) st.pages[i].selected = true;
      changed();
      return;
    }
  }
  page.selected = !page.selected;
  st.anchor = page.id;
  changed();
}

// ---- drag to reorder ----
interface Drag {
  page: Page;
  card: HTMLElement;
  pointerId: number;
  x0: number;
  y0: number;
  ghost: HTMLElement | null;
  hold: ReturnType<typeof setTimeout> | null;
  touch: boolean;
  scroll: number;
  lastX: number;
  lastY: number;
}
let drag: Drag | null = null;
let suppressClick = false;

function startDrag(d: Drag): void {
  const r = d.card.getBoundingClientRect();
  const ghost = d.card.cloneNode(true) as HTMLElement;
  ghost.classList.add('ghost');
  ghost.style.width = `${r.width}px`;
  ghost.style.left = `${r.left}px`;
  ghost.style.top = `${r.top}px`;
  document.body.append(ghost);
  d.ghost = ghost;
  d.card.classList.add('dragging');
  document.body.classList.add('is-dragging');
  navigator.vibrate?.(15);
  autoScroll(d);
}

function moveDrag(d: Drag, x: number, y: number): void {
  d.lastX = x;
  d.lastY = y;
  if (!d.ghost) return;
  d.ghost.style.transform = `translate(${x - d.x0}px, ${y - d.y0}px) rotate(-2deg)`;
  const under = document.elementFromPoint(x, y)?.closest<HTMLElement>('.card:not(.ghost)');
  if (!under || under === d.card || !grid().contains(under)) return;
  const ur = under.getBoundingClientRect();
  // left half of a card: drop before it; right half: after it
  grid().insertBefore(d.card, x > ur.left + ur.width / 2 ? under.nextElementSibling : under);
}

/** While dragging near the top or bottom edge, scroll the board. */
function autoScroll(d: Drag): void {
  const scroller = $('board');
  const step = () => {
    if (drag !== d || !d.ghost) return;
    const r = scroller.getBoundingClientRect();
    const edge = 70;
    let v = 0;
    if (d.lastY < r.top + edge) v = -Math.ceil((r.top + edge - d.lastY) / 5);
    else if (d.lastY > r.bottom - edge) v = Math.ceil((d.lastY - (r.bottom - edge)) / 5);
    if (v) {
      scroller.scrollTop += v;
      moveDrag(d, d.lastX, d.lastY);
    }
    d.scroll = requestAnimationFrame(step);
  };
  d.scroll = requestAnimationFrame(step);
}

function endDrag(commit: boolean): void {
  const d = drag;
  drag = null;
  if (!d) return;
  if (d.hold) clearTimeout(d.hold);
  cancelAnimationFrame(d.scroll);
  if (!d.ghost) return;
  d.ghost.remove();
  d.card.classList.remove('dragging');
  document.body.classList.remove('is-dragging');
  suppressClick = true;
  setTimeout(() => (suppressClick = false), 0);
  if (!commit) {
    renderGrid();
    return;
  }
  const order = [...grid().children].map((c) => pageOf(c)).filter((p): p is Page => !!p);
  if (order.some((p, i) => p !== st.pages[i])) {
    remember();
    st.pages = order;
    changed();
  }
}

export function initGrid(): void {
  const root = grid();

  root.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const card = target.closest<HTMLElement>('.card');
    const page = pageOf(card);
    if (!card || !page) return;
    const act = target.closest<HTMLElement>('[data-act]')?.dataset.act;
    if (act === 'left' || act === 'right') rotate([page], act === 'left' ? -90 : 90);
    else if (act === 'del') removePages([page]);
    else if (!suppressClick) toggle(page, e.shiftKey);
  });

  root.addEventListener('keydown', (e) => {
    const card = (e.target as HTMLElement).closest<HTMLElement>('.card');
    const page = pageOf(card);
    if (!card || !page || (e.target as HTMLElement).tagName === 'BUTTON') return;
    const mod = e.ctrlKey || e.metaKey;
    const i = st.pages.indexOf(page);
    const focusAt = (j: number) =>
      cards.get(st.pages[Math.max(0, Math.min(st.pages.length - 1, j))]?.id)?.focus();
    if (e.key === ' ' || e.key === 'Enter') toggle(page, e.shiftKey);
    else if (e.key === 'Delete' || e.key === 'Backspace')
      removePages(page.selected ? selectedPages() : [page]);
    else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && mod) {
      shift(page.selected ? selectedPages() : [page], e.key === 'ArrowLeft' ? -1 : 1);
      card.focus();
    } else if (e.key === 'ArrowLeft') focusAt(i - 1);
    else if (e.key === 'ArrowRight') focusAt(i + 1);
    else if (e.key.toLowerCase() === 'r')
      rotate(page.selected ? selectedPages() : [page], e.shiftKey ? -90 : 90);
    else return;
    e.preventDefault();
  });

  root.addEventListener('contextmenu', (e) => {
    if ((e.target as HTMLElement).closest('.card')) e.preventDefault();
  });

  root.addEventListener('pointerdown', (e) => {
    const target = e.target as HTMLElement;
    const card = target.closest<HTMLElement>('.card');
    const page = pageOf(card);
    if (!card || !page || target.closest('button') || e.button !== 0) return;
    const touch = e.pointerType !== 'mouse';
    const d: Drag = {
      page,
      card,
      pointerId: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      ghost: null,
      hold: null,
      touch,
      scroll: 0,
      lastX: e.clientX,
      lastY: e.clientY,
    };
    // on touch screens a quick swipe scrolls; holding still for a moment picks the page up
    if (touch) d.hold = setTimeout(() => drag === d && startDrag(d), 320);
    drag = d;
  });

  window.addEventListener('pointermove', (e) => {
    const d = drag;
    if (!d || e.pointerId !== d.pointerId) return;
    const moved = Math.hypot(e.clientX - d.x0, e.clientY - d.y0);
    if (!d.ghost) {
      if (d.touch) {
        if (moved > 10) endDrag(false);
        return;
      }
      if (moved < 6) return;
      startDrag(d);
    }
    moveDrag(d, e.clientX, e.clientY);
  });
  window.addEventListener('pointerup', (e) => drag && e.pointerId === drag.pointerId && endDrag(true));
  window.addEventListener('pointercancel', (e) => drag && e.pointerId === drag.pointerId && endDrag(false));
  // once a page is picked up on a touch screen, the finger moves it instead of scrolling
  root.addEventListener('touchmove', (e) => drag?.ghost && e.preventDefault(), { passive: false });
}
