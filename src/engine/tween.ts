/**
 * In-betweening for animation frames.
 *
 * Blends pixels in premultiplied alpha so transparent areas do not pick up dark
 * fringes. Easing is applied to the frame positions.
 */

export type TweenEasing = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';

export const TWEEN_EASINGS: { id: TweenEasing; label: string }[] = [
  { id: 'easeInOut', label: 'Ease in-out' },
  { id: 'linear', label: 'Linear' },
  { id: 'easeIn', label: 'Ease in' },
  { id: 'easeOut', label: 'Ease out' },
];

/** Upper bound on generated frames per tween, so a typo cannot lock up the editor. */
export const MAX_TWEEN_FRAMES = 32;

/** Maps a 0..1 position through an easing curve. Values outside the range are clamped. */
export function easeTween(t: number, easing: TweenEasing = 'easeInOut'): number {
  const x = t <= 0 ? 0 : t >= 1 ? 1 : t;
  switch (easing) {
    case 'linear':
      return x;
    case 'easeIn':
      return x * x;
    case 'easeOut':
      return 1 - (1 - x) * (1 - x);
    case 'easeInOut':
    default:
      return x < 0.5 ? 2 * x * x : 1 - 2 * (1 - x) * (1 - x);
  }
}

/**
 * The positions of every generated frame, excluding both ends.
 *
 * A tween of 3 between two keys yields 1/4, 1/2 and 3/4 - evenly spaced beats with the keys kept intact,
 * which is what makes the result loop cleanly back into the next key.
 */
export function tweenSteps(count: number, easing: TweenEasing = 'easeInOut'): number[] {
  const n = Math.max(0, Math.min(MAX_TWEEN_FRAMES, Math.round(count)));
  if (!Number.isFinite(n) || n === 0) return [];
  return Array.from({ length: n }, (_, i) => easeTween((i + 1) / (n + 1), easing));
}

/**
 * Blends two cels at position `t` (0 = a, 1 = b).
 *
 * Colours are weighted by their own alpha before mixing and divided back out afterwards. Straight RGBA
 * interpolation would drag transparent pixels' colour channels into the result and fringe every edge
 * with mud; premultiplying keeps fully transparent pixels transparent and stops opaque edges from
 * darkening. A missing cel counts as empty, so tweening into or out of a blank frame works.
 */
export function blendCels(
  a: Uint8ClampedArray | undefined | null,
  b: Uint8ClampedArray | undefined | null,
  t: number,
): Uint8ClampedArray {
  const length = a?.length ?? b?.length ?? 0;
  const out = new Uint8ClampedArray(length);
  if (length === 0) return out;
  const x = t <= 0 ? 0 : t >= 1 ? 1 : t;
  const inv = 1 - x;

  for (let i = 0; i < length; i += 4) {
    const alphaA = a ? a[i + 3] / 255 : 0;
    const alphaB = b ? b[i + 3] / 255 : 0;
    const alpha = alphaA * inv + alphaB * x;
    out[i + 3] = Math.round(alpha * 255);
    if (alpha <= 0) continue;
    const from = alphaA * inv;
    const to = alphaB * x;
    out[i] = Math.round((((a?.[i] ?? 0) * from) + ((b?.[i] ?? 0) * to)) / alpha);
    out[i + 1] = Math.round((((a?.[i + 1] ?? 0) * from) + ((b?.[i + 1] ?? 0) * to)) / alpha);
    out[i + 2] = Math.round((((a?.[i + 2] ?? 0) * from) + ((b?.[i + 2] ?? 0) * to)) / alpha);
  }

  return out;
}

/** True when the two cels hold byte-identical pixels, so a tween between them can be skipped. */
export function celsMatch(a: Uint8ClampedArray | undefined | null, b: Uint8ClampedArray | undefined | null): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
