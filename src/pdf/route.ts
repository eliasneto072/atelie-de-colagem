/**
 * Links into the PDF tools: `#tarefa` opens a task, `#editar/ferramenta` also picks a tool of
 * "Editar e assinar" (the guide pages link to `#editar/assinar` and `#editar/tarja`).
 */
import { TASKS, type Task, type Tool } from './state';

/** Tool names as they read in the toolbar, without accents. */
export const TOOL_NAMES: Readonly<Record<string, Tool>> = {
  mover: 'select',
  texto: 'text',
  assinar: 'sign',
  certo: 'check',
  x: 'x',
  ponto: 'dot',
  cobrir: 'cover',
  tarja: 'redact',
  destacar: 'highlight',
};

export interface Route {
  task: Task;
  tool: Tool | null;
}

export function routeFromHash(hash: string): Route {
  const [task, tool] = decodeURIComponent(hash.replace(/^#/, ''))
    .toLowerCase()
    .split('/')
    .map((s) => s.trim());
  const t = (TASKS as readonly string[]).includes(task) ? (task as Task) : 'juntar';
  return { task: t, tool: t === 'editar' ? (TOOL_NAMES[tool ?? ''] ?? null) : null };
}
