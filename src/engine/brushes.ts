/** Brush masks: built-in shapes plus brushes saved from a selection. */

import type { BrushMask } from './pixel';
import type { Rect } from '../types';

export interface BrushPreset {
  id: string;
  name: string;
  /** '#' paints, '.' is empty. Rows are equal length. */
  rows: string[];
  /** Built-ins scale with the brush-size slider; saved brushes keep their pixel size. */
  builtin: boolean;
}

export interface SavedBrush extends BrushPreset {
  id: string;
  builtin: false;
  createdAt: number;
}

const STORAGE_KEY = 'pixelarium.brushes.v1';
export const MAX_BRUSH_SIZE = 64;

const BUILTINS: Omit<BrushPreset, 'builtin'>[] = [
  {
    id: 'diagonal',
    name: 'Diagonal',
    rows: ['#....', '.#...', '..#..', '...#.', '....#'],
  },
  {
    id: 'horizontal',
    name: 'Horizontal',
    rows: ['#####'],
  },
  {
    id: 'vertical',
    name: 'Vertical',
    rows: ['#', '#', '#', '#', '#'],
  },
  {
    id: 'cross',
    name: 'Cross',
    rows: ['..#..', '..#..', '#####', '..#..', '..#..'],
  },
  {
    id: 'star',
    name: 'Star',
    rows: ['..#..', '#.#.#', '.###.', '#.#.#', '..#..'],
  },
  {
    id: 'diamond',
    name: 'Diamond',
    rows: ['..#..', '.###.', '#####', '.###.', '..#..'],
  },
  {
    id: 'sparkle',
    name: 'Sparkle',
    rows: ['.#.', '###', '.#.'],
  },
  {
    id: 'checker',
    name: 'Checker',
    rows: ['#.#.', '.#.#', '#.#.', '.#.#'],
  },
];

export const BUILTIN_BRUSHES: BrushPreset[] = BUILTINS.map((b) => ({ ...b, builtin: true }));

function cloneRows(rows: string[]): string[] {
  return rows.map((r) => r);
}

function readStorage(): SavedBrush[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (b): b is SavedBrush =>
          b &&
          typeof b === 'object' &&
          typeof b.id === 'string' &&
          typeof b.name === 'string' &&
          Array.isArray(b.rows) &&
          b.rows.length > 0 &&
          b.rows.every((r: unknown) => typeof r === 'string'),
      )
      .map((b) => ({
        ...b,
        builtin: false,
        rows: b.rows.slice(0, MAX_BRUSH_SIZE).map((r) => r.slice(0, MAX_BRUSH_SIZE)),
      }));
  } catch {
    return [];
  }
}

export function loadSavedBrushes(): SavedBrush[] {
  return readStorage();
}

export function allBrushes(): BrushPreset[] {
  return [...BUILTIN_BRUSHES, ...readStorage()];
}

export function findBrush(id: string): BrushPreset | null {
  return allBrushes().find((b) => b.id === id) ?? null;
}

export function saveBrush(name: string, rows: string[]): SavedBrush {
  const brushes = readStorage();
  const brush: SavedBrush = {
    id: `brush-${Date.now().toString(36)}`,
    name: name.trim() || 'Custom brush',
    rows: cloneRows(rows),
    builtin: false,
    createdAt: Date.now(),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([brush, ...brushes].slice(0, 40)));
  } catch {
    /* storage may be unavailable; the brush still works for this stroke */
  }
  return brush;
}

export function deleteBrush(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(readStorage().filter((b) => b.id !== id)));
  } catch {
    /* ignore */
  }
}

/** Nearest-neighbour resize of a mask, used to make built-ins follow the size slider. */
export function scaleMask(mask: BrushMask, size: number): BrushMask {
  const target = Math.max(1, Math.min(MAX_BRUSH_SIZE, Math.round(size)));
  if (mask.w === target && mask.h === target) return mask;
  const out = new Uint8Array(target * target);
  for (let y = 0; y < target; y++) {
    const sy = Math.min(mask.h - 1, Math.floor((y * mask.h) / target));
    for (let x = 0; x < target; x++) {
      const sx = Math.min(mask.w - 1, Math.floor((x * mask.w) / target));
      out[y * target + x] = mask.data[sy * mask.w + sx];
    }
  }
  return { w: target, h: target, data: out };
}

export function brushToMask(brush: BrushPreset, size: number): BrushMask {
  const h = brush.rows.length;
  const w = Math.max(...brush.rows.map((r) => r.length), 1);
  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      data[y * w + x] = brush.rows[y][x] === '#' ? 1 : 0;
    }
  }
  const mask = { w, h, data };
  return brush.builtin ? scaleMask(mask, size) : mask;
}

/** Resolves the active brush id to a mask, or null for the normal round/square tip. */
export function brushMask(id: string, size: number): BrushMask | null {
  if (!id) return null;
  const brush = findBrush(id);
  return brush ? brushToMask(brush, size) : null;
}

/** Captures the opaque pixels inside `bounds` as brush rows. Returns null for empty areas. */
export function brushRowsFromPixels(
  cel: Uint8ClampedArray,
  width: number,
  height: number,
  bounds: Rect,
): string[] | null {
  const x0 = Math.max(0, bounds.x);
  const y0 = Math.max(0, bounds.y);
  const x1 = Math.min(width - 1, bounds.x + bounds.w - 1);
  const y1 = Math.min(height - 1, bounds.y + bounds.h - 1);
  if (x1 < x0 || y1 < y0) return null;
  const rows: string[] = [];
  let ink = 0;
  for (let y = y0; y <= y1; y++) {
    let row = '';
    for (let x = x0; x <= x1; x++) {
      const on = cel[(y * width + x) * 4 + 3] !== 0;
      if (on) ink++;
      row += on ? '#' : '.';
    }
    rows.push(row);
  }
  return ink > 0 ? rows : null;
}
