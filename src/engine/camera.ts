/**
 * Cinematic camera: keyframes live on animation frames, playback interpolates
 * them with easing, and scene rendering maps a document composite into a
 * fixed-size output frame (e.g. 1920×1080) using contain/cover fitting.
 */

import type { CinemaSettings, Frame, FrameCamera, ProjectDoc } from '../types';
import { compositeFrame } from './composite';

export const DEFAULT_CAMERA: FrameCamera = { x: 0.5, y: 0.5, zoom: 1 };

export const DEFAULT_CINEMA: CinemaSettings = {
  aspect: '16:9',
  fit: 'contain',
  background: '#0b0b10',
  fps: 24,
};

export function clampCamera(camera: FrameCamera): FrameCamera {
  return {
    x: clamp(camera.x, 0, 1),
    y: clamp(camera.y, 0, 1),
    zoom: clamp(camera.zoom, 0.2, 8),
  };
}

function clamp(v: number, min: number, max: number): number {
  return Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : min;
}

export function frameCamera(frame: Frame | undefined): FrameCamera {
  return frame?.camera ? clampCamera(frame.camera) : DEFAULT_CAMERA;
}

/** Smooth, slightly cinematic ease. */
export function easeInOut(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

export function lerpCamera(a: FrameCamera, b: FrameCamera, t: number): FrameCamera {
  const e = easeInOut(t);
  return {
    x: a.x + (b.x - a.x) * e,
    y: a.y + (b.y - a.y) * e,
    zoom: a.zoom + (b.zoom - a.zoom) * e,
  };
}

/**
 * Camera for a point in time inside a frame. Only frames with a keyframe define
 * poses: between two keys the camera interpolates across the whole span, so a
 * key on frame 1 and frame 5 pans smoothly through the frames in between.
 */
export function cameraAt(doc: ProjectDoc, frameIndex: number, progress = 0, loop = true): FrameCamera {
  const frames = doc.frames;
  if (frames.length === 0) return DEFAULT_CAMERA;
  const index = Math.max(0, Math.min(frames.length - 1, frameIndex));

  const starts: number[] = [];
  let total = 0;
  for (const f of frames) {
    starts.push(total);
    total += Math.max(10, f.duration);
  }
  const keys = frames.flatMap((f, i) =>
    f.camera ? [{ start: starts[i], index: i, camera: clampCamera(f.camera) }] : [],
  );
  if (keys.length === 0) return DEFAULT_CAMERA;
  if (keys.length === 1) return keys[0].camera;

  let t = starts[index] + Math.max(0, Math.min(1, progress)) * Math.max(10, frames[index].duration);
  if (loop) t = ((t % total) + total) % total;
  else t = Math.min(t, total);

  let ai = -1;
  for (let i = 0; i < keys.length; i++) {
    if (keys[i].start <= t) ai = i;
    else break;
  }

  let a: (typeof keys)[number];
  let b: (typeof keys)[number];
  let startA: number;
  let endB: number;
  if (ai >= 0) {
    a = keys[ai];
    if (ai === keys.length - 1 && !loop) return a.camera;
    b = keys[(ai + 1) % keys.length];
    startA = a.start;
    endB = b.start > a.start ? b.start : b.start + total;
  } else {
    if (!loop) return keys[0].camera;
    a = keys[keys.length - 1];
    b = keys[0];
    startA = a.start - total;
    endB = b.start;
  }
  const span = endB - startA;
  if (span <= 0) return a.camera;
  return lerpCamera(a.camera, b.camera, (t - startA) / span);
}

export interface Playhead {
  frameIndex: number;
  progress: number;
  totalMs: number;
  elapsedMs: number;
}

/** Maps elapsed milliseconds onto frames, honoring per-frame durations. */
export function timelineAt(doc: ProjectDoc, elapsedMs: number, loop = true): Playhead {
  const frames = doc.frames;
  const totalMs = frames.reduce((sum, f) => sum + Math.max(10, f.duration), 0) || 1;
  let t = Math.max(0, elapsedMs);
  if (loop) t %= totalMs;
  else t = Math.min(t, totalMs - 0.001);
  let cursor = 0;
  for (let i = 0; i < frames.length; i++) {
    const d = Math.max(10, frames[i].duration);
    if (t < cursor + d) {
      return { frameIndex: i, progress: (t - cursor) / d, totalMs, elapsedMs: t };
    }
    cursor += d;
  }
  const last = Math.max(0, frames.length - 1);
  return { frameIndex: last, progress: 1, totalMs, elapsedMs: totalMs };
}

export function aspectRatio(doc: ProjectDoc, setting: CinemaSettings['aspect']): number {
  switch (setting) {
    case '16:9':
      return 16 / 9;
    case '9:16':
      return 9 / 16;
    case '1:1':
      return 1;
    case '4:3':
      return 4 / 3;
    default:
      return doc.width / doc.height;
  }
}

export function outputSize(ratio: number, targetHeight: number): { width: number; height: number } {
  const height = Math.max(2, Math.round(targetHeight / 2) * 2);
  const width = Math.max(2, Math.round((height * ratio) / 2) * 2);
  return { width, height };
}

export interface CameraView {
  scale: number;
  dx: number;
  dy: number;
  /** Visible document rectangle, useful for editor overlays. */
  visible: { x: number; y: number; w: number; h: number };
}

export function cameraView(
  docWidth: number,
  docHeight: number,
  camera: FrameCamera,
  outWidth: number,
  outHeight: number,
  fit: 'contain' | 'cover',
): CameraView {
  const fitScale =
    fit === 'cover'
      ? Math.max(outWidth / docWidth, outHeight / docHeight)
      : Math.min(outWidth / docWidth, outHeight / docHeight);
  const scale = fitScale * clampCamera(camera).zoom;
  const dx = outWidth / 2 - camera.x * docWidth * scale;
  const dy = outHeight / 2 - camera.y * docHeight * scale;
  return {
    scale,
    dx,
    dy,
    visible: {
      x: (0 - dx) / scale,
      y: (0 - dy) / scale,
      w: outWidth / scale,
      h: outHeight / scale,
    },
  };
}

/* A scratch canvas keeps cinematic previews from allocating per frame. */
let scratch: HTMLCanvasElement | null = null;
let scratchCtx: CanvasRenderingContext2D | null = null;

function getScratch(width: number, height: number): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  if (!scratch || scratch.width !== width || scratch.height !== height) {
    scratch = document.createElement('canvas');
    scratch.width = width;
    scratch.height = height;
    scratchCtx = scratch.getContext('2d');
  }
  return scratchCtx;
}

/** Draws one frame as the camera sees it, at an arbitrary output resolution. */
export function renderCameraFrame(
  ctx: CanvasRenderingContext2D,
  doc: ProjectDoc,
  frameIndex: number,
  camera: FrameCamera,
  outWidth: number,
  outHeight: number,
  settings: Pick<CinemaSettings, 'fit' | 'background'>,
): void {
  ctx.save();
  ctx.fillStyle = settings.background;
  ctx.fillRect(0, 0, outWidth, outHeight);
  const frame = doc.frames[frameIndex];
  if (!frame) {
    ctx.restore();
    return;
  }
  const sctx = getScratch(doc.width, doc.height);
  if (!sctx || !scratch) {
    ctx.restore();
    return;
  }
  const pixels = compositeFrame(doc, frameIndex);
  sctx.putImageData(new ImageData(new Uint8ClampedArray(pixels), doc.width, doc.height), 0, 0);
  const view = cameraView(doc.width, doc.height, camera, outWidth, outHeight, settings.fit);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    scratch,
    Math.round(view.dx),
    Math.round(view.dy),
    Math.round(doc.width * view.scale),
    Math.round(doc.height * view.scale),
  );
  ctx.restore();
}

/** Length of one full animation pass in milliseconds. */
export function animationDuration(doc: ProjectDoc): number {
  return doc.frames.reduce((sum, f) => sum + Math.max(10, f.duration), 0);
}
