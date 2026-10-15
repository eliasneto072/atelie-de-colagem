/**
 * Reads a page's drawing instructions (its content stream) just far enough to know where
 * pictures are drawn and how big: the `Do` of each XObject with the transformation in force.
 * Compressing uses it to shrink a photo to the size it actually shows on the page.
 */

/** A PDF transformation [a b c d e f]: x' = a·x + c·y + e, y' = b·x + d·y + f. */
export type Matrix = [number, number, number, number, number, number];
export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** `m` applied first, then `n` (the PDF order: `cm` multiplies on the left). */
export function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[1] * n[2],
    m[0] * n[1] + m[1] * n[3],
    m[2] * n[0] + m[3] * n[2],
    m[2] * n[1] + m[3] * n[3],
    m[4] * n[0] + m[5] * n[2] + n[4],
    m[4] * n[1] + m[5] * n[3] + n[5],
  ];
}

/** Size in points of the unit square drawn with `m`: a picture's width and height on the page. */
export const drawnSize = (m: Matrix): { w: number; h: number } => ({
  w: Math.hypot(m[0], m[1]),
  h: Math.hypot(m[2], m[3]),
});

export interface Draw {
  /** The XObject's name in the resources, without the slash. */
  name: string;
  m: Matrix;
}

const WHITE = new Set([0, 9, 10, 12, 13, 32]);
const DELIM = new Set([40, 41, 60, 62, 91, 93, 123, 125, 47, 37]);
const isWhite = (c: number) => WHITE.has(c);
const isRegular = (c: number) => !WHITE.has(c) && !DELIM.has(c);

/** Every XObject drawn by this content, in order, with the transformation in force. */
export function xobjectDraws(content: Uint8Array, start: Matrix = IDENTITY): Draw[] {
  const draws: Draw[] = [];
  const stack: Matrix[] = [];
  let ctm = start;
  // operands since the last operator: numbers and names are all that matter here
  let operands: (number | string | null)[] = [];
  const n = content.length;
  let i = 0;
  while (i < n) {
    const c = content[i];
    if (isWhite(c)) {
      i++;
    } else if (c === 37) {
      // % comment, to the end of the line
      while (i < n && content[i] !== 10 && content[i] !== 13) i++;
    } else if (c === 40) {
      // (literal string), with nested parentheses and escapes
      let depth = 1;
      i++;
      while (i < n && depth > 0) {
        const d = content[i];
        if (d === 92) i++;
        else if (d === 40) depth++;
        else if (d === 41) depth--;
        i++;
      }
      operands.push(null);
    } else if (c === 60) {
      if (content[i + 1] === 60)
        i += 2; // << starts a dictionary (inline image or marked content)
      else {
        // <hex string>
        while (i < n && content[i] !== 62) i++;
        i++;
        operands.push(null);
      }
    } else if (c === 62) {
      i += content[i + 1] === 62 ? 2 : 1;
    } else if (c === 91 || c === 93 || c === 123 || c === 125 || c === 41) {
      i++;
    } else if (c === 47) {
      // /Name
      let j = i + 1;
      while (j < n && isRegular(content[j])) j++;
      operands.push(
        j - i <= 128
          ? String.fromCharCode(...content.subarray(i + 1, j)).replace(/#([0-9a-f]{2})/gi, (_, h: string) =>
              String.fromCharCode(parseInt(h, 16)),
            )
          : null,
      );
      i = j;
    } else {
      let j = i;
      while (j < n && isRegular(content[j])) j++;
      // operators and numbers are short: a long run is stray data, read as an unknown operator
      const word = j - i <= 32 ? String.fromCharCode(...content.subarray(i, j)) : '';
      i = j;
      if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(word)) {
        operands.push(Number(word));
        continue;
      }
      switch (word) {
        case 'q':
          stack.push(ctm);
          break;
        case 'Q':
          ctm = stack.pop() ?? ctm;
          break;
        case 'cm': {
          const v = operands.slice(-6);
          if (v.length === 6 && v.every((x) => typeof x === 'number' && Number.isFinite(x)))
            ctm = multiply(v as Matrix, ctm);
          break;
        }
        case 'Do': {
          const name = operands[operands.length - 1];
          if (typeof name === 'string') draws.push({ name, m: ctm });
          break;
        }
        case 'ID':
          // inline image data: skip to the EI that ends it (whitespace, EI, then whitespace or the end)
          i++;
          while (
            i < n &&
            !(
              isWhite(content[i - 1]) &&
              content[i] === 69 &&
              content[i + 1] === 73 &&
              (i + 2 >= n || isWhite(content[i + 2]))
            )
          )
            i++;
          i += 2;
          break;
        case 'true':
        case 'false':
        case 'null':
          operands.push(null);
          continue;
      }
      operands = [];
    }
  }
  return draws;
}
