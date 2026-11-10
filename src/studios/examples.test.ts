import { describe, expect, it } from 'vitest';
import { STUDIOS } from './registry';
import { examplesFor, type StudioExample } from './examples';

function opaqueFraction(example: StudioExample): number {
  let opaque = 0;
  for (let i = 3; i < example.pixels.length; i += 4) {
    if (example.pixels[i] > 0) opaque += 1;
  }
  return opaque / (example.width * example.height);
}

describe('studio examples', () => {
  it('gives every studio exactly three examples', () => {
    for (const studio of STUDIOS) {
      expect(examplesFor(studio.id), studio.id).toHaveLength(3);
    }
  });

  it('labels each example with the studio that owns it', () => {
    for (const studio of STUDIOS) {
      for (const example of examplesFor(studio.id)) {
        expect(example.studio).toBe(studio.id);
      }
    }
  });

  it('returns RGBA buffers that match the declared size', () => {
    for (const studio of STUDIOS) {
      for (const example of examplesFor(studio.id)) {
        expect(example.width).toBeGreaterThan(0);
        expect(example.height).toBeGreaterThan(0);
        expect(example.pixels).toBeInstanceOf(Uint8ClampedArray);
        expect(example.pixels.length).toBe(example.width * example.height * 4);
      }
    }
  });

  it('renders visible art rather than an empty canvas', () => {
    for (const studio of STUDIOS) {
      for (const example of examplesFor(studio.id)) {
        expect(opaqueFraction(example), example.id).toBeGreaterThan(0.02);
      }
    }
  });

  it('caches each studio so the gallery does not rebuild frames on every render', () => {
    for (const studio of STUDIOS) {
      expect(examplesFor(studio.id)).toBe(examplesFor(studio.id));
    }
  });

  it('only points at templates the studio actually offers', () => {
    for (const studio of STUDIOS) {
      const ids = new Set(studio.templates.map((template) => template.id));
      for (const example of examplesFor(studio.id)) {
        if (example.templateId) {
          expect(ids.has(example.templateId), `${example.id} -> ${example.templateId}`).toBe(true);
        }
      }
    }
  });

  it('uses unique ids across the whole gallery', () => {
    const ids = STUDIOS.flatMap((studio) => examplesFor(studio.id).map((example) => example.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
