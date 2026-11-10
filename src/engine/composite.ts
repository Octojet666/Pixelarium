/** Layer compositing with blend modes. Runs outside React and is safe to call per frame. */

import type { BlendMode, Layer, ProjectDoc, Rect } from '../types';

function blendChannel(mode: BlendMode, b: number, s: number): number {
  switch (mode) {
    case 'multiply':
      return (b * s) / 255;
    case 'screen':
      return 255 - ((255 - b) * (255 - s)) / 255;
    case 'overlay':
      return b < 128 ? (2 * b * s) / 255 : 255 - (2 * (255 - b) * (255 - s)) / 255;
    case 'add':
      return Math.min(255, b + s);
    case 'subtract':
      return Math.max(0, b - s);
    case 'darken':
      return Math.min(b, s);
    case 'lighten':
      return Math.max(b, s);
    case 'difference':
      return Math.abs(b - s);
    case 'normal':
    default:
      return s;
  }
}

export interface CompositeOptions {
  /** Restrict work to this rectangle (dirty-region rendering). */
  dirty?: Rect;
  /** Composite only these layers (used for isolated previews). */
  layers?: Layer[];
  /** Draw a solid backdrop first (used by exports/previews). */
  background?: [number, number, number, number];
  /** Override per-layer visibility (onion skin etc.). */
  skipLayerId?: string;
}

/**
 * Composites the visible layers of one frame into an RGBA buffer.
 * `target` may be reused between calls to avoid allocations.
 */
export function compositeFrame(
  doc: ProjectDoc,
  frameIndex: number,
  target?: Uint8ClampedArray,
  opts: CompositeOptions = {},
): Uint8ClampedArray {
  const { width, height } = doc;
  const out = target && target.length === width * height * 4 ? target : new Uint8ClampedArray(width * height * 4);
  const frame = doc.frames[frameIndex];
  const layers = opts.layers ?? doc.layers;
  const dirty = opts.dirty ?? { x: 0, y: 0, w: width, h: height };
  const x0 = Math.max(0, dirty.x);
  const y0 = Math.max(0, dirty.y);
  const x1 = Math.min(width, dirty.x + dirty.w);
  const y1 = Math.min(height, dirty.y + dirty.h);

  for (let y = y0; y < y1; y++) {
    const rowStart = (y * width + x0) * 4;
    out.fill(0, rowStart, (y * width + x1) * 4);
  }

  if (opts.background) {
    const [r, g, b, a] = opts.background;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * width + x) * 4;
        out[i] = r;
        out[i + 1] = g;
        out[i + 2] = b;
        out[i + 3] = a;
      }
    }
  }

  if (!frame) return out;

  for (const layer of layers) {
    if (!layer.visible || layer.opacity <= 0) continue;
    if (opts.skipLayerId && layer.id === opts.skipLayerId) continue;
    const cel = frame.cels[layer.id];
    if (!cel) continue;
    const opacity = layer.opacity / 255;
    const mode = layer.blend;

    for (let y = y0; y < y1; y++) {
      let si = (y * width + x0) * 4;
      for (let x = x0; x < x1; x++, si += 4) {
        const sa = (cel[si + 3] / 255) * opacity;
        if (sa <= 0) continue;
        const dr = out[si];
        const dg = out[si + 1];
        const db = out[si + 2];
        const da = out[si + 3] / 255;
        const sr = cel[si];
        const sg = cel[si + 1];
        const sb = cel[si + 2];
        if (mode !== 'normal' && da > 0) {
          // W3C compositing: Co = (1 - ab)*as*Cs + ab*as*B(Cb,Cs) + (1 - as)*ab*Cb
          const outA = sa + da * (1 - sa);
          const k = da * sa;
          const backdrop = da * (1 - sa);
          out[si] = clamp255((1 - da) * sa * sr + k * blendChannel(mode, dr, sr) + backdrop * dr);
          out[si + 1] = clamp255((1 - da) * sa * sg + k * blendChannel(mode, dg, sg) + backdrop * dg);
          out[si + 2] = clamp255((1 - da) * sa * sb + k * blendChannel(mode, db, sb) + backdrop * db);
          out[si + 3] = clamp255(outA * 255);
        } else if (sa >= 0.999 && da === 0) {
          out[si] = sr;
          out[si + 1] = sg;
          out[si + 2] = sb;
          out[si + 3] = 255;
        } else {
          const outA = sa + da * (1 - sa);
          if (outA <= 0) continue;
          out[si] = clamp255((sr * sa + dr * da * (1 - sa)) / outA);
          out[si + 1] = clamp255((sg * sa + dg * da * (1 - sa)) / outA);
          out[si + 2] = clamp255((sb * sa + db * da * (1 - sa)) / outA);
          out[si + 3] = clamp255(outA * 255);
        }
      }
    }
  }
  return out;
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

/** Tint a copy of pixel data toward `tint` (onion skin ghosts). */
export function tintPixels(
  pixels: Uint8ClampedArray,
  tint: [number, number, number],
  strength: number,
  alpha: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(pixels.length);
  for (let i = 0; i < pixels.length; i += 4) {
    const a = pixels[i + 3];
    if (a === 0) continue;
    out[i] = pixels[i] + (tint[0] - pixels[i]) * strength;
    out[i + 1] = pixels[i + 1] + (tint[1] - pixels[i + 1]) * strength;
    out[i + 2] = pixels[i + 2] + (tint[2] - pixels[i + 2]) * strength;
    out[i + 3] = (a / 255) * alpha * 255;
  }
  return out;
}

/** Flatten a frame for export/thumbnail purposes. */
export function frameToPixels(doc: ProjectDoc, frameIndex: number, background?: [number, number, number, number]) {
  return compositeFrame(doc, frameIndex, undefined, { background });
}
