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
  await expect(page.locator('.card')).toHaveCount(expectedPages);
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
