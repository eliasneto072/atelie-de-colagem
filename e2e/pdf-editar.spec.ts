import { expect, test } from '@playwright/test';
import { watchErrors } from './helpers';
import { addFiles, downloadFrom, drawSignature, openPdfTools, readText, sheetPoint } from './pdfHelpers';

// the editor shows the fixture pages at 1.4 px per point (its largest scale)
const S = 1.4;

test.describe('editar PDF no computador', () => {
  let errors: string[];
  test.beforeEach(({ page }) => {
    errors = watchErrors(page);
  });
  test.afterEach(() => expect(errors).toEqual([]));

  test('escreve, marca e assina onde a pessoa clicou', async ({ page }) => {
    await openPdfTools(page, 'editar');
    await addFiles(page, ['relatorio.pdf'], 3);

    await page.locator('[data-tool=text]').click();
    const p = await sheetPoint(page, 60, 120);
    await page.mouse.click(p.x, p.y);
    await page.keyboard.type('Elias Neto');
    await page.locator('[data-tool=check]').click();
    const c = await sheetPoint(page, 50, 200);
    await page.mouse.click(c.x, c.y);

    await page.locator('[data-tool=sign]').click();
    await drawSignature(page);
    const sgn = await sheetPoint(page, 240, 520);
    await page.mouse.click(sgn.x, sgn.y);
    await expect(page.locator('.edit.image')).toHaveCount(1);

    const file = await downloadFrom(page);
    expect(file.name).toBe('relatorio-editado.pdf');
    const [first, second] = await readText(file.bytes);
    const name = first.items.find((i) => i.str === 'Elias Neto')!;
    expect(name).toBeTruthy();
    // where it was clicked: 2 px left of the pointer, first line centred on it
    expect(name.sx).toBeCloseTo((60 - 2) / S, 0);
    expect(name.sy).toBeGreaterThan(120 / S);
    expect(name.sy).toBeLessThan(120 / S + 12);
    expect(name.dx).toBeCloseTo(1, 2);
    expect(first.images).toBe(1); // the signature
    expect(second.images).toBe(0);
    expect(first.items.map((i) => i.str)).toContain('Relatório 1');
  });

  test('a tarja apaga de verdade o que está embaixo', async ({ page }) => {
    await openPdfTools(page, 'editar');
    await addFiles(page, ['relatorio.pdf'], 3);
    await page.locator('[data-tool=redact]').click();
    const a = await sheetPoint(page, 5, 5);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(a.x + 460, a.y + 90, { steps: 6 });
    await page.mouse.up();
    await expect(page.locator('.edit.rect.redact')).toHaveCount(1);
    await expect(page.locator('#toast')).toContainText('apaga de verdade');

    const pages = await readText((await downloadFrom(page)).bytes);
    // page 1 was rebuilt as a picture: none of its text survives, not even outside the box
    expect(pages[0].items).toEqual([]);
    expect(pages[0].images).toBe(1);
    expect(pages[1].items.map((i) => i.str)).toContain('Relatório 2');
  });

  test("marca d'água e números em todas as páginas", async ({ page }) => {
    await openPdfTools(page, 'editar');
    await addFiles(page, ['relatorio.pdf', 'contrato.pdf'], 5);
    await page.locator('#wm-on').check();
    await page.locator('#wm-text').fill('CÓPIA para inscrição');
    await page.locator('#nb-on').check();
    await page.getByText('Página 1 de 9').click();
    await page.locator('#nb-skip').check();
    await expect(page.locator('.wm-preview')).toHaveCount(5);
    await expect(page.locator('.nb-preview')).toHaveCount(4);

    const pages = await readText((await downloadFrom(page)).bytes);
    expect(pages).toHaveLength(5);
    expect(pages[0].items.map((i) => i.str)).not.toContain('Página 1 de 5');
    expect(pages[1].items.map((i) => i.str)).toContain('Página 2 de 5');
    expect(pages[4].items.map((i) => i.str)).toContain('Página 5 de 5');
    const wm = pages[2].items.find((i) => i.str === 'CÓPIA para inscrição')!;
    // diagonal, going up to the right
    expect(wm.dx).toBeGreaterThan(0);
    expect(wm.dy).toBeLessThan(0);
  });

  test('move, aumenta, exclui e desfaz', async ({ page }) => {
    await openPdfTools(page, 'editar');
    await addFiles(page, ['contrato.pdf'], 2);
    await page.locator('[data-tool=text]').click();
    const p = await sheetPoint(page, 100, 200);
    await page.mouse.click(p.x, p.y);
    await page.keyboard.type('Rascunho');
    await page.locator('[data-tool=select]').click();

    // drag the text 80 px to the right
    const box = (await page.locator('.edit.text').boundingBox())!;
    await page.mouse.move(box.x + 10, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 90, box.y + box.height / 2, { steps: 6 });
    await page.mouse.up();
    await page.getByRole('button', { name: 'Aumentar a letra' }).click();

    await page.keyboard.press('Delete');
    await expect(page.locator('.edit.text')).toHaveCount(0);
    await page.keyboard.press('Control+z');
    await expect(page.locator('.edit.text')).toHaveCount(1);

    const [first] = await readText((await downloadFrom(page)).bytes);
    const t = first.items.find((i) => i.str === 'Rascunho')!;
    expect(Math.abs(t.sx - (100 - 2 + 80) / S)).toBeLessThan(3);
    expect(t.size).toBeCloseTo(14, 0);
  });

  test('escreve em pé numa página girada', async ({ page }) => {
    await openPdfTools(page, 'organizar');
    await addFiles(page, ['contrato.pdf'], 2);
    await page.locator('.card').first().hover();
    await page.locator('.card').first().locator('[data-act=right]').click();
    await page.locator('[data-task=editar]').click();
    await page.locator('[data-tool=text]').click();
    const p = await sheetPoint(page, 80, 80);
    await page.mouse.click(p.x, p.y);
    await page.keyboard.type('Em pé');
    await page.locator('[data-tool=select]').click();

    const [first] = await readText((await downloadFrom(page)).bytes);
    const t = first.items.find((i) => i.str === 'Em pé')!;
    // reads left to right on the turned page, as it was typed
    expect(t.dx).toBeCloseTo(1, 2);
    expect(Math.abs(t.dy)).toBeLessThan(0.01);
  });

  test('as edições também entram ao juntar', async ({ page }) => {
    await openPdfTools(page, 'editar');
    await addFiles(page, ['contrato.pdf'], 2);
    await page.locator('[data-tool=text]').click();
    const p = await sheetPoint(page, 60, 60);
    await page.mouse.click(p.x, p.y);
    await page.keyboard.type('Visto');
    await page.locator('[data-task=juntar]').click();
    await expect(page.locator('.note')).toContainText('edições');
    const [first] = await readText((await downloadFrom(page)).bytes);
    expect(first.items.map((i) => i.str)).toContain('Visto');
  });
});
