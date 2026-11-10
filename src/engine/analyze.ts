/**
 * Analysis used by Palette DNA and the Pixel Perfect Assistant.
 * Deterministic, rule-based, no network calls.
 */

import type { RGBA } from '../types';
import { colorDistance, hexToRgb, rgbToHsl, rgbaToHex } from './color';
import { colorHistogram, histogramToStats } from './quantize';

export interface PaletteDnaColor {
  hex: string;
  count: number;
  share: number;
}

export interface PaletteDna {
  totalOpaque: number;
  colors: PaletteDnaColor[];
  uniqueColors: number;
  hueSpread: number;
  families: { name: string; share: number }[];
  contrast: { min: number; max: number; range: number; mean: number };
  saturation: { mean: number; max: number };
  temperature: 'warm' | 'cool' | 'balanced';
}

function familyOf(r: number, g: number, b: number): string {
  const [h, s, l] = rgbToHsl(r, g, b);
  if (l < 0.12) return 'Shadow';
  if (l > 0.9) return 'Highlight';
  if (s < 0.14) return 'Neutral';
  const d = h * 360;
  if (d < 20 || d >= 335) return 'Red';
  if (d < 45) return 'Orange';
  if (d < 70) return 'Yellow';
  if (d < 160) return 'Green';
  if (d < 200) return 'Cyan';
  if (d < 260) return 'Blue';
  if (d < 300) return 'Violet';
  return 'Magenta';
}

export function analyzePixels(pixels: Uint8ClampedArray): PaletteDna {
  const stats = histogramToStats(colorHistogram(pixels));
  const totalOpaque = stats.reduce((a, c) => a + c.count, 0);
  if (totalOpaque === 0) {
    return {
      totalOpaque: 0,
      colors: [],
      uniqueColors: 0,
      hueSpread: 0,
      families: [],
      contrast: { min: 0, max: 0, range: 0, mean: 0 },
      saturation: { mean: 0, max: 0 },
      temperature: 'balanced',
    };
  }
  let minL = 1;
  let maxL = 0;
  let sumL = 0;
  let sumSat = 0;
  let maxSat = 0;
  let warm = 0;
  let cool = 0;
  const families = new Map<string, number>();
  for (const s of stats) {
    const [r, g, b] = hexToRgb(s.hex);
    const [h, sat, l] = rgbToHsl(r, g, b);
    minL = Math.min(minL, l);
    maxL = Math.max(maxL, l);
    sumL += l * s.count;
    sumSat += sat * s.count;
    maxSat = Math.max(maxSat, sat);
    families.set(familyOf(r, g, b), (families.get(familyOf(r, g, b)) ?? 0) + s.count);
    const deg = h * 360;
    if (deg < 90 || deg >= 330) warm += s.count;
    else if (deg >= 150 && deg < 300) cool += s.count;
  }
  const hues = stats.map((s) => {
    const [r, g, b] = hexToRgb(s.hex);
    return Math.round(rgbToHsl(r, g, b)[0] * 360);
  });
  const hueSpread = hues.length > 1 ? Math.max(...hues) - Math.min(...hues) : 0;
  return {
    totalOpaque,
    colors: stats.slice(0, 24).map((s) => ({ hex: s.hex, count: s.count, share: s.count / totalOpaque })),
    uniqueColors: stats.length,
    hueSpread,
    families: [...families.entries()]
      .map(([name, count]) => ({ name, share: count / totalOpaque }))
      .sort((a, b) => b.share - a.share),
    contrast: {
      min: Math.round(minL * 100),
      max: Math.round(maxL * 100),
      range: Math.round((maxL - minL) * 100),
      mean: Math.round((sumL / totalOpaque) * 100),
    },
    saturation: { mean: sumSat / totalOpaque, max: maxSat },
    temperature: warm > cool * 1.3 ? 'warm' : cool > warm * 1.3 ? 'cool' : 'balanced',
  };
}

export type IssueKind =
  | 'isolated-pixel'
  | 'stray-diagonal'
  | 'outline-inconsistency'
  | 'off-palette'
  | 'symmetry-mismatch'
  | 'low-contrast';

export interface AssistantIssue {
  kind: IssueKind;
  severity: 'info' | 'warning' | 'error';
  title: string;
  detail: string;
  count: number;
  points: { x: number; y: number }[];
}

export interface AssistantOptions {
  palette: string[];
  symmetryX: boolean;
  symmetryY: boolean;
  tolerance?: number;
}

/**
 * Rule-based cleanliness checks for the active frame.
 * Issues include the first few offending coordinates so the UI can highlight them.
 */
export function inspectPixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  opts: AssistantOptions,
): AssistantIssue[] {
  const issues: AssistantIssue[] = [];
  const opaque = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    return pixels[(y * width + x) * 4 + 3] > 8;
  };
  const colorAt = (x: number, y: number): RGBA => {
    const i = (y * width + x) * 4;
    return [pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]];
  };

  const isolated: { x: number; y: number }[] = [];
  const diagonal: { x: number; y: number }[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!opaque(x, y)) continue;
      let orth = 0;
      let diag = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          if (!opaque(x + dx, y + dy)) continue;
          if (dx === 0 || dy === 0) orth++;
          else diag++;
        }
      }
      if (orth + diag === 0) isolated.push({ x, y });
      else if (orth === 0 && diag > 0) diagonal.push({ x, y });
    }
  }
  if (isolated.length > 0) {
    issues.push({
      kind: 'isolated-pixel',
      severity: 'warning',
      title: `${isolated.length} isolated pixel${isolated.length === 1 ? '' : 's'}`,
      detail: 'These pixels have no orthogonal neighbours. They usually read as dust or noise at small sizes.',
      count: isolated.length,
      points: isolated.slice(0, 40),
    });
  }
  if (diagonal.length > 0) {
    issues.push({
      kind: 'stray-diagonal',
      severity: 'info',
      title: `${diagonal.length} diagonal-only pixel${diagonal.length === 1 ? '' : 's'}`,
      detail: 'Connected only by a corner. Pixel-art silhouettes often look stronger with an orthogonal link.',
      count: diagonal.length,
      points: diagonal.slice(0, 40),
    });
  }

  // Outline colour consistency: border pixels that sit next to transparency.
  const outlineColors = new Map<string, { count: number; points: { x: number; y: number }[] }>();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!opaque(x, y)) continue;
      const edge = !opaque(x - 1, y) || !opaque(x + 1, y) || !opaque(x, y - 1) || !opaque(x, y + 1);
      if (!edge) continue;
      const hex = rgbaToHex(colorAt(x, y));
      const entry = outlineColors.get(hex) ?? { count: 0, points: [] };
      entry.count++;
      if (entry.points.length < 40) entry.points.push({ x, y });
      outlineColors.set(hex, entry);
    }
  }
  if (outlineColors.size >= 2) {
    const total = [...outlineColors.values()].reduce((a, c) => a + c.count, 0);
    const sorted = [...outlineColors.entries()].sort((a, b) => b[1].count - a[1].count);
    const [mainHex, main] = sorted[0];
    const minority = sorted.slice(1).reduce((a, c) => a + c[1].count, 0);
    if (minority / total > 0.12) {
      issues.push({
        kind: 'outline-inconsistency',
        severity: 'info',
        title: `${outlineColors.size} outline colours in use`,
        detail: `Most edge pixels are ${mainHex.toUpperCase()} (${main.count}), but ${minority} use other colours. Deliberate shading is fine — check for accidental strays.`,
        count: minority,
        points: sorted.slice(1).flatMap(([, v]) => v.points).slice(0, 40),
      });
    }
  }

  if (opts.palette.length > 0) {
    const paletteRgb = opts.palette.map((hex) => hexToRgb(hex));
    const offPalette = new Map<string, { count: number; points: { x: number; y: number }[] }>();
    const tol = opts.tolerance ?? 6;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (!opaque(x, y)) continue;
        const c = colorAt(x, y);
        let nearest = Infinity;
        for (const [r, g, b] of paletteRgb) {
          const d = colorDistance([r, g, b, 255], c);
          if (d < nearest) nearest = d;
        }
        if (nearest <= tol) continue;
        const hex = rgbaToHex(c);
        const entry = offPalette.get(hex) ?? { count: 0, points: [] };
        entry.count++;
        if (entry.points.length < 40) entry.points.push({ x, y });
        offPalette.set(hex, entry);
      }
    }
    if (offPalette.size > 0) {
      const count = [...offPalette.values()].reduce((a, c) => a + c.count, 0);
      issues.push({
        kind: 'off-palette',
        severity: 'warning',
        title: `${offPalette.size} colour${offPalette.size === 1 ? '' : 's'} outside the palette`,
        detail: `${count} pixels do not match any colour in the active palette. Use "Snap to palette" in the palette panel to unify them.`,
        count,
        points: [...offPalette.values()].flatMap((v) => v.points).slice(0, 40),
      });
    }
  }

  if (opts.symmetryX || opts.symmetryY) {
    const mismatch: { x: number; y: number }[] = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (opts.symmetryX && x < width / 2) {
          const mx = width - 1 - x;
          if (opaque(x, y) !== opaque(mx, y)) mismatch.push({ x, y });
        }
        if (opts.symmetryY && y < height / 2) {
          const my = height - 1 - y;
          if (opaque(x, y) !== opaque(x, my)) mismatch.push({ x, y });
        }
      }
    }
    if (mismatch.length > 0) {
      issues.push({
        kind: 'symmetry-mismatch',
        severity: 'info',
        title: `${mismatch.length} pixel${mismatch.length === 1 ? '' : 's'} break symmetry`,
        detail: 'Symmetry guides were used on this frame, but these pixels have no mirrored partner.',
        count: mismatch.length,
        points: mismatch.slice(0, 40),
      });
    }
  }

  const dna = analyzePixels(pixels);
  if (dna.totalOpaque > 0 && dna.contrast.range < 25) {
    issues.push({
      kind: 'low-contrast',
      severity: 'info',
      title: 'Compressed value range',
      detail: `Lightness spans only ${dna.contrast.range}% (min ${dna.contrast.min}%, max ${dna.contrast.max}%). A wider range often reads better at 1x.`,
      count: 0,
      points: [],
    });
  }

  return issues;
}
