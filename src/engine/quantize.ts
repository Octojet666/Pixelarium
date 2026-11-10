/** Color quantization (median cut) and dithering used by exports, dithering studio and Palette DNA. */

import type { RGBA } from '../types';
import { hexToRgb } from './color';

export interface ColorStat {
  hex: string;
  count: number;
}

/** Count every distinct opaque color in an RGBA buffer. */
export function colorHistogram(pixels: Uint8ClampedArray): Map<number, number> {
  const map = new Map<number, number>();
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 8) continue;
    const key = (pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2];
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

export function histogramToStats(hist: Map<number, number>): ColorStat[] {
  return [...hist.entries()]
    .map(([key, count]) => ({ hex: `#${key.toString(16).padStart(6, '0')}`, count }))
    .sort((a, b) => b.count - a.count);
}

interface Bucket {
  colors: { r: number; g: number; b: number; n: number }[];
}

function makeBucket(entries: [number, number][]): Bucket {
  return {
    colors: entries.map(([key, n]) => ({
      r: (key >> 16) & 255,
      g: (key >> 8) & 255,
      b: key & 255,
      n,
    })),
  };
}

function bucketRange(b: Bucket): { channel: 'r' | 'g' | 'b'; range: number } {
  let best: 'r' | 'g' | 'b' = 'r';
  let bestRange = -1;
  for (const ch of ['r', 'g', 'b'] as const) {
    let min = 255;
    let max = 0;
    for (const c of b.colors) {
      if (c[ch] < min) min = c[ch];
      if (c[ch] > max) max = c[ch];
    }
    if (max - min > bestRange) {
      bestRange = max - min;
      best = ch;
    }
  }
  return { channel: best, range: bestRange };
}

/** Median-cut quantization. Returns at most `maxColors` hex colors, most common first. */
export function extractPalette(pixels: Uint8ClampedArray, maxColors = 16): string[] {
  const hist = colorHistogram(pixels);
  if (hist.size === 0) return [];
  const entries = [...hist.entries()].sort((a, b) => b[1] - a[1]);
  if (entries.length <= maxColors) return entries.map(([key]) => `#${key.toString(16).padStart(6, '0')}`);

  const buckets: Bucket[] = [makeBucket(entries)];
  while (buckets.length < maxColors) {
    let target = -1;
    let bestScore = 0;
    buckets.forEach((b, i) => {
      if (b.colors.length < 2) return;
      const { range } = bucketRange(b);
      const weight = b.colors.reduce((a, c) => a + c.n, 0);
      const score = range * Math.log2(weight + 1);
      if (score > bestScore) {
        bestScore = score;
        target = i;
      }
    });
    if (target < 0) break;
    const bucket = buckets[target];
    const { channel } = bucketRange(bucket);
    bucket.colors.sort((a, b) => a[channel] - b[channel]);
    const total = bucket.colors.reduce((a, c) => a + c.n, 0);
    let acc = 0;
    let split = 1;
    for (let i = 0; i < bucket.colors.length; i++) {
      acc += bucket.colors[i].n;
      if (acc >= total / 2) {
        split = Math.min(bucket.colors.length - 1, Math.max(1, i + 1));
        break;
      }
    }
    const left = bucket.colors.slice(0, split);
    const right = bucket.colors.slice(split);
    buckets.splice(target, 1, { colors: left }, { colors: right });
  }

  return buckets
    .map((b) => {
      let w = 0;
      let r = 0;
      let g = 0;
      let bl = 0;
      for (const c of b.colors) {
        w += c.n;
        r += c.r * c.n;
        g += c.g * c.n;
        bl += c.b * c.n;
      }
      const toHex = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
      return { hex: `#${toHex(r / w)}${toHex(g / w)}${toHex(bl / w)}`, weight: w };
    })
    .sort((a, b) => b.weight - a.weight)
    .map((c) => c.hex);
}

const paletteCache = new Map<string, [number, number, number][]>();

function paletteRgb(colors: string[]): [number, number, number][] {
  const key = colors.join(',');
  const cached = paletteCache.get(key);
  if (cached) return cached;
  const rgb = colors.map((c) => hexToRgb(c));
  if (paletteCache.size > 64) paletteCache.clear();
  paletteCache.set(key, rgb);
  return rgb;
}

export function nearestPaletteColor(
  colors: string[],
  r: number,
  g: number,
  b: number,
): { index: number; rgb: [number, number, number] } {
  const rgb = paletteRgb(colors);
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < rgb.length; i++) {
    const [pr, pg, pb] = rgb[i];
    const d = (pr - r) ** 2 * 0.3 + (pg - g) ** 2 * 0.59 + (pb - b) ** 2 * 0.11;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return { index: best, rgb: colors.length ? rgb[best] : [r, g, b] };
}

export type DitherMethod = 'none' | 'bayer2' | 'bayer4' | 'bayer8' | 'floyd-steinberg';

const BAYER8 = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
];

function bayerValue(method: DitherMethod, x: number, y: number): number {
  if (method === 'bayer2') return ((x & 1) * 2 + ((x + y) & 1)) / 4 + 0.125;
  if (method === 'bayer4') {
    const m = [
      [0, 8, 2, 10],
      [12, 4, 14, 6],
      [3, 11, 1, 9],
      [15, 7, 13, 5],
    ];
    return (m[y & 3][x & 3] + 0.5) / 16;
  }
  return (BAYER8[y & 7][x & 7] + 0.5) / 64;
}

/**
 * Map every pixel to the palette. Returns new pixel data; alpha is preserved
 * but fully transparent pixels stay untouched.
 */
export function applyPalette(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  colors: string[],
  method: DitherMethod = 'none',
  intensity = 1,
): Uint8ClampedArray {
  if (colors.length === 0) return new Uint8ClampedArray(pixels);
  const out = new Uint8ClampedArray(pixels);
  if (method === 'floyd-steinberg') {
    const err = new Float32Array(width * height * 3);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        if (out[i + 3] < 8) continue;
        const idx = (y * width + x) * 3;
        const r = Math.max(0, Math.min(255, out[i] + err[idx] * intensity));
        const g = Math.max(0, Math.min(255, out[i + 1] + err[idx + 1] * intensity));
        const b = Math.max(0, Math.min(255, out[i + 2] + err[idx + 2] * intensity));
        const { rgb } = nearestPaletteColor(colors, r, g, b);
        const er = r - rgb[0];
        const eg = g - rgb[1];
        const eb = b - rgb[2];
        out[i] = rgb[0];
        out[i + 1] = rgb[1];
        out[i + 2] = rgb[2];
        const spread = (dx: number, dy: number, f: number) => {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= width || ny >= height) return;
          const ni = (ny * width + nx) * 3;
          err[ni] += er * f;
          err[ni + 1] += eg * f;
          err[ni + 2] += eb * f;
        };
        spread(1, 0, 7 / 16);
        spread(-1, 1, 3 / 16);
        spread(0, 1, 5 / 16);
        spread(1, 1, 1 / 16);
      }
    }
    return out;
  }
  const spread = 32 * intensity;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (out[i + 3] < 8) continue;
      let offset = 0;
      if (method !== 'none') offset = (bayerValue(method, x, y) - 0.5) * spread;
      const { rgb } = nearestPaletteColor(colors, out[i] + offset, out[i + 1] + offset, out[i + 2] + offset);
      out[i] = rgb[0];
      out[i + 1] = rgb[1];
      out[i + 2] = rgb[2];
    }
  }
  return out;
}

/** Average color of the opaque pixels, used for thumbnails and backgrounds. */
export function averageColor(pixels: Uint8ClampedArray): RGBA {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 8) continue;
    r += pixels[i];
    g += pixels[i + 1];
    b += pixels[i + 2];
    n++;
  }
  if (n === 0) return [0, 0, 0, 0];
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n), 255];
}
