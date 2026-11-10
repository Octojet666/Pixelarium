/**
 * Undo/redo.
 *
 * Drawing pushes compact pixel patches (only the rectangle that changed) instead of
 * whole-canvas snapshots. Structural edits (layers, frames, canvas size, palettes)
 * push a lightweight snapshot; pixel buffers are shared unless the change replaced them.
 */

import type { AnimationTag, CinemaSettings, Frame, Layer, NineSliceInsets, Palette, ProjectDoc, Rect } from '../types';
import { extractRegion, writeRegion } from './pixel';

export interface PixelEntry {
  kind: 'pixels';
  label: string;
  frameId: string;
  layerId: string;
  rect: Rect;
  before: Uint8ClampedArray;
  after: Uint8ClampedArray;
}

export interface StructureSnapshot {
  width: number;
  height: number;
  layers: Layer[];
  frames: Frame[];
  tags: AnimationTag[];
  palettes: Palette[];
  activePaletteId: string;
  activeLayerId: string;
  activeFrameId: string;
  primary: string;
  secondary: string;
  name: string;
  cinema?: CinemaSettings;
  indexed?: boolean;
  nineSlice?: NineSliceInsets;
}

export interface StructureEntry {
  kind: 'structure';
  label: string;
  before: StructureSnapshot;
  after: StructureSnapshot;
}

export type HistoryEntry = PixelEntry | StructureEntry;

function cloneFrames(frames: Frame[], deep: boolean): Frame[] {
  return frames.map((f) => {
    const cels: Record<string, Uint8ClampedArray> = {};
    for (const [k, v] of Object.entries(f.cels)) {
      cels[k] = deep ? new Uint8ClampedArray(v) : v;
    }
    return { ...f, cels };
  });
}

export function snapshotStructure(
  doc: ProjectDoc,
  activeLayerId: string,
  activeFrameId: string,
  deep = false,
): StructureSnapshot {
  return {
    width: doc.width,
    height: doc.height,
    layers: doc.layers.map((l) => ({ ...l })),
    frames: cloneFrames(doc.frames, deep),
    tags: doc.tags.map((t) => ({ ...t })),
    palettes: doc.palettes.map((p) => ({ ...p, colors: [...p.colors] })),
    activePaletteId: doc.activePaletteId,
    activeLayerId,
    activeFrameId,
    primary: doc.primary,
    secondary: doc.secondary,
    name: doc.name,
    cinema: doc.cinema ? { ...doc.cinema } : undefined,
    indexed: doc.indexed === true,
    nineSlice: doc.nineSlice ? { ...doc.nineSlice } : undefined,
  };
}

export function restoreStructure(doc: ProjectDoc, snap: StructureSnapshot): void {
  doc.width = snap.width;
  doc.height = snap.height;
  doc.layers = snap.layers.map((l) => ({ ...l }));
  doc.frames = cloneFrames(snap.frames, false);
  doc.tags = snap.tags.map((t) => ({ ...t }));
  doc.palettes = snap.palettes.map((p) => ({ ...p, colors: [...p.colors] }));
  doc.activePaletteId = snap.activePaletteId;
  doc.primary = snap.primary;
  doc.cinema = snap.cinema ? { ...snap.cinema } : undefined;
  doc.secondary = snap.secondary;
  doc.name = snap.name;
  doc.indexed = snap.indexed === true;
  doc.nineSlice = snap.nineSlice ? { ...snap.nineSlice } : undefined;
  doc.meta.updatedAt = Date.now();
}

export function makePixelEntry(
  label: string,
  frameId: string,
  layerId: string,
  rect: Rect,
  before: Uint8ClampedArray,
  cel: Uint8ClampedArray,
  width: number,
): PixelEntry {
  return {
    kind: 'pixels',
    label,
    frameId,
    layerId,
    rect,
    before,
    after: extractRegion(cel, width, rect),
  };
}

export function applyEntry(doc: ProjectDoc, entry: HistoryEntry, direction: 'undo' | 'redo'): void {
  if (entry.kind === 'pixels') {
    const frame = doc.frames.find((f) => f.id === entry.frameId);
    if (!frame) return;
    const cel = frame.cels[entry.layerId];
    if (!cel) return;
    writeRegion(cel, doc.width, doc.height, direction === 'undo' ? entry.before : entry.after, entry.rect, false);
    return;
  }
  restoreStructure(doc, direction === 'undo' ? entry.before : entry.after);
}

export interface HistoryState {
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  size: number;
}

export class History {
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private maxEntries = 120;
  private maxBytes = 96 * 1024 * 1024;
  private listeners = new Set<() => void>();

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }

  push(entry: HistoryEntry): void {
    this.undoStack.push(entry);
    this.redoStack = [];
    this.trim();
    this.emit();
  }

  private entryBytes(e: HistoryEntry): number {
    if (e.kind === 'pixels') return e.before.byteLength + e.after.byteLength;
    let bytes = 0;
    for (const f of e.before.frames) for (const c of Object.values(f.cels)) bytes += c.byteLength;
    for (const f of e.after.frames) for (const c of Object.values(f.cels)) bytes += c.byteLength;
    return bytes;
  }

  private trim(): void {
    let total = this.undoStack.reduce((a, e) => a + this.entryBytes(e), 0);
    while (this.undoStack.length > this.maxEntries || (total > this.maxBytes && this.undoStack.length > 1)) {
      const removed = this.undoStack.shift();
      if (!removed) break;
      total -= this.entryBytes(removed);
    }
    if (this.redoStack.length > this.maxEntries) this.redoStack = this.redoStack.slice(-this.maxEntries);
  }

  undo(): HistoryEntry | null {
    const entry = this.undoStack.pop();
    if (!entry) return null;
    this.redoStack.push(entry);
    this.emit();
    return entry;
  }

  redo(): HistoryEntry | null {
    const entry = this.redoStack.pop();
    if (!entry) return null;
    this.undoStack.push(entry);
    this.emit();
    return entry;
  }

  peekUndo(): HistoryEntry | null {
    return this.undoStack[this.undoStack.length - 1] ?? null;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.emit();
  }

  state(): HistoryState {
    const u = this.peekUndo();
    const r = this.redoStack[this.redoStack.length - 1] ?? null;
    return {
      canUndo: !!u,
      canRedo: !!r,
      undoLabel: u?.label ?? null,
      redoLabel: r?.label ?? null,
      size: this.undoStack.length,
    };
  }
}
