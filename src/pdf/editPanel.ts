/** The panel for "Editar e assinar": the selected item's options, signatures, watermark and page numbers. */
import type { Edit, RectEdit } from './edits';
import { st, type Tool } from './state';
import { toast } from './ui';
import { pickSignature, removeCurrent, repeatCurrent, setTool, updateCurrent } from './viewer';

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const seg = (name: string, value: string, items: [string, string][]) =>
  `<div class="seg" role="radiogroup">${items
    .map(
      ([v, label]) =>
        `<label><input type="radio" name="${name}" value="${v}"${v === value ? ' checked' : ''} />${label}</label>`,
    )
    .join('')}</div>`;

const INKS: [string, string][] = [
  ['#111111', 'Preto'],
  ['#1a3fb0', 'Azul'],
  ['#c0392b', 'Vermelho'],
];
const COVERS: [string, string][] = [
  ['#ffffff', 'Branco'],
  ['#f4f1e8', 'Papel'],
  ['#111111', 'Preto'],
];

const swatches = (name: string, value: string, list: [string, string][]) =>
  `<div class="swatches" role="radiogroup">${list
    .map(
      ([c, label]) =>
        `<label title="${label}"><input type="radio" name="${name}" value="${c}"${c.toLowerCase() === value.toLowerCase() ? ' checked' : ''} aria-label="${label}" /><i style="--c:${c}"></i></label>`,
    )
    .join('')}</div>`;

const HINTS: Record<Tool, string> = {
  select: 'Clique num item da página para mover, mudar ou excluir. Arraste a página para rolar.',
  text: 'Clique onde quer escrever. Enter pula linha; clique fora para terminar.',
  sign: 'Clique onde quer pôr a assinatura. Depois dá para mover, aumentar e repetir em todas as páginas.',
  check: 'Clique nas caixinhas para marcar.',
  x: 'Clique nas caixinhas para marcar.',
  dot: 'Clique nas caixinhas para marcar.',
  cover:
    'Arraste sobre o que quer cobrir, para escrever por cima. O que está embaixo continua no arquivo: para esconder dados, use a Tarja.',
  redact:
    'Arraste sobre o que quer esconder (CPF, conta, endereço). A tarja apaga de verdade: no arquivo final, a página com tarja vira imagem.',
  highlight: 'Arraste sobre o trecho para destacar.',
};

function selectedOptions(e: Edit): string {
  const actions = `<div class="ed-actions">
      <button type="button" class="btn small" data-ed="repeat">${e.kind === 'image' ? 'Rubricar todas as páginas' : 'Repetir em todas as páginas'}</button>
      <button type="button" class="btn small danger" data-ed="delete">Excluir</button>
    </div>`;
  if (e.kind === 'text') {
    return `<div class="opt sel-opts"><p class="opt-title">Texto selecionado</p>
      <div class="inline size-row">
        <button type="button" class="btn small" data-ed="smaller" aria-label="Diminuir a letra">A−</button>
        <span class="size-val">${Math.round(e.size)} pt</span>
        <button type="button" class="btn small" data-ed="bigger" aria-label="Aumentar a letra">A+</button>
        <button type="button" class="btn small${e.bold ? ' on' : ''}" data-ed="bold" aria-pressed="${e.bold}"><b>N</b>&nbsp;Negrito</button>
      </div>
      ${swatches('ed-color', e.color, INKS)}
      ${actions}</div>`;
  }
  if (e.kind === 'mark') {
    return `<div class="opt sel-opts"><p class="opt-title">Marca selecionada</p>
      <div class="inline size-row">
        <button type="button" class="btn small" data-ed="smaller" aria-label="Diminuir">−</button>
        <span class="size-val">${Math.round(e.size)} pt</span>
        <button type="button" class="btn small" data-ed="bigger" aria-label="Aumentar">+</button>
      </div>
      ${swatches('ed-color', e.color, INKS)}
      ${actions}</div>`;
  }
  if (e.kind === 'image') {
    return `<div class="opt sel-opts"><p class="opt-title">Assinatura selecionada</p>
      <p class="hint">Arraste para mover; o canto de baixo aumenta ou diminui.</p>${actions}</div>`;
  }
  const r = e as RectEdit;
  return `<div class="opt sel-opts"><p class="opt-title">Caixa selecionada</p>
    ${seg('ed-style', r.style, [
      ['cover', 'Cobrir'],
      ['redact', 'Tarja'],
      ['highlight', 'Marca-texto'],
    ])}
    ${r.style === 'cover' ? swatches('ed-cover', r.color, COVERS) : ''}
    ${r.style === 'redact' ? '<p class="hint">Apaga de verdade: esta página vira imagem no arquivo final.</p>' : ''}
    ${actions}</div>`;
}

export function editBody(): string {
  const cur = st.current?.edit;
  let h = cur ? selectedOptions(cur) : `<p class="tool-hint">${HINTS[st.tool]}</p>`;
  h += `<div class="opt"><p class="opt-title">Assinaturas</p><div class="sigs">${st.signatures
    .map(
      (s) =>
        `<button type="button" class="sig${st.signature === s ? ' on' : ''}" data-sig="${s.id}" aria-label="Usar esta assinatura"><img src="${s.url}" alt="" /></button>`,
    )
    .join(
      '',
    )}<button type="button" class="btn small" data-ed="new-sig">+ ${st.signatures.length ? 'Outra' : 'Criar'} assinatura</button></div>
    <p class="hint">Assinatura desenhada é uma imagem: não tem a validade jurídica de uma assinatura digital. Para isso, use o <a href="https://assinador.iti.br" target="_blank" rel="noopener">assinador gratuito do gov.br</a>.</p></div>`;

  const wm = st.watermark;
  h += `<div class="opt"><label class="chk"><input type="checkbox" id="wm-on"${wm.on ? ' checked' : ''} /> Marca d'água em todas as páginas</label>
    <div class="sub-opts"${wm.on ? '' : ' hidden'}>
      <input type="text" id="wm-text" value="${esc(wm.text)}" placeholder="Ex.: CÓPIA — uso exclusivo para inscrição" autocomplete="off" />
      ${seg('wm-opacity', String(wm.opacity), [
        ['0.1', 'Leve'],
        ['0.18', 'Média'],
        ['0.3', 'Forte'],
      ])}
      ${seg('wm-color', wm.color, [
        ['#7a7a7a', 'Cinza'],
        ['#c0392b', 'Vermelho'],
        ['#1f5fbf', 'Azul'],
      ])}
      <p class="hint">Protege cópias de documentos: diga para que a cópia serve.</p>
    </div></div>`;

  const nb = st.numbering;
  h += `<div class="opt"><label class="chk"><input type="checkbox" id="nb-on"${nb.on ? ' checked' : ''} /> Numerar as páginas</label>
    <div class="sub-opts"${nb.on ? '' : ' hidden'}>
      ${seg('nb-format', nb.format, [
        ['n', '1'],
        ['n/N', '1 / 9'],
        ['pagina', 'Página 1 de 9'],
      ])}
      <p class="opt-sub">Onde</p>
      ${seg('nb-position', nb.position, [
        ['bottom-center', 'Embaixo'],
        ['bottom-right', 'Canto de baixo'],
        ['top-right', 'Canto de cima'],
      ])}
      <div class="inline"><label for="nb-start" class="lbl">Começar em</label><input type="number" id="nb-start" min="0" max="9999" value="${nb.start}" inputmode="numeric" /></div>
      <label class="chk"><input type="checkbox" id="nb-skip"${nb.skipFirst ? ' checked' : ''} /> Sem número na primeira página (capa)</label>
    </div></div>`;
  return h;
}

/** Part of the panel's rebuild key: what, when changed, needs the edit panel redrawn. */
export function editKey(): string {
  const e = st.current?.edit;
  const sel = e
    ? JSON.stringify({ ...e, x: 0, y: 0, ...(e.kind === 'image' ? { sig: e.sig.id, w: 0, h: 0 } : {}) })
    : '';
  return `${st.tool}|${sel}|${st.signatures.length}|${st.signature?.id}|${st.watermark.on}|${st.numbering.on}`;
}

export function initEditPanel(panel: HTMLElement, refresh: () => void): void {
  panel.addEventListener('click', (ev) => {
    const t = ev.target as HTMLElement;
    const sigBtn = t.closest<HTMLElement>('[data-sig]');
    if (sigBtn) {
      st.signature = st.signatures.find((s) => s.id === Number(sigBtn.dataset.sig)) ?? null;
      setTool('sign');
      return;
    }
    const act = t.closest<HTMLElement>('[data-ed]')?.dataset.ed;
    if (!act) return;
    const cur = st.current?.edit;
    if (act === 'new-sig') {
      void pickSignature().then((ok) => ok && setTool('sign'));
    } else if (act === 'delete') removeCurrent();
    else if (act === 'repeat') {
      const n = repeatCurrent();
      toast(n ? `Repetido em mais ${n} ${n === 1 ? 'página' : 'páginas'}` : 'Só existe esta página');
    } else if (
      cur &&
      (act === 'bigger' || act === 'smaller') &&
      (cur.kind === 'text' || cur.kind === 'mark')
    ) {
      const k = act === 'bigger' ? 1.15 : 1 / 1.15;
      updateCurrent({ size: Math.max(5, Math.min(144, Math.round(cur.size * k * 2) / 2)) });
    } else if (cur && act === 'bold' && cur.kind === 'text') updateCurrent({ bold: !cur.bold });
  });

  panel.addEventListener('change', (ev) => {
    const t = ev.target as HTMLInputElement;
    const cur = st.current?.edit;
    if (t.name === 'ed-color' && cur) updateCurrent({ color: t.value });
    else if (t.name === 'ed-cover' && cur) updateCurrent({ color: t.value });
    else if (t.name === 'ed-style' && cur?.kind === 'rect') {
      const style = t.value as RectEdit['style'];
      updateCurrent({
        style,
        color: style === 'highlight' ? '#ffe14d' : style === 'cover' ? '#ffffff' : '#000000',
      } as Partial<Edit>);
    } else if (t.id === 'wm-on') st.watermark.on = t.checked;
    else if (t.name === 'wm-opacity') st.watermark.opacity = Number(t.value);
    else if (t.name === 'wm-color') st.watermark.color = t.value;
    else if (t.id === 'nb-on') st.numbering.on = t.checked;
    else if (t.name === 'nb-format') st.numbering.format = t.value as typeof st.numbering.format;
    else if (t.name === 'nb-position') st.numbering.position = t.value as typeof st.numbering.position;
    else if (t.id === 'nb-skip') st.numbering.skipFirst = t.checked;
    else return;
    refresh();
  });

  panel.addEventListener('input', (ev) => {
    const t = ev.target as HTMLInputElement;
    if (t.id === 'wm-text') st.watermark.text = t.value;
    else if (t.id === 'nb-start')
      st.numbering.start = Math.max(0, Math.min(9999, Math.round(Number(t.value) || 0)));
  });
}
