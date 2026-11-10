import { describe, expect, it } from 'vitest';
import { createProject } from './document';
import {
  DEFAULT_CAMERA,
  cameraAt,
  cameraView,
  easeInOut,
  lerpCamera,
  outputSize,
  timelineAt,
} from './camera';
import { deserializeProject, serializeProjectToString } from './serialize';

function docWithFrames(count: number, duration = 100) {
  const doc = createProject({ width: 64, height: 32, name: 'Camera test' });
  while (doc.frames.length < count) {
    doc.frames.push({
      id: `frame-${doc.frames.length + 1}`,
      duration,
      cels: { [doc.layers[0].id]: new Uint8ClampedArray(64 * 32 * 4) },
    });
  }
  for (const frame of doc.frames) frame.duration = duration;
  return doc;
}

describe('cinematic camera', () => {
  it('falls back to the default framing without keyframes', () => {
    const doc = docWithFrames(3);
    expect(cameraAt(doc, 1, 0.4)).toEqual(DEFAULT_CAMERA);
  });

  it('returns a lone keyframe for the whole scene', () => {
    const doc = docWithFrames(3);
    doc.frames[1].camera = { x: 0.25, y: 0.75, zoom: 2 };
    expect(cameraAt(doc, 0, 0.5)).toEqual({ x: 0.25, y: 0.75, zoom: 2 });
    expect(cameraAt(doc, 2, 0)).toEqual({ x: 0.25, y: 0.75, zoom: 2 });
  });

  it('interpolates across unkeyed frames between two keys', () => {
    const doc = docWithFrames(5, 100);
    doc.frames[0].camera = { x: 0, y: 0.5, zoom: 1 };
    doc.frames[4].camera = { x: 1, y: 0.5, zoom: 3 };
    expect(cameraAt(doc, 0, 0).x).toBeCloseTo(0, 5);
    expect(cameraAt(doc, 2, 0).x).toBeCloseTo(0.5, 5);
    expect(cameraAt(doc, 2, 0.5).x).toBeCloseTo(easeInOut(0.625), 5);
    expect(cameraAt(doc, 4, 0).x).toBeCloseTo(1, 5);
    expect(cameraAt(doc, 2, 0).zoom).toBeGreaterThan(1);
  });

  it('holds the last key after the final keyframe when not looping', () => {
    const doc = docWithFrames(4, 100);
    doc.frames[1].camera = { x: 0.2, y: 0.4, zoom: 1.5 };
    doc.frames[2].camera = { x: 0.8, y: 0.6, zoom: 2 };
    const held = cameraAt(doc, 4, 0, false);
    expect(held.x).toBeCloseTo(0.8, 5);
    const beforeFirst = cameraAt(doc, 0, 0, false);
    expect(beforeFirst.x).toBeCloseTo(0.2, 5);
  });

  it('wraps from the last key to the first when looping', () => {
    const doc = docWithFrames(4, 100);
    doc.frames[0].camera = { x: 0, y: 0.5, zoom: 1 };
    doc.frames[3].camera = { x: 1, y: 0.5, zoom: 1 };
    const atZero = cameraAt(doc, 0, 0, true);
    expect(atZero.x).toBeCloseTo(0, 5);
    const wrapped = cameraAt(doc, 3, 0.5, true);
    expect(wrapped.x).toBeCloseTo(0.5, 5);
  });

  it('eases smoothly and clamps at the ends', () => {
    expect(easeInOut(-1)).toBe(0);
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 5);
    expect(easeInOut(2)).toBe(1);
    expect(lerpCamera({ x: 0, y: 0, zoom: 1 }, { x: 1, y: 1, zoom: 2 }, 0.5)).toEqual({
      x: 0.5,
      y: 0.5,
      zoom: 1.5,
    });
  });
});

describe('camera framing', () => {
  it('computes contain scale and centering offsets', () => {
    const view = cameraView(64, 32, { x: 0.5, y: 0.5, zoom: 1 }, 160, 90, 'contain');
    expect(view.scale).toBe(2.5);
    expect(view.dx).toBe(0);
    expect(view.dy).toBe(5);
    expect(view.visible.w).toBe(64);
  });

  it('cover fills the frame and crops the canvas', () => {
    const view = cameraView(64, 64, { x: 0.5, y: 0.5, zoom: 1 }, 160, 90, 'cover');
    expect(view.scale).toBe(2.5);
    expect(view.visible.w).toBe(64);
    expect(view.visible.h).toBe(36);
  });

  it('produces even output dimensions', () => {
    const { width, height } = outputSize(16 / 9, 720);
    expect(height).toBe(720);
    expect(width % 2).toBe(0);
    expect(width / height).toBeCloseTo(16 / 9, 1);
  });
});

describe('timeline mapping', () => {
  it('maps elapsed time onto frames and progress', () => {
    const doc = docWithFrames(3, 100);
    const first = timelineAt(doc, 50);
    expect(first.frameIndex).toBe(0);
    expect(first.progress).toBeCloseTo(0.5, 5);
    expect(first.totalMs).toBe(300);

    const second = timelineAt(doc, 250);
    expect(second.frameIndex).toBe(2);
    expect(second.progress).toBeCloseTo(0.5, 5);

    const looped = timelineAt(doc, 350);
    expect(looped.frameIndex).toBe(0);
    expect(looped.progress).toBeCloseTo(0.5, 5);
  });
});

describe('cinematic persistence', () => {
  it('round-trips camera keys and cinema settings through .pxl', () => {
    const doc = docWithFrames(2, 120);
    doc.frames[0].camera = { x: 0.2, y: 0.8, zoom: 1.75 };
    doc.cinema = { aspect: '9:16', fit: 'cover', background: '#101018', fps: 30 };
    const restored = deserializeProject(serializeProjectToString(doc));
    expect(restored.frames[0].camera).toEqual({ x: 0.2, y: 0.8, zoom: 1.75 });
    expect(restored.frames[1].camera).toBeUndefined();
    expect(restored.cinema).toEqual({ aspect: '9:16', fit: 'cover', background: '#101018', fps: 30 });
  });

  it('repairs invalid camera values instead of rejecting the project', () => {
    const doc = docWithFrames(1, 100);
    doc.frames[0].camera = { x: 5, y: -2, zoom: 99 };
    const restored = deserializeProject(serializeProjectToString(doc));
    expect(restored.frames[0].camera).toEqual({ x: 1, y: 0, zoom: 8 });
  });
});
