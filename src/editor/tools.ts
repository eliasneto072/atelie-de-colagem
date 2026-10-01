/** The tool bar and the per-tool options panel. */
import type { AlignMode } from '../core/snap';
import { FILTER_OK, ICON, SEL_TOOLS, TOOL_BAR, toolDef } from './constants';
import { el, maybe, svg } from './dom';
import { commit } from './history';
import { active } from './layer';
import { S, dirtyAll, markOverlay, opts, rt, saveOpts, type Options } from './state';
import type { ToolId } from './types';
import { alignActive, fillAlignTargets } from './align';
import { setCurrentColor } from './colorPick';
import { xformAction, type XformAction } from './layerOps';
import { updateCursor } from './pointer';
import { finishPoly } from './selection';
import { hideBar, syncPolyBar } from '../ui/chrome';

export const toolHint = (): string => toolDef(S.tool).hint.split(' · ')[0];

export function setTool(id: ToolId): void {
  if (rt.polyDraft && id !== 'poly') {
    rt.polyDraft = null;
    syncPolyBar();
  }
  if (rt.pickOnce) {
    rt.pickOnce = null;
    rt.pickReopen = null;
    hideBar('pick');
  }
  S.tool = id;
  document
    .querySelectorAll<HTMLElement>('.tool')
    .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === id)));
  renderToolOpts();
  updateCursor(null);
  markOverlay();
}

export function renderToolBar(): void {
  el('tools').innerHTML =
    TOOL_BAR.map((t) =>
      'sep' in t
        ? '<div class="tool-sep" role="separator"></div>'
        : `<button class="tool" type="button" data-tool="${t.id}" aria-pressed="false" aria-label="${t.name}" title="${t.name} (${t.key.toUpperCase()})">${svg(ICON[t.id])}<span class="k">${t.key.toUpperCase()}</span></button>`,
    ).join('') +
    `<div class="tool-sep" role="separator"></div><input type="color" class="swatch" id="cur-color" value="${opts.color}" title="Cor atual (Pincel)" aria-label="Cor atual">`;
}

const colorBlock = () =>
  `<div class="cur-color"><input type="color" class="swatch" id="opt-color" value="${opts.color}" aria-label="Cor atual"><div><span class="hex" id="opt-color-hex">${opts.color}</span><small>cor atual · pegue da imagem com o Conta-gotas (I)</small></div></div>`;

const range = (id: string, label: string, min: number, max: number, val: number, unit: string, step = 1) =>
  `<div class="field"><label for="${id}">${label}</label><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}"><output id="${id}-v">${val}${unit}</output></div>`;

const check = (id: string, on: boolean, label: string) =>
  `<label class="chk"><input type="checkbox" id="${id}" ${on ? 'checked' : ''}> ${label}</label>`;

const radios = (name: string, items: [string | number, string][], current: string | number, extra = '') =>
  `<div class="seg"${extra} role="radiogroup">${items
    .map(
      ([v, n]) =>
        `<label><input type="radio" name="${name}" value="${v}" ${current === v ? 'checked' : ''}>${n}</label>`,
    )
    .join('')}</div>`;

const ALIGN_ICONS: [AlignMode, string, string][] = [
  [
    'left',
    'Alinhar à esquerda',
    '<path d="M4 3v18"/><rect x="7" y="6" width="12" height="4" rx="1"/><rect x="7" y="14" width="7" height="4" rx="1"/>',
  ],
  [
    'hcenter',
    'Centralizar na horizontal',
    '<path d="M12 3v18"/><rect x="5" y="6" width="14" height="4" rx="1"/><rect x="8" y="14" width="8" height="4" rx="1"/>',
  ],
  [
    'right',
    'Alinhar à direita',
    '<path d="M20 3v18"/><rect x="5" y="6" width="12" height="4" rx="1"/><rect x="10" y="14" width="7" height="4" rx="1"/>',
  ],
  [
    'top',
    'Alinhar no topo',
    '<path d="M3 4h18"/><rect x="6" y="7" width="4" height="12" rx="1"/><rect x="14" y="7" width="4" height="7" rx="1"/>',
  ],
  [
    'vcenter',
    'Centralizar na vertical',
    '<path d="M3 12h18"/><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="8" width="4" height="8" rx="1"/>',
  ],
  [
    'bottom',
    'Alinhar na base',
    '<path d="M3 20h18"/><rect x="6" y="5" width="4" height="12" rx="1"/><rect x="14" y="10" width="4" height="7" rx="1"/>',
  ],
  [
    'center',
    'Centralizar nos dois sentidos',
    '<rect x="7" y="7" width="10" height="10" rx="1.5"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
  ],
];

function moveOptions(): string {
  const align = ALIGN_ICONS.map(
    ([k, name, icon]) =>
      (k === 'top' || k === 'center' ? '<span class="sep"></span>' : '') +
      `<button class="btn" type="button" data-align="${k}" title="${name}" aria-label="${name}">${svg(icon)}</button>`,
  ).join('');
  return `${check('opt-auto', opts.autoSelect, 'Escolher a camada clicando nela')}
    ${check('opt-snap', opts.snap, 'Encaixar com guias ao arrastar')}
    <div class="xform">
      <label>X (px)<input type="number" id="tf-x" step="1"></label><label>Y (px)<input type="number" id="tf-y" step="1"></label>
      <label>Largura (px)<input type="number" id="tf-w" step="1" min="1"></label><label>Altura (px)<input type="number" id="tf-h" step="1" min="1"></label>
      <label>Giro (°)<input type="number" id="tf-r" step="1"></label>${check('opt-ratio', opts.keepRatio, 'Manter proporção')}
    </div>
    <p class="mini-title">Alinhar com</p>
    <div style="margin-bottom:8px"><select id="al-to" aria-label="Alinhar com"></select></div>
    <div class="align-btns">${align}</div>
    <div class="btn-wrap">
      <button class="btn small" type="button" data-x="flipx">Espelhar ↔</button><button class="btn small" type="button" data-x="flipy">Espelhar ↕</button>
      <button class="btn small" type="button" data-x="rot90">Girar 90°</button>
      <button class="btn small" type="button" data-x="fit">Caber na tela</button><button class="btn small" type="button" data-x="cover">Cobrir a tela</button>
      <button class="btn small" type="button" data-x="reset">Redefinir</button>
    </div>`;
}

export function renderToolOpts(): void {
  const t = toolDef(S.tool);
  el('tool-title').textContent = t.name;
  el('tool-key').textContent = t.key.toUpperCase();
  el('dock-tool').textContent = t.name;
  let h = '';
  if (t.id === 'move') h = moveOptions();
  else if (SEL_TOOLS.includes(t.id)) {
    h = radios(
      'selmode',
      [
        ['new', 'Nova'],
        ['add', 'Adicionar'],
        ['sub', 'Subtrair'],
      ],
      opts.selMode,
      ' aria-label="Modo da seleção"',
    );
    if (t.id === 'wand')
      h +=
        range('opt-tol', 'Tolerância', 0, 150, opts.wandTol, '') +
        check('opt-contig', opts.wandContig, 'Só áreas encostadas');
    h += FILTER_OK
      ? range('opt-feather', 'Suavizar borda', 0, 60, opts.feather, ' px')
      : '<p class="hint">Suavizar borda não funciona neste navegador.</p>';
    if (t.id === 'poly')
      h += '<button class="btn small" type="button" id="poly-close">Fechar contorno</button>';
  } else if (t.id === 'picker') {
    h =
      colorBlock() +
      '<p class="mini-title" style="margin-top:0">Tamanho da amostra</p>' +
      radios(
        'picksize',
        [
          [1, 'Ponto'],
          [3, 'Média 3×3'],
          [5, 'Média 5×5'],
        ],
        opts.pickSize,
        ' aria-label="Tamanho da amostra"',
      );
  } else if (t.id === 'paint' || t.id === 'erase') {
    const pix = opts.paintTip === 'pixel';
    h =
      (t.id === 'paint' ? colorBlock() : '') +
      radios(
        'tip',
        [
          ['soft', 'Ponta macia'],
          ['pixel', 'Ponta pixel'],
        ],
        opts.paintTip,
        ' style="grid-template-columns:1fr 1fr" aria-label="Ponta"',
      ) +
      range('opt-size', 'Tamanho', 1, 1000, opts.brushSize, ' px') +
      (pix
        ? '<p class="hint" style="margin:0 0 9px">Ponta pixel: borda dura e cor sólida, pixel por pixel. Dê zoom (Ctrl +) para ver a grade.</p>'
        : range('opt-hard', 'Dureza', 0, 100, opts.brushHard, '%') +
          range('opt-str', 'Força', 5, 100, opts.brushStrength, '%')) +
      (t.id === 'paint' ? check('opt-lock', opts.paintLock, 'Pintar só por cima do que já existe') : '') +
      check('opt-line', opts.lineMode, 'Ligar ao último ponto com linha reta');
  } else if (t.id === 'bucket') {
    h =
      colorBlock() +
      range('opt-btol', 'Tolerância', 0, 150, opts.bucketTol, '') +
      range('opt-str', 'Força', 5, 100, opts.brushStrength, '%') +
      check('opt-bcontig', opts.bucketContig, 'Só áreas encostadas') +
      check('opt-ball', opts.bucketAll, 'Achar a área olhando todas as camadas') +
      check('opt-bgrow', opts.bucketGrow, 'Cobrir a franja da borda (1 px)') +
      check('opt-lock', opts.paintLock, 'Pintar só por cima do que já existe');
  } else if (t.id === 'remove') {
    h =
      range('opt-rsize', 'Tamanho', 4, 400, opts.removeSize, ' px') +
      '<p class="hint" style="margin:0 0 6px">Cubra o objeto inteiro com uma pequena sobra. Funciona melhor quando o fundo em volta tem cor contínua ou textura (céu, parede, grama, papel).</p>';
  } else if (t.id === 'restore') {
    h =
      range('opt-size', 'Tamanho', 1, 1000, opts.brushSize, ' px') +
      range('opt-hard', 'Dureza', 0, 100, opts.brushHard, '%') +
      range('opt-str', 'Força', 5, 100, opts.brushStrength, '%');
  }
  h += `<p class="hint">${t.hint}</p>`;
  el('tool-opts').innerHTML = h;
  syncXform();
  el('st-hint').textContent = toolHint();
}

/** Keep the move tool's number fields in step with the active layer. */
export function syncXform(): void {
  if (S.tool !== 'move') return;
  const l = active(),
    ids = ['tf-x', 'tf-y', 'tf-w', 'tf-h', 'tf-r'];
  for (const id of ids) {
    const e = maybe<HTMLInputElement>(id);
    if (e) e.disabled = !l;
  }
  document.querySelectorAll<HTMLButtonElement>('#tool-opts [data-align]').forEach((b) => (b.disabled = !l));
  fillAlignTargets();
  if (!l) return;
  const vals: Record<string, number> = {
    'tf-x': Math.round(l.x),
    'tf-y': Math.round(l.y),
    'tf-w': Math.round(l.canvas.width * l.sx),
    'tf-h': Math.round(l.canvas.height * l.sy),
    'tf-r': Math.round(l.rot),
  };
  for (const id of ids) {
    const e = maybe<HTMLInputElement>(id);
    if (e && document.activeElement !== e) e.value = String(vals[id]);
  }
}

/** Sliders → numeric option and the unit shown next to them. */
const RANGE_OPTS: Record<string, [keyof Options, string]> = {
  'opt-rsize': ['removeSize', ' px'],
  'opt-btol': ['bucketTol', ''],
  'opt-feather': ['feather', ' px'],
  'opt-tol': ['wandTol', ''],
  'opt-size': ['brushSize', ' px'],
  'opt-hard': ['brushHard', '%'],
  'opt-str': ['brushStrength', '%'],
};
/** Checkboxes → boolean option. */
const CHECK_OPTS: Record<string, keyof Options> = {
  'opt-lock': 'paintLock',
  'opt-bcontig': 'bucketContig',
  'opt-ball': 'bucketAll',
  'opt-bgrow': 'bucketGrow',
  'opt-line': 'lineMode',
  'opt-auto': 'autoSelect',
  'opt-snap': 'snap',
  'opt-ratio': 'keepRatio',
  'opt-contig': 'wandContig',
};

export function initToolPanel(): void {
  const panel = el('tool-opts');
  panel.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    const r = RANGE_OPTS[t.id];
    if (r) {
      (opts as unknown as Record<string, number>)[r[0]] = Number(t.value);
      const out = maybe(t.id + '-v');
      if (out) out.textContent = t.value + r[1];
      saveOpts();
      markOverlay();
    }
    if (t.id === 'opt-color') setCurrentColor(t.value, true);
  });
  panel.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement;
    const o = opts as unknown as Record<string, unknown>;
    if (t.name === 'selmode') o.selMode = t.value;
    else if (t.name === 'picksize') o.pickSize = Number(t.value);
    else if (t.name === 'tip') {
      o.paintTip = t.value;
      saveOpts();
      renderToolOpts();
      markOverlay();
      return;
    } else if (CHECK_OPTS[t.id]) o[CHECK_OPTS[t.id]] = t.checked;
    else if (t.id === 'al-to') o.alignTo = t.value;
    else {
      onTransformField(t);
      return;
    }
    saveOpts();
  });
  panel.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('button');
    if (!b) return;
    if (b.dataset.x) xformAction(b.dataset.x as XformAction);
    if (b.dataset.align) alignActive(b.dataset.align as AlignMode);
    if (b.id === 'poly-close') finishPoly();
  });
  const bar = el('tools');
  bar.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('.tool');
    if (b?.dataset.tool) setTool(b.dataset.tool as ToolId);
  });
  bar.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.id === 'cur-color') setCurrentColor(t.value, true);
  });
}

/** X, Y, width, height and rotation typed into the move tool's fields. */
function onTransformField(t: HTMLInputElement): void {
  const l = active();
  if (!l || !t.id.startsWith('tf-')) return;
  const v = Number(t.value);
  if (!isFinite(v)) return;
  if (t.id === 'tf-x') l.x = v;
  else if (t.id === 'tf-y') l.y = v;
  else if (t.id === 'tf-w' || t.id === 'tf-h') {
    const byW = t.id === 'tf-w',
      cur = byW ? l.canvas.width * l.sx : l.canvas.height * l.sy,
      k = Math.max(1, v) / cur;
    if (opts.keepRatio) {
      l.sx *= k;
      l.sy *= k;
    } else if (byW) l.sx *= k;
    else l.sy *= k;
    commit(opts.keepRatio ? 'Redimensionar' : byW ? 'Esticar na horizontal' : 'Esticar na vertical');
    dirtyAll();
    syncXform();
    return;
  } else if (t.id === 'tf-r') l.rot = ((((v + 180) % 360) + 360) % 360) - 180;
  commit('Transformar');
  dirtyAll();
  syncXform();
}
