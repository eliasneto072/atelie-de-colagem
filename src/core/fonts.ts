/**
 * Recognising the fonts of a PDF so that new text matches what is already on the page.
 * Pure functions: the names and positions come from pdf.js, the pixels from a canvas.
 */

/**
 * Fonts the editor can write with. Each one has a PDF font (standard or embedded) and a web
 * font with the same widths for the screen:
 * - sans: Helvetica in the PDF (Arial's widths), Arimo on screen;
 * - serif: Times in the PDF (Times New Roman's widths), Tinos on screen;
 * - mono: Courier in the PDF, Cousine on screen;
 * - calibri: Carlito, made to match Calibri, embedded in the PDF and on screen.
 */
export type FontId = 'sans' | 'serif' | 'mono' | 'calibri';
export const FONT_IDS: readonly FontId[] = ['sans', 'serif', 'mono', 'calibri'];

/** How the font is called in the font menu. */
export const FONT_LABELS: Record<FontId, string> = {
  sans: 'Arial',
  serif: 'Times New Roman',
  mono: 'Courier',
  calibri: 'Calibri',
};

export interface TextStyle {
  font: FontId;
  bold: boolean;
  italic: boolean;
}

export interface DocFont extends TextStyle {
  /** The document's font, readable ("Times New Roman", "Aptos"). */
  family: string;
  /** True when the editor writes with this very font (or one with the same letter widths). */
  exact: boolean;
}

/** "BCDEEE+TimesNewRomanPS-BoldItalicMT" → { base: "TimesNewRoman", style: "BoldItalic" }. */
function splitName(name: string): { base: string; style: string } {
  const clean = name.replace(/^[A-Z]{6}\+/, '').trim();
  const [base = '', ...rest] = clean.split(/[-,]/);
  return { base: base.replace(/(PSMT|PS|MT)$/, ''), style: rest.join('') };
}

/** "TimesNewRoman" → "Times New Roman"; "SegoeUI" → "Segoe UI". */
function readable(base: string): string {
  return base
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .trim();
}

const RULES: [RegExp, FontId, RegExp | null][] = [
  // [what the name contains, our font, which of those count as the same font]
  [/calibri|carlito/, 'calibri', /calibri|carlito/],
  [
    /courier|cousine|mono|consol|menlo|inconsolata|typewriter/,
    'mono',
    /courier|cousine|liberationmono|nimbusmono/,
  ],
  [
    /arial|helvetica|arimo|liberationsans|nimbussans|freesans|sans/,
    'sans',
    /arial|helvetica|arimo|liberationsans|nimbussans/,
  ],
  [
    /times|tinos|liberationserif|nimbusrom|georgia|cambria|garamond|palatino|bookantiqua|bookman|century|minion|serif/,
    'serif',
    /times|tinos|liberationserif|nimbusrom/,
  ],
];

/**
 * The closest font the editor has, from the font's name in the PDF and what pdf.js knows
 * about it (bold, italic, and its generic family when the name says nothing).
 */
export function recognizeFont(
  name: string,
  flags: { bold?: boolean; italic?: boolean; black?: boolean; fallback?: string } = {},
): DocFont {
  const { base, style } = splitName(name);
  const key = base.toLowerCase().replace(/[^a-z]/g, '');
  const st = `${style} ${name.replace(/^[A-Z]{6}\+/, '')}`.toLowerCase();
  const bold = !!flags.bold || !!flags.black || /bold|black|heavy|semibold|demi|extrabold/.test(st);
  const italic = !!flags.italic || /italic|oblique|-it\b|,it\b/.test(st);
  for (const [has, font, same] of RULES) {
    if (has.test(key))
      return { font, bold, italic, family: readable(base) || name, exact: !!same?.test(key) };
  }
  const fb = (flags.fallback ?? '').toLowerCase();
  const font: FontId = fb.includes('mono') ? 'mono' : fb === 'serif' ? 'serif' : 'sans';
  return { font, bold, italic, family: readable(base) || name, exact: false };
}

/** A line of the document's text, as it reads on screen (page units, y grows down). */
export interface TextLine {
  /** Start of the baseline. */
  x: number;
  y: number;
  /** Length along the baseline. */
  w: number;
  /** Font size. */
  size: number;
  style: DocFont;
  /** "#rrggbb", when it could be read from the page. */
  color?: string;
}

/**
 * The document text whose style a click at (px, py) should take. `snap` is true when the
 * click is on that line (a blank after "Nome:", say), so the new text can sit on its baseline;
 * false when the line is only nearby, so only the style is taken.
 */
export function lineNear(
  lines: readonly TextLine[],
  px: number,
  py: number,
): { line: TextLine; snap: boolean } | null {
  let best: { line: TextLine; snap: boolean } | null = null;
  let bestScore = Infinity;
  for (const l of lines) {
    // giant numbers and titles are decoration, not a style to write in
    if (l.size > 48) continue;
    const top = l.y - l.size * 0.95;
    const bottom = l.y + l.size * 0.35;
    const gapX = px < l.x ? l.x - px : px > l.x + l.w ? px - (l.x + l.w) : 0;
    let score: number;
    let snap = false;
    if (py >= top && py <= bottom && gapX <= Math.max(150, l.size * 12)) {
      score = gapX + Math.abs(py - (l.y - l.size * 0.35)) * 0.5;
      snap = true;
    } else {
      const gapY = py < top ? top - py : py > bottom ? py - bottom : 0;
      if (gapY > Math.min(l.size * 3, 36) || gapX > 200) continue;
      score = 1000 + gapY * 4 + gapX;
    }
    if (score < bestScore) {
      bestScore = score;
      best = { line: l, snap };
    }
  }
  return best;
}

/**
 * The colour of the ink in a patch of a rendered page: the darkest pixels that clearly differ
 * from the paper. Near-black comes back as the editor's black, so the usual case stays plain.
 */
export function inkColor(data: Uint8ClampedArray | Uint8Array, black = '#111111'): string | undefined {
  const lum = (i: number) => 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  let paper = 0;
  for (let i = 0; i < data.length; i += 4) paper = Math.max(paper, lum(i));
  const ink: number[] = [];
  for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 0 && lum(i) < paper - 80) ink.push(i);
  if (ink.length < 6) return undefined;
  ink.sort((a, b) => lum(a) - lum(b));
  const take = ink.slice(0, Math.max(3, Math.round(ink.length * 0.3)));
  const avg = [0, 1, 2].map((c) => take.reduce((s, i) => s + data[i + c], 0) / take.length);
  const spread = Math.max(...avg) - Math.min(...avg);
  if (spread < 40 && Math.max(...avg) < 90) return black;
  return `#${avg.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}
