import { describe, expect, it } from 'vitest';
import { routeFromHash } from '../src/pdf/route';

describe('links into the PDF tools', () => {
  it('opens the task in the hash, and "juntar" when there is none or it is unknown', () => {
    expect(routeFromHash('#fotos')).toEqual({ task: 'fotos', tool: null });
    expect(routeFromHash('')).toEqual({ task: 'juntar', tool: null });
    expect(routeFromHash('#qualquer')).toEqual({ task: 'juntar', tool: null });
  });

  it('picks a tool of "Editar e assinar" by its name in the toolbar', () => {
    expect(routeFromHash('#editar/tarja')).toEqual({ task: 'editar', tool: 'redact' });
    expect(routeFromHash('#editar/assinar')).toEqual({ task: 'editar', tool: 'sign' });
    expect(routeFromHash('#Editar/Texto')).toEqual({ task: 'editar', tool: 'text' });
    expect(routeFromHash('#editar/nada')).toEqual({ task: 'editar', tool: null });
  });

  it('ignores a tool on other tasks', () => {
    expect(routeFromHash('#juntar/tarja')).toEqual({ task: 'juntar', tool: null });
  });
});
