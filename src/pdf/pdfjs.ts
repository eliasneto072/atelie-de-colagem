/**
 * pdf.js, loaded only when the first PDF is opened. The legacy build is used because the
 * modern one only supports the very latest Chrome and Firefox; the legacy one also covers
 * Safari on iPhone.
 */
import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';

type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs');
let lib: Promise<PdfJs> | null = null;

export function pdfjs(): Promise<PdfJs> {
  lib ??= (async () => {
    const [mod, worker] = await Promise.all([
      import('pdfjs-dist/legacy/build/pdf.mjs'),
      import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
    ]);
    mod.GlobalWorkerOptions.workerSrc = worker.default;
    return mod;
  })();
  return lib;
}

/** Decoders for scanned pages and the standard fonts, copied next to the site (vite.config.ts). */
const dataUrl = (dir: string) => new URL(`../pdfjs/${dir}/`, document.baseURI).href;

export class NeedsPassword extends Error {
  constructor(readonly wrong: boolean) {
    super(wrong ? 'senha errada' : 'precisa de senha');
  }
}

/** Open a PDF for showing its pages. pdf.js takes ownership of the bytes, so it gets a copy. */
export async function openPdf(bytes: Uint8Array, password?: string): Promise<PDFDocumentProxy> {
  const m = await pdfjs();
  const task = m.getDocument({
    data: bytes.slice(),
    password,
    wasmUrl: dataUrl('wasm'),
    standardFontDataUrl: dataUrl('standard_fonts'),
    enableXfa: false,
  });
  try {
    return await task.promise;
  } catch (err) {
    const e = err as { name?: string; code?: number };
    if (e?.name === 'PasswordException')
      throw new NeedsPassword(e.code === m.PasswordResponses.INCORRECT_PASSWORD);
    throw err;
  }
}
