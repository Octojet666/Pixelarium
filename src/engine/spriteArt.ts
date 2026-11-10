/**
 * Pixel-art sprite maps.
 *
 * Each sprite is a grid of characters plus its own palette. Templates and the
 * example gallery paint these maps directly into cels.
 */

import type { Cel } from '../types';
import { setPixelRaw } from './pixel';

export type SpritePalette = Record<string, string>;
export interface SpriteArt {
  rows: string[];
  palette: SpritePalette;
}

function rgba(hex: string): readonly [number, number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}

/** The largest sprite width in a set, so callers can centre short rows. */
export function spriteWidth(art: SpriteArt): number {
  return Math.max(...art.rows.map((row) => row.length));
}

/**
 * Paints a sprite into a cel. `scale` keeps pixels square; `offsetX/Y` place the
 * artwork inside a larger canvas. Unknown characters are treated as transparent.
 */
export function paintSprite(
  cel: Cel,
  width: number,
  height: number,
  art: SpriteArt,
  options: { scale?: number; offsetX?: number; offsetY?: number; mirrorX?: boolean } = {},
): void {
  const scale = Math.max(1, Math.round(options.scale ?? 1));
  const artW = spriteWidth(art);
  const offsetX = options.offsetX ?? 0;
  const offsetY = options.offsetY ?? 0;
  art.rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const hex = art.palette[row[x]];
      if (!hex) continue;
      const color = rgba(hex);
      const dx = options.mirrorX ? artW - 1 - x : x;
      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) {
          setPixelRaw(cel, width, height, offsetX + dx * scale + sx, offsetY + y * scale + sy, color);
        }
      }
    }
  });
}

/** Centres a sprite of a known art size inside a canvas. */
export function paintSpriteCentered(
  cel: Cel,
  width: number,
  height: number,
  art: SpriteArt,
  scale = 1,
): void {
  const artW = spriteWidth(art) * scale;
  const artH = art.rows.length * scale;
  paintSprite(cel, width, height, art, {
    scale,
    offsetX: Math.floor((width - artW) / 2),
    offsetY: Math.floor((height - artH) / 2),
  });
}

/* ------------------------------------------------------------------ */
/* Weapons - 16×16, painted at 2× for the 32px set                     */
/* ------------------------------------------------------------------ */

const WEAPON_PALETTE: SpritePalette = {
  k: '#121018',
  b: '#d9f2ff',
  B: '#8fd0ee',
  d: '#4a8fb5',
  g: '#e8b64c',
  G: '#ffe6a0',
  o: '#a9741a',
  r: '#d94b4b',
  h: '#6b4630',
  H: '#8a5a34',
  m: '#8f9bb0',
  M: '#c6d1e2',
  n: '#4d5668',
  w: '#f4f1e6',
};

export const SWORD_ART: SpriteArt = {
  palette: WEAPON_PALETTE,
  rows: [
    '........................',
    '........................',
    '...........k............',
    '..........kbBk..........',
    '.........kbBBdk.........',
    '.........kbBBdk.........',
    '.........kbBBdk.........',
    '.........kbBBdk.........',
    '.........kbBBdk.........',
    '.........kbBBdk.........',
    '.........kbBBdk.........',
    '.........kbBBdk.........',
    '.........kbBBdk.........',
    '.........kbBBdk.........',
    '.........kbBBdk.........',
    '.........kbBBdk.........',
    '.........kbBBdk.........',
    '.........kbBBdk.........',
    '........kkkkkkkk........',
    '.......kkkkkkkkkk.......',
    '......GGGGGrrGGGGG......',
    '.......kkkkkkkkkk.......',
    '..........kHHk..........',
    '..........kHHk..........',
    '..........kHHk..........',
    '..........kHHk..........',
    '..........kHHk..........',
    '..........kHHk..........',
    '.........kkkkkk.........',
    '..........GGGG..........',
    '.........kkkkkk.........',
    '........................',
  ],
};


export const AXE_ART: SpriteArt = {
  palette: WEAPON_PALETTE,
  rows: [
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '.....kkkk...............',
    '.....kHhkmmmk...........',
    '.....kHhkmmmmMMMk.......',
    '.....kHhkmmmmMMMMMk.....',
    '.....kHhkmmmmmMMMMMMk...',
    '.....kHhkmmmmmMMMMMMMk..',
    '.....kHhkmmmmmMMMMMMMk..',
    '.....kHhkmmmmmMMMMMMk...',
    '.....kHhkmmmmMMMMMk.....',
    '.....kHhkmmmMMMMk.......',
    '.....kHhkmmMMk..........',
    '.....kHhkmMk............',
    '.....kHhkkkk............',
    '.....kHhk...............',
    '.....kHhk...............',
    '.....kHhk...............',
    '.....kHhk...............',
    '.....kHhk...............',
    '.....kHhk...............',
    '.....kHhk...............',
    '.....kHhk...............',
    '.....kHhk...............',
    '.....kHhk...............',
    '.....kHhk...............',
    '.....kHhk...............',
    '.....kkkk...............',
    '........................',
  ],
};


export const BOW_ART: SpriteArt = {
  palette: WEAPON_PALETTE,
  rows: [
    '........................',
    '........................',
    '........................',
    '........................',
    '..........kHhk..........',
    '.........kHhk.k.........',
    '........kHhk..k.........',
    '.......kHhk...k.........',
    '.......kHhk...k.........',
    '......kHhk....k.........',
    '......kHhk....k.........',
    '.....kHhk.....k.........',
    '.....kHhk.....k.........',
    '....kHhk......k.........',
    '...wwwhk......k.........',
    '...HHHHHHHHHHHHHHH.m....',
    '...hhhhhhhhhhhhhhhkmk...',
    '...wwwhk......k....m....',
    '....kHhk......k.........',
    '....kHhk......k.........',
    '.....kHhk.....k.........',
    '.....kHhk.....k.........',
    '......kHhk....k.........',
    '......kHhk....k.........',
    '.......kHhk...k.........',
    '.......kHhk...k.........',
    '........kHhk..k.........',
    '.........kHhk.k.........',
    '..........kHhk..........',
    '........................',
    '........................',
    '........................',
  ],
};


export const WEAPON_ARTS = { sword: SWORD_ART, axe: AXE_ART, bow: BOW_ART };

/* ------------------------------------------------------------------ */
/* Items - 16×16                                                       */
/* ------------------------------------------------------------------ */

const ITEM_PALETTE: SpritePalette = {
  k: '#14101a',
  r: '#e0485a',
  R: '#ff7d86',
  d: '#9e2739',
  w: '#ffe9ea',
  y: '#f6c445',
  Y: '#ffe89a',
  o: '#b87a16',
  b: '#3f8bd8',
  B: '#7fd4f0',
  D: '#235a96',
  g: '#57c46b',
  G: '#a7f0a0',
  p: '#8a4bd6',
  P: '#c79bff',
  s: '#e8dcc0',
  S: '#b9a37e',
  c: '#8a5a34',
};

export const HEART_ART: SpriteArt = {
  palette: ITEM_PALETTE,
  rows: [
    '................',
    '..kkk......kkk..',
    '.krRRk....krRRk.',
    'krRRRrkkkkrRRRrk',
    'krRRRRRRRRRRRRrk',
    'krRRRRRRRRRRRRrk',
    '.krRRRRRRRRRRrk.',
    '.kdrRRRRRRRRRdk.',
    '..kdrRRRRRRRdk..',
    '...kdrRRRRRdk...',
    '....kdrRRRdk....',
    '.....kdrRdk.....',
    '......kddk......',
    '.......kk.......',
    '................',
    '................',
  ],
};

export const POTION_ART: SpriteArt = {
  palette: ITEM_PALETTE,
  rows: [
    '................',
    '......kkkk......',
    '......kcck......',
    '.....kkkkkk.....',
    '.....kgGGgk.....',
    '....kgGGGGgk....',
    '...kgGGGGGGgk...',
    '..kgGGGGGGGGgk..',
    '..kgGGgggGGGgk..',
    '..kgGGGGGGGGgk..',
    '..kgGGGGGGGGgk..',
    '..kdgGGGGGGgdk..',
    '...kdggggggdk...',
    '....kkkkkkkk....',
    '................',
    '................',
  ],
};

export const KEY_ART: SpriteArt = {
  palette: ITEM_PALETTE,
  rows: [
    '................',
    '.....kkkk.......',
    '....kyYYyk......',
    '...kyYkkyYk.....',
    '...kyYkkyYk.....',
    '....kyYYyk......',
    '.....kyyk.......',
    '......kyk.......',
    '......kyk.......',
    '......kykk......',
    '......kykyk.....',
    '......kyk.......',
    '......kykk......',
    '......kykyk.....',
    '......kkk.......',
    '................',
  ],
};

export const GEM_ART: SpriteArt = {
  palette: ITEM_PALETTE,
  rows: [
    '................',
    '......kkkk......',
    '....kkBBBBkk....',
    '...kBBBBBBBBk...',
    '..kBBbBBBBbBBk..',
    '..kBbBBBBBBbBk..',
    '..kBBBBBBBBBBk..',
    '...kBBBBBBBBk...',
    '....kBBBBBBk....',
    '.....kBBBBk.....',
    '......kBBk......',
    '.......kk.......',
    '................',
    '................',
    '................',
    '................',
  ],
};

export const BOMB_ART: SpriteArt = {
  palette: ITEM_PALETTE,
  rows: [
    '................',
    '...........kk...',
    '..........kyyk..',
    '.........kyk....',
    '........kk......',
    '.....kkkkk......',
    '....kpPPPPk.....',
    '...kpPPPPPPk....',
    '..kpPPPPPPPPk...',
    '..kpPPPpPPPPk...',
    '..kpPPPPPPPPk...',
    '..kdpPPPPPPdk...',
    '...kddPPPPddk...',
    '....kkddddkk....',
    '......kkkk......',
    '................',
  ],
};

export const COIN_ART: SpriteArt = {
  palette: ITEM_PALETTE,
  rows: [
    '................',
    '.....kkkkkk.....',
    '...kkyYYYYykk...',
    '..kyYYyyyyYYyk..',
    '.kyYyyoooooyyYk.',
    '.kyYyooYYYooYyk.',
    '.kyyooYyyyYooyk.',
    '.kyyooYyyyYooyk.',
    '.kyyooYYYyYooyk.',
    '.kyYyoooYYooYyk.',
    '..kyYyyyoooyYk..',
    '..kkyYYyyyyYkk..',
    '...kkoyyyyokk...',
    '.....kkkkkk.....',
    '................',
    '................',
  ],
};

export const ITEM_ARTS = {
  heart: HEART_ART,
  potion: POTION_ART,
  key: KEY_ART,
  gem: GEM_ART,
  bomb: BOMB_ART,
  coin: COIN_ART,
};

/* ------------------------------------------------------------------ */
/* Faces - 16×16 reaction set                                          */
/* ------------------------------------------------------------------ */

const FACE_PALETTE: SpritePalette = {
  k: '#221508',
  y: '#f5c26b',
  Y: '#ffe39a',
  o: '#d79a45',
  w: '#ffffff',
  r: '#e0485a',
  R: '#ff8a8a',
  b: '#58bdf0',
  B: '#b5ecff',
  m: '#8a3b22',
  p: '#2a1608',
  t: '#ef7a72',
  L: '#2a1a12',
};

export const FACE_LAUGH: SpriteArt = {
  palette: FACE_PALETTE,
  rows: [
    '................',
    '....kkkkkkkk....',
    '...kkYYYYYykk...',
    '..kkYYYYYYyykk..',
    '.kkyYYYYYyyyykk.',
    '.kyYYYYYyyyyyyk.',
    '.kykwwkyykwwkyk.',
    '.kykwpkyykwpkyk.',
    '.kykwpkyykwpkyk.',
    '.kyyyyyyyyyyyyk.',
    '.kyyykkkkkkoook.',
    '.kkyykwwwwkookk.',
    '..kkyykttkookk..',
    '...kkyyyoookk...',
    '....kkkkkkkk....',
    '................',
  ],
};


export const FACE_HEART: SpriteArt = {
  palette: FACE_PALETTE,
  rows: [
    '................',
    '....kkkkkkkk....',
    '...kkYYYYYykk...',
    '..kkYYYYYYyykk..',
    '.kkyYYYYYyyyykk.',
    '.kyYYYYYyyyyyyk.',
    '.kykrrkyykrrkyk.',
    '.kykRRkyykRRkyk.',
    '.kykrrkyykrrkyk.',
    '.kyyyyyyyyyyyyk.',
    '.kyyykkkkkkoook.',
    '.kkyykwwwwkookk.',
    '..kkyykttkookk..',
    '...kkyyyoookk...',
    '....kkkkkkkk....',
    '................',
  ],
};


export const FACE_LAUGH2: SpriteArt = {
  palette: FACE_PALETTE,
  rows: [
    '................',
    '....kkkkkkkk....',
    '...kkYYYYYykk...',
    '..kkYYYYYYyykk..',
    '.kkyYYYYYyyyykk.',
    '.kyYYYYYyyyyyyk.',
    '.kykwwkyykwwkyk.',
    '.kykwpkyykwpkyk.',
    '.kykwpkyykwpkyk.',
    '.kyyyyyyyyyyyyk.',
    '.kyykkkkkkkkook.',
    '.kkykwwwwwwkokk.',
    '..kkkmmttmmkkk..',
    '...kkyyyoookk...',
    '....kkkkkkkk....',
    '................',
  ],
};


export const FACE_COOL: SpriteArt = {
  palette: FACE_PALETTE,
  rows: [
    '................',
    '....kkkkkkkk....',
    '...kkYYYYYykk...',
    '..kkYYYYYYyykk..',
    '.kkyYYYYYyyyykk.',
    '.kyYYYYYyyyyyyk.',
    '.kkkkkkkkkkkkkk.',
    '.kkwwLLLLLLLkkk.',
    '.kyyyyyyyyyyyyk.',
    '.kyyyyyyyyyyyyk.',
    '.kyyykkkkkkoook.',
    '.kkyyymwwmoookk.',
    '..kkyyyyooookk..',
    '...kkyyyoookk...',
    '....kkkkkkkk....',
    '................',
  ],
};


export const FACE_CRY: SpriteArt = {
  palette: FACE_PALETTE,
  rows: [
    '................',
    '....kkkkkkkk....',
    '...kkYYYYYykk...',
    '..kkYYYYYYyykk..',
    '.kkyYYYYYyyyykk.',
    '.kyYYYYYyyyyyyk.',
    '.kykwwkyykwwkyk.',
    '.kykwpkyykwpkyk.',
    '.kybwpkyykwpbyk.',
    '.kBbyyyyyyyybBk.',
    '.kBbyykkkkoobBk.',
    '.kBbykyyookobBk.',
    '..BbyyyyoooobB..',
    '...kkyyyoookk...',
    '....kkkkkkkk....',
    '................',
  ],
};


export const FACE_SLEEP: SpriteArt = {
  palette: FACE_PALETTE,
  rows: [
    '................',
    '....kkkkkkkk....',
    '...kkYYYYYykk...',
    '..kkYYYYYYyykk..',
    '.kkyYYYYYyyyykk.',
    '.kyYYYYYyyyyyyk.',
    '.kykyykyykyykyk.',
    '.kykkkkyykkkkyk.',
    '.kyyyyyyyyyyyyk.',
    '.kyyyyyyyyyyyyk.',
    '.kyyyyyyooooook.',
    '.kkyyymmmmoookk.',
    '..kkyyyyooookk..',
    '...kkyyyoookk...',
    '....kkkkkkkk....',
    '................',
  ],
};


export const FACE_ARTS = {
  laugh: FACE_LAUGH,
  laughOpen: FACE_LAUGH2,
  heart: FACE_HEART,
  cool: FACE_COOL,
  cry: FACE_CRY,
  sleep: FACE_SLEEP,
};

/* ------------------------------------------------------------------ */
/* Character - 24×32 grids, four walk poses                            */
/* ------------------------------------------------------------------ */

const HERO_PALETTE: SpritePalette = {
  k: '#121018',
  C: '#3f4f68',
  c: '#2b3444',
  l: '#7088a8',
  h: '#4a2f26',
  s: '#e6b48b',
  S: '#b57f5d',
  e: '#ffffff',
  p: '#241a22',
  j: '#2f3a52',
  J: '#45587a',
  d: '#1f2738',
  w: '#e6e2d6',
  g: '#6b7486',
  G: '#a9b4c6',
  L: '#33506d',
  b: '#1a1c24',
  o: '#a87a34',
  r: '#6b4a33',
  m: '#7a3a2a',
};

const HERO_TOP = [
  '........................',
  '........................',
  '.......kkkkkkkkkkk......',
  '.....kkCCCCCCCCCCCkk....',
  '....kCCClllllllCCCCCk...',
  '....kCCollllllllCCCCk...',
  '...kCCcllllllllCCCCCk...',
  '...kkkkkkkkkkkkkkkkkk...',
  '..kdddddddkhhhhhhhhhk...',
  '......khhhhhhhhhhhk.....',
  '.....khhssssssssssshk...',
  '.....khssssssssssssk....',
  '.....khsepssssepsssk....',
  '.....khsepssssepsssk....',
  '.....khssssssssssssk....',
  '......ksssSmmmSsssk.....',
  '......ksssssssssssk.....',
  '.......kkkkkkkkkkk......',
  '..kkkkkkkkkrkkkkkkkkkkk.',
  '..kgGGGGGGGGgkkJjwwwjrk.',
  '..kggkowwokggkkJjwwwrjk.',
  '..kgkoLwwLLokgkJjwwrjjk.',
  '..kggoLLLLoggkkJjwwwjjk.',
  '..kggoLLLLoggkkJjwwwjjk.',
  '..kggkoLLokggkkJjwwwjjk.',
  '..kgggkkkkgggkkJjwwwjjk.',
  '..kkkkkkkkkkkkkkkkkkkkk.',
];








const HERO_LEGS_STAND = [
  '...kkkkkkkkkkkkkkkkkkk..',
  '...kJjjjjjk..kJjjjjjk...',
  '...kjjjjjjk..kjjjjjjk...',
  '...kggggggk..kggggggk...',
  '...kkkkkkkk..kkkkkkkk...',
];

const HERO_LEGS_LEFT = [
  '...kkkkkkkkkkkkkkkkkkk..',
  '..kJjjjjjk....kJjjjjjk..',
  '..kjjjjjjk....kjjjjjjk..',
  '..kggggggk....kggggggk..',
  '..kkkkkkk......kkkkkkk..',
];

const HERO_LEGS_RIGHT = [
  '...kkkkkkkkkkkkkkkkkkk..',
  '...kJjjjjjk....kJjjjjjk.',
  '...kjjjjjjk....kjjjjjjk.',
  '...kggggggk....kggggggk.',
  '...kkkkkkk......kkkkkkk.',
];

function heroRows(legs: string[], bob: number): string[] {
  // 27 art rows + 5 leg rows = 32. A bob drops the top blank row instead of clipping the boots.
  const top = bob === 0 ? HERO_TOP : ['', ...HERO_TOP.slice(1)];
  return [...top, ...legs];
}

export const HERO_FRAMES: SpriteArt[] = [
  { palette: HERO_PALETTE, rows: heroRows(HERO_LEGS_STAND, 0) },
  { palette: HERO_PALETTE, rows: heroRows(HERO_LEGS_LEFT, 1) },
  { palette: HERO_PALETTE, rows: heroRows(HERO_LEGS_STAND, 0) },
  { palette: HERO_PALETTE, rows: heroRows(HERO_LEGS_RIGHT, 1) },
];

/* ------------------------------------------------------------------ */
/* Portrait and sticker                                                */
/* ------------------------------------------------------------------ */

export const PORTRAIT_ART: SpriteArt = {
  palette: HERO_PALETTE,
  rows: [
    '................................',
    '............kkkkkkkk............',
    '..........kkCCCCCCCCkk..........',
    '.........kCCllllllCCCCk.........',
    '........kCCllllllllCCCCk........',
    '.......kCCcllllllllCCCCCk.......',
    '......kkkkkkkkkkkkkkkkkkkk......',
    '......kdddddddddddddddddddk.....',
    '..........khhhhhhhhhhk..........',
    '.........khhssssssssshk.........',
    '........khhssssssssssssk........',
    '........khshhhhsshhhhssk........',
    '........khseeppsseeppssk........',
    '........khseeppsseeppssk........',
    '........khsssssSSssssssk........',
    '........khsssssSSSSssssk........',
    '.........ksskmmmmmmksssk........',
    '..........ksskkkkkksssk.........',
    '...........kkkkkkkkkkk..........',
    '..........kjjjjjwwjjjjjk........',
    '.........kjjjjjjwwjjjjjjk.......',
    '.........kjJjjjjwwjjjjjJk.......',
    '.........kjJjjjjwwjjjjjJk.......',
    '.........kjJjjjjjjjjjjjJk.......',
    '.........kkkkkkkkkkkkkkkk.......',
    '................................',
    '................................',
    '................................',
    '................................',
    '................................',
    '................................',
    '................................',
  ],
};



export const STICKER_HEART_ART: SpriteArt = {
  palette: ITEM_PALETTE,
  rows: [
    '................................',
    '................................',
    '................................',
    '................................',
    '................................',
    '................................',
    '................................',
    '........kkkk......kkkk.y........',
    '......kkrRyRkkkkkkrRRRyyy.......',
    '.....krRRyyyRRRRRRRRRRRyk.......',
    '....krRRRRyRRRRRRRRRRRRRRk......',
    '....krRRRRRRRRRRRRRRRRRRRk......',
    '....kdrRRRRRRRRRRRRRRRRRdk......',
    '.....kdrRRRRRRRRRRRRRRRdk.......',
    '......kdrRRRRRRRRRRRRRdk........',
    '.......kdrRRRRRRRRRRRdk.........',
    '........kdrRRRRRRRRRdk..........',
    '.........kdrRRRRRRRdk...........',
    '..........kdrRRRRRdk............',
    '...........kdrRRRdk.............',
    '............kdrRdk..............',
    '.............kddk...............',
    '..............kk................',
    '................................',
    '................................',
    '................................',
    '................................',
    '................................',
    '................................',
    '................................',
    '................................',
    '................................',
  ],
};


/* ------------------------------------------------------------------ */
/* Flame - eight-frame loop                                            */
/* ------------------------------------------------------------------ */

const FLAME_PALETTE: SpritePalette = {
  k: '#1a0d12',
  r: '#e0523f',
  R: '#ff8a4a',
  y: '#ffc94d',
  Y: '#fff0a8',
  w: '#ffffff',
};

export const FLAME_ART_B: SpriteArt = {
  palette: FLAME_PALETTE,
  rows: [
    '................',
    '.......kk.......',
    '......krrk......',
    '.....krRRrk.....',
    '.....krRRrk.....',
    '....krRyyRrk....',
    '....krRyyRrk....',
    '...krRyYYyRrk...',
    '...kryYYYYyrk...',
    '..krRyYwwYyRrk..',
    '..kryYYwwYYyrk..',
    '..krRyYYYYyRrk..',
    '...kryYYYYyrk...',
    '....kryYYyrk....',
    '.....kkkkkk.....',
    '................',
  ],
};

export const FLAME_ART_C: SpriteArt = {
  palette: FLAME_PALETTE,
  rows: [
    '................',
    '......kk........',
    '.....krrk.......',
    '....krRRrk......',
    '...krRRRRrk.....',
    '...krRRyyRrk....',
    '..krRRRyyRRrk...',
    '..krRyYYyyRRrk..',
    '..kryYYYYyyRrk..',
    '..krRyYwwYYyrk..',
    '...kryYwwYYyrk..',
    '...krRyYYYYyrk..',
    '....kryYYYyrk...',
    '.....kryYYyrk...',
    '......kkkkk.....',
    '................',
  ],
};

export const FLAME_ART: SpriteArt = {
  palette: FLAME_PALETTE,
  rows: [
    '................',
    '.......kk.......',
    '......krrk......',
    '.....krRRrk.....',
    '....krRRRRrk....',
    '....krRyyRrk....',
    '...krRRyyRRrk...',
    '...kryYYyyRrk...',
    '..krRyYYYYyRrk..',
    '..kryYYwwYYyrk..',
    '..kryYYwwYYyrk..',
    '..krRyYYYYyRrk..',
    '...kryYYYYyrk...',
    '....kryYYyrk....',
    '.....kkkkkk.....',
    '................',
  ],
};
