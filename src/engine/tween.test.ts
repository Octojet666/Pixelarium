import { describe, expect, it } from 'vitest';
import { MAX_TWEEN_FRAMES, blendCels, celsMatch, easeTween, tweenSteps } from './tween';

const solid = (r: number, g: number, b: number, a = 255, pixels = 1) => {
  const cel = new Uint8ClampedArray(pixels * 4);
  for (let i = 0; i < pixels; i++) {
    cel[i * 4] = r;
    cel[i * 4 + 1] = g;
    cel[i * 4 + 2] = b;
    cel[i * 4 + 3] = a;
  }
  return cel;
};

describe('tween easing', () => {
  it('pins both ends and stays monotonic in between', () => {
    for (const easing of ['linear', 'easeIn', 'easeOut', 'easeInOut'] as const) {
      expect(easeTween(0, easing)).toBe(0);
      expect(easeTween(1, easing)).toBe(1);
      let previous = -1;
      for (let i = 0; i <= 10; i++) {
        const value = easeTween(i / 10, easing);
        expect(value).toBeGreaterThanOrEqual(previous);
        previous = value;
      }
    }
  });

  it('clamps values outside 0..1 instead of overshooting', () => {
    expect(easeTween(-2)).toBe(0);
    expect(easeTween(4)).toBe(1);
  });

  it('spaces the generated beats evenly between the two keys', () => {
    expect(tweenSteps(3, 'linear')).toEqual([0.25, 0.5, 0.75]);
    expect(tweenSteps(1, 'linear')).toEqual([0.5]);
    expect(tweenSteps(0)).toEqual([]);
  });

  it('caps the number of generated frames', () => {
    expect(tweenSteps(10_000)).toHaveLength(MAX_TWEEN_FRAMES);
  });
});

describe('cel blending', () => {
  it('returns the endpoints untouched', () => {
    const a = solid(255, 0, 0);
    const b = solid(0, 0, 255);
    expect(Array.from(blendCels(a, b, 0))).toEqual(Array.from(a));
    expect(Array.from(blendCels(a, b, 1))).toEqual(Array.from(b));
  });

  it('mixes colours at the halfway point', () => {
    const mid = blendCels(solid(0, 0, 0), solid(200, 100, 40), 0.5);
    expect(Array.from(mid)).toEqual([100, 50, 20, 255]);
  });

  it('keeps the colour of the visible side when blending into transparency', () => {
    // A naive RGBA lerp would darken an opaque red towards the transparent cel's zeroed channels and
    // fringe the sprite with black. Premultiplied blending must keep the hue and only fade alpha.
    const mid = blendCels(solid(255, 40, 20), solid(0, 0, 0, 0), 0.5);
    expect(mid[0]).toBe(255);
    expect(mid[1]).toBe(40);
    expect(mid[2]).toBe(20);
    expect(mid[3]).toBe(128);
  });

  it('stays fully transparent when both sides are empty', () => {
    const empty = blendCels(solid(0, 0, 0, 0), null, 0.5);
    expect(Array.from(empty)).toEqual([0, 0, 0, 0]);
  });

  it('treats a missing cel as empty on either side', () => {
    expect(blendCels(null, solid(10, 20, 30), 1)[3]).toBe(255);
    expect(blendCels(undefined, solid(10, 20, 30), 0)[3]).toBe(0);
  });

  it('compares cels by content, not identity', () => {
    expect(celsMatch(solid(1, 2, 3), solid(1, 2, 3))).toBe(true);
    expect(celsMatch(solid(1, 2, 3), solid(1, 2, 4))).toBe(false);
    expect(celsMatch(null, solid(1, 2, 3))).toBe(false);
  });
});
