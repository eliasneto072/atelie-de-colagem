import { expect, test } from '@playwright/test';
import { watchErrors } from './helpers';
import { serveDist } from './static-server';
import {
  addFiles,
  downloadFrom,
  dragCard,
  fixture,
  openPdfTools,
  pagesOf,
  pngSize,
  unzip,
} from './pdfHelpers';

const A4 = { w: 595, h: 842 };

test.describe('PDF no computador', () => {
  let errors: string[];
  test.beforeEach(({ page }) => {
    errors = watchErrors(page);
  });
  test.afterEach(() => expect(errors).toEqual([]));

  test('junta PDFs e fotos na ordem da grade', async ({ page }) => {
    await openPdfTools(page, 'juntar');
    await addFiles(page, ['relatorio.pdf', 'contrato.pdf', 'foto.jpg'], 6);
    await expect(page.locator('#primary')).toHaveText('Juntar e baixar PDF');
    const file = await downloadFrom(page);
    expect(file.name).toBe('relatorio-juntado.pdf');
    const pages = await pagesOf(file.bytes);
    expect(pages.map((p) => p.w)).toEqual([300, 310, 320, 500, 510, A4.w]);
    // the photo is stored sideways with an EXIF flag; it comes out upright, on a portrait A4
    expect(pages[5]).toEqual({ ...A4, rot: 0 });
  });

  test('muda a ordem dos arquivos inteiros', async ({ page }) => {
    await openPdfTools(page, 'juntar');
    await addFiles(page, ['relatorio.pdf', 'contrato.pdf'], 5);
    await page
      .locator('.files li', { hasText: 'contrato.pdf' })
      .getByRole('button', { name: /Subir/ })
      .click();
    const pages = await pagesOf((await downloadFrom(page)).bytes);
    expect(pages.map((p) => p.w)).toEqual([500, 510, 300, 310, 320]);
  });

  test('organiza: gira, tira, desfaz e arrasta', async ({ page }) => {
    await openPdfTools(page, 'organizar');
    await addFiles(page, ['relatorio.pdf'], 3);
    const card = (i: number) => page.locator('.card').nth(i);

    await card(0).hover();
    await card(0).locator('[data-act=right]').click();
    await card(1).hover();
    await card(1).locator('[data-act=del]').click();
    await expect(page.locator('.card')).toHaveCount(2);
    await page.locator('.toast-action', { hasText: 'Desfazer' }).click();
    await expect(page.locator('.card')).toHaveCount(3);
    await card(1).hover();
    await card(1).locator('[data-act=del]').click();
    await expect(page.locator('.card')).toHaveCount(2);

    // drag the last page to the front
    await dragCard(page, 1, 0);
    await expect(card(0).locator('.fp')).toHaveText('p. 3');

    const file = await downloadFrom(page);
    expect(file.name).toBe('relatorio-organizado.pdf');
    expect(await pagesOf(file.bytes)).toEqual([
      { w: 320, h: 400, rot: 0 },
      { w: 300, h: 400, rot: 90 },
    ]);
  });

  test('seleciona com clique e Shift e gira as selecionadas', async ({ page }) => {
    await openPdfTools(page, 'organizar');
    await addFiles(page, ['relatorio.pdf', 'contrato.pdf'], 5);
    await page.locator('.card').nth(1).click();
    await page
      .locator('.card')
      .nth(3)
      .click({ modifiers: ['Shift'] });
    await expect(page.locator('#count')).toHaveText('5 páginas · 3 selecionadas');
    await page.locator('#sel-left').click();
    const pages = await pagesOf((await downloadFrom(page)).bytes);
    expect(pages.map((p) => p.rot)).toEqual([0, 270, 270, 270, 0]);
  });

  test('separa as páginas escolhidas, cada página e por partes', async ({ page }) => {
    await openPdfTools(page, 'separar');
    await addFiles(page, ['relatorio.pdf'], 3);
    await expect(page.locator('#primary')).toBeDisabled();

    await page.locator('#o-pick').fill('1, 3');
    await page.locator('#o-pick').press('Enter');
    await expect(page.locator('#primary')).toHaveText('Baixar 2 páginas');
    let file = await downloadFrom(page);
    expect(file.name).toBe('relatorio-paginas-1_3.pdf');
    expect((await pagesOf(file.bytes)).map((p) => p.w)).toEqual([300, 320]);

    await page.getByLabel('Cada página em um PDF separado').check();
    file = await downloadFrom(page);
    expect(file.name).toBe('relatorio-paginas.zip');
    expect(Object.keys(unzip(file.bytes)).sort()).toEqual([
      'relatorio-pagina-1.pdf',
      'relatorio-pagina-2.pdf',
      'relatorio-pagina-3.pdf',
    ]);

    await page.getByLabel('Em partes, por intervalos').check();
    await page.locator('#o-parts').fill('1-2, 3-');
    file = await downloadFrom(page);
    const parts = unzip(file.bytes);
    expect(Object.keys(parts).sort()).toEqual(['relatorio-paginas-1-2.pdf', 'relatorio-paginas-3.pdf']);
    expect((await pagesOf(parts['relatorio-paginas-1-2.pdf'])).map((p) => p.w)).toEqual([300, 310]);

    await page.locator('#o-parts').fill('2-9');
    await page.locator('#primary').click();
    await expect(page.locator('#toast')).toContainText('A página 9 não existe');
  });

  test('fotos para PDF no tamanho de cada foto', async ({ page }) => {
    await openPdfTools(page, 'fotos');
    await addFiles(page, ['foto.jpg', 'recibo.png'], 2);
    await page.getByText('Igual à foto').click();
    const file = await downloadFrom(page);
    expect(file.name).toBe('fotos.pdf');
    const [foto, recibo] = await pagesOf(file.bytes);
    expect(foto.w / foto.h).toBeCloseTo(300 / 400, 2);
    expect(recibo.w / recibo.h).toBeCloseTo(640 / 480, 2);
  });

  test('PDF para imagens PNG', async ({ page }) => {
    await openPdfTools(page, 'imagens');
    await addFiles(page, ['contrato.pdf'], 2);
    await page.getByText('PNG', { exact: true }).click();
    await expect(page.locator('#primary')).toHaveText('Baixar 2 imagens');
    const file = await downloadFrom(page);
    expect(file.name).toBe('contrato-imagens.zip');
    const files = unzip(file.bytes);
    expect(Object.keys(files).sort()).toEqual(['contrato-pagina-1.png', 'contrato-pagina-2.png']);
    // 500 pt wide at 150 dpi
    expect(pngSize(files['contrato-pagina-1.png']).w).toBe(Math.ceil((500 * 150) / 72));
  });

  test('continua funcionando sem internet depois da primeira visita', async ({ page }) => {
    const server = await serveDist();
    try {
      await page.goto(`${server.url}pdf/#organizar`);
      await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
      // the page asks the service worker to keep the PDF engine
      await expect
        .poll(
          () =>
            page.evaluate(async () => {
              const urls: string[] = [];
              for (const k of await caches.keys())
                urls.push(...(await (await caches.open(k)).keys()).map((r) => r.url));
              return ['pdf.worker', '/build-', '/pdf/'].every((part) => urls.some((u) => u.includes(part)));
            }),
          { timeout: 15_000 },
        )
        .toBe(true);
    } finally {
      await server.stop();
    }
    await page.reload();
    await addFiles(page, ['relatorio.pdf'], 3);
    const file = await downloadFrom(page);
    expect((await pagesOf(file.bytes)).map((p) => p.w)).toEqual([300, 310, 320]);
  });

  test('abre PDF com senha e baixa sem senha', async ({ page }) => {
    await openPdfTools(page, 'organizar');
    await page.locator('#file-input').setInputFiles(fixture('protegido.pdf'));
    const dialog = page.locator('#pw-dialog');
    await expect(dialog).toBeVisible();
    await page.locator('#pw-input').fill('0000');
    await dialog.getByRole('button', { name: 'Abrir' }).click();
    await expect(page.locator('#pw-wrong')).toBeVisible();
    await page.locator('#pw-input').fill('1234');
    await dialog.getByRole('button', { name: 'Abrir' }).click();
    await expect(page.locator('.card')).toHaveCount(2);
    const file = await downloadFrom(page);
    expect((await pagesOf(file.bytes)).map((p) => p.w)).toEqual([400, 410]);
  });
});
