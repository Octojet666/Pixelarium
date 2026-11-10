/**
 * Minimal, dependency-free GIF89a encoder.
 *
 * Builds a global palette from all frames (median cut), maps pixels with optional
 * dithering, and writes animated frames with a transparent color index and a
 * Netscape looping extension.
 */

import { hexToRgb } from './color';
import { applyPalette, extractPalette, nearestPaletteColor, type DitherMethod } from './quantize';

export interface GifFrame {
  pixels: Uint8ClampedArray; // RGBA
  delayCs: number; // centiseconds
}

export interface GifOptions {
  width: number;
  height: number;
  loop?: boolean;
  dither?: DitherMethod;
  /** Use the project's own palette instead of quantizing. */
  palette?: string[];
  maxColors?: number;
}

function writeU16(out: number[], value: number) {
  out.push(value & 255, (value >> 8) & 255);
}

function writeSubBlocks(out: number[], data: Uint8Array) {
  const max = 255;
  for (let i = 0; i < data.length; i += max) {
    const chunk = data.subarray(i, i + max);
    out.push(chunk.length);
    for (let j = 0; j < chunk.length; j++) out.push(chunk[j]);
  }
  out.push(0);
}

/** GIF LZW compression. `minCodeSize` must be >= 2. */
export function lzwEncode(indices: Uint8Array, minCodeSize: number): Uint8Array {
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;
  let codeSize = minCodeSize + 1;
  let nextCode = eoiCode + 1;
  let dict = new Map<string, number>();
  const out: number[] = [];
  let bitBuffer = 0;
  let bitCount = 0;

  const emit = (code: number) => {
    bitBuffer |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      out.push(bitBuffer & 255);
      bitBuffer >>= 8;
      bitCount -= 8;
    }
  };

  const resetDict = () => {
    dict = new Map();
    codeSize = minCodeSize + 1;
    nextCode = eoiCode + 1;
  };

  emit(clearCode);
  resetDict();

  if (indices.length === 0) {
    emit(eoiCode);
  } else {
    let prefix = indices[0];
    for (let i = 1; i < indices.length; i++) {
      const k = indices[i];
      const key = `${prefix}:${k}`;
      const found = dict.get(key);
      if (found !== undefined) {
        prefix = found;
        continue;
      }
      emit(prefix);
      if (nextCode < 4096) {
        dict.set(key, nextCode++);
        if (nextCode > (1 << codeSize) && codeSize < 12) codeSize++;
      } else {
        emit(clearCode);
        resetDict();
      }
      prefix = k;
    }
    emit(prefix);
    emit(eoiCode);
  }
  if (bitCount > 0) out.push(bitBuffer & 255);
  return new Uint8Array(out);
}

export function encodeGif(frames: GifFrame[], options: GifOptions): Uint8Array {
  const { width, height } = options;
  if (frames.length === 0) throw new Error('GIF export needs at least one frame');
  const maxColors = Math.min(255, Math.max(2, options.maxColors ?? 255));

  let palette: string[];
  if (options.palette && options.palette.length > 0) {
    palette = options.palette.slice(0, maxColors);
  } else {
    const combined = new Uint8ClampedArray(frames.length * width * height * 4);
    frames.forEach((f, i) => combined.set(f.pixels, i * width * height * 4));
    palette = extractPalette(combined, maxColors);
    if (palette.length === 0) palette = ['#000000'];
  }

  const transparentIndex = palette.length;
  const tableSize = Math.max(2, nextPow2(palette.length + 1));
  const colorBits = Math.log2(tableSize);

  const out: number[] = [];
  for (const ch of 'GIF89a') out.push(ch.charCodeAt(0));
  writeU16(out, width);
  writeU16(out, height);
  out.push(0x80 | (colorBits - 1)); // global color table, size
  out.push(0); // background index
  out.push(0); // pixel aspect ratio

  for (let i = 0; i < tableSize; i++) {
    const hex = palette[i];
    if (hex) {
      const [r, g, b] = hexToRgb(hex);
      out.push(r, g, b);
    } else {
      out.push(0, 0, 0);
    }
  }

  if (options.loop !== false) {
    out.push(0x21, 0xff, 0x0b);
    for (const ch of 'NETSCAPE2.0') out.push(ch.charCodeAt(0));
    out.push(0x03, 0x01);
    writeU16(out, 0); // loop forever
    out.push(0x00);
  }

  for (const frame of frames) {
    const mapped = applyPalette(frame.pixels, width, height, palette, options.dither ?? 'none');
    const indices = new Uint8Array(width * height);
    for (let p = 0; p < width * height; p++) {
      const i = p * 4;
      if (frame.pixels[i + 3] < 128) {
        indices[p] = transparentIndex;
      } else {
        const nearest = nearestPaletteColor(palette, mapped[i], mapped[i + 1], mapped[i + 2]);
        indices[p] = nearest.index;
      }
    }

    // Graphic control extension: disposal=2 (restore to bg) + transparency
    out.push(0x21, 0xf9, 0x04);
    out.push(0x08 | 0x01);
    writeU16(out, Math.max(1, Math.round(frame.delayCs)));
    out.push(transparentIndex);
    out.push(0x00);

    out.push(0x2c);
    writeU16(out, 0);
    writeU16(out, 0);
    writeU16(out, width);
    writeU16(out, height);
    out.push(0x00); // no local color table, not interlaced

    const minCodeSize = Math.max(2, Math.ceil(Math.log2(tableSize)));
    out.push(minCodeSize);
    writeSubBlocks(out, lzwEncode(indices, minCodeSize));
  }

  out.push(0x3b);
  return new Uint8Array(out);
}

function nextPow2(n: number): number {
  let v = 2;
  while (v < n) v *= 2;
  return v;
}
