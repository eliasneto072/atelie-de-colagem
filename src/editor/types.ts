import type { Box, Pt, Vec } from '../core/geometry';
import type { Guide, SnapCandidate } from '../core/snap';

export type ToolId =
  | 'move'
  | 'rect'
  | 'ellipse'
  | 'lasso'
  | 'poly'
  | 'wand'
  | 'paint'
  | 'bucket'
  | 'erase'
  | 'restore'
  | 'remove'
  | 'picker'
  | 'hand';

/** Non-destructive colour adjustments, applied as canvas filters when drawing. */
export interface Adjust {
  /** brightness % */
  b: number;
  /** contrast % */
  c: number;
  /** saturation % */
  s: number;
  /** hue rotation in degrees */
  h: number;
  /** blur in layer pixels */
  blur: number;
}

/** "Cover everything with one colour" (keeps the alpha), used to recolour letters and logos. */
export interface LayerFill {
  on: boolean;
  color: string;
  /** 0–100 */
  amount: number;
}

export interface Layer {
  id: number;
  name: string;
  /** Current pixels. Replaced (never edited in place) so history snapshots stay valid. */
  canvas: HTMLCanvasElement;
  /** Original pixels, for the Restore brush. */
  source: HTMLCanvasElement;
  /** Centre position in document pixels. */
  x: number;
  y: number;
  sx: number;
  sy: number;
  /** Rotation in degrees. */
  rot: number;
  flipX: boolean;
  flipY: boolean;
  opacity: number;
  blend: GlobalCompositeOperation;
  visible: boolean;
  adj: Adjust;
  fill: LayerFill;
  /** Cached recoloured canvas (see displayCanvas). */
  _fc?: { src: HTMLCanvasElement; key: string; canvas: HTMLCanvasElement } | null;
  /** Cached bounding box of visible pixels (see contentBox). */
  _cb?: { src: HTMLCanvasElement; x0: number; y0: number; x1: number; y1: number };
}

export interface DocState {
  w: number;
  h: number;
  /** 'transparent' or a CSS colour. */
  bg: string;
}

export interface ViewState {
  /** Zoom factor (screen px per document px). */
  s: number;
  /** Screen position of the document's top-left corner. */
  x: number;
  y: number;
}

export type SelOp = 'add' | 'sub';
export type SelMode = 'new' | 'add' | 'sub';

export interface PolyShape {
  type: 'poly';
  pts: Pt[];
  path: Path2D;
  bb: Box;
  op: SelOp;
}

/** A magic-wand result: a pixel mask in some layer's pixel space. */
export interface RasterShape {
  type: 'raster';
  canvas: HTMLCanvasElement;
  flags: Uint8Array;
  w: number;
  h: number;
  /** Mask pixels → document. */
  matrix: DOMMatrix;
  inv: DOMMatrix;
  /** Outline for the marching ants. */
  path: Path2D;
  bb: Box;
  op: SelOp;
}

export type SelShape = PolyShape | RasterShape;

/** Shapes are applied in order (add or subtract); `inverted` flips the result. */
export interface Selection {
  shapes: SelShape[];
  inverted: boolean;
}

export interface EditorState {
  doc: DocState;
  layers: Layer[];
  activeId: number | null;
  sel: Selection | null;
  tool: ToolId;
  view: ViewState;
}

/** A selection rasterised in one layer's pixel space, padded by `P` px for feathering. */
export interface Mask {
  canvas: HTMLCanvasElement;
  P: number;
  /** Feather radius in layer pixels. */
  f: number;
}

export type BrushMode = 'paint' | 'erase' | 'restore';

export interface SnapSetup {
  xs: SnapCandidate[];
  ys: SnapCandidate[];
  /** Left/centre/right of the moving box, relative to the layer centre. */
  offX: number[];
  offY: number[];
}

// ---- what a pointer drag is doing ----
export interface PinchAct {
  kind: 'pinch';
  d0: number;
  m0: Vec;
  v0: ViewState;
  t0: number;
  moved: boolean;
}
export interface PanAct {
  kind: 'pan';
  sp0: Vec;
  v0: ViewState;
}
export interface PickAct {
  kind: 'pick';
}
export interface MoveAct {
  kind: 'move';
  l: Layer;
  x0: number;
  y0: number;
  p0: Vec;
  moved: boolean;
  /** Started by dragging out of a selection (the cut already happened). */
  force: boolean;
  snap: SnapSetup | null;
  guides: Guide[];
  abort(): void;
}
export interface ScaleAct {
  kind: 'scale';
  l: Layer;
  /** Grabbed handle, opposite anchor and centre, in layer pixels. */
  Lc: Vec;
  Lo: Vec;
  Lm: Vec;
  axis: 'both' | 'x' | 'y';
  /** Opposite anchor and centre in document pixels at the start. */
  Ao: DOMPoint;
  Am: DOMPoint;
  inv0: DOMMatrix;
  sx0: number;
  sy0: number;
  x0: number;
  y0: number;
  moved: boolean;
  abort(): void;
}
export interface RotateAct {
  kind: 'rotate';
  l: Layer;
  rot0: number;
  ctr: Vec;
  a0: number;
  moved: boolean;
  abort(): void;
}
export interface SelBoxAct {
  kind: 'selbox';
  shape: 'rect' | 'ellipse';
  p0: Vec;
  sp0: Vec;
  op: SelMode;
}
export interface LassoAct {
  kind: 'lasso';
  pts: Pt[];
  op: SelMode;
  lastSp: Vec;
  sp0: Vec;
}
export interface BrushAct {
  kind: 'brush';
  l: Layer;
  ctx: CanvasRenderingContext2D;
  inv: DOMMatrix;
  r: number;
  rgb: string;
  last: Vec;
  end: Vec;
  mode: BrushMode;
  spacing: number;
}
export interface RemoveAct {
  kind: 'remove';
  inv: DOMMatrix;
  last: Vec;
}
export type Action =
  PinchAct | PanAct | PickAct | MoveAct | ScaleAct | RotateAct | SelBoxAct | LassoAct | BrushAct | RemoveAct;
