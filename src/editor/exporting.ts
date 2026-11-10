/** Canvas-based export helpers (browser only). */

import type { ProjectDoc, Rect } from '../types';
import { compositeFrame } from '../engine/composite';
import { encodeGif } from '../engine/gif';
import { serializeProject } from '../engine/serialize';
import { hexToRgb } from '../engine/color';
import { buildSheetJson, type SheetJsonFormat, type SheetJsonInput } from '../engine/sheetFormats';

export function pixelsToCanvas(pixels: Uint8ClampedArray, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable in this browser');
  const data = new ImageData(new Uint8ClampedArray(pixels), width, height);
  ctx.putImageData(data, 0, 0);
  return canvas;
}

export function scaleCanvas(source: HTMLCanvasElement, scale: number): HTMLCanvasElement {
  if (scale === 1) return source;
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(source.width * scale));
  out.height = Math.max(1, Math.round(source.height * scale));
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable in this browser');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, 0, 0, out.width, out.height);
  return out;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function safeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'pixelarium-artwork';
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not encode image'))), 'image/png');
  });
}

export async function exportPng(
  doc: ProjectDoc,
  frameIndex: number,
  scale: number,
  filename: string,
  background?: string,
): Promise<void> {
  const bg = background ? toRgba(background) : undefined;
  const pixels = compositeFrame(doc, frameIndex, undefined, { background: bg });
  const canvas = scaleCanvas(pixelsToCanvas(pixels, doc.width, doc.height), scale);
  downloadBlob(await canvasToBlob(canvas), `${safeFilename(filename)}.png`);
}

function toRgba(hex: string): [number, number, number, number] {
  const [r, g, b] = hexToRgb(hex);
  return [r, g, b, 255];
}

export async function exportAllFrames(
  doc: ProjectDoc,
  scale: number,
  filename: string,
  background?: string,
): Promise<number> {
  const bg = background ? toRgba(background) : undefined;
  let count = 0;
  for (let i = 0; i < doc.frames.length; i++) {
    const pixels = compositeFrame(doc, i, undefined, { background: bg });
    const canvas = scaleCanvas(pixelsToCanvas(pixels, doc.width, doc.height), scale);
    downloadBlob(await canvasToBlob(canvas), `${safeFilename(filename)}-frame-${String(i + 1).padStart(2, '0')}.png`);
    count++;
    await new Promise((r) => setTimeout(r, 180));
  }
  return count;
}

export interface SpriteSheetOptions {
  columns: number;
  padding: number;
  spacing: number;
  scale: number;
  background?: string;
  frames?: number[];
  byRows?: number;
}

export function buildSpriteSheet(doc: ProjectDoc, opts: SpriteSheetOptions): HTMLCanvasElement {
  const indices = opts.frames ?? doc.frames.map((_, i) => i);
  const count = Math.max(1, indices.length);
  const bg = opts.background ? toRgba(opts.background) : undefined;
  const cellW = doc.width * opts.scale;
  const cellH = doc.height * opts.scale;
  let columns = Math.max(1, opts.columns);
  if (opts.byRows && opts.byRows > 0) columns = Math.ceil(count / opts.byRows);
  columns = Math.min(columns, count);
  const rows = Math.ceil(count / columns);
  const width = opts.padding * 2 + columns * cellW + Math.max(0, columns - 1) * opts.spacing;
  const height = opts.padding * 2 + rows * cellH + Math.max(0, rows - 1) * opts.spacing;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable in this browser');
  ctx.imageSmoothingEnabled = false;

  indices.forEach((frameIndex, i) => {
    const pixels = compositeFrame(doc, frameIndex, undefined, { background: bg });
    const cell = scaleCanvas(pixelsToCanvas(pixels, doc.width, doc.height), opts.scale);
    const col = i % columns;
    const row = Math.floor(i / columns);
    ctx.drawImage(cell, opts.padding + col * (cellW + opts.spacing), opts.padding + row * (cellH + opts.spacing));
  });
  return canvas;
}

export interface SpriteSheetMeta {
  image: string;
  frameWidth: number;
  frameHeight: number;
  columns: number;
  rows: number;
  frameCount: number;
  frames: { index: number; x: number; y: number; w: number; h: number; duration: number }[];
  tags: ProjectDoc['tags'];
  scale: number;
}

export function buildSpriteSheetMeta(doc: ProjectDoc, opts: SpriteSheetOptions, filename: string): SpriteSheetMeta {
  const indices = opts.frames ?? doc.frames.map((_, i) => i);
  const count = Math.max(1, indices.length);
  let columns = Math.max(1, opts.columns);
  if (opts.byRows && opts.byRows > 0) columns = Math.ceil(count / opts.byRows);
  columns = Math.min(columns, count);
  const rows = Math.ceil(count / columns);
  const cellW = doc.width * opts.scale;
  const cellH = doc.height * opts.scale;
  return {
    image: `${filename}.png`,
    frameWidth: cellW,
    frameHeight: cellH,
    columns,
    rows,
    frameCount: count,
    frames: indices.map((frameIndex, i) => ({
      index: frameIndex,
      x: opts.padding + (i % columns) * (cellW + opts.spacing),
      y: opts.padding + Math.floor(i / columns) * (cellH + opts.spacing),
      w: cellW,
      h: cellH,
      duration: doc.frames[frameIndex]?.duration ?? 100,
    })),
    tags: doc.tags,
    scale: opts.scale,
  };
}

/** Metadata for the engine presets, derived from the same layout the PNG used. */
export function buildSheetJsonInput(doc: ProjectDoc, opts: SpriteSheetOptions, filename: string): SheetJsonInput {
  const meta = buildSpriteSheetMeta(doc, opts, filename);
  const frames = meta.frames.map((frame) => ({
    name: `${filename}_${frame.index}`,
    x: frame.x,
    y: frame.y,
    w: frame.w,
    h: frame.h,
    duration: frame.duration,
    animation: 'animation',
  }));
  const positionOf = new Map(meta.frames.map((frame, position) => [frame.index, position]));
  const tags = doc.tags
    .map((tag) => {
      const positions = meta.frames
        .filter((frame) => frame.index >= tag.from && frame.index <= tag.to)
        .map((frame) => positionOf.get(frame.index) ?? -1)
        .filter((position) => position >= 0);
      if (positions.length === 0) return null;
      return {
        name: tag.name,
        from: Math.min(...positions),
        to: Math.max(...positions),
        direction: tag.mode === 'pingpong' ? ('pingpong' as const) : tag.mode === 'reverse' ? ('reverse' as const) : ('forward' as const),
      };
    })
    .filter((tag): tag is NonNullable<typeof tag> => tag !== null);

  return {
    image: `${filename}.png`,
    width: meta.columns * meta.frameWidth + opts.padding * 2 + Math.max(0, meta.columns - 1) * opts.spacing,
    height: meta.rows * meta.frameHeight + opts.padding * 2 + Math.max(0, meta.rows - 1) * opts.spacing,
    frames,
    animations: [{ name: 'animation', frames: frames.map((frame) => frame.name) }],
    tags,
  };
}

export async function exportSpriteSheet(
  doc: ProjectDoc,
  opts: SpriteSheetOptions,
  filename: string,
  withJson: boolean,
  jsonFormat: SheetJsonFormat = 'pixelarium',
): Promise<void> {
  const canvas = buildSpriteSheet(doc, opts);
  downloadBlob(await canvasToBlob(canvas), `${filename}.png`);
  if (!withJson) return;
  const payload =
    jsonFormat === 'pixelarium'
      ? buildSpriteSheetMeta(doc, opts, filename)
      : buildSheetJson(jsonFormat, buildSheetJsonInput(doc, opts, filename));
  downloadBlob(
    new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
    `${filename}.json`,
  );
}

export function exportGif(
  doc: ProjectDoc,
  opts: {
    scale: number;
    loop: boolean;
    dither: 'none' | 'bayer2' | 'bayer4' | 'bayer8' | 'floyd-steinberg';
    palette?: string[];
    background?: string;
    frameRange?: Rect;
  },
  filename: string,
): void {
  const frames = doc.frames.map((frame) => {
    const pixels = compositeFrame(doc, doc.frames.indexOf(frame), undefined, {
      background: opts.background ? toRgba(opts.background) : undefined,
    });
    let scaled = pixels;
    if (opts.scale !== 1) {
      const canvas = scaleCanvas(pixelsToCanvas(pixels, doc.width, doc.height), opts.scale);
      const ctx = canvas.getContext('2d')!;
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      scaled = new Uint8ClampedArray(data.data.buffer.slice(0));
      return {
        pixels: scaled,
        delayCs: Math.round(frame.duration / 10),
        width: canvas.width,
        height: canvas.height,
      };
    }
    return {
      pixels: scaled,
      delayCs: Math.round(frame.duration / 10),
      width: doc.width,
      height: doc.height,
    };
  });

  const width = doc.width * opts.scale;
  const height = doc.height * opts.scale;
  const bytes = encodeGif(
    frames.map((f) => ({ pixels: f.pixels, delayCs: f.delayCs })),
    {
      width,
      height,
      loop: opts.loop,
      dither: opts.dither,
      palette: opts.palette,
    },
  );
  downloadBlob(new Blob([bytes as unknown as BlobPart], { type: 'image/gif' }), `${safeFilename(filename)}.gif`);
}

export function exportProjectFile(doc: ProjectDoc): void {
  const json = JSON.stringify(serializeProject(doc), null, 2);
  downloadBlob(new Blob([json], { type: 'application/json' }), `${safeFilename(doc.name)}.pxl`);
}

export async function importImageFile(
  file: File,
): Promise<{ pixels: Uint8ClampedArray; width: number; height: number }> {
  if (!file.type.startsWith('image/')) throw new Error('That file is not an image.');
  if (file.size > 25 * 1024 * 1024) throw new Error('Images must be smaller than 25 MB.');
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable in this browser');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(bitmap, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return { pixels: new Uint8ClampedArray(data.data), width: canvas.width, height: canvas.height };
}

export function thumbnailDataUrl(doc: ProjectDoc, frameIndex = 0, max = 320): string {
  const pixels = compositeFrame(doc, frameIndex);
  const source = pixelsToCanvas(pixels, doc.width, doc.height);
  const scale = Math.max(1, Math.min(4, Math.floor(max / Math.max(doc.width, doc.height))));
  const canvas = scaleCanvas(source, scale);
  return canvas.toDataURL('image/png');
}

/** Draw an RGBA buffer into an existing canvas (used by thumbnails and previews). */
export function blitPixels(canvas: HTMLCanvasElement, pixels: Uint8ClampedArray, width: number, height: number): void {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.putImageData(new ImageData(new Uint8ClampedArray(pixels), width, height), 0, 0);
}
