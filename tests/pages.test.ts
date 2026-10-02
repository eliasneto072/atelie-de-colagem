import { describe, expect, it } from 'vitest';
import {
  PAPER,
  baseName,
  describePages,
  fitInPage,
  normalizeRotation,
  pageSizeFor,
  pagesIn,
  parseRanges,
  renderScale,
} from '../src/core/pages';

describe('parseRanges', () => {
  const ok = (text: string, max = 20) => {
    const r = parseRanges(text, max);
    if (!r.ok) throw new Error(r.error);
    return r.ranges.map((x) => [x.from, x.to]);
  };

  it('reads single pages and ranges', () => {
    expect(ok('1-3, 5, 8-10')).toEqual([
      [1, 3],
      [5, 5],
      [8, 10],
    ]);
  });

  it('accepts the ways people type it', () => {
    expect(ok('2 a 4; 6')).toEqual([
      [2, 4],
      [6, 6],
    ]);
    expect(ok('1–2 7')).toEqual([
      [1, 2],
      [7, 7],
    ]);
    expect(ok('3 até 5')).toEqual([[3, 5]]);
  });

  it('understands open ranges', () => {
    expect(ok('18-')).toEqual([[18, 20]]);
    expect(ok('-3')).toEqual([[1, 3]]);
  });

  it('turns reversed ranges around', () => {
    expect(ok('5-2')).toEqual([[2, 5]]);
  });

  it('explains what is wrong', () => {
    expect(parseRanges('', 5)).toEqual({ ok: false, error: expect.stringContaining('Digite') });
    expect(parseRanges('1-9', 5)).toEqual({ ok: false, error: 'A página 9 não existe: vai de 1 a 5.' });
    expect(parseRanges('0', 5)).toEqual({ ok: false, error: expect.stringContaining('não existe') });
    expect(parseRanges('abc', 5)).toEqual({ ok: false, error: expect.stringContaining('Não entendi "abc"') });
    expect(parseRanges('2', 1)).toEqual({ ok: false, error: 'Só existe a página 1.' });
  });
});

describe('pagesIn and describePages', () => {
  it('flattens ranges without repeats', () => {
    expect(
      pagesIn([
        { from: 3, to: 5 },
        { from: 1, to: 1 },
        { from: 4, to: 6 },
      ]),
    ).toEqual([1, 3, 4, 5, 6]);
  });
  it('writes a compact label', () => {
    expect(describePages([5, 1, 2, 3, 9, 10])).toBe('1-3, 5, 9-10');
    expect(describePages([])).toBe('');
  });
});

describe('pageSizeFor', () => {
  it('turns paper to landscape for landscape photos', () => {
    expect(pageSizeFor('a4', 3000, 2000)).toEqual({ w: PAPER.a4.h, h: PAPER.a4.w });
    expect(pageSizeFor('carta', 1000, 2000)).toEqual({ w: 612, h: 792 });
  });
  it('keeps the photo proportions in "foto" mode', () => {
    const s = pageSizeFor('foto', 4000, 3000);
    expect(s.w).toBeCloseTo(PAPER.a4.h);
    expect(s.w / s.h).toBeCloseTo(4 / 3);
  });
});

describe('fitInPage', () => {
  it('fits and centres inside the margin', () => {
    const r = fitInPage(600, 800, 1000, 500, 50);
    expect(r.w).toBeCloseTo(500);
    expect(r.h).toBeCloseTo(250);
    expect(r.x).toBeCloseTo(50);
    expect(r.y).toBeCloseTo(275);
  });
});

describe('renderScale', () => {
  it('uses the dpi when the image is small enough', () => {
    expect(renderScale(595, 842, 150)).toBeCloseTo(150 / 72);
  });
  it('shrinks huge pages below the pixel limit', () => {
    const k = renderScale(2384, 3370, 300); // A0
    expect(2384 * k * 3370 * k).toBeLessThanOrEqual(16_000_000 + 1);
  });
});

describe('normalizeRotation and baseName', () => {
  it('normalizes any multiple of 90', () => {
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(450)).toBe(90);
    expect(normalizeRotation(360)).toBe(0);
  });
  it('cleans file names', () => {
    expect(baseName('Contrato final.v2.pdf')).toBe('Contrato final.v2');
    expect(baseName('a/b:c.pdf')).toBe('a-b-c');
    expect(baseName('.pdf')).toBe('documento');
  });
});
