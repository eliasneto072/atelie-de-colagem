/** Runs the background fill off the main thread so the page never freezes. */
import { inpaint } from '../core/inpaint';

export interface InpaintJob {
  src: Uint8ClampedArray<ArrayBuffer>;
  W: number;
  H: number;
  hole: Uint8Array<ArrayBuffer>;
  bad: Uint8Array<ArrayBuffer>;
}

// Typed by hand instead of pulling in the WebWorker lib, which clashes with the DOM lib.
const scope = self as unknown as {
  onmessage: ((e: MessageEvent<InpaintJob>) => void) | null;
  postMessage(message: unknown, transfer: Transferable[]): void;
};

scope.onmessage = (e) => {
  const { src, W, H, hole, bad } = e.data;
  const out = inpaint(src, W, H, hole, bad);
  scope.postMessage(out, [out.buffer]);
};
