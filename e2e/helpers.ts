import { expect, type Page } from '@playwright/test';

/** Fail the test on any uncaught error in the page. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

/** Open the editor and wait until the example is on screen. */
export async function openEditor(page: Page): Promise<void> {
  await page.goto('./');
  await expect(page.locator('#layer-list .layer')).toHaveCount(2);
  await page.evaluate(() => document.fonts.ready);
}

export type ToScreen = (x: number, y: number) => { x: number; y: number };

/**
 * Map document pixels to screen points. Reads the coordinates the status bar shows
 * for two mouse positions, so the tests don't depend on internal state.
 */
export async function docToScreen(page: Page): Promise<ToScreen> {
  const box = (await page.locator('#overlay').boundingBox())!;
  const read = async (sx: number, sy: number) => {
    await page.mouse.move(sx, sy);
    const t = await page.locator('#st-pos').textContent();
    const m = /x\s*(-?\d+)\s*·\s*y\s*(-?\d+)/.exec(t ?? '');
    if (!m) throw new Error(`no pointer position in status bar: ${t}`);
    return { x: Number(m[1]), y: Number(m[2]) };
  };
  const a = { x: box.x + box.width * 0.25, y: box.y + box.height * 0.25 };
  const b = { x: box.x + box.width * 0.75, y: box.y + box.height * 0.75 };
  const da = await read(a.x, a.y),
    db = await read(b.x, b.y);
  const kx = (b.x - a.x) / (db.x - da.x),
    ky = (b.y - a.y) / (db.y - da.y);
  return (x, y) => ({ x: a.x + (x - da.x) * kx, y: a.y + (y - da.y) * ky });
}

/** Values of the move tool's X, Y, width and height fields. */
export async function transformFields(page: Page): Promise<{ x: number; y: number; w: number; h: number }> {
  const [x, y, w, h] = await Promise.all(
    ['tf-x', 'tf-y', 'tf-w', 'tf-h'].map(async (id) => Number(await page.locator(`#${id}`).inputValue())),
  );
  return { x, y, w, h };
}

export const undoTitle = (page: Page) => page.locator('#btn-undo');

/** The sun of the example sunset, in document pixels. */
export const SUN = { x: 930, y: 548, r: 66 };

/** Scribble over a disc (concentric rings), as a person would paint over an object. */
export function discStroke(cx: number, cy: number, r: number): Array<[number, number]> {
  const pts: Array<[number, number]> = [[cx, cy]];
  for (const ring of [0.3, 0.65, 1.0]) {
    for (let a = 0; a <= 360; a += 20) {
      pts.push([
        cx + Math.cos((a * Math.PI) / 180) * r * ring,
        cy + Math.sin((a * Math.PI) / 180) * r * ring,
      ]);
    }
  }
  return pts;
}

/** Average brightness (0–255) of the rendered scene in a 5×5 screen-pixel patch. */
export function sceneBrightness(page: Page, at: { x: number; y: number }): Promise<number> {
  return page.evaluate(({ x, y }) => {
    const c = document.getElementById('scene') as HTMLCanvasElement;
    const r = c.getBoundingClientRect();
    const k = c.width / r.width;
    const d = c
      .getContext('2d')!
      .getImageData(Math.round((x - r.left) * k) - 2, Math.round((y - r.top) * k) - 2, 5, 5).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += (d[i] + d[i + 1] + d[i + 2]) / 3;
    return sum / 25;
  }, at);
}
