import {
  PDFDocument,
  StandardFonts,
  concatTransformationMatrix,
  drawObject,
  popGraphicsState,
  pushGraphicsState,
} from '@cantoo/pdf-lib';
import { expect, test, type Page } from '@playwright/test';
import { encodeJpeg, photoPixels } from '../tests/compressFixtures';
import { watchErrors } from './helpers';
import { downloadFrom, fixture, openPdfTools, pagesOf, readText } from './pdfHelpers';

/**
 * "Diminuir tamanho" with files like the ones people send: scans and reports full of photos.
 * They are made here rather than kept in the repository, as they have to be big.
 */

/** Three A4 pages, each a 150 dpi photo-like scan, with a line of real text. */
async function scannedPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < 3; i++) {
    const page = doc.addPage([595, 842]);
    const jpg = await doc.embedJpg(encodeJpeg(photoPixels(1240, 1754, i + 1), 1240, 1754, 92));
    page.drawImage(jpg, { x: 0, y: 0, width: 595, height: 842 });
    page.drawText(`Documento pagina ${i + 1}`, { x: 60, y: 790, size: 16, font });
  }
  return Buffer.from(await doc.save());
}

/** Two pages whose pictures can't be re-encoded (colours inverted by /Decode), with text. */
async function stuckPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < 2; i++) {
    const page = doc.addPage([595, 842]);
    page.drawText(`Planta ${i + 1}`, { x: 60, y: 790, size: 16, font });
    const [w, h] = [1400, 1000];
    const ref = doc.context.register(
      doc.context.flateStream(photoPixels(w, h, i + 5), {
        Type: 'XObject',
        Subtype: 'Image',
        Width: w,
        Height: h,
        ColorSpace: 'DeviceRGB',
        BitsPerComponent: 8,
        Decode: [1, 0, 1, 0, 1, 0],
      }),
    );
    const name = page.node.newXObject('Im', ref);
    page.pushOperators(
      pushGraphicsState(),
      concatTransformationMatrix(480, 0, 0, 343, 60, 400),
      drawObject(name),
      popGraphicsState(),
    );
  }
  return Buffer.from(await doc.save());
}

const pdf = (name: string, buffer: Buffer) => ({ name, mimeType: 'application/pdf', buffer });

async function open(page: Page, file: ReturnType<typeof pdf> | string, pages: number): Promise<void> {
  await openPdfTools(page, 'comprimir');
  await expect(page.locator('[data-task=comprimir]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#file-input').setInputFiles(typeof file === 'string' ? fixture(file) : file);
  await expect(page.locator('.card')).toHaveCount(pages);
}

test.describe('diminuir o tamanho do PDF', () => {
  let errors: string[];
  test.beforeEach(({ page }) => {
    errors = watchErrors(page);
  });
  test.afterEach(() => expect(errors).toEqual([]));

  test('um PDF escaneado cabe em 1 MB, e o texto continua texto', async ({ page }) => {
    const scan = await scannedPdf();
    expect(scan.length).toBeGreaterThan(1_500_000);
    await open(page, pdf('escaneado.pdf', scan), 3);
    await expect(page.locator('#primary')).toHaveText('Diminuir e baixar PDF');
    await page.getByLabel('Até 1 MB').check();
    await expect(page.locator('#o-size-now')).toHaveText(/^Tamanho agora: \d,\d MB$/);

    const file = await downloadFrom(page);
    expect(file.name).toBe('escaneado-comprimido.pdf');
    expect(file.bytes.length).toBeLessThanOrEqual(1_000_000);
    expect(await pagesOf(file.bytes)).toEqual(await pagesOf(new Uint8Array(scan)));
    const text = await readText(file.bytes);
    expect(text.map((p) => p.items.map((i) => i.str).join(''))).toEqual([
      'Documento pagina 1',
      'Documento pagina 2',
      'Documento pagina 3',
    ]);
    expect(text.map((p) => p.images)).toEqual([1, 1, 1]);
    await expect(page.locator('#toast')).toContainText(/de \d,\d MB para \d+ KB/);
  });

  test('quando não cabe, pergunta antes de transformar as páginas em imagem', async ({ page }) => {
    const big = await stuckPdf();
    await open(page, pdf('planta.pdf', big), 2);
    await page.getByLabel('Até 1 MB').check();
    await page.locator('#primary').click();

    const dialog = page.locator('#shrink-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('ainda acima de 1 MB');
    await expect(page.locator('#shrink-keep')).toHaveText(/^Baixar com \d,\d MB$/);
    const wait = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Transformar em imagem' }).click();
    const { readFile } = await import('node:fs/promises');
    const bytes = new Uint8Array(await readFile((await (await wait).path())!));
    expect(bytes.length).toBeLessThanOrEqual(1_000_000);
    expect(await pagesOf(bytes)).toEqual(await pagesOf(new Uint8Array(big)));
    // the pages are pictures now: no text left
    const text = await readText(bytes);
    expect(text.map((p) => [p.items.length, p.images])).toEqual([
      [0, 1],
      [0, 1],
    ]);
    await expect(page.locator('#toast')).toContainText('com as páginas em imagem');
  });

  test('um PDF que já cabe não é baixado de novo', async ({ page }) => {
    await open(page, 'contrato.pdf', 2);
    await page.getByLabel('Até 5 MB').check();
    await expect(page.locator('#o-size-now')).toContainText('já cabe nesse limite');
    let downloads = 0;
    page.on('download', () => downloads++);
    await page.locator('#primary').click();
    await expect(page.locator('#toast')).toContainText('não precisa diminuir');
    expect(downloads).toBe(0);
  });

  test('avisa que mudar um PDF com assinatura digital faz ela deixar de valer', async ({ page }) => {
    const doc = await PDFDocument.create();
    doc.addPage([595, 842]);
    // the dictionary a signer writes, with the byte ranges the signature covers
    doc.context.register(
      doc.context.obj({ Type: 'Sig', Filter: 'Adobe.PPKLite', ByteRange: [0, 100, 200, 300] }),
    );
    const signed = Buffer.from(await doc.save({ useObjectStreams: false }));
    await open(page, pdf('assinado.pdf', signed), 1);
    await expect(page.locator('#o-signed')).toContainText('assinado.pdf tem assinatura digital');
    await page.locator('[data-task=juntar]').click();
    await expect(page.locator('#o-signed')).toBeVisible();
  });

  test('o limite escolhido fica guardado', async ({ page }) => {
    await open(page, 'contrato.pdf', 2);
    await page.getByLabel('Até 500 KB').check();
    await page.reload();
    await page.locator('#file-input').setInputFiles(fixture('contrato.pdf'));
    await expect(page.getByLabel('Até 500 KB')).toBeChecked();
  });
});
