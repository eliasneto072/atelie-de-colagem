/** Drawing a page onto a canvas: for the editor view and for burning in redactions. */
import { boxAt, fitInPage, pageMatrix, pageSizeFor, viewSize, type Rot } from '../core/pages';
import { MARGIN_PT, opts } from './options';
import { pageRot, type Page } from './state';

/** Page space of a page as it is edited: unrotated size, final rotation, and where a photo sits. */
export interface Frame {
  w: number;
  h: number;
  rot: Rot;
  photo?: { x: number; y: number; w: number; h: number };
}

export function frameOf(page: Page): Frame {
  if (page.source.kind === 'pdf') {
    const [x0, y0, x1, y1] = page.box!;
    return { w: x1 - x0, h: y1 - y0, rot: pageRot(page) };
  }
  const { width, height } = page.source.bitmap;
  const size = pageSizeFor(opts.pageSize, width, height);
  const margin = opts.pageSize === 'foto' ? 0 : opts.margin ? MARGIN_PT : 0;
  return {
    w: size.w,
    h: size.h,
    rot: pageRot(page),
    photo: fitInPage(size.w, size.h, width, height, margin),
  };
}

/**
 * Draw the page at rotation `rot` and scale `s` (pixels per point) into `canvas`, which is
 * resized to fit. Returns false if the page couldn't be drawn.
 */
export async function paintPage(
  page: Page,
  rot: Rot,
  s: number,
  canvas: HTMLCanvasElement,
): Promise<boolean> {
  const f = frameOf(page);
  const [vw, vh] = viewSize(f.w, f.h, rot, s);
  canvas.width = Math.max(1, Math.round(vw));
  canvas.height = Math.max(1, Math.round(vh));
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (page.source.kind === 'pdf') {
    const p = await page.source.doc.getPage(page.index + 1);
    const viewport = p.getViewport({ scale: s, rotation: rot });
    await p.render({ canvas, viewport }).promise;
    p.cleanup();
  } else if (f.photo) {
    ctx.setTransform(...pageMatrix(f.w, f.h, rot, s));
    // page space has y up: flip so the photo isn't drawn upside down
    ctx.translate(f.photo.x, f.photo.y + f.photo.h);
    ctx.scale(1, -1);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(page.source.bitmap, 0, 0, f.photo.w, f.photo.h);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  return true;
}

/** Resolution of pages rebuilt as pictures because of a redaction. */
const REDACT_DPI = 200;

/**
 * The page as a JPEG with every redaction box painted black into the pixels. The builder
 * uses it instead of the original page, so the text and images under the boxes are gone.
 */
export async function redactedPicture(
  page: Page,
): Promise<{ bytes: Uint8Array; w: number; h: number; pageW: number; pageH: number }> {
  const f = frameOf(page);
  const k = REDACT_DPI / 72;
  const canvas = document.createElement('canvas');
  await paintPage(page, 0, k, canvas);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000';
  for (const e of page.edits) {
    if (e.kind !== 'rect' || e.style !== 'redact') continue;
    const b = boxAt([e.x, e.y], e.rot, e.w, e.h);
    // a pixel of margin so anti-aliased edges can't leave a readable sliver
    ctx.fillRect(
      Math.floor(b.x * k) - 1,
      Math.floor((f.h - b.y - b.h) * k) - 1,
      Math.ceil(b.w * k) + 2,
      Math.ceil(b.h * k) + 2,
    );
  }
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.9));
  if (!blob) throw new Error('não deu para gerar a página com tarja');
  const out = {
    bytes: new Uint8Array(await blob.arrayBuffer()),
    w: canvas.width,
    h: canvas.height,
    pageW: f.w,
    pageH: f.h,
  };
  canvas.width = canvas.height = 0;
  return out;
}
