import { describe, expect, it } from 'vitest';
import {
  COLUMNS,
  SLOT_PX,
  emptyLayout,
  emptySlot,
  guiCanvasSize,
  layoutFilename,
  menuSize,
  paintGuiBackground,
  sampleLayout,
  slotOrigin,
  toDeluxeMenusYaml,
  toItemsAdderYaml,
  toOraxenYaml,
  toSlotMapJson,
  validateLayout,
} from './mcGui';

const pixel = (cel: Uint8ClampedArray, width: number, x: number, y: number) => {
  const i = (y * width + x) * 4;
  return [cel[i], cel[i + 1], cel[i + 2], cel[i + 3]];
};

const colors = { panel: '#2b2b33', panelDark: '#1d1d24', well: '#8b8b8b', wellEdge: '#373737', border: '#4a4a55' };

describe('gui layout model', () => {
  it('sizes menus in rows of nine slots and clamps to the server limit', () => {
    expect(menuSize(1)).toBe(9);
    expect(menuSize(3)).toBe(27);
    expect(menuSize(6)).toBe(54);
    expect(menuSize(9)).toBe(54);
    expect(menuSize(0)).toBe(9);
  });

  it('places slot origins inside the one-pixel frame', () => {
    expect(slotOrigin(0)).toEqual({ x: 1, y: 1 });
    expect(slotOrigin(8)).toEqual({ x: 8 * SLOT_PX + 1, y: 1 });
    expect(slotOrigin(9)).toEqual({ x: 1, y: SLOT_PX + 1 });
  });

  it('sizes the canvas so every slot has room', () => {
    expect(guiCanvasSize(3)).toEqual({ width: COLUMNS * SLOT_PX + 2, height: 3 * SLOT_PX + 2 });
  });
});

describe('gui validation', () => {
  it('accepts the sample layout', () => {
    expect(validateLayout(sampleLayout())).toEqual([]);
  });

  it('rejects items outside the menu', () => {
    const layout = emptyLayout({ rows: 1, slots: [emptySlot(27)] });
    expect(validateLayout(layout).some((p) => p.message.includes('outside'))).toBe(true);
  });

  it('rejects two items in one slot', () => {
    const layout = emptyLayout({ slots: [emptySlot(4), emptySlot(4, { material: 'DIAMOND' })] });
    expect(validateLayout(layout).some((p) => p.message.includes('twice'))).toBe(true);
  });

  it('rejects invalid materials and amounts', () => {
    const layout = emptyLayout({
      slots: [emptySlot(0, { material: 'diamond sword' }), emptySlot(1, { amount: 65 })],
    });
    const messages = validateLayout(layout).map((p) => p.message);
    expect(messages.some((m) => m.includes('valid material'))).toBe(true);
    expect(messages.some((m) => m.includes('Amount'))).toBe(true);
  });

  it('rejects bad commands, namespaces and overlong titles', () => {
    const layout = emptyLayout({
      openCommand: 'Pixel Shop',
      namespace: 'Pixelarium',
      title: '&8' + 'x'.repeat(40),
    });
    const messages = validateLayout(layout).map((p) => p.message);
    expect(messages.some((m) => m.includes('lowercase'))).toBe(true);
    expect(messages.some((m) => m.includes('namespace'))).toBe(true);
    expect(messages.some((m) => m.includes('32 characters'))).toBe(true);
  });
});

describe('gui painting', () => {
  it('paints a framed panel with a well in every slot', () => {
    const rows = 2;
    const { width, height } = guiCanvasSize(rows);
    const cel = new Uint8ClampedArray(width * height * 4);
    paintGuiBackground(cel, width, height, rows, colors);

    // Frame on the outer edge, panel in the gap between two slot wells.
    expect(pixel(cel, width, 0, 0)).toEqual([0x4a, 0x4a, 0x55, 255]);
    expect(pixel(cel, width, 17, 5)).toEqual([0x2b, 0x2b, 0x33, 255]);

    // The top-left well is inset by one pixel and has a dark top-left edge.
    expect(pixel(cel, width, 1, 1)).toEqual([0x37, 0x37, 0x37, 255]);
    expect(pixel(cel, width, 2, 2)).toEqual([0x8b, 0x8b, 0x8b, 255]);
  });

  it('fills every pixel with an opaque colour', () => {
    const rows = 3;
    const { width, height } = guiCanvasSize(rows);
    const cel = new Uint8ClampedArray(width * height * 4);
    paintGuiBackground(cel, width, height, rows, colors);
    for (let i = 3; i < cel.length; i += 4) expect(cel[i]).toBe(255);
  });
});

describe('gui exports', () => {
  it('writes a DeluxeMenus menu with one entry per item', () => {
    const layout = sampleLayout();
    const yaml = toDeluxeMenusYaml(layout);
    expect(yaml).toContain("menu_title: '&8&lPixelarium Shop'");
    expect(yaml).toContain("open_command: 'pixel-shop'");
    expect(yaml).toContain('size: 27');
    expect(yaml).toContain('material: DIAMOND');
    expect(yaml).toContain('slot: 10');
    expect(yaml).toContain("display_name: '&bDiamond'");
    expect(yaml).toContain("- '&7Currency for the shop.'");
    expect(yaml).toContain("      - '[player] shop buy diamond'");
    // The barrier closes the menu instead of running a command.
    expect(yaml).toContain("      - '[close]'");
    expect(yaml.match(/left_click_commands:/g)?.length).toBe(4);
  });

  it('writes ItemsAdder and Oraxen definitions in the chosen namespace', () => {
    const layout = emptyLayout({ namespace: 'myserver', slots: [emptySlot(0, { material: 'DIAMOND', name: '&bGem' })] });
    const itemsAdder = toItemsAdderYaml(layout);
    expect(itemsAdder).toContain('namespace: myserver');
    expect(itemsAdder).toContain('  diamond_0:');
    expect(itemsAdder).toContain('      - myserver/diamond_0.png');

    const oraxen = toOraxenYaml(layout);
    expect(oraxen).toContain('diamond_0:');
    expect(oraxen).toContain('  displayname: \'&bGem\'');
    expect(oraxen).toContain('    model_path: myserver/diamond_0');
  });

  it('exports a slot map that parses back to the same items', () => {
    const layout = sampleLayout();
    const parsed = JSON.parse(toSlotMapJson(layout)) as {
      size: number;
      slots: { slot: number; material: string; action: string | null }[];
    };
    expect(parsed.size).toBe(27);
    expect(parsed.slots).toHaveLength(layout.slots.length);
    expect(parsed.slots.find((s) => s.slot === 14)?.material).toBe('EMERALD');
    expect(parsed.slots.find((s) => s.slot === 16)?.action).toBe('close');
  });

  it('derives a safe file name from the layout name', () => {
    expect(layoutFilename(emptyLayout({ name: '&8Main Shop v2!' }))).toBe('main_shop_v2');
    expect(layoutFilename(emptyLayout({ name: '   ' }))).toBe('menu');
  });
});
