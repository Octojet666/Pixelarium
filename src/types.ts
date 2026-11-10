/** Shared document and engine types. */

import type { GuiLayout } from './engine/mcGui';
import type { SceneDoc } from './engine/scene';
import type { GuiTextureOptions } from './engine/guiTexture';

export type BlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'add'
  | 'subtract'
  | 'darken'
  | 'lighten'
  | 'difference';

export const BLEND_MODES: BlendMode[] = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'add',
  'subtract',
  'darken',
  'lighten',
  'difference',
];

export type RGBA = readonly [number, number, number, number];

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  /** 0..255 */
  opacity: number;
  blend: BlendMode;
}

/** One layer's pixels inside one frame (an "animation cel"). */
export type Cel = Uint8ClampedArray;

export interface Frame {
  id: string;
  /** Milliseconds this frame stays on screen. */
  duration: number;
  label?: string;
  /** layerId -> pixels */
  cels: Record<string, Cel>;
  /** Optional cinematic camera keyframe for this frame. */
  camera?: FrameCamera;
}

/** Camera framing for cinematic playback: center in 0..1 document space plus zoom. */
export interface FrameCamera {
  x: number;
  y: number;
  zoom: number;
}

export type CinemaAspect = '16:9' | '9:16' | '1:1' | '4:3' | 'source';

export interface CinemaSettings {
  aspect: CinemaAspect;
  fit: 'contain' | 'cover';
  background: string;
  fps: number;
}

export interface Palette {
  id: string;
  name: string;
  colors: string[];
  builtin?: boolean;
  description?: string;
}

export interface AnimationTag {
  id: string;
  name: string;
  from: number;
  to: number;
  mode: 'forward' | 'reverse' | 'pingpong';
  fps?: number;
}

export interface ProjectMeta {
  createdAt: number;
  updatedAt: number;
  description: string;
  author: string;
  tags: string[];
}

export interface ProjectDoc {
  id: string;
  name: string;
  width: number;
  height: number;
  /** Bottom-most layer first. */
  layers: Layer[];
  frames: Frame[];
  palettes: Palette[];
  activePaletteId: string;
  primary: string;
  secondary: string;
  tags: AnimationTag[];
  meta: ProjectMeta;
  /** Indexed mode: colors snap to the active palette and stamps stay opaque. */
  indexed?: boolean;
  /** Optional nine-slice guides, preserved in .pxl files. */
  nineSlice?: NineSliceInsets;
  /** Optional tilemap workspace data, preserved in .pxl files. */
  tilemap?: TilemapDoc;
  /** Cinematic scene output settings, preserved in .pxl files. */
  cinema?: CinemaSettings;
  /** Minecraft GUI layout, preserved in .pxl files. */
  gui?: GuiLayout;
  /** Minecraft GUI texture theme and options, preserved in .pxl files. */
  guiTexture?: GuiTextureOptions;
  /** Scene & composition workspace data, preserved in .pxl files. */
  scene?: SceneDoc;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Tile {
  id: string;
  name: string;
  /** size x size RGBA pixels */
  pixels: Cel;
}

export interface TilemapCell {
  tileId: string | null;
}

export interface TilemapDoc {
  tileSize: number;
  cols: number;
  rows: number;
  tiles: Tile[];
  /** row-major; each cell is a tile id */
  cells: (string | null)[];
}

export type ToolId =
  | 'pencil'
  | 'eraser'
  | 'line'
  | 'rect'
  | 'rect-filled'
  | 'ellipse'
  | 'ellipse-filled'
  | 'bucket'
  | 'eyedropper'
  | 'select'
  | 'select-free'
  | 'move'
  | 'dither'
  | 'spray'
  | 'gradient'
  | 'text'
  | 'shade';

export interface ToolSettings {
  size: number;
  opacity: number;
  pixelPerfect: boolean;
  symmetryX: boolean;
  symmetryY: boolean;
  tolerance: number;
  shape: 'square' | 'circle';
  gradientMode: 'linear' | 'radial';
  ditherPattern: 'bayer2' | 'bayer4' | 'checker' | 'noise';
  sprayDensity: number;
  fontScale: number;
  filled: boolean;
  /** Pen pressure controls brush size. */
  pressureSize: boolean;
  /** Pen pressure controls opacity. */
  pressureOpacity: boolean;
  /** Freehand stamps wrap across canvas edges for seamless tiles. */
  tileMode: boolean;
  /** Show the repeating 3×3 preview while tile mode is on. */
  tilePreview: boolean;
  /** Custom brush preset id; empty means the round/square tip. */
  brushId: string;
}

export interface NineSliceInsets {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface FrameRange {
  start: number;
  end: number;
}
