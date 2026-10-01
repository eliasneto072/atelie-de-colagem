/** DOM and canvas helpers. */

/** Element by id; throws when the page is missing it (a bug, not a user error). */
export function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`Elemento #${id} não encontrado`);
  return e as T;
}

/** Element by id when it may not exist (tool options are re-rendered per tool). */
export function maybe<T extends HTMLElement = HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

export const input = (id: string) => el<HTMLInputElement>(id);
export const button = (id: string) => el<HTMLButtonElement>(id);

export function ctx2d(
  c: HTMLCanvasElement,
  settings?: CanvasRenderingContext2DSettings,
): CanvasRenderingContext2D {
  const x = c.getContext('2d', settings);
  if (!x) throw new Error('Este navegador não oferece canvas 2D');
  return x;
}

export function mkCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

export function cloneCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = mkCanvas(src.width, src.height);
  ctx2d(c).drawImage(src, 0, 0);
  return c;
}

/** Crop a canvas to its non-transparent pixels; null when it is fully transparent. */
export function trim(c: HTMLCanvasElement): { canvas: HTMLCanvasElement; x: number; y: number } | null {
  const w = c.width,
    h = c.height,
    d = ctx2d(c).getImageData(0, 0, w, h).data;
  let x0 = w,
    y0 = h,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let x = 0; x < w; x++) {
      if (d[row + x * 4 + 3] > 0) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  if (x0 === 0 && y0 === 0 && x1 === w - 1 && y1 === h - 1) return { canvas: c, x: 0, y: 0 };
  const t = mkCanvas(x1 - x0 + 1, y1 - y0 + 1);
  ctx2d(t).drawImage(c, -x0, -y0);
  return { canvas: t, x: x0, y: y0 };
}

export const P = (x: number, y: number): DOMPoint => new DOMPoint(x, y);

/** Inline SVG icon from path markup. */
export const svg = (paths: string): string =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

/** Escape text for use inside HTML attributes or markup. */
export const esc = (s: string): string =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
