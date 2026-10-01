/** The Layers panel: list, reorder, rename, and the active layer's properties. */
import { isHex } from '../core/color';
import { BLEND_NAME, BLENDS, FILTER_OK, ICON } from '../editor/constants';
import { button, ctx2d, el, input, svg } from '../editor/dom';
import { commit } from '../editor/history';
import { active, defAdj, displayCanvas, layerById } from '../editor/layer';
import { S, markScene, opts, theme } from '../editor/state';
import type { Adjust, Layer } from '../editor/types';
import {
  deleteLayer,
  duplicateLayer,
  mergeDown,
  moveLayer,
  newEmptyLayer,
  setActive,
} from '../editor/layerOps';
import { removeColor, startPickOnce } from '../editor/colorPick';
import { healHoles } from '../editor/heal';
import { afterStructural, mobileClose, toast } from './chrome';

function drawThumb(cv: HTMLCanvasElement, l: Layer): void {
  const x = ctx2d(cv),
    s = cv.width,
    n = 8;
  x.clearRect(0, 0, s, s);
  for (let i = 0; i < s / n; i++) {
    for (let j = 0; j < s / n; j++) {
      x.fillStyle = (i + j) % 2 ? theme.checkB : theme.checkA;
      x.fillRect(i * n, j * n, n, n);
    }
  }
  const k = Math.min(s / l.canvas.width, s / l.canvas.height),
    w = l.canvas.width * k,
    h = l.canvas.height * k;
  x.imageSmoothingQuality = 'high';
  x.drawImage(displayCanvas(l), (s - w) / 2, (s - h) / 2, w, h);
}

export function renderLayers(): void {
  const list = el('layer-list');
  list.innerHTML = '';
  for (let i = S.layers.length - 1; i >= 0; i--) {
    const l = S.layers[i],
      row = document.createElement('div');
    row.className = 'layer' + (l.id === S.activeId ? ' is-active' : '') + (l.visible ? '' : ' is-hidden');
    row.dataset.id = String(l.id);
    row.draggable = true;
    row.tabIndex = 0;
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', String(l.id === S.activeId));
    const meta = [
      l.opacity < 1 ? Math.round(l.opacity * 100) + '%' : '',
      l.blend !== 'source-over' ? (BLEND_NAME.get(l.blend) ?? '') : '',
    ]
      .filter(Boolean)
      .join(' · ');
    const verb = l.visible ? 'Ocultar' : 'Mostrar';
    row.innerHTML = `<button class="eye" type="button" data-eye aria-label="${verb} camada" title="${verb}">${svg(l.visible ? ICON.eye : ICON.eyeOff)}</button><canvas class="thumb" width="84" height="84"></canvas><span class="lname"></span><span class="lmeta"></span>`;
    const name = row.querySelector<HTMLElement>('.lname'),
      metaEl = row.querySelector<HTMLElement>('.lmeta'),
      thumb = row.querySelector<HTMLCanvasElement>('canvas');
    if (name) {
      name.textContent = l.name;
      name.title = 'Duplo clique para renomear';
    }
    if (metaEl) {
      metaEl.textContent = meta;
      if (l.fill.on && isHex(l.fill.color)) {
        const dot = document.createElement('i');
        dot.className = 'dot';
        dot.style.background = l.fill.color;
        dot.title = 'Coberta com cor';
        metaEl.appendChild(dot);
      }
    }
    if (thumb) drawThumb(thumb, l);
    list.appendChild(row);
  }
  el('layer-count').textContent = S.layers.length === 1 ? '1 camada' : `${S.layers.length} camadas`;
  el('dock-layers').textContent = String(S.layers.length);
  const l = active(),
    i = l ? S.layers.indexOf(l) : -1;
  button('la-dup').disabled = !l;
  button('la-del').disabled = !l;
  button('la-up').disabled = !l || i === S.layers.length - 1;
  button('la-down').disabled = !l || i <= 0;
  button('la-merge').disabled = !l || i <= 0;
  renderLayerProps();
}

function renderLayerProps(): void {
  const l = active();
  el('layer-props').hidden = !l;
  if (!l) return;
  const set = (id: string, v: number, txt: string) => {
    input(id).value = String(v);
    el(id + '-v').textContent = txt;
  };
  set('lp-opacity', Math.round(l.opacity * 100), Math.round(l.opacity * 100) + '%');
  el<HTMLSelectElement>('lp-blend').value = l.blend;
  input('lp-fill-on').checked = l.fill.on;
  input('lp-fill-color').value = isHex(l.fill.color) ? l.fill.color : '#000000';
  set('lp-fill-amt', l.fill.amount, l.fill.amount + '%');
  set('lp-b', l.adj.b, l.adj.b + '%');
  set('lp-c', l.adj.c, l.adj.c + '%');
  set('lp-s', l.adj.s, l.adj.s + '%');
  set('lp-h', l.adj.h, l.adj.h + '°');
  set('lp-blur', l.adj.blur, l.adj.blur + ' px');
}

const ADJ: Record<string, [keyof Adjust, string]> = {
  'lp-b': ['b', '%'],
  'lp-c': ['c', '%'],
  'lp-s': ['s', '%'],
  'lp-h': ['h', '°'],
  'lp-blur': ['blur', ' px'],
};

const rowLayer = (t: EventTarget | null): Layer | null => {
  const row = (t as HTMLElement | null)?.closest<HTMLElement>('.layer');
  return row ? layerById(Number(row.dataset.id)) : null;
};

function initList(): void {
  const list = el('layer-list');
  list.addEventListener('click', (e) => {
    const l = rowLayer(e.target);
    if (!l) return;
    if ((e.target as HTMLElement).closest('[data-eye]')) {
      l.visible = !l.visible;
      commit(l.visible ? 'Mostrar camada' : 'Ocultar camada');
      afterStructural();
      return;
    }
    if (l.id !== S.activeId) setActive(l.id);
  });
  list.addEventListener('keydown', (e) => {
    const l = rowLayer(e.target);
    if (l && (e.key === 'Enter' || e.key === ' ')) {
      setActive(l.id);
      e.preventDefault();
    }
  });
  // double-click a name to rename it
  list.addEventListener('dblclick', (e) => {
    const span = (e.target as HTMLElement).closest<HTMLElement>('.lname');
    const row = span?.closest<HTMLElement>('.layer');
    const l = rowLayer(span);
    if (!span || !row || !l) return;
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.value = l.name;
    inp.id = 'rename-' + l.id;
    inp.setAttribute('aria-label', 'Nome da camada');
    span.textContent = '';
    span.appendChild(inp);
    inp.focus();
    inp.select();
    row.draggable = false;
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      const v = inp.value.trim();
      if (ok && v && v !== l.name) {
        l.name = v;
        commit('Renomear camada');
      }
      renderLayers();
    };
    inp.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') finish(true);
      if (ev.key === 'Escape') finish(false);
      ev.stopPropagation();
    });
    inp.addEventListener('blur', () => finish(true));
  });
  // drag rows to reorder
  let dragId: number | null = null;
  const clearMarks = () =>
    document.querySelectorAll('.layer').forEach((r) => r.classList.remove('drop-above', 'drop-below'));
  list.addEventListener('dragstart', (e) => {
    const l = rowLayer(e.target);
    if (!l || !e.dataTransfer) return;
    dragId = l.id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/x-layer', String(dragId));
  });
  list.addEventListener('dragover', (e) => {
    if (dragId == null) return;
    const row = (e.target as HTMLElement).closest<HTMLElement>('.layer');
    e.preventDefault();
    clearMarks();
    if (row) {
      const r = row.getBoundingClientRect();
      row.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-above' : 'drop-below');
    }
  });
  list.addEventListener('drop', (e) => {
    if (dragId == null) return;
    e.preventDefault();
    e.stopPropagation();
    const row = (e.target as HTMLElement).closest<HTMLElement>('.layer');
    const above = !!row?.classList.contains('drop-above');
    const d = layerById(dragId),
      target = rowLayer(row);
    dragId = null;
    if (!d || !target || target.id === d.id) {
      renderLayers();
      return;
    }
    S.layers.splice(S.layers.indexOf(d), 1);
    const ti = S.layers.indexOf(target);
    // the list shows the top layer first, so "above" means a higher index
    S.layers.splice(above ? ti + 1 : ti, 0, d);
    commit('Reordenar camadas');
    afterStructural();
  });
  list.addEventListener('dragend', () => {
    dragId = null;
    clearMarks();
  });
}

function initProps(): void {
  const props = el('layer-props');
  props.addEventListener('input', (e) => {
    const l = active();
    if (!l) return;
    const t = e.target as HTMLInputElement,
      id = t.id,
      v = Number(t.value);
    if (id === 'lp-opacity') {
      l.opacity = v / 100;
      el('lp-opacity-v').textContent = v + '%';
    } else if (ADJ[id]) {
      l.adj[ADJ[id][0]] = v;
      el(id + '-v').textContent = v + ADJ[id][1];
    } else if (id === 'lp-fill-amt') {
      l.fill.amount = v;
      el('lp-fill-amt-v').textContent = v + '%';
    } else if (id === 'lp-fill-color') {
      l.fill.color = t.value;
      if (!l.fill.on) {
        l.fill.on = true;
        input('lp-fill-on').checked = true;
      }
    } else if (id === 'lp-key-tol') {
      el('lp-key-tol-v').textContent = v + '%';
      return;
    } else return;
    markScene();
  });
  props.addEventListener('change', (e) => {
    const l = active();
    if (!l) return;
    const t = e.target as HTMLInputElement,
      id = t.id;
    if (id === 'lp-blend') {
      l.blend = t.value as GlobalCompositeOperation;
      commit('Modo de mesclagem');
    } else if (id === 'lp-opacity') commit('Opacidade');
    else if (ADJ[id]) commit('Ajuste de cor');
    else if (id === 'lp-fill-on') {
      l.fill.on = t.checked;
      commit(l.fill.on ? 'Cobrir com cor' : 'Tirar a cor da camada');
    } else if (id === 'lp-fill-color' || id === 'lp-fill-amt') commit('Cor da camada');
    else return;
    markScene();
    renderLayers();
  });
  button('lp-fill-pick').addEventListener('click', () => {
    const l = active();
    if (!l) return;
    const id = l.id;
    startPickOnce(
      (hex) => {
        const L = layerById(id);
        if (!L) return;
        L.fill.color = hex;
        L.fill.on = true;
        commit('Cor da camada');
        markScene();
        renderLayers();
        toast(`Camada coberta com ${hex}`);
      },
      l.fill.color,
      'Agora clique na cor que quer copiar · Esc cancela',
    );
  });
  button('lp-fill-cur').addEventListener('click', () => {
    const l = active();
    if (!l) return;
    l.fill.color = opts.color;
    l.fill.on = true;
    commit('Cor da camada');
    markScene();
    renderLayers();
  });
  button('lp-key-pick').addEventListener('click', () =>
    startPickOnce(
      (hex) => {
        input('lp-key-color').value = hex;
        toast(`Fundo ${hex} escolhido · clique em "Tirar essa cor"`);
      },
      input('lp-key-color').value,
      'Agora clique no fundo que quer tirar · Esc cancela',
    ),
  );
  button('lp-key-apply').addEventListener('click', () => {
    const l = active();
    if (l) removeColor(l, input('lp-key-color').value, Number(input('lp-key-tol').value));
  });
  button('lp-adj-reset').addEventListener('click', () => {
    const l = active();
    if (!l) return;
    l.adj = defAdj();
    commit('Zerar ajustes');
    markScene();
    renderLayerProps();
  });
  if (!FILTER_OK) {
    el('adj-body').hidden = true;
    el('adj-off').hidden = false;
  }
}

export function initLayersPanel(): void {
  el<HTMLSelectElement>('lp-blend').innerHTML = BLENDS.map(
    ([v, n]) => `<option value="${v}">${n}</option>`,
  ).join('');
  initList();
  initProps();
  button('la-new').addEventListener('click', newEmptyLayer);
  button('la-dup').addEventListener('click', duplicateLayer);
  button('la-up').addEventListener('click', () => moveLayer(1));
  button('la-down').addEventListener('click', () => moveLayer(-1));
  button('la-merge').addEventListener('click', mergeDown);
  button('la-del').addEventListener('click', deleteLayer);
  button('la-heal').addEventListener('click', () => {
    healHoles();
    mobileClose();
  });
}
