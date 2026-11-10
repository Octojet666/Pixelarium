/**
 * Native Pixelarium project format (.pxl).
 *
 * A .pxl file is UTF-8 JSON. Cel pixels are base64-encoded RGBA bytes so the file
 * stays compact and diffable, and every structural value is explicit. See
 * docs/PROJECT_FORMAT.md for the schema.
 */

import type {
  AnimationTag,
  BlendMode,
  CinemaSettings,
  Frame,
  FrameCamera,
  Layer,
  Palette,
  ProjectDoc,
  ProjectMeta,
} from '../types';
import { BLEND_MODES } from '../types';
import { createCel } from './pixel';
import { emptyLayout, menuSize, type GuiLayout, type GuiSlot, type GuiTexture } from './mcGui';
import { sanitizeTextureOptions, type GuiTextureOptions } from './guiTexture';
import {
  clamp,
  MAX_PROPS,
  MAX_SCENE_SIZE,
  type SceneBackdrop,
  type SceneDoc,
  type SceneFx,
  type SceneLight,
  type SceneProp,
} from './scene';

export const PXL_FORMAT = 'pixelarium';
export const PXL_VERSION = 1;
export const PXL_EXTENSION = '.pxl';

interface SerializedCel {
  [layerId: string]: string;
}

export interface SerializedDoc {
  id: string;
  name: string;
  width: number;
  height: number;
  layers: Layer[];
  frames: (Omit<Frame, 'cels'> & { cels: SerializedCel })[];
  palettes: Palette[];
  activePaletteId: string;
  primary: string;
  secondary: string;
  tags: AnimationTag[];
  meta: ProjectMeta;
  indexed?: boolean;
  nineSlice?: { left: number; right: number; top: number; bottom: number };
  cinema?: CinemaSettings;
  gui?: GuiLayout;
  guiTexture?: GuiTextureOptions;
  scene?: SceneDoc;
  tilemap?: {
    tileSize: number;
    cols: number;
    rows: number;
    tiles: { id: string; name: string; pixels: string }[];
    cells: (string | null)[];
  };
}

export interface PxlFile {
  format: typeof PXL_FORMAT;
  version: number;
  app: string;
  savedAt: string;
  document: SerializedDoc;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function serializeProject(doc: ProjectDoc): PxlFile {
  const frames = doc.frames.map((f) => {
    const cels: SerializedCel = {};
    for (const layer of doc.layers) {
      const cel = f.cels[layer.id];
      if (cel) cels[layer.id] = bytesToBase64(new Uint8Array(cel.buffer, cel.byteOffset, cel.byteLength));
    }
    return {
      id: f.id,
      duration: f.duration,
      label: f.label,
      cels,
      camera: f.camera ? { ...f.camera } : undefined,
    };
  });
  return {
    format: PXL_FORMAT,
    version: PXL_VERSION,
    app: 'Pixelarium',
    savedAt: new Date().toISOString(),
    document: {
      id: doc.id,
      name: doc.name,
      width: doc.width,
      height: doc.height,
      layers: doc.layers.map((l) => ({ ...l })),
      frames,
      palettes: doc.palettes.map((p) => ({ ...p, colors: [...p.colors] })),
      activePaletteId: doc.activePaletteId,
      primary: doc.primary,
      secondary: doc.secondary,
      tags: doc.tags.map((t) => ({ ...t })),
      meta: { ...doc.meta, tags: [...doc.meta.tags] },
      indexed: doc.indexed === true ? true : undefined,
      nineSlice: doc.nineSlice ? { ...doc.nineSlice } : undefined,
      cinema: doc.cinema ? { ...doc.cinema } : undefined,
      guiTexture: doc.guiTexture ? { ...doc.guiTexture } : undefined,
      scene: doc.scene
        ? {
            width: doc.scene.width,
            height: doc.scene.height,
            backdrop: { ...doc.scene.backdrop },
            fx: { ...doc.scene.fx, light: doc.scene.fx.light ? { ...doc.scene.fx.light } : null },
            props: doc.scene.props.map((prop) => ({ ...prop })),
          }
        : undefined,
      gui: doc.gui
        ? {
            ...doc.gui,
            slots: doc.gui.slots.map((slot) => ({
              ...slot,
              lore: [...slot.lore],
              icon: slot.icon ? { ...slot.icon } : null,
            })),
          }
        : undefined,
      tilemap: doc.tilemap
        ? {
            tileSize: doc.tilemap.tileSize,
            cols: doc.tilemap.cols,
            rows: doc.tilemap.rows,
            cells: [...doc.tilemap.cells],
            tiles: doc.tilemap.tiles.map((t) => ({
              id: t.id,
              name: t.name,
              pixels: bytesToBase64(new Uint8Array(t.pixels.buffer, t.pixels.byteOffset, t.pixels.byteLength)),
            })),
          }
        : undefined,
    },
  };
}

export function serializeProjectToString(doc: ProjectDoc, pretty = false): string {
  return JSON.stringify(serializeProject(doc), null, pretty ? 2 : 0);
}

function fail(message: string): never {
  throw new Error(message);
}

function asNumber(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function asString(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : fallback;
}

/**
 * Parses and validates a .pxl document. Throws a descriptive error for files that
 * are not Pixelarium projects; repairs recoverable issues (missing cels, bad blend
 * modes) instead of discarding user work.
 */
export function deserializeProject(input: unknown): ProjectDoc {
  let raw: unknown = input;
  if (typeof input === 'string') {
    try {
      raw = JSON.parse(input);
    } catch {
      fail('This file is not valid JSON, so it cannot be opened as a Pixelarium project.');
    }
  }
  const file = raw as Partial<PxlFile> | null;
  if (!file || typeof file !== 'object') fail('Empty or unreadable project file.');
  if (file.format !== PXL_FORMAT) fail('This is not a Pixelarium project file (.pxl).');
  if (typeof file.version !== 'number' || file.version > PXL_VERSION) {
    fail(`This project was saved with a newer Pixelarium version (format ${String(file.version)}).`);
  }
  const d = file.document;
  if (!d) fail('The project file has no document section.');

  const width = Math.round(asNumber(d.width, 0));
  const height = Math.round(asNumber(d.height, 0));
  if (width < 1 || height < 1) fail('The project canvas has invalid dimensions.');
  if (width > 4096 || height > 4096) fail('Canvas dimensions exceed the 4096 px limit.');

  const layers: Layer[] = Array.isArray(d.layers)
    ? d.layers.map((l, i) => ({
        id: asString(l?.id, `layer-${i + 1}`),
        name: asString(l?.name, `Layer ${i + 1}`),
        visible: l?.visible !== false,
        locked: l?.locked === true,
        opacity: Math.max(0, Math.min(255, Math.round(asNumber(l?.opacity, 255)))),
        blend: BLEND_MODES.includes(l?.blend as BlendMode) ? (l.blend as BlendMode) : 'normal',
      }))
    : [];
  if (layers.length === 0) fail('The project contains no layers.');

  const frames: Frame[] = Array.isArray(d.frames)
    ? d.frames.map((f, i) => {
        const cels: Record<string, Uint8ClampedArray> = {};
        for (const layer of layers) {
          const encoded = (f?.cels as Record<string, unknown> | undefined)?.[layer.id];
          if (typeof encoded === 'string') {
            try {
              const bytes = base64ToBytes(encoded);
              if (bytes.byteLength === width * height * 4) {
                cels[layer.id] = new Uint8ClampedArray(bytes.buffer, bytes.byteOffset, bytes.byteLength);
              }
            } catch {
              /* corrupt cel -> replaced with an empty one below */
            }
          }
          if (!cels[layer.id]) cels[layer.id] = createCel(width, height);
        }
        const camera = readCamera(f?.camera);
        return {
          id: asString(f?.id, `frame-${i + 1}`),
          duration: Math.max(10, Math.round(asNumber(f?.duration, 100))),
          label: typeof f?.label === 'string' ? f.label : undefined,
          cels,
          ...(camera ? { camera } : {}),
        };
      })
    : [];
  if (frames.length === 0) fail('The project contains no frames.');

  const palettes: Palette[] = Array.isArray(d.palettes)
    ? d.palettes
        .filter((p) => Array.isArray(p?.colors))
        .map((p, i) => ({
          id: asString(p.id, `palette-${i + 1}`),
          name: asString(p.name, `Palette ${i + 1}`),
          colors: (p.colors as unknown[]).filter((c): c is string => typeof c === 'string'),
        }))
    : [];

  const tags: AnimationTag[] = Array.isArray(d.tags)
    ? d.tags.map((t, i) => ({
        id: asString(t?.id, `tag-${i + 1}`),
        name: asString(t?.name, `Tag ${i + 1}`),
        from: Math.max(0, Math.min(frames.length - 1, Math.round(asNumber(t?.from, 0)))),
        to: Math.max(0, Math.min(frames.length - 1, Math.round(asNumber(t?.to, 0)))),
        mode: t?.mode === 'reverse' || t?.mode === 'pingpong' ? t.mode : 'forward',
        fps: typeof t?.fps === 'number' ? t.fps : undefined,
      }))
    : [];

  let tilemap: ProjectDoc['tilemap'];
  if (d.tilemap && Array.isArray(d.tilemap.tiles)) {
    const tileSize = Math.max(4, Math.min(64, Math.round(asNumber(d.tilemap.tileSize, 16))));
    const tiles = d.tilemap.tiles
      .filter((t) => typeof t?.id === 'string' && typeof t?.pixels === 'string')
      .map((t) => {
        let pixels = createCel(tileSize, tileSize);
        try {
          const bytes = base64ToBytes(t.pixels);
          if (bytes.byteLength === tileSize * tileSize * 4) {
            pixels = new Uint8ClampedArray(bytes.buffer, bytes.byteOffset, bytes.byteLength);
          }
        } catch {
          /* keep an empty tile */
        }
        return { id: t.id, name: asString(t.name, 'Tile'), pixels };
      });
    if (tiles.length > 0) {
      const cols = Math.max(1, Math.min(64, Math.round(asNumber(d.tilemap.cols, 16))));
      const rows = Math.max(1, Math.min(64, Math.round(asNumber(d.tilemap.rows, 16))));
      const cells = Array.isArray(d.tilemap.cells) ? d.tilemap.cells : [];
      tilemap = {
        tileSize,
        cols,
        rows,
        tiles,
        cells: Array.from({ length: cols * rows }, (_, i) =>
          typeof cells[i] === 'string' && tiles.some((t) => t.id === cells[i]) ? (cells[i] as string) : null,
        ),
      };
    }
  }

  const cinema = readCinema(d.cinema);
  const gui = readGui(d.gui);
  const scene = readScene(d.scene);
  const guiTexture = d.guiTexture ? sanitizeTextureOptions(d.guiTexture) : undefined;
  const now = Date.now();
  return {
    id: asString(d.id, `doc-${now.toString(36)}`),
    name: asString(d.name, 'Untitled project'),
    width,
    height,
    layers,
    frames,
    palettes,
    activePaletteId: asString(d.activePaletteId, palettes[0]?.id ?? ''),
    primary: asString(d.primary, '#f2e9ff'),
    secondary: asString(d.secondary, '#241d4a'),
    indexed: d.indexed === true,
    nineSlice: readNineSlice(d.nineSlice, width, height),
    tags,
    tilemap,
    ...(cinema ? { cinema } : {}),
    ...(gui ? { gui } : {}),
    ...(guiTexture ? { guiTexture } : {}),
    ...(scene ? { scene } : {}),
    meta: {
      createdAt: asNumber(d.meta?.createdAt, now),
      updatedAt: asNumber(d.meta?.updatedAt, now),
      description: asString(d.meta?.description, ''),
      author: asString(d.meta?.author, ''),
      tags: Array.isArray(d.meta?.tags) ? d.meta.tags.filter((t): t is string => typeof t === 'string') : [],
    },
  };
}

const GUI_TEXTURES: GuiTexture[] = ['chest', 'hopper', 'generic', 'custom'];

/** Reads a Minecraft GUI layout, dropping anything a server would reject. */
function readGui(raw: unknown): GuiLayout | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const g = raw as Partial<GuiLayout>;
  const rows = Math.max(1, Math.min(6, Math.round(asNumber(g.rows, 3))));
  const size = menuSize(rows);
  const slots: GuiSlot[] = [];
  const used = new Set<number>();
  for (const entry of Array.isArray(g.slots) ? g.slots : []) {
    if (!entry || typeof entry !== 'object') continue;
    const slot = entry as Partial<GuiSlot>;
    const index = Math.round(asNumber(slot.index, -1));
    if (index < 0 || index >= size || used.has(index)) continue;
    used.add(index);
    const icon = slot.icon;
    const validIcon =
      icon && typeof icon === 'object'
        && [icon.x, icon.y, icon.w, icon.h].every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0)
        && icon.w > 0 && icon.h > 0
        ? { x: Math.round(icon.x), y: Math.round(icon.y), w: Math.round(icon.w), h: Math.round(icon.h) }
        : null;
    slots.push({
      index,
      material: /^[A-Z][A-Z0-9_]*$/.test(asString(slot.material, '')) ? (slot.material as string) : 'STONE',
      name: asString(slot.name, 'Item').slice(0, 64),
      lore: Array.isArray(slot.lore) ? slot.lore.filter((l): l is string => typeof l === 'string').slice(0, 12) : [],
      amount: Math.max(1, Math.min(64, Math.round(asNumber(slot.amount, 1)))),
      action: asString(slot.action, '').slice(0, 200),
      icon: validIcon,
    });
  }
  const texture = GUI_TEXTURES.find((t) => t === g.texture) ?? 'chest';
  return emptyLayout({
    name: asString(g.name, 'Menu').slice(0, 64),
    title: asString(g.title, '&8Menu').slice(0, 64),
    openCommand: asString(g.openCommand, 'menu').slice(0, 64),
    rows,
    texture,
    namespace: asString(g.namespace, 'pixelarium').slice(0, 32),
    permission: asString(g.permission, '').slice(0, 64),
    slots,
  });
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/** Nine-slice insets are stored per edge, clamped so opposite edges cannot overlap. */
function readNineSlice(
  raw: unknown,
  width: number,
  height: number,
): { left: number; right: number; top: number; bottom: number } | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const n = raw as Partial<Record<'left' | 'right' | 'top' | 'bottom', unknown>>;
  const side = (v: unknown, fallback: number) => Math.max(0, Math.min(4096, Math.round(asNumber(v, fallback))));
  const left = Math.min(side(n.left, 0), width - 1);
  const right = Math.min(side(n.right, 0), width - 1 - left);
  const top = Math.min(side(n.top, 0), height - 1);
  const bottom = Math.min(side(n.bottom, 0), height - 1 - top);
  if (left + right === 0 && top + bottom === 0) return undefined;
  return { left, right, top, bottom };
}

function readColor(raw: unknown, fallback: string): string {
  return typeof raw === 'string' && HEX_COLOR.test(raw) ? raw : fallback;
}

/** Reads a scene composition, clamping sizes and dropping props that make no sense. */
function readScene(raw: unknown): SceneDoc | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const s = raw as Partial<SceneDoc>;
  const width = clamp(Math.round(asNumber(s.width, 64)), 8, MAX_SCENE_SIZE);
  const height = clamp(Math.round(asNumber(s.height, 64)), 8, MAX_SCENE_SIZE);

  const backdropRaw = (s.backdrop ?? {}) as Partial<SceneBackdrop>;
  const backdrop: SceneBackdrop = {
    kind: backdropRaw.kind === 'flat' || backdropRaw.kind === 'radial' ? backdropRaw.kind : 'vertical',
    from: readColor(backdropRaw.from, '#151224'),
    to: readColor(backdropRaw.to, '#3a2b52'),
    dither: backdropRaw.dither === true,
  };

  const props: SceneProp[] = [];
  const usedIds = new Set<string>();
  for (const entry of Array.isArray(s.props) ? s.props : []) {
    if (props.length >= MAX_PROPS) break;
    if (!entry || typeof entry !== 'object') continue;
    const p = entry as Partial<SceneProp>;
    let id = asString(p.id, `prop_${props.length}`).slice(0, 64);
    while (usedIds.has(id)) id = `${id}_`;
    usedIds.add(id);
    props.push({
      id,
      name: asString(p.name, 'Sprite').slice(0, 64),
      frame: Math.max(0, Math.round(asNumber(p.frame, 0))),
      x: clamp(Math.round(asNumber(p.x, 0)), -MAX_SCENE_SIZE, MAX_SCENE_SIZE * 2),
      y: clamp(Math.round(asNumber(p.y, 0)), -MAX_SCENE_SIZE, MAX_SCENE_SIZE * 2),
      scale: clamp(Math.round(asNumber(p.scale, 1)), 1, 8),
      flipX: p.flipX === true,
      opacity: clamp(Math.round(asNumber(p.opacity, 100)), 0, 100),
    });
  }

  const fxRaw = (s.fx ?? {}) as Partial<SceneFx>;
  const lightRaw = fxRaw.light;
  const light: SceneLight | null =
    lightRaw && typeof lightRaw === 'object'
      ? (() => {
          const l = lightRaw as Partial<SceneLight>;
          return {
            x: clamp(Math.round(asNumber(l.x, width / 2)), -MAX_SCENE_SIZE, MAX_SCENE_SIZE * 2),
            y: clamp(Math.round(asNumber(l.y, height / 2)), -MAX_SCENE_SIZE, MAX_SCENE_SIZE * 2),
            radius: clamp(Math.round(asNumber(l.radius, 32)), 0, MAX_SCENE_SIZE * 2),
            color: readColor(l.color, '#ffe9b0'),
            strength: clamp(Math.round(asNumber(l.strength, 50)), 0, 100),
          };
        })()
      : null;

  return {
    width,
    height,
    backdrop,
    props,
    fx: { vignette: clamp(Math.round(asNumber(fxRaw.vignette, 0)), 0, 100), light },
  };
}

function readCamera(raw: unknown): FrameCamera | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const c = raw as Partial<FrameCamera>;
  if (typeof c.x !== 'number' || typeof c.y !== 'number' || typeof c.zoom !== 'number') return undefined;
  return {
    x: Math.max(0, Math.min(1, c.x)),
    y: Math.max(0, Math.min(1, c.y)),
    zoom: Math.max(0.2, Math.min(8, c.zoom)),
  };
}

function readCinema(raw: unknown): CinemaSettings | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const c = raw as Partial<CinemaSettings>;
  const aspect = c.aspect;
  const fit = c.fit;
  return {
    aspect: aspect === '9:16' || aspect === '1:1' || aspect === '4:3' || aspect === 'source' ? aspect : '16:9',
    fit: fit === 'cover' ? 'cover' : 'contain',
    background: typeof c.background === 'string' && /^#[0-9a-fA-F]{6}$/.test(c.background) ? c.background : '#0b0b10',
    fps: Math.max(6, Math.min(60, Math.round(asNumber(c.fps, 24)))),
  };
}

/** Human-readable summary used by the import dialog. */
export function describePxlFile(file: PxlFile): string {
  return `${file.document.width}×${file.document.height} · ${file.document.layers.length} layers · ${file.document.frames.length} frames`;
}
