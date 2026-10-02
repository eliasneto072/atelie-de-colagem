/**
 * Ateliê de Colagem: PDF tools. Join, organise and split PDFs, photos to PDF and PDF to
 * images, all in the browser. Files never leave the device.
 */
import '@fontsource/bricolage-grotesque/latin-700.css';
import '@fontsource/bricolage-grotesque/latin-800.css';
import '@fontsource/instrument-sans/latin-400.css';
import '@fontsource/instrument-sans/latin-500.css';
import '@fontsource/instrument-sans/latin-600.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '../styles/pdf.css';

import { registerServiceWorker } from '../pwa';
import { doUndo, initGrid, onChange, removePages, renderGrid, rotate, selectAll, shift } from './grid';
import { initPanel, renderPanel } from './panel';
import { addFiles } from './sources';
import { TASKS, canUndo, selectedPages, st, type Task } from './state';
import { $, plural } from './ui';

const HINTS: Record<Task, string> = {
  juntar: 'Escolha dois ou mais PDFs para juntar. Fotos também entram.',
  organizar: 'Abra um PDF para mudar a ordem, girar ou tirar páginas.',
  separar: 'Abra o PDF que você quer separar.',
  fotos: 'Escolha as fotos: da galeria, dos arquivos ou tirando na hora.',
  imagens: 'Abra o PDF que vai virar imagens.',
};

function refresh(): void {
  const n = st.pages.length,
    sel = selectedPages().length;
  $('empty').hidden = n > 0;
  $('toolbar').hidden = n === 0;
  $('empty-hint').textContent = HINTS[st.task];
  $('count').textContent = n
    ? `${plural(n, 'página', 'páginas')}${sel ? ` · ${sel} selecionada${sel > 1 ? 's' : ''}` : ''}`
    : '';
  const allSel = n > 0 && sel === n;
  $('sel-all').textContent = allSel ? 'Limpar seleção' : 'Selecionar todas';
  for (const id of ['sel-left', 'sel-right', 'sel-back', 'sel-fwd', 'sel-del'])
    $<HTMLButtonElement>(id).disabled = sel === 0;
  $<HTMLButtonElement>('undo').disabled = !canUndo();
  document
    .querySelectorAll<HTMLElement>('.task')
    .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.task === st.task)));
  const accept = st.task === 'fotos' ? 'image/*' : 'application/pdf,.pdf,image/*';
  $<HTMLInputElement>('file-input').accept = accept;
  renderGrid();
  renderPanel();
}

function setTask(task: Task): void {
  st.task = task;
  history.replaceState(null, '', `#${task}`);
  refresh();
}

const taskFromHash = (): Task => {
  const h = location.hash.slice(1) as Task;
  return TASKS.includes(h) ? h : 'juntar';
};

async function open(files: FileList | File[] | null): Promise<void> {
  if (!files?.length) return;
  await addFiles(files);
  refresh();
}

function initFiles(): void {
  const input = $<HTMLInputElement>('file-input');
  const camera = $<HTMLInputElement>('camera-input');
  const pick = () => input.click();
  $('add').addEventListener('click', pick);
  $('empty-add').addEventListener('click', pick);
  $('empty-camera').addEventListener('click', () => camera.click());
  for (const el of [input, camera]) {
    el.addEventListener('change', () => {
      void open(el.files).then(() => (el.value = ''));
    });
  }

  // drop files anywhere on the page
  const drop = $('drop');
  let depth = 0;
  const hasFiles = (e: DragEvent) => [...(e.dataTransfer?.types ?? [])].includes('Files');
  window.addEventListener('dragenter', (e) => {
    if (!hasFiles(e)) return;
    depth++;
    drop.hidden = false;
  });
  window.addEventListener('dragleave', (e) => {
    if (!hasFiles(e)) return;
    if (--depth <= 0) {
      depth = 0;
      drop.hidden = true;
    }
  });
  window.addEventListener('dragover', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  });
  window.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth = 0;
    drop.hidden = true;
    void open(e.dataTransfer?.files ?? null);
  });

  // paste a PDF or a screenshot
  window.addEventListener('paste', (e) => {
    const files = [...(e.clipboardData?.files ?? [])];
    if (files.length) void open(files);
  });
}

function initToolbar(): void {
  $('sel-all').addEventListener('click', () => selectAll(selectedPages().length !== st.pages.length));
  $('sel-left').addEventListener('click', () => rotate(selectedPages(), -90));
  $('sel-right').addEventListener('click', () => rotate(selectedPages(), 90));
  $('sel-back').addEventListener('click', () => shift(selectedPages(), -1));
  $('sel-fwd').addEventListener('click', () => shift(selectedPages(), 1));
  $('sel-del').addEventListener('click', () => removePages(selectedPages()));
  $('undo').addEventListener('click', doUndo);

  document.querySelector('.tasks')!.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-task]');
    if (b?.dataset.task) setTask(b.dataset.task as Task);
  });

  window.addEventListener('keydown', (e) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || document.querySelector('dialog[open]')) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      doUndo();
    } else if (mod && e.key.toLowerCase() === 'a' && st.pages.length) {
      e.preventDefault();
      selectAll(true);
    } else if (mod && e.key.toLowerCase() === 'o') {
      e.preventDefault();
      $<HTMLInputElement>('file-input').click();
    } else if (e.key === 'Escape' && selectedPages().length) selectAll(false);
  });

  // closing the tab by accident would lose the arrangement
  window.addEventListener('beforeunload', (e) => {
    if (st.pages.length) e.preventDefault();
  });
}

st.task = taskFromHash();
window.addEventListener('hashchange', () => setTask(taskFromHash()));
onChange(refresh);
initGrid();
initPanel(refresh);
initFiles();
initToolbar();
refresh();
registerServiceWorker('../');

// keep the PDF tools for offline use (the service worker skips them for editor-only visitors)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.ready.then((reg) => reg.active?.postMessage({ type: 'cache-pdf' }));
}
