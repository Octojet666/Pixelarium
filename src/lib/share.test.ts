import { describe, expect, it } from 'vitest';
import { createProject } from '../engine/document';
import { deserializeProject, serializeProjectToString } from '../engine/serialize';
import {
  COMFORTABLE_URL_LENGTH,
  createShareLink,
  openShareToken,
  shareTokenFromLocation,
} from './share';

function sampleDoc() {
  const doc = createProject({ width: 8, height: 6, name: 'Shared sprite' });
  doc.primary = '#ff8800';
  doc.frames[0].cels[doc.layers[0].id][0] = 255;
  doc.frames[0].cels[doc.layers[0].id][1] = 136;
  doc.frames[0].cels[doc.layers[0].id][2] = 0;
  doc.frames[0].cels[doc.layers[0].id][3] = 255;
  return doc;
}

describe('share links', () => {
  it('round-trips a project and gives the reader their own copy', async () => {
    const doc = sampleDoc();
    const link = await createShareLink(doc, 'https://example.com/pixelarium/');
    expect(link.token).toMatch(/^[zj]1\.[A-Za-z0-9_-]+$/);
    expect(link.token).not.toContain('+');
    expect(link.token).not.toContain('/');
    expect(link.length).toBeGreaterThan(40);

    const parsed = new URL(link.url);
    expect(parsed.searchParams.get('share')).toBe(link.token);

    const copy = await openShareToken(link.token);
    expect(copy.name).toBe('Shared sprite');
    expect(copy.width).toBe(8);
    expect(copy.height).toBe(6);
    expect(copy.id).not.toBe(doc.id);
    expect(copy.frames).toHaveLength(doc.frames.length);
    expect([...copy.frames[0].cels[copy.layers[0].id].slice(0, 4)]).toEqual([255, 136, 0, 255]);
    // The copy must survive a real save/load cycle, not just stay in memory.
    expect(() => deserializeProject(serializeProjectToString(copy))).not.toThrow();
  });

  it('stays well under the comfortable URL budget for a normal sprite', async () => {
    const link = await createShareLink(sampleDoc(), 'https://example.com/');
    expect(link.length).toBeLessThan(COMFORTABLE_URL_LENGTH);
    expect(link.compressed).toBe(true);
  });

  it('reads tokens from ?share= and #share=', () => {
    expect(shareTokenFromLocation('?share=abc', '')).toBe('abc');
    expect(shareTokenFromLocation('', '#share=xyz')).toBe('xyz');
    expect(shareTokenFromLocation('?project=doc-1', '')).toBeNull();
  });

  it('rejects damaged and foreign links with a readable message', async () => {
    await expect(openShareToken('z1.not-really-deflate')).rejects.toThrow();
    await expect(openShareToken('v9.whatever')).rejects.toThrow(/different Pixelarium version/);
    await expect(openShareToken('')).rejects.toThrow(/empty/);
  });
});
