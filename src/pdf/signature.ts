/**
 * The signature pad: draw with a finger or the mouse, or use a photo of a signature made on
 * paper (the paper turns transparent). The result is a trimmed, transparent PNG.
 */
import type { Signature } from './edits';
import { newId, st } from './state';
import { $, toast } from './ui';

const INKS: Record<string, [number, number, number]> = { preto: [20, 20, 24], azul: [26, 63, 176] };
let ink: keyof typeof INKS = 'preto';
let mode: 'draw' | 'photo' = 'draw';
let strokes: { x: number; y: number }[][] = [];
let photoCanvas: HTMLCanvasElement | null = null;

const canvas = () => $<HTMLCanvasElement>('sig-canvas');

function fitCanvas(): void {
  const c = canvas();
  const r = c.getBoundingClientRect();
  const k = Math.min(3, Math.max(2, devicePixelRatio || 1));
  c.width = Math.max(1, Math.round(r.width * k));
  c.height = Math.max(1, Math.round(r.height * k));
  redraw();
}

function redraw(): void {
  const c = canvas();
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, c.width, c.height);
  $('sig-hint').hidden = mode !== 'draw' || strokes.length > 0;
  if (mode === 'photo') {
    if (photoCanvas) {
      const k = Math.min(c.width / photoCanvas.width, c.height / photoCanvas.height) * 0.92;
      const w = photoCanvas.width * k,
        h = photoCanvas.height * k;
      ctx.drawImage(photoCanvas, (c.width - w) / 2, (c.height - h) / 2, w, h);
    }
    return;
  }
  const [r, g, b] = INKS[ink];
  ctx.strokeStyle = `rgb(${r},${g},${b})`;
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = c.width / 160;
  for (const s of strokes) {
    if (s.length === 1) {
      ctx.beginPath();
      ctx.arc(s[0].x * c.width, s[0].y * c.height, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    // smooth the line through the midpoints between samples
    ctx.beginPath();
    ctx.moveTo(s[0].x * c.width, s[0].y * c.height);
    for (let i = 1; i < s.length - 1; i++) {
      const mx = ((s[i].x + s[i + 1].x) / 2) * c.width,
        my = ((s[i].y + s[i + 1].y) / 2) * c.height;
      ctx.quadraticCurveTo(s[i].x * c.width, s[i].y * c.height, mx, my);
    }
    const last = s[s.length - 1];
    ctx.lineTo(last.x * c.width, last.y * c.height);
    ctx.stroke();
  }
}

/** Turn a photo of ink on paper into ink on transparency. */
async function loadPhoto(file: File): Promise<void> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    toast('Não consegui abrir essa foto.');
    return;
  }
  const k = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  // paper brightness: a high percentile of the luminance
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4)
    hist[Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])]++;
  let acc = 0,
    paper = 255;
  for (let v = 255; v >= 0; v--) {
    acc += hist[v];
    if (acc > (d.length / 4) * 0.4) {
      paper = v;
      break;
    }
  }
  const lo = Math.max(0, paper - 110),
    hi = Math.max(lo + 1, paper - 28);
  const [r, g, b] = INKS[ink];
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const a = Math.max(0, Math.min(1, (hi - lum) / (hi - lo)));
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
    d[i + 3] = Math.round(a * 255);
  }
  ctx.putImageData(img, 0, 0);
  photoCanvas = trim(c);
  if (!photoCanvas) toast('Não encontrei a assinatura na foto. Use papel branco e tinta escura.');
  redraw();
}

/** Crop to the ink, with a little air around it. */
function trim(c: HTMLCanvasElement): HTMLCanvasElement | null {
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
  let x0 = width,
    y0 = height,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (data[(y * width + x) * 4 + 3] > 24) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return null;
  const pad = Math.round(Math.max(x1 - x0, y1 - y0) * 0.03) + 2;
  x0 = Math.max(0, x0 - pad);
  y0 = Math.max(0, y0 - pad);
  x1 = Math.min(width - 1, x1 + pad);
  y1 = Math.min(height - 1, y1 + pad);
  const out = document.createElement('canvas');
  out.width = x1 - x0 + 1;
  out.height = y1 - y0 + 1;
  out.getContext('2d')!.drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

async function finish(): Promise<Signature | null> {
  let source: HTMLCanvasElement | null;
  if (mode === 'photo') source = photoCanvas;
  else {
    if (!strokes.length) return null;
    // draw on a clean canvas (no hint text) and crop to the ink
    source = trim(canvas());
  }
  if (!source) return null;
  const blob = await new Promise<Blob | null>((r) => source!.toBlob(r, 'image/png'));
  if (!blob) return null;
  const sig: Signature = {
    id: newId(),
    png: new Uint8Array(await blob.arrayBuffer()),
    url: URL.createObjectURL(blob),
    aspect: source.width / source.height,
  };
  st.signatures.push(sig);
  return sig;
}

function setMode(m: typeof mode): void {
  mode = m;
  document
    .querySelectorAll<HTMLElement>('#sig-dialog [data-sigmode]')
    .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sigmode === m)));
  $('sig-photo-row').hidden = m !== 'photo';
  redraw();
}

let wired = false;
function wire(): void {
  if (wired) return;
  wired = true;
  const c = canvas();
  let current: { x: number; y: number }[] | null = null;
  const point = (e: PointerEvent) => {
    const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };
  c.addEventListener('pointerdown', (e) => {
    if (mode !== 'draw') return;
    c.setPointerCapture(e.pointerId);
    current = [point(e)];
    strokes.push(current);
    redraw();
  });
  c.addEventListener('pointermove', (e) => {
    if (!current) return;
    for (const ev of e.getCoalescedEvents?.() ?? [e]) current.push(point(ev));
    redraw();
  });
  const end = () => (current = null);
  c.addEventListener('pointerup', end);
  c.addEventListener('pointercancel', end);

  $('sig-clear').addEventListener('click', () => {
    strokes = [];
    photoCanvas = null;
    redraw();
  });
  $('sig-undo').addEventListener('click', () => {
    strokes.pop();
    redraw();
  });
  document
    .querySelectorAll<HTMLElement>('#sig-dialog [data-sigmode]')
    .forEach((b) => b.addEventListener('click', () => setMode(b.dataset.sigmode as typeof mode)));
  document.querySelectorAll<HTMLInputElement>('#sig-dialog input[name="sig-ink"]').forEach((r) =>
    r.addEventListener('change', () => {
      ink = r.value as typeof ink;
      redraw();
    }),
  );
  $<HTMLInputElement>('sig-file').addEventListener('change', (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) void loadPhoto(f);
    (e.target as HTMLInputElement).value = '';
  });
  window.addEventListener('resize', () => $<HTMLDialogElement>('sig-dialog').open && fitCanvas());
}

/** Open the pad. Resolves to the new signature, or null if the person cancels. */
export function openSignaturePad(): Promise<Signature | null> {
  wire();
  const dlg = $<HTMLDialogElement>('sig-dialog');
  strokes = [];
  photoCanvas = null;
  dlg.returnValue = '';
  dlg.showModal();
  setMode('draw');
  requestAnimationFrame(fitCanvas);
  return new Promise((resolve) => {
    const ok = dlg.querySelector<HTMLButtonElement>('button[value=ok]')!;
    let busy = false;
    let done = false;
    const cleanup = () => {
      ok.removeEventListener('click', onOk);
      dlg.removeEventListener('close', onClose);
    };
    // the signature is ready before the window closes, so a quick click on the page right
    // after "Usar assinatura" already places it
    const onOk = async (ev: Event) => {
      ev.preventDefault();
      if (busy) return;
      busy = true;
      const sig = await finish();
      busy = false;
      if (!sig) {
        toast(
          mode === 'draw' ? 'Desenhe a assinatura antes de usar.' : 'Escolha a foto da assinatura antes.',
        );
        return;
      }
      done = true;
      cleanup();
      resolve(sig);
      dlg.close('ok');
    };
    const onClose = () => {
      if (done) return;
      cleanup();
      resolve(null);
    };
    ok.addEventListener('click', onOk);
    dlg.addEventListener('close', onClose);
  });
}
