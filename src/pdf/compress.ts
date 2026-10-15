/**
 * Making a PDF smaller while the text stays text: photos and scanned pages are re-encoded as
 * JPEG at the size they show on the page, and the rest is cleaned up without loss (repeated
 * files kept once, uncompressed parts compressed, leftovers dropped). When even that is too
 * big, the pages can become pictures (`picturesPdf`). Runs in Node for the tests; the
 * browser supplies the JPEG encoder (a canvas).
 */
import {
  PDFArray,
  PDFDict,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
  PDFStream,
  PDFString,
  PDFDocument,
  decodePDFRawStream,
  degrees,
  type PDFContext,
  type PDFObject,
} from '@cantoo/pdf-lib';
import { zlibSync } from 'fflate';
import { loadForCopy, PRODUCER } from './build';
import { drawnSize, IDENTITY, multiply, xobjectDraws, type Matrix } from './contentScan';

// ---- the encoder the caller supplies ----

/** A JPEG as it is stored in the PDF. */
export interface JpegSource {
  kind: 'jpeg';
  bytes: Uint8Array;
  w: number;
  h: number;
}

/** Decoded pixels, one or three bytes each. */
export interface PixelSource {
  kind: 'pixels';
  data: Uint8Array;
  w: number;
  h: number;
  channels: 1 | 3;
}

export type PictureSource = JpegSource | PixelSource;

export interface JpegTarget {
  w: number;
  h: number;
  /** 0 to 1, as for canvas.toBlob. */
  quality: number;
}

export interface Codec {
  /** Decode the picture once and make one JPEG per target, in order (null where it can't). */
  jpegs(src: PictureSource, targets: readonly JpegTarget[]): Promise<(Uint8Array | null)[]>;
}

// ---- how hard to compress ----

export interface Level {
  /** Resolution the pictures keep, at the size they show on the page. */
  dpi: number;
  quality: number;
}

/** Pictures inside the PDF, lightest first. Even the last keeps scanned text readable. */
export const IMAGE_LEVELS: readonly Level[] = [
  { dpi: 200, quality: 0.8 },
  { dpi: 150, quality: 0.72 },
  { dpi: 125, quality: 0.64 },
  { dpi: 110, quality: 0.56 },
  { dpi: 100, quality: 0.5 },
];

/** Whole pages turned into pictures, lightest first. */
export const PAGE_LEVELS: readonly Level[] = [
  { dpi: 150, quality: 0.7 },
  { dpi: 120, quality: 0.6 },
  { dpi: 100, quality: 0.52 },
  { dpi: 85, quality: 0.45 },
  { dpi: 72, quality: 0.4 },
];

/** Pictures smaller than this are logos and icons: not worth touching. */
const MIN_PIXELS = 40_000;
const MIN_BYTES = 8_000;
/** A new JPEG must save at least this much to replace a picture. */
const WORTH = 0.9;

const N = (s: string) => PDFName.of(s);
const IMAGE = N('Image');
const FORM = N('Form');
const XOBJECT = N('XObject');
const FILTER = N('Filter');
const DECODE_PARMS = N('DecodeParms');
const DCT = N('DCTDecode');
const FLATE = N('FlateDecode');
const SKIP_TYPES = new Set([N('XRef'), N('ObjStm'), N('Metadata')]);
/** Filters pdf-lib can undo; anything else (JPEG 2000, JBIG2, fax) is left as it is. */
const LOSSLESS = new Set(['FlateDecode', 'LZWDecode', 'ASCII85Decode', 'ASCIIHexDecode', 'RunLengthDecode']);

// ---- reading JPEGs and pixels ----

/** Size and colour channels of a JPEG the browser can decode (baseline or progressive, 8 bits). */
export function jpegInfo(b: Uint8Array): { w: number; h: number; channels: number } | null {
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    if (marker === 0xff) {
      i++;
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      i += 2;
      continue;
    }
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      if (b[i + 4] !== 8) return null;
      return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8], channels: b[i + 9] };
    }
    // other frame types (lossless, arithmetic, 12-bit) or data before any frame
    if (
      (marker >= 0xc3 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) ||
      marker === 0xda
    )
      return null;
    i += 2 + ((b[i + 2] << 8) | b[i + 3]);
  }
  return null;
}

/**
 * The JPEG without its EXIF block. Browsers turn photos by the EXIF orientation when they
 * decode them, but PDF viewers don't: re-encoding would rotate the picture on the page.
 */
export function withoutExif(b: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [b.subarray(0, 2)];
  let i = 2;
  let dropped = false;
  while (i + 4 <= b.length && b[i] === 0xff) {
    const marker = b[i + 1];
    // the image data starts here: the rest is kept as it is
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0xff || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      parts.push(b.subarray(i, i + (marker === 0xff ? 1 : 2)));
      i += marker === 0xff ? 1 : 2;
      continue;
    }
    const end = i + 2 + ((b[i + 2] << 8) | b[i + 3]);
    const exif =
      marker === 0xe1 && b[i + 4] === 0x45 && b[i + 5] === 0x78 && b[i + 6] === 0x69 && b[i + 7] === 0x66;
    if (exif) dropped = true;
    else parts.push(b.subarray(i, end));
    i = end;
  }
  if (!dropped) return b;
  parts.push(b.subarray(i));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** Undo PNG (10–15) and TIFF (2) predictors. Null when the data doesn't fit them. */
export function unpredict(
  data: Uint8Array,
  predictor: number,
  colors: number,
  bpc: number,
  columns: number,
): Uint8Array | null {
  if (predictor <= 1) return data;
  const bpp = Math.max(1, Math.ceil((colors * bpc) / 8));
  const row = Math.ceil((colors * bpc * columns) / 8);
  if (predictor === 2) {
    if (bpc !== 8) return null;
    const out = data.slice();
    for (let r = 0; r + row <= out.length; r += row)
      for (let i = bpp; i < row; i++) out[r + i] = (out[r + i] + out[r + i - bpp]) & 255;
    return out;
  }
  if (predictor < 10) return null;
  const rows = Math.floor(data.length / (row + 1));
  const out = new Uint8Array(rows * row);
  let prev = new Uint8Array(row);
  for (let r = 0; r < rows; r++) {
    const type = data[r * (row + 1)];
    const src = data.subarray(r * (row + 1) + 1, (r + 1) * (row + 1));
    const cur = out.subarray(r * row, (r + 1) * row);
    for (let i = 0; i < row; i++) {
      const left = i >= bpp ? cur[i - bpp] : 0;
      const up = prev[i];
      const ul = i >= bpp ? prev[i - bpp] : 0;
      let v: number;
      switch (type) {
        case 0:
          v = 0;
          break;
        case 1:
          v = left;
          break;
        case 2:
          v = up;
          break;
        case 3:
          v = (left + up) >> 1;
          break;
        case 4: {
          const p = left + up - ul;
          const pa = Math.abs(p - left),
            pb = Math.abs(p - up),
            pc = Math.abs(p - ul);
          v = pa <= pb && pa <= pc ? left : pb <= pc ? up : ul;
          break;
        }
        default:
          return null;
      }
      cur[i] = (src[i] + v) & 255;
    }
    prev = cur;
  }
  return out;
}

/** Few colours means a drawing, a logo or a chart: JPEG would smear its edges. */
export function fewColors(data: Uint8Array, channels: number, limit = 64): boolean {
  const px = Math.floor(data.length / channels);
  const step = Math.max(1, Math.floor(px / 60_000));
  const seen = new Set<number>();
  for (let p = 0; p < px; p += step) {
    const i = p * channels;
    seen.add(channels === 1 ? data[i] : (data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
    if (seen.size > limit) return false;
  }
  return true;
}

type Color = { n: 1 | 3; out: PDFObject } | { n: 1 | 3; out: PDFObject; palette: Uint8Array; hival: number };

const DEVICE_RGB = N('DeviceRGB');

/** The colours of a picture, if they can go into a JPEG; and the ColorSpace the JPEG gets. */
function colorOf(ctx: PDFContext, raw: PDFObject | undefined, nested = false): Color | null {
  const cs = raw instanceof PDFRef ? ctx.lookup(raw) : raw;
  if (cs instanceof PDFName) {
    if (cs === N('DeviceGray')) return { n: 1, out: DEVICE_RGB };
    if (cs === DEVICE_RGB) return { n: 3, out: raw! };
    return null;
  }
  if (!(cs instanceof PDFArray) || cs.size() < 1) return null;
  const family = cs.lookup(0);
  if (family === N('CalGray')) return { n: 1, out: DEVICE_RGB };
  if (family === N('CalRGB')) return { n: 3, out: raw! };
  if (family === N('ICCBased')) {
    const profile = cs.lookup(1);
    const n = profile instanceof PDFStream ? profile.dict.lookup(N('N')) : undefined;
    if (!(n instanceof PDFNumber)) return null;
    if (n.asNumber() === 1) return { n: 1, out: DEVICE_RGB };
    if (n.asNumber() === 3) return { n: 3, out: raw! };
    return null;
  }
  if (family === N('Indexed') && !nested && cs.size() === 4) {
    const base = colorOf(ctx, cs.get(1), true);
    const hival = cs.lookup(2);
    const table = cs.lookup(3);
    if (!base || 'palette' in base || !(hival instanceof PDFNumber)) return null;
    let palette: Uint8Array;
    if (table instanceof PDFString || table instanceof PDFHexString) palette = table.asBytes();
    else if (table instanceof PDFRawStream) palette = decodePDFRawStream(table).decode();
    else return null;
    const h = Math.round(hival.asNumber());
    if (h < 0 || h > 255 || palette.length < (h + 1) * base.n) return null;
    return { n: base.n, out: base.n === 3 ? cs.get(1) : DEVICE_RGB, palette, hival: h };
  }
  return null;
}

const filtersOf = (dict: PDFDict): string[] | null => {
  const f = dict.lookup(FILTER);
  if (f === undefined) return [];
  if (f instanceof PDFName) return [f.decodeText()];
  if (f instanceof PDFArray) {
    const names = f.asArray().map((x) => (x instanceof PDFName ? x.decodeText() : ''));
    return names.includes('') ? null : names;
  }
  return null;
};

const num = (dict: PDFDict | undefined, key: string, fallback: number): number => {
  const v = dict?.lookup(N(key));
  return v instanceof PDFNumber ? v.asNumber() : fallback;
};

/** Decoded pixels of a losslessly stored picture, as gray or RGB. */
function readPixels(stream: PDFRawStream, w: number, h: number, color: Color): PixelSource | null {
  const dict = stream.dict;
  const bpc = num(dict, 'BitsPerComponent', 8);
  const indexed = 'palette' in color;
  if (!indexed && bpc !== 8) return null;
  if (indexed && ![1, 2, 4, 8].includes(bpc)) return null;
  let parms = dict.lookup(DECODE_PARMS);
  if (parms instanceof PDFArray) parms = parms.lookup(parms.size() - 1);
  const p = parms instanceof PDFDict ? parms : undefined;
  let data: Uint8Array | null = decodePDFRawStream(stream).decode();
  data = unpredict(
    data,
    num(p, 'Predictor', 1),
    num(p, 'Colors', 1),
    num(p, 'BitsPerComponent', 8),
    num(p, 'Columns', 1),
  );
  if (!data) return null;
  const n = color.n;
  if (!indexed) {
    if (data.length < w * h * n) return null;
    data = data.subarray(0, w * h * n);
  } else {
    const row = Math.ceil((w * bpc) / 8);
    if (data.length < row * h) return null;
    const out = new Uint8Array(w * h * n);
    const mask = (1 << bpc) - 1;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const bit = x * bpc;
        let ix = (data[y * row + (bit >> 3)] >> (8 - bpc - (bit & 7))) & mask;
        if (ix > color.hival) ix = color.hival;
        for (let c = 0; c < n; c++) out[(y * w + x) * n + c] = color.palette[ix * n + c];
      }
    data = out;
  }
  if (fewColors(data, n)) return null;
  return { kind: 'pixels', data, w, h, channels: n };
}

// ---- where pictures show, and how big ----

const asMatrix = (o: PDFObject | undefined): Matrix | null => {
  if (!(o instanceof PDFArray) || o.size() !== 6) return null;
  const v = o.asArray().map((x) => (x instanceof PDFNumber ? x.asNumber() : NaN));
  return v.every(Number.isFinite) ? (v as Matrix) : null;
};

/** The largest size, in inches, at which each picture is drawn on the pages. */
function drawnSizes(doc: PDFDocument): Map<PDFRef, { w: number; h: number }> {
  const ctx = doc.context;
  const sizes = new Map<PDFRef, { w: number; h: number }>();
  const decoded = new Map<PDFRawStream, Uint8Array>();
  const read = (s: PDFRawStream) => {
    let d = decoded.get(s);
    if (!d) decoded.set(s, (d = decodePDFRawStream(s).decode()));
    return d;
  };
  const visit = (content: Uint8Array, res: PDFDict | undefined, m: Matrix, path: readonly PDFRef[]) => {
    const names = res?.lookupMaybe(XOBJECT, PDFDict);
    if (!names) return;
    for (const d of xobjectDraws(content, m)) {
      const ref = names.get(N(d.name));
      if (!(ref instanceof PDFRef)) continue;
      const obj = ctx.lookup(ref);
      if (!(obj instanceof PDFRawStream)) continue;
      const subtype = obj.dict.lookup(N('Subtype'));
      if (subtype === IMAGE) {
        const s = drawnSize(d.m);
        const old = sizes.get(ref);
        sizes.set(ref, { w: Math.max(old?.w ?? 0, s.w / 72), h: Math.max(old?.h ?? 0, s.h / 72) });
      } else if (subtype === FORM && path.length < 8 && !path.includes(ref)) {
        const fm = asMatrix(obj.dict.lookup(N('Matrix'))) ?? IDENTITY;
        const fres = obj.dict.lookupMaybe(N('Resources'), PDFDict) ?? res;
        visit(read(obj), fres, multiply(fm, d.m), [...path, ref]);
      }
    }
  };
  for (const page of doc.getPages()) {
    try {
      const c = page.node.Contents();
      const parts = c instanceof PDFArray ? c.asArray().map((x) => ctx.lookup(x)) : [c];
      const streams = parts.filter((s): s is PDFRawStream => s instanceof PDFRawStream).map(read);
      const all = new Uint8Array(streams.reduce((n, s) => n + s.length + 1, 0));
      let at = 0;
      for (const s of streams) {
        all.set(s, at);
        all[at + s.length] = 10;
        at += s.length + 1;
      }
      visit(all, page.node.Resources(), IDENTITY, []);
    } catch {
      // a page that can't be read keeps its pictures at the page-size estimate
    }
  }
  return sizes;
}

// ---- the pictures that can be re-encoded ----

interface Candidate {
  ref: PDFRef;
  original: PDFRawStream;
  w: number;
  h: number;
  /** Largest size drawn, in inches, or null when it isn't known. */
  inches: { w: number; h: number } | null;
  out: PDFObject;
  read: () => PictureSource | null;
  /** The JPEG used at each level (null keeps the original). */
  chosen: (Uint8Array | null)[];
}

function findImages(doc: PDFDocument): { candidates: Candidate[]; stuck: number } {
  const ctx = doc.context;
  const images: [PDFRef, PDFRawStream][] = [];
  const masks = new Set<PDFRef>();
  for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream) || obj.dict.lookup(N('Subtype')) !== IMAGE) continue;
    images.push([ref, obj]);
    for (const k of ['SMask', 'Mask']) {
      const v = obj.dict.get(N(k));
      if (v instanceof PDFRef) masks.add(v);
    }
  }
  const sizes = drawnSizes(doc);
  const candidates: Candidate[] = [];
  let stuck = 0;
  for (const [ref, stream] of images) {
    if (masks.has(ref)) continue;
    const dict = stream.dict;
    const w = num(dict, 'Width', 0),
      h = num(dict, 'Height', 0);
    const len = stream.contents.length;
    if (w * h < MIN_PIXELS || len < MIN_BYTES) continue;
    const c = check(ctx, stream, w, h);
    if (!c) {
      stuck += len;
      continue;
    }
    candidates.push({ ref, original: stream, w, h, inches: sizes.get(ref) ?? null, ...c, chosen: [] });
  }
  return { candidates, stuck };
}

/** Whether a picture can be re-encoded, and how to read it. */
function check(
  ctx: PDFContext,
  stream: PDFRawStream,
  w: number,
  h: number,
): { out: PDFObject; read: () => PictureSource | null } | null {
  const dict = stream.dict;
  if (dict.lookup(N('ImageMask'))?.toString() === 'true') return null;
  if (dict.lookup(N('Mask')) instanceof PDFArray) return null; // colour-key transparency needs exact colours
  const smask = dict.lookup(N('SMask'));
  if (smask instanceof PDFStream && smask.dict.has(N('Matte'))) return null;
  const filters = filtersOf(dict);
  if (!filters) return null;
  const color = colorOf(ctx, dict.get(N('ColorSpace')));
  if (!color) return null;
  // an inverted or remapped picture would need its pixels rewritten: only the default is fine
  const decode = dict.lookup(N('Decode'));
  if (decode !== undefined) {
    const v =
      decode instanceof PDFArray
        ? decode.asArray().map((x) => (x instanceof PDFNumber ? x.asNumber() : NaN))
        : [];
    const max = 'palette' in color ? 2 ** num(dict, 'BitsPerComponent', 8) - 1 : 1;
    const pairs = 'palette' in color ? 1 : color.n;
    if (v.length !== pairs * 2 || v.some((x, i) => x !== (i % 2 ? max : 0))) return null;
  }
  if (filters.length === 1 && filters[0] === 'DCTDecode') {
    if ('palette' in color) return null;
    const parms = dict.lookup(DECODE_PARMS);
    if (parms instanceof PDFDict && parms.has(N('ColorTransform'))) return null;
    const info = jpegInfo(stream.contents);
    if (!info || info.w !== w || info.h !== h || info.channels !== color.n) return null;
    return { out: color.out, read: () => ({ kind: 'jpeg', bytes: withoutExif(stream.contents), w, h }) };
  }
  if (!filters.every((f) => LOSSLESS.has(f))) return null;
  return {
    out: color.out,
    read: () => {
      try {
        return readPixels(stream, w, h, color);
      } catch {
        return null;
      }
    },
  };
}

/** Pixel size of a picture at a level: what it needs at the size it shows, never more than it has. */
function sizeAt(c: Candidate, dpi: number, pageInches: number): { w: number; h: number } {
  let s = c.inches
    ? Math.max((c.inches.w * dpi) / c.w, (c.inches.h * dpi) / c.h)
    : (pageInches * dpi) / Math.max(c.w, c.h);
  // barely smaller isn't worth the blur of resampling
  if (s > 0.92) s = 1;
  const w = Math.max(1, Math.round(c.w * s)),
    h = Math.max(1, Math.round(c.h * s));
  // pictures drawn tiny still keep a few pixels
  const k = Math.max(w, h) < 24 ? 24 / Math.max(w, h) : 1;
  return { w: Math.min(c.w, Math.round(w * k)), h: Math.min(c.h, Math.round(h * k)) };
}

function jpegStream(ctx: PDFContext, c: Candidate, jpeg: Uint8Array): PDFRawStream {
  const info = jpegInfo(jpeg)!;
  const dict = ctx.obj({});
  const drop = new Set([
    'Length',
    'Filter',
    'DecodeParms',
    'Width',
    'Height',
    'ColorSpace',
    'BitsPerComponent',
    'Decode',
  ]);
  for (const [k, v] of c.original.dict.entries()) if (!drop.has(k.decodeText())) dict.set(k, v);
  dict.set(N('Width'), PDFNumber.of(info.w));
  dict.set(N('Height'), PDFNumber.of(info.h));
  dict.set(N('BitsPerComponent'), PDFNumber.of(8));
  dict.set(N('ColorSpace'), c.out);
  dict.set(FILTER, DCT);
  return PDFRawStream.of(dict, jpeg);
}

// ---- lossless clean-up ----

function fnv(b: Uint8Array): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < b.length; i++) h = Math.imul(h ^ b[i], 0x01000193);
  return h >>> 0;
}

const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);

function replaceRefs(o: PDFObject, map: Map<PDFRef, PDFRef>): void {
  if (o instanceof PDFDict) {
    for (const [k, v] of o.entries()) {
      const to = v instanceof PDFRef ? map.get(v) : undefined;
      if (to) o.set(k, to);
      else replaceRefs(v, map);
    }
  } else if (o instanceof PDFArray) {
    for (let i = 0; i < o.size(); i++) {
      const v = o.get(i);
      const to = v instanceof PDFRef ? map.get(v) : undefined;
      if (to) o.set(i, to);
      else replaceRefs(v, map);
    }
  } else if (o instanceof PDFStream) replaceRefs(o.dict, map);
}

/** The same picture or font stored many times (a logo on every page) is kept once. */
function dedupe(ctx: PDFContext): number {
  const seen = new Map<string, [PDFRef, PDFRawStream][]>();
  const map = new Map<PDFRef, PDFRef>();
  for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream) || obj.contents.length < 512) continue;
    if (SKIP_TYPES.has(obj.dict.lookup(N('Type')) as PDFName)) continue;
    const dictKey = obj.dict
      .entries()
      .filter(([k]) => k !== PDFName.Length)
      .map(([k, v]) => `${k.toString()} ${v.toString()}`)
      .sort()
      .join(' ');
    const key = `${obj.contents.length}:${fnv(obj.contents)}:${dictKey}`;
    const list = seen.get(key) ?? [];
    const same = list.find(([, o]) => sameBytes(o.contents, obj.contents));
    if (same) map.set(ref, same[0]);
    else seen.set(key, [...list, [ref, obj]]);
  }
  if (!map.size) return 0;
  for (const [, obj] of ctx.enumerateIndirectObjects()) replaceRefs(obj, map);
  return map.size;
}

/** Streams stored without compression (drawings, fonts, some pictures) get compressed. */
function compressStreams(ctx: PDFContext): void {
  for (const [, obj] of ctx.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream) || obj.contents.length < 64 || obj.dict.has(FILTER)) continue;
    if (SKIP_TYPES.has(obj.dict.lookup(N('Type')) as PDFName)) continue;
    const z = zlibSync(obj.contents, { level: 9 });
    if (z.length >= obj.contents.length - 16) continue;
    obj.updateContents(z);
    obj.dict.set(FILTER, FLATE);
    obj.dict.delete(DECODE_PARMS);
  }
}

/** Objects nothing points to any more (old versions of edited files, replaced copies). */
function collectGarbage(ctx: PDFContext): void {
  const live = new Set<PDFRef>();
  const todo: PDFObject[] = [];
  for (const r of [ctx.trailerInfo.Root, ctx.trailerInfo.Info]) if (r) todo.push(r);
  while (todo.length) {
    const o = todo.pop()!;
    if (o instanceof PDFRef) {
      if (live.has(o)) continue;
      live.add(o);
      const v = ctx.lookup(o);
      if (v) todo.push(v);
    } else if (o instanceof PDFDict) todo.push(...o.values());
    else if (o instanceof PDFArray) todo.push(...o.asArray());
    else if (o instanceof PDFStream) todo.push(o.dict);
  }
  for (const [ref] of ctx.enumerateIndirectObjects()) if (!live.has(ref)) ctx.delete(ref);
}

function cleanUp(doc: PDFDocument): void {
  // data only the program that made the file reads (Illustrator keeps a whole copy there)
  doc.catalog.delete(N('PieceInfo'));
  for (const page of doc.getPages()) {
    page.node.delete(N('PieceInfo'));
    page.node.delete(N('Thumb'));
  }
  const ctx = doc.context;
  // twice: pictures that only differed by pointing to two copies of the same mask now match
  if (dedupe(ctx)) dedupe(ctx);
  compressStreams(ctx);
  collectGarbage(ctx);
}

// ---- putting it together ----

export interface CompressOptions {
  codec: Codec;
  /** Largest size wanted, in bytes. Without one, it goes as small as the levels allow. */
  target?: number;
  password?: string;
  /** Pictures re-encoded so far. */
  onProgress?: (done: number, total: number) => void;
}

export interface CompressResult {
  bytes: Uint8Array;
  /** Within the target (always true without one). */
  fits: boolean;
  /** Pictures re-encoded. */
  images: number;
  /**
   * Bytes of pictures in formats that can't be re-encoded here (JPEG 2000, CMYK, faxes):
   * only turning the pages into pictures shrinks those.
   */
  stuck: number;
}

const SAVE = { useObjectStreams: true, addDefaultPage: false, updateFieldAppearances: false } as const;

export async function compressPdf(bytes: Uint8Array, opts: CompressOptions): Promise<CompressResult> {
  const doc = await loadForCopy({ kind: 'pdf', id: 0, bytes, password: opts.password });
  const ctx = doc.context;
  cleanUp(doc);
  const { candidates, stuck } = findImages(doc);
  const pageInches = Math.max(1, ...doc.getPages().map((p) => Math.max(p.getWidth(), p.getHeight()) / 72));

  for (const [k, c] of candidates.entries()) {
    const src = c.read();
    let made: (Uint8Array | null)[] = [];
    if (src) {
      try {
        made = await opts.codec.jpegs(
          src,
          IMAGE_LEVELS.map((l) => ({ ...sizeAt(c, l.dpi, pageInches), quality: l.quality })),
        );
      } catch {
        made = [];
      }
    }
    // each level uses the smallest JPEG so far, so a stronger level is never bigger
    let best: Uint8Array | null = null;
    c.chosen = IMAGE_LEVELS.map((_, l) => {
      const m = made[l];
      if (m && jpegInfo(m) && m.length < (best?.length ?? c.original.contents.length * WORTH)) best = m;
      return best;
    });
    opts.onProgress?.(k + 1, candidates.length);
  }

  const build = async (level: number) => {
    for (const c of candidates) {
      const jpeg = level >= 0 ? c.chosen[level] : null;
      ctx.assign(c.ref, jpeg ? jpegStream(ctx, c, jpeg) : c.original);
    }
    return doc.save(SAVE);
  };
  const result = (out: Uint8Array, level: number): CompressResult => {
    // never hand back something bigger than what came in
    const smaller = out.length < bytes.length ? out : bytes;
    return {
      bytes: smaller,
      fits: opts.target === undefined || smaller.length <= opts.target,
      images: smaller === out && level >= 0 ? candidates.filter((c) => c.chosen[level]).length : 0,
      stuck,
    };
  };

  const last = IMAGE_LEVELS.length - 1;
  const target = opts.target;
  if (target === undefined) return result(await build(last), last);
  const lossless = await build(-1);
  if (lossless.length <= target) return result(lossless, -1);
  // estimate each level from the bytes the pictures save, then check the real size
  const saved = IMAGE_LEVELS.map((_, l) =>
    candidates.reduce((s, c) => s + (c.chosen[l] ? c.original.contents.length - c.chosen[l]!.length : 0), 0),
  );
  let level = saved.findIndex((s) => lossless.length - s <= target);
  if (level < 0) level = last;
  for (;;) {
    const out = await build(level);
    if (out.length <= target || level === last) return result(out, level);
    level++;
  }
}

/** A PDF of whole pages as pictures, each the size and rotation of the original page. */
export async function picturesPdf(
  pages: readonly { jpeg: Uint8Array; w: number; h: number; rot: number }[],
  title?: string,
): Promise<Uint8Array> {
  const out = await PDFDocument.create({ updateMetadata: false });
  out.setProducer(PRODUCER);
  out.setCreator(PRODUCER);
  if (title) out.setTitle(title);
  for (const p of pages) {
    const page = out.addPage([p.w, p.h]);
    page.drawImage(await out.embedJpg(p.jpeg), { x: 0, y: 0, width: p.w, height: p.h });
    if (p.rot) page.setRotation(degrees(p.rot));
  }
  return out.save({ useObjectStreams: true });
}
