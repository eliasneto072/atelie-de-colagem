/** Small pieces of interface for the PDF page: toasts, the busy dialog, downloads. */

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`#${id} não existe`);
  return node as T;
};
export { $ };

let toastTimer: ReturnType<typeof setTimeout> | null = null;

/** A short message at the bottom. An optional action button (e.g. "Desfazer"). */
export function toast(msg: string, action?: { label: string; run: () => void }): void {
  const box = $('toast');
  box.replaceChildren(document.createTextNode(msg));
  if (action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'toast-action';
    b.textContent = action.label;
    b.addEventListener('click', () => {
      box.classList.remove('show');
      action.run();
    });
    box.append(b);
  }
  box.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.classList.remove('show'), action ? 6000 : 3200);
}

/** Show a blocking "working on it" dialog while `work` runs. */
export async function busy<T>(
  message: string,
  work: (progress: (text: string) => void) => Promise<T>,
): Promise<T> {
  const dlg = $<HTMLDialogElement>('busy');
  const text = $('busy-text');
  text.textContent = message;
  // tiny jobs finish before the dialog would flash on screen
  const timer = setTimeout(() => {
    if (!dlg.open) dlg.showModal();
  }, 150);
  try {
    // let the browser paint before heavy work starts
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    return await work((t) => (text.textContent = t));
  } finally {
    clearTimeout(timer);
    if (dlg.open) dlg.close();
  }
}

/** Hand a file to the person. */
export function download(data: Uint8Array | Blob, name: string, type: string): void {
  const blob = data instanceof Blob ? data : new Blob([data as Uint8Array<ArrayBuffer>], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Ask for a PDF's password. Resolves to null when the person gives up. */
export function askPassword(fileName: string, wrong: boolean): Promise<string | null> {
  const dlg = $<HTMLDialogElement>('pw-dialog');
  const input = $<HTMLInputElement>('pw-input');
  $('pw-file').textContent = fileName;
  $('pw-wrong').hidden = !wrong;
  input.value = '';
  dlg.showModal();
  input.focus();
  return new Promise((resolve) => {
    dlg.addEventListener(
      'close',
      () => resolve(dlg.returnValue === 'ok' && input.value ? input.value : null),
      {
        once: true,
      },
    );
  });
}

export const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
