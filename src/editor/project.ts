/** Starting points: the example project and a blank one. */
import { el, P } from './dom';
import { commit, resetHistory } from './history';
import { layerMatrix, newLayer } from './layer';
import { S, rt } from './state';
import { makeBalloon, makeLandscape } from './sample';
import { makePoly } from './selection';
import { afterStructural } from '../ui/chrome';

/** The sunset with the balloon, its outline already selected, ready for "Keep only the selection". */
export function loadSample(): void {
  const land = makeLandscape(),
    bal = makeBalloon();
  S.doc = { w: land.width, h: land.height, bg: 'transparent' };
  const L1 = newLayer(land, { name: 'Exemplo · pôr do sol' });
  const L2 = newLayer(bal.canvas, { name: 'Exemplo · balão', sx: 0.42, sy: 0.42, x: 380, y: 330 });
  S.layers = [L1, L2];
  S.activeId = L2.id;
  const m = layerMatrix(L2);
  S.sel = {
    shapes: [
      makePoly(
        bal.outline.map(([px, py]) => {
          const q = m.transformPoint(P(px, py));
          return [q.x, q.y];
        }),
      ),
    ],
    inverted: false,
  };
  resetHistory();
  commit('Exemplo');
  rt.sampleActive = true;
  el('note').hidden = false;
}

/** An empty project (used before opening the user's own images). */
export function clearAll(): void {
  S.layers = [];
  S.activeId = null;
  S.sel = null;
  S.doc = { w: 1200, h: 800, bg: 'transparent' };
  rt.polyDraft = null;
  rt.draft = null;
  rt.sampleActive = false;
  el('note').hidden = true;
  resetHistory();
  commit('Início');
  afterStructural();
}
