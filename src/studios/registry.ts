/**
 * The studio directory.
 *
 * One entry per creative discipline. Everything the hub needs to render a card and start a project
 * lives here, and adding a new workspace later means adding an entry plus its screen - the shell,
 * navigation and template plumbing do not change.
 */

import type { IconName } from '../components/Icon';
import type { Screen } from '../store/ui';
import { TEMPLATES, type TemplateDefinition } from '../engine/templates';

export type StudioId = 'gui' | 'game' | 'animation' | 'tileset' | 'icons' | 'palettes' | 'creator' | 'scene';

export interface StudioEntry {
  id: StudioId;
  name: string;
  tagline: string;
  blurb: string;
  icon: IconName;
  /** Screen that opens when a template of this studio is created. */
  surface: Screen;
  /** What the workspace actually does, shown as chips. */
  capabilities: string[];
  templates: TemplateDefinition[];
  /** Extra line shown under the templates (e.g. where the workspace lives). */
  note?: string;
}

export const STUDIOS: StudioEntry[] = [
  {
    id: 'gui',
    name: 'Minecraft GUI Studio',
    tagline: 'Menus, shops and inventories',
    blurb:
      'Paint the menu itself: themed frames, title ribbons, recessed slot wells and corner plates, exported as the GUI texture PNG — then fill the slots and export DeluxeMenus, ItemsAdder and Oraxen files.',
    icon: 'grid-map',
    surface: 'gui',
    capabilities: ['GUI textures', '8 panel themes', 'Title ribbons', 'Slot wells', 'DeluxeMenus YAML'],
    templates: TEMPLATES.gui,
  },
  {
    id: 'game',
    name: 'Game Asset Studio',
    tagline: 'Characters, weapons and props',
    blurb:
      'Start from a character sheet or a weapon set, animate it in the timeline, then ship a sprite sheet with a manifest that records each frame position, size and duration.',
    icon: 'sparkles',
    surface: 'packs',
    capabilities: ['Sprite sheets', 'Asset manifest', 'Walk cycles', 'Item sets', 'Pack export'],
    templates: TEMPLATES.game,
  },
  {
    id: 'animation',
    name: 'Animation Studio',
    tagline: 'Frames, onion skin and playback',
    blurb:
      'The full frame timeline: onion skin, per-frame timing, playback modes, in-betweening, GIF and sprite-sheet output. Starts from a ready-made loop.',
    icon: 'play',
    surface: 'editor',
    capabilities: ['Onion skin', 'Timeline', 'Tween', 'GIF', 'Sprite sheet'],
    templates: TEMPLATES.animation,
    note: 'Opens in the main editor with onion skin switched on.',
  },
  {
    id: 'tileset',
    name: 'Tileset & World Builder',
    tagline: 'Tiles, grids and tilemaps',
    blurb:
      'Paint reusable tiles, stamp them into a grid, and keep the tilemap inside the project file so a world can be reopened and edited later.',
    icon: 'grid',
    surface: 'tileset',
    capabilities: ['Tile sheets', 'Grid stamping', 'Tilemap data', 'Tiled JSON'],
    templates: [],
    note: 'Open the tileset workspace, then paint a tile and stamp it into the map.',
  },
  {
    id: 'icons',
    name: 'Icon & Asset Pack Studio',
    tagline: 'Consistent icon sets',
    blurb:
      'Author one icon across default, hover, pressed and disabled states, then batch-export every state as PNGs plus a pack manifest.',
    icon: 'magic',
    surface: 'packs',
    capabilities: ['UI states', 'Batch PNG', 'Pack manifest', 'Size presets'],
    templates: TEMPLATES.icons,
  },
  {
    id: 'palettes',
    name: 'Palette Library',
    tagline: 'Curated palettes and extraction',
    blurb:
      'Extract a palette from the current frame, apply one of nine curated palettes or an imported .hex/JASC-PAL/GIMP list, and export the colours back out as .hex. Dithering itself lives in the editor’s Dither tab.',
    icon: 'palette',
    surface: 'palettes',
    capabilities: ['Extract palette', '9 curated palettes', 'Palette import', '.hex export', 'Apply to project'],
    templates: [],
    note: 'Lives in the palette library; open the editor’s Dither tab to map a frame with Bayer or Floyd–Steinberg.',
  },
  {
    id: 'creator',
    name: 'Digital Creator Studio',
    tagline: 'Avatars, emotes and stickers',
    blurb:
      'Profile pictures, chat emotes, stickers and badges with the safe-area guide for each platform shape, exported at the sizes those platforms want.',
    icon: 'share',
    surface: 'creator',
    capabilities: ['Avatars', 'Emotes', 'Stickers', 'Badges', 'Platform sizes'],
    templates: TEMPLATES.creator,
  },
  {
    id: 'scene',
    name: 'Scene & Composition',
    tagline: 'Stage sprites, light and mood',
    blurb:
      'Frame your artwork for a title screen, a shop banner or a screenshot: dithered backdrops, staged sprite instances with their own frame and scale, a key light and a vignette, exported as one PNG.',
    icon: 'image',
    surface: 'scene',
    capabilities: ['Dithered backdrops', 'Sprite staging', 'Key light', 'Vignette', 'PNG export'],
    templates: TEMPLATES.scene,
  },
];
