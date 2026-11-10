import { describe, expect, it } from 'vitest';
import { brushRowsFromPixels, brushToMask, scaleMask, BUILTIN_BRUSHES } from './brushes';

describe('brushes', () => {
  it('scales a built-in mask to the brush-size slider', () => {
    const horizontal = BUILTIN_BRUSHES.find((b) => b.id === 'horizontal')!;
    const mask = brushToMask(horizontal, 5);
    expect(mask.w).toBe(5);
    expect(mask.h).toBe(5);
    expect([...mask.data].filter(Boolean)).toHaveLength(25);
  });

  it('keeps saved brushes at their native size', () => {
    const mask = brushToMask({ id: 'x', name: 'x', builtin: false, rows: ['##', '##'] }, 16);
    expect(mask.w).toBe(2);
    expect(mask.h).toBe(2);
  });

  it('scales nearest-neighbour without blurring', () => {
    const mask = scaleMask({ w: 2, h: 2, data: new Uint8Array([1, 0, 0, 1]) }, 4);
    expect(mask.w).toBe(4);
    // Each source pixel becomes a 2×2 block, so the diagonal keeps 8 painted pixels.
    expect([...mask.data].filter(Boolean)).toHaveLength(8);
    expect(mask.data[0]).toBe(1);
    expect(mask.data[3]).toBe(0);
    expect(mask.data[2 * 4 + 2]).toBe(1);
  });

  it('captures opaque pixels inside a selection and trims nothing else', () => {
    const width = 6;
    const height = 6;
    const cel = new Uint8ClampedArray(width * height * 4);
    // Draw a 2×2 block at (2,2).
    for (const [x, y] of [[2, 2], [3, 2], [2, 3], [3, 3]]) {
      cel[(y * width + x) * 4 + 3] = 255;
    }
    const rows = brushRowsFromPixels(cel, width, height, { x: 2, y: 2, w: 2, h: 2 });
    expect(rows).toEqual(['##', '##']);
    expect(brushRowsFromPixels(cel, width, height, { x: 0, y: 0, w: 2, h: 2 })).toBeNull();
  });
});
