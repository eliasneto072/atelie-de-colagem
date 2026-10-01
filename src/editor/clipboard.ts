/** Copy/cut/paste inside the editor, plus pasting images from other programs. */
import { P } from './dom';
import { commit } from './history';
import { active, baseName, layerMatrix, newLayer } from './layer';
import { S, rt } from './state';
import { eraseWithMask, extract } from './selection';
import { setTool } from './tools';
import { addFiles } from './files';
import { afterStructural, toast } from '../ui/chrome';

export function copyClip(cut: boolean): void {
  const l = active();
  if (!l) return;
  let canvas = l.canvas,
    lx = 0,
    ly = 0;
  if (S.sel) {
    const e = extract(l);
    if (!e) {
      toast('A seleção não pega nenhum pixel da camada ativa');
      return;
    }
    canvas = e.canvas;
    lx = e.lx;
    ly = e.ly;
    if (cut) {
      eraseWithMask(l, e.mask);
      commit('Recortar');
      afterStructural();
    }
  } else if (cut) {
    toast('Faça uma seleção para recortar');
    return;
  }
  const c = layerMatrix(l).transformPoint(P(lx + canvas.width / 2, ly + canvas.height / 2));
  rt.clip = {
    canvas,
    props: {
      name: `${baseName(l.name)} · ${cut ? 'recorte' : 'cópia'}`,
      x: c.x,
      y: c.y,
      sx: l.sx,
      sy: l.sy,
      rot: l.rot,
      flipX: l.flipX,
      flipY: l.flipY,
      opacity: l.opacity,
      blend: l.blend,
      adj: { ...l.adj },
      fill: { ...l.fill },
    },
    time: Date.now(),
  };
  toast(cut ? 'Recortado · Ctrl+V cola como nova camada' : 'Copiado · Ctrl+V cola como nova camada');
}

export function pasteClip(): void {
  const clip = rt.clip;
  if (!clip) {
    toast('Nada copiado ainda');
    return;
  }
  const p = clip.props;
  const nl = newLayer(clip.canvas, {
    ...p,
    adj: p.adj ? { ...p.adj } : undefined,
    fill: p.fill ? { ...p.fill } : undefined,
  });
  const l = active();
  S.layers.splice(l ? S.layers.indexOf(l) + 1 : S.layers.length, 0, nl);
  S.activeId = nl.id;
  commit('Colar');
  setTool('move');
  afterStructural();
  toast('Colado como nova camada');
}

/**
 * Ctrl+V: if an image was copied in another program after our own copy, paste that image;
 * otherwise paste what was copied inside the editor.
 */
export function initPaste(): void {
  document.addEventListener('paste', (e) => {
    const tag = ((e.target as HTMLElement | null)?.tagName ?? '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    rt.pendingPaste = false;
    const files = [...(e.clipboardData?.items ?? [])]
      .filter((i) => i.kind === 'file' && i.type.startsWith('image/'))
      .map((i) => i.getAsFile())
      .filter((f): f is File => !!f);
    const systemNewer = !rt.clip || rt.lastBlur > rt.clip.time;
    if (files.length && systemNewer) {
      e.preventDefault();
      void addFiles(files, null);
    } else if (rt.clip) {
      e.preventDefault();
      pasteClip();
    } else if (files.length) {
      e.preventDefault();
      void addFiles(files, null);
    }
  });
}
