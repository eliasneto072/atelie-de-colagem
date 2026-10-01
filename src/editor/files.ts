/** Opening images: file picker, drag and drop, paste. */
import type { Vec } from '../core/geometry';
import { MAX_IMAGE_SIDE } from './constants';
import { ctx2d, el, input, mkCanvas } from './dom';
import { commit } from './history';
import { S, rt } from './state';
import { addImageLayer } from './layerOps';
import { setTool } from './tools';
import { overlay, toDoc } from './view';
import { clearAll } from './project';
import { afterStructural, toast } from '../ui/chrome';

async function fileToCanvas(file: Blob): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const k = Math.min(1, MAX_IMAGE_SIDE / img.naturalWidth, MAX_IMAGE_SIDE / img.naturalHeight);
    const c = mkCanvas(img.naturalWidth * k, img.naturalHeight * k);
    ctx2d(c).drawImage(img, 0, 0, c.width, c.height);
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Add image files as layers; `at` places them at a document point (drop position). */
export async function addFiles(files: Iterable<File>, at: Vec | null): Promise<void> {
  const imgs = [...files].filter((f) => f?.type?.startsWith('image/'));
  if (!imgs.length) {
    toast('Nenhuma imagem nos arquivos');
    return;
  }
  // the first real image replaces the built-in example
  if (rt.sampleActive) {
    clearAll();
    at = null;
  }
  let added = 0;
  for (const f of imgs) {
    try {
      const c = await fileToCanvas(f);
      addImageLayer(c, (f.name || 'Imagem colada').replace(/\.[^.]+$/, ''), at);
      added++;
    } catch {
      toast(`Não consegui abrir ${f.name || 'a imagem'} (formato não suportado pelo navegador)`);
    }
  }
  if (added) {
    commit(added > 1 ? `Adicionar ${added} imagens` : 'Adicionar imagem');
    setTool('move');
    afterStructural();
  }
}

export const openPicker = (): void => input('file-input').click();

export function initFiles(): void {
  const fi = input('file-input');
  fi.addEventListener('change', () => {
    const f = [...(fi.files ?? [])];
    fi.value = '';
    if (f.length) void addFiles(f, null);
  });

  const dz = el('dropzone');
  let dzTimer: ReturnType<typeof setTimeout> | null = null;
  document.addEventListener('dragover', (e) => {
    if (!e.dataTransfer || ![...e.dataTransfer.types].includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    dz.hidden = false;
    if (dzTimer) clearTimeout(dzTimer);
    dzTimer = setTimeout(() => (dz.hidden = true), 160);
  });
  document.addEventListener('drop', (e) => {
    if (!e.dataTransfer?.files.length) return;
    e.preventDefault();
    dz.hidden = true;
    const r = overlay.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    void addFiles(
      e.dataTransfer.files,
      inside && S.layers.length ? toDoc({ x: e.clientX - r.left, y: e.clientY - r.top }) : null,
    );
  });
}
