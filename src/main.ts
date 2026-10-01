/**
 * Ateliê de Colagem — entry point.
 * Wires the modules together and starts the editor with the built-in example.
 */
import '@fontsource/bricolage-grotesque/latin-700.css';
import '@fontsource/bricolage-grotesque/latin-800.css';
import '@fontsource/instrument-sans/latin-400.css';
import '@fontsource/instrument-sans/latin-500.css';
import '@fontsource/instrument-sans/latin-600.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import './styles/app.css';

import { opts, markOverlay } from './editor/state';
import { readColors, resize, stage } from './editor/view';
import { startRenderLoop } from './editor/render';
import { initPointer } from './editor/pointer';
import { initKeyboard } from './editor/keyboard';
import { initPaste } from './editor/clipboard';
import { initFiles } from './editor/files';
import { initToolPanel, renderToolBar, setTool } from './editor/tools';
import { setCurrentColor } from './editor/colorPick';
import { loadSample } from './editor/project';
import { afterStructural, initChrome } from './ui/chrome';
import { initLayersPanel } from './ui/layersPanel';
import { initSelectionPanel } from './ui/selectionPanel';
import { initModals } from './ui/modals';
import { registerServiceWorker } from './pwa';

renderToolBar();
initChrome();
initToolPanel();
initPointer();
initKeyboard();
initPaste();
initFiles();
initLayersPanel();
initSelectionPanel();
initModals();

setCurrentColor(opts.color, true);
loadSample();
setTool('lasso');
afterStructural();

new ResizeObserver(() => resize()).observe(stage);
readColors();
matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => setTimeout(readColors, 30));
void document.fonts?.ready.then(markOverlay);
startRenderLoop();

registerServiceWorker();
