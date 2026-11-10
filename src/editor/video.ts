/**
 * Cinematic video export. Records a canvas in real time with MediaRecorder -
 * no server, no wasm encoder, and the same camera math used by the preview.
 */

import type { CinemaSettings, ProjectDoc } from '../types';
import {
  animationDuration,
  aspectRatio,
  cameraAt,
  outputSize,
  renderCameraFrame,
  timelineAt,
} from '../engine/camera';

const MIME_CANDIDATES = [
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
  'video/mp4;codecs=avc1.42E01E',
  'video/mp4',
];

export function pickVideoMime(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  return MIME_CANDIDATES.find((type) => {
    try {
      return MediaRecorder.isTypeSupported(type);
    } catch {
      return false;
    }
  }) ?? null;
}

export interface VideoExportOptions {
  doc: ProjectDoc;
  settings: CinemaSettings;
  /** Output height in pixels; width follows the chosen aspect. */
  height: number;
  fps?: number;
  onProgress?: (fraction: number) => void;
  onFrame?: (canvas: HTMLCanvasElement) => void;
  shouldCancel?: () => boolean;
}

export interface VideoExportResult {
  blob: Blob;
  width: number;
  height: number;
  durationMs: number;
  mime: string;
}

export async function exportCinematicVideo(options: VideoExportOptions): Promise<VideoExportResult> {
  const { doc, settings } = options;
  if (typeof document === 'undefined') throw new Error('Video export needs a browser.');
  const mime = pickVideoMime();
  if (!mime) {
    throw new Error('This browser cannot record video. Try Chrome, Edge or a recent Safari.');
  }
  if (doc.frames.length === 0) throw new Error('Add at least one frame before exporting video.');

  const fps = Math.max(6, Math.min(60, Math.round(options.fps ?? settings.fps ?? 24)));
  const ratio = aspectRatio(doc, settings.aspect);
  const { width, height } = outputSize(ratio, options.height);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create the video canvas.');

  const stream = canvas.captureStream(fps);
  const recorder = new MediaRecorder(stream, {
    mimeType: mime,
    videoBitsPerSecond: 8_000_000,
  });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };

  const stopped = new Promise<void>((resolve, reject) => {
    recorder.onstop = () => resolve();
    recorder.onerror = () => reject(new Error('The browser video recorder failed.'));
  });

  const totalMs = Math.max(40, animationDuration(doc));
  const startAt = performance.now();
  let cancelled = false;

  recorder.start(200);

  // Timers, not rAF: a recording must keep sampling even if the tab loses focus
  // (rAF pauses in hidden tabs, which would stall the recorder forever).
  const interval = Math.max(8, Math.round(1000 / fps));
  await new Promise<void>((resolve) => {
    const tick = () => {
      if (options.shouldCancel?.()) {
        cancelled = true;
        resolve();
        return;
      }
      const elapsed = Math.min(totalMs, performance.now() - startAt);
      const head = timelineAt(doc, elapsed, false);
      const camera = cameraAt(doc, head.frameIndex, head.progress, false);
      renderCameraFrame(ctx, doc, head.frameIndex, camera, width, height, settings);
      options.onFrame?.(canvas);
      options.onProgress?.(Math.min(1, elapsed / totalMs));
      if (elapsed >= totalMs) {
        resolve();
        return;
      }
      window.setTimeout(tick, interval);
    };
    tick();
  });

  recorder.stop();
  await stopped;
  stream.getTracks().forEach((track) => track.stop());

  const blob = new Blob(chunks, { type: mime.split(';')[0] });
  if (cancelled && blob.size === 0) throw new Error('Video export cancelled.');
  return { blob, width, height, durationMs: totalMs, mime };
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function videoExtension(mime: string): string {
  if (mime.includes('mp4')) return 'mp4';
  return 'webm';
}
