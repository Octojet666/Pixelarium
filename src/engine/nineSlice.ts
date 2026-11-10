/**
 * Nine-slice rendering: corners stay pixel-exact, edges and the center stretch or
 * tile to fill any target size. Used by the nine-slice preview dialog and export.
 */

import type { NineSliceInsets } from '../types';

interface AxisSegment {
  srcStart: number;
  srcLen: number;
  dstStart: number;
  dstLen: number;
}

function axisSegments(total: number, first: number, last: number, target: number): AxisSegment[] {
  const t = Math.max(1, Math.round(target));
  let a = Math.max(0, Math.min(total - 1, Math.round(first)));
  let b = Math.max(0, Math.min(total - 1 - a, Math.round(last)));
  // A target smaller than the two borders cannot keep both intact; scale them down.
  if (a + b > t) {
    const scale = t / (a + b);
    a = Math.floor(a * scale);
    b = Math.min(t - a, Math.floor(b * scale));
  }
  return [
    { srcStart: 0, srcLen: a, dstStart: 0, dstLen: a },
    { srcStart: a, srcLen: Math.max(0, total - a - b), dstStart: a, dstLen: Math.max(0, t - a - b) },
    { srcStart: total - b, srcLen: b, dstStart: t - b, dstLen: b },
  ];
}

/** Nearest-neighbour sample inside one segment; exact 1:1 when the lengths match. */
function mapIndex(segment: AxisSegment, dst: number): number | null {
  if (segment.dstLen <= 0 || segment.srcLen <= 0) return null;
  const offset = dst - segment.dstStart;
  if (offset < 0 || offset >= segment.dstLen) return null;
  const src = segment.srcStart + Math.min(segment.srcLen - 1, Math.floor((offset / segment.dstLen) * segment.srcLen));
  return src;
}

export function renderNineSlice(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  insets: NineSliceInsets,
  targetWidth: number,
  targetHeight: number,
): Uint8ClampedArray {
  const outW = Math.max(1, Math.round(targetWidth));
  const outH = Math.max(1, Math.round(targetHeight));
  const cols = axisSegments(width, insets.left, insets.right, outW);
  const rows = axisSegments(height, insets.top, insets.bottom, outH);
  const out = new Uint8ClampedArray(outW * outH * 4);

  for (let y = 0; y < outH; y++) {
    let srcY: number | null = null;
    for (const row of rows) {
      const mapped = mapIndex(row, y);
      if (mapped !== null) {
        srcY = mapped;
        break;
      }
    }
    if (srcY === null) continue;
    for (let x = 0; x < outW; x++) {
      let srcX: number | null = null;
      for (const col of cols) {
        const mapped = mapIndex(col, x);
        if (mapped !== null) {
          srcX = mapped;
          break;
        }
      }
      if (srcX === null) continue;
      const si = (srcY * width + srcX) * 4;
      const di = (y * outW + x) * 4;
      out[di] = source[si];
      out[di + 1] = source[si + 1];
      out[di + 2] = source[si + 2];
      out[di + 3] = source[si + 3];
    }
  }
  return out;
}

/** Reasonable starting insets: a third of each edge, at least one pixel. */
export function defaultNineSlice(width: number, height: number): NineSliceInsets {
  return {
    left: Math.max(1, Math.floor(width / 3)),
    right: Math.max(1, Math.floor(width / 3)),
    top: Math.max(1, Math.floor(height / 3)),
    bottom: Math.max(1, Math.floor(height / 3)),
  };
}
