/** Low-level pixel buffer operations. Cel buffers are RGBA Uint8ClampedArrays (like ImageData). */

import type { RGBA, Rect } from '../types';
import { clampByte } from './color';

export interface DirtyBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function emptyBounds(): DirtyBounds {
  return { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
}

export function growBounds(b: DirtyBounds, x: number, y: number): void {
  if (x < b.minX) b.minX = x;
  if (y < b.minY) b.minY = y;
  if (x > b.maxX) b.maxX = x;
  if (y > b.maxY) b.maxY = y;
}

export function boundsToRect(b: DirtyBounds, width: number, height: number): Rect | null {
  if (b.maxX < b.minX || b.maxY < b.minY) return null;
  const x = Math.max(0, b.minX);
  const y = Math.max(0, b.minY);
  const maxX = Math.min(width - 1, b.maxX);
  const maxY = Math.min(height - 1, b.maxY);
  if (maxX < x || maxY < y) return null;
  return { x, y, w: maxX - x + 1, h: maxY - y + 1 };
}

export function createCel(width: number, height: number): Uint8ClampedArray {
  return new Uint8ClampedArray(width * height * 4);
}

export function cloneCel(cel: Uint8ClampedArray): Uint8ClampedArray {
  return new Uint8ClampedArray(cel);
}

export function isCelEmpty(cel: Uint8ClampedArray): boolean {
  for (let i = 3; i < cel.length; i += 4) if (cel[i] !== 0) return false;
  return true;
}

export function getPixel(cel: Uint8ClampedArray, width: number, x: number, y: number): RGBA {
  const i = (y * width + x) * 4;
  return [cel[i], cel[i + 1], cel[i + 2], cel[i + 3]];
}

export function indexOf(width: number, x: number, y: number): number {
  return (y * width + x) * 4;
}

/** Hard pixel write (no blending). Out-of-bounds coordinates are ignored. */
export function setPixelRaw(
  cel: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  color: RGBA,
): boolean {
  if (x < 0 || y < 0 || x >= width || y >= height) return false;
  const i = (y * width + x) * 4;
  cel[i] = color[0];
  cel[i + 1] = color[1];
  cel[i + 2] = color[2];
  cel[i + 3] = color[3];
  return true;
}

/** Source-over pixel paint with a 0..1 coverage multiplier. */
export function paintPixel(
  cel: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  color: RGBA,
  coverage = 1,
  erase = false,
): boolean {
  if (x < 0 || y < 0 || x >= width || y >= height) return false;
  if (coverage <= 0) return false;
  const i = (y * width + x) * 4;
  if (erase) {
    const srcA = (color[3] / 255) * coverage;
    cel[i + 3] = clampByte(cel[i + 3] * (1 - srcA));
    if (cel[i + 3] === 0) {
      cel[i] = 0;
      cel[i + 1] = 0;
      cel[i + 2] = 0;
    }
    return true;
  }
  const srcA = (color[3] / 255) * coverage;
  if (srcA >= 0.999) {
    cel[i] = color[0];
    cel[i + 1] = color[1];
    cel[i + 2] = color[2];
    cel[i + 3] = clampByte(color[3]);
    return true;
  }
  if (srcA <= 0) return false;
  const dstA = cel[i + 3] / 255;
  const outA = srcA + dstA * (1 - srcA);
  if (outA <= 0) {
    cel[i] = cel[i + 1] = cel[i + 2] = cel[i + 3] = 0;
    return true;
  }
  const mix = (s: number, d: number) => (s * srcA + d * dstA * (1 - srcA)) / outA;
  cel[i] = clampByte(mix(color[0], cel[i]));
  cel[i + 1] = clampByte(mix(color[1], cel[i + 1]));
  cel[i + 2] = clampByte(mix(color[2], cel[i + 2]));
  cel[i + 3] = clampByte(outA * 255);
  return true;
}

/** A custom brush footprint: 1 = paint, 0 = leave untouched. */
export interface BrushMask {
  w: number;
  h: number;
  data: Uint8Array;
}

/** Paints a brush mask centered on (cx, cy). */
export function stampMask(
  cel: Uint8ClampedArray,
  width: number,
  height: number,
  cx: number,
  cy: number,
  mask: BrushMask,
  color: RGBA,
  coverage: number,
  erase: boolean,
  bounds: DirtyBounds | null,
): void {
  const offX = Math.floor((mask.w - 1) / 2);
  const offY = Math.floor((mask.h - 1) / 2);
  for (let yy = 0; yy < mask.h; yy++) {
    for (let xx = 0; xx < mask.w; xx++) {
      if (!mask.data[yy * mask.w + xx]) continue;
      const px = cx - offX + xx;
      const py = cy - offY + yy;
      if (paintPixel(cel, width, height, px, py, color, coverage, erase) && bounds) {
        growBounds(bounds, px, py);
      }
    }
  }
}

/** Paint a brush footprint centered on (cx, cy). */
export function stampBrush(
  cel: Uint8ClampedArray,
  width: number,
  height: number,
  cx: number,
  cy: number,
  size: number,
  shape: 'square' | 'circle',
  color: RGBA,
  coverage: number,
  erase: boolean,
  bounds: DirtyBounds | null,
  mask?: BrushMask | null,
): void {
  if (mask) {
    stampMask(cel, width, height, cx, cy, mask, color, coverage, erase, bounds);
    return;
  }
  const s = Math.max(1, Math.floor(size));
  const off = Math.floor((s - 1) / 2);
  if (shape === 'circle' && s > 2) {
    const r = s / 2;
    const c = (s - 1) / 2;
    for (let yy = 0; yy < s; yy++) {
      for (let xx = 0; xx < s; xx++) {
        const dx = xx - c;
        const dy = yy - c;
        if (dx * dx + dy * dy > r * r + 0.01) continue;
        const px = cx - off + xx;
        const py = cy - off + yy;
        if (paintPixel(cel, width, height, px, py, color, coverage, erase) && bounds) {
          growBounds(bounds, px, py);
        }
      }
    }
    return;
  }
  for (let yy = 0; yy < s; yy++) {
    for (let xx = 0; xx < s; xx++) {
      const px = cx - off + xx;
      const py = cy - off + yy;
      if (paintPixel(cel, width, height, px, py, color, coverage, erase) && bounds) {
        growBounds(bounds, px, py);
      }
    }
  }
}

export function extractRegion(
  cel: Uint8ClampedArray,
  width: number,
  rect: Rect,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rect.w * rect.h * 4);
  for (let y = 0; y < rect.h; y++) {
    const srcStart = ((rect.y + y) * width + rect.x) * 4;
    out.set(cel.subarray(srcStart, srcStart + rect.w * 4), y * rect.w * 4);
  }
  return out;
}

/**
 * Copies `region` into `cel`. Transparent source pixels are skipped by default so
 * pasted/imported art keeps the pixels beneath it; pass `skipTransparent = false`
 * for exact restores (undo/redo), where erasing must be reproduced too.
 */
export function writeRegion(
  cel: Uint8ClampedArray,
  width: number,
  height: number,
  region: Uint8ClampedArray,
  rect: Rect,
  skipTransparent = true,
): void {
  for (let y = 0; y < rect.h; y++) {
    const ty = rect.y + y;
    if (ty < 0 || ty >= height) continue;
    for (let x = 0; x < rect.w; x++) {
      const tx = rect.x + x;
      if (tx < 0 || tx >= width) continue;
      const s = (y * rect.w + x) * 4;
      const d = (ty * width + tx) * 4;
      if (skipTransparent && region[s + 3] === 0) continue;
      cel[d] = region[s];
      cel[d + 1] = region[s + 1];
      cel[d + 2] = region[s + 2];
      cel[d + 3] = region[s + 3];
    }
  }
}

export function clearRegion(
  cel: Uint8ClampedArray,
  width: number,
  rect: Rect,
  bounds: DirtyBounds | null,
): void {
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) {
      if (x < 0 || y < 0 || x >= width) continue;
      const i = (y * width + x) * 4;
      if (cel[i + 3] !== 0) {
        cel[i] = cel[i + 1] = cel[i + 2] = cel[i + 3] = 0;
        if (bounds) growBounds(bounds, x, y);
      }
    }
  }
}
