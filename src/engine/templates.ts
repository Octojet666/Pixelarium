/**
 * Studio templates.
 *
 * Each template builds a ready-to-edit document: canvas size, named layers and
 * starter art from `spriteArt.ts`.
 */

import type { Cel, Layer, ProjectDoc } from '../types';
import { createFrame, createLayer, createProject, uid } from './document';
import { BUILTIN_PALETTES } from './palettes';
import { createCel, setPixelRaw } from './pixel';
import { guiCanvasSize, paintGuiBackground, SLOT_PX, GUI_PALETTES, type GuiPalette } from './mcGui';
import { emptyScene } from './scene';
import { defaultTextureOptions } from './guiTexture';
import {
  COIN_ART,
  FACE_ARTS,
  FLAME_ART,
  FLAME_ART_B,
  FLAME_ART_C,
  HERO_FRAMES,
  PORTRAIT_ART,
  STICKER_HEART_ART,
  WEAPON_ARTS,
  paintSprite,
  paintSpriteCentered,
} from './spriteArt';

type Color = readonly [number, number, number, number];

const rgb = (hex: string, alpha = 255): Color => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, alpha];
};

function fillEllipse(cel: Cel, w: number, h: number, cx: number, cy: number, rx: number, ry: number, color: Color): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      if (nx * nx + ny * ny <= 1) setPixelRaw(cel, w, h, x, y, color);
    }
  }
}

function addLayerWithCel(doc: ProjectDoc, name: string, cel: Cel): { doc: ProjectDoc; layer: Layer } {
  const layer = createLayer(name);
  doc.layers.push(layer);
  for (const frame of doc.frames) frame.cels[layer.id] = new Uint8ClampedArray(cel);
  return { doc, layer };
}

function setLayerCel(doc: ProjectDoc, layerId: string, frameIndex: number, cel: Cel): void {
  const frame = doc.frames[frameIndex];
  if (frame) frame.cels[layerId] = cel;
}

function blankDoc(name: string, width: number, height: number, description: string): ProjectDoc {
  const doc = createProject({ name, width, height });
  doc.meta.description = description;
  return doc;
}

function withFrames(doc: ProjectDoc, count: number, duration = 120): void {
  const layerIds = doc.layers.map((layer) => layer.id);
  while (doc.frames.length < count) doc.frames.push(createFrame(layerIds, doc.width, doc.height, duration));
}

/* ------------------------------------------------------------------ */
/* Minecraft GUI                                                       */
/* ------------------------------------------------------------------ */

export function guiProject(rows = 3, paletteId = 'slate', name = 'Shop menu'): ProjectDoc {
  const { width, height } = guiCanvasSize(rows);
  const doc = blankDoc(name, width, height, `Minecraft menu background · ${rows}×9 slots`);
  const palette = GUI_PALETTES.find((p) => p.id === paletteId)?.palette ?? GUI_PALETTES[0].palette;
  const background = createCel(width, height);
  paintGuiBackground(background, width, height, rows, palette);
  doc.layers[0].name = 'Panel';
  setLayerCel(doc, doc.layers[0].id, 0, background);

  const icons = createCel(width, height);
  addLayerWithCel(doc, 'Icons', icons);
  doc.meta.tags = [`mc-gui:${rows}`];
  // The studio paints the real texture from a theme; keep the template's palette as its starting point.
  const theme = paletteId === 'slate' ? 'obsidian' : paletteId === 'vanilla' ? 'vanilla' : paletteId === 'emerald' ? 'emerald' : 'oak';
  doc.guiTexture = { ...defaultTextureOptions(), theme };
  return doc;
}

/** Paints a menu background into an existing document, matching the canvas size it needs. */
export function repaintGuiBackground(doc: ProjectDoc, rows: number, palette: GuiPalette): void {
  const target = doc.frames[0]?.cels[doc.layers[0]?.id ?? ''];
  if (!target) return;
  const { width, height } = guiCanvasSize(rows);
  if (doc.width !== width || doc.height !== height) return;
  paintGuiBackground(target, width, height, rows, palette);
}

/* ------------------------------------------------------------------ */
/* Characters and game assets                                          */
/* ------------------------------------------------------------------ */

function characterCel(w: number, h: number, frame: number): Cel {
  const cel = createCel(w, h);
  paintSpriteCentered(cel, w, h, HERO_FRAMES[frame % HERO_FRAMES.length], 1);
  return cel;
}

export function characterSheet(): ProjectDoc {
  const doc = blankDoc('Character · walk cycle', 32, 32, 'Four-frame walk cycle with separate body and detail layers.');
  doc.layers[0].name = 'Body';
  withFrames(doc, 4, 100);
  for (let i = 0; i < 4; i++) setLayerCel(doc, doc.layers[0].id, i, characterCel(32, 32, i));

  // Starts empty; add a scarf, glint or logo here.
  addLayerWithCel(doc, 'Details', createCel(32, 32));
  doc.tags = [{ id: uid('tag'), name: 'walk', from: 0, to: 3, mode: 'forward', fps: 10 }];
  return doc;
}

export function weaponSet(): ProjectDoc {
  const doc = blankDoc('Weapon set · 32px', 32, 32, 'Crystal sword, broad axe and hunting bow drawn natively at 24×32.');
  doc.layers[0].name = 'Weapons';
  withFrames(doc, 3);
  const arts = [WEAPON_ARTS.sword, WEAPON_ARTS.axe, WEAPON_ARTS.bow];
  arts.forEach((art, index) => {
    const cel = createCel(32, 32);
    paintSpriteCentered(cel, 32, 32, art, 1);
    setLayerCel(doc, doc.layers[0].id, index, cel);
  });
  doc.frames[0].label = 'Sword';
  doc.frames[1].label = 'Axe';
  doc.frames[2].label = 'Bow';
  return doc;
}

/* ------------------------------------------------------------------ */
/* Icons, emotes, social art                                           */
/* ------------------------------------------------------------------ */

export const ICON_STATES = ['Default', 'Hover', 'Pressed', 'Disabled'] as const;

function coinCel(size: number, state: number): Cel {
  const cel = createCel(size, size);
  paintSpriteCentered(cel, size, size, COIN_ART, size >= 32 ? 2 : 1);
  // Hover, pressed and disabled reuse the same coin with a tone shift.
  const factor = [1, 1.12, 0.78, 0.86][state] ?? 1;
  const desaturate = state === 3 ? 1 : 0;
  for (let i = 0; i < cel.length; i += 4) {
    if (cel[i + 3] === 0) continue;
    const lum = cel[i] * 0.3 + cel[i + 1] * 0.59 + cel[i + 2] * 0.11;
    for (let c = 0; c < 3; c++) {
      const mixed = cel[i + c] * (1 - desaturate) + lum * desaturate;
      cel[i + c] = Math.max(0, Math.min(255, Math.round(mixed * factor)));
    }
  }
  if (state === 1) {
    const sparkle = Math.max(1, Math.round(size / 16));
    for (let y = 0; y < sparkle; y++) {
      for (let x = 0; x < sparkle; x++) {
        setPixelRaw(cel, size, size, Math.round(size * 0.28) + x, Math.round(size * 0.3) + y, [255, 255, 240, 255]);
      }
    }
  }
  return cel;
}

export function iconSet(size = 16): ProjectDoc {
  const doc = blankDoc(`Icon set · ${size}px`, size, size, 'Hand-drawn coin icon in default, hover, pressed and disabled states — one frame per state.');
  doc.layers[0].name = 'Icon';
  withFrames(doc, ICON_STATES.length);
  ICON_STATES.forEach((state, index) => {
    setLayerCel(doc, doc.layers[0].id, index, coinCel(size, index));
    doc.frames[index].label = state;
  });
  return doc;
}

function emoteCel(size: number, frame: number): Cel {
  const cel = createCel(size, size);
  const art = frame % 2 === 0 ? FACE_ARTS.laugh : FACE_ARTS.laughOpen;
  const scale = size >= 32 ? 2 : 1;
  const artSize = 16 * scale;
  const bob = [0, -2, 0, 2][frame % 4];
  paintSprite(cel, size, size, art, {
    scale,
    offsetX: Math.floor((size - artSize) / 2),
    offsetY: Math.floor((size - artSize) / 2) + bob,
  });
  return cel;
}

export function emote(name = 'Cheer emote'): ProjectDoc {
  const doc = blankDoc(`${name} · 32px`, 32, 32, 'Four-frame laughing emote for chat and stream overlays.');
  doc.layers[0].name = 'Face';
  withFrames(doc, 4, 120);
  for (let i = 0; i < 4; i++) setLayerCel(doc, doc.layers[0].id, i, emoteCel(32, i));
  doc.meta.tags = ['emote', 'discord'];
  return doc;
}

export function avatar(size = 64): ProjectDoc {
  const doc = blankDoc(`Avatar · ${size}px`, size, size, 'Portrait avatar with a background ring, sized for profile pictures.');
  doc.layers[0].name = 'Background';
  const bg = doc.frames[0].cels[doc.layers[0].id];
  const cx = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if ((x - cx) ** 2 + (y - cx) ** 2 <= cx * cx) {
        const t = y / size;
        setPixelRaw(bg, size, size, x, y, [Math.round(58 + t * 70), Math.round(44 + t * 30), Math.round(96 + t * 60), 255]);
      }
    }
  }

  const portrait = createCel(size, size);
  // 32px portrait painted at 2x for a 64px avatar.
  paintSpriteCentered(portrait, size, size, PORTRAIT_ART, size >= 64 ? 2 : 1);
  addLayerWithCel(doc, 'Portrait', portrait);
  doc.meta.tags = ['avatar', 'profile'];
  return doc;
}

export function sticker(size = 64): ProjectDoc {
  const doc = blankDoc(`Sticker · ${size}px`, size, size, 'Die-cut heart sticker with a warm cream badge, ready for chat packs.');
  doc.layers[0].name = 'Badge';
  const cel = doc.frames[0].cels[doc.layers[0].id];
  const cx = (size - 1) / 2;
  fillEllipse(cel, size, size, cx, cx, cx, cx, rgb('#1a1218'));
  fillEllipse(cel, size, size, cx, cx, cx - 1, cx - 1, rgb('#fdf1d8'));
  paintSpriteCentered(cel, size, size, STICKER_HEART_ART, size >= 64 ? 2 : 1);
  doc.meta.tags = ['sticker', 'badge'];
  return doc;
}

/* ------------------------------------------------------------------ */
/* Animation                                                           */
/* ------------------------------------------------------------------ */

export function animationLoop(): ProjectDoc {
  const doc = blankDoc('Loop · 8 frames', 32, 32, 'Eight-frame flickering flame, hand-drawn and looping.');
  doc.layers[0].name = 'Subject';
  withFrames(doc, 8, 100);
  const flames = [FLAME_ART, FLAME_ART_B, FLAME_ART_C, FLAME_ART_B, FLAME_ART, FLAME_ART_C, FLAME_ART_B, FLAME_ART];
  const bob = [0, -1, 0, -2, 0, -1, -2, 0];
  flames.forEach((art, index) => {
    const cel = createCel(32, 32);
    paintSprite(cel, 32, 32, art, {
      scale: 2,
      offsetX: 0,
      offsetY: bob[index],
      mirrorX: index === 3 || index === 6,
    });
    setLayerCel(doc, doc.layers[0].id, index, cel);
  });
  doc.tags = [{ id: uid('tag'), name: 'loop', from: 0, to: 7, mode: 'forward', fps: 10 }];
  return doc;
}

/* ------------------------------------------------------------------ */
/* Scene & composition                                                 */
/* ------------------------------------------------------------------ */

export function sceneStarter(): ProjectDoc {
  const doc = characterSheet();
  doc.name = 'Hero scene';
  doc.meta.description = 'A 32px hero staged on a dithered 16:9 backdrop with a warm key light.';
  const scene = emptyScene(doc, 320, 180);
  doc.scene = {
    ...scene,
    backdrop: { kind: 'vertical', from: '#141026', to: '#452f5c', dither: true },
    fx: {
      vignette: 32,
      light: { x: 208, y: 66, radius: 92, color: '#ffe6a8', strength: 42 },
    },
  };
  doc.meta.tags = ['scene', 'composition'];
  return doc;
}

/* ------------------------------------------------------------------ */
/* Registry surface                                                    */
/* ------------------------------------------------------------------ */

export interface TemplateDefinition {
  id: string;
  name: string;
  blurb: string;
  size: string;
  build: () => ProjectDoc;
}

export const TEMPLATES = {
  gui: [
    {
      id: 'gui-3',
      name: 'Shop · 3 rows',
      blurb: '27 slots with a panel, wells and an Icons layer on top.',
      size: `${guiCanvasSize(3).width}×${guiCanvasSize(3).height}`,
      build: () => guiProject(3, 'slate', 'Shop menu'),
    },
    {
      id: 'gui-6',
      name: 'Storage · 6 rows',
      blurb: 'Full 54-slot chest layout for large menus.',
      size: `${guiCanvasSize(6).width}×${guiCanvasSize(6).height}`,
      build: () => guiProject(6, 'obsidian', 'Storage menu'),
    },
    {
      id: 'gui-vanilla',
      name: 'Classic · 3 rows',
      blurb: 'Light panel close to the vanilla chest texture.',
      size: `${guiCanvasSize(3).width}×${guiCanvasSize(3).height}`,
      build: () => guiProject(3, 'vanilla', 'Classic menu'),
    },
  ] as TemplateDefinition[],
  game: [
    {
      id: 'character',
      name: 'Character walk',
      blurb: '32×32 hero with a four-frame walk cycle and a details layer.',
      size: '32×32',
      build: characterSheet,
    },
    {
      id: 'weapons',
      name: 'Weapon set',
      blurb: 'Sword, axe and bow on one grid, one frame each.',
      size: '32×32',
      build: weaponSet,
    },
    {
      id: 'emote',
      name: 'Emote loop',
      blurb: '32×32 four-frame bounce for chat and overlays.',
      size: '32×32',
      build: () => emote(),
    },
  ] as TemplateDefinition[],
  icons: [
    {
      id: 'icon-16',
      name: 'Icon set · 16px',
      blurb: 'Four UI states of one icon: default, hover, pressed, disabled.',
      size: '16×16',
      build: () => iconSet(16),
    },
    {
      id: 'icon-32',
      name: 'Icon set · 32px',
      blurb: 'The same states at a larger size for launchers and menus.',
      size: '32×32',
      build: () => iconSet(32),
    },
  ] as TemplateDefinition[],
  creator: [
    {
      id: 'avatar',
      name: 'Avatar',
      blurb: 'Portrait with a ring background and a face layer.',
      size: '64×64',
      build: () => avatar(64),
    },
    {
      id: 'sticker',
      name: 'Sticker',
      blurb: 'Rounded badge with a star, good for chat packs.',
      size: '64×64',
      build: () => sticker(64),
    },
    {
      id: 'emote-social',
      name: 'Emote',
      blurb: 'Bouncy four-frame emote sized for Discord.',
      size: '32×32',
      build: () => emote('Chat emote'),
    },
  ] as TemplateDefinition[],
  scene: [
    {
      id: 'scene-hero',
      name: 'Hero scene · 16:9',
      blurb: 'Centred hero on a dithered backdrop with a warm key light and a soft vignette.',
      size: '320×180',
      build: sceneStarter,
    },
  ] as TemplateDefinition[],
  animation: [
    {
      id: 'loop-8',
      name: '8-frame loop',
      blurb: 'Ready-made loop with a motion tag and onion skin friendly spacing.',
      size: '32×32',
      build: animationLoop,
    },
  ] as TemplateDefinition[],
};

/** The palette used for starter projects, so templates look like one product family. */
export const TEMPLATE_PALETTE = BUILTIN_PALETTES[0].id;

void SLOT_PX;
