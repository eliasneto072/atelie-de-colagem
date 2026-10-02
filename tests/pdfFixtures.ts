/** Small PDFs and images built in memory for the PDF tests. */
import { PDFDocument, degrees } from '@cantoo/pdf-lib';
import { zlibSync } from 'fflate';

/** A PDF whose pages have distinct widths (300, 310, 320…), so their order can be checked. */
export async function makePdf(pages: number, opts: { firstWidth?: number; rotateFirst?: number } = {}) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([(opts.firstWidth ?? 300) + i * 10, 400]);
    page.drawText(`Pagina ${i + 1}`, { x: 20, y: 360, size: 18 });
  }
  if (opts.rotateFirst) doc.getPage(0).setRotation(degrees(opts.rotateFirst));
  return doc.save();
}

/** The same kind of PDF, encrypted. */
export async function makeEncryptedPdf(userPassword: string) {
  const doc = await PDFDocument.load(await makePdf(2));
  doc.encrypt({ userPassword, ownerPassword: 'dono-secreto' });
  return doc.save();
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (d: Uint8Array) => {
  let c = 0xffffffff;
  for (const b of d) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

/** A solid-colour RGB PNG of the given size. */
export function makePng(w: number, h: number, rgb: [number, number, number] = [200, 40, 40]): Uint8Array {
  const raw = new Uint8Array((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (w * 3 + 1);
    for (let x = 0; x < w; x++) raw.set(rgb, row + 1 + x * 3);
  }
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length);
    const v = new DataView(out.buffer);
    v.setUint32(0, data.length);
    out.set(new TextEncoder().encode(type), 4);
    out.set(data, 8);
    v.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
  };
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, w);
  v.setUint32(4, h);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlibSync(raw)),
    chunk('IEND', new Uint8Array()),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
