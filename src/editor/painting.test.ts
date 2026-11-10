import { describe, expect, it } from 'vitest';
import { PaintStroke } from './painting';
import { createCel } from '../engine/pixel';
import { brushToMask } from '../engine/brushes';
import type { ToolSettings } from '../types';

const baseSettings: ToolSettings = {
  size: 1,
  opacity: 1,
  pixelPerfect: true,
  symmetryX: false,
  symmetryY: false,
  tolerance: 0,
  shape: 'square',
  gradientMode: 'linear',
  ditherPattern: 'bayer4',
  sprayDensity: 0.35,
  fontScale: 1,
  filled: true,
  pressureSize: true,
  pressureOpacity: false,
  tileMode: false,
  tilePreview: false,
  brushId: '',
};

function alphaAt(cel: Uint8ClampedArray, width: number, x: number, y: number) {
  return cel[(y * width + x) * 4 + 3];
}

function stroke(settings: Partial<ToolSettings>, extra: { brush?: ReturnType<typeof brushToMask>; indexed?: boolean } = {}) {
  const width = 12;
  const height = 12;
  const cel = createCel(width, height);
  const paint = new PaintStroke({
    cel,
    width,
    height,
    tool: 'pencil',
    settings: { ...baseSettings, ...settings },
    primary: [255, 0, 0, 255],
    secondary: [0, 0, 255, 255],
    mask: null,
    brush: extra.brush ?? null,
    indexed: extra.indexed,
  });
  return { cel, paint, width, height };
}

describe('PaintStroke', () => {
  it('wraps stamps across edges in tile mode', () => {
    const tiled = stroke({ size: 3, tileMode: true });
    tiled.paint.setPressure(1);
    tiled.paint.start(0, 0, 0);
    expect(alphaAt(tiled.cel, tiled.width, 0, 0)).toBe(255);
    expect(alphaAt(tiled.cel, tiled.width, 11, 0)).toBe(255);

    const plain = stroke({ size: 3, tileMode: false });
    plain.paint.start(0, 0, 0);
    expect(alphaAt(plain.cel, plain.width, 11, 0)).toBe(0);
  });

  it('shrinks the brush with pen pressure when pressure-size is on', () => {
    const half = stroke({ size: 8 });
    half.paint.setPressure(0.5);
    half.paint.start(6, 6, 0);
    expect(alphaAt(half.cel, half.width, 6, 6)).toBe(255);
    expect(alphaAt(half.cel, half.width, 3, 6)).toBe(0);

    const full = stroke({ size: 8 });
    full.paint.setPressure(1);
    full.paint.start(6, 6, 0);
    expect(alphaAt(full.cel, full.width, 3, 6)).toBe(255);
  });

  it('keeps full pressure when pressure-size is off', () => {
    const { cel, paint, width } = stroke({ size: 8, pressureSize: false });
    paint.setPressure(0.1);
    paint.start(6, 6, 0);
    expect(alphaAt(cel, width, 3, 6)).toBe(255);
  });

  it('stamps a custom brush mask instead of a square', () => {
    const mask = brushToMask(
      { id: 'x', name: 'x', builtin: false, rows: ['#..', '...', '..#'] },
      3,
    );
    const { cel, paint, width } = stroke({ size: 1 }, { brush: mask });
    paint.start(5, 5, 0);
    expect(alphaAt(cel, width, 4, 4)).toBe(255);
    expect(alphaAt(cel, width, 6, 6)).toBe(255);
    expect(alphaAt(cel, width, 5, 5)).toBe(0);
  });

  it('forces opaque stamps in indexed mode so no off-palette blends appear', () => {
    const { cel, paint, width } = stroke({ opacity: 0.4 }, { indexed: true });
    paint.start(4, 4, 0);
    expect(alphaAt(cel, width, 4, 4)).toBe(255);
    expect(cel[(4 * width + 4) * 4]).toBe(255);
  });

  it('mirrors strokes when symmetry is enabled', () => {
    const { cel, paint, width } = stroke({ symmetryX: true });
    paint.start(1, 5, 0);
    expect(alphaAt(cel, width, 1, 5)).toBe(255);
    expect(alphaAt(cel, width, 10, 5)).toBe(255);
  });
});
