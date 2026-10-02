import { PDFDocument } from '@cantoo/pdf-lib';
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { PAPER } from '../src/core/pages';
import { buildPdf, buildPdfs, zipFiles, type ImageSource, type PdfSource } from '../src/pdf/build';
import { makeEncryptedPdf, makePdf, makePng } from './pdfFixtures';

const opts = { pageSize: 'a4' as const, margin: 0 };
const widths = async (bytes: Uint8Array) =>
  (await PDFDocument.load(bytes)).getPages().map((p) => Math.round(p.getWidth()));
const rotations = async (bytes: Uint8Array) =>
  (await PDFDocument.load(bytes)).getPages().map((p) => p.getRotation().angle);

const pdfSource = async (id: number, pages: number, firstWidth: number): Promise<PdfSource> => ({
  kind: 'pdf',
  id,
  bytes: await makePdf(pages, { firstWidth }),
});

describe('buildPdf', () => {
  it('joins pages from several PDFs in the chosen order', async () => {
    const a = await pdfSource(1, 3, 300); // 300, 310, 320
    const b = await pdfSource(2, 2, 500); // 500, 510
    const out = await buildPdf(
      [
        { source: b, index: 1, rotation: 0 },
        { source: a, index: 0, rotation: 0 },
        { source: a, index: 2, rotation: 0 },
        { source: b, index: 0, rotation: 0 },
      ],
      opts,
    );
    expect(await widths(out)).toEqual([510, 300, 320, 500]);
  });

  it('adds the chosen rotation to the page’s own', async () => {
    const src: PdfSource = { kind: 'pdf', id: 1, bytes: await makePdf(2, { rotateFirst: 90 }) };
    const out = await buildPdf(
      [
        { source: src, index: 0, rotation: 270 },
        { source: src, index: 1, rotation: -90 },
      ],
      opts,
    );
    expect(await rotations(out)).toEqual([0, 270]);
  });

  it('places photos on A4 pages, turned to match the photo', async () => {
    const photo = (id: number, w: number, h: number): ImageSource => ({
      kind: 'image',
      id,
      encode: async () => ({ bytes: makePng(w, h), type: 'png', w, h }),
    });
    const out = await buildPdf(
      [
        { source: photo(1, 40, 30), index: 0, rotation: 0 },
        { source: photo(2, 30, 40), index: 0, rotation: 90 },
      ],
      { pageSize: 'a4', margin: 20 },
    );
    const doc = await PDFDocument.load(out);
    const [land, port] = doc.getPages();
    expect([land.getWidth(), land.getHeight()]).toEqual([PAPER.a4.h, PAPER.a4.w]);
    expect([port.getWidth(), port.getHeight()]).toEqual([PAPER.a4.w, PAPER.a4.h]);
    expect(port.getRotation().angle).toBe(90);
  });

  it('records the producer and title', async () => {
    const out = await buildPdf([{ source: await pdfSource(1, 1, 300), index: 0, rotation: 0 }], {
      ...opts,
      title: 'Contrato',
    });
    // updateMetadata: false, or loading would stamp pdf-lib's own producer over ours
    const doc = await PDFDocument.load(out, { updateMetadata: false });
    expect(doc.getTitle()).toBe('Contrato');
    expect(doc.getProducer()).toContain('Ateliê de Colagem');
  });
});

describe('buildPdfs', () => {
  it('splits into one file per group, reporting progress', async () => {
    const a = await pdfSource(1, 4, 300);
    const seen: number[] = [];
    const parts = await buildPdfs(
      [
        [0, 1].map((index) => ({ source: a, index, rotation: 0 })),
        [3].map((index) => ({ source: a, index, rotation: 0 })),
      ],
      { ...opts, onPage: (done) => seen.push(done) },
    );
    expect(parts).toHaveLength(2);
    expect(await widths(parts[0])).toEqual([300, 310]);
    expect(await widths(parts[1])).toEqual([330]);
    expect(seen).toEqual([1, 2, 3]);
  });
});

describe('protected PDFs', () => {
  it('opens files protected only against changes, without asking', async () => {
    const src: PdfSource = { kind: 'pdf', id: 1, bytes: await makeEncryptedPdf('') };
    const out = await buildPdf([{ source: src, index: 1, rotation: 0 }], opts);
    expect(await widths(out)).toEqual([310]);
  });

  it('uses the password the person typed, and the result has no password', async () => {
    const src: PdfSource = { kind: 'pdf', id: 1, bytes: await makeEncryptedPdf('1234'), password: '1234' };
    const out = await buildPdf([{ source: src, index: 0, rotation: 0 }], opts);
    const doc = await PDFDocument.load(out);
    expect(doc.isEncrypted).toBe(false);
    expect(doc.getPageCount()).toBe(1);
  });

  it('fails with a wrong password', async () => {
    const src: PdfSource = { kind: 'pdf', id: 1, bytes: await makeEncryptedPdf('1234'), password: '0000' };
    await expect(buildPdf([{ source: src, index: 0, rotation: 0 }], opts)).rejects.toThrow();
  });
});

describe('zipFiles', () => {
  it('stores every file and renames duplicates', () => {
    const z = zipFiles([
      { name: 'a.pdf', data: new Uint8Array([1]) },
      { name: 'a.pdf', data: new Uint8Array([2]) },
    ]);
    const files = unzipSync(z);
    expect(Object.keys(files).sort()).toEqual(['a-2.pdf', 'a.pdf']);
    expect([...files['a-2.pdf']]).toEqual([2]);
  });
});
