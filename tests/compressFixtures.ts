/** Pictures and PDFs for the compression tests, and a JPEG encoder that runs in Node. */
import {
  PDFDocument,
  PDFName,
  StandardFonts,
  concatTransformationMatrix,
  drawObject,
  popGraphicsState,
  pushGraphicsState,
  type PDFPage,
  type PDFRef,
} from '@cantoo/pdf-lib';
import jpeg from 'jpeg-js';
import type { Codec, PictureSource } from '../src/pdf/compress';

/** A photo-like picture: smooth colour, some texture, a few thousand colours. */
export function photoPixels(w: number, h: number, seed = 1): Uint8Array {
  const out = new Uint8Array(w * h * 3);
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 24 - 12;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      const t = Math.sin(x / 37) * Math.cos(y / 23);
      out[i] = 120 + 90 * (x / w) + 20 * t + rnd();
      out[i + 1] = 90 + 110 * (y / h) - 25 * t + rnd();
      out[i + 2] = 160 - 60 * (x / w) + 30 * t + rnd();
    }
  return out;
}

const toRgba = (data: Uint8Array, channels: number, w: number, h: number) => {
  const rgba = new Uint8Array(w * h * 4);
  for (let p = 0; p < w * h; p++) {
    for (let c = 0; c < 3; c++) rgba[p * 4 + c] = data[p * channels + (channels === 1 ? 0 : c)];
    rgba[p * 4 + 3] = 255;
  }
  return rgba;
};

export function encodeJpeg(rgb: Uint8Array, w: number, h: number, quality = 92): Uint8Array {
  return new Uint8Array(jpeg.encode({ data: toRgba(rgb, 3, w, h), width: w, height: h }, quality).data);
}

/** Average the pixels each output pixel covers. */
function shrink(rgba: Uint8Array, w: number, h: number, ow: number, oh: number): Uint8Array {
  const out = new Uint8Array(ow * oh * 4);
  for (let y = 0; y < oh; y++) {
    const y0 = Math.floor((y * h) / oh),
      y1 = Math.max(y0 + 1, Math.floor(((y + 1) * h) / oh));
    for (let x = 0; x < ow; x++) {
      const x0 = Math.floor((x * w) / ow),
        x1 = Math.max(x0 + 1, Math.floor(((x + 1) * w) / ow));
      const sum = [0, 0, 0];
      for (let yy = y0; yy < y1; yy++)
        for (let xx = x0; xx < x1; xx++) for (let c = 0; c < 3; c++) sum[c] += rgba[(yy * w + xx) * 4 + c];
      const n = (y1 - y0) * (x1 - x0);
      for (let c = 0; c < 3; c++) out[(y * ow + x) * 4 + c] = sum[c] / n;
      out[(y * ow + x) * 4 + 3] = 255;
    }
  }
  return out;
}

/** What the browser does with a canvas, done with jpeg-js. Records what it was asked. */
export function nodeCodec(): Codec & { asked: { src: PictureSource['kind']; w: number; h: number }[] } {
  const asked: { src: PictureSource['kind']; w: number; h: number }[] = [];
  return {
    asked,
    jpegs(src, targets) {
      let rgba: Uint8Array;
      if (src.kind === 'jpeg') rgba = jpeg.decode(src.bytes, { useTArray: true, formatAsRGBA: true }).data;
      else rgba = toRgba(src.data, src.channels, src.w, src.h);
      return Promise.resolve(
        targets.map((t) => {
          asked.push({ src: src.kind, w: t.w, h: t.h });
          const px = t.w === src.w && t.h === src.h ? rgba : shrink(rgba, src.w, src.h, t.w, t.h);
          return new Uint8Array(
            jpeg.encode({ data: px, width: t.w, height: t.h }, Math.round(t.quality * 100)).data,
          );
        }),
      );
    },
  };
}

/** Draw an XObject on the page with the matrix [w 0 0 h x y]. */
export function drawXObject(page: PDFPage, ref: PDFRef, x: number, y: number, w: number, h: number): void {
  const name = page.node.newXObject('Im', ref);
  page.pushOperators(
    pushGraphicsState(),
    concatTransformationMatrix(w, 0, 0, h, x, y),
    drawObject(name),
    popGraphicsState(),
  );
}

/** An A4 page with a line of text, ready for pictures. */
export async function textPage(doc: PDFDocument, text = 'Contrato de teste'): Promise<PDFPage> {
  const page = doc.addPage([595, 842]);
  page.drawText(text, { x: 60, y: 780, size: 16, font: await doc.embedFont(StandardFonts.Helvetica) });
  return page;
}

/** A lossless RGB picture stored with Flate, as PDF makers do with PNGs. */
export function flateImage(doc: PDFDocument, rgb: Uint8Array, w: number, h: number): PDFRef {
  const stream = doc.context.flateStream(rgb, {
    Type: 'XObject',
    Subtype: 'Image',
    Width: w,
    Height: h,
    ColorSpace: 'DeviceRGB',
    BitsPerComponent: 8,
  });
  return doc.context.register(stream);
}

export const name = PDFName.of;
