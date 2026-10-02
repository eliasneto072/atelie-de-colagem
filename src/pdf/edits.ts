/**
 * What people write over PDF pages: text, signatures, check marks, covers, redactions and
 * highlights, plus a watermark and page numbers for the whole file. Plain data, no DOM, so
 * the builder can draw it in Node too.
 *
 * Positions are in page space (see core/pages.ts): `x, y` is the point that shows at the
 * item's top-left corner, and `rot` is the page's rotation when it was placed, so the item
 * reads upright at that rotation and turns with the page if the page is turned later.
 */
import type { Rot } from '../core/pages';

interface Base {
  id: number;
  x: number;
  y: number;
  rot: Rot;
}

export interface TextEdit extends Base {
  kind: 'text';
  text: string;
  /** Font size in points. */
  size: number;
  color: string;
  bold: boolean;
}

/** A signature or initials: a transparent PNG. */
export interface Signature {
  id: number;
  png: Uint8Array;
  /** Object URL for showing it on screen. */
  url: string;
  /** Width / height. */
  aspect: number;
}

export interface ImageEdit extends Base {
  kind: 'image';
  /** Size in points along the item's own axes. */
  w: number;
  h: number;
  sig: Signature;
}

export interface MarkEdit extends Base {
  kind: 'mark';
  mark: 'check' | 'x' | 'dot';
  /** Side of the square the mark is drawn in, in points. */
  size: number;
  color: string;
}

export interface RectEdit extends Base {
  kind: 'rect';
  w: number;
  h: number;
  /**
   * redact: black, and what is underneath is removed (the page becomes a picture);
   * cover: an opaque box to write over; highlight: translucent marker.
   */
  style: 'redact' | 'cover' | 'highlight';
  color: string;
}

export type Edit = TextEdit | ImageEdit | MarkEdit | RectEdit;

export interface Watermark {
  text: string;
  /** 0–1 */
  opacity: number;
  color: string;
}

export interface Numbering {
  format: 'n' | 'n/N' | 'pagina';
  position: 'bottom-center' | 'bottom-right' | 'top-right';
  start: number;
  /** Leave the first page (a cover) without a number; it still counts. */
  skipFirst: boolean;
  size: number;
}

/** Text line height and where the first baseline sits, as multiples of the font size. */
export const LINE_HEIGHT = 1.2;
/** Baseline of the first line below the box top, for Helvetica / Liberation Sans at LINE_HEIGHT. */
export const FIRST_BASELINE = (LINE_HEIGHT - 1.117) / 2 + 0.905;

export const hasRedaction = (edits: readonly Edit[]): boolean =>
  edits.some((e) => e.kind === 'rect' && e.style === 'redact');

/** "#rrggbb" → [r, g, b] in 0–1. */
export function rgb01(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16) || 0;
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
