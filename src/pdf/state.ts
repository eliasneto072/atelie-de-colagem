/** What is open on the PDF page: the files, their pages in the current order, the task. */
import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';

export type Task = 'juntar' | 'organizar' | 'separar' | 'fotos' | 'imagens';
export const TASKS: readonly Task[] = ['juntar', 'organizar', 'separar', 'fotos', 'imagens'];

interface SourceBase {
  id: number;
  name: string;
  /** Colour of the file's tag on its pages. */
  color: string;
}

export interface PdfFile extends SourceBase {
  kind: 'pdf';
  bytes: Uint8Array;
  password?: string;
  doc: PDFDocumentProxy;
}

export interface ImageFile extends SourceBase {
  kind: 'image';
  /** Decoded and upright (EXIF orientation applied). */
  bitmap: ImageBitmap;
}

export type SourceFile = PdfFile | ImageFile;

export interface Page {
  id: number;
  source: SourceFile;
  /** 0-based page index in its PDF (0 for photos). */
  index: number;
  /** Size as it shows before the person rotates it (PDF points, or photo pixels). */
  w: number;
  h: number;
  /** Clockwise rotation added by the person. */
  rotation: 0 | 90 | 180 | 270;
  selected: boolean;
  /** Object URL of the thumbnail, once rendered. */
  thumb?: string;
}

const COLORS = ['#f2b13f', '#5fb6a0', '#e0795f', '#8c9cf0', '#d58ad8', '#9cc95c', '#5aa8e6', '#e6c35a'];

export const st = {
  task: 'juntar' as Task,
  files: [] as SourceFile[],
  pages: [] as Page[],
  /** Last page clicked without Shift, for range selection. */
  anchor: null as number | null,
};

let nextId = 1;
export const newId = (): number => nextId++;
export const nextColor = (): string => COLORS[st.files.length % COLORS.length];

export const selectedPages = (): Page[] => st.pages.filter((p) => p.selected);
export const hasPdf = (): boolean => st.files.some((f) => f.kind === 'pdf');
export const hasImages = (): boolean => st.pages.some((p) => p.source.kind === 'image');

// ---- undo: snapshots of the page list (order, rotation) ----
type Snapshot = { page: Page; rotation: Page['rotation'] }[];
const undoStack: Snapshot[] = [];

export function remember(): void {
  undoStack.push(st.pages.map((page) => ({ page, rotation: page.rotation })));
  if (undoStack.length > 60) undoStack.shift();
}

export function undo(): boolean {
  const snap = undoStack.pop();
  if (!snap) return false;
  st.pages = snap.map(({ page, rotation }) => {
    page.rotation = rotation;
    return page;
  });
  return true;
}

export const canUndo = (): boolean => undoStack.length > 0;
