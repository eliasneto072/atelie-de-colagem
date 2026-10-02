/**
 * Drawing edits onto pdf-lib pages: text, signatures, marks, boxes, watermark and page
 * numbers. Everything is vector except signatures (PNG). Runs in the browser and in Node.
 */
import {
  BlendMode,
  LineCapStyle,
  StandardFonts,
  degrees,
  rgb,
  type PDFDocument,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from '@cantoo/pdf-lib';
import {
  along,
  boxAt,
  pageLabel,
  screenAxes,
  toWinAnsi,
  viewSize,
  viewToPage,
  type Rot,
  type Vec2,
} from '../core/pages';
import {
  FIRST_BASELINE,
  LINE_HEIGHT,
  rgb01,
  type Edit,
  type Numbering,
  type Signature,
  type Watermark,
} from './edits';

const color = (hex: string) => rgb(...rgb01(hex));

/** Fonts and signature images, embedded once per output document. */
export class Resources {
  private fonts = new Map<string, Promise<PDFFont>>();
  private sigs = new Map<number, Promise<PDFImage>>();
  /** Some characters had no glyph in the standard fonts and became "?". */
  replacedChars = false;
  constructor(private doc: PDFDocument) {}

  font(bold: boolean): Promise<PDFFont> {
    const name = bold ? StandardFonts.HelveticaBold : StandardFonts.Helvetica;
    let f = this.fonts.get(name);
    if (!f) this.fonts.set(name, (f = this.doc.embedFont(name)));
    return f;
  }

  signature(sig: Signature): Promise<PDFImage> {
    let img = this.sigs.get(sig.id);
    if (!img) this.sigs.set(sig.id, (img = this.doc.embedPng(sig.png)));
    return img;
  }

  text(s: string): string {
    const r = toWinAnsi(s);
    if (r.replaced) this.replacedChars = true;
    return r.text;
  }
}

/** Where a page's page-space starts and how it is shown. */
export interface PageFrame {
  /** Page-space origin (bottom-left of the visible box) inside the PDF page. */
  x0: number;
  y0: number;
  /** Unrotated size of the visible box. */
  w: number;
  h: number;
  /** Final rotation of the page. */
  rot: Rot;
}

const add = (p: Vec2, o: PageFrame): Vec2 => [p[0] + o.x0, p[1] + o.y0];

/** Draw the person's edits on a page. Redaction boxes are drawn black (the pixels under them
 *  must already be gone: see OutPage.raster). */
export async function drawEdits(
  page: PDFPage,
  edits: readonly Edit[],
  frame: PageFrame,
  res: Resources,
): Promise<void> {
  for (const e of edits) {
    const top: Vec2 = add([e.x, e.y], frame);
    if (e.kind === 'rect') {
      const b = boxAt(top, e.rot, e.w, e.h);
      if (e.style === 'highlight') {
        page.drawRectangle({
          ...b,
          width: b.w,
          height: b.h,
          color: color(e.color),
          opacity: 0.4,
          blendMode: BlendMode.Multiply,
        });
      } else {
        page.drawRectangle({
          ...b,
          width: b.w,
          height: b.h,
          color: e.style === 'redact' ? rgb(0, 0, 0) : color(e.color),
        });
      }
    } else if (e.kind === 'text') {
      const font = await res.font(e.bold);
      const lines = res.text(e.text).split('\n');
      lines.forEach((line, i) => {
        if (!line) return;
        const [x, y] = along(top, e.rot, 0, (FIRST_BASELINE + i * LINE_HEIGHT) * e.size);
        page.drawText(line, { x, y, size: e.size, font, color: color(e.color), rotate: degrees(e.rot) });
      });
    } else if (e.kind === 'image') {
      const img = await res.signature(e.sig);
      // pdf-lib turns images around their bottom-left corner, which on screen is the top-left moved down
      const [x, y] = along(top, e.rot, 0, e.h);
      page.drawImage(img, { x, y, width: e.w, height: e.h, rotate: degrees(e.rot) });
    } else {
      drawMark(page, e.mark, top, e.rot, e.size, color(e.color));
    }
  }
}

function drawMark(
  page: PDFPage,
  mark: 'check' | 'x' | 'dot',
  top: Vec2,
  rot: Rot,
  size: number,
  c: ReturnType<typeof rgb>,
): void {
  const at = (u: number, v: number) => {
    const [x, y] = along(top, rot, u * size, v * size);
    return { x, y };
  };
  const thickness = Math.max(1, size * 0.13);
  const line = (a: [number, number], b: [number, number]) =>
    page.drawLine({ start: at(...a), end: at(...b), thickness, color: c, lineCap: LineCapStyle.Round });
  if (mark === 'check') {
    line([0.14, 0.55], [0.4, 0.8]);
    line([0.4, 0.8], [0.88, 0.18]);
  } else if (mark === 'x') {
    line([0.18, 0.18], [0.82, 0.82]);
    line([0.82, 0.18], [0.18, 0.82]);
  } else {
    const p = at(0.5, 0.5);
    page.drawCircle({ x: p.x, y: p.y, size: size * 0.2, color: c });
  }
}

/** A diagonal, translucent text across the page, as it is seen (rotation included). */
export async function drawWatermark(
  page: PDFPage,
  wm: Watermark,
  frame: PageFrame,
  res: Resources,
): Promise<void> {
  const text = res.text(wm.text.trim());
  if (!text) return;
  const font = await res.font(true);
  const [vw, vh] = viewSize(frame.w, frame.h, frame.rot);
  const diag = Math.hypot(vw, vh);
  const size = Math.min(110, (0.78 * diag) / font.widthOfTextAtSize(text, 1));
  const tw = font.widthOfTextAtSize(text, size);
  // screen direction "up and to the right", along the page's diagonal, in page space
  const { right, down } = screenAxes(frame.rot);
  const phi = Math.atan2(vh, vw);
  const dir: Vec2 = [
    right[0] * Math.cos(phi) - down[0] * Math.sin(phi),
    right[1] * Math.cos(phi) - down[1] * Math.sin(phi),
  ];
  const up: Vec2 = [-dir[1], dir[0]];
  const cap = size * 0.72;
  const c: Vec2 = [frame.x0 + frame.w / 2, frame.y0 + frame.h / 2];
  const x = c[0] - dir[0] * (tw / 2) - up[0] * (cap / 2);
  const y = c[1] - dir[1] * (tw / 2) - up[1] * (cap / 2);
  page.drawText(text, {
    x,
    y,
    size,
    font,
    color: color(wm.color),
    opacity: wm.opacity,
    rotate: degrees((Math.atan2(dir[1], dir[0]) * 180) / Math.PI),
  });
}

/** Page number `n` of `total`, upright on the page as it is seen. */
export async function drawNumber(
  page: PDFPage,
  nb: Numbering,
  n: number,
  total: number,
  frame: PageFrame,
  res: Resources,
): Promise<void> {
  const font = await res.font(false);
  const label = res.text(pageLabel(nb.format, n, total));
  const tw = font.widthOfTextAtSize(label, nb.size);
  const [vw, vh] = viewSize(frame.w, frame.h, frame.rot);
  const m = Math.min(28, vw * 0.06, vh * 0.06);
  const px = nb.position === 'bottom-center' ? (vw - tw) / 2 : vw - m - tw;
  const baseline = nb.position === 'top-right' ? m + nb.size * 0.75 : vh - m;
  const [x, y] = viewToPage(px, baseline, frame.w, frame.h, frame.rot);
  page.drawText(label, {
    x: frame.x0 + x,
    y: frame.y0 + y,
    size: nb.size,
    font,
    color: rgb(0.2, 0.2, 0.2),
    rotate: degrees(frame.rot),
  });
}
