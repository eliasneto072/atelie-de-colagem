/** Opening files: PDFs (asking for a password when needed) and photos. */
import { normalizeRotation } from '../core/pages';
import { NeedsPassword, openPdf } from './pdfjs';
import { newId, nextColor, st, type ImageFile, type Page, type PdfFile } from './state';
import { askPassword, busy, plural, toast } from './ui';

const isPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
const isImage = (f: File) =>
  f.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp|heic|heif|avif)$/i.test(f.name);

async function readPdf(file: File): Promise<PdfFile | null> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let password: string | undefined;
  for (;;) {
    try {
      const doc = await openPdf(bytes, password);
      return { kind: 'pdf', id: newId(), name: file.name, color: nextColor(), bytes, password, doc };
    } catch (err) {
      if (!(err instanceof NeedsPassword)) throw err;
      const typed = await askPassword(file.name, err.wrong);
      if (typed === null) return null;
      password = typed;
    }
  }
}

async function readImage(file: File): Promise<ImageFile> {
  // createImageBitmap turns phone photos upright using their EXIF orientation
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  return { kind: 'image', id: newId(), name: file.name, color: nextColor(), bitmap };
}

/** Add files at the end (or at `at`). Returns the pages created. */
export async function addFiles(list: FileList | File[], at = st.pages.length): Promise<Page[]> {
  const files = [...list];
  const added: Page[] = [];
  const problems: string[] = [];
  await busy(
    files.length > 1 ? `Abrindo ${files.length} arquivos…` : 'Abrindo o arquivo…',
    async (progress) => {
      for (const [k, file] of files.entries()) {
        if (files.length > 1) progress(`Abrindo ${k + 1} de ${files.length}…`);
        try {
          if (isPdf(file)) {
            const pdf = await readPdf(file);
            if (!pdf) {
              problems.push(`${file.name} ficou de fora (sem senha).`);
              continue;
            }
            st.files.push(pdf);
            for (let i = 0; i < pdf.doc.numPages; i++) {
              const pg = await pdf.doc.getPage(i + 1);
              const vp = pg.getViewport({ scale: 1 });
              const [x0, y0, x1, y1] = pg.view;
              added.push({
                id: newId(),
                source: pdf,
                index: i,
                w: vp.width,
                h: vp.height,
                rotation: 0,
                selected: false,
                box: [x0, y0, x1, y1],
                baseRot: normalizeRotation(pg.rotate),
                edits: [],
              });
            }
          } else if (isImage(file)) {
            const img = await readImage(file);
            st.files.push(img);
            added.push({
              id: newId(),
              source: img,
              index: 0,
              w: img.bitmap.width,
              h: img.bitmap.height,
              rotation: 0,
              selected: false,
              baseRot: 0,
              edits: [],
            });
          } else {
            problems.push(`${file.name} não é PDF nem imagem.`);
          }
        } catch {
          problems.push(
            isPdf(file)
              ? `Não consegui abrir ${file.name}: o arquivo parece danificado.`
              : /\.hei[cf]$/i.test(file.name)
                ? `Não consegui abrir ${file.name}. Fotos HEIC do iPhone: escolha pelo Safari ou converta para JPG.`
                : `Não consegui abrir ${file.name}.`,
          );
        }
      }
    },
  );
  st.pages.splice(at, 0, ...added);
  if (problems.length) toast(problems.join(' '));
  else if (added.length) toast(`${plural(added.length, 'página adicionada', 'páginas adicionadas')}`);
  return added;
}

/** Remove a file and all of its pages. */
export function removeFile(id: number): void {
  const f = st.files.find((x) => x.id === id);
  if (!f) return;
  st.files = st.files.filter((x) => x !== f);
  st.pages = st.pages.filter((p) => {
    if (p.source !== f) return true;
    if (p.thumb) URL.revokeObjectURL(p.thumb);
    return false;
  });
  if (f.kind === 'pdf') void f.doc.loadingTask.destroy();
  else f.bitmap.close();
}

/** Move a file's pages as a block, keeping each file's own page order. */
export function moveFile(id: number, delta: -1 | 1): void {
  const order = st.files.map((f) => f.id);
  const i = order.indexOf(id),
    j = i + delta;
  if (i < 0 || j < 0 || j >= order.length) return;
  [st.files[i], st.files[j]] = [st.files[j], st.files[i]];
  const rank = new Map(st.files.map((f, k) => [f.id, k]));
  st.pages = [...st.pages].sort((a, b) => rank.get(a.source.id)! - rank.get(b.source.id)!);
}
