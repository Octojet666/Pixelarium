import { describe, expect, it } from 'vitest';
import { createProject } from './document';
import { guiCanvasSize, sampleLayout, emptyLayout, emptySlot } from './mcGui';
import { deserializeProject, serializeProjectToString } from './serialize';
import {
  GUI_THEMES,
  HEADER_GAP,
  HEADER_HEIGHT,
  MAX_PADDING,
  defaultTextureOptions,
  guiTextureFilename,
  paintGuiTexture,
  plainTitle,
  sanitizeTextureOptions,
  slotAtPoint,
  slotRectIn,
  textureMetrics,
  type GuiTextureOptions,
} from './guiTexture';

const opts = (patch: Partial<GuiTextureOptions> = {}): GuiTextureOptions => ({
  ...defaultTextureOptions(),
  ...patch,
});

const pixel = (tex: { pixels: Uint8ClampedArray; width: number }, x: number, y: number) => {
  const i = (y * tex.width + x) * 4;
  return [tex.pixels[i], tex.pixels[i + 1], tex.pixels[i + 2], tex.pixels[i + 3]];
};

describe('texture geometry', () => {
  it('frames the slot grid with padding and an optional header', () => {
    const layout = sampleLayout();
    const framed = textureMetrics(layout.rows, opts({ padding: 6 }));
    expect(framed.width).toBe(9 * 18 + 12);
    expect(framed.height).toBe(3 * 18 + HEADER_HEIGHT + HEADER_GAP + 12);
    expect(framed.slotArea).toEqual({ x: 6, y: 6 + HEADER_HEIGHT + HEADER_GAP, w: 162, h: 54 });

    const bare = textureMetrics(layout.rows, opts({ header: false, padding: 4 }));
    expect(bare.height).toBe(3 * 18 + 8);
    expect(bare.slotArea.y).toBe(4);
  });

  it('clamps the frame thickness', () => {
    expect(textureMetrics(3, opts({ padding: 99 })).padding).toBe(MAX_PADDING);
    expect(textureMetrics(3, opts({ padding: -5 })).padding).toBe(3);
  });

  it('places slots row-major inside the slot area and hit-tests them', () => {
    const metrics = textureMetrics(3, opts());
    const first = slotRectIn(metrics, 0);
    expect(first).toEqual({ x: metrics.slotArea.x, y: metrics.slotArea.y, w: 18, h: 18 });
    expect(slotRectIn(metrics, 10)).toEqual({ x: metrics.slotArea.x + 18, y: metrics.slotArea.y + 18, w: 18, h: 18 });
    expect(slotAtPoint(metrics, first.x + 4, first.y + 4)).toBe(0);
    expect(slotAtPoint(metrics, 1, 1)).toBeNull();
  });

  it('produces larger textures than the project canvas, which is the point of a framed menu', () => {
    const layout = sampleLayout();
    const metrics = textureMetrics(layout.rows, opts());
    const canvas = guiCanvasSize(layout.rows);
    expect(metrics.width).toBeGreaterThan(canvas.width);
    expect(metrics.height).toBeGreaterThan(canvas.height);
  });
});

describe('painting', () => {
  it('draws the frame, face and well in their own colours', () => {
    const layout = sampleLayout();
    const options = opts({ theme: 'oak' });
    const tex = paintGuiTexture(layout, options);
    const theme = GUI_THEMES.find((t) => t.id === 'oak')!;
    const hex = (value: string) => [parseInt(value.slice(1, 3), 16), parseInt(value.slice(3, 5), 16), parseInt(value.slice(5, 7), 16)];

    // Outer edge is the darkest frame line.
    expect(pixel(tex, 0, 0)).toEqual([...hex(theme.frameDark), 255]);
    expect(pixel(tex, tex.width - 1, tex.height - 1)).toEqual([...hex(theme.frameDark), 255]);
    // A well centre is the well colour; the lip above it is darker.
    const slot = slotRectIn(tex.metrics, 0);
    const centre = pixel(tex, slot.x + 9, slot.y + 9);
    expect(centre[0]).toBe(hex(theme.well)[0]);
    expect(pixel(tex, slot.x + 2, slot.y + 1)[0]).toBeLessThanOrEqual(hex(theme.well)[0]);
    // The face between two wells is the face colour.
    const between = pixel(tex, slot.x + 18, slot.y + 9);
    expect(between[0]).toBe(hex(theme.face)[0]);
  });

  it('leaves the face plain when wells are switched off', () => {
    const layout = sampleLayout();
    const tex = paintGuiTexture(layout, opts({ wells: false, grain: false }));
    const slot = slotRectIn(tex.metrics, 4);
    const theme = GUI_THEMES[0];
    const face = parseInt(theme.face.slice(1, 3), 16);
    expect(pixel(tex, slot.x + 9, slot.y + 9)[0]).toBe(face);
  });

  it('keeps the header band distinct from the face', () => {
    const layout = sampleLayout();
    const tex = paintGuiTexture(layout, opts({ theme: 'vanilla' }));
    const theme = GUI_THEMES.find((t) => t.id === 'vanilla')!;
    const headerRow = tex.metrics.padding + 1;
    expect(pixel(tex, tex.width / 2, headerRow)[0]).toBeLessThan(parseInt(theme.face.slice(1, 3), 16));
  });

  it('paints the menu title into the ribbon in the theme text colour', () => {
    const layout = emptyLayout({ rows: 3, title: '&8&lMarketplace' });
    const options = opts({ theme: 'arcane' });
    const tex = paintGuiTexture(layout, options);
    const theme = GUI_THEMES.find((t) => t.id === 'arcane')!;
    const text = [parseInt(theme.headerText.slice(1, 3), 16), parseInt(theme.headerText.slice(3, 5), 16), parseInt(theme.headerText.slice(5, 7), 16)];
    let hits = 0;
    const top = tex.metrics.padding;
    for (let y = top; y < top + HEADER_HEIGHT; y++) {
      for (let x = 0; x < tex.width; x++) {
        const px = pixel(tex, x, y);
        if (px[0] === text[0] && px[1] === text[1] && px[2] === text[2]) hits++;
      }
    }
    expect(hits).toBeGreaterThan(20);
    expect(plainTitle(layout.title)).toBe('Marketplace');
  });

  it('is deterministic, so a saved theme always repaints the same texture', () => {
    const layout = sampleLayout();
    const a = paintGuiTexture(layout, opts());
    const b = paintGuiTexture(layout, opts());
    expect(Array.from(a.pixels)).toEqual(Array.from(b.pixels));
  });

  it('changes the picture when the theme changes, and honours an accent override', () => {
    const layout = sampleLayout();
    const oak = paintGuiTexture(layout, opts({ theme: 'oak' }));
    const frost = paintGuiTexture(layout, opts({ theme: 'frost' }));
    expect(pixel(oak, 0, 0)).not.toEqual(pixel(frost, 0, 0));

    const red = paintGuiTexture(layout, opts({ theme: 'oak', accent: '#ff0000' }));
    let reds = 0;
    for (let i = 0; i < red.pixels.length; i += 4) {
      if (red.pixels[i] > 200 && red.pixels[i + 1] < 60 && red.pixels[i + 2] < 60) reds++;
    }
    expect(reds).toBeGreaterThan(10);
  });

  it('paints every row of a six-row menu inside the canvas', () => {
    const layout = emptyLayout({ rows: 6, slots: [emptySlot(53)] });
    const tex = paintGuiTexture(layout, opts({ theme: 'emerald' }));
    expect(tex.height).toBe(6 * 18 + HEADER_HEIGHT + HEADER_GAP + 12);
    const last = slotRectIn(tex.metrics, 53);
    expect(last.y + last.h).toBeLessThanOrEqual(tex.height - tex.metrics.padding);
    const theme = GUI_THEMES.find((t) => t.id === 'emerald')!;
    expect(pixel(tex, last.x + 9, last.y + 9)[0]).toBe(parseInt(theme.well.slice(1, 3), 16));
  });
});

describe('options and naming', () => {
  it('repairs broken saved options', () => {
    const repaired = sanitizeTextureOptions({ theme: 'nope', padding: 400, accent: 'red', header: false });
    expect(repaired.theme).toBe('oak');
    expect(repaired.padding).toBe(MAX_PADDING);
    expect(repaired.accent).toBe('');
    expect(repaired.header).toBe(false);

    const defaults = sanitizeTextureOptions(null);
    expect(defaults).toEqual(defaultTextureOptions());
  });

  it('gives every theme the colours it needs to paint', () => {
    for (const theme of GUI_THEMES) {
      for (const key of ['frame', 'frameLight', 'frameDark', 'face', 'faceLight', 'faceDark', 'header', 'headerText', 'accent'] as const) {
        expect(theme[key]).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });

  it('round-trips through a .pxl file and repairs an unknown saved theme', () => {
    const doc = createProject({ name: 'Menu', width: 174, height: 82 });
    doc.guiTexture = { ...defaultTextureOptions(), theme: 'frost', accent: '#123456', padding: 9 };
    const restored = deserializeProject(JSON.parse(serializeProjectToString(doc)));
    expect(restored.guiTexture).toEqual(doc.guiTexture);

    const file = JSON.parse(serializeProjectToString(doc));
    const broken = deserializeProject({
      ...file,
      document: { ...file.document, guiTexture: { theme: 'minecraft', padding: 999, accent: 'gold' } },
    });
    expect(broken.guiTexture?.theme).toBe('oak');
    expect(broken.guiTexture?.padding).toBe(MAX_PADDING);
    expect(broken.guiTexture?.accent).toBe('');
  });

  it('builds a filesystem-safe texture name', () => {
    const layout = emptyLayout({ name: 'Shop & Menu!', namespace: 'my_server' });
    expect(guiTextureFilename(layout)).toBe('my_server_shop_menu_gui');
  });
});
