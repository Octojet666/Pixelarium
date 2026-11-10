/**
 * Tool behaviour for one pointer stroke. Mutates a cel in place and reports dirty
 * rectangles so the canvas can repaint cheaply. Completely framework-free.
 */

import type { RGBA, Rect, ToolId, ToolSettings } from '../types';
import {
  type StrokeOptions,
  ditherStamp,
  drawEllipse,
  drawGradient,
  drawLine,
  drawRect,
  floodFill,
  pixelPerfectPath,
  spray,
} from '../engine/draw';
import {
  type BrushMask,
  type DirtyBounds,
  boundsToRect,
  emptyBounds,
  extractRegion,
  growBounds,
  paintPixel,
  stampBrush,
} from '../engine/pixel';

export interface PaintParams {
  cel: Uint8ClampedArray;
  width: number;
  height: number;
  tool: ToolId;
  settings: ToolSettings;
  primary: RGBA;
  secondary: RGBA;
  mask: Uint8Array | null;
  /** Custom brush footprint; null means the normal round/square tip. */
  brush?: BrushMask | null;
  /** Indexed mode: every stamp is fully opaque so no blended off-palette colors appear. */
  indexed?: boolean;
}

export interface StrokeEndResult {
  dirty: Rect | null;
  selectionRect?: Rect;
  selectionPoints?: { x: number; y: number }[];
  pickedColor?: string;
  movedSelection?: { dx: number; dy: number };
}

const SHAPE_TOOLS: ToolId[] = [
  'line',
  'rect',
  'rect-filled',
  'ellipse',
  'ellipse-filled',
  'gradient',
];

export class PaintStroke {
  private p: PaintParams;
  private before: Uint8ClampedArray;
  private points: { x: number; y: number; p: number }[] = [];
  private pressure = 1;
  private startPoint = { x: 0, y: 0 };
  private previewRect: Rect | null = null;
  private moveOrigin: { x: number; y: number } | null = null;
  private moveRegion: Rect | null = null;
  private movePixels: Uint8ClampedArray | null = null;
  private moveMask: Uint8Array | null = null;
  private selectionRect: Rect | undefined;
  private lassoPoints: { x: number; y: number }[] | undefined;
  private pickedColor: string | undefined;
  private dirtied = false;
  private lastDirty: Rect | null = null;

  constructor(params: PaintParams) {
    this.p = params;
    this.before = new Uint8ClampedArray(params.cel);
  }

  get tool(): ToolId {
    return this.p.tool;
  }

  get lasso(): { x: number; y: number }[] | undefined {
    return this.lassoPoints;
  }

  get selectionDraft(): Rect | null {
    return this.selectionRect ?? null;
  }

  get preview(): Rect | null {
    return this.previewRect;
  }

  /** Dirty region produced by the most recent start/move call. */
  takeDirty(): Rect | null {
    const d = this.lastDirty;
    this.lastDirty = null;
    return d;
  }

  private colorFor(button: number): RGBA {
    return button === 2 ? this.p.secondary : this.p.primary;
  }

  /** Pen pressure for the following segments (1 = full pressure). */
  setPressure(pressure: number): void {
    this.pressure = Math.max(0.05, Math.min(1, Number.isFinite(pressure) ? pressure : 1));
  }

  private mirror(x: number, y: number): { x: number; y: number }[] {
    const { width, height, settings } = this.p;
    const out = [{ x, y }];
    if (settings.symmetryX) out.push({ x: width - 1 - x, y });
    if (settings.symmetryY) out.push({ x, y: height - 1 - y });
    if (settings.symmetryX && settings.symmetryY) out.push({ x: width - 1 - x, y: height - 1 - y });
    return out;
  }

  private pressureOpts(): { size: number; coverage: number } {
    const { settings } = this.p;
    const size = settings.pressureSize
      ? Math.max(1, Math.round(settings.size * (0.25 + 0.75 * this.pressure)))
      : settings.size;
    const coverage = settings.pressureOpacity
      ? settings.opacity * (0.2 + 0.8 * this.pressure)
      : settings.opacity;
    return { size, coverage: this.p.indexed ? 1 : coverage };
  }

  private strokeOpts(color: RGBA): {
    color: RGBA;
    size: number;
    shape: 'square' | 'circle';
    coverage: number;
    erase: boolean;
    mask: BrushMask | null;
  } {
    const { size, coverage } = this.pressureOpts();
    return {
      color,
      size,
      shape: this.p.settings.shape,
      coverage,
      erase: this.p.tool === 'eraser',
      mask: this.p.brush ?? null,
    };
  }

  /** Screen-space offsets that make a stamp appear on the opposite tile edges. */
  private tileOffsets(): { dx: number; dy: number }[] {
    if (!this.p.settings.tileMode) return [{ dx: 0, dy: 0 }];
    const { width, height } = this.p;
    return [
      { dx: 0, dy: 0 },
      { dx: -width, dy: 0 },
      { dx: width, dy: 0 },
      { dx: 0, dy: -height },
      { dx: 0, dy: height },
      { dx: -width, dy: -height },
      { dx: width, dy: -height },
      { dx: -width, dy: height },
      { dx: width, dy: height },
    ];
  }

  /** Stamps a point with symmetry and tile wrapping applied. */
  private stampAll(x: number, y: number, color: RGBA, bounds: DirtyBounds): void {
    for (const m of this.mirror(x, y)) {
      for (const off of this.tileOffsets()) {
        this.stampTool(m.x + off.dx, m.y + off.dy, color, bounds);
      }
    }
  }

  private lineAll(
    ax: number,
    ay: number,
    bx: number,
    by: number,
    opts: StrokeOptions,
    bounds: DirtyBounds,
  ): void {
    for (const off of this.tileOffsets()) {
      drawLine(
        this.p.cel,
        this.p.width,
        this.p.height,
        ax + off.dx,
        ay + off.dy,
        bx + off.dx,
        by + off.dy,
        opts,
        bounds,
      );
    }
  }

  /** Restore anything painted outside the active selection. */
  private clipToSelection(bounds: DirtyBounds): DirtyBounds {
    const mask = this.p.mask;
    if (!mask) return bounds;
    const { cel, width, height } = this.p;
    for (let y = bounds.minY; y <= bounds.maxY; y++) {
      if (y < 0 || y >= height) continue;
      for (let x = bounds.minX; x <= bounds.maxX; x++) {
        if (x < 0 || x >= width) continue;
        if (mask[y * width + x]) continue;
        const i = (y * width + x) * 4;
        cel[i] = this.before[i];
        cel[i + 1] = this.before[i + 1];
        cel[i + 2] = this.before[i + 2];
        cel[i + 3] = this.before[i + 3];
      }
    }
    return bounds;
  }

  private restorePreview(): void {
    if (!this.previewRect) return;
    const { cel, width } = this.p;
    const r = this.previewRect;
    for (let y = r.y; y < r.y + r.h; y++) {
      const rowStart = (y * width + r.x) * 4;
      cel.set(this.before.subarray(rowStart, rowStart + r.w * 4), rowStart);
    }
  }

  start(x: number, y: number, button = 0): void {
    const { tool } = this.p;
    this.startPoint = { x, y };
    this.points = [{ x, y, p: this.pressure }];
    this.lastDirty = null;

    if (tool === 'eyedropper') return;

    if (tool === 'select' || tool === 'select-free') {
      this.selectionRect = { x, y, w: 0, h: 0 };
      return;
    }

    if (tool === 'move') {
      this.beginMove(x, y);
      return;
    }

    if (tool === 'pencil' || tool === 'eraser' || tool === 'dither' || tool === 'spray') {
      const color = this.colorFor(button);
      const b = emptyBounds();
      this.stampAll(x, y, color, b);
      this.commitDirty(b);
      return;
    }

    if (SHAPE_TOOLS.includes(tool)) {
      this.drawShapePreview(x, y, this.colorFor(button), false);
      return;
    }

    if (tool === 'bucket') {
      const color = this.colorFor(button);
      const b = emptyBounds();
      for (const m of this.mirror(x, y)) {
        floodFill(
          this.p.cel,
          this.p.width,
          this.p.height,
          m.x,
          m.y,
          color,
          this.p.settings.tolerance,
          this.p.indexed ? 1 : this.p.settings.opacity,
          b,
        );
      }
      this.clipToSelection(b);
      this.commitDirty(b);
    }
  }

  private stampTool(x: number, y: number, color: RGBA, bounds: DirtyBounds): void {
    const { cel, width, height, tool, settings } = this.p;
    if (tool === 'dither') {
      const secondary = settings.size > 1 ? this.p.secondary : null;
      ditherStamp(
        cel,
        width,
        height,
        x,
        y,
        settings.size,
        settings.ditherPattern,
        color,
        secondary,
        this.p.indexed ? 1 : settings.opacity,
        bounds,
      );
      return;
    }
    if (tool === 'spray') {
      let seed = (x * 73856093) ^ (y * 19349663) ^ 0x9e3779b9;
      const rand = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
      };
      spray(
        cel,
        width,
        height,
        x,
        y,
        Math.max(2, settings.size * 2.2),
        settings.sprayDensity,
        this.strokeOpts(color),
        rand,
        bounds,
      );
      return;
    }
    const opts = this.pressureOpts();
    stampBrush(
      cel,
      width,
      height,
      x,
      y,
      opts.size,
      settings.shape,
      color,
      opts.coverage,
      tool === 'eraser',
      bounds,
      this.p.brush ?? null,
    );
  }

  private commitDirty(bounds: DirtyBounds): void {
    const rect = boundsToRect(bounds, this.p.width, this.p.height);
    if (!rect) return;
    this.clipToSelection(bounds);
    this.dirtied = true;
    this.previewRect = this.previewRect ? unionRect(this.previewRect, rect) : rect;
    this.lastDirty = this.lastDirty ? unionRect(this.lastDirty, rect) : rect;
  }

  /** Redraw the entire freehand path (pixel-perfect mode needs to look back). */
  private redrawPencilPath(color: RGBA, erase: boolean): DirtyBounds {
    this.restorePreview();
    const bounds = emptyBounds();
    const path = this.p.settings.pixelPerfect
      ? pixelPerfectPath(this.points)
      : this.points;
    const opts = { ...this.strokeOpts(color), erase };
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1];
      const b = path[i];
      const va = this.mirror(a.x, a.y);
      const vb = this.mirror(b.x, b.y);
      for (let k = 0; k < va.length; k++) {
        this.lineAll(va[k].x, va[k].y, vb[k].x, vb[k].y, opts, bounds);
        growBounds(bounds, va[k].x, va[k].y);
        growBounds(bounds, vb[k].x, vb[k].y);
      }
    }
    if (path.length === 1) this.stampAll(path[0].x, path[0].y, color, bounds);
    return bounds;
  }

  move(x: number, y: number, button = 0, shift = false): void {
    const { tool } = this.p;
    const color = this.colorFor(button);
    this.lastDirty = null;

    if (tool === 'select' || tool === 'select-free') {
      if (tool === 'select') {
        const nx = Math.min(x, this.startPoint.x);
        const ny = Math.min(y, this.startPoint.y);
        let w = Math.abs(x - this.startPoint.x);
        let h = Math.abs(y - this.startPoint.y);
        if (shift) {
          const size = Math.max(w, h);
          w = size;
          h = size;
        }
        this.selectionRect = {
          x: x < this.startPoint.x ? this.startPoint.x - w : nx,
          y: y < this.startPoint.y ? this.startPoint.y - h : ny,
          w,
          h,
        };
      } else {
        const last = this.lassoPoints?.[this.lassoPoints.length - 1];
        if (!last || Math.abs(last.x - x) + Math.abs(last.y - y) >= 1) {
          this.lassoPoints = [...(this.lassoPoints ?? []), { x, y }];
        }
      }
      return;
    }

    if (tool === 'move') {
      this.updateMove(x, y);
      return;
    }

    if (tool === 'pencil' || tool === 'eraser') {
      const last = this.points[this.points.length - 1];
      if (last && last.x === x && last.y === y) return;
      this.points.push({ x, y, p: this.pressure });
      if (this.p.settings.pixelPerfect && this.p.settings.size === 1 && !this.p.brush) {
        const b = this.redrawPencilPath(color, tool === 'eraser');
        this.commitDirty(b);
        return;
      }
      const b = emptyBounds();
      const opts = this.strokeOpts(color);
      if (last) {
        const va = this.mirror(last.x, last.y);
        const vb = this.mirror(x, y);
        for (let k = 0; k < va.length; k++) {
          this.lineAll(va[k].x, va[k].y, vb[k].x, vb[k].y, opts, b);
        }
      }
      this.commitDirty(b);
      return;
    }

    if (tool === 'dither' || tool === 'spray') {
      const b = emptyBounds();
      const last = this.points[this.points.length - 1];
      if (last) {
        const steps = Math.max(Math.abs(x - last.x), Math.abs(y - last.y));
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          const px = Math.round(last.x + (x - last.x) * t);
          const py = Math.round(last.y + (y - last.y) * t);
          this.stampAll(px, py, color, b);
        }
      }
      this.points.push({ x, y, p: this.pressure });
      this.commitDirty(b);
      return;
    }

    if (SHAPE_TOOLS.includes(tool)) {
      this.drawShapePreview(x, y, color, shift);
      return;
    }

    if (tool === 'bucket' || tool === 'eyedropper') return;
  }

  private drawShapePreview(x: number, y: number, color: RGBA, shift: boolean): void {
    this.restorePreview();
    const b = emptyBounds();
    const { cel, width, height, tool, settings } = this.p;
    const opts = this.strokeOpts(color);
    let ex = x;
    let ey = y;
    if (tool === 'line' && shift) {
      const dx = x - this.startPoint.x;
      const dy = y - this.startPoint.y;
      const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
      const len = Math.hypot(dx, dy);
      ex = Math.round(this.startPoint.x + Math.cos(angle) * len);
      ey = Math.round(this.startPoint.y + Math.sin(angle) * len);
    }
    if ((tool === 'rect' || tool === 'rect-filled' || tool === 'ellipse' || tool === 'ellipse-filled') && shift) {
      const dx = x - this.startPoint.x;
      const dy = y - this.startPoint.y;
      const size = Math.max(Math.abs(dx), Math.abs(dy));
      ex = this.startPoint.x + Math.sign(dx || 1) * size;
      ey = this.startPoint.y + Math.sign(dy || 1) * size;
    }

    const sx = this.startPoint.x;
    const sy = this.startPoint.y;
    const pairs: { ax: number; ay: number; bx: number; by: number }[] = [
      { ax: sx, ay: sy, bx: ex, by: ey },
    ];
    if (settings.symmetryX) pairs.push({ ax: width - 1 - sx, ay: sy, bx: width - 1 - ex, by: ey });
    if (settings.symmetryY) pairs.push({ ax: sx, ay: height - 1 - sy, bx: ex, by: height - 1 - ey });
    if (settings.symmetryX && settings.symmetryY) {
      pairs.push({ ax: width - 1 - sx, ay: height - 1 - sy, bx: width - 1 - ex, by: height - 1 - ey });
    }

    const offsets = this.tileOffsets();
    if (tool === 'line') {
      for (const pair of pairs) {
        for (const off of offsets) {
          drawLine(cel, width, height, pair.ax + off.dx, pair.ay + off.dy, pair.bx + off.dx, pair.by + off.dy, opts, b);
        }
      }
    } else if (tool === 'rect' || tool === 'rect-filled') {
      for (const pair of pairs) {
        for (const off of offsets) {
          const rect = {
            x: Math.min(pair.ax, pair.bx) + off.dx,
            y: Math.min(pair.ay, pair.by) + off.dy,
            w: Math.abs(pair.bx - pair.ax),
            h: Math.abs(pair.by - pair.ay),
          };
          drawRect(cel, width, height, rect, opts, tool === 'rect-filled', b);
        }
      }
    } else if (tool === 'ellipse' || tool === 'ellipse-filled') {
      for (const pair of pairs) {
        for (const off of offsets) {
          const rect = {
            x: Math.min(pair.ax, pair.bx) + off.dx,
            y: Math.min(pair.ay, pair.by) + off.dy,
            w: Math.abs(pair.bx - pair.ax),
            h: Math.abs(pair.by - pair.ay),
          };
          drawEllipse(cel, width, height, rect, opts, tool === 'ellipse-filled', b);
        }
      }
    } else if (tool === 'gradient') {
      const bounds: DirtyBounds = {
        minX: Math.min(this.startPoint.x, ex),
        minY: Math.min(this.startPoint.y, ey),
        maxX: Math.max(this.startPoint.x, ex),
        maxY: Math.max(this.startPoint.y, ey),
      };
      drawGradient(cel, width, height, color, this.colorFor(2), {
        mode: settings.gradientMode,
        dither: false,
        bounds,
        coverage: this.p.indexed ? 1 : settings.opacity,
      });
      b.minX = bounds.minX;
      b.minY = bounds.minY;
      b.maxX = bounds.maxX;
      b.maxY = bounds.maxY;
    }
    this.commitDirty(b);
  }

  private beginMove(x: number, y: number): void {
    const { cel, width, height, mask } = this.p;
    let region: Rect;
    if (mask) {
      // bounding box of the selection
      let minX = width;
      let minY = height;
      let maxX = -1;
      let maxY = -1;
      for (let yy = 0; yy < height; yy++) {
        for (let xx = 0; xx < width; xx++) {
          if (!mask[yy * width + xx]) continue;
          minX = Math.min(minX, xx);
          minY = Math.min(minY, yy);
          maxX = Math.max(maxX, xx);
          maxY = Math.max(maxY, yy);
        }
      }
      if (maxX < 0) return;
      region = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
    } else {
      // whole layer content bounds
      let minX = width;
      let minY = height;
      let maxX = -1;
      let maxY = -1;
      for (let yy = 0; yy < height; yy++) {
        for (let xx = 0; xx < width; xx++) {
          if (cel[(yy * width + xx) * 4 + 3] === 0) continue;
          minX = Math.min(minX, xx);
          minY = Math.min(minY, yy);
          maxX = Math.max(maxX, xx);
          maxY = Math.max(maxY, yy);
        }
      }
      if (maxX < 0) return;
      region = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
    }
    this.moveRegion = region;
    this.moveOrigin = { x, y };
    this.movePixels = extractRegion(cel, width, region);
    this.moveMask = mask ? new Uint8Array(mask) : null;
  }

  private updateMove(x: number, y: number): void {
    if (!this.moveRegion || !this.moveOrigin || !this.movePixels) return;
    const { cel, width, height } = this.p;
    const dx = x - this.moveOrigin.x;
    const dy = y - this.moveOrigin.y;
    cel.set(this.before);

    const region: Rect = this.moveRegion;
    if (!this.moveMask) {
      // clear source rect
      for (let yy: number = region.y; yy < region.y + region.h; yy++) {
        for (let xx: number = region.x; xx < region.x + region.w; xx++) {
          if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
          const i = (yy * width + xx) * 4;
          cel[i] = cel[i + 1] = cel[i + 2] = cel[i + 3] = 0;
        }
      }
    } else {
      const mask = this.moveMask;
      for (let yy: number = 0; yy < height; yy++) {
        for (let xx: number = 0; xx < width; xx++) {
          if (!mask[yy * width + xx]) continue;
          const i = (yy * width + xx) * 4;
          cel[i] = cel[i + 1] = cel[i + 2] = cel[i + 3] = 0;
        }
      }
    }

    const pixels = this.movePixels;
    const mask = this.moveMask;
    for (let ryy: number = 0; ryy < region.h; ryy++) {
      for (let rxx: number = 0; rxx < region.w; rxx++) {
        const sx: number = region.x + rxx;
        const sy: number = region.y + ryy;
        if (mask && !mask[sy * width + sx]) continue;
        const tx: number = sx + dx;
        const ty: number = sy + dy;
        if (tx < 0 || ty < 0 || tx >= width || ty >= height) continue;
        const si: number = (ryy * region.w + rxx) * 4;
        if (pixels[si + 3] === 0) continue;
        const di: number = (ty * width + tx) * 4;
        cel[di] = pixels[si];
        cel[di + 1] = pixels[si + 1];
        cel[di + 2] = pixels[si + 2];
        cel[di + 3] = pixels[si + 3];
      }
    }
    this.selectionRect = {
      x: region.x + dx,
      y: region.y + dy,
      w: region.w,
      h: region.h,
    };
    this.dirtied = true;
    this.previewRect = { x: 0, y: 0, w: width, h: height };
    this.lastDirty = { x: 0, y: 0, w: width, h: height };
  }

  end(): StrokeEndResult {
    const { tool, width, height } = this.p;
    if (tool === 'eyedropper') {
      // color comes from the caller's sampler
      return { dirty: null, pickedColor: this.pickedColor };
    }
    if (tool === 'select') {
      return { dirty: null, selectionRect: this.selectionRect };
    }
    if (tool === 'select-free') {
      return { dirty: null, selectionPoints: this.lassoPoints };
    }
    if (tool === 'move') {
      return { dirty: this.dirtied ? { x: 0, y: 0, w: width, h: height } : null, selectionRect: this.selectionRect };
    }
    if (SHAPE_TOOLS.includes(tool) && this.previewRect) {
      const rect = this.previewRect;
      this.previewRect = null;
      return { dirty: rect };
    }
    const rect = this.previewRect;
    this.previewRect = null;
    return { dirty: this.dirtied ? rect : null };
  }

  setPickedColor(hex: string): void {
    this.pickedColor = hex;
  }
}

export function unionRect(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const maxX = Math.max(a.x + a.w, b.x + b.w);
  const maxY = Math.max(a.y + a.h, b.y + b.h);
  return { x, y, w: maxX - x, h: maxY - y };
}

/** Fill a selection with a colour (used by the context actions). */
export function fillMasked(
  cel: Uint8ClampedArray,
  width: number,
  height: number,
  mask: Uint8Array | null,
  color: RGBA,
): Rect | null {
  const bounds = emptyBounds();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask && !mask[y * width + x]) continue;
      if (paintPixel(cel, width, height, x, y, color, 1, false)) growBounds(bounds, x, y);
    }
  }
  return boundsToRect(bounds, width, height);
}
