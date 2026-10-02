import { expect, test } from '@playwright/test';
import { watchErrors } from './helpers';
import { addFiles, downloadFrom, openPdfTools, readText, sheetPoint } from './pdfHelpers';

test.describe('editar PDF no celular', () => {
  let errors: string[];
  test.beforeEach(({ page }) => {
    errors = watchErrors(page);
  });
  test.afterEach(() => expect(errors).toEqual([]));

  test('escreve com o dedo, marca e passa tarja arrastando', async ({ page }) => {
    await openPdfTools(page, 'editar');
    await addFiles(page, ['relatorio.pdf'], 3);
    const { sw, vw } = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      vw: innerWidth,
    }));
    expect(sw).toBeLessThanOrEqual(vw);

    await page.locator('[data-tool=text]').tap();
    const p = await sheetPoint(page, 40, 90);
    await page.touchscreen.tap(p.x, p.y);
    await page.keyboard.type('Assinado em 02/10');
    await page.locator('[data-tool=check]').tap();
    const c = await sheetPoint(page, 40, 150);
    await page.touchscreen.tap(c.x, c.y);
    await expect(page.locator('.edit.mark')).toHaveCount(1);

    // a box drawn with the finger, not a scroll
    await page.locator('[data-tool=redact]').tap();
    const cdp = await page.context().newCDPSession(page);
    const a = await sheetPoint(page, 10, 10);
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x?: number, y?: number) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: x === undefined ? [] : [{ x, y: y!, id: 1 }],
      });
    await touch('touchStart', a.x, a.y);
    for (let k = 1; k <= 8; k++) await touch('touchMove', a.x + k * 25, a.y + k * 6);
    await touch('touchEnd');
    await expect(page.locator('.edit.rect.redact')).toHaveCount(1);

    await page.locator('[data-tool=select]').tap();
    await page.locator('#panel-toggle').tap();
    await expect(page.getByText('Caixa selecionada')).toBeVisible();
    await page.locator('#panel-toggle').tap();

    const pages = await readText((await downloadFrom(page)).bytes);
    expect(pages[0].items.map((i) => i.str)).toEqual(['Assinado em 02/10']);
    expect(pages[1].items.map((i) => i.str)).toContain('Relatório 2');
  });
});
