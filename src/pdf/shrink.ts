/**
 * "Diminuir tamanho", the browser half: the canvas re-encodes pictures as JPEG for
 * compress.ts, pdf.js draws the pages when they have to become pictures, and the person is
 * told how big the file got and asked before the text stops being text.
 */
import { formatSize } from '../core/bytes';
import { CHARS_NOTE, currentPdf, failed } from './actions';
import {
  compressPdf,
  PAGE_LEVELS,
  picturesPdf,
  type Codec,
  type JpegTarget,
  type PictureSource,
} from './compress';
import { openPdf } from './pdfjs';
import type { Page } from './state';
import { $, busy, download, toast } from './ui';

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

function canvas(w: number, h: number): AnyCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

const release = (c: AnyCanvas | null) => {
  if (c) c.width = c.height = 0;
};

async function jpegOf(c: AnyCanvas, quality: number): Promise<Uint8Array | null> {
  const blob =
    c instanceof HTMLCanvasElement
      ? await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', quality))
      : await c.convertToBlob({ type: 'image/jpeg', quality });
  return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
}

/**
 * One JPEG per target, from the largest to the smallest. Each size is drawn from the one
 * before it, which is both faster and smoother than shrinking the full picture every time.
 */
async function jpegsFrom(
  source: CanvasImageSource,
  w: number,
  h: number,
  targets: readonly JpegTarget[],
): Promise<(Uint8Array | null)[]> {
  const out: (Uint8Array | null)[] = [];
  let from: CanvasImageSource = source;
  let [fw, fh] = [w, h];
  let held: AnyCanvas | null = null;
  try {
    for (const t of targets) {
      const c = canvas(t.w, t.h);
      const ctx = c.getContext('2d') as CanvasRenderingContext2D | null;
      if (!ctx) {
        out.push(null);
        continue;
      }
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, t.w, t.h);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(from, 0, 0, fw, fh, 0, 0, t.w, t.h);
      out.push(await jpegOf(c, t.quality));
      if (t.w <= fw && t.h <= fh) {
        release(held);
        held = c;
        from = c;
        [fw, fh] = [t.w, t.h];
      } else release(c);
    }
  } finally {
    release(held);
  }
  return out;
}

async function bitmapOf(src: PictureSource): Promise<ImageBitmap | null> {
  try {
    if (src.kind === 'jpeg') {
      // colours as they are stored: the PDF says how to read them, not the JPEG
      return await createImageBitmap(
        new Blob([src.bytes as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' }),
        {
          colorSpaceConversion: 'none',
        },
      );
    }
    const rgba = new Uint8ClampedArray(src.w * src.h * 4);
    const { data, channels } = src;
    for (let p = 0, q = 0; p < rgba.length; p += 4, q += channels) {
      rgba[p] = data[q];
      rgba[p + 1] = data[q + (channels === 3 ? 1 : 0)];
      rgba[p + 2] = data[q + (channels === 3 ? 2 : 0)];
      rgba[p + 3] = 255;
    }
    return await createImageBitmap(new ImageData(rgba, src.w, src.h));
  } catch {
    return null;
  }
}

/** The JPEG encoder compress.ts uses: the browser's own. */
export const canvasCodec: Codec = {
  async jpegs(src, targets) {
    const bmp = await bitmapOf(src);
    // a size other than the PDF says means the browser read it differently: leave it alone
    if (!bmp || bmp.width !== src.w || bmp.height !== src.h) {
      bmp?.close();
      return targets.map(() => null);
    }
    try {
      return await jpegsFrom(bmp, bmp.width, bmp.height, targets);
    } finally {
      bmp.close();
    }
  },
};

/** Largest page picture drawn, in pixels (phones refuse bigger canvases). */
const MAX_PIXELS = 12_000_000;

/**
 * The PDF with every page as a picture, at the lightest level that fits `target` (or the
 * strongest without one). Each page is drawn once and encoded at every level.
 */
export async function pagesAsPictures(
  bytes: Uint8Array,
  target: number | undefined,
  title: string,
  progress: (text: string) => void,
  password?: string,
): Promise<{ bytes: Uint8Array; fits: boolean }> {
  const doc = await openPdf(bytes, password);
  const levels: { jpeg: Uint8Array; w: number; h: number; rot: number }[][] = PAGE_LEVELS.map(() => []);
  try {
    for (let i = 0; i < doc.numPages; i++) {
      progress(`Transformando as páginas em imagem… ${i + 1} de ${doc.numPages}`);
      const page = await doc.getPage(i + 1);
      const [x0, y0, x1, y1] = page.view;
      const [w, h] = [x1 - x0, y1 - y0];
      const k = Math.min(PAGE_LEVELS[0].dpi / 72, Math.sqrt(MAX_PIXELS / (w * h)));
      const viewport = page.getViewport({ scale: k, rotation: 0 });
      const c = document.createElement('canvas');
      c.width = Math.ceil(viewport.width);
      c.height = Math.ceil(viewport.height);
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvas: c, viewport }).promise;
      const targets = PAGE_LEVELS.map((l) => {
        const s = Math.min(k, l.dpi / 72);
        return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)), quality: l.quality };
      });
      const jpegs = await jpegsFrom(c, c.width, c.height, targets);
      c.width = c.height = 0;
      page.cleanup();
      jpegs.forEach((jpeg, l) => {
        if (!jpeg) throw new Error('não consegui desenhar a página');
        levels[l].push({ jpeg, w, h, rot: page.rotate });
      });
    }
  } finally {
    void doc.loadingTask.destroy();
  }
  progress('Montando o PDF…');
  const last = PAGE_LEVELS.length - 1;
  // estimate from the pictures, then check the real size
  const estimate = (l: number) => levels[l].reduce((s, p) => s + p.jpeg.length + 600, 2000);
  let level = target === undefined ? last : levels.findIndex((_, l) => estimate(l) <= target);
  if (level < 0) level = last;
  for (;;) {
    const out = await picturesPdf(levels[level], title);
    if (target === undefined || out.length <= target || level === last)
      return { bytes: out, fits: target === undefined || out.length <= target };
    level++;
  }
}

/** Asks whether to turn the pages into pictures. Resolves to what the person chose. */
function askPictures(size: number, target: number): Promise<'pictures' | 'keep' | 'cancel'> {
  const dlg = $<HTMLDialogElement>('shrink-dialog');
  $('shrink-text').textContent = `O PDF ficou com ${formatSize(size)}, ainda acima de ${formatSize(target)}.`;
  $('shrink-keep').textContent = `Baixar com ${formatSize(size)}`;
  dlg.returnValue = '';
  dlg.showModal();
  return new Promise((resolve) =>
    dlg.addEventListener(
      'close',
      () =>
        resolve(dlg.returnValue === 'pictures' ? 'pictures' : dlg.returnValue === 'keep' ? 'keep' : 'cancel'),
      { once: true },
    ),
  );
}

const LONG = 9000;

/** Make the PDF of these pages smaller, down to `target` bytes when given, and download it. */
export async function saveSmaller(
  pages: readonly Page[],
  name: string,
  target: number | undefined,
): Promise<void> {
  if (!pages.length) return;
  const file = `${name}.pdf`;
  try {
    const first = await busy('Diminuindo o PDF…', async (progress) => {
      const pdf = await currentPdf(pages, name, progress);
      progress('Diminuindo o PDF…');
      const result = await compressPdf(pdf.bytes, {
        codec: canvasCodec,
        target,
        password: pdf.password,
        onProgress: (d, t) => progress(`Diminuindo as imagens… ${d} de ${t}`),
      });
      return { pdf, result };
    });
    const { pdf, result } = first;
    const before = pdf.bytes.length;
    const chars = pdf.report.replacedChars ? CHARS_NOTE : '';

    if (result.fits) {
      if (pdf.same && result.bytes === pdf.bytes) {
        toast(
          target === undefined
            ? `Não deu para diminuir mais: este PDF já está compacto (${formatSize(before)}).`
            : `Este PDF já tem ${formatSize(before)} e cabe em ${formatSize(target)}: não precisa diminuir.`,
          undefined,
          LONG,
        );
        return;
      }
      download(result.bytes, file, 'application/pdf');
      toast(
        `Pronto: ${file}, de ${formatSize(before)} para ${formatSize(result.bytes.length)}.${chars}`,
        undefined,
        LONG,
      );
      return;
    }

    // still too big: the pages can become pictures, but the text stops being text
    const limit = target!;
    const choice = await askPictures(result.bytes.length, limit);
    if (choice === 'cancel') return;
    let out = result.bytes;
    let fits = false;
    if (choice === 'pictures') {
      const pictures = await busy('Transformando as páginas em imagem…', (progress) =>
        // the original comes back as it was (protected, maybe) when nothing could make it smaller
        pagesAsPictures(
          result.bytes,
          limit,
          name,
          progress,
          result.bytes === pdf.bytes ? pdf.password : undefined,
        ),
      );
      if (pictures.bytes.length < out.length) ({ bytes: out, fits } = pictures);
    }
    download(out, file, 'application/pdf');
    toast(
      fits
        ? `Pronto: ${file}, de ${formatSize(before)} para ${formatSize(out.length)}, com as páginas em imagem.`
        : choice === 'keep'
          ? `Pronto: ${file}, de ${formatSize(before)} para ${formatSize(out.length)}.`
          : `Ficou com ${formatSize(out.length)}, o menor possível sem perder a leitura. Para caber em ${formatSize(limit)}, divida o PDF em partes (em Separar).`,
      undefined,
      LONG,
    );
  } catch (err) {
    failed(err);
  }
}
