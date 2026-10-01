import { expect, test } from '@playwright/test';
import { SUN, discStroke, docToScreen, openEditor, sceneBrightness, undoTitle, watchErrors } from './helpers';

test.describe('editor no celular', () => {
  let errors: string[];
  test.beforeEach(async ({ page }) => {
    errors = watchErrors(page);
    await openEditor(page);
  });
  test.afterEach(() => expect(errors).toEqual([]));

  test('cabe na tela sem rolagem lateral', async ({ page }) => {
    const { sw, vw } = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      vw: window.innerWidth,
    }));
    expect(sw).toBeLessThanOrEqual(vw);
    await expect(page.locator('#dock-tabs')).toBeVisible();
  });

  test('mostra o acesso a Sobre, Privacidade e Termos até em telas estreitas', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.locator('#btn-about').tap();
    await expect(page.locator('#modal-about a[href="./termos.html"]')).toBeVisible();
  });

  test('abre o painel pela aba e mantém só a seleção', async ({ page }) => {
    await page.locator('#note-close').tap();
    await page.locator('#dock-tabs [data-sheet=sec-sel]').tap();
    await expect(page.locator('#panel')).toHaveClass(/is-open/);
    await page.locator('#sa-keep').tap();
    await expect(undoTitle(page)).toHaveAttribute('title', /Manter só a seleção/);
    // the sheet closes so the result is visible
    await expect(page.locator('#panel')).not.toHaveClass(/is-open/);
  });

  test('remove o sol com o dedo', async ({ page }) => {
    await page.locator('#note-close').tap();
    const tool = page.locator('.tool[data-tool=remove]');
    await tool.scrollIntoViewIfNeeded();
    await tool.tap();
    const S = await docToScreen(page);
    const before = await sceneBrightness(page, S(SUN.x, SUN.y));

    const cdp = await page.context().newCDPSession(page);
    const touch = (type: string, pts: Array<{ x: number; y: number }>) =>
      cdp.send('Input.dispatchTouchEvent', {
        type: type as 'touchStart' | 'touchMove' | 'touchEnd',
        touchPoints: pts.map((p, id) => ({ x: p.x, y: p.y, id })),
      });
    const [first, ...rest] = discStroke(SUN.x, SUN.y, SUN.r * 1.2).map(([x, y]) => S(x, y));
    await touch('touchStart', [first]);
    await page.waitForTimeout(150); // longer than the touch delay that tells a stroke from a pinch
    for (const p of rest) {
      await touch('touchMove', [p]);
      await page.waitForTimeout(10);
    }
    await touch('touchEnd', []);
    await expect(undoTitle(page)).toHaveAttribute('title', /Remover objeto/, { timeout: 30_000 });
    await page.waitForTimeout(100);
    expect(await sceneBrightness(page, S(SUN.x, SUN.y))).toBeLessThan(before - 40);
  });
});
