/** The Selection panel buttons. */
import { button, input } from '../editor/dom';
import { opts, saveOpts } from '../editor/state';
import {
  clearSel,
  cropToSel,
  deleteSel,
  invertSel,
  keepOnlySel,
  selectAll,
  selToLayer,
} from '../editor/selection';
import { fillSel } from '../editor/fills';
import { healSelection } from '../editor/heal';
import { mobileClose } from './chrome';

export function initSelectionPanel(): void {
  const then = (fn: () => unknown) => () => {
    fn();
    mobileClose();
  };
  button('sa-keep').addEventListener('click', then(keepOnlySel));
  button('sa-fill').addEventListener('click', then(fillSel));
  button('sa-heal').addEventListener('click', then(healSelection));
  button('sa-cut').addEventListener('click', () => {
    if (selToLayer('cut')) mobileClose();
  });
  button('sa-copy').addEventListener('click', () => {
    if (selToLayer('copy')) mobileClose();
  });
  button('sa-del').addEventListener('click', then(deleteSel));
  button('sa-inv').addEventListener('click', invertSel);
  button('sa-all').addEventListener('click', selectAll);
  button('sa-none').addEventListener('click', clearSel);
  button('sa-crop').addEventListener('click', then(cropToSel));

  const healCut = input('sel-healcut');
  healCut.checked = opts.healCut;
  healCut.addEventListener('change', () => {
    opts.healCut = healCut.checked;
    saveOpts();
  });
}
