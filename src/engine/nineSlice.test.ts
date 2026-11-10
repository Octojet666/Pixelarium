import { describe, expect, it } from 'vitest';
import { defaultNineSlice, renderNineSlice } from './nineSlice';
import { createProject } from './document';
import { deserializeProject, serializeProjectToString } from './serialize';

function solid(width: number, height: number, rgba: [number, number, number, number]) {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < out.length; i += 4) out.set(rgba, i);
  return out;
}

function pixel(buf: Uint8ClampedArray, width: number, x: number, y: number) {
  const i = (y * width + x) * 4;
  return [buf[i], buf[i + 1], buf[i + 2], buf[i + 3]];
}

describe('nine-slice', () => {
  it('keeps corners pixel-exact and stretches the middle', () => {
    // 3×3: each pixel a distinct opaque colour.
    const src = new Uint8ClampedArray(3 * 3 * 4);
    const colors: [number, number, number, number][] = [];
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
        const c: [number, number, number, number] = [x * 80, y * 80, (x + y) * 40, 255];
        colors.push(c);
        src.set(c, (y * 3 + x) * 4);
      }
    }
    const out = renderNineSlice(src, 3, 3, { left: 1, right: 1, top: 1, bottom: 1 }, 9, 9);
    expect([...pixel(out, 9, 0, 0)]).toEqual(colors[0]);
    expect([...pixel(out, 9, 8, 0)]).toEqual(colors[2]);
    expect([...pixel(out, 9, 0, 8)]).toEqual(colors[6]);
    expect([...pixel(out, 9, 8, 8)]).toEqual(colors[8]);
    // The single centre pixel fills the stretched middle.
    expect([...pixel(out, 9, 4, 4)]).toEqual(colors[4]);
  });

  it('handles a target smaller than the borders without dropping pixels', () => {
    const src = solid(8, 8, [10, 20, 30, 255]);
    const out = renderNineSlice(src, 8, 8, { left: 4, right: 4, top: 4, bottom: 4 }, 4, 4);
    expect(out).toHaveLength(4 * 4 * 4);
    expect([...pixel(out, 4, 0, 0)]).toEqual([10, 20, 30, 255]);
    expect([...pixel(out, 4, 3, 3)]).toEqual([10, 20, 30, 255]);
  });

  it('survives a .pxl save/load round trip with indexed mode', () => {
    const doc = createProject({ width: 24, height: 24, name: 'Panel' });
    doc.indexed = true;
    doc.nineSlice = { left: 4, right: 5, top: 6, bottom: 7 };
    const restored = deserializeProject(serializeProjectToString(doc));
    expect(restored.indexed).toBe(true);
    expect(restored.nineSlice).toEqual({ left: 4, right: 5, top: 6, bottom: 7 });
  });

  it('produces sane defaults and respects transparency', () => {
    const insets = defaultNineSlice(32, 32);
    expect(insets).toEqual({ left: 10, right: 10, top: 10, bottom: 10 });
    const src = new Uint8ClampedArray(8 * 8 * 4);
    const out = renderNineSlice(src, 8, 8, insets, 20, 20);
    expect(out.every((v) => v === 0)).toBe(true);
  });
});
