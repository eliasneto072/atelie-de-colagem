import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PDFDocument } from '@cantoo/pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it } from 'vitest';
import { inkColor, lineNear, recognizeFont, type FontId, type TextLine } from '../src/core/fonts';
import { buildPdfs, type BuildReport, type PdfSource } from '../src/pdf/build';
import { firstBaseline, FIRST_BASELINE, type Edit } from '../src/pdf/edits';

describe('recognising the document font', () => {
  it.each([
    ['ABCDEF+TimesNewRomanPSMT', 'serif', false, false, 'Times New Roman', true],
    ['TimesNewRomanPS-BoldItalicMT', 'serif', true, true, 'Times New Roman', true],
    ['Times-Roman', 'serif', false, false, 'Times', true],
    ['ArialMT', 'sans', false, false, 'Arial', true],
    ['Arial-BoldMT', 'sans', true, false, 'Arial', true],
    ['Helvetica-Oblique', 'sans', false, true, 'Helvetica', true],
    ['BCDEEE+Calibri-Bold', 'calibri', true, false, 'Calibri', true],
    ['CourierNewPSMT', 'mono', false, false, 'Courier New', true],
    ['Consolas', 'mono', false, false, 'Consolas', false],
    ['Cambria', 'serif', false, false, 'Cambria', false],
    ['MicrosoftSansSerif', 'sans', false, false, 'Microsoft Sans Serif', false],
    ['AAAAAA+Aptos-SemiBold', 'sans', true, false, 'Aptos', false],
  ] as const)('%s → %s', (name, font, bold, italic, family, exact) => {
    expect(recognizeFont(name)).toEqual({ font, bold, italic, family, exact });
  });

  it('uses what pdf.js knows when the name says nothing', () => {
    expect(recognizeFont('F1', { fallback: 'serif', bold: true })).toMatchObject({
      font: 'serif',
      bold: true,
      exact: false,
    });
    expect(recognizeFont('F2', { fallback: 'monospace' }).font).toBe('mono');
    expect(recognizeFont('F3').font).toBe('sans');
  });
});

describe('the line a click belongs to', () => {
  const style = recognizeFont('Times-Roman');
  const lines: TextLine[] = [
    { x: 72, y: 100, w: 200, size: 12, style },
    { x: 72, y: 140, w: 120, size: 14, style: recognizeFont('Arial-BoldMT') },
  ];

  it('snaps to the line under the click, even past its end', () => {
    expect(lineNear(lines, 120, 96)).toEqual({ line: lines[0], snap: true });
    expect(lineNear(lines, 320, 97)).toEqual({ line: lines[0], snap: true });
  });

  it('only borrows the style of a nearby line', () => {
    expect(lineNear(lines, 100, 108)).toEqual({ line: lines[0], snap: false });
    expect(lineNear(lines, 100, 122)).toEqual({ line: lines[1], snap: false });
  });

  it('finds nothing far from the text, and ignores giant decorative text', () => {
    expect(lineNear(lines, 100, 400)).toBeNull();
    const giant: TextLine = { x: 200, y: 300, w: 60, size: 110, style };
    expect(lineNear([giant], 220, 280)).toBeNull();
  });
});

describe('ink colour', () => {
  const patch = (ink: [number, number, number], count: number, total = 200) => {
    const d = new Uint8ClampedArray(total * 4).fill(255);
    for (let i = 0; i < count; i++) d.set([...ink, 255], i * 4);
    return d;
  };
  it('reads coloured ink and turns near-black into the editor black', () => {
    expect(inkColor(patch([26, 63, 176], 40))).toBe('#1a3fb0');
    expect(inkColor(patch([12, 12, 14], 40))).toBe('#111111');
  });
  it('gives up on a blank patch', () => {
    expect(inkColor(patch([250, 250, 250], 40))).toBeUndefined();
  });
});

// ---- writing in each font, read back with pdf.js ----

const STANDARD_FONTS = resolve(import.meta.dirname, '../node_modules/pdfjs-dist/standard_fonts/') + '/';
const fontFile = (font: FontId, bold: boolean, italic: boolean) =>
  readFile(
    resolve(
      import.meta.dirname,
      `../node_modules/@fontsource/carlito/files/carlito-latin-${bold ? 700 : 400}-${italic ? 'italic' : 'normal'}.woff`,
    ),
  ).then((b) => new Uint8Array(b));

async function blank(): Promise<PdfSource> {
  const doc = await PDFDocument.create();
  doc.addPage([400, 300]);
  return { kind: 'pdf', id: Math.random(), bytes: await doc.save() };
}

async function write(edit: Partial<Edit> & { font: FontId; italic?: boolean }) {
  const e = {
    kind: 'text',
    id: 1,
    x: 40,
    y: 260,
    rot: 0,
    text: 'Ação é nº 1',
    size: 16,
    color: '#111111',
    bold: false,
    ...edit,
  } as Edit;
  const report: BuildReport = { replacedChars: false };
  const [bytes] = await buildPdfs(
    [[{ source: await blank(), index: 0, rotation: 0, edits: [e] }]],
    { pageSize: 'a4', margin: 0, fontFile },
    report,
  );
  const doc = await getDocument({ data: bytes.slice(), standardFontDataUrl: STANDARD_FONTS }).promise;
  const page = await doc.getPage(1);
  const tc = await page.getTextContent();
  const items = tc.items.filter((i) => 'str' in i && i.str) as { str: string; transform: number[] }[];
  await page.getOperatorList();
  const fontName = (tc.items.find((i) => 'str' in i && i.str) as { fontName: string }).fontName;
  const font = page.commonObjs.get(fontName) as { name: string; bold: boolean; italic: boolean };
  return { items, font, report, bytes };
}

describe('text in each font', () => {
  it.each([
    ['sans', false, false, 'Helvetica'],
    ['serif', false, false, 'Times-Roman'],
    ['serif', true, true, 'Times-BoldItalic'],
    ['mono', false, true, 'Courier-Oblique'],
  ] as const)('%s (bold %s, italic %s) uses %s', async (face, bold, italic, name) => {
    const { items, font } = await write({ font: face, bold, italic });
    expect(items.map((i) => i.str).join('')).toBe('Ação é nº 1');
    expect(font.name).toBe(name);
    // the baseline sits where the screen font puts it: 300 - (260 - top-to-baseline)
    expect(items[0].transform[5]).toBeCloseTo(260 - firstBaseline(face) * 16, 1);
  });

  it('embeds Carlito for Calibri, with the accents, and replaces what it lacks', async () => {
    const { items, font, report } = await write({ font: 'calibri', bold: true, text: 'Ação ✓' });
    expect(font.name).toMatch(/Carlito/);
    expect(items.map((i) => i.str).join('')).toBe('Ação ?');
    expect(report.replacedChars).toBe(true);
    expect(items[0].transform[5]).toBeCloseTo(260 - firstBaseline('calibri') * 16, 1);
  });

  it('keeps texts made before fonts existed exactly where they were', async () => {
    const { items, font } = await write({ font: undefined as unknown as FontId });
    expect(font.name).toBe('Helvetica');
    expect(items[0].transform[5]).toBeCloseTo(260 - FIRST_BASELINE * 16, 3);
  });
});
