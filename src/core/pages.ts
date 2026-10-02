/**
 * Pure helpers for the PDF tools: page ranges typed by people, page sizes and how a photo
 * sits on a page. No DOM, no PDF library: easy to test.
 */

/** 1-based, inclusive page range, e.g. pages 3 to 5. */
export interface PageRange {
  from: number;
  to: number;
}

export type RangeResult = { ok: true; ranges: PageRange[] } | { ok: false; error: string };

/**
 * Read page ranges the way people type them: "1-3, 5, 8-10", "2 a 4", "7-" (7 to the end)
 * or "-3" (1 to 3). Separators can be commas, semicolons or spaces.
 */
export function parseRanges(text: string, max: number): RangeResult {
  const parts = text
    .toLowerCase()
    .replace(/\s+(a|até|ate)\s+/g, '-')
    .replace(/[–—]/g, '-')
    .split(/[,;\s]+/)
    .filter(Boolean);
  if (!parts.length) return { ok: false, error: 'Digite as páginas, por exemplo: 1-3, 5' };
  const ranges: PageRange[] = [];
  for (const part of parts) {
    const m = /^(\d*)-(\d*)$/.exec(part) ?? /^(\d+)$/.exec(part);
    if (!m) return { ok: false, error: `Não entendi "${part}". Use números e traços, como 1-3, 5` };
    let from: number, to: number;
    if (m.length === 2) from = to = Number(m[1]);
    else {
      if (!m[1] && !m[2])
        return { ok: false, error: `Não entendi "${part}". Use números e traços, como 1-3, 5` };
      from = m[1] ? Number(m[1]) : 1;
      to = m[2] ? Number(m[2]) : max;
    }
    if (from > to) [from, to] = [to, from];
    for (const n of [from, to]) {
      if (n < 1 || n > max) {
        return {
          ok: false,
          error: max === 1 ? `Só existe a página 1.` : `A página ${n} não existe: vai de 1 a ${max}.`,
        };
      }
    }
    ranges.push({ from, to });
  }
  return { ok: true, ranges };
}

/** Every page number covered by the ranges, in order and without repeats. */
export function pagesIn(ranges: readonly PageRange[]): number[] {
  const set = new Set<number>();
  for (const r of ranges) for (let n = r.from; n <= r.to; n++) set.add(n);
  return [...set].sort((a, b) => a - b);
}

/** Short label for a set of page numbers: [1,2,3,5] → "1-3, 5". */
export function describePages(pages: readonly number[]): string {
  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  const out: string[] = [];
  for (let i = 0; i < sorted.length;) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    out.push(i === j ? `${sorted[i]}` : `${sorted[i]}-${sorted[j]}`);
    i = j + 1;
  }
  return out.join(', ');
}

/** Points per inch in PDF. */
export const PT_PER_INCH = 72;

export type PageSizeOption = 'a4' | 'carta' | 'foto';

/** Paper sizes in points, portrait. */
export const PAPER = {
  a4: { w: 595.28, h: 841.89 },
  carta: { w: 612, h: 792 },
} as const;

/**
 * Page size for a photo. On paper sizes the page turns to landscape for landscape photos;
 * "foto" makes a page with the photo's proportions, as long as an A4 page on its longer side.
 */
export function pageSizeFor(option: PageSizeOption, imgW: number, imgH: number): { w: number; h: number } {
  const landscape = imgW > imgH;
  if (option === 'foto') {
    const long = PAPER.a4.h;
    return landscape ? { w: long, h: (long * imgH) / imgW } : { w: (long * imgW) / imgH, h: long };
  }
  const p = PAPER[option];
  return landscape ? { w: p.h, h: p.w } : { w: p.w, h: p.h };
}

/** Where a picture goes on a page: as large as fits inside the margin, centred. */
export function fitInPage(
  pageW: number,
  pageH: number,
  imgW: number,
  imgH: number,
  margin: number,
): { x: number; y: number; w: number; h: number } {
  const aw = Math.max(1, pageW - 2 * margin),
    ah = Math.max(1, pageH - 2 * margin);
  const k = Math.min(aw / imgW, ah / imgH);
  const w = imgW * k,
    h = imgH * k;
  return { x: (pageW - w) / 2, y: (pageH - h) / 2, w, h };
}

/**
 * Scale for rendering a page at `dpi`, reduced if needed so the image stays under
 * `maxPixels` (phones refuse very large canvases).
 */
export function renderScale(pageWpt: number, pageHpt: number, dpi: number, maxPixels = 16_000_000): number {
  const k = dpi / PT_PER_INCH;
  const px = pageWpt * k * pageHpt * k;
  return px > maxPixels ? k * Math.sqrt(maxPixels / px) : k;
}

/** Turn any 90° multiple (negative too) into 0, 90, 180 or 270. */
export const normalizeRotation = (deg: number): 0 | 90 | 180 | 270 =>
  ((((Math.round(deg / 90) * 90) % 360) + 360) % 360) as 0 | 90 | 180 | 270;

/** File name without its extension, made safe for downloads. */
export function baseName(name: string): string {
  const b = name
    .replace(/\.[^.]+$/, '')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .trim();
  return b || 'documento';
}
