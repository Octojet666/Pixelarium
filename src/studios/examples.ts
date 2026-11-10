/**
 * Studio examples.
 *
 * The "What you can make" gallery runs the same engines as the workspaces:
 * `compositeFrame`, `paintGuiTexture`, `composeTilemap`, `applyPalette`,
 * `composeScene` and `blendCels`. Change an engine and the examples follow.
 *
 * The module is DOM-free so it can be tested and rendered anywhere.
 */

import type { ProjectDoc, TilemapDoc } from '../types';
import { compositeFrame, tintPixels } from '../engine/composite';
import { planSheet } from '../engine/assetPack';
import { hexToRgb } from '../engine/color';
import { applyPalette, extractPalette } from '../engine/quantize';
import { blendCels, tweenSteps } from '../engine/tween';
import { addStarterTiles, composeTilemap, createTilemap } from '../engine/tilemap';
import {
  composeScene,
  emptyScene,
  type SceneBackdrop,
  type SceneDoc,
  type SceneFx,
  type SceneProp,
} from '../engine/scene';
import { animationLoop, avatar, characterSheet, emote, iconSet, sticker, weaponSet } from '../engine/templates';
import { emptyLayout } from '../engine/mcGui';
import { defaultTextureOptions, paintGuiTexture } from '../engine/guiTexture';
import type { StudioId } from './registry';

export interface StudioExample {
  id: string;
  studio: StudioId;
  title: string;
  caption: string;
  width: number;
  height: number;
  /** RGBA pixels, one byte per channel - what the studio would export. */
  pixels: Uint8ClampedArray;
  /** Template to start when the example is clicked (an id from that studio's `templates`). */
  templateId?: string;
}

interface Raster {
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
}

function raster(pixels: Uint8ClampedArray, width: number, height: number): Raster {
  return { pixels, width, height };
}

/* ------------------------------------------------------------------ */
/* Pixel helpers                                                       */
/* ------------------------------------------------------------------ */

function frameRaster(doc: ProjectDoc, frameIndex: number): Raster {
  return raster(compositeFrame(doc, frameIndex), doc.width, doc.height);
}

/** Nearest-neighbour upscale, the only kind of scaling pixel art allows. */
function scalePixels(source: Raster, scale: number): Raster {
  if (scale <= 1) return source;
  const { pixels, width, height } = source;
  const out = new Uint8ClampedArray(width * scale * height * scale * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * 4;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const dest = ((y * scale + dy) * width * scale + x * scale + dx) * 4;
          out[dest] = pixels[src];
          out[dest + 1] = pixels[src + 1];
          out[dest + 2] = pixels[src + 2];
          out[dest + 3] = pixels[src + 3];
        }
      }
    }
  }
  return raster(out, width * scale, height * scale);
}

/** Source-over composite of one buffer onto another. */
function over(dest: Uint8ClampedArray, src: Uint8ClampedArray, alphaMul = 1): void {
  for (let i = 0; i < dest.length; i += 4) {
    const a = (src[i + 3] / 255) * alphaMul;
    if (a <= 0) continue;
    const inv = 1 - a;
    dest[i] = Math.round(src[i] * a + dest[i] * inv);
    dest[i + 1] = Math.round(src[i + 1] * a + dest[i + 1] * inv);
    dest[i + 2] = Math.round(src[i + 2] * a + dest[i + 2] * inv);
    dest[i + 3] = Math.round((a + (dest[i + 3] / 255) * inv) * 255);
  }
}

/** Lays cells out in a grid with optional gaps and outer padding. */
function sheet(cells: Raster[], columns: number, gap = 0, padding = 0): Raster {
  const cellW = cells[0]?.width ?? 1;
  const cellH = cells[0]?.height ?? 1;
  const cols = Math.max(1, Math.min(columns, cells.length));
  const rows = Math.max(1, Math.ceil(cells.length / cols));
  const width = padding * 2 + cols * cellW + Math.max(0, cols - 1) * gap;
  const height = padding * 2 + rows * cellH + Math.max(0, rows - 1) * gap;
  const out = new Uint8ClampedArray(width * height * 4);
  cells.forEach((cell, index) => {
    const x = padding + (index % cols) * (cellW + gap);
    const y = padding + Math.floor(index / cols) * (cellH + gap);
    for (let sy = 0; sy < cell.height; sy++) {
      const from = sy * cell.width * 4;
      const to = ((y + sy) * width + x) * 4;
      out.set(cell.pixels.subarray(from, from + cell.width * 4), to);
    }
  });
  return raster(out, width, height);
}

/** The pack export's own layout engine, so the sheet geometry is the real one. */
function packSheet(cells: Raster[], columns: number, padding = 0, spacing = 0): Raster {
  const cellW = cells[0]?.width ?? 1;
  const cellH = cells[0]?.height ?? 1;
  const layout = planSheet(
    cells.map((_, frame) => ({ asset: 0, frame })),
    cellW,
    cellH,
    columns,
    padding,
    spacing,
  );
  const out = new Uint8ClampedArray(layout.width * layout.height * 4);
  layout.rects.forEach((rect, index) => {
    const cell = cells[index];
    for (let sy = 0; sy < cell.height; sy++) {
      const from = sy * cell.width * 4;
      const to = ((rect.y + sy) * layout.width + rect.x) * 4;
      out.set(cell.pixels.subarray(from, from + cell.width * 4), to);
    }
  });
  return raster(out, layout.width, layout.height);
}

/** Stacks buffers vertically, centring each one. */
function stackRows(rows: Raster[], gap = 0): Raster {
  const width = Math.max(...rows.map((row) => row.width));
  const height = rows.reduce((sum, row) => sum + row.height, 0) + gap * Math.max(0, rows.length - 1);
  const out = new Uint8ClampedArray(width * height * 4);
  let y = 0;
  for (const row of rows) {
    const x = Math.floor((width - row.width) / 2);
    for (let sy = 0; sy < row.height; sy++) {
      const from = sy * row.width * 4;
      const to = ((y + sy) * width + x) * 4;
      out.set(row.pixels.subarray(from, from + row.width * 4), to);
    }
    y += row.height + gap;
  }
  return raster(out, width, height);
}

/* ------------------------------------------------------------------ */
/* Sources                                                             */
/* ------------------------------------------------------------------ */

function guiPanel(theme: string, rows: number, title: string): Raster {
  const painted = paintGuiTexture(emptyLayout({ rows, name: 'menu', title }), {
    ...defaultTextureOptions(),
    theme,
  });
  return raster(painted.pixels, painted.width, painted.height);
}

/** A smooth sky with a radial sun glow, used as a continuous dithering source. */
function skySource(width: number, height: number): Raster {
  const out = new Uint8ClampedArray(width * height * 4);
  const sunX = width * 0.34;
  const sunY = height * 0.64;
  const sunR = width * 0.52;
  for (let y = 0; y < height; y++) {
    const ty = height <= 1 ? 0 : y / (height - 1);
    for (let x = 0; x < width; x++) {
      let r = 20 + 200 * ty * ty;
      let g = 12 + 112 * ty ** 1.4;
      let b = 54 + 66 * ty;
      const glow = Math.max(0, 1 - Math.hypot(x - sunX, y - sunY) / sunR) ** 2;
      r = Math.min(255, r + glow * 180);
      g = Math.min(255, g + glow * 132);
      b = Math.min(255, b + glow * 44);
      const i = (y * width + x) * 4;
      out[i] = r;
      out[i + 1] = g;
      out[i + 2] = b;
      out[i + 3] = 255;
    }
  }
  return raster(out, width, height);
}

function swatchRow(colors: string[], cell: number, gap = 2): Raster {
  const width = colors.length * cell + Math.max(0, colors.length - 1) * gap;
  const out = new Uint8ClampedArray(width * cell * 4);
  colors.forEach((hex, index) => {
    const [r, g, b] = hexToRgb(hex);
    for (let y = 0; y < cell; y++) {
      for (let x = 0; x < cell; x++) {
        const i = (y * width + index * (cell + gap) + x) * 4;
        out[i] = r;
        out[i + 1] = g;
        out[i + 2] = b;
        out[i + 3] = 255;
      }
    }
  });
  return raster(out, width, cell);
}

const TERRAIN_COLORS = ['#1d2a1a', '#2f4229', '#46603a', '#6b7f4a', '#93986a', '#c2b183', '#8c6b45', '#3a2a1c'];

type Grid = number[][];

/** Tile indices: 0 grass · 1 dirt · 2 stone · 3 water · 4 sand · 5 brick. */
function terrainGrid(cols: number, rows: number): Grid {
  const grid: Grid = [];
  for (let y = 0; y < rows; y++) {
    const row: number[] = [];
    for (let x = 0; x < cols; x++) {
      const edge = Math.min(x, y, cols - 1 - x, rows - 1 - y);
      row.push(edge === 0 ? 3 : edge === 1 ? 4 : 0);
    }
    grid.push(row);
  }
  // River down the middle, with sand banks.
  const mid = Math.floor(cols / 2);
  for (let y = 2; y < rows - 2; y++) {
    grid[y][mid] = 3;
    if (grid[y][mid - 1] === 0) grid[y][mid - 1] = 4;
    if (grid[y][mid + 1] === 0) grid[y][mid + 1] = 4;
  }
  // A stone path across the lower third.
  for (let x = 1; x < cols - 1; x++) {
    if (grid[rows - 3][x] === 0 || grid[rows - 3][x] === 4) grid[rows - 3][x] = 2;
  }
  // Dirt clearing with a little brick hut.
  for (let y = 2; y < 5; y++) {
    for (let x = 2; x < 6; x++) {
      if (grid[y][x] === 0) grid[y][x] = 1;
    }
  }
  grid[2][3] = 5;
  grid[2][4] = 5;
  grid[3][3] = 5;
  grid[3][4] = 5;
  return grid;
}

/** Indices 6-11 come from `addStarterTiles`: path · canopy · flowers · planks · gravel · deep water. */
function forestGrid(cols: number, rows: number): Grid {
  const shore = Math.max(1, Math.round(cols * 0.3));
  const grid: Grid = [];
  for (let y = 0; y < rows; y++) {
    const row: number[] = [];
    for (let x = 0; x < cols; x++) {
      row.push(x < shore ? 11 : x < shore + 2 ? 10 : 7);
    }
    grid.push(row);
  }
  // A dirt clearing with flowers scattered through the canopy.
  for (let y = 1; y < 3; y++) {
    for (let x = shore + 2; x < Math.min(cols, shore + 5); x++) grid[y][x] = 0;
  }
  for (let y = 3; y < rows - 1; y++) {
    for (let x = shore + 3; x < cols - 1; x += 3) grid[y][x] = 8;
  }
  // A plank pier reaching into the deep water, joined to the clearing by a path.
  const pierRow = Math.floor(rows / 2);
  for (let x = 0; x <= shore + 1; x++) grid[pierRow][x] = 9;
  for (let x = shore; x < cols - 1; x++) grid[pierRow][x] = 6;
  return grid;
}

function buildMap(tileSize: number, grid: Grid, withExtras: boolean): TilemapDoc {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const base = createTilemap(tileSize, cols, rows, TERRAIN_COLORS);
  const tiles = withExtras
    ? [...base.tiles, ...addStarterTiles(base, TERRAIN_COLORS).tiles]
    : base.tiles;
  const cells = base.cells.slice();
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const index = grid[y][x];
      cells[y * cols + x] = index >= 0 && index < tiles.length ? tiles[index].id : null;
    }
  }
  return { ...base, tiles, cells };
}

function mapRaster(map: TilemapDoc): Raster {
  return raster(composeTilemap(map), map.cols * map.tileSize, map.rows * map.tileSize);
}

/** Stages sprite instances on a backdrop and runs the real scene composer. */
function sceneRaster(
  doc: ProjectDoc,
  width: number,
  height: number,
  backdrop: SceneBackdrop,
  fx: SceneFx,
  staged: { frame: number; scale: number; x: number; y: number }[],
): Raster {
  const base = emptyScene(doc, width, height);
  const props: SceneProp[] = staged.map((prop, index) => ({
    id: `prop_${index}`,
    name: doc.name,
    frame: prop.frame,
    x: prop.x,
    y: prop.y,
    scale: prop.scale,
    flipX: false,
    opacity: 100,
  }));
  const scene: SceneDoc = { ...base, backdrop, props, fx };
  return raster(composeScene(doc, scene), scene.width, scene.height);
}

/* ------------------------------------------------------------------ */
/* Example definitions                                                 */
/* ------------------------------------------------------------------ */

function example(
  studio: StudioId,
  id: string,
  title: string,
  caption: string,
  image: Raster,
  templateId?: string,
): StudioExample {
  return {
    id,
    studio,
    title,
    caption,
    width: image.width,
    height: image.height,
    pixels: image.pixels,
    templateId,
  };
}

const DITHER_PALETTE = ['#140c2b', '#33205c', '#6b2f6e', '#b3405f', '#e8784a', '#ffcf8a'];

const BUILDERS: Record<StudioId, () => StudioExample[]> = {
  gui: () => [
    example(
      'gui',
      'gui-shop',
      'Shop menu',
      'Obsidian frame with a title ribbon, 27 recessed slot wells and rivet corners.',
      guiPanel('obsidian', 3, '&8&lSHOP MENU'),
      'gui-3',
    ),
    example(
      'gui',
      'gui-classic',
      'Classic menu',
      'The grey classic theme, closest to the vanilla chest texture.',
      guiPanel('vanilla', 3, '&8&lCLASSIC MENU'),
      'gui-vanilla',
    ),
    example(
      'gui',
      'gui-storage',
      'Storage menu',
      'Oak-framed 54-slot storage menu with flourish corner plates.',
      guiPanel('oak', 6, '&8&lSTORAGE MENU'),
      'gui-6',
    ),
  ],

  game: () => {
    const walk = characterSheet();
    const walkCells = walk.frames.map((_, index) => frameRaster(walk, index));
    const weapons = weaponSet();
    const weaponCells = weapons.frames.map((_, index) => frameRaster(weapons, index));
    return [
      example(
        'game',
        'game-walk',
        'Walk cycle',
        'Four-frame walk cycle with a separate details layer, straight from the template.',
        sheet(walkCells, 4, 3, 3),
        'character',
      ),
      example(
        'game',
        'game-items',
        'Item set',
        'Sword, axe and bow sharing one 32px grid.',
        sheet(weaponCells, 3, 3, 3),
        'weapons',
      ),
      example(
        'game',
        'game-sheet',
        'Sprite sheet',
        'The same frames exported at 2× through the pack layout — two columns with padding and spacing.',
        packSheet(walkCells.map((cell) => scalePixels(cell, 2)), 2, 4, 4),
      ),
    ];
  },

  animation: () => {
    const loop = animationLoop();
    const frames = loop.frames.map((_, index) => frameRaster(loop, index));
    const layerId = loop.layers[0].id;
    const celA = loop.frames[0].cels[layerId];
    const celB = loop.frames[4].cels[layerId];
    const inbetweens = tweenSteps(3, 'easeInOut').map((t) =>
      raster(blendCels(celA, celB, t), loop.width, loop.height),
    );

    // Onion skin, drawn exactly the way the timeline does it: previous pose behind, next in front.
    const stage: Raster = raster(new Uint8ClampedArray(loop.width * loop.height * 4), loop.width, loop.height);
    for (let i = 0; i < stage.pixels.length; i += 4) {
      stage.pixels[i] = 18;
      stage.pixels[i + 1] = 16;
      stage.pixels[i + 2] = 28;
      stage.pixels[i + 3] = 255;
    }
    over(stage.pixels, tintPixels(frames[1].pixels, [255, 96, 96], 0.75, 140));
    over(stage.pixels, tintPixels(frames[3].pixels, [96, 150, 255], 0.75, 140));
    over(stage.pixels, frames[2].pixels);

    return [
      example(
        'animation',
        'animation-loop',
        '8-frame loop',
        'A ready-made looping animation, eight frames on a timeline with a motion tag.',
        sheet(frames, 4, 2, 2),
        'loop-8',
      ),
      example(
        'animation',
        'animation-tween',
        'In-betweens',
        'Two key poses and three frames the tween engine generated between them.',
        sheet([frames[0], ...inbetweens, frames[4]], 3, 3, 3),
      ),
      example(
        'animation',
        'animation-onion',
        'Onion skin',
        'Previous pose ghosted red, next ghosted blue, the current frame on top.',
        scalePixels(stage, 4),
      ),
    ];
  },

  tileset: () => {
    const terrain = buildMap(16, terrainGrid(14, 9), false);
    const tiles = terrain.tiles.map((tile) => raster(tile.pixels, terrain.tileSize, terrain.tileSize));
    const forest = buildMap(32, forestGrid(9, 6), true);
    return [
      example(
        'tileset',
        'tileset-terrain',
        'Terrain map',
        'A 14×9 map stamped from the starter tileset and composed by the same code the workspace exports.',
        mapRaster(terrain),
      ),
      example(
        'tileset',
        'tileset-sheet',
        'Tileset sheet',
        'The six starter tiles at 16px, ready to drop into a Tiled tileset image.',
        scalePixels(sheet(tiles, 6, 1, 2), 2),
      ),
      example(
        'tileset',
        'tileset-forest',
        'Forest map',
        'The 32px set with the decorative tiles: deep water, gravel, canopy, planks and flowers.',
        mapRaster(forest),
      ),
    ];
  },

  icons: () => {
    const small = iconSet(16);
    const large = iconSet(32);
    const smallCells = small.frames.map((_, index) => frameRaster(small, index));
    const largeCells = large.frames.map((_, index) => frameRaster(large, index));
    return [
      example(
        'icons',
        'icons-16',
        'Icon states · 16px',
        'One coin icon across default, hover, pressed and disabled — the four states the studio authors.',
        scalePixels(sheet(smallCells, 2, 2, 2), 3),
        'icon-16',
      ),
      example(
        'icons',
        'icons-32',
        'Icon states · 32px',
        'The same four states at 32px for launchers and menus.',
        sheet(largeCells, 2, 2, 2),
        'icon-32',
      ),
      example(
        'icons',
        'icons-pack',
        'Icon pack sheet',
        'The four states laid out by the pack sheet engine with padding and spacing, as the batch export writes them.',
        packSheet(largeCells, 4, 4, 4),
      ),
    ];
  },

  palettes: () => {
    const source = skySource(120, 68);
    const bayer = raster(
      applyPalette(source.pixels, source.width, source.height, DITHER_PALETTE, 'bayer4', 1),
      source.width,
      source.height,
    );
    const floyd = raster(
      applyPalette(source.pixels, source.width, source.height, DITHER_PALETTE, 'floyd-steinberg', 1),
      source.width,
      source.height,
    );
    const extracted = extractPalette(source.pixels, 8);
    return [
      example(
        'palettes',
        'palettes-bayer',
        'Bayer 4 dither',
        'Ordered 4×4 dithering maps a smooth sky onto six colours — the classic pixel-art look. Run it from the editor’s Dither tab.',
        bayer,
      ),
      example(
        'palettes',
        'palettes-floyd',
        'Floyd–Steinberg',
        'Error diffusion instead of an ordered grid: softer, grainier shading. Also in the editor’s Dither tab.',
        floyd,
      ),
      example(
        'palettes',
        'palettes-extract',
        'Extract palette',
        `Median-cut extraction pulled ${extracted.length} colours straight out of the image above.`,
        stackRows([source, swatchRow(extracted, 12, 3)], 4),
      ),
    ];
  },

  creator: () => {
    const portrait = avatar(64);
    const badge = sticker(64);
    const cheer = emote();
    const emoteCells = cheer.frames.map((_, index) => frameRaster(cheer, index));
    return [
      example(
        'creator',
        'creator-avatar',
        'Avatar',
        'A 64px portrait with a ring background and a face layer, sized for profile pictures.',
        frameRaster(portrait, 0),
        'avatar',
      ),
      example(
        'creator',
        'creator-emote',
        'Chat emote',
        'A four-frame bounce, the size and shape an emote slot wants.',
        sheet(emoteCells, 4, 3, 3),
        'emote-social',
      ),
      example(
        'creator',
        'creator-sticker',
        'Sticker',
        'A rounded badge with a star, ready for a chat pack.',
        frameRaster(badge, 0),
        'sticker',
      ),
    ];
  },

  scene: () => {
    const hero = characterSheet();
    return [
      example(
        'scene',
        'scene-hero',
        'Hero scene',
        'A dithered 16:9 backdrop, a warm key light and a soft vignette behind the hero.',
        sceneRaster(
          hero,
          320,
          180,
          { kind: 'vertical', from: '#141026', to: '#452f5c', dither: true },
          { vignette: 32, light: { x: 208, y: 66, radius: 92, color: '#ffe6a8', strength: 42 } },
          [{ frame: 0, scale: 2, x: 128, y: 58 }],
        ),
        'scene-hero',
      ),
      example(
        'scene',
        'scene-title',
        'Title screen',
        'A radial backdrop and a cool light, with the hero staged large for a title card.',
        sceneRaster(
          hero,
          320,
          180,
          { kind: 'radial', from: '#0b1030', to: '#3a1f5c', dither: true },
          { vignette: 44, light: { x: 160, y: 74, radius: 120, color: '#9fd6ff', strength: 38 } },
          [{ frame: 1, scale: 3, x: 112, y: 42 }],
        ),
      ),
      example(
        'scene',
        'scene-banner',
        'Shop banner',
        'Two instances of the hero staged on a 1:1 banner, each with its own frame and position.',
        sceneRaster(
          hero,
          200,
          200,
          { kind: 'vertical', from: '#2a1220', to: '#5c2440', dither: true },
          { vignette: 22, light: null },
          [
            { frame: 0, scale: 2, x: 34, y: 66 },
            { frame: 2, scale: 2, x: 100, y: 66 },
          ],
        ),
      ),
    ];
  },
};

const CACHE = new Map<StudioId, StudioExample[]>();

/** Exactly three real-engine examples for a studio, built once and reused. */
export function examplesFor(studio: StudioId): StudioExample[] {
  const cached = CACHE.get(studio);
  if (cached) return cached;
  const built = BUILDERS[studio]();
  CACHE.set(studio, built);
  return built;
}
