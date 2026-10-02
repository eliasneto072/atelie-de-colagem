/** The side panel: what the chosen task does, its options, and the button that makes the file. */
import { baseName, describePages, pagesIn, parseRanges } from '../core/pages';
import { saveImages, saveParts, savePdf } from './actions';
import { opts, saveOpts } from './options';
import { selectAll } from './grid';
import { editBody, editKey, initEditPanel } from './editPanel';
import { moveFile, removeFile } from './sources';
import { hasEdits, hasImages, hasPageWideEdits, selectedPages, st, type Page, type Task } from './state';
import { $, plural, toast } from './ui';

type SplitMode = 'selecionadas' | 'cada' | 'partes';
let splitMode: SplitMode = 'selecionadas';
let partsText = '';
let imagesWhich: 'todas' | 'selecionadas' = 'todas';

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const TITLES: Record<Task, { title: string; text: string }> = {
  juntar: {
    title: 'Juntar PDFs',
    text: 'Coloque dois ou mais arquivos. As páginas saem na ordem da grade: arraste para mudar.',
  },
  organizar: {
    title: 'Organizar páginas',
    text: 'Arraste para mudar a ordem, gire e tire páginas. Depois baixe o PDF arrumado.',
  },
  editar: {
    title: 'Editar e assinar',
    text: 'Escolha uma ferramenta na barra de cima e clique na página: escreva, assine, marque caixinhas, cubra ou esconda dados.',
  },
  separar: {
    title: 'Separar PDF',
    text: 'Tire só as páginas que você precisa ou divida o arquivo em partes.',
  },
  fotos: {
    title: 'Fotos para PDF',
    text: 'Junte fotos de documentos, recibos ou anotações em um PDF só. Arraste para mudar a ordem.',
  },
  imagens: {
    title: 'PDF para imagens',
    text: 'Transforme cada página em uma imagem JPG ou PNG.',
  },
};

const seg = (name: string, value: string, items: [string, string][]) =>
  `<div class="seg" role="radiogroup">${items
    .map(
      ([v, label]) =>
        `<label><input type="radio" name="${name}" value="${v}"${v === value ? ' checked' : ''} />${label}</label>`,
    )
    .join('')}</div>`;

const photoOptions = () => `
  <div class="opt">
    <p class="opt-title">Tamanho da página das fotos</p>
    ${seg('o-size', opts.pageSize, [
      ['a4', 'A4'],
      ['carta', 'Carta'],
      ['foto', 'Igual à foto'],
    ])}
  </div>
  <div class="opt"${opts.pageSize === 'foto' ? ' hidden' : ''} id="o-margin-row">
    <p class="opt-title">Margem</p>
    ${seg('o-margin', opts.margin ? 'sim' : 'nao', [
      ['nao', 'Sem margem'],
      ['sim', 'Com margem'],
    ])}
  </div>
  <div class="opt">
    <p class="opt-title">Qualidade das fotos</p>
    ${seg('o-quality', opts.quality, [
      ['normal', 'Normal'],
      ['alta', 'Alta'],
    ])}
    <p class="hint">Normal deixa o arquivo menor, bom para enviar em sites e por mensagem.</p>
  </div>`;

function filesList(): string {
  if (!st.files.length) return '';
  return `<div class="opt"><p class="opt-title">Arquivos</p><ul class="files">${st.files
    .map((f, i) => {
      const n = st.pages.filter((p) => p.source === f).length;
      return `<li data-file="${f.id}">
        <i style="--c:${f.color}"></i>
        <span class="fname" title="${esc(f.name)}">${esc(f.name)}</span>
        <span class="fcount">${n} p.</span>
        <button type="button" data-fact="up" aria-label="Subir ${esc(f.name)}" title="Subir"${i === 0 ? ' disabled' : ''}>↑</button>
        <button type="button" data-fact="down" aria-label="Descer ${esc(f.name)}" title="Descer"${i === st.files.length - 1 ? ' disabled' : ''}>↓</button>
        <button type="button" data-fact="rm" aria-label="Tirar ${esc(f.name)}" title="Tirar o arquivo">✕</button>
      </li>`;
    })
    .join('')}</ul></div>`;
}

function body(task: Task): string {
  const t = TITLES[task];
  let h = `<h2>${t.title}</h2><p class="lead">${t.text}</p>`;
  if (task === 'editar') {
    return (
      h +
      editBody() +
      `<div class="opt"><label class="opt-title" for="o-name">Nome do arquivo</label><input type="text" id="o-name" autocomplete="off" spellcheck="false" /></div>`
    );
  }
  if (hasEdits() || hasPageWideEdits())
    h += `<p class="note">Suas edições (textos, assinaturas, tarjas, marca d'água e números) entram no arquivo.</p>`;
  if (task === 'juntar') h += filesList();
  if (task === 'organizar')
    h += `<ul class="tips"><li>Clique para selecionar; Shift+clique pega um intervalo.</li><li>No celular, segure a página um instante e arraste.</li><li>Teclado: R gira, Delete tira, Ctrl+setas movem, Ctrl+Z desfaz.</li></ul>`;
  if (task === 'separar') {
    h += `<div class="opt"><p class="opt-title">Como separar</p>
      <label class="radio"><input type="radio" name="o-split" value="selecionadas"${splitMode === 'selecionadas' ? ' checked' : ''} /> Só as páginas que eu escolher, em um PDF</label>
      <label class="radio"><input type="radio" name="o-split" value="cada"${splitMode === 'cada' ? ' checked' : ''} /> Cada página em um PDF separado</label>
      <label class="radio"><input type="radio" name="o-split" value="partes"${splitMode === 'partes' ? ' checked' : ''} /> Em partes, por intervalos</label>
    </div>
    <div class="opt" id="o-pick-row"${splitMode === 'selecionadas' ? '' : ' hidden'}>
      <label class="opt-title" for="o-pick">Escolher pelo número</label>
      <div class="inline"><input type="text" id="o-pick" inputmode="numeric" placeholder="Ex.: 1-3, 5" autocomplete="off" /><button type="button" class="btn" id="o-pick-go">Selecionar</button></div>
      <p class="hint">Ou clique nas páginas da grade.</p>
    </div>
    <div class="opt" id="o-parts-row"${splitMode === 'partes' ? '' : ' hidden'}>
      <label class="opt-title" for="o-parts">Partes</label>
      <input type="text" id="o-parts" inputmode="numeric" placeholder="Ex.: 1-3, 4-10, 11-" value="${esc(partsText)}" autocomplete="off" />
      <p class="hint">Cada intervalo vira um PDF. "11-" vai da página 11 até o fim.</p>
    </div>`;
  }
  if (task === 'imagens') {
    h += `<div class="opt"><p class="opt-title">Formato</p>${seg('o-format', opts.format, [
      ['jpg', 'JPG'],
      ['png', 'PNG'],
    ])}<p class="hint">JPG fica menor; PNG mantém letras pequenas mais nítidas.</p></div>
    <div class="opt"><p class="opt-title">Resolução</p>${seg('o-dpi', String(opts.dpi), [
      ['150', 'Média (150 dpi)'],
      ['300', 'Alta (300 dpi)'],
    ])}</div>
    <div class="opt"><p class="opt-title">Quais páginas</p>${seg('o-which', imagesWhich, [
      ['todas', 'Todas'],
      ['selecionadas', 'Só as selecionadas'],
    ])}</div>`;
  }
  if (task === 'fotos' || (hasImages() && task !== 'imagens')) h += photoOptions();
  h += `<div class="opt"><label class="opt-title" for="o-name">Nome do arquivo</label><input type="text" id="o-name" autocomplete="off" spellcheck="false" /></div>`;
  return h;
}

const firstName = () => (st.files[0] ? baseName(st.files[0].name) : 'documento');

function suggestedName(task: Task): string {
  const base = firstName();
  if (task === 'juntar') return st.files.length > 1 ? `${base}-juntado` : base;
  if (task === 'organizar') return `${base}-organizado`;
  if (task === 'editar') return `${base}-editado`;
  if (task === 'fotos') return st.files.every((f) => f.kind === 'image') ? 'fotos' : base;
  return base;
}

/** What the person typed as file name ('' = use the suggestion). Survives panel rebuilds. */
let typedName = '';
const nameInput = () => document.getElementById('o-name') as HTMLInputElement | null;
const chosenName = (task: Task) => baseName(typedName.trim() || suggestedName(task));

/** What the main button does now, and whether it can. */
function primary(task: Task): { label: string; enabled: boolean } {
  const n = st.pages.length,
    sel = selectedPages().length;
  if (!n) return { label: task === 'imagens' ? 'Baixar imagens' : 'Baixar PDF', enabled: false };
  switch (task) {
    case 'juntar':
      return { label: 'Juntar e baixar PDF', enabled: true };
    case 'organizar':
      return { label: 'Baixar PDF', enabled: true };
    case 'editar':
      return { label: 'Baixar PDF editado', enabled: true };
    case 'fotos':
      return { label: 'Criar PDF', enabled: true };
    case 'separar':
      if (splitMode === 'selecionadas')
        return {
          label: sel ? `Baixar ${plural(sel, 'página', 'páginas')}` : 'Escolha as páginas',
          enabled: sel > 0,
        };
      if (splitMode === 'cada') return { label: `Baixar ${n} PDFs (ZIP)`, enabled: n > 1 };
      return { label: 'Baixar as partes', enabled: partsText.trim().length > 0 };
    case 'imagens': {
      const k = imagesWhich === 'selecionadas' ? sel : n;
      return { label: k === 1 ? 'Baixar imagem' : `Baixar ${k} imagens`, enabled: k > 0 };
    }
  }
}

let renderedFor = '';

/** Rebuild the panel's body when the task or the files change; otherwise just refresh labels. */
export function renderPanel(): void {
  const task = st.task;
  const key = `${task}|${st.files.map((f) => f.id).join(',')}|${hasImages()}|${st.pages.length}|${
    task === 'editar' ? editKey() : hasEdits() || hasPageWideEdits()
  }`;
  if (key !== renderedFor) {
    const keep = document.activeElement?.id;
    $('panel-body').innerHTML = body(task);
    renderedFor = key;
    const input = nameInput();
    if (input) input.value = typedName || suggestedName(task);
    if (keep) document.getElementById(keep)?.focus();
  }
  const p = primary(task);
  const btn = $<HTMLButtonElement>('primary');
  btn.textContent = p.label;
  btn.disabled = !p.enabled;
}

async function run(): Promise<void> {
  const task = st.task;
  const name = chosenName(task);
  if (task === 'juntar' || task === 'organizar' || task === 'fotos' || task === 'editar')
    return savePdf(st.pages, name);
  if (task === 'imagens') {
    const pages = imagesWhich === 'selecionadas' ? selectedPages() : st.pages;
    return saveImages(
      pages,
      name,
      pages.map((p) => st.pages.indexOf(p) + 1),
    );
  }
  // separar
  if (splitMode === 'selecionadas') {
    const sel = selectedPages();
    const label = describePages(sel.map((p) => st.pages.indexOf(p) + 1)).replace(/, /g, '_');
    return savePdf(sel, `${name}-paginas-${label}`);
  }
  if (splitMode === 'cada') {
    return saveParts(
      st.pages.map((p, i) => ({ pages: [p], name: `${name}-pagina-${i + 1}` })),
      `${name}-paginas`,
    );
  }
  const r = parseRanges(partsText, st.pages.length);
  if (!r.ok) {
    toast(r.error);
    document.getElementById('o-parts')?.focus();
    return;
  }
  const groups = r.ranges.map((rg) => ({
    pages: st.pages.slice(rg.from - 1, rg.to) as Page[],
    name: `${name}-paginas-${rg.from === rg.to ? rg.from : `${rg.from}-${rg.to}`}`,
  }));
  return saveParts(groups, `${name}-partes`);
}

export function initPanel(refresh: () => void): void {
  const panel = $('panel');
  initEditPanel(panel, refresh);
  panel.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement;
    switch (t.name) {
      case 'o-size':
        opts.pageSize = t.value as typeof opts.pageSize;
        document.getElementById('o-margin-row')?.toggleAttribute('hidden', opts.pageSize === 'foto');
        break;
      case 'o-margin':
        opts.margin = t.value === 'sim';
        break;
      case 'o-quality':
        opts.quality = t.value as typeof opts.quality;
        break;
      case 'o-format':
        opts.format = t.value as typeof opts.format;
        break;
      case 'o-dpi':
        opts.dpi = Number(t.value) as typeof opts.dpi;
        break;
      case 'o-which':
        imagesWhich = t.value as typeof imagesWhich;
        break;
      case 'o-split':
        splitMode = t.value as SplitMode;
        document.getElementById('o-pick-row')?.toggleAttribute('hidden', splitMode !== 'selecionadas');
        document.getElementById('o-parts-row')?.toggleAttribute('hidden', splitMode !== 'partes');
        break;
      default:
        return;
    }
    saveOpts();
    refresh();
  });

  panel.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.id === 'o-name') typedName = t.value;
    if (t.id === 'o-parts') {
      partsText = t.value;
      refresh();
    }
  });

  const pick = () => {
    const input = document.getElementById('o-pick') as HTMLInputElement | null;
    if (!input) return;
    const r = parseRanges(input.value, st.pages.length);
    if (!r.ok) return toast(r.error);
    const wanted = new Set(pagesIn(r.ranges));
    selectAll(false);
    st.pages.forEach((p, i) => (p.selected = wanted.has(i + 1)));
    refresh();
    toast(`${plural(wanted.size, 'página selecionada', 'páginas selecionadas')}`);
  };

  panel.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.id === 'o-pick-go') return pick();
    const act = t.closest<HTMLElement>('[data-fact]')?.dataset.fact;
    const id = Number(t.closest<HTMLElement>('[data-file]')?.dataset.file);
    if (!act || !id) return;
    if (act === 'rm') removeFile(id);
    else moveFile(id, act === 'up' ? -1 : 1);
    refresh();
  });

  panel.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    if (e.key !== 'Enter') return;
    if (t.id === 'o-pick') {
      e.preventDefault();
      pick();
    } else if (t.id === 'o-parts' || t.id === 'o-name') {
      e.preventDefault();
      $('primary').click();
    }
  });

  $('primary').addEventListener('click', () => {
    panel.classList.remove('open');
    void run();
  });
  $('panel-toggle').addEventListener('click', () => panel.classList.toggle('open'));
}
