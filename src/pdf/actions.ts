/** Producing the files people download: PDFs, split parts and page images. */
import { renderScale, type PageSizeOption } from '../core/pages';
import type { EncodedImage, OutPage, PdfSource } from './build';
import type { ImageFile, Page, PdfFile } from './state';
import { busy, download, plural, toast } from './ui';

export interface Options {
  pageSize: PageSizeOption;
  margin: boolean;
  quality: 'normal' | 'alta';
  format: 'jpg' | 'png';
  dpi: 150 | 300;
}

const KEY = 'atelie.pdf.opts';
const DEFAULTS: Options = { pageSize: 'a4', margin: true, quality: 'normal', format: 'jpg', dpi: 150 };

export const opts: Options = (() => {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Options>) };
  } catch {
    return { ...DEFAULTS };
  }
})();

export function saveOpts(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(opts));
  } catch {
    // private mode: the choice just isn't remembered
  }
}

/** pdf-lib and the ZIP writer load the first time a file is made (~150 kB). */
const builder = () => import('./build');

/** About 1 cm, a comfortable margin around photos. */
const MARGIN_PT = 28;

function canvasToBytes(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) =>
        b ? b.arrayBuffer().then((buf) => resolve(new Uint8Array(buf)), reject) : reject(new Error('toBlob')),
      type,
      quality,
    ),
  );
}

/** Re-encode a photo for the PDF: upright, white behind transparency, reduced unless "alta". */
async function encodePhoto(img: ImageFile, quality: Options['quality']): Promise<EncodedImage> {
  const { bitmap } = img;
  const max = quality === 'alta' ? 3508 : 2000;
  const k = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * k));
  canvas.height = Math.max(1, Math.round(bitmap.height * k));
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const { width: w, height: h } = canvas;
  const bytes = await canvasToBytes(canvas, 'image/jpeg', quality === 'alta' ? 0.92 : 0.82);
  canvas.width = canvas.height = 0;
  return { bytes, type: 'jpg', w, h };
}

/**
 * Pages for the builder. Every page of a file shares one source object, so each PDF is opened
 * and each photo encoded only once per download.
 */
function toOut(
  pages: readonly Page[],
  shared = new Map<PdfFile | ImageFile, OutPage['source']>(),
): OutPage[] {
  return pages.map((p) => {
    const f = p.source;
    let source = shared.get(f);
    if (!source) {
      source =
        f.kind === 'pdf'
          ? ({ kind: 'pdf', id: f.id, bytes: f.bytes, password: f.password } satisfies PdfSource)
          : { kind: 'image', id: f.id, encode: () => encodePhoto(f, opts.quality) };
      shared.set(f, source);
    }
    return { source, index: p.index, rotation: p.rotation };
  });
}

const buildOptions = (title: string) => ({
  pageSize: opts.pageSize,
  margin: opts.margin ? MARGIN_PT : 0,
  title,
});

function failed(err: unknown): void {
  console.error(err);
  toast('Não consegui gerar o arquivo. Se o PDF for muito grande, tente com menos páginas.');
}

/** One PDF with these pages, in this order. */
export async function savePdf(pages: readonly Page[], name: string): Promise<void> {
  if (!pages.length) return;
  try {
    const pdf = await busy('Montando o PDF…', async (progress) =>
      (await builder()).buildPdf(toOut(pages), {
        ...buildOptions(name),
        onPage: (d, t) => t > 8 && progress(`Montando o PDF… ${d} de ${t} páginas`),
      }),
    );
    download(pdf, `${name}.pdf`, 'application/pdf');
    toast(`Pronto: ${name}.pdf (${plural(pages.length, 'página', 'páginas')})`);
  } catch (err) {
    failed(err);
  }
}

/** Several PDFs, one per group; a ZIP when there is more than one. */
export async function saveParts(
  groups: readonly { pages: readonly Page[]; name: string }[],
  zipName: string,
): Promise<void> {
  const parts = groups.filter((g) => g.pages.length);
  if (!parts.length) return;
  const shared = new Map<PdfFile | ImageFile, OutPage['source']>();
  try {
    const { buildPdfs, zipFiles } = await builder();
    const pdfs = await busy('Separando o PDF…', (progress) =>
      buildPdfs(
        parts.map((g) => toOut(g.pages, shared)),
        { ...buildOptions(zipName), onPage: (d, t) => t > 8 && progress(`Separando… ${d} de ${t} páginas`) },
      ),
    );
    if (pdfs.length === 1) download(pdfs[0], `${parts[0].name}.pdf`, 'application/pdf');
    else {
      const zip = zipFiles(pdfs.map((data, i) => ({ name: `${parts[i].name}.pdf`, data })));
      download(zip, `${zipName}.zip`, 'application/zip');
    }
    toast(pdfs.length === 1 ? 'Pronto: 1 arquivo' : `Pronto: ${pdfs.length} arquivos em ${zipName}.zip`);
  } catch (err) {
    failed(err);
  }
}

/** Draw one page as a picture, at the resolution chosen. */
async function pageImage(page: Page): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  if (page.source.kind === 'pdf') {
    const p = await page.source.doc.getPage(page.index + 1);
    const base = p.getViewport({ scale: 1 });
    const viewport = p.getViewport({
      scale: renderScale(base.width, base.height, opts.dpi),
      rotation: (p.rotate + page.rotation) % 360,
    });
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await p.render({ canvas, viewport }).promise;
    p.cleanup();
  } else {
    const bmp = page.source.bitmap;
    const k = Math.min(1, Math.sqrt(16_000_000 / (bmp.width * bmp.height)));
    const w = Math.round(bmp.width * k),
      h = Math.round(bmp.height * k);
    const turned = page.rotation % 180 !== 0;
    canvas.width = turned ? h : w;
    canvas.height = turned ? w : h;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((page.rotation * Math.PI) / 180);
    ctx.drawImage(bmp, -w / 2, -h / 2, w, h);
  }
  const bytes = await canvasToBytes(canvas, opts.format === 'png' ? 'image/png' : 'image/jpeg', 0.9);
  canvas.width = canvas.height = 0;
  return bytes;
}

/** Each page as a JPG or PNG; a ZIP when there is more than one. */
export async function saveImages(
  pages: readonly Page[],
  base: string,
  numbers: readonly number[],
): Promise<void> {
  if (!pages.length) return;
  const ext = opts.format;
  const type = ext === 'png' ? 'image/png' : 'image/jpeg';
  try {
    const files = await busy('Gerando as imagens…', async (progress) => {
      const out: { name: string; data: Uint8Array }[] = [];
      for (const [i, page] of pages.entries()) {
        progress(`Gerando as imagens… ${i + 1} de ${pages.length}`);
        out.push({ name: `${base}-pagina-${numbers[i]}.${ext}`, data: await pageImage(page) });
      }
      return out;
    });
    if (files.length === 1) download(files[0].data, files[0].name, type);
    else download((await builder()).zipFiles(files), `${base}-imagens.zip`, 'application/zip');
    toast(
      files.length === 1
        ? `Pronto: ${files[0].name}`
        : `Pronto: ${files.length} imagens em ${base}-imagens.zip`,
    );
  } catch (err) {
    failed(err);
  }
}
