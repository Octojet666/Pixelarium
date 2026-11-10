/** Project/document factories and the demo artwork that ships with Pixelarium. */

import type { Frame, Layer, Palette, ProjectDoc, RGBA } from '../types';
import { BUILTIN_PALETTES } from './palettes';
import { createCel, paintPixel, setPixelRaw } from './pixel';
import { mulberry32 } from './procedural';

export function uid(prefix = 'id'): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`;
}

export function createLayer(name: string, patch: Partial<Layer> = {}): Layer {
  return {
    id: uid('layer'),
    name,
    visible: true,
    locked: false,
    opacity: 255,
    blend: 'normal',
    ...patch,
  };
}

export function createFrame(layerIds: string[], width: number, height: number, duration = 120): Frame {
  const cels: Record<string, Uint8ClampedArray> = {};
  for (const id of layerIds) cels[id] = createCel(width, height);
  return { id: uid('frame'), duration, cels };
}

export interface NewProjectOptions {
  name?: string;
  width: number;
  height: number;
  palettes?: Palette[];
  paletteId?: string;
  author?: string;
}

export function createProject(opts: NewProjectOptions): ProjectDoc {
  const palettes = (opts.palettes ?? BUILTIN_PALETTES).map((p) => ({ ...p, colors: [...p.colors] }));
  const layer = createLayer('Layer 1');
  const frame = createFrame([layer.id], opts.width, opts.height, 120);
  const now = Date.now();
  return {
    id: uid('doc'),
    name: opts.name ?? 'Untitled project',
    width: opts.width,
    height: opts.height,
    layers: [layer],
    frames: [frame],
    palettes,
    activePaletteId: opts.paletteId ?? palettes[0]?.id ?? '',
    primary: '#f2e9ff',
    secondary: '#0b0a1a',
    tags: [],
    meta: {
      createdAt: now,
      updatedAt: now,
      description: '',
      author: opts.author ?? '',
      tags: [],
    },
  };
}

/* ------------------------------------------------------------------ */
/* Demo artwork                                                        */
/* ------------------------------------------------------------------ */

function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function lerpColor(a: string, b: string, t: number): RGBA {
  const [ar, ag, ab] = hexRgb(a);
  const [br, bg, bb] = hexRgb(b);
  return [
    Math.round(ar + (br - ar) * t),
    Math.round(ag + (bg - ag) * t),
    Math.round(ab + (bb - ab) * t),
    255,
  ];
}

function verticalGradient(cel: Uint8ClampedArray, w: number, h: number, stops: string[]): void {
  for (let y = 0; y < h; y++) {
    const t = (y / Math.max(1, h - 1)) * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(t));
    const color = lerpColor(stops[i], stops[i + 1], t - i);
    for (let x = 0; x < w; x++) setPixelRaw(cel, w, h, x, y, color);
  }
}

function disc(cel: Uint8ClampedArray, w: number, h: number, cx: number, cy: number, r: number, color: RGBA): void {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) setPixelRaw(cel, w, h, x, y, color);
    }
  }
}

function peek(cel: Uint8ClampedArray, w: number, h: number, x: number, y: number): RGBA {
  if (x < 0 || y < 0 || x >= w || y >= h) return [0, 0, 0, 0];
  const i = (y * w + x) * 4;
  return [cel[i], cel[i + 1], cel[i + 2], cel[i + 3]];
}

function peakRange(
  cel: Uint8ClampedArray,
  w: number,
  h: number,
  peaks: { x: number; height: number; spread: number }[],
  base: string,
  shade: string,
  rim: string,
): void {
  const heights: number[] = new Array(w).fill(h);
  for (let x = 0; x < w; x++) {
    let top = h;
    for (const p of peaks) {
      const d = Math.abs(x - p.x);
      if (d > p.spread) continue;
      const t = 1 - d / p.spread;
      const y = h - 6 - Math.round(p.height * Math.sin((t * Math.PI) / 2) ** 1.35);
      if (y < top) top = y;
    }
    heights[x] = top;
  }
  for (let x = 0; x < w; x++) {
    const top = heights[x];
    const slope = (heights[Math.min(w - 1, x + 1)] ?? top) - (heights[Math.max(0, x - 1)] ?? top);
    for (let y = top; y < h; y++) {
      const isRim = y < top + 1;
      const color = hexRgb(isRim ? rim : slope > 0 ? shade : base);
      paintPixel(cel, w, h, x, y, [color[0], color[1], color[2], 255], 1, false);
    }
  }
}

function cloudBand(cel: Uint8ClampedArray, w: number, h: number, seed: number, offset: number, color: string): void {
  const rand = mulberry32(seed);
  const blobs = 4 + Math.floor(rand() * 3);
  for (let b = 0; b < blobs; b++) {
    const cx = (rand() * w + offset) % w;
    const cy = h * (0.42 + rand() * 0.14);
    const rx = w * (0.08 + rand() * 0.12);
    const ry = 1 + rand() * 2.2;
    for (let y = Math.round(cy - ry); y <= Math.round(cy + ry); y++) {
      for (let x = Math.round(cx - rx); x <= Math.round(cx + rx); x++) {
        const nx = (x - cx) / rx;
        const ny = (y - cy) / ry;
        if (nx * nx + ny * ny > 1) continue;
        const sx = ((x % w) + w) % w;
        const c = hexRgb(color);
        paintPixel(cel, w, h, sx, y, [c[0], c[1], c[2], 255], 0.85, false);
      }
    }
  }
}

function duskPeaks(width = 64, height = 64): ProjectDoc {
  const ember = BUILTIN_PALETTES.find((p) => p.id === 'ember-forge')!;
  const layers: Layer[] = [
    createLayer('Sky'),
    createLayer('Stars'),
    createLayer('Sun'),
    createLayer('Far peaks'),
    createLayer('Near peaks'),
    createLayer('Clouds'),
  ];
  const frames: Frame[] = [];
  for (let f = 0; f < 4; f++) {
    const frame = createFrame(layers.map((l) => l.id), width, height, 260);
    const [sky, stars, sun, far, near, clouds] = layers.map((l) => frame.cels[l.id]);

    verticalGradient(sky, width, height, ['#0d0908', '#1e1310', '#542b1e', '#a85326']);
    for (let y = Math.round(height * 0.42); y < height; y++) {
      const warmth = 0.18 * (1 - (y - height * 0.42) / (height * 0.58));
      for (let x = 0; x < width; x++) {
        const warm = hexRgb('#7d3a20');
        const base = peek(sky, width, height, x, y);
        setPixelRaw(sky, width, height, x, y, [
          Math.round(base[0] + (warm[0] - base[0]) * warmth),
          Math.round(base[1] + (warm[1] - base[1]) * warmth),
          Math.round(base[2] + (warm[2] - base[2]) * warmth),
          255,
        ]);
      }
    }

    const rand = mulberry32(1337);
    for (let i = 0; i < 46; i++) {
      const x = Math.floor(rand() * width);
      const y = Math.floor(rand() * height * 0.35);
      const c = hexRgb(i % 7 === 0 ? '#fff1c9' : '#c2b183');
      setPixelRaw(stars, width, height, x, y, [c[0], c[1], c[2], 200]);
    }

    const sunX = 43;
    const sunY = 30;
    disc(sun, width, height, sunX, sunY, 7, [209, 120, 44, 255]);
    disc(sun, width, height, sunX, sunY, 5, [237, 163, 60, 255]);
    disc(sun, width, height, sunX, sunY, 3, [255, 209, 102, 255]);
    disc(sun, width, height, sunX - 1, sunY - 1, 1.4, [255, 241, 201, 255]);

    peakRange(
      far,
      width,
      height,
      [
        { x: 8, height: 26, spread: 18 },
        { x: 26, height: 18, spread: 14 },
        { x: 52, height: 22, spread: 20 },
      ],
      '#542b1e',
      '#7d3a20',
      '#a85326',
    );
    peakRange(
      near,
      width,
      height,
      [
        { x: 18, height: 30, spread: 22 },
        { x: 44, height: 24, spread: 24 },
        { x: 62, height: 14, spread: 12 },
      ],
      '#1e1310',
      '#36201a',
      '#7d3a20',
    );
    cloudBand(clouds, width, height, 777, f * 7, '#a85326');
    cloudBand(clouds, width, height, 991, f * 11, '#d1782c');

    frames.push(frame);
  }
  const now = Date.now();
  return {
    id: uid('doc'),
    name: 'Dusk Peaks — demo',
    width,
    height,
    layers,
    frames,
    palettes: BUILTIN_PALETTES.map((p) => ({ ...p, colors: [...p.colors] })),
    activePaletteId: ember.id,
    primary: '#ffd166',
    secondary: '#1e1310',
    tags: [{ id: 'tag-dusk', name: 'idle', from: 0, to: 3, mode: 'forward', fps: 4 }],
    meta: {
      createdAt: now,
      updatedAt: now,
      description: 'A four-frame dusk study generated with Pixelarium’s sky, peak and cloud tools, then hand-adjusted.',
      author: 'Pixelarium Studio',
      tags: ['landscape', 'demo', 'dusk'],
    },
  };
}

function mossSlime(width = 32, height = 32): ProjectDoc {
  const kingdom = BUILTIN_PALETTES.find((p) => p.id === 'forgotten-kingdom')!;
  const layers = [createLayer('Shadow'), createLayer('Body'), createLayer('Face')];
  const frames: Frame[] = [];
  const bounce = [0, -3, -1, 1];
  for (let f = 0; f < 4; f++) {
    const frame = createFrame(layers.map((l) => l.id), width, height, 140);
    const [shadow, body, face] = layers.map((l) => frame.cels[l.id]);
    const lift = bounce[f];
    const squash = f === 3 ? 1.2 : f === 0 ? 0.9 : 1;
    const cx = width / 2;
    const cy = 24 + lift;
    const rx = 9 * squash;
    const ry = 7 / squash;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        const d = dx * dx + dy * dy;
        if (d > 1) continue;
        const isOutline = d > 0.78;
        const isTop = dy < -0.35 && dx < 0.3;
        const color = isOutline
          ? hexRgb('#10150f')
          : isTop
            ? hexRgb('#93986a')
            : dx > 0.35
              ? hexRgb('#46603a')
              : hexRgb('#6b7f4a');
        setPixelRaw(body, width, height, x, y, [color[0], color[1], color[2], 255]);
      }
    }
    // grounded shadow
    for (let x = 0; x < width; x++) {
      for (let y = 27; y < 30; y++) {
        const dx = (x - cx) / 11;
        const dy = (y - 28.5) / 1.6;
        if (dx * dx + dy * dy <= 1) setPixelRaw(shadow, width, height, x, y, [16, 21, 15, 120]);
      }
    }
    // eyes follow the bounce
    const eyeY = Math.round(cy - 2 + (f === 1 ? -1 : 0));
    for (const ex of [Math.round(cx - 3), Math.round(cx + 3)]) {
      setPixelRaw(face, width, height, ex, eyeY, [223, 228, 210, 255]);
      setPixelRaw(face, width, height, ex, eyeY + 1, [16, 21, 15, 255]);
    }
    setPixelRaw(face, width, height, Math.round(cx - 1), eyeY + 3, [16, 21, 15, 200]);
    setPixelRaw(face, width, height, Math.round(cx), eyeY + 3, [16, 21, 15, 200]);
    frames.push(frame);
  }
  const now = Date.now();
  return {
    id: uid('doc'),
    name: 'Moss Slime — demo',
    width,
    height,
    layers,
    frames,
    palettes: BUILTIN_PALETTES.map((p) => ({ ...p, colors: [...p.colors] })),
    activePaletteId: kingdom.id,
    primary: '#93e86a',
    secondary: '#10150f',
    tags: [{ id: 'tag-bounce', name: 'bounce', from: 0, to: 3, mode: 'pingpong', fps: 8 }],
    meta: {
      createdAt: now,
      updatedAt: now,
      description: 'A four-frame squash-and-stretch idle animation for a forest slime.',
      author: 'Pixelarium Studio',
      tags: ['sprite', 'character', 'demo'],
    },
  };
}

export function createDemoProjects(): ProjectDoc[] {
  return [duskPeaks(), mossSlime()];
}
