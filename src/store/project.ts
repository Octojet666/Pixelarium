/** The editor document store. React components read slabs; the canvas reads it imperatively. */

import { create } from 'zustand';
import type {
  AnimationTag,
  CinemaSettings,
  FrameCamera,
  NineSliceInsets,
  ProjectDoc,
  Rect,
  ToolId,
  ToolSettings,
} from '../types';
import { compositeFrame } from '../engine/composite';
import { createLayer, createProject, uid } from '../engine/document';
import { drawText } from '../engine/font';
import {
  type History,
  type HistoryEntry,
  type HistoryState,
  History as HistoryClass,
  applyEntry,
  makePixelEntry,
  snapshotStructure,
} from '../engine/history';
import { createCel, extractRegion, writeRegion } from '../engine/pixel';
import { blendCels, tweenSteps, type TweenEasing } from '../engine/tween';
import type { GuiLayout } from '../engine/mcGui';
import type { SceneDoc } from '../engine/scene';
import type { GuiTextureOptions } from '../engine/guiTexture';
import type { Palette } from '../types';
import { saveStoredProject, saveRecoveryDraft } from '../db/library';

export interface Selection {
  mask: Uint8Array;
  bounds: Rect;
}

export interface CelClipboard {
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
}

export type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'error';

function rgbToHex(r: number, g: number, b: number): string {
  const part = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}

/** Nearest palette entry, weighted for perceived brightness. */
export function snapHexToPalette(doc: ProjectDoc, hex: string): string {
  const palette = doc.palettes.find((p) => p.id === doc.activePaletteId) ?? doc.palettes[0];
  if (!palette || palette.colors.length === 0) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  let best = palette.colors[0];
  let bestD = Infinity;
  for (const candidate of palette.colors) {
    const cr = parseInt(candidate.slice(1, 3), 16);
    const cg = parseInt(candidate.slice(3, 5), 16);
    const cb = parseInt(candidate.slice(5, 7), 16);
    const d = (r - cr) ** 2 * 0.3 + (g - cg) ** 2 * 0.59 + (b - cb) ** 2 * 0.11;
    if (d < bestD) {
      bestD = d;
      best = candidate;
    }
  }
  return best;
}

const DEFAULT_TOOL_SETTINGS: ToolSettings = {
  size: 1,
  opacity: 1,
  pixelPerfect: true,
  symmetryX: false,
  symmetryY: false,
  tolerance: 0,
  shape: 'square',
  gradientMode: 'linear',
  ditherPattern: 'bayer4',
  sprayDensity: 0.35,
  fontScale: 1,
  filled: true,
  pressureSize: true,
  pressureOpacity: false,
  tileMode: false,
  tilePreview: false,
  brushId: '',
};

interface PendingStroke {
  label: string;
  frameId: string;
  layerId: string;
  before: Uint8ClampedArray;
}

export interface EditorState {
  doc: ProjectDoc;
  activeLayerId: string;
  activeFrameId: string;
  revision: number;
  tool: ToolId;
  toolSettings: ToolSettings;
  selection: Selection | null;
  history: History;
  historyState: HistoryState;
  saveStatus: SaveStatus;
  lastSavedAt: number | null;
  thumbnail: string | null;
  clipboard: CelClipboard | null;
  frameClipboard: ProjectDoc['frames'][number] | null;
  paletteClipboard: string[] | null;
  pending: PendingStroke | null;

  /* tools & colors */
  setTool: (tool: ToolId) => void;
  updateToolSettings: (patch: Partial<ToolSettings>) => void;
  setPrimary: (hex: string) => void;
  setSecondary: (hex: string) => void;
  swapColors: () => void;

  /* selection */
  setRectSelection: (rect: Rect) => void;
  setLassoSelection: (points: { x: number; y: number }[]) => void;
  translateSelection: (dx: number, dy: number) => void;
  selectAll: () => void;
  clearSelection: () => void;
  deleteSelection: () => void;
  copySelection: () => void;
  pasteSelection: (at?: { x: number; y: number }) => void;

  /* cels & history */
  beginStroke: (label: string) => void;
  endStroke: () => void;
  pushPixelEdit: (label: string, before: Uint8ClampedArray, frameId?: string, layerId?: string) => void;
  replaceActiveCel: (label: string, pixels: Uint8ClampedArray, asNewLayer?: boolean) => void;
  stampText: (text: string, x: number, y: number, color: string, scale: number) => void;
  clearActiveLayer: () => void;
  undo: () => void;
  redo: () => void;

  /* layers */
  setActiveLayer: (id: string) => void;
  addLayer: (name?: string) => void;
  duplicateLayer: () => void;
  deleteLayer: (id?: string) => void;
  moveLayer: (id: string, direction: 'up' | 'down') => void;
  setLayerProps: (id: string, patch: Partial<Omit<ProjectDoc['layers'][number], 'id'>>, record?: boolean) => void;
  mergeLayerDown: () => void;

  /* frames */
  setActiveFrame: (id: string) => void;
  addFrame: () => void;
  duplicateFrame: () => void;
  /** Fills in the frames between the active frame and the next one; returns how many were made. */
  tweenFrames: (count: number, easing?: TweenEasing) => number;
  deleteFrame: (id?: string) => void;
  moveFrame: (id: string, direction: 'left' | 'right') => void;
  setFrameDuration: (id: string, duration: number) => void;
  setFrameLabel: (id: string, label: string) => void;
  copyFrame: () => void;
  pasteFrame: () => void;

  /* canvas */
  resizeCanvas: (width: number, height: number, anchor: 'top-left' | 'center') => void;
  cropToSelection: () => void;
  flipCanvas: (axis: 'horizontal' | 'vertical') => void;
  rotateCanvas: () => void;

  /* palettes */
  setIndexed: (on: boolean) => void;
  remapAllToPalette: () => void;
  setNineSlice: (insets: NineSliceInsets | null) => void;
  setActivePalette: (id: string) => void;
  addPalette: (palette: Palette) => void;
  updatePaletteColors: (id: string, colors: string[]) => void;
  removePalette: (id: string) => void;
  copyPalette: () => void;
  applyPaletteToArtwork: () => void;
  snapToPalette: () => void;

  /* tilemap */
  setTilemap: (tilemap: ProjectDoc['tilemap']) => void;

  /* cinematic camera */
  setCinemaSettings: (patch: Partial<CinemaSettings>) => void;
  /** Replaces the Minecraft GUI layout stored on the project (edit the menu metadata). */
  setGuiLayout: (layout: GuiLayout) => void;
  /** Replaces the GUI texture theme stored on the project. */
  setGuiTexture: (options: GuiTextureOptions) => void;
  /** Replaces the scene composition stored on the project. */
  setScene: (scene: SceneDoc) => void;
  setFrameCamera: (frameId: string, camera: FrameCamera | null) => void;
  setAllFrameCameras: (camera: FrameCamera | null) => void;

  /* tags */
  addTag: (tag: Omit<AnimationTag, 'id'>) => void;
  removeTag: (id: string) => void;

  /* project */
  setProjectName: (name: string) => void;
  setProjectMeta: (patch: Partial<ProjectDoc['meta']>) => void;
  loadDocument: (doc: ProjectDoc) => void;
  newDocument: (width: number, height: number, name?: string) => void;
  setThumbnail: (dataUrl: string | null) => void;
  saveNow: () => Promise<void>;
  markDirty: () => void;

  /* helpers */
  getActiveCel: () => Uint8ClampedArray | null;
  getActiveLayer: () => ProjectDoc['layers'][number] | null;
  getActiveFrameIndex: () => number;
  notifyStructureChanged: () => void;
}

const history = new HistoryClass();

function boundsFromMask(mask: Uint8Array, width: number, height: number): Rect | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!mask[y * width + x]) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < minX) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function maskFromPolygon(
  points: { x: number; y: number }[],
  width: number,
  height: number,
): Selection | null {
  if (points.length < 3) return null;
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const xs: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
        xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
      }
    }
    xs.sort((m, n) => m - n);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.max(0, Math.round(xs[k]));
      const to = Math.min(width - 1, Math.round(xs[k + 1]));
      for (let x = from; x <= to; x++) mask[y * width + x] = 1;
    }
  }
  const bounds = boundsFromMask(mask, width, height);
  return bounds ? { mask, bounds } : null;
}

function diffRect(a: Uint8ClampedArray, b: Uint8ClampedArray, width: number, height: number): Rect | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    for (let x = 0; x < width; x++) {
      const i = row + x * 4;
      if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

const initialDoc = createProject({ width: 32, height: 32, name: 'Untitled project' });

export const useEditor = create<EditorState>()((set, get) => {
  const refreshHistory = () => set({ historyState: history.state() });

  const bump = () => set((s) => ({ revision: s.revision + 1 }));

  const markDirty = () => {
    set({ saveStatus: 'unsaved' });
  };

  /**
   * Runs a structural mutation, then stores a before/after snapshot.
   * `deep` clones pixel buffers too (needed when the buffers themselves are replaced).
   */
  const structural = (label: string, mutate: () => void, deep = false) => {
    const { doc, activeLayerId, activeFrameId } = get();
    const before = snapshotStructure(doc, activeLayerId, activeFrameId, deep);
    mutate();
    const after = snapshotStructure(doc, activeLayerId, activeFrameId, deep);
    history.push({ kind: 'structure', label, before, after });
    validateActiveIds();
    refreshHistory();
    bump();
    markDirty();
    scheduleAutosave();
  };

  const validateActiveIds = () => {
    const { doc, activeLayerId, activeFrameId } = get();
    if (!doc.layers.some((l) => l.id === activeLayerId)) {
      set({ activeLayerId: doc.layers[doc.layers.length - 1]?.id ?? '' });
    }
    if (!doc.frames.some((f) => f.id === activeFrameId)) {
      set({ activeFrameId: doc.frames[0]?.id ?? '' });
    }
  };

  let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleAutosave = () => {
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      void get().saveNow();
    }, 1100);
  };

  const applyEntryAndSync = (entry: HistoryEntry | null, direction: 'undo' | 'redo') => {
    if (!entry) return;
    const { doc } = get();
    applyEntry(doc, entry, direction);
    if (entry.kind === 'structure') {
      const snap = direction === 'undo' ? entry.before : entry.after;
      set({ activeLayerId: snap.activeLayerId, activeFrameId: snap.activeFrameId });
    } else {
      // Make sure the pixels we just restored are the ones on screen.
      if (doc.frames.some((f) => f.id === entry.frameId) && entry.frameId !== get().activeFrameId) {
        set({ activeFrameId: entry.frameId });
      }
      if (doc.layers.some((l) => l.id === entry.layerId) && entry.layerId !== get().activeLayerId) {
        set({ activeLayerId: entry.layerId });
      }
    }
    refreshHistory();
    bump();
    markDirty();
    scheduleAutosave();
  };

  return {
    doc: initialDoc,
    activeLayerId: initialDoc.layers[0].id,
    activeFrameId: initialDoc.frames[0].id,
    revision: 0,
    tool: 'pencil',
    toolSettings: { ...DEFAULT_TOOL_SETTINGS },
    selection: null,
    history,
    historyState: history.state(),
    saveStatus: 'saved',
    lastSavedAt: null,
    thumbnail: null,
    clipboard: null,
    frameClipboard: null,
    paletteClipboard: null,
    pending: null,

    setTool: (tool) => set({ tool }),
    updateToolSettings: (patch) => set((s) => ({ toolSettings: { ...s.toolSettings, ...patch } })),
    setPrimary: (hex) => {
      const { doc } = get();
      doc.primary = doc.indexed ? snapHexToPalette(doc, hex) : hex;
      markDirty();
      bump();
    },
    setSecondary: (hex) => {
      const { doc } = get();
      doc.secondary = doc.indexed ? snapHexToPalette(doc, hex) : hex;
      markDirty();
      bump();
    },
    swapColors: () => {
      const { doc } = get();
      const p = doc.primary;
      doc.primary = doc.secondary;
      doc.secondary = p;
      markDirty();
      bump();
    },

    setRectSelection: (rect) => {
      const { doc } = get();
      const x0 = Math.max(0, Math.min(rect.x, rect.x + rect.w));
      const y0 = Math.max(0, Math.min(rect.y, rect.y + rect.h));
      const x1 = Math.min(doc.width - 1, Math.max(rect.x, rect.x + rect.w));
      const y1 = Math.min(doc.height - 1, Math.max(rect.y, rect.y + rect.h));
      if (x1 < x0 || y1 < y0) {
        set({ selection: null });
        return;
      }
      const mask = new Uint8Array(doc.width * doc.height);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) mask[y * doc.width + x] = 1;
      set({ selection: { mask, bounds: { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } } });
    },
    setLassoSelection: (points) => {
      const { doc } = get();
      set({ selection: maskFromPolygon(points, doc.width, doc.height) });
    },
    translateSelection: (dx, dy) => {
      const { doc, selection } = get();
      if (!selection || (dx === 0 && dy === 0)) return;
      const mask = new Uint8Array(doc.width * doc.height);
      let minX = doc.width;
      let minY = doc.height;
      let maxX = -1;
      let maxY = -1;
      for (let y = 0; y < doc.height; y++) {
        for (let x = 0; x < doc.width; x++) {
          if (!selection.mask[y * doc.width + x]) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= doc.width || ny >= doc.height) continue;
          mask[ny * doc.width + nx] = 1;
          minX = Math.min(minX, nx);
          minY = Math.min(minY, ny);
          maxX = Math.max(maxX, nx);
          maxY = Math.max(maxY, ny);
        }
      }
      if (maxX < 0) {
        set({ selection: null });
        return;
      }
      set({
        selection: {
          mask,
          bounds: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
        },
      });
    },
    selectAll: () => {
      const { doc } = get();
      const mask = new Uint8Array(doc.width * doc.height).fill(1);
      set({ selection: { mask, bounds: { x: 0, y: 0, w: doc.width, h: doc.height } } });
    },
    clearSelection: () => set({ selection: null }),
    deleteSelection: () => {
      const { doc, selection, activeFrameId, activeLayerId } = get();
      if (!selection) return;
      const frame = doc.frames.find((f) => f.id === activeFrameId);
      const cel = frame?.cels[activeLayerId];
      if (!cel) return;
      const before = new Uint8ClampedArray(cel);
      for (let i = 0; i < selection.mask.length; i++) {
        if (!selection.mask[i]) continue;
        cel[i * 4] = 0;
        cel[i * 4 + 1] = 0;
        cel[i * 4 + 2] = 0;
        cel[i * 4 + 3] = 0;
      }
      get().pushPixelEdit('Delete selection', before);
    },
    copySelection: () => {
      const { doc, selection, activeFrameId, activeLayerId } = get();
      const frame = doc.frames.find((f) => f.id === activeFrameId);
      const cel = frame?.cels[activeLayerId];
      if (!cel) return;
      if (!selection) {
        set({ clipboard: { pixels: new Uint8ClampedArray(cel), width: doc.width, height: doc.height } });
        return;
      }
      const { bounds } = selection;
      const pixels = new Uint8ClampedArray(bounds.w * bounds.h * 4);
      for (let y = 0; y < bounds.h; y++) {
        for (let x = 0; x < bounds.w; x++) {
          const sx = bounds.x + x;
          const sy = bounds.y + y;
          if (!selection.mask[sy * doc.width + sx]) continue;
          const si = (sy * doc.width + sx) * 4;
          const di = (y * bounds.w + x) * 4;
          pixels[di] = cel[si];
          pixels[di + 1] = cel[si + 1];
          pixels[di + 2] = cel[si + 2];
          pixels[di + 3] = cel[si + 3];
        }
      }
      set({ clipboard: { pixels, width: bounds.w, height: bounds.h } });
    },
    pasteSelection: (at) => {
      const { doc, clipboard, activeFrameId, activeLayerId, selection } = get();
      if (!clipboard) return;
      const frame = doc.frames.find((f) => f.id === activeFrameId);
      const cel = frame?.cels[activeLayerId];
      if (!cel) return;
      const before = new Uint8ClampedArray(cel);
      const x = at?.x ?? selection?.bounds.x ?? Math.max(0, Math.round((doc.width - clipboard.width) / 2));
      const y = at?.y ?? selection?.bounds.y ?? Math.max(0, Math.round((doc.height - clipboard.height) / 2));
      writeRegion(cel, doc.width, doc.height, clipboard.pixels, { x, y, w: clipboard.width, h: clipboard.height });
      get().pushPixelEdit('Paste', before);
      get().setRectSelection({ x, y, w: clipboard.width - 1, h: clipboard.height - 1 });
    },

    beginStroke: (label) => {
      const { doc, activeFrameId, activeLayerId } = get();
      const frame = doc.frames.find((f) => f.id === activeFrameId);
      const cel = frame?.cels[activeLayerId];
      if (!cel) return;
      set({ pending: { label, frameId: activeFrameId, layerId: activeLayerId, before: new Uint8ClampedArray(cel) } });
    },
    endStroke: () => {
      const { pending, doc } = get();
      if (!pending) return;
      const frame = doc.frames.find((f) => f.id === pending.frameId);
      const cel = frame?.cels[pending.layerId];
      set({ pending: null });
      if (!cel) return;
      const rect = diffRect(pending.before, cel, doc.width, doc.height);
      if (!rect) return;
      history.push(makePixelEntry(pending.label, pending.frameId, pending.layerId, rect, extractRegion(pending.before, doc.width, rect), cel, doc.width));
      refreshHistory();
      bump();
      markDirty();
      scheduleAutosave();
    },
    pushPixelEdit: (label, before, frameId, layerId) => {
      const { doc, activeFrameId, activeLayerId } = get();
      const fid = frameId ?? activeFrameId;
      const lid = layerId ?? activeLayerId;
      const frame = doc.frames.find((f) => f.id === fid);
      const cel = frame?.cels[lid];
      if (!cel) return;
      const rect = diffRect(before, cel, doc.width, doc.height);
      if (!rect) return;
      history.push(makePixelEntry(label, fid, lid, rect, extractRegion(before, doc.width, rect), cel, doc.width));
      refreshHistory();
      bump();
      markDirty();
      scheduleAutosave();
    },
    replaceActiveCel: (label, pixels, asNewLayer = false) => {
      const { doc, activeFrameId, activeLayerId } = get();
      if (asNewLayer) {
        structural(`${label} (new layer)`, () => {
          const layer = createLayer(label);
          doc.layers.splice(doc.layers.findIndex((l) => l.id === activeLayerId) + 1, 0, layer);
          for (const f of doc.frames) f.cels[layer.id] = createCel(doc.width, doc.height);
          const frame = doc.frames.find((f) => f.id === activeFrameId);
          if (frame) frame.cels[layer.id] = new Uint8ClampedArray(pixels);
          set({ activeLayerId: layer.id });
        }, true);
        return;
      }
      const frame = doc.frames.find((f) => f.id === activeFrameId);
      const cel = frame?.cels[activeLayerId];
      if (!cel) return;
      const before = new Uint8ClampedArray(cel);
      cel.set(pixels);
      get().pushPixelEdit(label, before);
    },
    stampText: (text, x, y, color, scale) => {
      const { doc, activeFrameId, activeLayerId, selection } = get();
      const frame = doc.frames.find((f) => f.id === activeFrameId);
      const cel = frame?.cels[activeLayerId];
      if (!cel) return;
      const before = new Uint8ClampedArray(cel);
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16)) as [number, number, number];
      const bounds = drawText(cel, doc.width, doc.height, x, y, text, [r, g, b, 255], scale);
      if (bounds && selection) {
        // clip to selection
        const snapshot = before;
        for (let yy = 0; yy < doc.height; yy++) {
          for (let xx = 0; xx < doc.width; xx++) {
            if (selection.mask[yy * doc.width + xx]) continue;
            const i = (yy * doc.width + xx) * 4;
            cel[i] = snapshot[i];
            cel[i + 1] = snapshot[i + 1];
            cel[i + 2] = snapshot[i + 2];
            cel[i + 3] = snapshot[i + 3];
          }
        }
      }
      get().pushPixelEdit('Text', before);
    },
    clearActiveLayer: () => {
      const cel = get().getActiveCel();
      if (!cel) return;
      const before = new Uint8ClampedArray(cel);
      cel.fill(0);
      get().pushPixelEdit('Clear layer', before);
    },
    undo: () => applyEntryAndSync(history.undo(), 'undo'),
    redo: () => applyEntryAndSync(history.redo(), 'redo'),

    setActiveLayer: (id) => set({ activeLayerId: id }),
    addLayer: (name) => {
      structural('Add layer', () => {
        const { doc, activeLayerId } = get();
        const layer = createLayer(name ?? `Layer ${doc.layers.length + 1}`);
        const index = doc.layers.findIndex((l) => l.id === activeLayerId);
        doc.layers.splice(index + 1, 0, layer);
        for (const frame of doc.frames) frame.cels[layer.id] = createCel(doc.width, doc.height);
        set({ activeLayerId: layer.id });
      });
    },
    duplicateLayer: () => {
      structural('Duplicate layer', () => {
        const { doc, activeLayerId } = get();
        const source = doc.layers.find((l) => l.id === activeLayerId);
        if (!source) return;
        const copy = { ...source, id: uid('layer'), name: `${source.name} copy` };
        const index = doc.layers.findIndex((l) => l.id === activeLayerId);
        doc.layers.splice(index + 1, 0, copy);
        for (const frame of doc.frames) {
          const cel = frame.cels[source.id] ?? createCel(doc.width, doc.height);
          frame.cels[copy.id] = new Uint8ClampedArray(cel);
        }
        set({ activeLayerId: copy.id });
      }, true);
    },
    deleteLayer: (id) => {
      const { doc } = get();
      const target = id ?? get().activeLayerId;
      if (doc.layers.length <= 1) return;
      structural('Delete layer', () => {
        doc.layers = doc.layers.filter((l) => l.id !== target);
        for (const frame of doc.frames) delete frame.cels[target];
      }, true);
    },
    moveLayer: (id, direction) => {
      const index = get().doc.layers.findIndex((l) => l.id === id);
      if (index < 0) return;
      const target = direction === 'up' ? index + 1 : index - 1;
      if (target < 0 || target >= get().doc.layers.length) return;
      structural(direction === 'up' ? 'Move layer up' : 'Move layer down', () => {
        const { doc } = get();
        const [layer] = doc.layers.splice(index, 1);
        doc.layers.splice(target, 0, layer);
      });
    },
    setLayerProps: (id, patch, record = true) => {
      if (!record) {
        const layer = get().doc.layers.find((l) => l.id === id);
        if (!layer) return;
        Object.assign(layer, patch);
        bump();
        markDirty();
        scheduleAutosave();
        return;
      }
      structural('Layer properties', () => {
        const layer = get().doc.layers.find((l) => l.id === id);
        if (!layer) return;
        Object.assign(layer, patch);
      });
    },
    mergeLayerDown: () => {
      const { doc, activeLayerId } = get();
      const index = doc.layers.findIndex((l) => l.id === activeLayerId);
      if (index <= 0) return;
      structural('Merge layer down', () => {
        const layer = doc.layers[index];
        const below = doc.layers[index - 1];
        for (const frame of doc.frames) {
          const flat = compositeFrame(
            { ...doc, frames: doc.frames },
            doc.frames.indexOf(frame),
            undefined,
            { layers: [below, { ...layer, visible: true }], skipLayerId: undefined },
          );
          frame.cels[below.id] = flat;
          delete frame.cels[layer.id];
        }
        doc.layers.splice(index, 1);
        doc.layers[index - 1] = { ...below, visible: below.visible, opacity: 255, blend: 'normal' };
        set({ activeLayerId: below.id });
      }, true);
    },

    setActiveFrame: (id) => set({ activeFrameId: id }),
    addFrame: () => {
      structural('Add frame', () => {
        const { doc, activeFrameId } = get();
        const frame = { id: uid('frame'), duration: 120, cels: {} as Record<string, Uint8ClampedArray> };
        for (const layer of doc.layers) frame.cels[layer.id] = createCel(doc.width, doc.height);
        const index = doc.frames.findIndex((f) => f.id === activeFrameId);
        doc.frames.splice(index + 1, 0, frame);
        set({ activeFrameId: frame.id });
      });
    },
    duplicateFrame: () => {
      structural('Duplicate frame', () => {
        const { doc, activeFrameId } = get();
        const source = doc.frames.find((f) => f.id === activeFrameId);
        if (!source) return;
        const cels: Record<string, Uint8ClampedArray> = {};
        for (const [k, v] of Object.entries(source.cels)) cels[k] = new Uint8ClampedArray(v);
        const frame = { ...source, id: uid('frame'), cels };
        const index = doc.frames.findIndex((f) => f.id === activeFrameId);
        doc.frames.splice(index + 1, 0, frame);
        set({ activeFrameId: frame.id });
      }, true);
    },
    tweenFrames: (count, easing = 'easeInOut') => {
      const { doc, activeFrameId } = get();
      const index = doc.frames.findIndex((f) => f.id === activeFrameId);
      // Tweening needs both ends: the active frame and the one after it.
      if (index < 0 || index >= doc.frames.length - 1) return 0;
      const from = doc.frames[index];
      const to = doc.frames[index + 1];
      const steps = tweenSteps(count, easing);
      if (steps.length === 0) return 0;

      let created = 0;
      structural(
        'Tween frames',
        () => {
          const inserted = steps.map((t) => {
            const cels: Record<string, Uint8ClampedArray> = {};
            for (const layer of doc.layers) {
              cels[layer.id] = blendCels(from.cels[layer.id], to.cels[layer.id], t);
            }
            const camera =
              from.camera && to.camera
                ? {
                    x: from.camera.x + (to.camera.x - from.camera.x) * t,
                    y: from.camera.y + (to.camera.y - from.camera.y) * t,
                    zoom: from.camera.zoom + (to.camera.zoom - from.camera.zoom) * t,
                  }
                : undefined;
            return {
              id: uid('frame'),
              duration: Math.max(10, Math.round(from.duration + (to.duration - from.duration) * t)),
              cels,
              ...(camera ? { camera } : {}),
            };
          });
          doc.frames.splice(index + 1, 0, ...inserted);
          created = inserted.length;
          if (inserted.length > 0) set({ activeFrameId: inserted[0].id });
        },
        true,
      );
      return created;
    },
    deleteFrame: (id) => {
      const { doc } = get();
      if (doc.frames.length <= 1) return;
      const target = id ?? get().activeFrameId;
      structural('Delete frame', () => {
        doc.frames = doc.frames.filter((f) => f.id !== target);
      }, true);
    },
    moveFrame: (id, direction) => {
      const { doc } = get();
      const index = doc.frames.findIndex((f) => f.id === id);
      const target = direction === 'left' ? index - 1 : index + 1;
      if (index < 0 || target < 0 || target >= doc.frames.length) return;
      structural('Reorder frames', () => {
        const [frame] = doc.frames.splice(index, 1);
        doc.frames.splice(target, 0, frame);
      });
    },
    setFrameDuration: (id, duration) => {
      structural('Frame duration', () => {
        const frame = get().doc.frames.find((f) => f.id === id);
        if (frame) frame.duration = Math.max(10, Math.min(10000, Math.round(duration)));
      });
    },
    setFrameLabel: (id, label) => {
      structural('Frame label', () => {
        const frame = get().doc.frames.find((f) => f.id === id);
        if (frame) frame.label = label;
      });
    },
    copyFrame: () => {
      const { doc, activeFrameId } = get();
      const frame = doc.frames.find((f) => f.id === activeFrameId);
      if (!frame) return;
      const cels: Record<string, Uint8ClampedArray> = {};
      for (const [k, v] of Object.entries(frame.cels)) cels[k] = new Uint8ClampedArray(v);
      set({ frameClipboard: { ...frame, cels } });
    },
    pasteFrame: () => {
      const { frameClipboard, doc, activeFrameId } = get();
      if (!frameClipboard) return;
      structural('Paste frame', () => {
        const cels: Record<string, Uint8ClampedArray> = {};
        for (const layer of doc.layers) {
          cels[layer.id] = frameClipboard.cels[layer.id]
            ? new Uint8ClampedArray(frameClipboard.cels[layer.id])
            : createCel(doc.width, doc.height);
        }
        const frame = { id: uid('frame'), duration: frameClipboard.duration, label: frameClipboard.label, cels };
        const index = doc.frames.findIndex((f) => f.id === activeFrameId);
        doc.frames.splice(index + 1, 0, frame);
        set({ activeFrameId: frame.id });
      }, true);
    },

    resizeCanvas: (width, height, anchor) => {
      const w = Math.max(1, Math.min(2048, Math.round(width)));
      const h = Math.max(1, Math.min(2048, Math.round(height)));
      structural('Resize canvas', () => {
        const { doc } = get();
        const oldW = doc.width;
        const oldH = doc.height;
        const offsetX = anchor === 'center' ? Math.floor((w - oldW) / 2) : 0;
        const offsetY = anchor === 'center' ? Math.floor((h - oldH) / 2) : 0;
        for (const frame of doc.frames) {
          for (const layer of doc.layers) {
            const old = frame.cels[layer.id] ?? createCel(oldW, oldH);
            const next = createCel(w, h);
            for (let y = 0; y < oldH; y++) {
              const ty = y + offsetY;
              if (ty < 0 || ty >= h) continue;
              for (let x = 0; x < oldW; x++) {
                const tx = x + offsetX;
                if (tx < 0 || tx >= w) continue;
                const si = (y * oldW + x) * 4;
                const di = (ty * w + tx) * 4;
                next[di] = old[si];
                next[di + 1] = old[si + 1];
                next[di + 2] = old[si + 2];
                next[di + 3] = old[si + 3];
              }
            }
            frame.cels[layer.id] = next;
          }
        }
        doc.width = w;
        doc.height = h;
        set({ selection: null });
      }, true);
    },
    cropToSelection: () => {
      const { selection } = get();
      if (!selection) return;
      const { bounds } = selection;
      structural('Crop to selection', () => {
        const { doc } = get();
        for (const frame of doc.frames) {
          for (const layer of doc.layers) {
            const old = frame.cels[layer.id] ?? createCel(doc.width, doc.height);
            const next = createCel(bounds.w, bounds.h);
            for (let y = 0; y < bounds.h; y++) {
              for (let x = 0; x < bounds.w; x++) {
                const si = ((bounds.y + y) * doc.width + bounds.x + x) * 4;
                const di = (y * bounds.w + x) * 4;
                next[di] = old[si];
                next[di + 1] = old[si + 1];
                next[di + 2] = old[si + 2];
                next[di + 3] = old[si + 3];
              }
            }
            frame.cels[layer.id] = next;
          }
        }
        doc.width = bounds.w;
        doc.height = bounds.h;
        set({ selection: null });
      }, true);
    },
    flipCanvas: (axis) => {
      structural(`Flip ${axis}`, () => {
        const { doc } = get();
        for (const frame of doc.frames) {
          for (const layer of doc.layers) {
            const cel = frame.cels[layer.id];
            if (!cel) continue;
            const out = new Uint8ClampedArray(cel.length);
            for (let y = 0; y < doc.height; y++) {
              for (let x = 0; x < doc.width; x++) {
                const sx = axis === 'horizontal' ? doc.width - 1 - x : x;
                const sy = axis === 'vertical' ? doc.height - 1 - y : y;
                const si = (sy * doc.width + sx) * 4;
                const di = (y * doc.width + x) * 4;
                out[di] = cel[si];
                out[di + 1] = cel[si + 1];
                out[di + 2] = cel[si + 2];
                out[di + 3] = cel[si + 3];
              }
            }
            frame.cels[layer.id] = out;
          }
        }
      }, true);
    },
    rotateCanvas: () => {
      structural('Rotate 90°', () => {
        const { doc } = get();
        const oldW = doc.width;
        const oldH = doc.height;
        for (const frame of doc.frames) {
          for (const layer of doc.layers) {
            const cel = frame.cels[layer.id];
            if (!cel) continue;
            const out = createCel(oldH, oldW);
            for (let y = 0; y < oldH; y++) {
              for (let x = 0; x < oldW; x++) {
                const si = (y * oldW + x) * 4;
                const nx = oldH - 1 - y;
                const ny = x;
                const di = (ny * oldH + nx) * 4;
                out[di] = cel[si];
                out[di + 1] = cel[si + 1];
                out[di + 2] = cel[si + 2];
                out[di + 3] = cel[si + 3];
              }
            }
            frame.cels[layer.id] = out;
          }
        }
        doc.width = oldH;
        doc.height = oldW;
        set({ selection: null });
      }, true);
    },

    setActivePalette: (id) => {
      structural('Switch palette', () => {
        get().doc.activePaletteId = id;
      });
    },
    addPalette: (palette) => {
      structural('Add palette', () => {
        const { doc } = get();
        doc.palettes.push(palette);
        doc.activePaletteId = palette.id;
      });
    },
    updatePaletteColors: (id, colors) => {
      structural('Edit palette', () => {
        const palette = get().doc.palettes.find((p) => p.id === id);
        if (palette) palette.colors = colors;
      });
    },
    removePalette: (id) => {
      structural('Remove palette', () => {
        const { doc } = get();
        doc.palettes = doc.palettes.filter((p) => p.id !== id);
        if (doc.activePaletteId === id) doc.activePaletteId = doc.palettes[0]?.id ?? '';
      });
    },
    copyPalette: () => {
      const { doc } = get();
      const palette = doc.palettes.find((p) => p.id === doc.activePaletteId);
      if (palette) set({ paletteClipboard: [...palette.colors] });
    },
    applyPaletteToArtwork: () => {
      const { doc, paletteClipboard } = get();
      if (!paletteClipboard || paletteClipboard.length === 0) return;
      const cel = get().getActiveCel();
      if (!cel) return;
      const before = new Uint8ClampedArray(cel);
      for (let i = 0; i < cel.length; i += 4) {
        if (cel[i + 3] === 0) continue;
        let best = 0;
        let bestD = Infinity;
        for (let p = 0; p < paletteClipboard.length; p++) {
          const hex = paletteClipboard[p];
          const r = parseInt(hex.slice(1, 3), 16);
          const g = parseInt(hex.slice(3, 5), 16);
          const b = parseInt(hex.slice(5, 7), 16);
          const d = (cel[i] - r) ** 2 * 0.3 + (cel[i + 1] - g) ** 2 * 0.59 + (cel[i + 2] - b) ** 2 * 0.11;
          if (d < bestD) {
            bestD = d;
            best = p;
          }
        }
        const hex = paletteClipboard[best];
        cel[i] = parseInt(hex.slice(1, 3), 16);
        cel[i + 1] = parseInt(hex.slice(3, 5), 16);
        cel[i + 2] = parseInt(hex.slice(5, 7), 16);
      }
      void doc;
      get().pushPixelEdit('Snap to palette', before);
    },

    setTilemap: (tilemap) => {
      get().doc.tilemap = tilemap;
      bump();
      markDirty();
      scheduleAutosave();
    },
    setCinemaSettings: (patch) => {
      structural('Cinematic settings', () => {
        const doc = get().doc;
        doc.cinema = { ...(doc.cinema ?? { aspect: '16:9', fit: 'contain', background: '#0b0b10', fps: 24 }), ...patch };
      });
    },
    setGuiLayout: (layout) => {
      structural('GUI layout', () => {
        get().doc.gui = {
          ...layout,
          slots: layout.slots.map((slot) => ({ ...slot, lore: [...slot.lore], icon: slot.icon ? { ...slot.icon } : null })),
        };
      });
    },
    setGuiTexture: (options) => {
      structural('GUI texture', () => {
        get().doc.guiTexture = { ...options };
      });
    },
    setScene: (scene) => {
      structural('Scene composition', () => {
        get().doc.scene = {
          ...scene,
          backdrop: { ...scene.backdrop },
          fx: { ...scene.fx, light: scene.fx.light ? { ...scene.fx.light } : null },
          props: scene.props.map((prop) => ({ ...prop })),
        };
      });
    },
    setFrameCamera: (frameId, camera) => {
      structural(camera ? 'Camera keyframe' : 'Clear camera keyframe', () => {
        const frame = get().doc.frames.find((f) => f.id === frameId);
        if (!frame) return;
        if (camera) frame.camera = { ...camera };
        else delete frame.camera;
      });
    },
    setAllFrameCameras: (camera) => {
      structural(camera ? 'Camera keyframes on all frames' : 'Clear all camera keyframes', () => {
        for (const frame of get().doc.frames) {
          if (camera) frame.camera = { ...camera };
          else delete frame.camera;
        }
      });
    },

    addTag: (tag) => {
      structural('Add animation tag', () => {
        get().doc.tags.push({ ...tag, id: uid('tag') });
      });
    },
    removeTag: (id) => {
      structural('Remove animation tag', () => {
        const doc = get().doc;
        doc.tags = doc.tags.filter((t) => t.id !== id);
      });
    },

    setIndexed: (on) => {
      structural('Indexed color mode', () => {
        const { doc } = get();
        doc.indexed = on;
        if (on) {
          doc.primary = snapHexToPalette(doc, doc.primary);
          doc.secondary = snapHexToPalette(doc, doc.secondary);
        }
      });
    },
    remapAllToPalette: () => {
      const { doc } = get();
      const palette = doc.palettes.find((p) => p.id === doc.activePaletteId);
      if (!palette || palette.colors.length === 0) return;
      structural(
        'Remap to palette',
        () => {
          for (const frame of doc.frames) {
            for (const layer of doc.layers) {
              const cel = frame.cels[layer.id];
              if (!cel) continue;
              for (let i = 0; i < cel.length; i += 4) {
                if (cel[i + 3] === 0) continue;
                const hex = snapHexToPalette(doc, rgbToHex(cel[i], cel[i + 1], cel[i + 2]));
                cel[i] = parseInt(hex.slice(1, 3), 16);
                cel[i + 1] = parseInt(hex.slice(3, 5), 16);
                cel[i + 2] = parseInt(hex.slice(5, 7), 16);
              }
            }
          }
        },
        true,
      );
    },
    setNineSlice: (insets) => {
      structural('Nine-slice guides', () => {
        get().doc.nineSlice = insets ?? undefined;
      });
    },
    snapToPalette: () => {
      const { doc, paletteClipboard } = get();
      const palette = doc.palettes.find((p) => p.id === doc.activePaletteId);
      const colors = paletteClipboard && paletteClipboard.length > 0 ? paletteClipboard : palette?.colors ?? [];
      if (colors.length === 0) return;
      const cel = get().getActiveCel();
      if (!cel) return;
      const before = new Uint8ClampedArray(cel);
      for (let i = 0; i < cel.length; i += 4) {
        if (cel[i + 3] === 0) continue;
        let best = colors[0];
        let bestD = Infinity;
        for (const hex of colors) {
          const r = parseInt(hex.slice(1, 3), 16);
          const g = parseInt(hex.slice(3, 5), 16);
          const b = parseInt(hex.slice(5, 7), 16);
          const d = (cel[i] - r) ** 2 * 0.3 + (cel[i + 1] - g) ** 2 * 0.59 + (cel[i + 2] - b) ** 2 * 0.11;
          if (d < bestD) {
            bestD = d;
            best = hex;
          }
        }
        cel[i] = parseInt(best.slice(1, 3), 16);
        cel[i + 1] = parseInt(best.slice(3, 5), 16);
        cel[i + 2] = parseInt(best.slice(5, 7), 16);
      }
      get().pushPixelEdit('Snap to palette', before);
    },
    setProjectName: (name) => {
      structural('Rename project', () => {
        get().doc.name = name.trim() || 'Untitled project';
      });
    },
    setProjectMeta: (patch) => {
      const doc = get().doc;
      Object.assign(doc.meta, patch, { updatedAt: Date.now() });
      markDirty();
      bump();
    },
    loadDocument: (doc) => {
      history.clear();
      set({
        doc,
        activeLayerId: doc.layers[doc.layers.length - 1]?.id ?? '',
        activeFrameId: doc.frames[0]?.id ?? '',
        selection: null,
        revision: get().revision + 1,
        historyState: history.state(),
        saveStatus: 'saved',
        thumbnail: null,
        clipboard: null,
      });
    },
    newDocument: (width, height, name) => {
      const doc = createProject({ width, height, name: name ?? 'Untitled project' });
      get().loadDocument(doc);
    },
    setThumbnail: (dataUrl) => set({ thumbnail: dataUrl }),
    saveNow: async () => {
      const { doc, thumbnail } = get();
      set({ saveStatus: 'saving' });
      try {
        await saveStoredProject(doc, thumbnail ?? undefined);
        await saveRecoveryDraft(doc);
        set({ saveStatus: 'saved', lastSavedAt: Date.now() });
      } catch (error) {
        console.error('Pixelarium: save failed', error);
        set({ saveStatus: 'error' });
      }
    },
    markDirty,

    getActiveCel: () => {
      const { doc, activeFrameId, activeLayerId } = get();
      return doc.frames.find((f) => f.id === activeFrameId)?.cels[activeLayerId] ?? null;
    },
    getActiveLayer: () => {
      const { doc, activeLayerId } = get();
      return doc.layers.find((l) => l.id === activeLayerId) ?? null;
    },
    getActiveFrameIndex: () => {
      const { doc, activeFrameId } = get();
      return doc.frames.findIndex((f) => f.id === activeFrameId);
    },
    notifyStructureChanged: () => {
      refreshHistory();
      bump();
    },
  };
});

/** Test hook: reset the module-level history instance. */
export function __resetHistoryForTests() {
  history.clear();
}
