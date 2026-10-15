import { resolve } from 'node:path';
import { PDFArray, PDFDocument, PDFName, PDFNumber, PDFRawStream } from '@cantoo/pdf-lib';
import { zlibSync } from 'fflate';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it } from 'vitest';
import {
  compressPdf,
  fewColors,
  IMAGE_LEVELS,
  jpegInfo,
  picturesPdf,
  unpredict,
  withoutExif,
} from '../src/pdf/compress';
import { drawnSize, multiply, xobjectDraws, type Matrix } from '../src/pdf/contentScan';
import {
  drawXObject,
  encodeJpeg,
  flateImage,
  name,
  nodeCodec,
  photoPixels,
  textPage,
} from './compressFixtures';

const STANDARD_FONTS = resolve(import.meta.dirname, '../node_modules/pdfjs-dist/standard_fonts/') + '/';
const enc = new TextEncoder();

/** The pictures of a PDF: their size and how they are stored. */
async function images(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  return doc.context
    .enumerateIndirectObjects()
    .filter(([, o]) => o instanceof PDFRawStream && o.dict.lookup(name('Subtype')) === name('Image'))
    .map(([ref, o]) => {
      const d = (o as PDFRawStream).dict;
      const n = (k: string) => (d.lookup(name(k)) as PDFNumber).asNumber();
      return {
        ref,
        w: n('Width'),
        h: n('Height'),
        filter: d.lookup(name('Filter'))?.toString(),
        colorSpace: d.lookup(name('ColorSpace'))?.toString(),
        smask: d.get(name('SMask')),
        bytes: (o as PDFRawStream).contents.length,
      };
    });
}

/** What pdf.js reads: the text of each page, and that its pictures decode. */
async function read(bytes: Uint8Array, password?: string) {
  const doc = await getDocument({ data: bytes.slice(), password, standardFontDataUrl: STANDARD_FONTS })
    .promise;
  const pages: { text: string; pictures: number }[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const text = (await page.getTextContent()).items.map((t) => ('str' in t ? t.str : '')).join('');
    const ops = await page.getOperatorList();
    pages.push({ text, pictures: ops.fnArray.filter((f) => f === OPS.paintImageXObject).length });
  }
  await doc.loadingTask.destroy();
  return pages;
}

const MB = 1_000_000;

describe('reading content streams', () => {
  it('follows the transformation of each picture, through q/Q and cm', () => {
    const draws = xobjectDraws(
      enc.encode('q 2 0 0 2 10 10 cm q 100 0 0 50 0 0 cm /Im1 Do Q /Fm#201 Do Q /Im2 Do'),
    );
    expect(draws.map((d) => d.name)).toEqual(['Im1', 'Fm 1', 'Im2']);
    expect(draws[0].m).toEqual([200, 0, 0, 100, 10, 10]);
    expect(draws[1].m).toEqual([2, 0, 0, 2, 10, 10]);
    expect(draws[2].m).toEqual([1, 0, 0, 1, 0, 0]);
  });

  it('is not fooled by strings, comments and inline pictures', () => {
    const inline = 'BI /W 2 /H 1 /CS /G /BPC 8 ID \x00Do) cm\nEI ';
    const draws = xobjectDraws(
      enc.encode(`BT (a \\) /X Do (nested)) Tj ET % /Y Do\n${inline} 3 0 0 3 0 0 cm /Im Do`),
    );
    expect(draws).toEqual([{ name: 'Im', m: [3, 0, 0, 3, 0, 0] }]);
  });

  it('measures rotated pictures by their sides', () => {
    const m: Matrix = multiply([300, 0, 0, 200, 0, 0], [0, 1, -1, 0, 0, 0]);
    expect(drawnSize(m)).toEqual({ w: 300, h: 200 });
  });
});

describe('pieces of the decoder', () => {
  it('reads the size of a JPEG', () => {
    const j = encodeJpeg(photoPixels(40, 30), 40, 30);
    expect(jpegInfo(j)).toEqual({ w: 40, h: 30, channels: 3 });
    expect(jpegInfo(new Uint8Array([1, 2, 3]))).toBeNull();
  });

  it('drops the EXIF block, whose orientation browsers would apply', () => {
    const j = encodeJpeg(photoPixels(40, 30), 40, 30);
    // APP1 "Exif" with an orientation, right after the start marker
    const exif = new Uint8Array([0xff, 0xe1, 0, 16, 0x45, 0x78, 0x69, 0x66, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8]);
    const tagged = new Uint8Array([...j.subarray(0, 2), ...exif, ...j.subarray(2)]);
    expect([...withoutExif(tagged)]).toEqual([...j]);
    expect(withoutExif(j)).toBe(j);
  });

  it('undoes PNG predictors', () => {
    // two rows of 3 gray pixels: Sub, then Up
    const rows = new Uint8Array([1, 10, 5, 5, 2, 1, 1, 1]);
    expect([...unpredict(rows, 12, 1, 8, 3)!]).toEqual([10, 15, 20, 11, 16, 21]);
  });

  it('tells drawings from photos', () => {
    const chart = new Uint8Array(3000 * 3);
    for (let i = 0; i < 3000; i++) chart.set(i % 3 ? [255, 255, 255] : [30, 90, 200], i * 3);
    expect(fewColors(chart, 3)).toBe(true);
    expect(fewColors(photoPixels(100, 100), 3)).toBe(false);
  });
});

/** A PDF with text and one big photo drawn 300×200 pt (about 4 by 3 inches). */
async function photoPdf(kind: 'jpeg' | 'flate') {
  const doc = await PDFDocument.create();
  const page = await textPage(doc);
  const px = photoPixels(1800, 1200);
  if (kind === 'jpeg') {
    const img = await doc.embedJpg(encodeJpeg(px, 1800, 1200, 95));
    page.drawImage(img, { x: 60, y: 400, width: 300, height: 200 });
  } else drawXObject(page, flateImage(doc, px, 1800, 1200), 60, 400, 300, 200);
  return doc.save();
}

describe('compressing a PDF', () => {
  it('shrinks a photo to the size it shows, and the text stays text', async () => {
    const original = await photoPdf('jpeg');
    const codec = nodeCodec();
    const r = await compressPdf(original, { codec });
    expect(r.fits).toBe(true);
    expect(r.images).toBe(1);
    expect(r.bytes.length).toBeLessThan(original.length / 4);
    // the strongest level: 100 dpi over 300 pt = 417 px wide
    const [img] = await images(r.bytes);
    expect(img).toMatchObject({ w: 417, h: 278, filter: '/DCTDecode' });
    expect(await read(r.bytes)).toEqual([{ text: 'Contrato de teste', pictures: 1 }]);
    // each level was encoded from one decoding, at the size that level needs
    expect(codec.asked.map((a) => a.w)).toEqual(IMAGE_LEVELS.map((l) => Math.round((300 / 72) * l.dpi)));
  });

  it('keeps the best quality that fits the size asked', async () => {
    const original = await photoPdf('jpeg');
    const codec = nodeCodec();
    const loose = await compressPdf(original, { codec, target: 0.6 * original.length });
    const [img] = await images(loose.bytes);
    // 200 dpi (the lightest level) already fits
    expect(img.w).toBe(833);
    expect(loose.fits).toBe(true);
    // a harder limit takes a stronger level, still within the limit
    const tight = await compressPdf(original, { codec, target: 0.02 * original.length });
    expect(tight.bytes.length).toBeLessThanOrEqual(0.02 * original.length);
    expect((await images(tight.bytes))[0].w).toBeLessThan(833);
  });

  it('says when even the strongest level is too big', async () => {
    const original = await photoPdf('jpeg');
    const r = await compressPdf(original, { codec: nodeCodec(), target: 5_000 });
    expect(r.fits).toBe(false);
    expect((await images(r.bytes))[0].w).toBe(417);
  });

  it('leaves a PDF that already fits as it is, apart from lossless clean-up', async () => {
    const original = await photoPdf('jpeg');
    const codec = nodeCodec();
    const r = await compressPdf(original, { codec, target: 5 * MB });
    expect(r).toMatchObject({ fits: true, images: 0 });
    expect((await images(r.bytes))[0].w).toBe(1800);
  });

  it('turns lossless photos into JPEG', async () => {
    const original = await photoPdf('flate');
    const r = await compressPdf(original, { codec: nodeCodec() });
    const [img] = await images(r.bytes);
    expect(img).toMatchObject({ filter: '/DCTDecode', colorSpace: '/DeviceRGB', w: 417 });
    expect(r.bytes.length).toBeLessThan(original.length / 10);
    expect((await read(r.bytes))[0].pictures).toBe(1);
  });

  it('reads pictures stored with a PNG predictor', async () => {
    const doc = await PDFDocument.create();
    const page = await textPage(doc);
    const [w, h] = [600, 400];
    const px = photoPixels(w, h);
    // PNG "Up" filter on every row
    const rows = new Uint8Array((w * 3 + 1) * h);
    for (let y = 0; y < h; y++) {
      rows[y * (w * 3 + 1)] = 2;
      for (let i = 0; i < w * 3; i++)
        rows[y * (w * 3 + 1) + 1 + i] = (px[y * w * 3 + i] - (y ? px[(y - 1) * w * 3 + i] : 0)) & 255;
    }
    const stream = doc.context.stream(zlibSync(rows), {
      Type: 'XObject',
      Subtype: 'Image',
      Width: w,
      Height: h,
      ColorSpace: 'DeviceRGB',
      BitsPerComponent: 8,
      Filter: 'FlateDecode',
      DecodeParms: { Predictor: 12, Colors: 3, Columns: w },
    });
    drawXObject(page, doc.context.register(stream), 0, 0, 595, 400);
    const codec = nodeCodec();
    const r = await compressPdf(await doc.save(), { codec });
    expect(r.images).toBe(1);
    // the decoded colours are the picture's: compare the average of the result with the original
    const back = (await images(r.bytes))[0];
    expect(back.filter).toBe('/DCTDecode');
    const out = (await PDFDocument.load(r.bytes)).context.lookup(back.ref) as PDFRawStream;
    const { decode } = await import('jpeg-js');
    const pixels = decode(out.contents, { useTArray: true }).data;
    const mean = (d: Uint8Array, step: number) => {
      let s = 0;
      for (let i = 0; i < d.length; i += step) s += d[i];
      return s / (d.length / step);
    };
    expect(Math.abs(mean(pixels, 4) - mean(px, 3))).toBeLessThan(3);
  });

  it('keeps drawings, charts and small logos lossless', async () => {
    const doc = await PDFDocument.create();
    const page = await textPage(doc);
    const [w, h] = [900, 600];
    const chart = new Uint8Array(w * h * 3).fill(255);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if ((x / 60) % 2 < 1 && y > h - (x % 300)) chart.set([30, 90, 200], (y * w + x) * 3);
    drawXObject(page, flateImage(doc, chart, w, h), 60, 300, 450, 300);
    const logo = await doc.embedJpg(encodeJpeg(photoPixels(120, 80), 120, 80));
    page.drawImage(logo, { x: 60, y: 700, width: 60, height: 40 });
    const r = await compressPdf(await doc.save(), { codec: nodeCodec() });
    expect(r.images).toBe(0);
    expect((await images(r.bytes)).map((i) => i.filter).sort()).toEqual(['/DCTDecode', '/FlateDecode']);
  });

  it('keeps the transparency of pictures with a soft mask', async () => {
    const doc = await PDFDocument.create();
    const page = await textPage(doc);
    const [w, h] = [800, 600];
    const mask = new Uint8Array(w * h);
    for (let i = 0; i < mask.length; i++) mask[i] = i % w < w / 2 ? 255 : 0;
    const smask = doc.context.register(
      doc.context.flateStream(mask, {
        Type: 'XObject',
        Subtype: 'Image',
        Width: w,
        Height: h,
        ColorSpace: 'DeviceGray',
        BitsPerComponent: 8,
      }),
    );
    const ref = flateImage(doc, photoPixels(w, h), w, h);
    (doc.context.lookup(ref) as PDFRawStream).dict.set(name('SMask'), smask);
    drawXObject(page, ref, 0, 0, 400, 300);
    const r = await compressPdf(await doc.save(), { codec: nodeCodec() });
    const all = await images(r.bytes);
    const photo = all.find((i) => i.smask)!;
    expect(photo.filter).toBe('/DCTDecode');
    // the mask is still there, lossless
    expect(all.find((i) => i.ref === photo.smask)).toMatchObject({ filter: '/FlateDecode', w: 800 });
  });

  it('keeps one copy of a picture repeated on every page', async () => {
    const doc = await PDFDocument.create();
    const logo = encodeJpeg(photoPixels(300, 200), 300, 200);
    for (let i = 0; i < 4; i++) {
      const page = await textPage(doc, `Pagina ${i + 1}`);
      // embedding again stores another copy, as some report generators do
      page.drawImage(await doc.embedJpg(logo), { x: 60, y: 600, width: 300, height: 200 });
    }
    const original = await doc.save();
    expect(await images(original)).toHaveLength(4);
    const r = await compressPdf(original, { codec: nodeCodec(), target: 10 * MB });
    expect(await images(r.bytes)).toHaveLength(1);
    expect((await read(r.bytes)).map((p) => p.pictures)).toEqual([1, 1, 1, 1]);
  });

  it('compresses drawings stored uncompressed and drops leftovers', async () => {
    const doc = await PDFDocument.create();
    const page = await textPage(doc);
    const lines = Array.from(
      { length: 2000 },
      (_, i) => `${i % 500} ${i % 700} m ${(i * 7) % 500} 10 l S`,
    ).join('\n');
    const raw = doc.context.register(doc.context.stream(lines));
    const contents = page.node.Contents();
    page.node.set(
      PDFName.of('Contents'),
      doc.context.obj([...(contents instanceof PDFArray ? contents.asArray() : []), raw]),
    );
    // data nothing refers to, and data only the program that made the file reads
    doc.context.register(doc.context.stream(new Uint8Array(200_000).fill(7)));
    doc.catalog.set(
      PDFName.of('PieceInfo'),
      doc.context.obj({ Illustrator: doc.context.register(doc.context.stream('x'.repeat(50_000))) }),
    );
    const original = await doc.save({ useObjectStreams: false });
    const r = await compressPdf(original, { codec: nodeCodec(), target: 10 * MB });
    expect(r.bytes.length).toBeLessThan(original.length / 10);
    const out = await PDFDocument.load(r.bytes);
    expect(out.catalog.has(PDFName.of('PieceInfo'))).toBe(false);
    const parts = out.getPage(0).node.Contents() as PDFArray;
    expect(
      (out.context.lookup(parts.get(parts.size() - 1)) as PDFRawStream).dict.get(PDFName.of('Filter')),
    ).toBe(PDFName.of('FlateDecode'));
    expect((await read(r.bytes))[0].text).toBe('Contrato de teste');
  });

  it('re-encodes pictures that spell out the default /Decode, and leaves inverted ones', async () => {
    const doc = await PDFDocument.create();
    const page = await textPage(doc);
    const [w, h] = [600, 400];
    for (const [i, decode] of [
      [0, 1, 0, 1, 0, 1],
      [1, 0, 1, 0, 1, 0],
    ].entries()) {
      const ref = flateImage(doc, photoPixels(w, h, i + 3), w, h);
      (doc.context.lookup(ref) as PDFRawStream).dict.set(name('Decode'), doc.context.obj(decode));
      drawXObject(page, ref, 0, i * 400, 595, 400);
    }
    const r = await compressPdf(await doc.save(), { codec: nodeCodec() });
    expect(r.images).toBe(1);
    expect(r.stuck).toBeGreaterThan(0);
    expect((await images(r.bytes)).map((i) => i.filter).sort()).toEqual(['/DCTDecode', '/FlateDecode']);
  });

  it('leaves pictures it cannot re-encode, and counts them', async () => {
    const doc = await PDFDocument.create();
    const page = await textPage(doc);
    // a CMYK JPEG: browsers don't decode those the way PDF viewers do
    const cmyk = doc.context.register(
      doc.context.stream(new Uint8Array(30_000).fill(1), {
        Type: 'XObject',
        Subtype: 'Image',
        Width: 500,
        Height: 400,
        ColorSpace: 'DeviceCMYK',
        BitsPerComponent: 8,
        Filter: 'DCTDecode',
      }),
    );
    drawXObject(page, cmyk, 0, 0, 500, 400);
    const r = await compressPdf(await doc.save(), { codec: nodeCodec() });
    expect(r.stuck).toBe(30_000);
    expect(r.images).toBe(0);
  });

  it('opens protected PDFs and hands back an unprotected one', async () => {
    const doc = await PDFDocument.load(await photoPdf('jpeg'));
    doc.encrypt({ userPassword: 'abc', ownerPassword: 'dono' });
    const locked = await doc.save();
    const r = await compressPdf(locked, { codec: nodeCodec(), password: 'abc' });
    expect(r.images).toBe(1);
    expect(await read(r.bytes)).toEqual([{ text: 'Contrato de teste', pictures: 1 }]);
  });

  it('keeps the form fields and the outline of the document', async () => {
    const doc = await PDFDocument.load(await photoPdf('jpeg'));
    const form = doc.getForm();
    form.createTextField('nome').addToPage(doc.getPage(0), { x: 60, y: 700, width: 200, height: 20 });
    form.getTextField('nome').setText('Maria');
    const r = await compressPdf(await doc.save(), { codec: nodeCodec() });
    const out = await PDFDocument.load(r.bytes);
    expect(out.getForm().getTextField('nome').getText()).toBe('Maria');
  });

  it('picks the picture size from where it is drawn, even inside a form XObject', async () => {
    const doc = await PDFDocument.create();
    const page = await textPage(doc);
    const img = await doc.embedJpg(encodeJpeg(photoPixels(1600, 1200), 1600, 1200, 95));
    // a form scaled by half draws the 1600×1200 picture at 288×216 pt
    const form = doc.context.register(
      doc.context.stream('q 576 0 0 432 0 0 cm /P Do Q', {
        Type: 'XObject',
        Subtype: 'Form',
        BBox: [0, 0, 576, 432],
        Matrix: [0.5, 0, 0, 0.5, 0, 0],
        Resources: { XObject: { P: img.ref } },
      }),
    );
    drawXObject(page, form, 100, 100, 1, 1);
    const r = await compressPdf(await doc.save(), { codec: nodeCodec() });
    // 288 pt = 4 inches, at 100 dpi = 400 px
    expect((await images(r.bytes))[0]).toMatchObject({ w: 400, h: 300 });
  });
});

describe('pages as pictures', () => {
  it('keeps the size and rotation of each page', async () => {
    const jpegA = encodeJpeg(photoPixels(124, 175), 124, 175);
    const out = await picturesPdf([
      { jpeg: jpegA, w: 595, h: 842, rot: 0 },
      { jpeg: jpegA, w: 842, h: 595, rot: 90 },
    ]);
    const doc = await PDFDocument.load(out);
    expect(doc.getPages().map((p) => [Math.round(p.getWidth()), p.getRotation().angle])).toEqual([
      [595, 0],
      [842, 90],
    ]);
    expect((await read(out)).map((p) => p.pictures)).toEqual([1, 1]);
  });
});
