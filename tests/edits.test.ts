import { resolve } from 'node:path';
import { PDFDocument, degrees } from '@cantoo/pdf-lib';
import { getDocument, type PDFPageProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it } from 'vitest';
import {
  along,
  boxAt,
  pageLabel,
  pageMatrix,
  pageToView,
  screenAxes,
  toWinAnsi,
  viewSize,
  viewToPage,
  type Rot,
} from '../src/core/pages';
import { buildPdf, type BuildReport, type PdfSource } from '../src/pdf/build';
import { FIRST_BASELINE, type Edit, type Signature } from '../src/pdf/edits';
import { makePng } from './pdfFixtures';

const ROTS: Rot[] = [0, 90, 180, 270];

describe('page ↔ screen', () => {
  it.each(ROTS)('round-trips points at %i°', (rot) => {
    for (const [x, y] of [
      [0, 0],
      [120, 45],
      [300, 400],
    ] as const) {
      const [px, py] = pageToView(x, y, 300, 400, rot, 1.5);
      const [bx, by] = viewToPage(px, py, 300, 400, rot, 1.5);
      expect(bx).toBeCloseTo(x);
      expect(by).toBeCloseTo(y);
    }
  });

  it.each(ROTS)('keeps the screen axes consistent at %i°', (rot) => {
    const { right, down } = screenAxes(rot);
    const [px, py] = pageToView(100, 100, 300, 400, rot);
    const [rx, ry] = pageToView(100 + right[0], 100 + right[1], 300, 400, rot);
    const [dx, dy] = pageToView(100 + down[0], 100 + down[1], 300, 400, rot);
    expect([rx - px, ry - py]).toEqual([1, 0]);
    expect([dx - px, dy - py]).toEqual([0, 1]);
  });

  it.each(ROTS)('builds a canvas transform that agrees with pageToView at %i°', (rot) => {
    const [a, b, c, d, e, f] = pageMatrix(300, 400, rot, 2);
    for (const [x, y] of [
      [0, 0],
      [37, 210],
    ] as const) {
      expect([a * x + c * y + e, b * x + d * y + f]).toEqual(pageToView(x, y, 300, 400, rot, 2));
    }
  });

  it('maps the corners of a page turned 90°', () => {
    expect(viewSize(300, 400, 90)).toEqual([400, 300]);
    // the page's top-left corner ends up at the screen's top-right
    expect(pageToView(0, 400, 300, 400, 90)).toEqual([400, 0]);
    expect(pageToView(0, 0, 300, 400, 90)).toEqual([0, 0]);
  });

  it('turns screen rectangles into page boxes', () => {
    expect(boxAt([50, 300], 0, 100, 20)).toEqual({ x: 50, y: 280, w: 100, h: 20 });
    expect(boxAt([50, 300], 90, 100, 20)).toEqual({ x: 50, y: 300, w: 20, h: 100 });
    expect(along([10, 10], 180, 5, 5)).toEqual([5, 15]);
  });
});

describe('labels and characters', () => {
  it('formats page numbers', () => {
    expect(pageLabel('n', 3, 12)).toBe('3');
    expect(pageLabel('n/N', 3, 12)).toBe('3 / 12');
    expect(pageLabel('pagina', 3, 12)).toBe('Página 3 de 12');
  });
  it('keeps Portuguese and replaces what the standard fonts lack', () => {
    expect(toWinAnsi('Ação, coração — São João “ok” €5')).toEqual({
      text: 'Ação, coração — São João “ok” €5',
      replaced: false,
    });
    expect(toWinAnsi('ok ✓ 😀')).toEqual({ text: 'ok ? ?', replaced: true });
  });
});

// ---- drawing, checked with pdf.js (an independent reader) ----

const FONTS = resolve(import.meta.dirname, '../node_modules/pdfjs-dist/standard_fonts/') + '/';

async function blankPdf(w: number, h: number, rotate = 0, text?: string): Promise<PdfSource> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([w, h]);
  if (text) page.drawText(text, { x: 40, y: h - 60, size: 14 });
  if (rotate) page.setRotation(degrees(rotate));
  return { kind: 'pdf', id: Math.random(), bytes: await doc.save() };
}

async function readPage(bytes: Uint8Array): Promise<PDFPageProxy> {
  const doc = await getDocument({ data: bytes.slice(), standardFontDataUrl: FONTS }).promise;
  return doc.getPage(1);
}

async function textItems(page: PDFPageProxy) {
  const tc = await page.getTextContent();
  // pdf.js adds empty items for line breaks between separate texts
  return tc.items.filter(
    (i): i is (typeof tc.items)[number] & { str: string; transform: number[]; width: number } =>
      'str' in i && i.str !== '',
  );
}

const opts = { pageSize: 'a4' as const, margin: 0 };
let nextId = 1;

describe('text edits', () => {
  it.each([
    [0, 0],
    [0, 90],
    [90, 0],
    [90, 180],
    [270, 0],
  ] as const)(
    'land where they were placed and read left to right (page %i°, turned %i° more)',
    async (own, turned) => {
      const src = await blankPdf(300, 400, own);
      const rot = ((own + turned) % 360) as Rot;
      // the person clicked at (60, 80) on screen, the page shown at its final rotation
      const [x, y] = viewToPage(60, 80, 300, 400, rot);
      const edit: Edit = {
        kind: 'text',
        id: nextId++,
        x,
        y,
        rot,
        text: 'Elias',
        size: 20,
        color: '#000000',
        bold: false,
      };
      const out = await buildPdf([{ source: src, index: 0, rotation: turned, edits: [edit] }], opts);

      const page = await readPage(out);
      const vp = page.getViewport({ scale: 1 });
      const [item] = await textItems(page);
      expect(item.str).toBe('Elias');
      const [a, b, , , e, f] = item.transform;
      const [sx, sy] = vp.convertToViewportPoint(e, f);
      expect(sx).toBeCloseTo(60, 0);
      expect(sy).toBeCloseTo(80 + FIRST_BASELINE * 20, 0);
      // one unit along the text goes right on screen
      const [tx, ty] = vp.convertToViewportPoint(e + a / 20, f + b / 20);
      expect(tx - sx).toBeCloseTo(1, 3);
      expect(ty - sy).toBeCloseTo(0, 3);
    },
  );

  it('writes several lines and reports characters it had to replace', async () => {
    const src = await blankPdf(300, 400);
    const report: BuildReport = { replacedChars: false };
    const edit: Edit = {
      kind: 'text',
      id: nextId++,
      x: 20,
      y: 380,
      rot: 0,
      text: 'Linha 1\nLinha ✓',
      size: 12,
      color: '#1a4fd0',
      bold: true,
    };
    const { buildPdfs } = await import('../src/pdf/build');
    const [out] = await buildPdfs([[{ source: src, index: 0, rotation: 0, edits: [edit] }]], opts, report);
    const items = await textItems(await readPage(out));
    expect(items.map((i) => i.str)).toEqual(['Linha 1', 'Linha ?']);
    expect(report.replacedChars).toBe(true);
  });
});

describe('page-wide edits', () => {
  it('stamps a diagonal watermark and numbers the pages, skipping the cover', async () => {
    const src: PdfSource = { kind: 'pdf', id: nextId++, bytes: new Uint8Array() };
    const doc = await PDFDocument.create();
    for (let i = 0; i < 3; i++) doc.addPage([595, 842]);
    src.bytes = await doc.save();
    const out = await buildPdf(
      [0, 1, 2].map((index) => ({ source: src, index, rotation: 0 })),
      {
        ...opts,
        watermark: { text: 'CÓPIA', opacity: 0.2, color: '#c0392b' },
        numbering: { format: 'pagina', position: 'bottom-center', start: 1, skipFirst: true, size: 10 },
      },
    );
    const pdf = await getDocument({ data: out, standardFontDataUrl: FONTS }).promise;
    const texts: string[][] = [];
    for (let i = 1; i <= 3; i++) texts.push((await textItems(await pdf.getPage(i))).map((t) => t.str));
    expect(texts[0]).toEqual(['CÓPIA']);
    expect(texts[1]).toEqual(['CÓPIA', 'Página 2 de 3']);

    const page = await pdf.getPage(2);
    const vp = page.getViewport({ scale: 1 });
    const [wm, num] = await textItems(page);
    const [a, b, , , e, f] = wm.transform;
    const [sx, sy] = vp.convertToViewportPoint(e, f);
    const [tx, ty] = vp.convertToViewportPoint(e + a, f + b);
    // goes up and to the right on screen
    expect(tx - sx).toBeGreaterThan(0);
    expect(ty - sy).toBeLessThan(0);
    // the number sits near the bottom, centred
    const [nx, ny] = vp.convertToViewportPoint(num.transform[4], num.transform[5]);
    expect(ny).toBeGreaterThan(800);
    expect(Math.abs(nx + num.width / 2 - 595 / 2)).toBeLessThan(2);
  });
});

describe('redaction', () => {
  it('rebuilds the page from the picture, so the text underneath is gone', async () => {
    const src = await blankPdf(300, 400, 90, 'CPF 123.456.789-00');
    expect((await textItems(await readPage(src.bytes))).map((t) => t.str)).toEqual(['CPF 123.456.789-00']);
    const out = await buildPdf(
      [
        {
          source: src,
          index: 0,
          rotation: 0,
          raster: { image: { bytes: makePng(30, 40), type: 'png', w: 30, h: 40 }, w: 300, h: 400, rot: 90 },
          edits: [
            {
              kind: 'rect',
              id: nextId++,
              x: 30,
              y: 350,
              rot: 90,
              w: 200,
              h: 30,
              style: 'redact',
              color: '#000000',
            },
          ],
        },
      ],
      opts,
    );
    const page = await readPage(out);
    expect(await textItems(page)).toEqual([]);
    expect(page.rotate).toBe(90);
    expect(page.view).toEqual([0, 0, 300, 400]);
  });
});

describe('signatures and marks', () => {
  it('draws them without errors, on turned pages too', async () => {
    const sig: Signature = { id: nextId++, png: makePng(60, 20, [20, 20, 20]), url: '', aspect: 3 };
    for (const rot of ROTS) {
      const src = await blankPdf(300, 400);
      const edits: Edit[] = [
        { kind: 'image', id: nextId++, x: 50, y: 300, rot, w: 90, h: 30, sig },
        { kind: 'mark', id: nextId++, x: 40, y: 200, rot, mark: 'check', size: 14, color: '#000000' },
        { kind: 'mark', id: nextId++, x: 60, y: 200, rot, mark: 'x', size: 14, color: '#000000' },
        { kind: 'mark', id: nextId++, x: 80, y: 200, rot, mark: 'dot', size: 14, color: '#000000' },
        {
          kind: 'rect',
          id: nextId++,
          x: 40,
          y: 150,
          rot,
          w: 80,
          h: 14,
          style: 'highlight',
          color: '#ffe14d',
        },
        { kind: 'rect', id: nextId++, x: 40, y: 120, rot, w: 80, h: 14, style: 'cover', color: '#ffffff' },
      ];
      const out = await buildPdf([{ source: src, index: 0, rotation: rot, edits }], opts);
      const doc = await PDFDocument.load(out);
      expect(doc.getPageCount()).toBe(1);
      const page = await readPage(out);
      const ops = await page.getOperatorList();
      // the signature is drawn as an image
      expect(ops.fnArray.length).toBeGreaterThan(10);
    }
  });
});
