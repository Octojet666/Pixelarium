import { describe, expect, it } from 'vitest';
import { createProject } from './document';
import { setPixelRaw } from './pixel';
import { deserializeProject, serializeProjectToString } from './serialize';
import {
  addProp,
  applyLight,
  applyVignette,
  blitProp,
  composeScene,
  emptyScene,
  paintBackdrop,
  propAt,
  propBounds,
  removeProp,
  reorderProp,
  updateProp,
  validateScene,
  type SceneDoc,
} from './scene';

const makeDoc = (width = 2, height = 2) => {
  const doc = createProject({ name: 'Sprite', width, height });
  const cel = doc.frames[0].cels[doc.layers[0].id];
  setPixelRaw(cel, width, height, 0, 0, [255, 0, 0, 255]);
  return doc;
};

const sceneWith = (width: number, height: number, props: SceneDoc['props'] = []): SceneDoc => ({
  width,
  height,
  backdrop: { kind: 'flat', from: '#000000', to: '#000000', dither: false },
  props,
  fx: { vignette: 0, light: null },
});

const pixel = (pixels: Uint8ClampedArray, width: number, x: number, y: number) => {
  const i = (y * width + x) * 4;
  return [pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]];
};

describe('backdrop', () => {
  it('fills a flat backdrop opaquely', () => {
    const pixels = new Uint8ClampedArray(4 * 4 * 4);
    paintBackdrop(pixels, 4, 4, { kind: 'flat', from: '#336699', to: '#ff0000', dither: false });
    expect(pixel(pixels, 4, 0, 0)).toEqual([0x33, 0x66, 0x99, 255]);
    expect(pixel(pixels, 4, 3, 3)).toEqual([0x33, 0x66, 0x99, 255]);
  });

  it('interpolates a vertical gradient between the two stops', () => {
    const pixels = new Uint8ClampedArray(8 * 8 * 4);
    paintBackdrop(pixels, 8, 8, { kind: 'vertical', from: '#000000', to: '#ffffff', dither: false });
    expect(pixel(pixels, 8, 0, 0)[0]).toBe(0);
    expect(pixel(pixels, 8, 0, 7)[0]).toBe(255);
    expect(pixel(pixels, 8, 0, 3)[0]).toBeGreaterThan(0);
    expect(pixel(pixels, 8, 0, 3)[0]).toBeLessThan(255);
  });

  it('keeps a dithered gradient to the two palette colours', () => {
    const pixels = new Uint8ClampedArray(16 * 16 * 4);
    paintBackdrop(pixels, 16, 16, { kind: 'vertical', from: '#101010', to: '#f0f0f0', dither: true });
    const seen = new Set<string>();
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) seen.add(pixel(pixels, 16, x, y).join(','));
    expect(seen.size).toBe(2);
  });
});

describe('sprite blitting', () => {
  it('scales a sprite block by block and reports its bounds', () => {
    const sprite = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 9, 9, 9, 255]);
    const dest = new Uint8ClampedArray(6 * 6 * 4);
    paintBackdrop(dest, 6, 6, { kind: 'flat', from: '#000000', to: '#000000', dither: false });
    const rect = blitProp(dest, 6, 6, { pixels: sprite, width: 2, height: 2 }, {
      id: 'p',
      name: 'p',
      frame: 0,
      x: 1,
      y: 1,
      scale: 2,
      flipX: false,
      opacity: 100,
    });
    expect(rect).toEqual({ x: 1, y: 1, w: 4, h: 4 });
    expect(pixel(dest, 6, 1, 1)[0]).toBe(255);
    expect(pixel(dest, 6, 2, 2)[0]).toBe(255);
    expect(pixel(dest, 6, 5, 5)).toEqual([0, 0, 0, 255]);
  });

  it('mirrors horizontally when flipped', () => {
    const sprite = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]);
    const dest = new Uint8ClampedArray(2 * 1 * 4);
    blitProp(dest, 2, 1, { pixels: sprite, width: 2, height: 1 }, {
      id: 'p',
      name: 'p',
      frame: 0,
      x: 0,
      y: 0,
      scale: 1,
      flipX: true,
      opacity: 100,
    });
    expect(pixel(dest, 2, 0, 0)[1]).toBe(255);
    expect(pixel(dest, 2, 1, 0)[0]).toBe(255);
  });

  it('clips sprites that run off the scene edge', () => {
    const sprite = new Uint8ClampedArray([255, 255, 255, 255]);
    const dest = new Uint8ClampedArray(2 * 2 * 4);
    expect(() =>
      blitProp(dest, 2, 2, { pixels: sprite, width: 1, height: 1 }, {
        id: 'p',
        name: 'p',
        frame: 0,
        x: -1,
        y: -1,
        scale: 1,
        flipX: false,
        opacity: 100,
      }),
    ).not.toThrow();
    expect(pixel(dest, 2, 0, 0)).toEqual([0, 0, 0, 0]);
  });
});

describe('composition', () => {
  it('draws the project frame over the backdrop', () => {
    const doc = makeDoc();
    const scene: SceneDoc = {
      ...sceneWith(4, 4),
      props: [
        { id: 'a', name: 'a', frame: 0, x: 1, y: 1, scale: 2, flipX: false, opacity: 100 },
      ],
    };
    const out = composeScene(doc, scene);
    expect(pixel(out, 4, 1, 1)).toEqual([255, 0, 0, 255]);
    expect(pixel(out, 4, 0, 0)).toEqual([0, 0, 0, 255]);
  });

  it('paints props in list order, so later entries sit on top', () => {
    const doc = makeDoc(1, 1);
    const back: SceneDoc = {
      ...sceneWith(2, 2),
      props: [
        { id: 'a', name: 'a', frame: 0, x: 0, y: 0, scale: 1, flipX: false, opacity: 100 },
        { id: 'b', name: 'b', frame: 0, x: 0, y: 0, scale: 1, flipX: false, opacity: 100 },
      ],
    };
    const out = composeScene(doc, back);
    expect(pixel(out, 2, 0, 0)).toEqual([255, 0, 0, 255]);
  });

  it('applies a light and a vignette after the sprites', () => {
    const doc = makeDoc();
    const scene: SceneDoc = {
      ...sceneWith(8, 8),
      fx: { vignette: 80, light: { x: 4, y: 4, radius: 3, color: '#ffffff', strength: 100 } },
    };
    const out = composeScene(doc, scene);
    const centre = pixel(out, 8, 4, 4)[0];
    const corner = pixel(out, 8, 0, 0)[0];
    expect(centre).toBeGreaterThan(corner);
  });

  it('darkens corners more than the centre with a vignette', () => {
    const pixels = new Uint8ClampedArray(9 * 9 * 4).fill(200);
    applyVignette(pixels, 9, 9, 100);
    expect(pixel(pixels, 9, 4, 4)[0]).toBeGreaterThan(190);
    expect(pixel(pixels, 9, 0, 0)[0]).toBeLessThan(80);
  });

  it('adds light only inside its radius', () => {
    const pixels = new Uint8ClampedArray(9 * 9 * 4).fill(0);
    for (let i = 3; i < pixels.length; i += 4) pixels[i] = 255;
    applyLight(pixels, 9, 9, { x: 4, y: 4, radius: 2, color: '#ffffff', strength: 100 });
    expect(pixel(pixels, 9, 4, 4)[0]).toBeGreaterThan(0);
    expect(pixel(pixels, 9, 0, 0)[0]).toBe(0);
  });
});

describe('scene editing', () => {
  it('centres a starter sprite when a scene is created', () => {
    const doc = makeDoc(4, 4);
    const scene = emptyScene(doc);
    expect(scene.props).toHaveLength(1);
    expect(scene.width).toBe(16);
    expect(scene.props[0].x).toBe((16 - 8) / 2);
  });

  it('adds, updates and removes props while keeping ids stable', () => {
    const doc = makeDoc(4, 4);
    let scene = emptyScene(doc, 16, 16);
    scene = addProp(scene, doc, { name: 'second', frame: 0, scale: 1 });
    expect(scene.props).toHaveLength(2);
    const id = scene.props[1].id;
    scene = updateProp(scene, id, { x: 3, y: 2, scale: 3 });
    expect(scene.props[1]).toMatchObject({ id, x: 3, y: 2, scale: 3 });
    scene = removeProp(scene, id);
    expect(scene.props).toHaveLength(1);
  });

  it('reorders props without losing any', () => {
    const doc = makeDoc();
    let scene = sceneWith(8, 8);
    scene = addProp(scene, doc, { name: 'a' });
    scene = addProp(scene, doc, { name: 'b' });
    const base = scene;
    const before = base.props.map((p) => p.id);
    scene = reorderProp(base, before[1], -1);
    expect(scene.props.map((p) => p.id)).toEqual([before[1], before[0]]);
    // The first prop cannot move further back, so the original scene comes back untouched.
    expect(reorderProp(base, before[0], -1)).toBe(base);
  });

  it('hit-tests the topmost prop under a point', () => {
    const doc = makeDoc(2, 2);
    const scene: SceneDoc = {
      ...sceneWith(8, 8),
      props: [
        { id: 'low', name: 'low', frame: 0, x: 0, y: 0, scale: 2, flipX: false, opacity: 100 },
        { id: 'top', name: 'top', frame: 0, x: 2, y: 2, scale: 2, flipX: false, opacity: 100 },
      ],
    };
    expect(propAt(doc, scene, 3, 3)?.id).toBe('top');
    expect(propAt(doc, scene, 1, 1)?.id).toBe('low');
    expect(propAt(doc, scene, 7, 7)).toBeNull();
    expect(propBounds(doc, scene.props[1])).toEqual({ x: 2, y: 2, w: 4, h: 4 });
  });

  it('survives a .pxl round trip and repairs broken values', () => {
    const doc = makeDoc(4, 4);
    const scene: SceneDoc = {
      ...sceneWith(32, 24),
      backdrop: { kind: 'radial', from: '#101010', to: '#404040', dither: true },
      props: [{ id: 'hero', name: 'hero', frame: 0, x: 4, y: 6, scale: 3, flipX: true, opacity: 70 }],
      fx: { vignette: 25, light: { x: 8, y: 9, radius: 12, color: '#ffe6a8', strength: 40 } },
    };
    doc.scene = scene;
    const restored = deserializeProject(JSON.parse(serializeProjectToString(doc)));
    expect(restored.scene).toEqual(scene);

    const file = JSON.parse(serializeProjectToString(doc));
    const repaired = deserializeProject({
      ...file,
      document: {
        ...file.document,
        scene: {
          width: 9999,
          height: -4,
          props: [{ id: 'hero', frame: -3, scale: 99, opacity: 400 }],
          backdrop: { kind: 'nope', from: 'red' },
        },
      },
    });
    const broken = { scene: repaired.scene };
    expect(broken.scene?.width).toBe(1024);
    expect(broken.scene?.height).toBe(8);
    expect(broken.scene?.props[0].scale).toBe(8);
    expect(broken.scene?.props[0].opacity).toBe(100);
    expect(broken.scene?.props[0].frame).toBe(0);
    expect(broken.scene?.backdrop.kind).toBe('vertical');
    expect(broken.scene?.backdrop.from).toBe('#151224');
  });

  it('flags an empty scene and sprites placed outside the scene', () => {
    const doc = makeDoc(2, 2);
    expect(validateScene(doc, sceneWith(8, 8))[0]).toMatch(/no sprites/i);
    const scene: SceneDoc = {
      ...sceneWith(8, 8),
      props: [{ id: 'a', name: 'off', frame: 0, x: 20, y: 20, scale: 1, flipX: false, opacity: 100 }],
    };
    expect(validateScene(doc, scene).some((p) => p.includes('outside'))).toBe(true);
  });
});
