import { expect, test } from '@playwright/test';
import { watchErrors } from './helpers';
import { addFiles, downloadFrom, openPdfTools, pagesOf } from './pdfHelpers';

test.describe('PDF no celular', () => {
  let errors: string[];
  test.beforeEach(({ page }) => {
    errors = watchErrors(page);
  });
  test.afterEach(() => expect(errors).toEqual([]));

  test('fotos para PDF com o painel de opções em gaveta', async ({ page }) => {
    await openPdfTools(page, 'fotos');
    await expect(page.locator('#empty-camera')).toBeVisible();
    await addFiles(page, ['foto.jpg', 'recibo.png'], 2);

    const { sw, vw } = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      vw: innerWidth,
    }));
    expect(sw).toBeLessThanOrEqual(vw);

    await expect(page.locator('#panel-body')).toBeHidden();
    await page.locator('#panel-toggle').tap();
    await expect(page.locator('#panel-body')).toBeVisible();
    await page.getByText('Igual à foto').tap();
    const file = await downloadFrom(page);
    await expect(page.locator('#panel-body')).toBeHidden();
    const [foto] = await pagesOf(file.bytes);
    expect(foto.w / foto.h).toBeCloseTo(0.75, 2);
  });

  test('segura e arrasta uma página para mudar a ordem', async ({ page }) => {
    await openPdfTools(page, 'organizar');
    await addFiles(page, ['relatorio.pdf'], 3);
    const box = async (i: number) => (await page.locator('.card').nth(i).boundingBox())!;
    const from = await box(2),
      to = await box(0);
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x?: number, y?: number) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: x === undefined ? [] : [{ x, y: y!, id: 1 }],
      });

    const sx = from.x + from.width / 2,
      sy = from.y + from.height / 2;
    await touch('touchStart', sx, sy);
    await page.waitForTimeout(450); // hold still: the page lifts
    const tx = to.x + to.width * 0.2,
      ty = to.y + to.height / 2;
    for (let k = 1; k <= 12; k++) {
      await touch('touchMove', sx + ((tx - sx) * k) / 12, sy + ((ty - sy) * k) / 12);
      await page.waitForTimeout(16);
    }
    await touch('touchEnd');
    await expect(page.locator('.card').nth(0).locator('.fp')).toHaveText('p. 3');

    // a quick swipe scrolls instead of dragging, and a tap selects
    await page.locator('.card').nth(1).tap();
    await expect(page.locator('#count')).toHaveText('3 páginas · 1 selecionada');
  });
});
