/** Producing the files people download: PDFs, split parts and page images. */
import { renderScale } from '../core/pages';
import type { BuildOptions, BuildReport, EncodedImage, OutPage, PdfSource } from './build';
import { hasRedaction } from './edits';
import { pdfFontFile } from './fontFiles';
import { MARGIN_PT, opts, type Options } from './options';
import { redactedPicture } from './paint';
import { openPdf } from './pdfjs';
import { st, type ImageFile, type Page, type PdfFile } from './state';
import { busy, download, plural, toast } from './ui';

/** pdf-lib and the ZIP writer load the first time a file is made (~150 kB). */
const builder = () => import('./build');

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
async function toOut(
  pages: readonly Page[],
  shared = new Map<PdfFile | ImageFile, OutPage['source']>(),
): Promise<OutPage[]> {
  const out: OutPage[] = [];
  for (const p of pages) {
    const f = p.source;
    let source = shared.get(f);
    if (!source) {
      source =
        f.kind === 'pdf'
          ? ({ kind: 'pdf', id: f.id, bytes: f.bytes, password: f.password } satisfies PdfSource)
          : { kind: 'image', id: f.id, encode: () => encodePhoto(f, opts.quality) };
      shared.set(f, source);
    }
    const page: OutPage = { source, index: p.index, rotation: p.rotation, edits: p.edits };
    if (hasRedaction(p.edits)) {
      // the page is redrawn as a picture with the boxes burned in: nothing under them survives
      const pic = await redactedPicture(p);
      page.raster = {
        image: { bytes: pic.bytes, type: 'jpg', w: pic.w, h: pic.h },
        w: pic.pageW,
        h: pic.pageH,
        rot: p.baseRot,
      };
    }
    out.push(page);
  }
  return out;
}

const buildOptions = (title: string): BuildOptions => ({
  pageSize: opts.pageSize,
  margin: opts.margin ? MARGIN_PT : 0,
  title,
  watermark: st.watermark.on ? st.watermark : undefined,
  numbering: st.numbering.on ? st.numbering : undefined,
  fontFile: pdfFontFile,
});

function failed(err: unknown): void {
  console.error(err);
  toast('Não consegui gerar o arquivo. Se o PDF for muito grande, tente com menos páginas.');
}

const CHARS_NOTE = ' Alguns símbolos não existem nas fontes e saíram como "?".';

/** One PDF with these pages, in this order. */
export async function savePdf(pages: readonly Page[], name: string): Promise<void> {
  if (!pages.length) return;
  try {
    const report: BuildReport = { replacedChars: false };
    const pdf = await busy('Montando o PDF…', async (progress) => {
      const { buildPdfs } = await builder();
      const [bytes] = await buildPdfs(
        [await toOut(pages)],
        {
          ...buildOptions(name),
          onPage: (d, t) => t > 8 && progress(`Montando o PDF… ${d} de ${t} páginas`),
        },
        report,
      );
      return bytes;
    });
    download(pdf, `${name}.pdf`, 'application/pdf');
    toast(
      `Pronto: ${name}.pdf (${plural(pages.length, 'página', 'páginas')}).${report.replacedChars ? CHARS_NOTE : ''}`,
    );
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
    const pdfs = await busy('Separando o PDF…', async (progress) => {
      const groupsOut: OutPage[][] = [];
      for (const g of parts) groupsOut.push(await toOut(g.pages, shared));
      return buildPdfs(groupsOut, {
        ...buildOptions(zipName),
        onPage: (d, t) => t > 8 && progress(`Separando… ${d} de ${t} páginas`),
      });
    });
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

/** A page of an already-built PDF as a picture (its rotation included). */
async function pdfPageImage(doc: Awaited<ReturnType<typeof openPdf>>, index: number): Promise<Uint8Array> {
  const p = await doc.getPage(index + 1);
  const base = p.getViewport({ scale: 1 });
  const viewport = p.getViewport({ scale: renderScale(base.width, base.height, opts.dpi) });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await p.render({ canvas, viewport }).promise;
  p.cleanup();
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
  const edited = pages.some((p) => p.edits.length) || st.watermark.on || st.numbering.on;
  try {
    const files = await busy('Gerando as imagens…', async (progress) => {
      const out: { name: string; data: Uint8Array }[] = [];
      if (edited) {
        // draw the pages with the edits: build the edited PDF, then picture each of its pages
        const { buildPdfs } = await builder();
        const [bytes] = await buildPdfs([await toOut(pages)], buildOptions(base));
        const doc = await openPdf(bytes);
        try {
          for (let i = 0; i < doc.numPages; i++) {
            progress(`Gerando as imagens… ${i + 1} de ${pages.length}`);
            out.push({ name: `${base}-pagina-${numbers[i]}.${ext}`, data: await pdfPageImage(doc, i) });
          }
        } finally {
          void doc.loadingTask.destroy();
        }
        return out;
      }
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
