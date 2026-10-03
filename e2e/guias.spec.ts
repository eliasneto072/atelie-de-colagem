import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { watchErrors } from './helpers';

/**
 * The pages people find in search: every page in the sitemap is complete for search engines,
 * every page of the build is in the sitemap, and each guide's button opens the tool on its task.
 */
const SITE = 'https://ateliedecolagem.com.br/';
const sitemap = readFileSync(resolve(import.meta.dirname, '../public/sitemap.xml'), 'utf8');
const urls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
const path = (url: string) => './' + url.slice(SITE.length);

/** Guide → where its button goes, and what should be chosen there. */
const GUIDES: Record<string, { task: string; tool?: string }> = {
  'assinar-pdf': { task: 'editar', tool: 'sign' },
  'esconder-cpf-pdf': { task: 'editar', tool: 'redact' },
  'foto-para-pdf': { task: 'fotos' },
  'juntar-pdf': { task: 'juntar' },
};

test('o sitemap tem todas as páginas do site', () => {
  const dist = resolve(import.meta.dirname, '../dist');
  const pages: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        if (name !== 'assets') walk(p);
      } else if (name.endsWith('.html')) pages.push(relative(dist, p).replace(/(^|\/)index\.html$/, '$1'));
    }
  };
  walk(dist);
  expect(urls.map((u) => u.slice(SITE.length)).sort()).toEqual(pages.sort());
});

for (const url of urls) {
  test(`página pronta para buscadores: ${url.slice(SITE.length) || '/'}`, async ({ page }) => {
    const errors = watchErrors(page);
    const failed: string[] = [];
    page.on('response', (r) => r.status() >= 400 && failed.push(`${r.status()} ${r.url()}`));
    await page.goto(path(url));
    await page.waitForLoadState('networkidle');

    await expect(page.locator('h1')).toHaveCount(1);
    expect((await page.title()).length).toBeGreaterThan(10);
    const description = await page.locator('meta[name=description]').getAttribute('content');
    expect(description?.length).toBeGreaterThan(50);
    expect(description?.length).toBeLessThan(170);
    await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href', url);
    // every picture with a source has a description and loaded (the editor's export preview has none yet)
    for (const img of await page.locator('img[src]').all()) {
      expect(await img.getAttribute('alt')).not.toBeNull();
      expect(await img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
    }
    // nothing wider than the screen, on the phone too
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(failed).toEqual([]);
    expect(errors).toEqual([]);
  });
}

for (const [slug, target] of Object.entries(GUIDES)) {
  test(`guia ${slug}: dados estruturados e botão que abre a ferramenta`, async ({ page }) => {
    await page.goto(`./${slug}/`);

    // the questions in the structured data are the ones on the page
    const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent())!);
    const faq = ld['@graph'].find((n: { '@type': string }) => n['@type'] === 'FAQPage');
    const summaries = await page.locator('.faq summary').allTextContents();
    expect(faq.mainEntity.map((q: { name: string }) => q.name)).toEqual(summaries.map((s) => s.trim()));
    const images = await page.locator('meta[property="og:image"]').getAttribute('content');
    expect(images).toBe(`${SITE}guias/${slug}.jpg`);
    const og = await page.request.get(`./guias/${slug}.jpg`);
    expect(og.ok()).toBe(true);

    await page.locator('.cta .button').click();
    await expect(page).toHaveURL(/\/pdf\/#/);
    await expect(page.locator(`[data-task=${target.task}]`)).toHaveAttribute('aria-pressed', 'true');
    if (target.tool) {
      await page.locator('#file-input').setInputFiles(resolve(import.meta.dirname, 'fixtures/contrato.pdf'));
      await expect(page.locator(`#edit-toolbar [data-tool=${target.tool}]`)).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    }
  });
}
