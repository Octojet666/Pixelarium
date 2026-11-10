import { describe, expect, it } from 'vitest';
import { createCel, getPixel } from './pixel';
import { drawLine, floodFill, pixelPerfectPath } from './draw';
import { createProject } from './document';
import { deserializeProject, serializeProject, serializeProjectToString } from './serialize';
import { encodeGif } from './gif';
import { parsePaletteText, sortPalette } from './palettes';
import { compositeFrame } from './composite';

const RED = [255, 0, 0, 255] as [number, number, number, number];
const BLUE = [0, 0, 255, 255] as [number, number, number, number];
const CLEAR = [0, 0, 0, 0] as [number, number, number, number];

function counted(cel: Uint8ClampedArray) {
  let n = 0;
  for (let i = 3; i < cel.length; i += 4) if (cel[i] > 0) n++;
  return n;
}

describe('drawing', () => {
  it('draws an inclusive line between two points', () => {
    const cel = createCel(8, 8);
    drawLine(cel, 8, 8, 0, 0, 7, 0, { size: 1, shape: 'square', coverage: 1, erase: false, color: RED });
    expect(counted(cel)).toBe(8);
    expect(getPixel(cel, 8, 0, 0)).toEqual(RED);
    expect(getPixel(cel, 8, 7, 0)).toEqual(RED);
    expect(getPixel(cel, 8, 0, 1)).toEqual(CLEAR);
  });

  it('flood fills only matching connected pixels and respects bounds', () => {
    const cel = createCel(5, 5);
    // Paint a dividing wall down the middle.
    for (let y = 0; y < 5; y++) {
      drawLine(cel, 5, 5, 2, y, 2, y, { size: 1, shape: 'square', coverage: 1, erase: false, color: BLUE });
    }
    const bounds = floodFill(cel, 5, 5, 0, 0, RED, 0, 1);
    expect(bounds).not.toBeNull();
    expect(getPixel(cel, 5, 0, 0)).toEqual(RED);
    expect(getPixel(cel, 5, 4, 4)).toEqual(CLEAR);
    expect(getPixel(cel, 5, 2, 2)).toEqual(BLUE);
  });

  it('pixel-perfect path removes L-shaped double corners', () => {
    const simplified = pixelPerfectPath([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ]);
    expect(simplified).toContainEqual({ x: 0, y: 0 });
    expect(simplified).toContainEqual({ x: 2, y: 1 });
    expect(simplified.length).toBeLessThan(4);
  });
});

describe('project format', () => {
  it('round-trips pixels, layers and frames through .pxl JSON', () => {
    const doc = createProject({ width: 6, height: 4, name: 'Round trip' });
    const cel = doc.frames[0].cels[doc.layers[0].id];
    cel.set([12, 34, 56, 255], 0);
    doc.frames[0].duration = 90;
    doc.tags.push({ id: 'tag-1', name: 'walk', from: 0, to: 0, mode: 'forward' });

    const restored = deserializeProject(serializeProjectToString(doc));
    expect(restored.name).toBe('Round trip');
    expect(restored.width).toBe(6);
    expect(restored.height).toBe(4);
    expect(restored.layers).toHaveLength(1);
    expect(restored.frames).toHaveLength(1);
    expect(restored.frames[0].duration).toBe(90);
    expect(restored.tags[0].name).toBe('walk');
    const restoredCel = restored.frames[0].cels[restored.layers[0].id];
    expect(Array.from(restoredCel.slice(0, 4))).toEqual([12, 34, 56, 255]);
    expect(restoredCel.length).toBe(6 * 4 * 4);
  });

  it('rejects files that are not Pixelarium projects', () => {
    expect(() => deserializeProject('{"hello":"world"}')).toThrow();
    expect(() => deserializeProject(serializeProject(createProject({ width: 2, height: 2 })).document)).toThrow();
  });
});

describe('gif encoder', () => {
  it('produces a valid GIF89a with a trailer and loop extension', () => {
    const doc = createProject({ width: 4, height: 4 });
    const pixels = compositeFrame(doc, 0);
    pixels.set([250, 100, 30, 255], 0);
    const bytes = encodeGif([{ pixels, delayCs: 8 }], { width: 4, height: 4, loop: true });
    const header = String.fromCharCode(...bytes.slice(0, 6));
    expect(header).toBe('GIF89a');
    expect(bytes[bytes.length - 1]).toBe(0x3b);
    const asText = String.fromCharCode(...bytes);
    expect(asText).toContain('NETSCAPE2.0');
    expect(bytes.length).toBeGreaterThan(30);
  });
});

describe('palettes', () => {
  it('parses hex lists and GIMP palettes', () => {
    const hex = parsePaletteText('#112233\n445566\n#778899 extra', 'Mine');
    expect(hex.name).toBe('Mine');
    expect(hex.colors).toEqual(['#112233', '#445566', '#778899']);

    const gpl = parsePaletteText('GIMP Palette\nName: Test\nColumns: 4\n#\n255 0 0 Red\n0 255 0 Green', 'fallback');
    expect(gpl.name).toBe('Test');
    expect(gpl.colors).toEqual(['#ff0000', '#00ff00']);
  });

  it('sorts palettes deterministically by luminance', () => {
    const sorted = sortPalette(['#ffffff', '#000000', '#808080'], 'luminance');
    expect(sorted).toEqual(['#000000', '#808080', '#ffffff']);
  });
});
