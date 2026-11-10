import { describe, expect, it } from 'vitest';
import { buildAsepriteJson, buildSheetJson, buildTexturePackerJson, type SheetJsonInput } from './sheetFormats';

const input: SheetJsonInput = {
  image: 'hero-pack.png',
  width: 96,
  height: 32,
  frames: [
    { name: 'idle_0', x: 0, y: 0, w: 32, h: 32, duration: 120, animation: 'idle' },
    { name: 'idle_1', x: 32, y: 0, w: 32, h: 32, duration: 120, animation: 'idle' },
    { name: 'run_0', x: 64, y: 0, w: 32, h: 32, duration: 80, animation: 'run' },
  ],
  animations: [
    { name: 'idle', frames: ['idle_0', 'idle_1'] },
    { name: 'run', frames: ['run_0'] },
  ],
  tags: [
    { name: 'idle', from: 0, to: 1 },
    { name: 'run', from: 2, to: 2, direction: 'pingpong' },
  ],
};

describe('Aseprite JSON', () => {
  it('keys frames by name with rects, source sizes and durations', () => {
    const json = buildAsepriteJson(input) as any;
    expect(Object.keys(json.frames)).toEqual(['idle_0', 'idle_1', 'run_0']);
    expect(json.frames.idle_1).toMatchObject({
      frame: { x: 32, y: 0, w: 32, h: 32 },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: 32, h: 32 },
      sourceSize: { w: 32, h: 32 },
      duration: 120,
    });
  });

  it('writes meta fields an Aseprite importer expects', () => {
    const json = buildAsepriteJson(input) as any;
    expect(json.meta).toMatchObject({
      app: 'Pixelarium',
      image: 'hero-pack.png',
      format: 'RGBA8888',
      size: { w: 96, h: 32 },
      scale: '1',
    });
    expect(json.meta.frameTags).toEqual([
      { name: 'idle', from: 0, to: 1, direction: 'forward' },
      { name: 'run', from: 2, to: 2, direction: 'pingpong' },
    ]);
  });

  it('drops tags that point outside the frame list', () => {
    const json = buildAsepriteJson({
      ...input,
      tags: [
        { name: 'ok', from: 0, to: 0 },
        { name: 'outside', from: 2, to: 9 },
        { name: 'reversed', from: 2, to: 0 },
      ],
    }) as any;
    expect(json.meta.frameTags.map((tag: any) => tag.name)).toEqual(['ok']);
  });
});

describe('TexturePacker JSON', () => {
  it('writes array frames in sheet order', () => {
    const json = buildTexturePackerJson(input) as any;
    expect(json.frames).toHaveLength(3);
    expect(json.frames[0]).toMatchObject({
      filename: 'idle_0',
      frame: { x: 0, y: 0, w: 32, h: 32 },
      duration: 120,
    });
    expect(json.frames[2].filename).toBe('run_0');
  });

  it('writes an animations map of frame names', () => {
    const json = buildTexturePackerJson(input) as any;
    expect(json.animations).toEqual({ idle: ['idle_0', 'idle_1'], run: ['run_0'] });
  });

  it('omits animations when there are none and keeps meta', () => {
    const json = buildTexturePackerJson({ ...input, animations: [] }) as any;
    expect(json.animations).toBeUndefined();
    expect(json.meta).toMatchObject({ image: 'hero-pack.png', size: { w: 96, h: 32 } });
  });
});

describe('format dispatch', () => {
  it('routes aseprite and texturepacker', () => {
    expect(buildSheetJson('aseprite', input)).toEqual(buildAsepriteJson(input));
    expect(buildSheetJson('texturepacker', input)).toEqual(buildTexturePackerJson(input));
  });
});
