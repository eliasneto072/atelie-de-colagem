/** The person's choices for photos and images, remembered on this device. */
import type { PageSizeOption } from '../core/pages';

export interface Options {
  pageSize: PageSizeOption;
  margin: boolean;
  quality: 'normal' | 'alta';
  format: 'jpg' | 'png';
  dpi: 150 | 300;
  /** "Diminuir tamanho": the largest size wanted. */
  target: Target;
}

export type Target = '500k' | '1m' | '2m' | '5m' | 'min';
/** The limit of each choice, in bytes ("min" goes as small as it can). */
export const TARGET_BYTES: Record<Target, number | undefined> = {
  '500k': 500_000,
  '1m': 1_000_000,
  '2m': 2_000_000,
  '5m': 5_000_000,
  min: undefined,
};

const KEY = 'atelie.pdf.opts';
const DEFAULTS: Options = {
  pageSize: 'a4',
  margin: true,
  quality: 'normal',
  format: 'jpg',
  dpi: 150,
  target: '2m',
};

export const opts: Options = (() => {
  try {
    const saved = { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Options>) };
    if (!(saved.target in TARGET_BYTES)) saved.target = DEFAULTS.target;
    return saved;
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
