/**
 * Minecraft GUI texturing.
 *
 * A server menu is a picture before it is a slot list: a framed panel, a title ribbon, bevels, corner
 * plates and a grid of recessed slot wells. This module paints that texture from a theme plus a few
 * options, at one pixel per texture pixel, so the PNG can be exported straight into a resource pack or
 * a plugin's GUI folder - or opened in the editor and hand-painted on top.
 *
 * Everything here is pure pixel work: no React, no DOM, no fonts beyond the project's own 5×7 bitmap
 * font. That keeps the painter deterministic and testable.
 */

import { COLUMNS, SLOT_PX, type GuiLayout } from './mcGui';
import { drawText } from './font';

export type GuiGrain = 'wood' | 'stone' | 'metal' | 'cloth' | 'none';
export type GuiOrnament = 'rivet' | 'flourish' | 'stud' | 'none';

export interface GuiTheme {
  id: string;
  name: string;
  /** Outer frame around the panel. */
  frame: string;
  frameLight: string;
  frameDark: string;
  /** Flat panel face the slots are cut into. */
  face: string;
  faceLight: string;
  faceDark: string;
  /** Recessed slot well. */
  well: string;
  wellDark: string;
  wellLight: string;
  /** Title ribbon. */
  header: string;
  headerLight: string;
  headerDark: string;
  headerText: string;
  accent: string;
  accentDark: string;
  grain: GuiGrain;
  ornament: GuiOrnament;
  blurb: string;
}

export interface GuiTextureOptions {
  theme: string;
  /** Title ribbon across the top. */
  header: boolean;
  /** Recessed slot wells (turn off for a plain framed panel). */
  wells: boolean;
  /** Panel material grain. */
  grain: boolean;
  /** Corner rivets / flourish plates. */
  ornaments: boolean;
  /** Empty string means the theme's own accent. */
  accent: string;
  /** Frame thickness in pixels. */
  padding: number;
}

export const HEADER_HEIGHT = 13;
export const HEADER_GAP = 3;
export const MAX_PADDING = 14;

export const GUI_THEMES: GuiTheme[] = [
  {
    id: 'oak',
    name: 'Oak',
    frame: '#8a5a2b',
    frameLight: '#b47c40',
    frameDark: '#452a12',
    face: '#c9a46a',
    faceLight: '#dcbd88',
    faceDark: '#9d7a46',
    well: '#8b8b8b',
    wellDark: '#3d3d3d',
    wellLight: '#c6c6c6',
    header: '#5d3a1a',
    headerLight: '#7a4f26',
    headerDark: '#33200e',
    headerText: '#ffe4b0',
    accent: '#ffb84d',
    accentDark: '#a86a1e',
    grain: 'wood',
    ornament: 'flourish',
    blurb: 'Warm oak frame with pinned corners — survival and shop menus.',
  },
  {
    id: 'market',
    name: 'Market',
    frame: '#2b4b6b',
    frameLight: '#3f6d94',
    frameDark: '#16283a',
    face: '#cfe8f3',
    faceLight: '#e6f5fb',
    faceDark: '#a9cfe0',
    well: '#a6c9da',
    wellDark: '#557f95',
    wellLight: '#e8f7ff',
    header: '#3f7fa6',
    headerLight: '#5fa3c9',
    headerDark: '#234b66',
    headerText: '#ffffff',
    accent: '#ffd166',
    accentDark: '#b98a2c',
    grain: 'cloth',
    ornament: 'rivet',
    blurb: 'Bright painted marketplace panels with a light face.',
  },
  {
    id: 'arcane',
    name: 'Arcane',
    frame: '#3a2a6b',
    frameLight: '#5a419c',
    frameDark: '#1d1438',
    face: '#4a3a86',
    faceLight: '#5d4a9e',
    faceDark: '#352769',
    well: '#2a1f52',
    wellDark: '#140c2e',
    wellLight: '#6b55b8',
    header: '#241a4a',
    headerLight: '#3a2a70',
    headerDark: '#120c26',
    headerText: '#e6d4ff',
    accent: '#b06cff',
    accentDark: '#6a38ab',
    grain: 'metal',
    ornament: 'flourish',
    blurb: 'Enchanting-table purple with cold metal corners.',
  },
  {
    id: 'nether',
    name: 'Nether',
    frame: '#6b1f1f',
    frameLight: '#8f3230',
    frameDark: '#38100f',
    face: '#532224',
    faceLight: '#6a2c2e',
    faceDark: '#3a1618',
    well: '#3d3d3d',
    wellDark: '#1a1a1a',
    wellLight: '#7a7a7a',
    header: '#2f0c0c',
    headerLight: '#4d1717',
    headerDark: '#1a0606',
    headerText: '#ffd2c2',
    accent: '#ff7a59',
    accentDark: '#a43c22',
    grain: 'stone',
    ornament: 'rivet',
    blurb: 'Crimson frame for shops and kits with a darker mood.',
  },
  {
    id: 'frost',
    name: 'Frost',
    frame: '#3a5f7a',
    frameLight: '#54809c',
    frameDark: '#1e3648',
    face: '#d7ecf7',
    faceLight: '#eef9ff',
    faceDark: '#b4d5e6',
    well: '#aecfe2',
    wellDark: '#5c7f95',
    wellLight: '#f2fbff',
    header: '#2c4a63',
    headerLight: '#416a88',
    headerDark: '#1a2f40',
    headerText: '#ffffff',
    accent: '#7fe3ff',
    accentDark: '#3f8ba8',
    grain: 'metal',
    ornament: 'stud',
    blurb: 'Icy blue panel for winter events and crate menus.',
  },
  {
    id: 'emerald',
    name: 'Emerald',
    frame: '#2f6b45',
    frameLight: '#438a5c',
    frameDark: '#173a25',
    face: '#1e3a2c',
    faceLight: '#284b39',
    faceDark: '#152b20',
    well: '#2f5c45',
    wellDark: '#0c1a14',
    wellLight: '#559b74',
    header: '#12261d',
    headerLight: '#1e3b2d',
    headerDark: '#0a1711',
    headerText: '#c8ffe4',
    accent: '#4fd18b',
    accentDark: '#1f7f4f',
    grain: 'stone',
    ornament: 'flourish',
    blurb: 'Deep green with a glowing accent — trade and currency menus.',
  },
  {
    id: 'vanilla',
    name: 'Classic',
    frame: '#7a7a7a',
    frameLight: '#a9a9a9',
    frameDark: '#4a4a4a',
    face: '#c6c6c6',
    faceLight: '#dedede',
    faceDark: '#a8a8a8',
    well: '#8b8b8b',
    wellDark: '#373737',
    wellLight: '#d4d4d4',
    header: '#6f6f6f',
    headerLight: '#8f8f8f',
    headerDark: '#4a4a4a',
    headerText: '#ffffff',
    accent: '#f5b942',
    accentDark: '#9a6d1d',
    grain: 'none',
    ornament: 'stud',
    blurb: 'Close to the vanilla chest texture, with a cleaner frame.',
  },
  {
    id: 'obsidian',
    name: 'Obsidian',
    frame: '#5b4a86',
    frameLight: '#7b66ad',
    frameDark: '#31264f',
    face: '#241b3a',
    faceLight: '#30254c',
    faceDark: '#1a132b',
    well: '#3f3459',
    wellDark: '#120d20',
    wellLight: '#635388',
    header: '#150f24',
    headerLight: '#241a3c',
    headerDark: '#0b0714',
    headerText: '#e6d4ff',
    accent: '#b06cff',
    accentDark: '#5c3699',
    grain: 'metal',
    ornament: 'rivet',
    blurb: 'Dark storage menus with violet edge highlights.',
  },
];

export function defaultTextureOptions(): GuiTextureOptions {
  return {
    theme: 'oak',
    header: true,
    wells: true,
    grain: true,
    ornaments: true,
    accent: '',
    padding: 6,
  };
}

export function themeById(id: string): GuiTheme {
  return GUI_THEMES.find((theme) => theme.id === id) ?? GUI_THEMES[0];
}

/* ------------------------------------------------------------------ */
/* Pixel helpers                                                       */
/* ------------------------------------------------------------------ */

type RGB = [number, number, number];

function toRgb(hex: string): RGB {
  const value = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return [0, 0, 0];
  const n = parseInt(value, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Deterministic integer hash in [0, 1) - the grain must look the same every render. */
function noise(x: number, y: number, seed = 7): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2654435761) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function mix(a: RGB, b: RGB, t: number): RGB {
  const clamped = Math.max(0, Math.min(1, t));
  return [
    Math.round(a[0] + (b[0] - a[0]) * clamped),
    Math.round(a[1] + (b[1] - a[1]) * clamped),
    Math.round(a[2] + (b[2] - a[2]) * clamped),
  ];
}

const BLACK: RGB = [0, 0, 0];
const WHITE: RGB = [255, 255, 255];

const lighten = (color: string, t: number): RGB => mix(toRgb(color), WHITE, t);
const darken = (color: string, t: number): RGB => mix(toRgb(color), BLACK, t);

interface Surface {
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
}

function put(surface: Surface, x: number, y: number, color: RGB, alpha = 255): void {
  const px = Math.round(x);
  const py = Math.round(y);
  if (px < 0 || py < 0 || px >= surface.width || py >= surface.height) return;
  const i = (py * surface.width + px) * 4;
  surface.pixels[i] = color[0];
  surface.pixels[i + 1] = color[1];
  surface.pixels[i + 2] = color[2];
  surface.pixels[i + 3] = alpha;
}

function fillRect(surface: Surface, x: number, y: number, w: number, h: number, color: RGB): void {
  for (let py = y; py < y + h; py++) for (let px = x; px < x + w; px++) put(surface, px, py, color);
}

/** One-pixel inner bevel: light along the top/left, dark along the bottom/right. */
function bevelRect(surface: Surface, x: number, y: number, w: number, h: number, light: RGB, dark: RGB): void {
  for (let px = x; px < x + w; px++) {
    put(surface, px, y, light);
    put(surface, px, y + h - 1, dark);
  }
  for (let py = y; py < y + h; py++) {
    put(surface, x, py, light);
    put(surface, x + w - 1, py, dark);
  }
}

/** Dither pattern used by the grain so flat faces read as a material at 1×. */
function grainPixel(theme: GuiTheme, x: number, y: number, base: string): RGB {
  const n = noise(x, y);
  switch (theme.grain) {
    case 'wood': {
      const streak = noise(0, Math.floor(y / 2), 3);
      if (streak > 0.72) return darken(base, 0.08);
      if (streak < 0.18) return lighten(base, 0.06);
      return n > 0.9 ? darken(base, 0.05) : toRgb(base);
    }
    case 'stone':
      if (n > 0.86) return lighten(base, 0.1);
      if (n < 0.12) return darken(base, 0.1);
      return toRgb(base);
    case 'metal': {
      const sheen = Math.abs(((x + y * 2) % 16) - 8) / 8;
      return mix(toRgb(base), WHITE, sheen > 0.85 ? 0.08 : 0);
    }
    case 'cloth':
      return (x + y) % 4 === 0 ? lighten(base, 0.04) : toRgb(base);
    default:
      return toRgb(base);
  }
}

/* ------------------------------------------------------------------ */
/* Geometry                                                            */
/* ------------------------------------------------------------------ */

export interface GuiTextureMetrics {
  width: number;
  height: number;
  padding: number;
  headerHeight: number;
  slotArea: { x: number; y: number; w: number; h: number };
  /** 18 px slots, the size Minecraft's own container textures use. */
  slotSize: number;
}

export function textureMetrics(rows: number, options: GuiTextureOptions): GuiTextureMetrics {
  const clampedRows = Math.max(1, Math.min(6, Math.round(rows)));
  const padding = Math.max(3, Math.min(MAX_PADDING, Math.round(options.padding)));
  const headerHeight = options.header ? HEADER_HEIGHT + HEADER_GAP : 0;
  const slotW = COLUMNS * SLOT_PX;
  const slotH = clampedRows * SLOT_PX;
  return {
    width: slotW + padding * 2,
    height: slotH + headerHeight + padding * 2,
    padding,
    headerHeight,
    slotArea: { x: padding, y: padding + headerHeight, w: slotW, h: slotH },
    slotSize: SLOT_PX,
  };
}

export function slotRectIn(metrics: GuiTextureMetrics, index: number): { x: number; y: number; w: number; h: number } {
  const col = index % COLUMNS;
  const row = Math.floor(index / COLUMNS);
  return {
    x: metrics.slotArea.x + col * metrics.slotSize,
    y: metrics.slotArea.y + row * metrics.slotSize,
    w: metrics.slotSize,
    h: metrics.slotSize,
  };
}

/** Which slot a texture-space point falls in, or null. */
export function slotAtPoint(metrics: GuiTextureMetrics, x: number, y: number): number | null {
  const { slotArea } = metrics;
  if (x < slotArea.x || y < slotArea.y || x >= slotArea.x + slotArea.w || y >= slotArea.y + slotArea.h) {
    return null;
  }
  const col = Math.floor((x - slotArea.x) / metrics.slotSize);
  const row = Math.floor((y - slotArea.y) / metrics.slotSize);
  return row * COLUMNS + col;
}

/* ------------------------------------------------------------------ */
/* Painting                                                            */
/* ------------------------------------------------------------------ */

export interface PaintedGuiTexture {
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
  metrics: GuiTextureMetrics;
}

/** Strips `&a`-style colour codes from a menu title. */
export function plainTitle(title: string): string {
  return title.replace(/&./g, '').trim();
}

function paintHeader(surface: Surface, metrics: GuiTextureMetrics, theme: GuiTheme, accent: RGB, title: string): void {
  const x = metrics.padding;
  const y = metrics.padding;
  const w = metrics.slotArea.w;
  const h = HEADER_HEIGHT;

  fillRect(surface, x, y, w, h, toRgb(theme.header));
  bevelRect(surface, x, y, w, h, toRgb(theme.headerLight), toRgb(theme.headerDark));

  // Ribbon pins at both ends, then a thin accent groove under the band.
  for (const pinX of [x + 3, x + w - 6]) {
    fillRect(surface, pinX, y + 3, 3, 7, accent);
    put(surface, pinX, y + 3, lighten(theme.accent, 0.35));
    put(surface, pinX + 2, y + 9, mix(accent, BLACK, 0.4));
  }
  fillRect(surface, x, y + h - 1, w, 1, toRgb(theme.headerDark));
  fillRect(surface, x + 1, y + h, w - 2, 1, accent);

  const text = plainTitle(title).toUpperCase();
  const maxChars = Math.max(1, Math.floor((w - 20) / 6));
  const clipped = text.slice(0, maxChars);
  if (!clipped) return;
  const textWidth = clipped.length * 6 - 1;
  const textX = x + Math.round((w - textWidth) / 2);
  const textY = y + Math.floor((h - 7) / 2);
  drawText(surface.pixels, surface.width, surface.height, textX + 1, textY + 1, clipped, [0, 0, 0, 160], 1, 1);
  drawText(surface.pixels, surface.width, surface.height, textX, textY, clipped, [...toRgb(theme.headerText), 255], 1, 1);
}

function paintWells(surface: Surface, metrics: GuiTextureMetrics, rows: number, theme: GuiTheme): void {
  const total = rows * COLUMNS;
  for (let index = 0; index < total; index++) {
    const rect = slotRectIn(metrics, index);
    // 1px of face between wells, then a recessed well with a hard shadow lip.
    fillRect(surface, rect.x, rect.y, rect.w, rect.h, toRgb(theme.face));
    const inner = { x: rect.x + 1, y: rect.y + 1, w: rect.w - 2, h: rect.h - 2 };
    fillRect(surface, inner.x, inner.y, inner.w, inner.h, toRgb(theme.well));
    bevelRect(surface, inner.x, inner.y, inner.w, inner.h, toRgb(theme.wellDark), toRgb(theme.wellLight));
    // A darker notch in the top-left corner sells the depth.
    put(surface, inner.x, inner.y, darken(theme.wellDark, 0.35));
    put(surface, inner.x + 1, inner.y, darken(theme.wellDark, 0.2));
    put(surface, inner.x, inner.y + 1, darken(theme.wellDark, 0.2));
  }
}

function paintFrame(surface: Surface, metrics: GuiTextureMetrics, theme: GuiTheme, accent: RGB): void {
  const pad = metrics.padding;
  const w = metrics.width;
  const h = metrics.height;

  // Frame body: the ring between the outer edge and the panel face.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const distX = Math.min(x, w - 1 - x);
      const distY = Math.min(y, h - 1 - y);
      const dist = Math.min(distX, distY);
      if (dist >= pad) continue;
      const base = theme.grain === 'none' ? toRgb(theme.frame) : grainPixel(theme, x, y, theme.frame);
      put(surface, x, y, base);
    }
  }

  // Outer outline, then an inner bevel that reads as a raised wooden plate.
  for (let x = 0; x < w; x++) {
    put(surface, x, 0, toRgb(theme.frameDark));
    put(surface, x, h - 1, toRgb(theme.frameDark));
  }
  for (let y = 0; y < h; y++) {
    put(surface, 0, y, toRgb(theme.frameDark));
    put(surface, w - 1, y, toRgb(theme.frameDark));
  }
  for (let x = 1; x < w - 1; x++) {
    put(surface, x, 1, lighten(theme.frameLight, 0.1));
    put(surface, x, h - 2, darken(theme.frame, 0.25));
  }
  for (let y = 1; y < h - 1; y++) {
    put(surface, 1, y, lighten(theme.frameLight, 0.1));
    put(surface, w - 2, y, darken(theme.frame, 0.25));
  }
  for (let x = pad; x < w - pad; x++) {
    put(surface, x, pad - 1, toRgb(theme.frameDark));
    put(surface, x, h - pad, toRgb(theme.frameDark));
  }
  for (let y = pad; y < h - pad; y++) {
    put(surface, pad - 1, y, toRgb(theme.frameDark));
    put(surface, w - pad, y, toRgb(theme.frameDark));
  }

  if (theme.ornament === 'none') return;

  if (theme.ornament === 'rivet' || theme.ornament === 'stud') {
    const corners = [
      [2, 2],
      [w - 5, 2],
      [2, h - 5],
      [w - 5, h - 5],
    ];
    for (const [cx, cy] of corners) {
      const size = theme.ornament === 'rivet' ? 3 : 2;
      fillRect(surface, cx, cy, size, size, mix(accent, BLACK, 0.15));
      put(surface, cx, cy, lighten(theme.accent, 0.45));
      put(surface, cx + 1, cy, lighten(theme.accent, 0.2));
      put(surface, cx, cy + 1, lighten(theme.accent, 0.2));
      put(surface, cx + size - 1, cy + size - 1, mix(accent, BLACK, 0.55));
    }
    return;
  }

  // Flourish: L-shaped accent plates pinned over the frame corners, the way decorated menus plate
  // their border, so they never fight with the ribbon or the slot grid.
  const plates: [number, number, number, number][] = [
    [1, 1, 6, 2],
    [1, 1, 2, 6],
    [w - 7, 1, 6, 2],
    [w - 3, 1, 2, 6],
    [1, h - 3, 6, 2],
    [1, h - 7, 2, 6],
    [w - 7, h - 3, 6, 2],
    [w - 3, h - 7, 2, 6],
  ];
  for (const [x, y, rw, rh] of plates) {
    fillRect(surface, x, y, rw, rh, mix(accent, BLACK, 0.1));
    for (let i = 0; i < Math.max(rw, rh); i++) {
      const px = rw > rh ? x + i : x;
      const py = rw > rh ? y : y + i;
      put(surface, px, py, i < 2 ? lighten(theme.accent, 0.25) : accent);
    }
  }
  // Small diagonal jewels at the bracket elbows.
  for (const [cx, cy] of [
    [2, 2],
    [w - 4, 2],
    [2, h - 4],
    [w - 4, h - 4],
  ]) {
    put(surface, cx, cy, lighten(theme.accent, 0.5));
    put(surface, cx + 1, cy + 1, mix(accent, BLACK, 0.25));
  }
}

/**
 * Paints the whole GUI texture. Slot wells, header and frame all come from the theme, so changing one
 * option repaints a coherent picture instead of layering unrelated decorations.
 */
export function paintGuiTexture(layout: GuiLayout, options: GuiTextureOptions): PaintedGuiTexture {
  const theme = themeById(options.theme);
  const rows = Math.max(1, Math.min(6, Math.round(layout.rows)));
  const metrics = textureMetrics(rows, options);
  const accent = /^#[0-9a-fA-F]{6}$/.test(options.accent) ? toRgb(options.accent) : toRgb(theme.accent);
  const surface: Surface = {
    pixels: new Uint8ClampedArray(metrics.width * metrics.height * 4),
    width: metrics.width,
    height: metrics.height,
  };

  // Panel face, with material grain when the theme asks for it.
  for (let y = metrics.padding; y < metrics.height - metrics.padding; y++) {
    for (let x = metrics.padding; x < metrics.width - metrics.padding; x++) {
      const headerBand = options.header && y < metrics.padding + metrics.headerHeight;
      if (headerBand) continue;
      put(surface, x, y, options.grain ? grainPixel(theme, x, y, theme.face) : toRgb(theme.face));
    }
  }
  // A soft inner shading line under the frame, so the face sits below the frame edge.
  for (let x = metrics.padding; x < metrics.width - metrics.padding; x++) {
    put(surface, x, metrics.slotArea.y - (options.header ? 0 : 1), darken(theme.face, 0.12));
  }
  for (let y = metrics.padding; y < metrics.height - metrics.padding; y++) {
    put(surface, metrics.padding, y, darken(theme.face, 0.06));
  }

  if (options.header) paintHeader(surface, metrics, theme, accent, layout.title);
  if (options.wells) paintWells(surface, metrics, rows, theme);
  paintFrame(surface, metrics, theme, accent);

  return {
    pixels: surface.pixels,
    width: metrics.width,
    height: metrics.height,
    metrics,
  };
}

export function guiTextureFilename(layout: GuiLayout): string {
  const stem =
    `${layout.namespace}_${layout.name}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'menu';
  return `${stem}_gui`;
}

/** Validates texture options from a file, so a hand-edited .pxl cannot ask for a 900px frame. */
export function sanitizeTextureOptions(raw: unknown): GuiTextureOptions {
  const defaults = defaultTextureOptions();
  if (!raw || typeof raw !== 'object') return defaults;
  const value = raw as Partial<GuiTextureOptions>;
  return {
    theme: GUI_THEMES.some((theme) => theme.id === value.theme) ? (value.theme as string) : defaults.theme,
    header: value.header !== false,
    wells: value.wells !== false,
    grain: value.grain !== false,
    ornaments: value.ornaments !== false,
    accent: typeof value.accent === 'string' && /^#[0-9a-fA-F]{6}$/.test(value.accent) ? value.accent : '',
    padding: Math.max(3, Math.min(MAX_PADDING, Math.round(typeof value.padding === 'number' ? value.padding : defaults.padding))),
  };
}
