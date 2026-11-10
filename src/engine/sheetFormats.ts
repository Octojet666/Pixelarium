/**
 * Engine-ready sprite-sheet metadata.
 *
 * Pixelarium's own pack manifest is expressive, but no game engine loads it. This module emits the
 * two shapes pipelines actually consume:
 *
 * - **Aseprite JSON** - a hash of named frames plus `meta.frameTags`; read by Aseprite re-import,
 *   by Phaser's Aseprite loader and by many small runtimes.
 * - **TexturePacker JSON (array)** - the shape Phaser's `load.atlas` and most TexturePacker
 *   compatible loaders understand, with an `animations` map for multi-frame assets.
 *
 * Pure data only: the canvas work stays in `src/editor/exporting.ts` and `src/studios/PackStudio.tsx`.
 */

export interface SheetJsonFrame {
  /** Unique frame name; this is the key Aseprite uses and the `filename` TexturePacker writes. */
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Frame duration in milliseconds. */
  duration: number;
  /** Animation this frame belongs to (asset id or `animation`). */
  animation?: string;
}

export interface SheetJsonTag {
  name: string;
  /** First frame position in sheet order (0-based). */
  from: number;
  /** Last frame position in sheet order (0-based, inclusive). */
  to: number;
  direction?: 'forward' | 'reverse' | 'pingpong';
}

export interface SheetJsonInput {
  /** Sheet image file name, e.g. `hero-pack.png`. */
  image: string;
  width: number;
  height: number;
  frames: SheetJsonFrame[];
  /** Frame names per animation, in playing order. Used for TexturePacker `animations`. */
  animations?: { name: string; frames: string[] }[];
  /** Animation tags. Used for Aseprite `meta.frameTags`. */
  tags?: SheetJsonTag[];
  app?: string;
  version?: string;
}

export type SheetJsonFormat = 'pixelarium' | 'aseprite' | 'texturepacker';

export const SHEET_JSON_FORMATS: { id: SheetJsonFormat; label: string; hint: string }[] = [
  { id: 'pixelarium', label: 'Pixelarium pack', hint: 'Full pack manifest: assets, kinds, tags and durations.' },
  { id: 'aseprite', label: 'Aseprite JSON', hint: 'Frame hash + meta.frameTags; Aseprite and Phaser read it.' },
  { id: 'texturepacker', label: 'TexturePacker JSON', hint: 'Array frames + animations; Phaser load.atlas reads it.' },
];

function sourceSize(frame: SheetJsonFrame) {
  return { w: frame.w, h: frame.h };
}

function frameRect(frame: SheetJsonFrame) {
  return { x: frame.x, y: frame.y, w: frame.w, h: frame.h };
}

function meta(input: SheetJsonInput) {
  return {
    app: input.app ?? 'Pixelarium',
    version: input.version ?? '1.0',
    image: input.image,
    format: 'RGBA8888',
    size: { w: input.width, h: input.height },
    scale: '1',
  };
}

/** Aseprite JSON: `{ frames: { name: ... }, meta: { frameTags } }`. */
export function buildAsepriteJson(input: SheetJsonInput) {
  const frames: Record<string, unknown> = {};
  for (const frame of input.frames) {
    frames[frame.name] = {
      frame: frameRect(frame),
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: frame.w, h: frame.h },
      sourceSize: sourceSize(frame),
      duration: frame.duration,
    };
  }

  const metaOut: Record<string, unknown> = meta(input);
  const tags = input.tags?.filter((tag) => tag.to >= tag.from && tag.from >= 0 && tag.to < input.frames.length) ?? [];
  if (tags.length > 0) {
    metaOut.frameTags = tags.map((tag) => ({
      name: tag.name,
      from: tag.from,
      to: tag.to,
      direction: tag.direction ?? 'forward',
    }));
  }

  return { frames, meta: metaOut };
}

/** TexturePacker array JSON, with an optional `animations` map. */
export function buildTexturePackerJson(input: SheetJsonInput) {
  const out: Record<string, unknown> = {
    frames: input.frames.map((frame) => ({
      filename: frame.name,
      frame: frameRect(frame),
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: frame.w, h: frame.h },
      sourceSize: sourceSize(frame),
      duration: frame.duration,
    })),
  };

  const animations = (input.animations ?? []).filter((animation) => animation.frames.length > 0);
  if (animations.length > 0) {
    out.animations = Object.fromEntries(animations.map((animation) => [animation.name, animation.frames]));
  }
  out.meta = meta(input);
  return out;
}

/** Pick an engine builder. The Pixelarium pack manifest is built by the callers that own pack data. */
export function buildSheetJson(format: Exclude<SheetJsonFormat, 'pixelarium'>, input: SheetJsonInput): unknown {
  return format === 'aseprite' ? buildAsepriteJson(input) : buildTexturePackerJson(input);
}
