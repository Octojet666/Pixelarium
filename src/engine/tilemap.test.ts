import { describe, expect, it } from 'vitest';
import { createCel } from './pixel';
import { composeTilemap, toTiledMap } from './tilemap';
import type { TilemapDoc } from '../types';

function demoMap(): TilemapDoc {
  return {
    tileSize: 8,
    cols: 2,
    rows: 2,
    tiles: [
      { id: 'grass', name: 'Grass', pixels: createCel(8, 8) },
      { id: 'stone', name: 'Stone', pixels: createCel(8, 8) },
    ],
    cells: ['grass', 'stone', null, 'grass'],
  };
}

describe('toTiledMap', () => {
  it('writes the map-level fields Tiled requires', () => {
    const map = toTiledMap(demoMap(), { image: 'demo-tileset.png' }) as any;
    expect(map).toMatchObject({
      type: 'map',
      version: '1.10',
      orientation: 'orthogonal',
      renderorder: 'right-down',
      infinite: false,
      width: 2,
      height: 2,
      tilewidth: 8,
      tileheight: 8,
      nextlayerid: 2,
      nextobjectid: 1,
    });
  });

  it('writes a real tile layer', () => {
    const map = toTiledMap(demoMap(), { image: 'demo-tileset.png' }) as any;
    expect(map.layers).toHaveLength(1);
    expect(map.layers[0]).toMatchObject({
      type: 'tilelayer',
      id: 1,
      name: 'Tilemap',
      width: 2,
      height: 2,
      x: 0,
      y: 0,
      opacity: 1,
      visible: true,
    });
  });

  it('maps cells to firstgid-offset GIDs and leaves empty cells at 0', () => {
    const map = toTiledMap(demoMap(), { image: 'demo-tileset.png' }) as any;
    expect(map.layers[0].data).toEqual([1, 2, 0, 1]);
    expect(map.layers[0].data).toHaveLength(4);
  });

  it('describes the tileset image the map references', () => {
    const map = toTiledMap(demoMap(), { image: 'demo-tileset.png', name: 'demo' }) as any;
    expect(map.tilesets[0]).toEqual({
      columns: 2,
      firstgid: 1,
      image: 'demo-tileset.png',
      imageheight: 8,
      imagewidth: 16,
      margin: 0,
      name: 'demo',
      spacing: 0,
      tilecount: 2,
      tileheight: 8,
      tilewidth: 8,
    });
  });
});

describe('composeTilemap', () => {
  it('composes a buffer at map size', () => {
    const pixels = composeTilemap(demoMap());
    expect(pixels).toHaveLength(2 * 8 * 2 * 8 * 4);
  });
});
