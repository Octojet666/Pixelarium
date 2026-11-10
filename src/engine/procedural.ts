/**
 * Deterministic procedural pixel-art generators.
 *
 * Everything is driven by an integer seed so a "randomize" button can be undone by
 * typing the seed back. Results are plain RGBA buffers, so they become normal,
 * fully editable cels.
 */

import type { RGBA } from '../types';
import { hexToRgb } from './color';
import { createCel, paintPixel, setPixelRaw } from './pixel';

export type GeneratorKind =
  | 'terrain'
  | 'mountains'
  | 'clouds'
  | 'trees'
  | 'rocks'
  | 'water'
  | 'grass'
  | 'stars'
  | 'crystals'
  | 'pattern';

export const GENERATORS: { kind: GeneratorKind; label: string; blurb: string }[] = [
  { kind: 'terrain', label: 'Terrain', blurb: 'Rolling hills with layered soil and skyline' },
  { kind: 'mountains', label: 'Mountains', blurb: 'Ridged peaks with slope shading' },
  { kind: 'clouds', label: 'Clouds', blurb: 'Soft fbm cloud banks' },
  { kind: 'trees', label: 'Trees', blurb: 'Recursive branching canopies' },
  { kind: 'rocks', label: 'Rocks', blurb: 'Clustered boulders with facets' },
  { kind: 'water', label: 'Water', blurb: 'Rippled horizontal bands' },
  { kind: 'grass', label: 'Grass', blurb: 'Dense blade clusters' },
  { kind: 'stars', label: 'Stars', blurb: 'Scattered starfield with sparkles' },
  { kind: 'crystals', label: 'Crystals', blurb: 'Angular shards with facet light' },
  { kind: 'pattern', label: 'Pattern', blurb: 'Symmetric decorative weave' },
];

export interface GeneratorParams {
  kind: GeneratorKind;
  seed: number;
  width: number;
  height: number;
  /** 0..1 */
  density: number;
  /** 1..6 */
  complexity: number;
  symmetry: 'none' | 'x' | 'y' | 'xy';
  palette: string[];
}

export interface GeneratorResult {
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
  palette: string[];
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Noise {
  (x: number, y: number): number;
}

function makeNoise(rand: () => number, size: number, scaleY = 1): Noise {
  const grid = new Float32Array(size * size * 3);
  for (let i = 0; i < grid.length; i++) grid[i] = rand();
  const at = (ix: number, iy: number) => grid[(((iy % size) + size) % size) * size + (((ix % size) + size) % size)];
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number) => {
    const fx = x * size;
    const fy = y * size * scaleY;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = smooth(fx - x0);
    const ty = smooth(fy - y0);
    const a = at(x0, y0);
    const b = at(x0 + 1, y0);
    const c = at(x0, y0 + 1);
    const d = at(x0 + 1, y0 + 1);
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  };
}

function rampColor(palette: string[], t: number): RGBA {
  if (palette.length === 0) palette = ['#000000', '#ffffff'];
  const clamped = Math.max(0, Math.min(1, t));
  const idx = Math.min(palette.length - 1, Math.floor(clamped * palette.length));
  const [r, g, b] = hexToRgb(palette[idx]);
  return [r, g, b, 255];
}

function darken(color: RGBA, amount: number): RGBA {
  return [
    Math.round(color[0] * (1 - amount)),
    Math.round(color[1] * (1 - amount)),
    Math.round(color[2] * (1 - amount)),
    color[3],
  ];
}

function lighten(color: RGBA, amount: number): RGBA {
  return [
    Math.round(color[0] + (255 - color[0]) * amount),
    Math.round(color[1] + (255 - color[1]) * amount),
    Math.round(color[2] + (255 - color[2]) * amount),
    color[3],
  ];
}

function fillPolygon(
  cel: Uint8ClampedArray,
  w: number,
  h: number,
  points: [number, number][],
  colorAt: (x: number, y: number) => RGBA,
): void {
  if (points.length < 3) return;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minY = Math.min(minY, p[1]);
    maxY = Math.max(maxY, p[1]);
  }
  for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
    const xs: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
        xs.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
      }
    }
    xs.sort((m, n) => m - n);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x = Math.round(xs[k]); x <= Math.round(xs[k + 1]); x++) {
        setPixelRaw(cel, w, h, x, y, colorAt(x, y));
      }
    }
  }
}

export function generate(params: GeneratorParams): GeneratorResult {
  const { width: w, height: h, palette } = params;
  const cel = createCel(w, h);
  const rand = mulberry32(params.seed || 1);
  const complexity = Math.max(1, Math.min(6, Math.round(params.complexity)));

  switch (params.kind) {
    case 'terrain': {
      const noise = makeNoise(rand, 8);
      const base = h * (0.45 + params.density * 0.3);
      const heights: number[] = [];
      for (let x = 0; x < w; x++) {
        let n = 0;
        let amp = 1;
        let freq = 1;
        let total = 0;
        for (let o = 0; o < complexity; o++) {
          n += noise((x / w) * freq, o * 0.37) * amp;
          total += amp;
          amp *= 0.5;
          freq *= 2;
        }
        heights.push(base - (n / total - 0.5) * h * 0.55);
      }
      for (let x = 0; x < w; x++) {
        const top = Math.round(heights[x]);
        for (let y = 0; y < h; y++) {
          if (y < top) continue;
          const depth = (y - top) / Math.max(1, h - top);
          let color = rampColor(palette, 0.35 + depth * 0.6);
          if (y === top) color = rampColor(palette, 0.85);
          else if (y < top + 2 + complexity) color = rampColor(palette, 0.68);
          if (rand() < 0.03) color = darken(color, 0.18);
          setPixelRaw(cel, w, h, x, y, color);
        }
      }
      break;
    }
    case 'mountains': {
      const noise = makeNoise(rand, 6);
      const heights: number[] = [];
      for (let x = 0; x < w; x++) {
        let n = 0;
        let amp = 1;
        let freq = 1;
        let total = 0;
        for (let o = 0; o < complexity; o++) {
          const v = noise((x / w) * freq + o * 3.1, 0.5 + o * 0.21);
          n += (1 - Math.abs(v * 2 - 1)) * amp;
          total += amp;
          amp *= 0.55;
          freq *= 2;
        }
        heights.push(h * (0.78 - (n / total) * (0.35 + params.density * 0.45)));
      }
      for (let x = 0; x < w; x++) {
        const top = Math.round(heights[x]);
        const slope = (heights[Math.min(w - 1, x + 1)] ?? heights[x]) - (heights[Math.max(0, x - 1)] ?? heights[x]);
        for (let y = Math.max(0, top); y < h; y++) {
          const depth = (y - top) / Math.max(1, h - top);
          let color = rampColor(palette, 0.3 + depth * 0.55);
          if (slope > 0.15) color = lighten(color, 0.16);
          else if (slope < -0.15) color = darken(color, 0.14);
          if (y < top + 2 + complexity && depth < 0.2) color = lighten(color, 0.25);
          if (y === top) color = lighten(color, 0.35);
          if (rand() < 0.04) color = darken(color, 0.12);
          setPixelRaw(cel, w, h, x, y, color);
        }
      }
      break;
    }
    case 'clouds': {
      const noise = makeNoise(rand, 4, 2.2);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          let n = 0;
          let amp = 1;
          let total = 0;
          for (let o = 0; o < complexity; o++) {
            n += noise((x / w) * (1 + o) + o * 1.7, (y / h) * (1 + o * 0.5)) * amp;
            total += amp;
            amp *= 0.5;
          }
          const v = n / total;
          const threshold = 0.58 - params.density * 0.28;
          if (v < threshold) continue;
          const t = Math.min(1, (v - threshold) / (1 - threshold));
          const color = rampColor(palette, 0.55 + t * 0.45);
          setPixelRaw(cel, w, h, x, y, color);
          if (t > 0.65 && y > 1 && rand() < 0.08) setPixelRaw(cel, w, h, x, y - 1, lighten(color, 0.2));
        }
      }
      break;
    }
    case 'trees': {
      const trunkColor = rampColor(palette, 0.35);
      const canopyColors = [rampColor(palette, 0.55), rampColor(palette, 0.7), rampColor(palette, 0.85)];
      const branch = (x: number, y: number, angle: number, len: number, depth: number) => {
        const x2 = x + Math.cos(angle) * len;
        const y2 = y + Math.sin(angle) * len;
        const steps = Math.ceil(len);
        for (let i = 0; i <= steps; i++) {
          const t = i / Math.max(1, steps);
          const px = Math.round(x + (x2 - x) * t);
          const py = Math.round(y + (y2 - y) * t);
          setPixelRaw(cel, w, h, px, py, trunkColor);
        }
        if (depth <= 0) {
          const r = 2 + complexity * 0.8;
          for (let i = 0; i < 10 + complexity * 4; i++) {
            const a = rand() * Math.PI * 2;
            const rr = Math.sqrt(rand()) * r;
            const px = Math.round(x2 + Math.cos(a) * rr);
            const py = Math.round(y2 + Math.sin(a) * rr);
            setPixelRaw(cel, w, h, px, py, canopyColors[Math.floor(rand() * canopyColors.length)]);
          }
          return;
        }
        const spread = 0.4 + params.density * 0.5;
        branch(x2, y2, angle - spread * (0.6 + rand() * 0.6), len * (0.62 + rand() * 0.18), depth - 1);
        branch(x2, y2, angle + spread * (0.6 + rand() * 0.6), len * (0.62 + rand() * 0.18), depth - 1);
      };
      branch(w / 2, h, -Math.PI / 2, h * (0.2 + params.density * 0.12), Math.min(5, complexity));
      break;
    }
    case 'rocks': {
      const count = 2 + Math.round(params.density * 6);
      for (let i = 0; i < count; i++) {
        const cx = rand() * w;
        const cy = h * (0.6 + rand() * 0.35);
        const rx = w * (0.08 + rand() * 0.16) * (0.6 + params.density);
        const ry = rx * (0.55 + rand() * 0.35);
        const base = rampColor(palette, 0.3 + rand() * 0.25);
        const points: [number, number][] = [];
        const sides = 5 + Math.floor(rand() * 4);
        for (let s = 0; s < sides; s++) {
          const a = (s / sides) * Math.PI * 2;
          const jitter = 0.7 + rand() * 0.5;
          points.push([cx + Math.cos(a) * rx * jitter, cy + Math.sin(a) * ry * jitter * 0.75]);
        }
        fillPolygon(cel, w, h, points, (x, y) => {
          const shade = (x - cx) / rx;
          if (y < cy - ry * 0.15) return lighten(base, 0.18 + shade * 0.08);
          if (shade > 0.35) return darken(base, 0.22);
          return base;
        });
        for (let k = 0; k < complexity * 2; k++) {
          const sx = Math.round(cx + (rand() - 0.5) * rx * 1.2);
          const sy = Math.round(cy + (rand() - 0.5) * ry * 1.2);
          setPixelRaw(cel, w, h, sx, sy, darken(base, 0.1));
        }
      }
      break;
    }
    case 'water': {
      const rows = 4 + complexity * 2;
      for (let y = 0; y < h; y++) {
        const depth = y / h;
        for (let x = 0; x < w; x++) {
          const wave = Math.sin((x / w) * Math.PI * 2 * (1 + rows * 0.2) + y * 0.5) * 0.5 + 0.5;
          const band = Math.floor((depth * rows + wave * (0.3 + params.density)) % rows) / rows;
          let color = rampColor(palette, 0.15 + band * 0.7);
          if (wave > 0.92 && rand() < 0.5) color = lighten(color, 0.35);
          setPixelRaw(cel, w, h, x, y, color);
        }
      }
      break;
    }
    case 'grass': {
      const blades = Math.round(params.density * w * 1.6 + 8);
      for (let i = 0; i < blades; i++) {
        const x = Math.round(rand() * (w - 1));
        const len = Math.round((0.15 + rand() * 0.35) * h * (0.5 + params.density));
        const lean = (rand() - 0.5) * 4;
        const color = rampColor(palette, 0.35 + rand() * 0.5);
        for (let k = 0; k < len; k++) {
          const t = k / Math.max(1, len);
          const px = Math.round(x + lean * t * t);
          const py = h - 1 - k;
          setPixelRaw(cel, w, h, px, py, k > len * 0.75 ? lighten(color, 0.12) : color);
        }
      }
      break;
    }
    case 'stars': {
      const count = Math.round(params.density * w * h * 0.03) + 6;
      for (let i = 0; i < count; i++) {
        const x = Math.floor(rand() * w);
        const y = Math.floor(rand() * h);
        const color = rampColor(palette, 0.6 + rand() * 0.4);
        setPixelRaw(cel, w, h, x, y, color);
        if (rand() < 0.08 + params.density * 0.15) {
          const arm = 1 + Math.floor(rand() * (complexity > 3 ? 2 : 1));
          for (let k = 1; k <= arm; k++) {
            setPixelRaw(cel, w, h, x + k, y, darken(color, 0.25));
            setPixelRaw(cel, w, h, x - k, y, darken(color, 0.25));
            setPixelRaw(cel, w, h, x, y + k, darken(color, 0.25));
            setPixelRaw(cel, w, h, x, y - k, darken(color, 0.25));
          }
        }
      }
      break;
    }
    case 'crystals': {
      const shards = 1 + Math.round(params.density * 4);
      for (let i = 0; i < shards; i++) {
        const cx = w * (0.25 + rand() * 0.5);
        const baseY = h * (0.75 + rand() * 0.2);
        const height = h * (0.3 + rand() * 0.5) * (0.6 + params.density * 0.4);
        const width = height * (0.3 + rand() * 0.22);
        const points: [number, number][] = [
          [cx, baseY - height],
          [cx + width, baseY - height * 0.45],
          [cx + width * 0.55, baseY],
          [cx - width * 0.55, baseY],
          [cx - width, baseY - height * 0.45],
        ];
        const base = rampColor(palette, 0.45 + rand() * 0.3);
        fillPolygon(cel, w, h, points, (x) => {
          const t = (x - cx) / width;
          if (t < -0.1) return darken(base, 0.18);
          if (t > 0.2) return lighten(base, 0.18);
          return base;
        });
        for (let k = 0; k < 3; k++) {
          const y = Math.round(baseY - height * (0.35 + k * 0.2));
          setPixelRaw(cel, w, h, Math.round(cx - width * 0.15), y, lighten(base, 0.5));
        }
      }
      break;
    }
    case 'pattern': {
      const cell = Math.max(2, Math.round((4 + complexity) * (1 + params.density)));
      const half = Math.ceil(w / 2);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < half; x++) {
          const gx = Math.floor(x / cell);
          const gy = Math.floor(y / cell);
          const diag = (x + y) % (cell * 2) < cell ? 1 : 0;
          const checker = (gx + gy) % 2;
          const pick = (diag + checker + Math.floor(rand() * 0.5)) % 3;
          const color = rampColor(palette, 0.25 + pick * 0.28);
          setPixelRaw(cel, w, h, x, y, color);
          setPixelRaw(cel, w, h, w - 1 - x, y, color);
        }
      }
      break;
    }
  }

  if (params.symmetry === 'y' || params.symmetry === 'xy') {
    for (let y = 0; y < Math.floor(h / 2); y++) {
      for (let x = 0; x < w; x++) {
        const src = (y * w + x) * 4;
        const dst = ((h - 1 - y) * w + x) * 4;
        cel[dst] = cel[src];
        cel[dst + 1] = cel[src + 1];
        cel[dst + 2] = cel[src + 2];
        cel[dst + 3] = cel[src + 3];
      }
    }
  }

  return { pixels: cel, width: w, height: h, palette };
}

/** Convenience for previewing a generator across its parameter space. */
export function generatorPreset(kind: GeneratorKind): { density: number; complexity: number } {
  switch (kind) {
    case 'terrain':
      return { density: 0.5, complexity: 4 };
    case 'mountains':
      return { density: 0.6, complexity: 4 };
    case 'clouds':
      return { density: 0.45, complexity: 3 };
    case 'trees':
      return { density: 0.55, complexity: 3 };
    case 'rocks':
      return { density: 0.4, complexity: 3 };
    case 'water':
      return { density: 0.5, complexity: 3 };
    case 'grass':
      return { density: 0.6, complexity: 3 };
    case 'stars':
      return { density: 0.5, complexity: 3 };
    case 'crystals':
      return { density: 0.5, complexity: 3 };
    case 'pattern':
      return { density: 0.5, complexity: 3 };
  }
}

/** Fill a cel with a palette color (used by previews). */
export function fillCel(cel: Uint8ClampedArray, w: number, h: number, color: RGBA): void {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) paintPixel(cel, w, h, x, y, color, 1, false);
}
