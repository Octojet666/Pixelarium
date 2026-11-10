/**
 * Asset packs: turning a project into something another engine can import.
 *
 * A pack has assets (one or more frames each), a sprite-sheet layout and a manifest that records where
 * every asset sits, how long its frames last and which tags it carries. The manifest is plain JSON, so
 * it is as useful to a Godot/Unity importer as it is to a human reading the folder.
 *
 * Pure data and arithmetic only - the canvas work stays in `src/editor/exporting.ts`.
 */

import type { ProjectDoc } from '../types';

export type AssetKind = 'sprite' | 'icon' | 'emote' | 'ui' | 'tile';

export interface PackAsset {
  id: string;
  name: string;
  kind: AssetKind;
  /** Frame indices in the document, in playing order. */
  frames: number[];
  tags: string[];
}

export interface AssetPack {
  name: string;
  namespace: string;
  author: string;
  license: string;
  description: string;
  version: string;
  assets: PackAsset[];
}

export interface SheetRect {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Index of the asset the cell belongs to. */
  asset: number;
  /** Index inside that asset's frame list. */
  frame: number;
}

export interface SheetLayout {
  columns: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
  width: number;
  height: number;
  rects: SheetRect[];
}

export function emptyPack(patch: Partial<AssetPack> = {}): AssetPack {
  return {
    name: 'Pixelarium pack',
    namespace: 'pixelarium_pack',
    author: '',
    license: 'CC0-1.0',
    description: '',
    version: '1.0.0',
    assets: [],
    ...patch,
  };
}

/** Sprite-sheet layout with padding (outer) and spacing (between cells). */
export function planSheet(
  cells: { asset: number; frame: number }[],
  cellWidth: number,
  cellHeight: number,
  columns: number,
  padding = 0,
  spacing = 0,
): SheetLayout {
  const cols = Math.max(1, Math.min(32, Math.round(columns)));
  const rows = Math.max(1, Math.ceil(cells.length / cols));
  const width = padding * 2 + cols * cellWidth + Math.max(0, cols - 1) * spacing;
  const height = padding * 2 + rows * cellHeight + Math.max(0, rows - 1) * spacing;
  const rects: SheetRect[] = cells.map((cell, index) => ({
    x: padding + (index % cols) * (cellWidth + spacing),
    y: padding + Math.floor(index / cols) * (cellHeight + spacing),
    w: cellWidth,
    h: cellHeight,
    asset: cell.asset,
    frame: cell.frame,
  }));
  return { columns: cols, rows, cellWidth, cellHeight, width, height, rects };
}

/** Every frame of the project becomes one cell of one asset, in frame order. */
export function assetsFromDoc(doc: ProjectDoc, kind: AssetKind = 'sprite', name = doc.name): PackAsset[] {
  return [
    {
      id: slug(name) || 'asset',
      name,
      kind,
      frames: doc.frames.map((_, index) => index),
      tags: doc.meta.tags ?? [],
    },
  ];
}

/** Art sheets: each frame is a separate asset, which is how icon sets and item sheets read. */
export function framesAsAssets(doc: ProjectDoc, prefix: string, kind: AssetKind = 'icon'): PackAsset[] {
  return doc.frames.map((frame, index) => ({
    id: `${slug(prefix)}_${index + 1}`,
    name: frame.label?.trim() || `${prefix} ${index + 1}`,
    kind,
    frames: [index],
    tags: [],
  }));
}

/** UI state names for icon variants, in the order the icon studio creates them. */
export const ICON_VARIANTS = ['default', 'hover', 'pressed', 'disabled'] as const;

export const PACK_KINDS: { id: AssetKind; label: string }[] = [
  { id: 'sprite', label: 'Sprite' },
  { id: 'icon', label: 'Icon' },
  { id: 'emote', label: 'Emote' },
  { id: 'ui', label: 'UI' },
  { id: 'tile', label: 'Tile' },
];

export interface ManifestOptions {
  sheetFile: string;
  padding: number;
  spacing: number;
  fps: number;
}

export interface PackManifest {
  format: 'pixelarium.assetpack';
  version: number;
  name: string;
  namespace: string;
  description: string;
  author: string;
  license: string;
  packVersion: string;
  sheet: {
    file: string;
    width: number;
    height: number;
    cellWidth: number;
    cellHeight: number;
    columns: number;
    rows: number;
    padding: number;
    spacing: number;
  };
  assets: {
    id: string;
    name: string;
    kind: AssetKind;
    tags: string[];
    frames: { index: number; x: number; y: number; w: number; h: number; duration: number }[];
  }[];
}

export function buildManifest(
  pack: AssetPack,
  layout: SheetLayout,
  frameDurations: number[],
  options: ManifestOptions,
): PackManifest {
  const assets = pack.assets.map((asset, assetIndex) => {
    const frames = asset.frames.map((frameIndex, order) => {
      const cell = layout.rects.find((rect) => rect.asset === assetIndex && rect.frame === order);
      return {
        index: frameIndex,
        x: cell?.x ?? 0,
        y: cell?.y ?? 0,
        w: cell?.w ?? layout.cellWidth,
        h: cell?.h ?? layout.cellHeight,
        duration: frameDurations[frameIndex] ?? 120,
      };
    });
    return { id: asset.id, name: asset.name, kind: asset.kind, tags: asset.tags, frames };
  });

  return {
    format: 'pixelarium.assetpack',
    version: 1,
    name: pack.name,
    namespace: pack.namespace,
    description: pack.description,
    author: pack.author,
    license: pack.license,
    packVersion: pack.version,
    sheet: {
      file: options.sheetFile,
      width: layout.width,
      height: layout.height,
      cellWidth: layout.cellWidth,
      cellHeight: layout.cellHeight,
      columns: layout.columns,
      rows: layout.rows,
      padding: options.padding,
      spacing: options.spacing,
    },
    assets,
  };
}

/** Total cells a pack needs on its sheet. */
export function packCellCount(pack: AssetPack): number {
  return pack.assets.reduce((sum, asset) => sum + asset.frames.length, 0);
}

/** Cell list in the order the sheet is filled: asset by asset, frames in order. */
export function packCells(pack: AssetPack): { asset: number; frame: number }[] {
  const cells: { asset: number; frame: number }[] = [];
  pack.assets.forEach((asset, assetIndex) => {
    asset.frames.forEach((_, frameIndex) => cells.push({ asset: assetIndex, frame: frameIndex }));
  });
  return cells;
}

/** Suggested sheet columns: square-ish, never wider than eight cells. */
export function autoColumns(count: number): number {
  if (count <= 8) return Math.max(1, count);
  return 8;
}

export function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function packFilename(pack: AssetPack): string {
  return slug(pack.name) || 'asset_pack';
}

/** Problems that would make the exported pack inconsistent. */
export function validatePack(pack: AssetPack, doc: ProjectDoc): string[] {
  const problems: string[] = [];
  if (!pack.name.trim()) problems.push('The pack needs a name.');
  if (!/^[a-z0-9_]+$/.test(pack.namespace)) {
    problems.push('The namespace must be lowercase letters, digits or underscores.');
  }
  if (pack.assets.length === 0) problems.push('Add at least one asset to the pack.');
  const ids = new Set<string>();
  for (const asset of pack.assets) {
    if (!asset.id.trim()) problems.push(`Asset "${asset.name}" has no id.`);
    if (ids.has(asset.id)) problems.push(`Asset id "${asset.id}" is used twice.`);
    ids.add(asset.id);
    if (asset.frames.length === 0) problems.push(`Asset "${asset.name}" has no frames.`);
    for (const frame of asset.frames) {
      if (frame < 0 || frame >= doc.frames.length) {
        problems.push(`Asset "${asset.name}" points at frame ${frame + 1}, which does not exist.`);
      }
    }
  }
  return problems;
}
