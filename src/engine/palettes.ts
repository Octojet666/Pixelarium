/** Curated built-in palettes and palette utilities. */

import type { Palette, RGBA } from '../types';
import { hexToRgb, rgbToHsl, colorDistance } from './color';

export const BUILTIN_PALETTES: Palette[] = [
  {
    id: 'midnight-arcade',
    name: 'Midnight Arcade',
    builtin: true,
    description: 'Deep indigo cabinets, hot neon signage and a single amber coin slot.',
    colors: [
      '#0b0a1a', '#16122e', '#241d4a', '#3a2f6b', '#5b4a9b', '#8a6fd1',
      '#c9a6ff', '#ff5fd2', '#ff9de0', '#38e8ff', '#16a3c9', '#f6c453',
      '#f2e9ff', '#0f0d24',
    ],
  },
  {
    id: 'forgotten-kingdom',
    name: 'Forgotten Kingdom',
    builtin: true,
    description: 'Moss-eaten stone, faded parchment and a banner that outlived its king.',
    colors: [
      '#10150f', '#1d2a1a', '#2f4229', '#46603a', '#6b7f4a', '#93986a',
      '#c2b183', '#e2d3ac', '#8c6b45', '#5a402a', '#3a2a1c', '#b8472f',
      '#6e8c9a', '#dfe4d2',
    ],
  },
  {
    id: 'neon-dreams',
    name: 'Neon Dreams',
    builtin: true,
    description: 'A midnight drive through violet fog with cyan and mint light trails.',
    colors: [
      '#0a0420', '#22063d', '#4a1160', '#8a1f8f', '#d13c94', '#ff6fa5',
      '#ffb3c7', '#59f7ff', '#17c3d9', '#0a6a80', '#2bffb0', '#f5f0ff',
    ],
  },
  {
    id: 'autumn-memory',
    name: 'Autumn Memory',
    builtin: true,
    description: 'Late October: rusted leaves, ochre light and worn wool.',
    colors: [
      '#1b1109', '#2e1d10', '#4a2c15', '#6e3d18', '#94501b', '#bd6a22',
      '#d98f3a', '#e8b866', '#f3daa3', '#fbf0d9', '#5c5a2e', '#7d7a3b',
      '#3f3f2a',
    ],
  },
  {
    id: 'ocean-depths',
    name: 'Ocean Depths',
    builtin: true,
    description: 'Sunlight sinking through cold water into abyssal blue.',
    colors: [
      '#04121f', '#072a3a', '#0b4257', '#0f5f75', '#167d90', '#2aa0ab',
      '#57c6c0', '#97e6d8', '#d6f7ef', '#1b3b6f', '#2d5fa8', '#a9c8f0',
    ],
  },
  {
    id: 'retro-hardware',
    name: 'Retro Hardware',
    builtin: true,
    description: 'Four-shade LCD green, amber phosphor and the grey of a yellowing case.',
    colors: [
      '#0f380f', '#306230', '#8bac0f', '#9bbc0f', '#1a1000', '#3d2a00',
      '#7a5400', '#c78f1b', '#f2c14e', '#4a4843', '#8f8b80', '#d5d2c8',
    ],
  },
  {
    id: 'monochrome-stories',
    name: 'Monochrome Stories',
    builtin: true,
    description: 'Eleven warm greys for inked comics and quiet scenes.',
    colors: [
      '#0e0d0c', '#1c1a18', '#2d2a27', '#403c37', '#56514a', '#6e6861',
      '#8a847b', '#a8a199', '#c6bfb5', '#e6e0d6', '#f7f3ec',
    ],
  },
  {
    id: 'frostbound',
    name: 'Frostbound',
    builtin: true,
    description: 'Ice fields at dawn: pale lilac shadows and a low rose sun.',
    colors: [
      '#0c1220', '#18243a', '#27384f', '#3b556e', '#5c7c93', '#8aa8b8',
      '#c2d7de', '#eaf4f5', '#b9a7c9', '#7a5f8a', '#e8a3a0', '#f6d9c9',
    ],
  },
  {
    id: 'ember-forge',
    name: 'Ember Forge',
    builtin: true,
    description: 'Coal, heated iron and the white-hot moment before the hammer falls.',
    colors: [
      '#0d0908', '#1e1310', '#36201a', '#542b1e', '#7d3a20', '#a85326',
      '#d1782c', '#eda33c', '#ffd166', '#fff1c9', '#2b2b2f', '#555358',
    ],
  },
];

export function paletteFromHexList(name: string, colors: string[]): Palette {
  return {
    id: `pal-${Math.random().toString(36).slice(2, 9)}`,
    name,
    colors: dedupeColors(colors.map(normalizeHex).filter(Boolean)),
  };
}

export function normalizeHex(hex: string): string {
  let h = hex.trim();
  if (!h.startsWith('#')) h = `#${h}`;
  if (h.length === 4) h = `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}`;
  return /^#[0-9a-fA-F]{6}$/.test(h) ? h.toLowerCase() : '';
}

export function dedupeColors(colors: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of colors) {
    if (!seen.has(c)) {
      seen.add(c);
      out.push(c);
    }
  }
  return out;
}

/** Parse plain hex lists, JASC-PAL, and GIMP .gpl palette text. */
export function parsePaletteText(text: string, fallbackName = 'Imported palette'): Palette {
  const nameMatch = text.match(/^Name:\s*(.+)$/im);
  const colors: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith(';')) continue;
    if (/^GIMP Palette$/i.test(line) || /^(Name|Columns|#):/i.test(line)) continue;
    const hexMatches = line.match(/#?[0-9a-fA-F]{6}\b/g);
    if (hexMatches && !/^\d+\s+\d+\s+\d+$/.test(line)) {
      for (const m of hexMatches) {
        const n = normalizeHex(m);
        if (n) colors.push(n);
      }
      continue;
    }
    const rgb = line.match(/^(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})/);
    if (rgb) {
      const toHex = (v: string) => Math.min(255, Number(v)).toString(16).padStart(2, '0');
      colors.push(`#${toHex(rgb[1])}${toHex(rgb[2])}${toHex(rgb[3])}`);
    }
  }
  const paletteName = nameMatch && nameMatch[1] ? nameMatch[1].trim() : '';
  return paletteFromHexList(paletteName || fallbackName, colors);
}

export function paletteToHexText(palette: Palette): string {
  return palette.colors.map((c) => c.toUpperCase()).join('\n');
}

export function sortPalette(colors: string[], mode: 'hue' | 'luminance'): string[] {
  const keyed = colors.map((hex) => {
    const [r, g, b] = hexToRgb(hex);
    const [h, , l] = rgbToHsl(r, g, b);
    return { hex, k: mode === 'hue' ? h + l * 0.001 : l };
  });
  keyed.sort((a, b) => a.k - b.k);
  return keyed.map((k) => k.hex);
}

export function nearestColorIndex(colors: string[], target: RGBA): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < colors.length; i++) {
    const [r, g, b] = hexToRgb(colors[i]);
    const d = colorDistance([r, g, b, 255], target);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** Group a palette into hue families for swatch display. */
export function paletteHueFamily(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  const [h, s, l] = rgbToHsl(r, g, b);
  if (l < 0.12) return 'Shadow';
  if (l > 0.9) return 'Highlight';
  if (s < 0.12) return 'Grey';
  const deg = h * 360;
  if (deg < 20 || deg >= 340) return 'Red';
  if (deg < 45) return 'Orange';
  if (deg < 70) return 'Yellow';
  if (deg < 160) return 'Green';
  if (deg < 200) return 'Cyan';
  if (deg < 260) return 'Blue';
  if (deg < 300) return 'Violet';
  return 'Magenta';
}
