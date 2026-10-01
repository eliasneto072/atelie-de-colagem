import type { ToolId } from './types';

export const ICON = {
  move: '<path d="M12 3v18M3 12h18M12 3 9.5 5.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5"/>',
  rect: '<rect x="4" y="5" width="16" height="14" rx="1" stroke-dasharray="3 2.6"/>',
  ellipse: '<ellipse cx="12" cy="12" rx="8.5" ry="7" stroke-dasharray="3 2.6"/>',
  lasso:
    '<path d="M8 16.5c-3.5-1.5-4.6-5.3-1.6-8.2 3-2.9 9.4-3.4 11.8-.6 2.4 2.8-.6 7.6-6.2 8.4-1.4.2-2.8.1-4-.4" stroke-dasharray="3 2.4"/><path d="M8 16.5c-1 1.2-.9 3 .6 4.3"/>',
  poly: '<path d="M5 18 3.8 8.5 11 4l9 5.2-3.2 9.3z" stroke-dasharray="3 2.4"/><circle cx="5" cy="18" r="1.4" fill="currentColor"/><circle cx="11" cy="4" r="1.4" fill="currentColor"/><circle cx="20" cy="9.2" r="1.4" fill="currentColor"/>',
  wand: '<path d="m4 20 10.5-10.5"/><path d="M17 3v3M17 10v3M12 8h3M19 8h3M14.2 5.2l1.4 1.4M18.4 9.4l1.4 1.4M19.8 5.2l-1.4 1.4"/>',
  erase:
    '<path d="M8.5 20H20"/><path d="m4.6 15.4 9.3-9.3a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L12 18H7.2z"/><path d="m9.2 10.8 5 5"/>',
  restore:
    '<path d="M4.5 12a7.5 7.5 0 1 0 2.4-5.5"/><path d="M4.2 3.8v4h4"/><circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"/>',
  paint:
    '<path d="m9.5 11.5 8.7-8.7a2 2 0 0 1 2.9 2.9l-8.7 8.7"/><path d="M7.4 14.3c-1.7 0-3 1.4-3 3.1 0 1.3-2.4 1.5-1.9 2 1 1.1 2.4 2 3.9 2 2.2 0 4-1.8 4-4a3 3 0 0 0-3-3.1z"/>',
  remove:
    '<path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7z"/><path d="m8.5 8.5 7 7"/><circle cx="12" cy="12" r=".9" fill="currentColor" stroke="none"/><circle cx="9.5" cy="14.5" r=".9" fill="currentColor" stroke="none"/><circle cx="14.5" cy="9.5" r=".9" fill="currentColor" stroke="none"/>',
  bucket:
    '<path d="m19 11-8-8-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2c.8.8 2 .8 2.8 0L19 11z"/><path d="m5 2 5 5"/><path d="M2 13h15"/><path d="M22 20a2 2 0 1 1-4 0c0-1.6 1.7-2.4 2-4 .3 1.6 2 2.4 2 4z"/>',
  picker:
    '<path d="m13.5 6.5 4 4"/><path d="M16.9 3.1a2.1 2.1 0 0 1 3 0l1 1a2.1 2.1 0 0 1 0 3L18.6 9.4l-4-4z"/><path d="M14.6 5.4 4.8 15.2a2 2 0 0 0-.5.9L3.5 20.5l4.4-.8a2 2 0 0 0 .9-.5l9.8-9.8"/>',
  hand: '<path d="M8 12.5V6a1.5 1.5 0 0 1 3 0v5.5M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V5.5a1.5 1.5 0 0 1 3 0V12M17 9a1.5 1.5 0 0 1 3 0v5.5a6.5 6.5 0 0 1-6.5 6.5h-1.6a6 6 0 0 1-4.8-2.4L4 15.4a1.5 1.5 0 0 1 2.3-1.9L8 15.3"/>',
  eye: '<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.8"/>',
  eyeOff:
    '<path d="M3 3l18 18"/><path d="M10.6 5.6A10 10 0 0 1 12 5.5c6.4 0 10 6.5 10 6.5a16 16 0 0 1-3 3.7M6.7 6.9C3.7 8.7 2 12 2 12s3.6 6.5 10 6.5a9.6 9.6 0 0 0 4.9-1.3"/>',
} as const;

export interface ToolDef {
  id: ToolId;
  key: string;
  name: string;
  hint: string;
}
export type ToolBarItem = ToolDef | { sep: true };

export const TOOL_BAR: ToolBarItem[] = [
  {
    id: 'move',
    key: 'v',
    name: 'Mover',
    hint: 'Arraste para mover · cantos mudam o tamanho · alças do meio esticam · bolinha gira · Alt: a partir do centro · Shift: escala livre / trava eixo · Ctrl: sem encaixe · setas empurram 1 px',
  },
  { sep: true },
  {
    id: 'rect',
    key: 'm',
    name: 'Seleção retangular',
    hint: 'Arraste para selecionar · Shift adiciona · Alt subtrai · clique simples desmarca',
  },
  {
    id: 'ellipse',
    key: 'o',
    name: 'Seleção elíptica',
    hint: 'Arraste para selecionar · Shift adiciona · Alt subtrai',
  },
  {
    id: 'lasso',
    key: 'l',
    name: 'Laço livre',
    hint: 'Desenhe o contorno segurando o botão; ao soltar, ele fecha sozinho',
  },
  {
    id: 'poly',
    key: 'p',
    name: 'Laço poligonal',
    hint: 'Clique ponto a ponto · clique no primeiro ponto, duplo clique ou Enter fecha · Backspace volta um ponto · Esc cancela',
  },
  {
    id: 'wand',
    key: 'w',
    name: 'Varinha mágica',
    hint: 'Clique numa cor da camada ativa para selecionar a área parecida. Ótimo para fundos lisos: selecione o fundo e use Inverter',
  },
  { sep: true },
  {
    id: 'paint',
    key: 'b',
    name: 'Pincel',
    hint: 'Pinta com a cor atual na camada ativa · Shift+clique faz linha reta · Alt+clique pega uma cor · [ e ] mudam o tamanho',
  },
  {
    id: 'bucket',
    key: 'g',
    name: 'Balde de tinta',
    hint: 'Clique para encher a área parecida com a cor atual · respeita a seleção · Tolerância decide até onde a tinta vai',
  },
  {
    id: 'erase',
    key: 'e',
    name: 'Borracha',
    hint: 'Apaga pixels da camada ativa · [ e ] mudam o tamanho · o original fica guardado para a ferramenta Restaurar',
  },
  {
    id: 'restore',
    key: 'r',
    name: 'Restaurar',
    hint: 'Pinta de volta o que a borracha ou o "Apagar área" tiraram desta camada',
  },
  {
    id: 'remove',
    key: 'j',
    name: 'Remover objeto',
    hint: 'Pinte por cima da letra, número ou objeto; ao soltar ele some e o fundo é refeito com o que existe em volta',
  },
  { sep: true },
  {
    id: 'picker',
    key: 'i',
    name: 'Conta-gotas',
    hint: 'Clique na imagem para pegar a cor; ela vira a cor do Pincel. Para recolorir uma camada inteira, use "Cor da camada" no painel',
  },
  {
    id: 'hand',
    key: 'h',
    name: 'Mão',
    hint: 'Arraste para navegar · segure Espaço com qualquer ferramenta · roda do mouse dá zoom',
  },
];

export const TOOLS: ToolDef[] = TOOL_BAR.filter((t): t is ToolDef => !('sep' in t));
export const toolDef = (id: ToolId): ToolDef => TOOLS.find((t) => t.id === id) ?? TOOLS[0];

export const SEL_TOOLS: readonly ToolId[] = ['rect', 'ellipse', 'lasso', 'poly', 'wand'];
export const BRUSH_TOOLS: readonly ToolId[] = ['paint', 'erase', 'restore', 'remove'];

export const BLENDS: [GlobalCompositeOperation, string][] = [
  ['source-over', 'Normal'],
  ['multiply', 'Multiplicar'],
  ['screen', 'Tela'],
  ['overlay', 'Sobrepor'],
  ['soft-light', 'Luz suave'],
  ['hard-light', 'Luz forte'],
  ['darken', 'Escurecer'],
  ['lighten', 'Clarear'],
  ['color-dodge', 'Subexposição de cores'],
  ['color-burn', 'Superexposição de cores'],
  ['difference', 'Diferença'],
  ['exclusion', 'Exclusão'],
  ['hue', 'Matiz'],
  ['saturation', 'Saturação'],
  ['color', 'Cor'],
  ['luminosity', 'Luminosidade'],
];
export const BLEND_NAME = new Map<string, string>(BLENDS);

/** Some browsers (notably older Safari) ignore ctx.filter; the colour adjustments are hidden there. */
export const FILTER_OK =
  typeof CanvasRenderingContext2D !== 'undefined' && 'filter' in CanvasRenderingContext2D.prototype;

export const REDUCED_MOTION =
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Largest side accepted when opening an image (bigger photos are scaled down). */
export const MAX_IMAGE_SIDE = 8000;
