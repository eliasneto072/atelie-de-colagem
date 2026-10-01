/** Mouse, pen and touch on the stage. */
import { bboxOf, clamp, dist, pointInPoly, resizeCursor, boxPts, type Vec } from '../core/geometry';
import { guideLines, snapAxis } from '../core/snap';
import { BRUSH_TOOLS, SEL_TOOLS } from './constants';
import { el, P } from './dom';
import { commit, undo } from './history';
import { active, layerMatrix, opaqueAt, pickLayer } from './layer';
import { S, coarse, dirtyAll, ht, markOverlay, markScene, opts, rt } from './state';
import type { BrushMode, Layer, MoveAct, ScaleAct, SelMode } from './types';
import { local, overlay, toDoc, toScreen, updateZoomUI, vp, zoomAt } from './view';
import { edgeAt, handlesScreen } from './render';
import { applySel, clearSel, finishPoly, makePoly, selContains, selToLayer, wandAt } from './selection';
import { brushLabel, brushMove, startBrush } from './brushes';
import { bucketAt } from './fills';
import { finishRemove, flushDeferred, removeMove, startRemove } from './heal';
import { pickAt, sampleBuf } from './colorPick';
import { snapSetup } from './align';
import { setActive } from './layerOps';
import { syncXform } from './tools';
import { afterStructural, syncPolyBar } from '../ui/chrome';
import { renderLayers } from '../ui/layersPanel';

/** Where the pointer is, in screen and document coordinates. */
export const pointer = {
  inside: false,
  sp: null as Vec | null,
  doc: null as Vec | null,
  /** Colour under the pointer while picking. */
  hoverColor: null as string | null,
};

const pointers = new Map<number, Vec>();

interface Mods {
  shiftKey: boolean;
  altKey: boolean;
  button: number;
}

/** A touch held back briefly so a two-finger pinch never leaves a mark. */
let pending: { id: number; sp: Vec; mods: Mods; t: ReturnType<typeof setTimeout> } | null = null;

function startMove(l: Layer, dp: Vec, force: boolean): MoveAct {
  return {
    kind: 'move',
    l,
    x0: l.x,
    y0: l.y,
    p0: dp,
    moved: false,
    force,
    snap: opts.snap ? snapSetup(l) : null,
    guides: [],
    abort() {
      l.x = this.x0;
      l.y = this.y0;
    },
  };
}

/** Corner handles (edge = false) keep the shape; side handles (edge = true) stretch one axis. */
function startScale(l: Layer, i: number, edge: boolean): ScaleAct {
  const w = l.canvas.width,
    h = l.canvas.height,
    m0 = layerMatrix(l);
  let Lc: Vec, Lo: Vec;
  let axis: ScaleAct['axis'] = 'both';
  if (!edge) {
    const lc = [
      [0, 0],
      [w, 0],
      [w, h],
      [0, h],
    ];
    Lc = { x: lc[i][0], y: lc[i][1] };
    Lo = { x: lc[(i + 2) % 4][0], y: lc[(i + 2) % 4][1] };
  } else {
    const e: [number, number, number, number, 'x' | 'y'][] = [
      [w / 2, 0, w / 2, h, 'y'],
      [w, h / 2, 0, h / 2, 'x'],
      [w / 2, h, w / 2, 0, 'y'],
      [0, h / 2, w, h / 2, 'x'],
    ];
    const [cx, cy, ox, oy, ax] = e[i];
    Lc = { x: cx, y: cy };
    Lo = { x: ox, y: oy };
    axis = ax;
  }
  const Lm = { x: w / 2, y: h / 2 };
  return {
    kind: 'scale',
    l,
    Lc,
    Lo,
    Lm,
    axis,
    Ao: m0.transformPoint(P(Lo.x, Lo.y)),
    Am: m0.transformPoint(P(Lm.x, Lm.y)),
    inv0: m0.inverse(),
    sx0: l.sx,
    sy0: l.sy,
    x0: l.x,
    y0: l.y,
    moved: false,
    abort() {
      l.sx = this.sx0;
      l.sy = this.sy0;
      l.x = this.x0;
      l.y = this.y0;
    },
  };
}

function onDown(e: PointerEvent): void {
  if (!S.layers.length) return;
  overlay.setPointerCapture(e.pointerId);
  rt.lastPointerType = e.pointerType || 'mouse';
  const sp = local(e);
  pointers.set(e.pointerId, sp);
  if (pointers.size === 2) {
    // second finger: whatever the first one started becomes a pinch
    cancelPending();
    const a0 = rt.act;
    if (a0 && 'abort' in a0) a0.abort();
    rt.draft = null;
    const [a, b] = [...pointers.values()];
    rt.act = {
      kind: 'pinch',
      d0: dist(a, b) || 1,
      m0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      v0: { ...S.view },
      t0: Date.now(),
      moved: false,
    };
    dirtyAll();
    return;
  }
  if (pointers.size > 2) return;
  const mods: Mods = { shiftKey: e.shiftKey, altKey: e.altKey, button: e.button };
  if (rt.lastPointerType === 'touch' && S.tool !== 'hand') {
    pending = { id: e.pointerId, sp, mods, t: setTimeout(flushPending, 90) };
    return;
  }
  if (e.button === 1) e.preventDefault();
  beginAt(sp, mods);
}

function flushPending(): void {
  if (!pending) return;
  const p = pending;
  pending = null;
  clearTimeout(p.t);
  beginAt(p.sp, p.mods);
}

function cancelPending(): void {
  if (!pending) return;
  clearTimeout(pending.t);
  pending = null;
}

function beginAt(sp: Vec, e: Mods): void {
  const dp = toDoc(sp);
  if (e.button === 1 || rt.spaceDown || S.tool === 'hand') {
    rt.act = { kind: 'pan', sp0: sp, v0: { ...S.view } };
    overlay.style.cursor = 'grabbing';
    return;
  }
  if (e.button !== 0) return;
  const altPick = e.altKey && (S.tool === 'paint' || S.tool === 'bucket');
  if (rt.pickOnce || S.tool === 'picker' || altPick) {
    if (coarse()) {
      // finger: show a loupe, pick on release
      rt.act = { kind: 'pick' };
      markOverlay();
      return;
    }
    pickAt(dp);
    return;
  }
  const op: SelMode = e.shiftKey ? 'add' : e.altKey ? 'sub' : opts.selMode;
  switch (S.tool) {
    case 'move': {
      const l = active();
      if (l && l.visible) {
        const hs = handlesScreen(l);
        if (dist(sp, hs.rotH) <= ht()) {
          rt.act = {
            kind: 'rotate',
            l,
            rot0: l.rot,
            ctr: hs.ctr,
            a0: Math.atan2(sp.y - hs.ctr.y, sp.x - hs.ctr.x),
            moved: false,
            abort() {
              l.rot = this.rot0;
            },
          };
          break;
        }
        const ci = hs.corners.findIndex((c) => dist(sp, c) <= ht());
        if (ci >= 0) {
          rt.act = startScale(l, ci, false);
          break;
        }
        const ei = edgeAt(hs, sp);
        if (ei >= 0) {
          rt.act = startScale(l, ei, true);
          break;
        }
      }
      // dragging from inside a selection cuts it out (Alt copies) and moves it in one go
      if (S.sel && selContains(dp) && l) {
        const nl = selToLayer(e.altKey ? 'copy' : 'cut', { noCommit: true });
        if (nl) rt.act = startMove(nl, dp, true);
        break;
      }
      let target: Layer | null = null;
      if (l && l.visible && opaqueAt(l, dp)) target = l;
      else if (opts.autoSelect) target = pickLayer(dp);
      if (!target && l && l.visible && pointInPoly(handlesScreen(l).corners, sp.x, sp.y)) target = l;
      if (target) {
        if (target.id !== S.activeId) setActive(target.id);
        rt.act = startMove(target, dp, false);
      }
      break;
    }
    case 'rect':
    case 'ellipse':
      rt.act = { kind: 'selbox', shape: S.tool, p0: dp, sp0: sp, op };
      rt.draft = null;
      break;
    case 'lasso': {
      const pts: [number, number][] = [[dp.x, dp.y]];
      rt.act = { kind: 'lasso', pts, op, lastSp: sp, sp0: sp };
      rt.draft = { pts, closed: false };
      break;
    }
    case 'poly': {
      const pd = rt.polyDraft;
      if (!pd) rt.polyDraft = { pts: [[dp.x, dp.y]], op };
      else {
        const f = pd.pts[0],
          fs = toScreen({ x: f[0], y: f[1] });
        if (pd.pts.length >= 3 && dist(sp, fs) < (coarse() ? 22 : 10)) finishPoly();
        else pd.pts.push([dp.x, dp.y]);
      }
      syncPolyBar();
      markOverlay();
      break;
    }
    case 'wand':
      wandAt(dp, op);
      break;
    case 'erase':
    case 'restore':
    case 'paint':
      startBrush(dp, S.tool, e.shiftKey || opts.lineMode);
      break;
    case 'bucket':
      bucketAt(dp);
      break;
    case 'remove':
      startRemove(dp);
      break;
    default:
      break;
  }
}

function onMove(e: PointerEvent): void {
  const sp = local(e),
    dp = toDoc(sp);
  pointer.sp = sp;
  pointer.doc = dp;
  pointer.inside = true;
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, sp);
  const picking = S.tool === 'picker' || !!rt.pickOnce;
  pointer.hoverColor = picking ? sampleBuf(sp) : null;
  el('st-pos').innerHTML =
    `x <b>${Math.round(dp.x)}</b> · y <b>${Math.round(dp.y)}</b>` +
    (pointer.hoverColor ? ` · cor <b>${pointer.hoverColor}</b>` : '');
  markOverlay();
  if (pending && pending.id === e.pointerId && dist(sp, pending.sp) > 6) flushPending();
  const a = rt.act;
  if (!a) {
    updateCursor(sp);
    return;
  }
  switch (a.kind) {
    case 'pinch': {
      if (pointers.size < 2) return;
      const [p, q] = [...pointers.values()];
      const d = dist(p, q),
        m = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 },
        v0 = a.v0,
        ns = clamp((v0.s * d) / a.d0, 0.02, 32);
      if (Math.abs(d - a.d0) > 12 || dist(m, a.m0) > 12) a.moved = true;
      const docX = (a.m0.x - v0.x) / v0.s,
        docY = (a.m0.y - v0.y) / v0.s;
      S.view.s = ns;
      S.view.x = m.x - docX * ns;
      S.view.y = m.y - docY * ns;
      vp.viewTouched = true;
      updateZoomUI();
      dirtyAll();
      break;
    }
    case 'pan':
      S.view.x = a.v0.x + sp.x - a.sp0.x;
      S.view.y = a.v0.y + sp.y - a.sp0.y;
      vp.viewTouched = true;
      dirtyAll();
      break;
    case 'move': {
      let dx = dp.x - a.p0.x,
        dy = dp.y - a.p0.y,
        lockX = false,
        lockY = false;
      if (e.shiftKey) {
        if (Math.abs(dx) > Math.abs(dy)) {
          dy = 0;
          lockY = true;
        } else {
          dx = 0;
          lockX = true;
        }
      }
      a.guides = [];
      const sn = a.snap;
      if (sn && !(e.ctrlKey || e.metaKey)) {
        const th = (coarse() ? 10 : 6) / S.view.s;
        if (!lockX) dx += snapAxis(a.x0 + dx, sn.offX, sn.xs, th);
        if (!lockY) dy += snapAxis(a.y0 + dy, sn.offY, sn.ys, th);
        const nx = a.x0 + dx,
          ny = a.y0 + dy;
        a.guides = guideLines(nx, sn.offX, sn.xs, ny + sn.offY[0], ny + sn.offY[2], true).concat(
          guideLines(ny, sn.offY, sn.ys, nx + sn.offX[0], nx + sn.offX[2], false),
        );
      }
      a.l.x = a.x0 + dx;
      a.l.y = a.y0 + dy;
      a.moved = true;
      markScene();
      syncXform();
      break;
    }
    case 'scale':
      scaleMove(a, dp, e);
      break;
    case 'rotate': {
      let ang = a.rot0 + ((Math.atan2(sp.y - a.ctr.y, sp.x - a.ctr.x) - a.a0) * 180) / Math.PI;
      if (e.shiftKey) ang = Math.round(ang / 15) * 15;
      a.l.rot = ((((ang + 180) % 360) + 360) % 360) - 180;
      a.moved = true;
      markScene();
      syncXform();
      break;
    }
    case 'selbox':
      rt.draft = { pts: boxPts(a.shape, a.p0, dp), closed: true };
      break;
    case 'lasso':
      if (dist(sp, a.lastSp) > 2) {
        a.pts.push([dp.x, dp.y]);
        a.lastSp = sp;
      }
      break;
    case 'brush':
      brushMove(a, dp);
      break;
    case 'remove':
      removeMove(a, dp);
      break;
    default:
      break;
  }
}

function scaleMove(a: ScaleAct, dp: Vec, e: PointerEvent): void {
  const l = a.l,
    w = l.canvas.width,
    h = l.canvas.height,
    Lp = a.inv0.transformPoint(P(dp.x, dp.y));
  // Alt scales around the centre instead of the opposite handle
  const fromCenter = e.altKey,
    La = fromCenter ? a.Lm : a.Lo,
    A = fromCenter ? a.Am : a.Ao;
  const minS = 4 / Math.max(w, h);
  let sx = a.sx0,
    sy = a.sy0;
  if (a.axis === 'both') {
    const d0x = (a.Lc.x - La.x) * a.sx0,
      d0y = (a.Lc.y - La.y) * a.sy0,
      dx = (Lp.x - La.x) * a.sx0,
      dy = (Lp.y - La.y) * a.sy0;
    if (!e.shiftKey) {
      const k = Math.max(0.005, (dx * d0x + dy * d0y) / (d0x * d0x + d0y * d0y));
      sx = a.sx0 * k;
      sy = a.sy0 * k;
    } else {
      sx = a.sx0 * Math.max(0.005, dx / d0x);
      sy = a.sy0 * Math.max(0.005, dy / d0y);
    }
  } else {
    // side handle: stretch only this direction (Shift keeps the proportion)
    const k = Math.max(
      0.005,
      a.axis === 'x' ? (Lp.x - La.x) / (a.Lc.x - La.x) : (Lp.y - La.y) / (a.Lc.y - La.y),
    );
    if (e.shiftKey) {
      sx = a.sx0 * k;
      sy = a.sy0 * k;
    } else if (a.axis === 'x') sx = a.sx0 * k;
    else sy = a.sy0 * k;
  }
  sx = Math.max(sx, minS);
  sy = Math.max(sy, minS);
  // keep the anchor point where it was
  const p = new DOMMatrix()
    .rotate(l.rot)
    .scale(sx * (l.flipX ? -1 : 1), sy * (l.flipY ? -1 : 1))
    .translate(-w / 2, -h / 2)
    .transformPoint(P(La.x, La.y));
  l.sx = sx;
  l.sy = sy;
  l.x = A.x - p.x;
  l.y = A.y - p.y;
  a.moved = true;
  markScene();
  syncXform();
}

function onUp(e: PointerEvent): void {
  if (pending && pending.id === e.pointerId) flushPending();
  pointers.delete(e.pointerId);
  const a = rt.act;
  if (!a) return;
  const sp = local(e);
  if (a.kind === 'pinch') {
    if (pointers.size === 0) {
      rt.act = null;
      // a quick two-finger tap undoes, as in most drawing apps
      if (!a.moved && Date.now() - a.t0 < 300) undo();
    }
    return;
  }
  rt.act = null;
  switch (a.kind) {
    case 'pan':
      updateCursor(sp);
      break;
    case 'pick':
      pickAt(toDoc(sp));
      break;
    case 'move':
      if (a.moved || a.force) commit(a.force ? 'Recortar e mover' : 'Mover');
      if (a.force) afterStructural();
      break;
    case 'scale':
      if (a.moved) {
        const uniform = a.axis === 'both' || a.l.sx / a.sx0 === a.l.sy / a.sy0;
        commit(uniform ? 'Redimensionar' : a.axis === 'x' ? 'Esticar na horizontal' : 'Esticar na vertical');
      }
      break;
    case 'rotate':
      if (a.moved) commit('Girar');
      break;
    case 'selbox': {
      const pts = rt.draft ? rt.draft.pts : null;
      rt.draft = null;
      if (!pts || dist(sp, a.sp0) < 3) {
        if (a.op === 'new') clearSel();
      } else applySel(makePoly(pts), a.op);
      break;
    }
    case 'lasso': {
      rt.draft = null;
      const bb = bboxOf(a.pts);
      if (a.pts.length < 3 || (bb.w * S.view.s < 3 && bb.h * S.view.s < 3)) {
        if (a.op === 'new') clearSel();
      } else applySel(makePoly(a.pts), a.op);
      break;
    }
    case 'brush':
      rt.lastStroke = { id: a.l.id, mode: a.mode, x: a.end.x, y: a.end.y };
      commit(brushLabel(a.mode));
      renderLayers();
      break;
    case 'remove':
      void finishRemove();
      break;
    default:
      break;
  }
  markOverlay();
  flushDeferred();
}

function onCancel(e: PointerEvent): void {
  cancelPending();
  pointers.delete(e.pointerId);
  const a = rt.act;
  if (a?.kind === 'remove') rt.removeMask = null;
  if (a && 'abort' in a) a.abort();
  if (a?.kind === 'brush') commit(brushLabel(a.mode as BrushMode));
  rt.act = null;
  rt.draft = null;
  setTimeout(flushDeferred, 0);
  dirtyAll();
}

export function updateCursor(sp: Vec | null): void {
  let c = 'default';
  if (rt.pickOnce) c = 'crosshair';
  else if (rt.spaceDown || S.tool === 'hand') c = 'grab';
  else if (S.tool === 'move') {
    const l = active();
    if (sp && l && l.visible) {
      const hs = handlesScreen(l);
      if (dist(sp, hs.rotH) <= ht()) c = 'grab';
      else {
        const ci = hs.corners.findIndex((q) => dist(sp, q) <= ht()),
          ei = ci < 0 ? edgeAt(hs, sp) : -1;
        if (ci >= 0) c = resizeCursor(hs.corners[ci].x - hs.ctr.x, hs.corners[ci].y - hs.ctr.y);
        else if (ei >= 0) c = resizeCursor(hs.edges[ei].x - hs.ctr.x, hs.edges[ei].y - hs.ctr.y);
        else if ((S.sel && selContains(toDoc(sp))) || pointInPoly(hs.corners, sp.x, sp.y)) c = 'move';
      }
    }
  } else if (SEL_TOOLS.includes(S.tool) || S.tool === 'picker' || S.tool === 'bucket') c = 'crosshair';
  else if (BRUSH_TOOLS.includes(S.tool)) c = 'none';
  overlay.style.cursor = c;
}

export function initPointer(): void {
  overlay.addEventListener('pointerdown', onDown);
  overlay.addEventListener('pointermove', onMove);
  overlay.addEventListener('pointerup', onUp);
  overlay.addEventListener('pointercancel', onCancel);
  overlay.addEventListener('pointerleave', () => {
    pointer.inside = false;
    markOverlay();
  });
  overlay.addEventListener('dblclick', () => {
    if (S.tool === 'poly') finishPoly();
  });
  overlay.addEventListener('contextmenu', (e) => e.preventDefault());
  overlay.addEventListener(
    'wheel',
    (e) => {
      if (!S.layers.length) return;
      e.preventDefault();
      const sp = local(e);
      let dx = e.deltaX,
        dy = e.deltaY;
      if (e.deltaMode === 1) {
        dx *= 16;
        dy *= 16;
      }
      // a mouse wheel notch zooms; a trackpad scroll pans; pinch on a trackpad arrives as ctrl+wheel
      const mouseNotch = dx === 0 && Math.abs(dy) >= 40;
      if (e.ctrlKey || e.metaKey || e.altKey || mouseNotch)
        zoomAt(sp.x, sp.y, Math.exp(-dy * (e.ctrlKey && !mouseNotch ? 0.01 : 0.0018)));
      else {
        S.view.x -= dx;
        S.view.y -= dy;
        vp.viewTouched = true;
        dirtyAll();
      }
    },
    { passive: false },
  );
}
