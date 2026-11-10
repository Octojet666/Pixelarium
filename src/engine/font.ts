/** A hand-authored 5x7 bitmap font used by the text tool and pixel-art labels. */

import type { RGBA } from '../types';
import { type DirtyBounds, emptyBounds, growBounds, paintPixel } from './pixel';

const RAW: Record<string, string> = {
  A: '.###.|#...#|#...#|#####|#...#|#...#|#...#',
  B: '####.|#...#|#...#|####.|#...#|#...#|####.',
  C: '.###.|#...#|#....|#....|#....|#...#|.###.',
  D: '####.|#...#|#...#|#...#|#...#|#...#|####.',
  E: '#####|#....|#....|####.|#....|#....|#####',
  F: '#####|#....|#....|####.|#....|#....|#....',
  G: '.###.|#...#|#....|#.###|#...#|#...#|.###.',
  H: '#...#|#...#|#...#|#####|#...#|#...#|#...#',
  I: '#####|..#..|..#..|..#..|..#..|..#..|#####',
  J: '..###|...#.|...#.|...#.|...#.|#..#.|.##..',
  K: '#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#',
  L: '#....|#....|#....|#....|#....|#....|#####',
  M: '#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#',
  N: '#...#|##..#|#.#.#|#..##|#...#|#...#|#...#',
  O: '.###.|#...#|#...#|#...#|#...#|#...#|.###.',
  P: '####.|#...#|#...#|####.|#....|#....|#....',
  Q: '.###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#',
  R: '####.|#...#|#...#|####.|#.#..|#..#.|#...#',
  S: '.####|#....|#....|.###.|....#|....#|####.',
  T: '#####|..#..|..#..|..#..|..#..|..#..|..#..',
  U: '#...#|#...#|#...#|#...#|#...#|#...#|.###.',
  V: '#...#|#...#|#...#|#...#|#...#|.#.#.|..#..',
  W: '#...#|#...#|#...#|#.#.#|#.#.#|##.##|#...#',
  X: '#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#',
  Y: '#...#|#...#|.#.#.|..#..|..#..|..#..|..#..',
  Z: '#####|....#|...#.|..#..|.#...|#....|#####',
  '0': '.###.|#...#|#..##|#.#.#|##..#|#...#|.###.',
  '1': '..#..|.##..|..#..|..#..|..#..|..#..|.###.',
  '2': '.###.|#...#|....#|...#.|..#..|.#...|#####',
  '3': '#####|...#.|..#..|...#.|....#|#...#|.###.',
  '4': '...#.|..##.|.#.#.|#..#.|#####|...#.|...#.',
  '5': '#####|#....|####.|....#|....#|#...#|.###.',
  '6': '..##.|.#...|#....|####.|#...#|#...#|.###.',
  '7': '#####|....#|...#.|..#..|.#...|.#...|.#...',
  '8': '.###.|#...#|#...#|.###.|#...#|#...#|.###.',
  '9': '.###.|#...#|#...#|.####|....#|...#.|.##..',
  ' ': '.....|.....|.....|.....|.....|.....|.....',
  '.': '.....|.....|.....|.....|.....|.##..|.##..',
  ',': '.....|.....|.....|.....|.##..|.##..|.#...',
  ':': '.....|.##..|.##..|.....|.##..|.##..|.....',
  ';': '.....|.##..|.##..|.....|.##..|.##..|.#...',
  '!': '..#..|..#..|..#..|..#..|..#..|.....|..#..',
  '?': '.###.|#...#|....#|...#.|..#..|.....|..#..',
  '-': '.....|.....|.....|#####|.....|.....|.....',
  '+': '.....|..#..|..#..|#####|..#..|..#..|.....',
  '/': '....#|....#|...#.|..#..|.#...|#....|#....',
  '\\': '#....|#....|.#...|..#..|...#.|....#|....#',
  "'": '..#..|..#..|.....|.....|.....|.....|.....',
  '"': '.#.#.|.#.#.|.....|.....|.....|.....|.....',
  '(': '...#.|..#..|.#...|.#...|.#...|..#..|...#.',
  ')': '.#...|..#..|...#.|...#.|...#.|..#..|.#...',
  '#': '.#.#.|.#.#.|#####|.#.#.|#####|.#.#.|.#.#.',
  '*': '.....|#.#.#|.###.|#####|.###.|#.#.#|.....',
  '<': '...#.|..#..|.#...|#....|.#...|..#..|...#.',
  '>': '.#...|..#..|...#.|....#|...#.|..#..|.#...',
  '=': '.....|.....|#####|.....|#####|.....|.....',
  _: '.....|.....|.....|.....|.....|.....|#####',
  '&': '.##..|#..#.|.##..|#.#.#|#..#.|#..#.|.##.#',
  '%': '#...#|#..#.|..#..|..#..|.#...|#...#|....#',
  '@': '.###.|#...#|#.###|#.#.#|#.###|#....|.###.',
};

export interface Glyph {
  rows: string[];
  width: number;
}

const GLYPHS = new Map<string, Glyph>();
for (const [ch, raw] of Object.entries(RAW)) {
  const rows = raw.split('|');
  let width = 0;
  for (const row of rows) {
    for (let i = row.length - 1; i >= 0; i--) {
      if (row[i] === '#') {
        width = Math.max(width, i + 1);
        break;
      }
    }
  }
  GLYPHS.set(ch, { rows, width: Math.max(1, width) });
}

export const FONT_HEIGHT = 7;
export const FONT_TRACKING = 1;

export function measureText(text: string, scale = 1): { width: number; height: number } {
  const lines = text.split('\n');
  let width = 0;
  for (const line of lines) {
    let w = 0;
    const chars = [...line];
    chars.forEach((c, i) => {
      const glyph = GLYPHS.get(c.toUpperCase());
      w += (glyph ? glyph.width + FONT_TRACKING : 5) * scale;
      if (i === chars.length - 1) w -= FONT_TRACKING * scale;
    });
    width = Math.max(width, w);
  }
  return { width: Math.max(0, width), height: lines.length * (FONT_HEIGHT + 2) * scale - 2 * scale };
}

/** Stamp text into a cel. Returns the affected bounds (useful for undo). */
export function drawText(
  cel: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  text: string,
  color: RGBA,
  scale = 1,
  coverage = 1,
): DirtyBounds | null {
  const bounds = emptyBounds();
  const lines = text.split('\n');
  let cursorY = Math.round(y);
  for (const line of lines) {
    let cursorX = Math.round(x);
    for (const rawChar of line) {
      const ch = rawChar.toUpperCase();
      const glyph = GLYPHS.get(ch);
      if (!glyph) {
        cursorX += 6 * scale;
        continue;
      }
      glyph.rows.forEach((row, ry) => {
        for (let rx = 0; rx < row.length; rx++) {
          if (row[rx] !== '#') continue;
          for (let sy = 0; sy < scale; sy++) {
            for (let sx = 0; sx < scale; sx++) {
              const px = cursorX + rx * scale + sx;
              const py = cursorY + ry * scale + sy;
              if (paintPixel(cel, width, height, px, py, color, coverage, false)) {
                growBounds(bounds, px, py);
              }
            }
          }
        }
      });
      cursorX += (glyph.width + FONT_TRACKING) * scale;
    }
    cursorY += (FONT_HEIGHT + 2) * scale;
  }
  return bounds.maxX >= bounds.minX ? bounds : null;
}
