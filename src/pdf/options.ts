/** The person's choices for photos and images, remembered on this device. */
import type { PageSizeOption } from '../core/pages';

export interface Options {
  pageSize: PageSizeOption;
  margin: boolean;
  quality: 'normal' | 'alta';
  format: 'jpg' | 'png';
  dpi: 150 | 300;
}

const KEY = 'atelie.pdf.opts';
const DEFAULTS: Options = { pageSize: 'a4', margin: true, quality: 'normal', format: 'jpg', dpi: 150 };

export const opts: Options = (() => {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Options>) };
  } catch {
    return { ...DEFAULTS };
  }
})();

export function saveOpts(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(opts));
  } catch {
    // private mode: the choice just isn't remembered
  }
}

/** About 1 cm, a comfortable margin around photos. */
export const MARGIN_PT = 28;
