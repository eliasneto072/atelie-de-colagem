/**
 * The fonts "Editar e assinar" writes with, as files: web fonts for the screen (same letter
 * widths as the PDF fonts) and Carlito for embedding in the PDF. They load the first time a
 * text uses them, and go to assets/pdf/ so only the PDF page keeps them for offline use.
 */
import type { FontId } from '../core/fonts';
import type { FontFileLoader } from './draw';
import { firstBaseline, LINE_HEIGHT } from './edits';

import arimo400 from '@fontsource/arimo/files/arimo-latin-400-normal.woff2?url';
import arimo400i from '@fontsource/arimo/files/arimo-latin-400-italic.woff2?url';
import arimo700 from '@fontsource/arimo/files/arimo-latin-700-normal.woff2?url';
import arimo700i from '@fontsource/arimo/files/arimo-latin-700-italic.woff2?url';
import tinos400 from '@fontsource/tinos/files/tinos-latin-400-normal.woff2?url';
import tinos400i from '@fontsource/tinos/files/tinos-latin-400-italic.woff2?url';
import tinos700 from '@fontsource/tinos/files/tinos-latin-700-normal.woff2?url';
import tinos700i from '@fontsource/tinos/files/tinos-latin-700-italic.woff2?url';
import cousine400 from '@fontsource/cousine/files/cousine-latin-400-normal.woff2?url';
import cousine400i from '@fontsource/cousine/files/cousine-latin-400-italic.woff2?url';
import cousine700 from '@fontsource/cousine/files/cousine-latin-700-normal.woff2?url';
import cousine700i from '@fontsource/cousine/files/cousine-latin-700-italic.woff2?url';
import carlito400 from '@fontsource/carlito/files/carlito-latin-400-normal.woff2?url';
import carlito400i from '@fontsource/carlito/files/carlito-latin-400-italic.woff2?url';
import carlito700 from '@fontsource/carlito/files/carlito-latin-700-normal.woff2?url';
import carlito700i from '@fontsource/carlito/files/carlito-latin-700-italic.woff2?url';
import carlitoPdf400 from '@fontsource/carlito/files/carlito-latin-400-normal.woff?url';
import carlitoPdf400i from '@fontsource/carlito/files/carlito-latin-400-italic.woff?url';
import carlitoPdf700 from '@fontsource/carlito/files/carlito-latin-700-normal.woff?url';
import carlitoPdf700i from '@fontsource/carlito/files/carlito-latin-700-italic.woff?url';

/** [regular, bold, italic, bold italic] */
const SCREEN: Record<FontId, string[]> = {
  sans: [arimo400, arimo700, arimo400i, arimo700i],
  serif: [tinos400, tinos700, tinos400i, tinos700i],
  mono: [cousine400, cousine700, cousine400i, cousine700i],
  calibri: [carlito400, carlito700, carlito400i, carlito700i],
};
const PDF_FILES: Partial<Record<FontId, string[]>> = {
  calibri: [carlitoPdf400, carlitoPdf700, carlitoPdf400i, carlitoPdf700i],
};

/** The CSS family each font goes by on screen. */
export const CSS_FAMILY: Record<FontId, string> = {
  sans: "'AtelieSans', Arial, Helvetica, sans-serif",
  serif: "'AtelieSerif', 'Times New Roman', Times, serif",
  mono: "'AtelieMono', 'Courier New', Courier, monospace",
  calibri: "'AtelieCalibri', Calibri, Carlito, sans-serif",
};
const FACE_NAME: Record<FontId, string> = {
  sans: 'AtelieSans',
  serif: 'AtelieSerif',
  mono: 'AtelieMono',
  calibri: 'AtelieCalibri',
};

const loading = new Map<FontId, Promise<void>>();
/** How far the browser's first baseline is from where the PDF puts it, per font (in ems). */
const shift = new Map<FontId, number>();

/** Load a font's four styles for the screen. Resolves even if a file fails (a fallback shows). */
export function loadScreenFont(font: FontId): Promise<void> {
  let p = loading.get(font);
  if (p) return p;
  p = (async () => {
    const styles: [string, string][] = [
      ['400', 'normal'],
      ['700', 'normal'],
      ['400', 'italic'],
      ['700', 'italic'],
    ];
    await Promise.all(
      SCREEN[font].map((url, i) =>
        new FontFace(FACE_NAME[font], `url(${url})`, { weight: styles[i][0], style: styles[i][1] })
          .load()
          .then(
            (f) => void document.fonts.add(f),
            () => undefined,
          ),
      ),
    );
    shift.set(font, measureShift(font));
  })();
  loading.set(font, p);
  return p;
}

export const screenFontReady = (font: FontId): boolean => shift.has(font);

/**
 * Where the browser puts the first baseline of a LINE_HEIGHT line in this font, compared with
 * where the PDF will. Browsers differ in which font metrics they use, so this is measured.
 */
function measureShift(font: FontId): number {
  const box = document.createElement('div');
  box.style.cssText = `position:absolute;left:-9999px;top:0;visibility:hidden;font:100px/${LINE_HEIGHT} ${CSS_FAMILY[font]};white-space:nowrap`;
  const mark = document.createElement('span');
  mark.style.cssText = 'display:inline-block;width:1px;height:0;vertical-align:baseline';
  box.append('Hg', mark);
  document.body.append(box);
  const measured = (mark.getBoundingClientRect().top - box.getBoundingClientRect().top) / 100;
  box.remove();
  return Number.isFinite(measured) && measured > 0.5 && measured < 1.5 ? firstBaseline(font) - measured : 0;
}

/** Ems to move a text box down on screen so its baseline lands where the PDF's will. */
export const baselineShift = (font: FontId): number => shift.get(font) ?? 0;

/** The PDF builder's reader for fonts that are embedded. */
export const pdfFontFile: FontFileLoader = async (font, bold, italic) => {
  const url = PDF_FILES[font]?.[(bold ? 1 : 0) + (italic ? 2 : 0)];
  if (!url) throw new Error(`sem arquivo para a fonte ${font}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fonte ${font}: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
};
