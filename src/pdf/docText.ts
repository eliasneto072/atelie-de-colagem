/**
 * The text already on a PDF page, with its font, size and position, so that what the person
 * writes can take the same style and sit on the same line. Read once per page with pdf.js.
 */
import { inkColor, recognizeFont, type DocFont, type TextLine } from '../core/fonts';
import { pageToView, screenAxes } from '../core/pages';
import type { Frame } from './paint';
import type { Page } from './state';

/** A run of text in page space (origin at the visible box's bottom-left, y up). */
interface DocItem {
  x: number;
  y: number;
  /** Reading direction (unit vector). */
  dx: number;
  dy: number;
  w: number;
  size: number;
  style: DocFont;
}

interface PdfFontInfo {
  name?: string;
  bold?: boolean;
  italic?: boolean;
  black?: boolean;
  fallbackName?: string;
}

const cache = new Map<string, { items?: DocItem[]; promise: Promise<DocItem[]> }>();
const keyOf = (page: Page) => (page.source.kind === 'pdf' ? `${page.source.id}:${page.index}` : '');

async function read(page: Page): Promise<DocItem[]> {
  if (page.source.kind !== 'pdf' || !page.box) return [];
  const p = await page.source.doc.getPage(page.index + 1);
  const tc = await p.getTextContent();
  const items = tc.items.filter(
    (
      i,
    ): i is (typeof tc.items)[number] & {
      str: string;
      transform: number[];
      width: number;
      fontName: string;
    } => 'str' in i && i.str.trim() !== '',
  );
  // fonts arrive with the page's drawing instructions; a page drawn on screen already has them
  if (items.some((i) => !p.commonObjs.has(i.fontName))) await p.getOperatorList().catch(() => undefined);
  const [x0, y0] = page.box;
  const out: DocItem[] = [];
  for (const it of items) {
    const [a, b, c, d, e, f] = it.transform;
    const size = Math.hypot(c, d) || Math.hypot(a, b);
    const len = Math.hypot(a, b);
    if (!size || !len) continue;
    let info: PdfFontInfo = {};
    try {
      if (p.commonObjs.has(it.fontName)) info = p.commonObjs.get(it.fontName) as PdfFontInfo;
    } catch {
      info = {};
    }
    const generic = tc.styles[it.fontName]?.fontFamily;
    const style = recognizeFont(info.name ?? '', {
      bold: info.bold,
      italic: info.italic,
      black: info.black,
      fallback: info.fallbackName ?? generic,
    });
    out.push({ x: e - x0, y: f - y0, dx: a / len, dy: b / len, w: it.width, size, style });
  }
  return out;
}

/** Start reading a page's text (called when the page is drawn, so it's ready when clicked). */
export function prefetchDocText(page: Page): void {
  const key = keyOf(page);
  if (!key || cache.has(key)) return;
  const entry: { items?: DocItem[]; promise: Promise<DocItem[]> } = {
    promise: read(page).catch(() => []),
  };
  entry.promise.then((items) => (entry.items = items));
  cache.set(key, entry);
}

/** The page's text lines as shown at this frame's rotation, if they were already read. */
export function docLines(page: Page, f: Frame): TextLine[] {
  const items = cache.get(keyOf(page))?.items;
  if (!items) return [];
  const { right } = screenAxes(f.rot);
  const lines: TextLine[] = [];
  for (const it of items) {
    // only text that reads left to right on screen
    const along = it.dx * right[0] + it.dy * right[1];
    if (along < 0.98) continue;
    const [x, y] = pageToView(it.x, it.y, f.w, f.h, f.rot);
    lines.push({ x, y, w: it.w, size: it.size, style: it.style });
  }
  return lines;
}

/** The ink colour of a line, read from the page as drawn on the canvas. */
export function lineColor(canvas: HTMLCanvasElement, line: TextLine, vw: number): string | undefined {
  if (!canvas.width) return undefined;
  const k = canvas.width / vw;
  const x = Math.max(0, Math.floor(line.x * k));
  const y = Math.max(0, Math.floor((line.y - line.size * 0.8) * k));
  const w = Math.min(canvas.width - x, Math.ceil(Math.min(line.w, line.size * 30) * k));
  const h = Math.min(canvas.height - y, Math.ceil(line.size * k));
  if (w < 2 || h < 2) return undefined;
  try {
    const data = canvas.getContext('2d', { willReadFrequently: true })!.getImageData(x, y, w, h).data;
    return inkColor(data);
  } catch {
    return undefined;
  }
}
