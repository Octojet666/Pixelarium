/**
 * Generates the PWA icon set from the Pixelarium mark.
 * Pure Node (no image dependencies): draws on an RGBA buffer and writes PNG
 * chunks with zlib compression. Run: node scripts/generate-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const BG = [15, 14, 21, 255];
const BLOCKS = [
  [6, 6, 8, 8, [245, 185, 66, 255]],
  [14, 6, 6, 6, [255, 122, 89, 255]],
  [20, 12, 6, 6, [176, 108, 255, 255]],
  [12, 16, 8, 8, [79, 209, 224, 255]],
  [6, 20, 6, 6, [141, 138, 163, 255]],
];

function blend(dst, i, src) {
  const a = src[3] / 255;
  dst[i] = Math.round(src[0] * a + dst[i] * (1 - a));
  dst[i + 1] = Math.round(src[1] * a + dst[i + 1] * (1 - a));
  dst[i + 2] = Math.round(src[2] * a + dst[i + 2] * (1 - a));
  dst[i + 3] = Math.max(dst[i + 3], src[3]);
}

function roundedCoverage(px, py, w, h, radius, ss = 4) {
  let hits = 0;
  for (let sy = 0; sy < ss; sy++) {
    for (let sx = 0; sx < ss; sx++) {
      const x = px + (sx + 0.5) / ss;
      const y = py + (sy + 0.5) / ss;
      const cx = Math.min(Math.max(x, radius), w - radius);
      const cy = Math.min(Math.max(y, radius), h - radius);
      if ((x - cx) ** 2 + (y - cy) ** 2 <= radius * radius) hits++;
    }
  }
  return hits / (ss * ss);
}

function render(size, { maskable = false } = {}) {
  const w = size;
  const h = size;
  const data = new Uint8Array(w * h * 4);
  const scale = (maskable ? size * 0.72 : size) / 32;
  const offset = maskable ? (size - 32 * scale) / 2 : 0;
  const radius = (maskable ? 0 : (7 / 32) * size);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const coverage = radius > 0 ? roundedCoverage(x, y, w, h, radius) : 1;
      data[i] = BG[0];
      data[i + 1] = BG[1];
      data[i + 2] = BG[2];
      data[i + 3] = Math.round(BG[3] * coverage);
    }
  }

  for (const [bx, by, bw, bh, color] of BLOCKS) {
    for (let y = 0; y < Math.ceil(bh * scale); y++) {
      for (let x = 0; x < Math.ceil(bw * scale); x++) {
        const px = Math.floor(offset + (bx + x / scale) * scale);
        const py = Math.floor(offset + (by + y / scale) * scale);
        if (px < 0 || py < 0 || px >= w || py >= h) continue;
        const i = (py * w + px) * 4;
        const coverage = radius > 0 ? roundedCoverage(px + 0.5, py + 0.5, w, h, radius) : 1;
        if (coverage <= 0) continue;
        const current = [data[i], data[i + 1], data[i + 2], Math.round(data[i + 3] / Math.max(coverage, 0.001))];
        blend(data, i, [color[0], color[1], color[2], Math.round(color[3] * coverage)]);
        if (current[3] === 0) data[i + 3] = Math.round(255 * coverage);
      }
    }
  }
  return data;
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function toPng(data, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    Buffer.from(data.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const targets = [
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['icon-maskable-512.png', 512, { maskable: true }],
  ['apple-touch-icon.png', 180, {}],
  ['favicon-32.png', 32, {}],
];

mkdirSync(resolve(root, 'public/icons'), { recursive: true });
for (const [name, size, opts] of targets) {
  const png = toPng(render(size, opts), size);
  writeFileSync(resolve(root, 'public/icons', name), png);
  console.log(`icons/${name}  ${size}×${size}  ${(png.length / 1024).toFixed(1)} KB`);
}
writeFileSync(resolve(root, 'public/og-cover.png'), toPng(render(512), 512));
console.log('og-cover.png  512×512');
