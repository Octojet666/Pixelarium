import { describe, expect, it } from 'vitest';
import sceneJson from '../data/openingScene.json';
import { letterAlpha, letterFlash, openingFrame } from './OpeningScene';

const W = sceneJson.settings.width;
const H = sceneJson.settings.height;
const GLYPH = sceneJson.palette.glyph;

const pixel = (frame: Uint8ClampedArray, x: number, y: number) => {
  const i = (y * W + x) * 4;
  return [frame[i], frame[i + 1], frame[i + 2], frame[i + 3]];
};

const changedRatio = (a: Uint8ClampedArray, b: Uint8ClampedArray) => {
  let changed = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) changed++;
  }
  return changed / (a.length / 4);
};

describe('opening scene frame', () => {
  it('paints an opaque frame at the document size', () => {
    const frame = openingFrame(4000, 1);
    expect(frame.length).toBe(W * H * 4);
    for (let i = 3; i < frame.length; i += 4) {
      expect(frame[i]).toBe(255);
    }
  });

  it('stays inside the canvas: every pixel is opaque and in range', () => {
    const frame = openingFrame(9000, 1);
    let min = 255;
    let max = 0;
    for (let i = 0; i < frame.length; i += 4) {
      min = Math.min(min, frame[i], frame[i + 1], frame[i + 2]);
      max = Math.max(max, frame[i], frame[i + 1], frame[i + 2]);
    }
    expect(min).toBeGreaterThanOrEqual(0);
    expect(max).toBeLessThanOrEqual(255);
  });

  it('is deterministic for the same time and reveal', () => {
    expect(Array.from(openingFrame(5200, 0.5))).toEqual(Array.from(openingFrame(5200, 0.5)));
  });

  it('moves over the intro', () => {
    const a = openingFrame(0, 1);
    const b = openingFrame(6000, 1);
    const c = openingFrame(14000, 1);
    expect(changedRatio(a, b)).toBeGreaterThan(0.003);
    expect(changedRatio(b, c)).toBeGreaterThan(0.003);
  });
});

describe('wordmark reveal', () => {
  it('hides every letter before the reveal starts', () => {
    const letters = sceneJson.wordmark.letters;
    for (let i = 0; i < letters.length; i++) {
      expect(letterAlpha(0, i)).toBe(0);
    }
    expect(letterAlpha(1, 0)).toBe(1);
  });

  it('settles every letter by the end', () => {
    for (let i = 0; i < sceneJson.wordmark.letters.length; i++) {
      expect(letterAlpha(1, i)).toBe(1);
      expect(letterFlash(1, i)).toBe(0);
    }
  });

  it('reveals left to right, never backwards', () => {
    const count = sceneJson.wordmark.letters.length;
    let previous = Array.from({ length: count }, () => 0);
    for (let step = 0; step <= 40; step++) {
      const reveal = step / 40;
      const current = Array.from({ length: count }, (_, i) => letterAlpha(reveal, i));
      for (let i = 0; i < count; i++) {
        expect(current[i]).toBeGreaterThanOrEqual(previous[i]);
        if (i > 0) expect(current[i]).toBeLessThanOrEqual(current[i - 1] + 1e-9);
      }
      previous = current;
    }
  });

  it('flashes only the letter that just landed', () => {
    const index = 4;
    expect(letterFlash(0, index)).toBe(0);
    const mid = letterFlash(index * 0.055 + 0.08, index);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(letterFlash(1, index)).toBe(0);
  });

  it('does not paint the title before it is revealed', () => {
    const hidden = openingFrame(7000, 0);
    const shown = openingFrame(7000, 1);
    let differed = 0;
    let glyphPixels = 0;
    for (const letter of sceneJson.wordmark.letters) {
      for (const [rx, ry, rw, rh] of letter.runs) {
        for (let y = letter.y + ry; y < letter.y + ry + rh; y++) {
          for (let x = letter.x + rx; x < letter.x + rx + rw; x++) {
            glyphPixels++;
            const a = pixel(hidden, x, y);
            const b = pixel(shown, x, y);
            if (a[0] !== b[0] || a[1] !== b[1] || a[2] !== b[2]) differed++;
          }
        }
      }
    }
    expect(glyphPixels).toBeGreaterThan(100);
    expect(differed).toBe(glyphPixels);
  });

  it('paints full glyph pixels once revealed', () => {
    const frame = openingFrame(7000, 1);
    let total = 0;
    for (const letter of sceneJson.wordmark.letters) {
      for (const [rx, ry, rw, rh] of letter.runs) {
        for (let y = letter.y + ry; y < letter.y + ry + rh; y++) {
          for (let x = letter.x + rx; x < letter.x + rx + rw; x++) {
            total++;
            expect(pixel(frame, x, y)).toEqual([GLYPH[0], GLYPH[1], GLYPH[2], 255]);
          }
        }
      }
    }
    expect(total).toBeGreaterThan(0);
  });
});
