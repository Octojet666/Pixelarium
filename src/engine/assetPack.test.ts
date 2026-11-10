import { describe, expect, it } from 'vitest';
import { createProject } from './document';
import {
  assetsFromDoc,
  autoColumns,
  buildManifest,
  emptyPack,
  framesAsAssets,
  packCellCount,
  packCells,
  packFilename,
  planSheet,
  validatePack,
} from './assetPack';

const doc = createProject({ name: 'Hero', width: 16, height: 16 });

describe('sheet planning', () => {
  it('places cells left to right with padding and spacing', () => {
    const layout = planSheet(
      [
        { asset: 0, frame: 0 },
        { asset: 0, frame: 1 },
        { asset: 0, frame: 2 },
      ],
      16,
      24,
      2,
      1,
      2,
    );
    expect(layout.columns).toBe(2);
    expect(layout.rows).toBe(2);
    expect(layout.width).toBe(1 * 2 + 2 * 16 + 1 * 2);
    expect(layout.height).toBe(1 * 2 + 2 * 24 + 1 * 2);
    expect(layout.rects[0]).toMatchObject({ x: 1, y: 1, w: 16, h: 24 });
    expect(layout.rects[1]).toMatchObject({ x: 19, y: 1 });
    expect(layout.rects[2]).toMatchObject({ x: 1, y: 27 });
  });

  it('keeps the requested column count even for a single cell', () => {
    const layout = planSheet([{ asset: 0, frame: 0 }], 8, 8, 8);
    expect(layout.columns).toBe(8);
    expect(layout.width).toBe(64);
  });

  it('clamps absurd column counts', () => {
    expect(planSheet([{ asset: 0, frame: 0 }], 8, 8, 0).columns).toBe(1);
    expect(planSheet([{ asset: 0, frame: 0 }], 8, 8, 500).columns).toBe(32);
  });

  it('suggests square-ish sheets without going past eight columns', () => {
    expect(autoColumns(4)).toBe(4);
    expect(autoColumns(8)).toBe(8);
    expect(autoColumns(40)).toBe(8);
  });
});

describe('assets and manifests', () => {
  it('turns every frame into a cell of one asset', () => {
    const assets = assetsFromDoc(doc);
    expect(assets).toHaveLength(1);
    expect(assets[0].frames).toEqual([0]);
    expect(packCellCount(emptyPack({ assets }))).toBe(1);
  });

  it('builds one asset per frame for icon sheets', () => {
    const assets = framesAsAssets(doc, 'Icon');
    expect(assets).toHaveLength(doc.frames.length);
    expect(assets[0].id).toBe('icon_1');
    expect(packCells(emptyPack({ assets }))).toEqual([{ asset: 0, frame: 0 }]);
  });

  it('records every cell rect and duration in the manifest', () => {
    const assets = [
      { id: 'idle', name: 'Idle', kind: 'sprite' as const, frames: [0], tags: ['loop'] },
    ];
    const pack = emptyPack({ name: 'Hero pack', assets });
    const cells = packCells(pack);
    const layout = planSheet(cells, doc.width, doc.height, 4, 0, 1);
    const manifest = buildManifest(pack, layout, doc.frames.map((f) => f.duration), {
      sheetFile: 'hero-pack.png',
      padding: 0,
      spacing: 1,
      fps: 8,
    });

    expect(manifest.format).toBe('pixelarium.assetpack');
    expect(manifest.sheet).toMatchObject({ file: 'hero-pack.png', cellWidth: 16, cellHeight: 16, columns: 4 });
    expect(manifest.assets[0].id).toBe('idle');
    expect(manifest.assets[0].tags).toEqual(['loop']);
    expect(manifest.assets[0].frames[0]).toMatchObject({ index: 0, x: 0, y: 0, w: 16, h: 16 });
    expect(manifest.assets[0].frames[0].duration).toBe(doc.frames[0].duration);
  });

  it('derives a safe file name', () => {
    expect(packFilename(emptyPack({ name: 'My Hero Pack!' }))).toBe('my_hero_pack');
    expect(packFilename(emptyPack({ name: '   ' }))).toBe('asset_pack');
  });
});

describe('pack validation', () => {
  it('accepts a pack built from the document', () => {
    const pack = emptyPack({ assets: assetsFromDoc(doc) });
    expect(validatePack(pack, doc)).toEqual([]);
  });

  it('rejects empty packs, bad namespaces, duplicate ids and missing frames', () => {
    const problems = validatePack(
      emptyPack({
        namespace: 'Bad Namespace',
        assets: [
          { id: 'a', name: 'A', kind: 'sprite', frames: [0], tags: [] },
          { id: 'a', name: 'B', kind: 'sprite', frames: [9], tags: [] },
        ],
      }),
      doc,
    );
    expect(problems.some((p) => p.includes('namespace'))).toBe(true);
    expect(problems.some((p) => p.includes('used twice'))).toBe(true);
    expect(problems.some((p) => p.includes('does not exist'))).toBe(true);

    const empty = validatePack(emptyPack({ assets: [] }), doc);
    expect(empty.some((p) => p.includes('at least one asset'))).toBe(true);
  });
});
