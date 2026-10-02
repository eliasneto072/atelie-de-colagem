/**
 * Builds the PDFs people download: pages from the PDFs they opened (kept as they are, text
 * and all, just copied) and photos placed on pages. Uses pdf-lib, so it also runs in Node
 * for the tests.
 */
import { PDFDocument, degrees, type PDFPage } from '@cantoo/pdf-lib';
import { zipSync } from 'fflate';
import { fitInPage, normalizeRotation, pageSizeFor, type PageSizeOption } from '../core/pages';

export interface PdfSource {
  kind: 'pdf';
  id: number;
  bytes: Uint8Array;
  /** Only for PDFs that asked for one. Owner-only protection opens with an empty password. */
  password?: string;
}

/** A photo, encoded on demand (the browser re-encodes it at the quality chosen). */
export interface ImageSource {
  kind: 'image';
  id: number;
  encode: () => Promise<EncodedImage>;
}

export interface EncodedImage {
  bytes: Uint8Array;
  type: 'jpg' | 'png';
  /** Pixel size, already upright (EXIF orientation applied). */
  w: number;
  h: number;
}

export interface OutPage {
  source: PdfSource | ImageSource;
  /** Page index inside a PDF source (0-based); 0 for photos. */
  index: number;
  /** Extra clockwise rotation chosen by the person, on top of the page's own. */
  rotation: number;
}

export interface BuildOptions {
  /** Page size for photos. */
  pageSize: PageSizeOption;
  /** Margin around photos, in points. */
  margin: number;
  title?: string;
  /** Called after each page, for progress messages. */
  onPage?: (done: number, total: number) => void;
}

const PRODUCER = 'Ateliê de Colagem (ateliedecolagem.com.br)';

/** Open a PDF for copying pages, trying an empty password for "protected against changes" files. */
export async function loadForCopy(src: PdfSource): Promise<PDFDocument> {
  if (src.password !== undefined)
    return PDFDocument.load(src.bytes, { password: src.password, updateMetadata: false });
  try {
    return await PDFDocument.load(src.bytes, { updateMetadata: false });
  } catch (err) {
    if (!/encrypt/i.test(String((err as Error)?.message ?? err))) throw err;
    return PDFDocument.load(src.bytes, { password: '', updateMetadata: false });
  }
}

/**
 * Build one PDF per group of pages. Sources are opened once and shared by all groups, so
 * splitting a long document into many files stays fast.
 */
export async function buildPdfs(
  groups: readonly (readonly OutPage[])[],
  opts: BuildOptions,
): Promise<Uint8Array[]> {
  const docs = new Map<number, Promise<PDFDocument>>();
  const openDoc = (src: PdfSource) => {
    let p = docs.get(src.id);
    if (!p) docs.set(src.id, (p = loadForCopy(src)));
    return p;
  };
  const images = new Map<number, Promise<EncodedImage>>();
  const encoded = (src: ImageSource) => {
    let p = images.get(src.id);
    if (!p) images.set(src.id, (p = src.encode()));
    return p;
  };

  const total = groups.reduce((n, g) => n + g.length, 0);
  let done = 0;
  const outputs: Uint8Array[] = [];
  for (const group of groups) {
    const out = await PDFDocument.create({ updateMetadata: false });
    out.setProducer(PRODUCER);
    out.setCreator(PRODUCER);
    if (opts.title) out.setTitle(opts.title);

    // copy every page a source contributes in one call, so shared fonts and images are copied once
    const copied = new Map<string, PDFPage>();
    const wanted = new Map<number, { src: PdfSource; indices: number[] }>();
    for (const p of group) {
      if (p.source.kind !== 'pdf') continue;
      const w = wanted.get(p.source.id) ?? { src: p.source, indices: [] };
      if (!w.indices.includes(p.index)) w.indices.push(p.index);
      wanted.set(p.source.id, w);
    }
    for (const { src, indices } of wanted.values()) {
      const pages = await out.copyPages(await openDoc(src), indices);
      indices.forEach((ix, k) => copied.set(`${src.id}:${ix}`, pages[k]));
    }

    for (const p of group) {
      if (p.source.kind === 'pdf') {
        const page = copied.get(`${p.source.id}:${p.index}`);
        if (!page) throw new Error('página não encontrada');
        page.setRotation(degrees(normalizeRotation(page.getRotation().angle + p.rotation)));
        out.addPage(page);
      } else {
        const img = await encoded(p.source);
        const size = pageSizeFor(opts.pageSize, img.w, img.h);
        const page = out.addPage([size.w, size.h]);
        const embedded = img.type === 'jpg' ? await out.embedJpg(img.bytes) : await out.embedPng(img.bytes);
        const margin = opts.pageSize === 'foto' ? 0 : opts.margin;
        page.drawImage(embedded, fitInPage(size.w, size.h, img.w, img.h, margin));
        if (normalizeRotation(p.rotation)) page.setRotation(degrees(normalizeRotation(p.rotation)));
      }
      opts.onPage?.(++done, total);
    }
    outputs.push(await out.save({ useObjectStreams: true }));
  }
  return outputs;
}

export async function buildPdf(pages: readonly OutPage[], opts: BuildOptions): Promise<Uint8Array> {
  const [pdf] = await buildPdfs([pages], opts);
  return pdf;
}

/** A ZIP of finished files (already compressed, so they are stored as they are). */
export function zipFiles(files: readonly { name: string; data: Uint8Array }[]): Uint8Array {
  const entries: Record<string, [Uint8Array, { level: 0 }]> = {};
  for (const f of files) {
    let name = f.name,
      n = 2;
    while (entries[name]) name = f.name.replace(/(\.[^.]+)?$/, `-${n++}$1`);
    entries[name] = [f.data, { level: 0 }];
  }
  return zipSync(entries);
}
