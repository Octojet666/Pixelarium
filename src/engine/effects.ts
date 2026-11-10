/** Editable pixel effects. Every function returns a new cel so previews are non-destructive. */

import type { RGBA } from '../types';
import { hexToRgb, rgbToHsl, hslToRgb } from './color';
import { applyPalette, type DitherMethod } from './quantize';
import { createCel, getPixel } from './pixel';

export interface EffectOptions {
  outlineColor: string;
  outlineThickness: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  shadowColor: string;
  shadowOpacity: number;
  glowColor: string;
  glowRadius: number;
  tintColor: string;
  tintStrength: number;
  hueShift: number;
  brightness: number;
  contrast: number;
  noiseAmount: number;
  noiseSeed: number;
  pixelateSize: number;
  quantizeColors: number;
  dither: DitherMethod;
}

export const DEFAULT_EFFECTS: EffectOptions = {
  outlineColor: '#0b0a1a',
  outlineThickness: 1,
  shadowOffsetX: 2,
  shadowOffsetY: 2,
  shadowColor: '#000000',
  shadowOpacity: 0.45,
  glowColor: '#ffd166',
  glowRadius: 2,
  tintColor: '#ff5fd2',
  tintStrength: 0.4,
  hueShift: 0,
  brightness: 0,
  contrast: 0,
  noiseAmount: 0.12,
  noiseSeed: 1,
  pixelateSize: 2,
  quantizeColors: 12,
  dither: 'bayer4',
};

function isOpaque(cel: Uint8ClampedArray, w: number, h: number, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= w || y >= h) return false;
  return cel[(y * w + x) * 4 + 3] > 0;
}

export function addOutline(
  cel: Uint8ClampedArray,
  w: number,
  h: number,
  color: RGBA,
  thickness: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(cel);
  for (let pass = 0; pass < Math.max(1, thickness); pass++) {
    const snapshot = new Uint8ClampedArray(out);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (isOpaque(snapshot, w, h, x, y)) continue;
        const near =
          isOpaque(snapshot, w, h, x - 1, y) ||
          isOpaque(snapshot, w, h, x + 1, y) ||
          isOpaque(snapshot, w, h, x, y - 1) ||
          isOpaque(snapshot, w, h, x, y + 1);
        if (near) {
          const i = (y * w + x) * 4;
          out[i] = color[0];
          out[i + 1] = color[1];
          out[i + 2] = color[2];
          out[i + 3] = color[3];
        }
      }
    }
  }
  return out;
}

export function dropShadow(
  cel: Uint8ClampedArray,
  w: number,
  h: number,
  offsetX: number,
  offsetY: number,
  color: string,
  opacity: number,
): Uint8ClampedArray {
  const [r, g, b] = hexToRgb(color);
  const out = createCel(w, h);
  // Shadow first, then source on top.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!isOpaque(cel, w, h, x, y)) continue;
      const tx = x + offsetX;
      const ty = y + offsetY;
      if (tx < 0 || ty < 0 || tx >= w || ty >= h) continue;
      const i = (ty * w + tx) * 4;
      if (out[i + 3] === 0) {
        out[i] = r;
        out[i + 1] = g;
        out[i + 2] = b;
        out[i + 3] = Math.round(opacity * 255);
      }
    }
  }
  for (let i = 0; i < cel.length; i += 4) {
    if (cel[i + 3] === 0) continue;
    out[i] = cel[i];
    out[i + 1] = cel[i + 1];
    out[i + 2] = cel[i + 2];
    out[i + 3] = cel[i + 3];
  }
  return out;
}

export function glow(
  cel: Uint8ClampedArray,
  w: number,
  h: number,
  color: string,
  radius: number,
): Uint8ClampedArray {
  const [r, g, b] = hexToRgb(color);
  const out = new Uint8ClampedArray(cel);
  const passes = Math.max(1, Math.round(radius));
  for (let pass = passes; pass >= 1; pass--) {
    const alpha = Math.round((30 / pass) * 2.2);
    const snapshot = new Uint8ClampedArray(out);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (isOpaque(snapshot, w, h, x, y)) continue;
        let near = false;
        for (let dy = -pass; dy <= pass && !near; dy++) {
          for (let dx = -pass; dx <= pass; dx++) {
            if (Math.abs(dx) + Math.abs(dy) > pass) continue;
            if (isOpaque(snapshot, w, h, x + dx, y + dy)) {
              near = true;
              break;
            }
          }
        }
        if (!near) continue;
        const i = (y * w + x) * 4;
        out[i] = r;
        out[i + 1] = g;
        out[i + 2] = b;
        out[i + 3] = Math.min(255, out[i + 3] + alpha);
      }
    }
  }
  for (let i = 0; i < cel.length; i += 4) {
    if (cel[i + 3] === 0) continue;
    out[i] = cel[i];
    out[i + 1] = cel[i + 1];
    out[i + 2] = cel[i + 2];
    out[i + 3] = cel[i + 3];
  }
  return out;
}

export function tint(cel: Uint8ClampedArray, color: string, strength: number): Uint8ClampedArray {
  const [tr, tg, tb] = hexToRgb(color);
  const out = new Uint8ClampedArray(cel);
  for (let i = 0; i < out.length; i += 4) {
    if (out[i + 3] === 0) continue;
    out[i] = out[i] + (tr - out[i]) * strength;
    out[i + 1] = out[i + 1] + (tg - out[i + 1]) * strength;
    out[i + 2] = out[i + 2] + (tb - out[i + 2]) * strength;
  }
  return out;
}

export function adjustHsl(
  cel: Uint8ClampedArray,
  hueShiftDeg: number,
  satScale: number,
  lightShift: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(cel);
  for (let i = 0; i < out.length; i += 4) {
    if (out[i + 3] === 0) continue;
    const [h, s, l] = rgbToHsl(out[i], out[i + 1], out[i + 2]);
    const [r, g, b] = hslToRgb(
      (h + hueShiftDeg / 360 + 1) % 1,
      Math.max(0, Math.min(1, s * satScale)),
      Math.max(0, Math.min(1, l + lightShift)),
    );
    out[i] = r;
    out[i + 1] = g;
    out[i + 2] = b;
  }
  return out;
}

export function brightnessContrast(
  cel: Uint8ClampedArray,
  brightness: number,
  contrast: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(cel);
  const c = contrast * 255;
  const factor = (259 * (c + 255)) / (255 * (259 - c));
  for (let i = 0; i < out.length; i += 4) {
    if (out[i + 3] === 0) continue;
    for (let k = 0; k < 3; k++) {
      const v = factor * (out[i + k] - 128) + 128 + brightness * 255;
      out[i + k] = Math.max(0, Math.min(255, Math.round(v)));
    }
  }
  return out;
}

export function addNoise(
  cel: Uint8ClampedArray,
  w: number,
  h: number,
  amount: number,
  seed: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(cel);
  let s = seed || 1;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (out[i + 3] === 0) continue;
      const delta = (rand() - 0.5) * amount * 255;
      for (let k = 0; k < 3; k++) out[i + k] = Math.max(0, Math.min(255, out[i + k] + delta));
    }
  }
  return out;
}

export function pixelate(cel: Uint8ClampedArray, w: number, h: number, size: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(cel);
  const s = Math.max(1, Math.round(size));
  for (let by = 0; by < h; by += s) {
    for (let bx = 0; bx < w; bx += s) {
      const src = getPixel(cel, w, Math.min(w - 1, bx + Math.floor(s / 2)), Math.min(h - 1, by + Math.floor(s / 2)));
      for (let y = by; y < Math.min(h, by + s); y++) {
        for (let x = bx; x < Math.min(w, bx + s); x++) {
          const i = (y * w + x) * 4;
          out[i] = src[0];
          out[i + 1] = src[1];
          out[i + 2] = src[2];
          out[i + 3] = src[3];
        }
      }
    }
  }
  return out;
}

export function quantizeCel(
  cel: Uint8ClampedArray,
  w: number,
  h: number,
  colors: string[],
  dither: DitherMethod,
): Uint8ClampedArray {
  return applyPalette(cel, w, h, colors, dither);
}

export function mirrorPixels(
  cel: Uint8ClampedArray,
  w: number,
  h: number,
  axis: 'horizontal' | 'vertical',
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(cel.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = axis === 'horizontal' ? w - 1 - x : x;
      const sy = axis === 'vertical' ? h - 1 - y : y;
      const si = (sy * w + sx) * 4;
      const di = (y * w + x) * 4;
      out[di] = cel[si];
      out[di + 1] = cel[si + 1];
      out[di + 2] = cel[si + 2];
      out[di + 3] = cel[si + 3];
    }
  }
  return out;
}
