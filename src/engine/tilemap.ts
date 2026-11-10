/** Tileset helpers: deterministic starter tiles built from a palette. */

import type { Tile, TilemapDoc } from '../types';
import { hexToRgb, rgbToHsl } from './color';
import { createCel, setPixelRaw } from './pixel';
import { mulberry32 } from './procedural';

const FALLBACK = ['#1d2a1a', '#2f4229', '#46603a', '#6b7f4a', '#93986a', '#c2b183', '#8c6b45', '#3a2a1c'];

function rampFrom(colors: string[]): string[] {
  const list = colors.length >= 6 ? colors : FALLBACK;
  return [...list].sort((a, b) => {
    const [ar, ag, ab] = hexToRgb(a);
    const [br, bg, bb] = hexToRgb(b);
    return 0.2126 * ar + 0.7152 * ag + 0.0722 * ab - (0.2126 * br + 0.7152 * bg + 0.0722 * bb);
  });
}

function tileId(name: string): string {
  return `tile-${name.toLowerCase().replace(/\s+/g, '-')}-${Math.random().toString(36).slice(2, 6)}`;
}

function makeTile(name: string, size: number, draw: (x: number, y: number, rand: () => number) => [number, number, number, number] | null): Tile {
  const pixels = createCel(size, size);
  const rand = mulberry32(name.length * 7919 + size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const color = draw(x, y, rand);
      if (color) setPixelRaw(pixels, size, size, x, y, color);
    }
  }
  return { id: tileId(name), name, pixels };
}

function rgb(hex: string, alpha = 255): [number, number, number, number] {
  const [r, g, b] = hexToRgb(hex);
  return [r, g, b, alpha];
}

function pick(ramp: string[], t: number, alpha = 255): [number, number, number, number] {
  const clamped = Math.max(0, Math.min(1, t));
  return rgb(ramp[Math.min(ramp.length - 1, Math.floor(clamped * ramp.length))], alpha);
}

function greenRamp(ramp: string[]): string[] {
  const greens = ramp.filter((c) => {
    const [r, g, b] = hexToRgb(c);
    const [h, s] = rgbToHsl(r, g, b);
    const deg = h * 360;
    return s > 0.12 && deg > 60 && deg < 170;
  });
  return greens.length >= 3 ? [...greens].sort((a, b) => {
    const [ar, ag, ab] = hexToRgb(a);
    const [br, bg, bb] = hexToRgb(b);
    return 0.2 * ar + 0.7 * ag + 0.1 * ab - (0.2 * br + 0.7 * bg + 0.1 * bb);
  }) : ramp;
}

/** Flattens the placed cells of a tilemap into one RGBA pixel buffer. */
export function composeTilemap(doc: TilemapDoc): Uint8ClampedArray {
  const { tileSize, cols, rows, tiles, cells } = doc;
  const width = cols * tileSize;
  const height = rows * tileSize;
  const out = new Uint8ClampedArray(width * height * 4);
  const byId = new Map(tiles.map((t) => [t.id, t]));
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const id = cells[cy * cols + cx];
      if (!id) continue;
      const tile = byId.get(id);
      if (!tile) continue;
      for (let y = 0; y < tileSize; y++) {
        const srcRow = y * tileSize * 4;
        const dstRow = ((cy * tileSize + y) * width + cx * tileSize) * 4;
        out.set(tile.pixels.subarray(srcRow, srcRow + tileSize * 4), dstRow);
      }
    }
  }
  return out;
}

export function createTilemap(tileSize: number, cols: number, rows: number, colors: string[]): TilemapDoc {
  const ramp = rampFrom(colors);
  const tiles = starterTiles(tileSize, ramp);
  const cells = new Array(cols * rows).fill(null) as (string | null)[];
  return { tileSize, cols, rows, tiles, cells };
}

function starterTiles(size: number, ramp: string[]): Tile[] {
  const grass = greenRamp(ramp);
  const grassBase = pick(grass, 0.55);
  const grassDark = pick(grass, 0.3);
  const grassLight = pick(grass, 0.8);

  const grassTile = makeTile('Grass', size, (_x, y, rand) => {
    const n = rand();
    if (n < 0.07) return grassDark;
    if (n > 0.94) return grassLight;
    if (y >= size - 2 && n < 0.4) return grassDark;
    return grassBase;
  });

  const dirtTile = makeTile('Dirt', size, (_x, y, rand) => {
    const n = rand();
    const base = pick(ramp, 0.42);
    if (n < 0.08) return pick(ramp, 0.25);
    if (n > 0.92) return pick(ramp, 0.62);
    if (y % 4 === 0 && n < 0.5) return pick(ramp, 0.35);
    return base;
  });

  const stoneTile = makeTile('Stone', size, (x, y, rand) => {
    const bx = Math.floor(x / Math.max(3, size / 4));
    const by = Math.floor(y / Math.max(3, size / 4));
    const mortar = x % Math.max(3, size / 4) === 0 || y % Math.max(3, size / 4) === 0;
    if (mortar) return pick(ramp, 0.3);
    const shade = (bx * 3 + by * 5) % 3;
    if (y % Math.max(3, size / 4) === 1) return pick(ramp, 0.72);
    if (rand() < 0.05) return pick(ramp, 0.62);
    return pick(ramp, 0.48 + shade * 0.06);
  });

  const waterTile = makeTile('Water', size, (x, y) => {
    const wave = Math.sin((x / size) * Math.PI * 2) * 0.5 + 0.5;
    const band = Math.sin((y / size) * Math.PI * 3 + wave) * 0.5 + 0.5;
    const t = 0.35 + band * 0.35;
    const color = pick(ramp, t);
    if (band > 0.92) return pick(ramp, 0.85);
    return color;
  });

  const sandTile = makeTile('Sand', size, (_x, _y, rand) => {
    const n = rand();
    if (n < 0.06) return pick(ramp, 0.35);
    if (n > 0.95) return pick(ramp, 0.85);
    return pick(ramp, 0.62);
  });

  const brickTile = makeTile('Brick', size, (x, y) => {
    const row = Math.floor(y / Math.max(3, size / 4));
    const offset = row % 2 === 0 ? 0 : Math.floor(size / 6);
    const bw = Math.max(4, Math.floor(size / 3));
    const isMortar = y % Math.max(3, size / 4) === 0 || (x + offset) % bw === 0;
    if (isMortar) return pick(ramp, 0.28);
    return pick(ramp, y % Math.max(3, size / 4) === 1 ? 0.66 : 0.5);
  });

  return [grassTile, dirtTile, stoneTile, waterTile, sandTile, brickTile];
}

export interface TiledMapOptions {
  /** File name of the tileset image the map references, e.g. `forest-tileset.png`. */
  image: string;
  /** Tileset name written into the map; defaults to `pixelarium`. */
  name?: string;
  /** Layer name; defaults to `Tilemap`. */
  layer?: string;
}

/**
 * A Tiled JSON map (`.tmj`) that actually opens in Tiled.
 *
 * Tiled requires `type: "map"`, `orientation`, `renderorder`, `version` and the tile size at map
 * level, and `type: "tilelayer"` plus `id`/`x`/`y`/`opacity`/`visible` on the layer. Empty cells are
 * GID 0; tile 0 in the tileset is GID 1, which is why the index is offset by one.
 */
export function toTiledMap(map: TilemapDoc, options: TiledMapOptions) {
  const { tileSize, cols, rows, tiles, cells } = map;
  const gids = cells.map((id) => (id ? tiles.findIndex((tile) => tile.id === id) + 1 : 0));
  return {
    compressionlevel: -1,
    height: rows,
    infinite: false,
    layers: [
      {
        data: gids,
        height: rows,
        id: 1,
        name: options.layer ?? 'Tilemap',
        opacity: 1,
        type: 'tilelayer' as const,
        visible: true,
        width: cols,
        x: 0,
        y: 0,
      },
    ],
    nextlayerid: 2,
    nextobjectid: 1,
    orientation: 'orthogonal' as const,
    renderorder: 'right-down' as const,
    tiledversion: '1.11.0',
    tileheight: tileSize,
    tilesets: [
      {
        columns: tiles.length,
        firstgid: 1,
        image: options.image,
        imageheight: tileSize,
        imagewidth: tileSize * tiles.length,
        margin: 0,
        name: options.name ?? 'pixelarium',
        spacing: 0,
        tilecount: tiles.length,
        tileheight: tileSize,
        tilewidth: tileSize,
      },
    ],
    tilewidth: tileSize,
    type: 'map' as const,
    version: '1.10',
    width: cols,
  };
}

/** Adds the remaining decorative starter tiles to an existing tileset. */
export function addStarterTiles(map: TilemapDoc, colors: string[]): { tiles: Tile[]; cells: (string | null)[] } {
  const ramp = rampFrom(colors);
  const grass = greenRamp(ramp);
  const size = map.tileSize;

  const path = makeTile('Path', size, (_x, _y, rand) => {
    const n = rand();
    if (n < 0.12) return pick(ramp, 0.35);
    if (n > 0.9) return pick(ramp, 0.7);
    return pick(ramp, 0.52);
  });
  const canopy = makeTile('Canopy', size, (_x, _y, rand) => {
    const n = rand();
    if (n < 0.4) return pick(grass, 0.25);
    if (n < 0.75) return pick(grass, 0.45);
    if (n < 0.93) return pick(grass, 0.65);
    return pick(grass, 0.9);
  });
  const flowers = makeTile('Flowers', size, (_x, _y, rand) => {
    const n = rand();
    if (n > 0.965) return pick(ramp, 0.95);
    if (n > 0.9) return pick(grass, 0.85);
    if (n < 0.08) return pick(grass, 0.3);
    return pick(grass, 0.55);
  });
  const planks = makeTile('Planks', size, (x, y) => {
    const band = Math.floor(y / Math.max(2, size / 6));
    if (y % Math.max(2, size / 6) === 0) return pick(ramp, 0.3);
    if (x % Math.max(5, size / 2) === 0) return pick(ramp, 0.34);
    return pick(ramp, band % 2 === 0 ? 0.58 : 0.5);
  });
  const gravel = makeTile('Gravel', size, (_x, _y, rand) => {
    const n = rand();
    if (n < 0.2) return pick(ramp, 0.3);
    if (n < 0.45) return pick(ramp, 0.45);
    if (n < 0.8) return pick(ramp, 0.58);
    return pick(ramp, 0.72);
  });
  const dark = makeTile('Deep water', size, (x, y) => {
    const wave = Math.sin((x / size) * Math.PI * 2 + y * 0.4) * 0.5 + 0.5;
    return pick(ramp, 0.15 + wave * 0.15);
  });

  return { tiles: [path, canopy, flowers, planks, gravel, dark], cells: map.cells };
}
