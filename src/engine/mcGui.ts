/**
 * Minecraft GUI layouts.
 *
 * A menu is a grid of 9-wide slots (1–6 rows, the same limits the server enforces), a title, an open
 * command and the items sitting in individual slots. The same model drives three things: the slot grid
 * painted into the project's canvas, the live preview in the GUI studio, and the server configuration
 * the studio exports.
 *
 * Everything here is pure: no React, no DOM. That is what lets the exporters be tested and keeps the
 * studio UI honest about what it produces.
 */

/** Pixels per slot in the painted texture. 18 is the size Minecraft's own container textures use. */
export const SLOT_PX = 18;

export const MAX_ROWS = 6;
export const COLUMNS = 9;

export type GuiTexture = 'chest' | 'hopper' | 'generic' | 'custom';

export interface GuiSlot {
  /** Slot index, row-major: 0 is top-left. */
  index: number;
  material: string;
  name: string;
  lore: string[];
  amount: number;
  /** Command run on left click, without the `[player]` prefix. Empty means no action. */
  action: string;
  /** Region of the project canvas used as this slot's icon, when the user picks one. */
  icon: { x: number; y: number; w: number; h: number } | null;
}

export interface GuiLayout {
  name: string;
  title: string;
  openCommand: string;
  rows: number;
  texture: GuiTexture;
  namespace: string;
  permission: string;
  slots: GuiSlot[];
}

export interface GuiProblem {
  slot: number | null;
  message: string;
}

export function menuSize(rows: number): number {
  return Math.max(1, Math.min(MAX_ROWS, Math.round(rows))) * COLUMNS;
}

export function emptyLayout(patch: Partial<GuiLayout> = {}): GuiLayout {
  return {
    name: 'Shop menu',
    title: '&8&lPixelarium Shop',
    openCommand: 'pixel-shop',
    rows: 3,
    texture: 'chest',
    namespace: 'pixelarium',
    permission: 'pixelarium.shop',
    slots: [],
    ...patch,
  };
}

export function emptySlot(index: number, patch: Partial<GuiSlot> = {}): GuiSlot {
  return {
    index,
    material: 'STONE',
    name: '&fItem',
    lore: [],
    amount: 1,
    action: '',
    icon: null,
    ...patch,
  };
}

/** A small shop that shows the format off; also the default demo content of the studio. */
export function sampleLayout(): GuiLayout {
  return emptyLayout({
    slots: [
      emptySlot(10, {
        material: 'DIAMOND',
        name: '&bDiamond',
        lore: ['&7Currency for the shop.', '&8+1 per purchase'],
        amount: 1,
        action: 'shop buy diamond',
      }),
      emptySlot(12, {
        material: 'GOLDEN_APPLE',
        name: '&6Golden Apple',
        lore: ['&7Restores health instantly.'],
        amount: 1,
        action: 'shop buy golden_apple',
      }),
      emptySlot(14, {
        material: 'EMERALD',
        name: '&aEmerald',
        lore: ['&7Sell your loot here.'],
        amount: 1,
        action: 'shop sell emerald',
      }),
      emptySlot(16, {
        material: 'BARRIER',
        name: '&cClose',
        lore: [],
        amount: 1,
        action: 'close',
      }),
    ],
  });
}

const MATERIAL_RE = /^[A-Z][A-Z0-9_]*$/;
const COMMAND_RE = /^[a-z0-9][a-z0-9:_-]*$/;

/** Things a server would reject or that would silently do nothing. */
export function validateLayout(layout: GuiLayout): GuiProblem[] {
  const problems: GuiProblem[] = [];
  const size = menuSize(layout.rows);

  if (!layout.name.trim()) problems.push({ slot: null, message: 'The layout needs a name.' });
  if (!layout.title.trim()) problems.push({ slot: null, message: 'The menu title is empty.' });
  if (layout.title.replace(/&./g, '').length > 32) {
    problems.push({ slot: null, message: 'Minecraft cuts menu titles after 32 characters.' });
  }
  if (!COMMAND_RE.test(layout.openCommand)) {
    problems.push({ slot: null, message: 'The open command must be lowercase, with no spaces.' });
  }
  if (!/^[a-z0-9_]+$/.test(layout.namespace)) {
    problems.push({ slot: null, message: 'The namespace must be lowercase letters, digits or underscores.' });
  }
  if (layout.rows < 1 || layout.rows > MAX_ROWS || Math.round(layout.rows) !== layout.rows) {
    problems.push({ slot: null, message: `Rows must be a whole number from 1 to ${MAX_ROWS}.` });
  }

  const seen = new Map<number, number>();
  for (const slot of layout.slots) {
    if (slot.index < 0 || slot.index >= size) {
      problems.push({ slot: slot.index, message: `Slot ${slot.index} is outside a ${size}-slot menu.` });
      continue;
    }
    if (seen.has(slot.index)) {
      problems.push({ slot: slot.index, message: `Slot ${slot.index} is used twice; the second item would replace the first.` });
    }
    seen.set(slot.index, (seen.get(slot.index) ?? 0) + 1);

    if (!MATERIAL_RE.test(slot.material)) {
      problems.push({ slot: slot.index, message: `"${slot.material}" is not a valid material name.` });
    }
    if (slot.amount < 1 || slot.amount > 64) {
      problems.push({ slot: slot.index, message: 'Amount must be between 1 and 64.' });
    }
    if (!slot.name.trim()) {
      problems.push({ slot: slot.index, message: 'Item name is empty.' });
    }
  }
  return problems;
}

/* ------------------------------------------------------------------ */
/* Painting                                                            */
/* ------------------------------------------------------------------ */

export interface GuiPalette {
  panel: string;
  panelDark: string;
  well: string;
  wellEdge: string;
  border: string;
}

export const GUI_PALETTES: { id: string; name: string; palette: GuiPalette }[] = [
  {
    id: 'slate',
    name: 'Slate',
    palette: { panel: '#2b2b33', panelDark: '#1d1d24', well: '#8b8b8b', wellEdge: '#373737', border: '#4a4a55' },
  },
  {
    id: 'vanilla',
    name: 'Classic',
    palette: { panel: '#c6c6c6', panelDark: '#8b8b8b', well: '#8b8b8b', wellEdge: '#373737', border: '#555555' },
  },
  {
    id: 'obsidian',
    name: 'Obsidian',
    palette: { panel: '#241b3a', panelDark: '#150f24', well: '#3f3459', wellEdge: '#120d20', border: '#5b4a86' },
  },
  {
    id: 'emerald',
    name: 'Emerald',
    palette: { panel: '#1e3a2c', panelDark: '#12261d', well: '#2f5c45', wellEdge: '#0c1a14', border: '#3f7d5d' },
  },
];

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  const n = parseInt(value, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function put(cel: Uint8ClampedArray, width: number, height: number, x: number, y: number, rgb: [number, number, number]) {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const i = (y * width + x) * 4;
  cel[i] = rgb[0];
  cel[i + 1] = rgb[1];
  cel[i + 2] = rgb[2];
  cel[i + 3] = 255;
}

/**
 * Paints a container background with the slot wells, at one pixel per texture pixel.
 *
 * The output is exactly `9 * SLOT_PX` wide and `rows * SLOT_PX` tall so the editor canvas maps 1:1
 * onto the menu grid: the user paints icons straight into the wells.
 */
export function paintGuiBackground(
  cel: Uint8ClampedArray,
  width: number,
  height: number,
  rows: number,
  colors: GuiPalette,
): void {
  const panel = hexToRgb(colors.panel);
  const panelDark = hexToRgb(colors.panelDark);
  const well = hexToRgb(colors.well);
  const wellEdge = hexToRgb(colors.wellEdge);
  const border = hexToRgb(colors.border);
  const totalRows = Math.max(1, Math.min(MAX_ROWS, rows));

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const edge = x === 0 || y === 0 || x === width - 1 || y === height - 1;
      put(cel, width, height, x, y, edge ? border : panel);
    }
  }

  // A darker lip at the top and bottom of the panel reads as a raised frame.
  for (let x = 1; x < width - 1; x++) {
    put(cel, width, height, x, 1, panelDark);
    put(cel, width, height, x, height - 2, panelDark);
  }

  for (let index = 0; index < totalRows * COLUMNS; index++) {
    const sx = (index % COLUMNS) * SLOT_PX;
    const sy = Math.floor(index / COLUMNS) * SLOT_PX;
    for (let y = 0; y < SLOT_PX - 2; y++) {
      for (let x = 0; x < SLOT_PX - 2; x++) {
        const px = sx + 1 + x;
        const py = sy + 1 + y;
        const topLeft = x === 0 || y === 0;
        const bottomRight = x === SLOT_PX - 3 || y === SLOT_PX - 3;
        put(cel, width, height, px, py, topLeft ? wellEdge : bottomRight ? wellEdge : well);
      }
    }
  }
}

/** Canvas size a GUI layout needs: slot wells at 18 px plus the one-pixel frame. */
export function guiCanvasSize(rows: number): { width: number; height: number } {
  return { width: COLUMNS * SLOT_PX + 2, height: Math.max(1, Math.min(MAX_ROWS, rows)) * SLOT_PX + 2 };
}

export function slotOrigin(index: number): { x: number; y: number } {
  return { x: (index % COLUMNS) * SLOT_PX + 1, y: Math.floor(index / COLUMNS) * SLOT_PX + 1 };
}

/* ------------------------------------------------------------------ */
/* Exports                                                             */
/* ------------------------------------------------------------------ */

/** Single-quoted YAML scalar: the safe choice for text with `&` colour codes and colons. */
function yamlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/&./g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'item';
}

/**
 * DeluxeMenus menu file.
 *
 * Field names follow the plugin's schema (`menu_title`, `open_command`, `size`, `items`), and the
 * command lists use its `[player]` / `[close]` prefixes so the output can be dropped into
 * `plugins/DeluxeMenus/gui_menus/` as-is.
 */
export function toDeluxeMenusYaml(layout: GuiLayout): string {
  const lines: string[] = [];
  lines.push('# Generated by Pixelarium — Minecraft GUI Studio');
  lines.push(`# ${layout.name}`);
  lines.push(`menu_title: ${yamlString(layout.title)}`);
  lines.push(`open_command: ${yamlString(layout.openCommand)}`);
  lines.push(`size: ${menuSize(layout.rows)}`);
  lines.push('register_command: true');
  if (layout.permission.trim()) {
    lines.push('open_requirement:');
    lines.push('  requirements:');
    lines.push('    permission:');
    lines.push('      type: has permission');
    lines.push(`      permission: ${yamlString(layout.permission)}`);
  }
  lines.push('items:');

  const slots = [...layout.slots].sort((a, b) => a.index - b.index);
  if (slots.length === 0) {
    lines.push('  # No items yet — add one in the studio and it appears here.');
  }
  for (const slot of slots) {
    const id = `${slug(slot.material)}_${slot.index}`;
    lines.push(`  ${id}:`);
    lines.push(`    material: ${slot.material}`);
    lines.push(`    slot: ${slot.index}`);
    if (slot.amount !== 1) lines.push(`    amount: ${slot.amount}`);
    lines.push(`    display_name: ${yamlString(slot.name)}`);
    lines.push('    lore:');
    if (slot.lore.length === 0) {
      lines.push("      - ''");
    } else {
      for (const line of slot.lore) lines.push(`      - ${yamlString(line)}`);
    }
    if (slot.action.trim()) {
      const command = slot.action.trim();
      if (command === 'close') {
        lines.push('    left_click_commands:');
        lines.push('      - \'[close]\'');
      } else {
        lines.push('    left_click_commands:');
        lines.push(`      - '[player] ${command}'`);
      }
    }
    lines.push('    right_click_commands:');
    lines.push('      - \'[close]\'');
  }
  return `${lines.join('\n')}\n`;
}

/** ItemsAdder item definitions for every icon in the menu, so the art can ship as a resource pack. */
export function toItemsAdderYaml(layout: GuiLayout): string {
  const lines: string[] = [];
  lines.push('# Generated by Pixelarium — ItemsAdder items');
  lines.push('info:');
  lines.push(`  namespace: ${layout.namespace}`);
  lines.push('items:');
  const slots = [...layout.slots].sort((a, b) => a.index - b.index);
  if (slots.length === 0) lines.push('  {}');
  for (const slot of slots) {
    const id = `${slug(slot.material)}_${slot.index}`;
    lines.push(`  ${id}:`);
    lines.push(`    display_name: ${yamlString(slot.name)}`);
    lines.push('    resource:');
    lines.push('      material: PAPER');
    lines.push('      generate: true');
    lines.push('      textures:');
    lines.push(`        - ${layout.namespace}/${id}.png`);
  }
  return `${lines.join('\n')}\n`;
}

/** Oraxen item definitions for the same icons. */
export function toOraxenYaml(layout: GuiLayout): string {
  const lines: string[] = [];
  lines.push('# Generated by Pixelarium — Oraxen items');
  const slots = [...layout.slots].sort((a, b) => a.index - b.index);
  if (slots.length === 0) lines.push('# No items yet.');
  for (const slot of slots) {
    const id = `${slug(slot.material)}_${slot.index}`;
    lines.push(`${id}:`);
    lines.push(`  displayname: ${yamlString(slot.name)}`);
    lines.push('  material: PAPER');
    lines.push('  Pack:');
    lines.push('    generate_model: true');
    lines.push(`    model_path: ${layout.namespace}/${id}`);
    lines.push('    textures:');
    lines.push(`      - ${layout.namespace}/${id}`);
  }
  return `${lines.join('\n')}\n`;
}

/** A plain JSON slot map for plugins, bots or a web storefront that mirrors the menu. */
export function toSlotMapJson(layout: GuiLayout): string {
  return `${JSON.stringify(
    {
      format: 'pixelarium.gui',
      version: 1,
      name: layout.name,
      title: layout.title,
      command: layout.openCommand,
      size: menuSize(layout.rows),
      rows: layout.rows,
      texture: layout.texture,
      slots: [...layout.slots]
        .sort((a, b) => a.index - b.index)
        .map((slot) => ({
          slot: slot.index,
          material: slot.material,
          amount: slot.amount,
          name: slot.name,
          lore: slot.lore,
          action: slot.action || null,
          icon: slot.icon,
        })),
    },
    null,
    2,
  )}\n`;
}

/** File name stem used for every export of a layout. */
export function layoutFilename(layout: GuiLayout): string {
  const stem = layout.name
    .replace(/&./g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return stem || 'menu';
}
