/**
 * Page thumbnails, rendered only when a card scrolls into view. They are stored as small
 * JPEGs (object URLs), so a 300-page document doesn't hold 300 canvases in memory.
 */
import type { Page } from './state';

const THUMB_W = 280;
const queue: Page[] = [];
let running = 0;
const MAX_PARALLEL = 2;
const waiting = new Map<number, (url: string | null) => void>();

function toJpegUrl(canvas: HTMLCanvasElement): Promise<string | null> {
  return new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b ? URL.createObjectURL(b) : null), 'image/jpeg', 0.82),
  );
}

async function render(page: Page): Promise<string | null> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  if (page.source.kind === 'pdf') {
    const p = await page.source.doc.getPage(page.index + 1);
    const base = p.getViewport({ scale: 1 });
    const viewport = p.getViewport({ scale: Math.min(THUMB_W / base.width, (THUMB_W * 1.6) / base.height) });
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await p.render({ canvas, viewport }).promise;
    p.cleanup();
  } else {
    const bmp = page.source.bitmap;
    const k = Math.min(1, THUMB_W / bmp.width, (THUMB_W * 1.6) / bmp.height);
    canvas.width = Math.max(1, Math.round(bmp.width * k));
    canvas.height = Math.max(1, Math.round(bmp.height * k));
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  }
  return toJpegUrl(canvas);
}

function pump(): void {
  while (running < MAX_PARALLEL && queue.length) {
    const page = queue.shift()!;
    running++;
    render(page)
      .catch(() => null)
      .then((url) => {
        if (url) page.thumb = url;
        waiting.get(page.id)?.(url);
        waiting.delete(page.id);
      })
      .finally(() => {
        running--;
        pump();
      });
  }
}

/** The thumbnail of a page, rendering it if needed (null when the page can't be drawn). */
export function thumbnail(page: Page): Promise<string | null> {
  if (page.thumb) return Promise.resolve(page.thumb);
  return new Promise((resolve) => {
    const prev = waiting.get(page.id);
    waiting.set(page.id, (url) => {
      prev?.(url);
      resolve(url);
    });
    if (!prev) {
      queue.push(page);
      pump();
    }
  });
}

/** Pages the person scrolled past get to wait; visible ones jump the queue. */
export function prioritize(page: Page): void {
  const i = queue.indexOf(page);
  if (i > 0) {
    queue.splice(i, 1);
    queue.unshift(page);
  }
}
