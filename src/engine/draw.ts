/** Drawing primitives. Every function mutates a cel and reports the dirty bounds. */

import type { RGBA, Rect } from '../types';
import { colorDistance } from './color';
import {
  type BrushMask,
  type DirtyBounds,
  boundsToRect,
  emptyBounds,
  growBounds,
  paintPixel,
  stampBrush,
} from './pixel';

export interface StrokeOptions {
  color: RGBA;
  size: number;
  shape: 'square' | 'circle';
  coverage: number;
  erase: boolean;
  /** Custom footprint; replaces size/shape when present. */
  mask?: BrushMask | null;
}

export function drawLine(
  cel: Uint8ClampedArray,
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  opts: StrokeOptions,
  bounds: DirtyBounds | null = emptyBounds(),
): DirtyBounds | null {
  let x = Math.round(x0);
  let y = Math.round(y0);
  const ex = Math.round(x1);
  const ey = Math.round(y1);
  const dx = Math.abs(ex - x);
  const dy = Math.abs(ey - y);
  const sx = x < ex ? 1 : -1;
  const sy = y < ey ? 1 : -1;
  let err = dx - dy;
  for (;;) {
    stampBrush(cel, width, height, x, y, opts.size, opts.shape, opts.color, opts.coverage, opts.erase, bounds, opts.mask);
    if (x === ex && y === ey) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
  return bounds;
}

/** Remove doubled corner pixels from a freehand path (classic pixel-perfect line cleanup). */
export function pixelPerfectPath(points: { x: number; y: number }[]): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && last.x === p.x && last.y === p.y) continue;
    if (out.length >= 2) {
      const a = out[out.length - 2];
      const b = out[out.length - 1];
      const corner =
        (a.x === b.x && b.y === p.y && a.y !== p.y) ||
        (a.y === b.y && b.x === p.x && a.x !== p.x);
      if (corner) {
        // b is an L-corner artifact between a and p: drop it.
        out.pop();
      }
    }
    out.push(p);
  }
  return out;
}

export function drawRect(
  cel: Uint8ClampedArray,
  width: number,
  height: number,
  rect: Rect,
  opts: StrokeOptions,
  filled: boolean,
  bounds: DirtyBounds | null = emptyBounds(),
): DirtyBounds | null {
  const x0 = Math.min(rect.x, rect.x + rect.w);
  const y0 = Math.min(rect.y, rect.y + rect.h);
  const x1 = Math.max(rect.x, rect.x + rect.w);
  const y1 = Math.max(rect.y, rect.y + rect.h);
  if (filled) {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (paintPixel(cel, width, height, x, y, opts.color, opts.coverage, opts.erase) && bounds) {
          growBounds(bounds, x, y);
        }
      }
    }
    return bounds;
  }
  drawLine(cel, width, height, x0, y0, x1, y0, opts, bounds);
  drawLine(cel, width, height, x1, y0, x1, y1, opts, bounds);
  drawLine(cel, width, height, x1, y1, x0, y1, opts, bounds);
  drawLine(cel, width, height, x0, y1, x0, y0, opts, bounds);
  return bounds;
}

export function drawEllipse(
  cel: Uint8ClampedArray,
  width: number,
  height: number,
  rect: Rect,
  opts: StrokeOptions,
  filled: boolean,
  bounds: DirtyBounds | null = emptyBounds(),
): DirtyBounds | null {
  const x0 = Math.min(rect.x, rect.x + rect.w);
  const y0 = Math.min(rect.y, rect.y + rect.h);
  const x1 = Math.max(rect.x, rect.x + rect.w);
  const y1 = Math.max(rect.y, rect.y + rect.h);
  const rx = (x1 - x0) / 2;
  const ry = (y1 - y0) / 2;
  const cx = x0 + rx;
  const cy = y0 + ry;
  if (rx <= 0 || ry <= 0) {
    return drawRect(cel, width, height, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, opts, filled, bounds);
  }
  const put = (x: number, y: number) => {
    if (paintPixel(cel, width, height, x, y, opts.color, opts.coverage, opts.erase) && bounds) {
      growBounds(bounds, x, y);
    }
  };
  const extra = Math.max(0, Math.floor(opts.size / 2) - 1);
  if (filled) {
    for (let y = y0; y <= y1; y++) {
      const dy = (y - cy) / ry;
      const span = Math.sqrt(Math.max(0, 1 - dy * dy)) * rx;
      const xs = Math.round(cx - span);
      const xe = Math.round(cx + span);
      for (let x = xs; x <= xe; x++) put(x, y);
    }
    return bounds;
  }
  // Parametric sampling with enough steps that the outline never gaps.
  const steps = Math.max(24, Math.ceil((rx + ry) * 3.2));
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const x = Math.round(cx + Math.cos(t) * rx);
    const y = Math.round(cy + Math.sin(t) * ry);
    for (let oy = -extra; oy <= extra; oy++) {
      for (let ox = -extra; ox <= extra; ox++) put(x + ox, y + oy);
    }
  }
  return bounds;
}

export function floodFill(
  cel: Uint8ClampedArray,
  width: number,
  height: number,
  sx: number,
  sy: number,
  color: RGBA,
  tolerance: number,
  coverage: number,
  bounds: DirtyBounds | null = emptyBounds(),
): DirtyBounds | null {
  if (sx < 0 || sy < 0 || sx >= width || sy >= height) return bounds;
  const start: RGBA = [
    cel[(sy * width + sx) * 4],
    cel[(sy * width + sx) * 4 + 1],
    cel[(sy * width + sx) * 4 + 2],
    cel[(sy * width + sx) * 4 + 3],
  ];
  const tol = tolerance * 1.5;
  if (start[3] === 0 && color[3] === 0) return bounds;
  if (
    start[0] === color[0] &&
    start[1] === color[1] &&
    start[2] === color[2] &&
    start[3] === color[3] &&
    coverage >= 1
  ) {
    return bounds;
  }
  const visited = new Uint8Array(width * height);
  const stack: number[] = [sx, sy];
  let guard = width * height * 4;
  while (stack.length > 0 && guard-- > 0) {
    const y = stack.pop()!;
    const x = stack.pop()!;
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const vi = y * width + x;
    if (visited[vi]) continue;
    visited[vi] = 1;
    const i = vi * 4;
    const px: RGBA = [cel[i], cel[i + 1], cel[i + 2], cel[i + 3]];
    if (colorDistance(px, start) > tol) continue;
    if (paintPixel(cel, width, height, x, y, color, coverage, false) && bounds) growBounds(bounds, x, y);
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }
  return bounds;
}

/** Replace every pixel matching `from` within tolerance with `to`, across the whole cel. */
export function replaceColor(
  cel: Uint8ClampedArray,
  width: number,
  height: number,
  from: RGBA,
  to: RGBA,
  tolerance: number,
): DirtyBounds | null {
  const bounds = emptyBounds();
  const tol = tolerance * 1.5;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const px: RGBA = [cel[i], cel[i + 1], cel[i + 2], cel[i + 3]];
      if (colorDistance(px, from) <= tol) {
        paintPixel(cel, width, height, x, y, to, 1, false);
        growBounds(bounds, x, y);
      }
    }
  }
  return boundsToRect(bounds, width, height) ? bounds : null;
}

export function spray(
  cel: Uint8ClampedArray,
  width: number,
  height: number,
  cx: number,
  cy: number,
  radius: number,
  density: number,
  opts: StrokeOptions,
  rand: () => number,
  bounds: DirtyBounds | null = emptyBounds(),
): DirtyBounds | null {
  const count = Math.max(1, Math.round(density * radius * radius * 0.55));
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * radius;
    const x = Math.round(cx + Math.cos(a) * r);
    const y = Math.round(cy + Math.sin(a) * r);
    if (paintPixel(cel, width, height, x, y, opts.color, opts.coverage, opts.erase) && bounds) {
      growBounds(bounds, x, y);
    }
  }
  return bounds;
}

const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

export function bayerThreshold(x: number, y: number, size: 2 | 4): number {
  if (size === 2) {
    return (BAYER4[y & 1][x & 1] * 4 + 2) / 64;
  }
  return (BAYER4[y & 3][x & 3] + 0.5) / 16;
}

/** Dither brush: paints `colorA`/`colorB` in the selected ordered pattern. */
export function ditherStamp(
  cel: Uint8ClampedArray,
  width: number,
  height: number,
  cx: number,
  cy: number,
  size: number,
  pattern: 'bayer2' | 'bayer4' | 'checker' | 'noise',
  colorA: RGBA,
  colorB: RGBA | null,
  coverage: number,
  bounds: DirtyBounds | null = emptyBounds(),
): DirtyBounds | null {
  const off = Math.floor((size - 1) / 2);
  for (let yy = 0; yy < size; yy++) {
    for (let xx = 0; xx < size; xx++) {
      const px = cx - off + xx;
      const py = cy - off + yy;
      let useB: boolean;
      if (pattern === 'checker') useB = ((px + py) & 1) === 0;
      else if (pattern === 'noise') useB = Math.random() < 0.5;
      else useB = bayerThreshold(px, py, pattern === 'bayer2' ? 2 : 4) > 0.5;
      const color = useB && colorB ? colorB : colorA;
      if (paintPixel(cel, width, height, px, py, color, coverage, false) && bounds) {
        growBounds(bounds, px, py);
      }
    }
  }
  return bounds;
}

export function drawGradient(
  cel: Uint8ClampedArray,
  width: number,
  height: number,
  from: RGBA,
  to: RGBA,
  opts: {
    mode: 'linear' | 'radial';
    dither: boolean;
    bounds: DirtyBounds;
    coverage?: number;
  },
): DirtyBounds | null {
  const b = opts.bounds;
  const coverage = opts.coverage ?? 1;
  const w = b.maxX - b.minX + 1;
  const h = b.maxY - b.minY + 1;
  const diag = Math.hypot(w, h) || 1;
  for (let y = b.minY; y <= b.maxY; y++) {
    for (let x = b.minX; x <= b.maxX; x++) {
      let t: number;
      if (opts.mode === 'radial') {
        const dx = (x - (b.minX + w / 2)) / (w / 2 || 1);
        const dy = (y - (b.minY + h / 2)) / (h / 2 || 1);
        t = Math.min(1, Math.hypot(dx, dy));
      } else {
        t = Math.min(1, Math.max(0, ((x - b.minX) + (y - b.minY)) / (diag * 1.4)));
      }
      if (opts.dither) {
        const threshold = bayerThreshold(x, y, 4);
        t = t * 8 - (t * 8) % 1 > 0.999 ? t : (Math.floor(t * 8) + (threshold < (t * 8) % 1 ? 1 : 0)) / 8;
      }
      const color: RGBA = [
        Math.round(from[0] + (to[0] - from[0]) * t),
        Math.round(from[1] + (to[1] - from[1]) * t),
        Math.round(from[2] + (to[2] - from[2]) * t),
        Math.round(from[3] + (to[3] - from[3]) * t),
      ];
      paintPixel(cel, width, height, x, y, color, coverage, false);
    }
  }
  return b;
}

export function mirrorPoint(x: number, y: number, width: number, height: number, symX: boolean, symY: boolean) {
  return {
    x: symX ? width - 1 - x : x,
    y: symY ? height - 1 - y : y,
  };
}
