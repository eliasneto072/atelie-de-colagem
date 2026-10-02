import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PDFDocument } from '@cantoo/pdf-lib';
import { unzipSync } from 'fflate';
import { expect, type Download, type Page } from '@playwright/test';

export const fixture = (name: string) => resolve(import.meta.dirname, 'fixtures', name);

export async function openPdfTools(page: Page, task = 'juntar'): Promise<void> {
  await page.goto(`./pdf/#${task}`);
  await expect(page.locator('#empty')).toBeVisible();
}

export async function addFiles(page: Page, names: string[], expectedPages: number): Promise<void> {
  await page.locator('#file-input').setInputFiles(names.map(fixture));
  // the editor shows big pages instead of cards
  const editing = (await page.evaluate(() => location.hash)) === '#editar';
  await expect(page.locator(editing ? '.vpage' : '.card')).toHaveCount(expectedPages);
}

/** Click the main button and return the downloaded file. */
export async function downloadFrom(page: Page): Promise<{ name: string; bytes: Uint8Array }> {
  const wait = page.waitForEvent('download');
  await page.locator('#primary').click();
  return read(await wait);
}

export async function read(d: Download): Promise<{ name: string; bytes: Uint8Array }> {
  return { name: d.suggestedFilename(), bytes: new Uint8Array(await readFile((await d.path())!)) };
}

/** Width (rounded), height and rotation of every page. */
export async function pagesOf(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((p) => ({
    w: Math.round(p.getWidth()),
    h: Math.round(p.getHeight()),
    rot: p.getRotation().angle,
  }));
}

export const unzip = (bytes: Uint8Array) => unzipSync(bytes);

/** Width and height from a PNG header. */
export function pngSize(bytes: Uint8Array): { w: number; h: number } {
  const v = new DataView(bytes.buffer, bytes.byteOffset);
  return { w: v.getUint32(16), h: v.getUint32(20) };
}

/** Drag a card to just before another, with the mouse. */
export async function dragCard(page: Page, from: number, to: number): Promise<void> {
  const a = (await page.locator('.card').nth(from).boundingBox())!;
  const b = (await page.locator('.card').nth(to).boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 - 20, a.y + a.height / 2, { steps: 4 });
  await page.mouse.move(b.x + b.width * 0.25, b.y + b.height / 2, { steps: 12 });
  await page.mouse.up();
}

/** Text of every page as pdf.js reads it (an independent reader), with positions on screen. */
export async function readText(bytes: Uint8Array) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const fonts = resolve(import.meta.dirname, '../node_modules/pdfjs-dist/standard_fonts/') + '/';
  const doc = await getDocument({ data: bytes.slice(), standardFontDataUrl: fonts }).promise;
  const pages: {
    items: { str: string; sx: number; sy: number; dx: number; dy: number; size: number }[];
    images: number;
  }[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const p = await doc.getPage(i);
    const vp = p.getViewport({ scale: 1 });
    const tc = await p.getTextContent();
    const items = [];
    for (const it of tc.items) {
      if (!('str' in it) || !it.str) continue;
      const [a, b, , , e, f] = it.transform as number[];
      const [sx, sy] = vp.convertToViewportPoint(e, f);
      const size = Math.hypot(a, b);
      // one point along the text's baseline, on screen: (1, 0) when it reads left to right
      const [tx, ty] = vp.convertToViewportPoint(e + a / size, f + b / size);
      items.push({ str: it.str, sx, sy, dx: tx - sx, dy: ty - sy, size });
    }
    const ops = await p.getOperatorList();
    const { OPS } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const images = ops.fnArray.filter(
      (fn) => fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject,
    ).length;
    pages.push({ items, images });
  }
  return pages;
}

/** Point on the first page sheet of the editor, in CSS pixels from its top-left. */
export async function sheetPoint(page: Page, x: number, y: number, index = 0) {
  const b = (await page.locator('.vsheet').nth(index).boundingBox())!;
  return { x: b.x + x, y: b.y + y, box: b };
}

/** Draw a wavy signature in the pad and accept it. */
export async function drawSignature(page: Page): Promise<void> {
  await expect(page.locator('#sig-dialog')).toBeVisible();
  const c = (await page.locator('#sig-canvas').boundingBox())!;
  await page.mouse.move(c.x + 40, c.y + c.height * 0.6);
  await page.mouse.down();
  for (let i = 1; i <= 30; i++)
    await page.mouse.move(c.x + 40 + i * 12, c.y + c.height * (0.6 - 0.25 * Math.sin(i / 3)));
  await page.mouse.up();
  await page.locator('#sig-dialog button[value=ok]').click();
  await expect(page.locator('#sig-dialog')).toBeHidden();
}
