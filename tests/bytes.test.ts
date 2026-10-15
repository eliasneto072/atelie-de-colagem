import { describe, expect, it } from 'vitest';
import { formatSize, includesAscii } from '../src/core/bytes';

describe('includesAscii', () => {
  const bytes = new TextEncoder().encode('%PDF-1.7 /Type /Sig /ByteRange [0 10 20 30] /B');
  it('finds text inside binary data', () => {
    expect(includesAscii(bytes, '/ByteRange')).toBe(true);
    expect(includesAscii(bytes, '/B')).toBe(true);
    expect(includesAscii(bytes, '/ByteRanges')).toBe(false);
    expect(includesAscii(new Uint8Array([47, 66]), '/ByteRange')).toBe(false);
  });
});

describe('formatSize', () => {
  it.each([
    [312, '1 KB'],
    [780_000, '780 KB'],
    [999_000, '999 KB'],
    [1_000_000, '1 MB'],
    [1_600_000, '1,6 MB'],
    [1_960_000, '2 MB'],
    [2_000_000, '2 MB'],
    [3_210_952, '3,2 MB'],
    [12_340_000, '12,3 MB'],
    // just over a limit never reads as the limit
    [2_000_001, '2,01 MB'],
    [2_040_000, '2,04 MB'],
    [500_400, '501 KB'],
  ])('%i → %s', (n, text) => expect(formatSize(n)).toBe(text));
});
