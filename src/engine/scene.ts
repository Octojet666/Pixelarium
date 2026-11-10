/**
 * Scene composition engine.
 *
 * A scene is its own document that sits next to the artwork: a backdrop, a list of sprite instances
 * taken from the project's frames, and a small set of effects (vignette, light, gradient dithering).
 * Everything here is pure so the composer can be previewed, tested and exported without React or the
 * canvas DOM - the studio only turns the returned pixels into an image.
 */

import { compositeFrame } from './composite';
import type { ProjectDoc } from '../types';

export type BackdropKind = 'flat' | 'vertical' | 'radial';

export interface SceneBackdrop {
  kind: BackdropKind;
  from: string;
  to: string;
  /** Bayer-dither the gradient instead of interpolating smoothly. */
  dither: boolean;
}

export interface SceneProp {
  id: string;
  name: string;
  /** Frame index this instance draws. */
  frame: number;
  /** Top-left corner in scene pixels, before scaling. */
  x: number;
  y: number;
  /** Whole-number scale keeps the pixels square. */
  scale: number;
  flipX: boolean;
  /** 0–100. */
  opacity: number;
}

export interface SceneLight {
  x: number;
  y: number;
  radius: number;
  color: string;
  /** 0–100. */
  strength: number;
}

export interface SceneFx {
  /** 0–100 darkening towards the corners. */
  vignette: number;
  light: SceneLight | null;
}

export interface SceneDoc {
  width: number;
  height: number;
  backdrop: SceneBackdrop;
  props: SceneProp[];
  fx: SceneFx;
}

export const MAX_SCENE_SIZE = 1024;
export const MAX_PROPS = 64;

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function hexRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
  const n = parseInt(full, 16);
  if (!Number.isFinite(n)) return [0, 0, 0];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/* 4×4 ordered-dither thresholds, the same pattern the palette lab uses. */
const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

/** Mix two colours, dithered or smooth. `t` runs 0 (from) to 1 (to). */
export function mixGradient(
  from: [number, number, number],
  to: [number, number, number],
  t: number,
  x: number,
  y: number,
  dither: boolean,
): [number, number, number] {
  if (!dither) {
    return [
      Math.round(from[0] + (to[0] - from[0]) * t),
      Math.round(from[1] + (to[1] - from[1]) * t),
      Math.round(from[2] + (to[2] - from[2]) * t),
    ];
  }
  const threshold = (BAYER4[y & 3][x & 3] + 0.5) / 16;
  const pick = t > threshold ? 1 : 0;
  return pick ? to : from;
}

function writePixel(pixels: Uint8ClampedArray, width: number, height: number, x: number, y: number, rgb: [number, number, number]) {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const i = (y * width + x) * 4;
  pixels[i] = rgb[0];
  pixels[i + 1] = rgb[1];
  pixels[i + 2] = rgb[2];
  pixels[i + 3] = 255;
}

/** Paints the backdrop across the whole scene surface. */
export function paintBackdrop(pixels: Uint8ClampedArray, width: number, height: number, backdrop: SceneBackdrop): void {
  const from = hexRgb(backdrop.from);
  const to = hexRgb(backdrop.to);
  const cx = width / 2;
  const cy = height / 2;
  const maxDist = Math.hypot(cx, cy) || 1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let t = 0;
      if (backdrop.kind === 'vertical') {
        t = height <= 1 ? 0 : y / (height - 1);
      } else if (backdrop.kind === 'radial') {
        t = clamp(Math.hypot(x - cx, y - cy) / maxDist, 0, 1);
      }
      writePixel(pixels, width, height, x, y, mixGradient(from, to, t, x, y, backdrop.dither));
    }
  }
}

/**
 * Composites one sprite instance onto the scene with nearest-neighbour scaling.
 * Returns the rect it covered, which the studio also uses for hit testing.
 */
export function blitProp(
  dest: Uint8ClampedArray,
  destW: number,
  destH: number,
  sprite: { pixels: Uint8ClampedArray; width: number; height: number },
  prop: SceneProp,
): { x: number; y: number; w: number; h: number } {
  const scale = Math.max(1, Math.round(prop.scale));
  const w = sprite.width * scale;
  const h = sprite.height * scale;
  const opacity = clamp(prop.opacity, 0, 100) / 100;

  for (let sy = 0; sy < sprite.height; sy++) {
    for (let sx = 0; sx < sprite.width; sx++) {
      const src = (sy * sprite.width + sx) * 4;
      const alpha = sprite.pixels[src + 3] * opacity;
      if (alpha <= 0) continue;
      const sourceX = prop.flipX ? sprite.width - 1 - sx : sx;
      const px = prop.x + sourceX * scale;
      const py = prop.y + sy * scale;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const tx = px + dx;
          const ty = py + dy;
          if (tx < 0 || ty < 0 || tx >= destW || ty >= destH) continue;
          const i = (ty * destW + tx) * 4;
          const a = alpha / 255;
          dest[i] = Math.round(sprite.pixels[src] * a + dest[i] * (1 - a));
          dest[i + 1] = Math.round(sprite.pixels[src + 1] * a + dest[i + 1] * (1 - a));
          dest[i + 2] = Math.round(sprite.pixels[src + 2] * a + dest[i + 2] * (1 - a));
          dest[i + 3] = 255;
        }
      }
    }
  }

  return { x: prop.x, y: prop.y, w, h };
}

/** Soft radial light added on top of the composition. */
export function applyLight(pixels: Uint8ClampedArray, width: number, height: number, light: SceneLight): void {
  const [r, g, b] = hexRgb(light.color);
  const radius = Math.max(1, light.radius);
  const strength = clamp(light.strength, 0, 100) / 100;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dist = Math.hypot(x - light.x, y - light.y);
      if (dist >= radius) continue;
      const falloff = (1 - dist / radius) ** 2 * strength;
      const i = (y * width + x) * 4;
      pixels[i] = clamp(pixels[i] + r * falloff, 0, 255);
      pixels[i + 1] = clamp(pixels[i + 1] + g * falloff, 0, 255);
      pixels[i + 2] = clamp(pixels[i + 2] + b * falloff, 0, 255);
    }
  }
}

/** Darkens the corners; keeps the centre of the composition as the focal point. */
export function applyVignette(pixels: Uint8ClampedArray, width: number, height: number, amount: number): void {
  const strength = clamp(amount, 0, 100) / 100;
  if (strength <= 0) return;
  const cx = width / 2;
  const cy = height / 2;
  const maxDist = Math.hypot(cx, cy) || 1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = Math.hypot(x - cx, y - cy) / maxDist;
      const shade = 1 - t * t * strength;
      const i = (y * width + x) * 4;
      pixels[i] = Math.round(pixels[i] * shade);
      pixels[i + 1] = Math.round(pixels[i + 1] * shade);
      pixels[i + 2] = Math.round(pixels[i + 2] * shade);
    }
  }
}

/** Composes the scene into one RGBA buffer. Props paint in list order, bottom first. */
export function composeScene(doc: ProjectDoc, scene: SceneDoc): Uint8ClampedArray {
  const width = Math.max(1, Math.min(MAX_SCENE_SIZE, Math.round(scene.width)));
  const height = Math.max(1, Math.min(MAX_SCENE_SIZE, Math.round(scene.height)));
  const out = new Uint8ClampedArray(width * height * 4);

  paintBackdrop(out, width, height, scene.backdrop);

  const spriteCache = new Map<number, Uint8ClampedArray>();
  for (const prop of scene.props) {
    const frame = Math.max(0, Math.min(doc.frames.length - 1, Math.round(prop.frame)));
    let pixels = spriteCache.get(frame);
    if (!pixels) {
      pixels = compositeFrame(doc, frame);
      spriteCache.set(frame, pixels);
    }
    blitProp(out, width, height, { pixels, width: doc.width, height: doc.height }, { ...prop, frame });
  }

  if (scene.fx.light) applyLight(out, width, height, scene.fx.light);
  applyVignette(out, width, height, scene.fx.vignette);
  return out;
}

/* ------------------------------------------------------------------ */
/* Editing helpers                                                     */
/* ------------------------------------------------------------------ */

/** A scene sized around the artwork, with the current frame already placed in the middle. */
export function emptyScene(doc: ProjectDoc, width?: number, height?: number): SceneDoc {
  const sceneWidth = clamp(Math.round(width ?? doc.width * 4), 8, MAX_SCENE_SIZE);
  const sceneHeight = clamp(Math.round(height ?? doc.height * 4), 8, MAX_SCENE_SIZE);
  const scene: SceneDoc = {
    width: sceneWidth,
    height: sceneHeight,
    backdrop: { kind: 'vertical', from: '#151224', to: '#3a2b52', dither: true },
    props: [],
    fx: { vignette: 0, light: null },
  };
  return addProp(scene, doc, { name: doc.name, frame: 0 });
}

export function addProp(
  scene: SceneDoc,
  doc: ProjectDoc,
  opts: { name?: string; frame?: number; x?: number; y?: number; scale?: number },
): SceneDoc {
  if (scene.props.length >= MAX_PROPS) return scene;
  const scale = clamp(Math.round(opts.scale ?? 2), 1, 8);
  const prop: SceneProp = {
    id: `prop_${scene.props.length}_${Math.random().toString(36).slice(2, 7)}`,
    name: opts.name ?? doc.name,
    frame: clamp(Math.round(opts.frame ?? 0), 0, Math.max(0, doc.frames.length - 1)),
    x: Math.round(opts.x ?? (scene.width - doc.width * scale) / 2),
    y: Math.round(opts.y ?? (scene.height - doc.height * scale) / 2),
    scale,
    flipX: false,
    opacity: 100,
  };
  return { ...scene, props: [...scene.props, prop] };
}

export function updateProp(scene: SceneDoc, id: string, patch: Partial<SceneProp>): SceneDoc {
  return {
    ...scene,
    props: scene.props.map((prop) => (prop.id === id ? { ...prop, ...patch, id: prop.id } : prop)),
  };
}

export function removeProp(scene: SceneDoc, id: string): SceneDoc {
  return { ...scene, props: scene.props.filter((prop) => prop.id !== id) };
}

/** Moves a prop one step towards the back or the front of the paint order. */
export function reorderProp(scene: SceneDoc, id: string, direction: -1 | 1): SceneDoc {
  const index = scene.props.findIndex((prop) => prop.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= scene.props.length) return scene;
  const props = [...scene.props];
  const [moved] = props.splice(index, 1);
  props.splice(target, 0, moved);
  return { ...scene, props };
}

/** Rect a prop covers, used for canvas selection and drag maths. */
export function propBounds(doc: ProjectDoc, prop: SceneProp): { x: number; y: number; w: number; h: number } {
  const scale = Math.max(1, Math.round(prop.scale));
  return { x: prop.x, y: prop.y, w: doc.width * scale, h: doc.height * scale };
}

/** Topmost prop under a scene-space point. */
export function propAt(doc: ProjectDoc, scene: SceneDoc, x: number, y: number): SceneProp | null {
  for (let i = scene.props.length - 1; i >= 0; i--) {
    const rect = propBounds(doc, scene.props[i]);
    if (x >= rect.x && y >= rect.y && x < rect.x + rect.w && y < rect.y + rect.h) return scene.props[i];
  }
  return null;
}

/** Problems that would make an export look wrong rather than stop it. */
export function validateScene(doc: ProjectDoc, scene: SceneDoc): string[] {
  const problems: string[] = [];
  if (scene.props.length === 0) problems.push('The scene has no sprites yet — add one from the project frames.');
  if (scene.width > MAX_SCENE_SIZE || scene.height > MAX_SCENE_SIZE) {
    problems.push(`Scenes are capped at ${MAX_SCENE_SIZE}×${MAX_SCENE_SIZE} pixels.`);
  }
  for (const prop of scene.props) {
    const rect = propBounds(doc, prop);
    if (rect.x + rect.w <= 0 || rect.y + rect.h <= 0 || rect.x >= scene.width || rect.y >= scene.height) {
      problems.push(`“${prop.name}” sits completely outside the scene.`);
    }
  }
  if (scene.fx.light && scene.fx.light.radius <= 0) problems.push('The light has no radius.');
  return problems;
}

export function sceneFilename(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'scene'
  );
}
