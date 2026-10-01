import { expect, test } from '@playwright/test';
import {
  SUN,
  discStroke,
  docToScreen,
  openEditor,
  sceneBrightness,
  transformFields,
  undoTitle,
  watchErrors,
} from './helpers';
import { serveDist } from './static-server';

test.describe('editor no computador', () => {
  let errors: string[];
  test.beforeEach(async ({ page }) => {
    errors = watchErrors(page);
    await openEditor(page);
  });
  test.afterEach(() => expect(errors).toEqual([]));

  test('abre com o exemplo, a versão e os links', async ({ page }) => {
    await expect(page).toHaveTitle(/Ateliê de Colagem/);
    await expect(page.locator('#st-doc')).toContainText('1400 × 880');
    await page.locator('#btn-about').click();
    await expect(page.locator('#about-version')).toHaveText(/versão \d+\.\d+\.\d+/);
    await expect(page.locator('#modal-about a[href="./privacidade.html"]')).toBeVisible();
  });

  test('mantém só a seleção, move, estica e alinha', async ({ page }) => {
    await page.locator('#sa-keep').click();
    await expect(undoTitle(page)).toHaveAttribute('title', /Manter só a seleção/);
    const S = await docToScreen(page);

    // drag the balloon by its middle
    let f = await transformFields(page);
    await page.mouse.move(S(f.x, f.y).x, S(f.x, f.y).y);
    await page.mouse.down();
    await page.mouse.move(S(f.x + 300, f.y - 40).x, S(f.x + 300, f.y - 40).y, { steps: 8 });
    await page.mouse.up();
    await expect(undoTitle(page)).toHaveAttribute('title', /Mover/);
    const moved = await transformFields(page);
    expect(moved.x).toBeGreaterThan(f.x + 250);

    // stretch from the right side handle: only the width changes
    f = moved;
    const handle = S(f.x + f.w / 2, f.y);
    await page.mouse.move(handle.x, handle.y);
    await page.mouse.down();
    await page.mouse.move(S(f.x + f.w / 2 + 120, f.y).x, handle.y, { steps: 8 });
    await page.mouse.up();
    await expect(undoTitle(page)).toHaveAttribute('title', /Esticar na horizontal/);
    const stretched = await transformFields(page);
    expect(stretched.w).toBeGreaterThan(f.w + 100);
    expect(stretched.h).toBe(f.h);

    // centre on the canvas
    await page.locator('[data-align=center]').click();
    await expect(undoTitle(page)).toHaveAttribute('title', /Alinhar com a tela/);
    const centred = await transformFields(page);
    expect(Math.abs(centred.x - 700)).toBeLessThan(25);
    expect(Math.abs(centred.y - 440)).toBeLessThan(25);
  });

  test('remove o sol e refaz o fundo', async ({ page }) => {
    await page.locator('#note-close').click();
    await page.locator('.tool[data-tool=remove]').click();
    const S = await docToScreen(page);
    const before = await sceneBrightness(page, S(SUN.x, SUN.y));
    const [first, ...rest] = discStroke(SUN.x, SUN.y, SUN.r);
    await page.mouse.move(S(...first).x, S(...first).y);
    await page.mouse.down();
    for (const p of rest) await page.mouse.move(S(...p).x, S(...p).y, { steps: 2 });
    await page.mouse.up();
    await expect(undoTitle(page)).toHaveAttribute('title', /Remover objeto/, { timeout: 30_000 });

    // the bright sun disc is gone: its centre now looks like the sky and hills around it
    await page.waitForTimeout(100);
    const after = await sceneBrightness(page, S(SUN.x, SUN.y));
    expect(before).toBeGreaterThan(200);
    expect(after).toBeLessThan(before - 40);
  });

  test('exporta um PNG', async ({ page }) => {
    await page.locator('#btn-export').click();
    const download = page.waitForEvent('download');
    await page.locator('#me-save').click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('colagem.png');
    const stream = await file.createReadStream();
    let size = 0;
    for await (const chunk of stream) size += (chunk as Buffer).length;
    expect(size).toBeGreaterThan(20_000);
  });

  test('continua funcionando sem internet', async ({ page }) => {
    const server = await serveDist();
    try {
      await page.goto(server.url);
      await expect(page.locator('#layer-list .layer')).toHaveCount(2);
      await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
      // wait until the whole build is cached
      await expect
        .poll(() =>
          page.evaluate(async () => {
            let n = 0;
            for (const k of await caches.keys()) n += (await (await caches.open(k)).keys()).length;
            return n;
          }),
        )
        .toBeGreaterThan(15);
    } finally {
      await server.stop();
    }
    await page.reload();
    await expect(page.locator('#layer-list .layer')).toHaveCount(2);
    await page.goto(server.url + 'privacidade.html');
    await expect(page.locator('h1')).toHaveText('Privacidade');
  });
});
