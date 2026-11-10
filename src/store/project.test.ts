import { beforeEach, describe, expect, it } from 'vitest';
import { useEditor } from './project';

const paintPixel = (cel: Uint8ClampedArray, index: number, value: number) => {
  cel[index * 4] = value;
  cel[index * 4 + 1] = value;
  cel[index * 4 + 2] = value;
  cel[index * 4 + 3] = 255;
};

describe('undo / redo', () => {
  beforeEach(() => {
    useEditor.getState().history.clear();
  });

  it('reverts a painted stroke and re-applies it on redo', () => {
    const store = useEditor.getState();
    const cel = store.getActiveCel();
    expect(cel).toBeTruthy();
    if (!cel) return;

    store.beginStroke('Draw');
    paintPixel(cel, 0, 255);
    paintPixel(cel, 33, 128);
    store.endStroke();

    const after = new Uint8ClampedArray(cel);
    expect(cel[0]).toBe(255);
    expect(cel[33 * 4 + 1]).toBe(128);

    useEditor.getState().undo();
    expect(cel[0]).toBe(0);
    expect(cel[33 * 4 + 1]).toBe(0);

    useEditor.getState().redo();
    expect(Array.from(cel)).toEqual(Array.from(after));
  });

  it('reverts a pixel edit made through pushPixelEdit', () => {
    const store = useEditor.getState();
    const cel = store.getActiveCel();
    expect(cel).toBeTruthy();
    if (!cel) return;

    const before = new Uint8ClampedArray(cel);
    paintPixel(cel, 5, 200);
    store.pushPixelEdit('Clear', before);
    expect(cel[5 * 4]).toBe(200);

    useEditor.getState().undo();
    expect(cel[5 * 4]).toBe(0);
  });

  it('undoes a generated tween in one step', () => {
    const store = useEditor.getState();
    store.addFrame();
    store.addFrame();
    const frames = useEditor.getState().doc.frames;
    useEditor.getState().setActiveFrame(frames[frames.length - 2].id);
    const before = frames.length;
    const made = useEditor.getState().tweenFrames(2, 'linear');
    expect(made).toBe(2);
    expect(useEditor.getState().doc.frames.length).toBe(before + 2);

    useEditor.getState().undo();
    expect(useEditor.getState().doc.frames.length).toBe(before);
  });

  it('blends pixels between the two keyframes it sits between', () => {
    const store = useEditor.getState();
    const layerId = store.activeLayerId;
    const first = store.getActiveCel();
    expect(first).toBeTruthy();
    if (!first) return;
    paintPixel(first, 0, 0);
    store.duplicateFrame();

    const frames = useEditor.getState().doc.frames;
    const keyIndex = frames.findIndex((f) => f.id === useEditor.getState().activeFrameId);
    const second = frames[keyIndex].cels[layerId];
    paintPixel(second, 0, 200);

    // Step back to the first key so the tween runs between the two poses.
    useEditor.getState().setActiveFrame(frames[keyIndex - 1].id);
    expect(useEditor.getState().tweenFrames(1, 'linear')).toBe(1);

    const tweened = useEditor.getState().doc.frames;
    const middle = tweened[keyIndex].cels[layerId];
    expect(middle[0]).toBe(100);
    expect(middle[3]).toBe(255);
    // The keys themselves must survive untouched.
    expect(tweened[keyIndex - 1].cels[layerId][0]).toBe(0);
    expect(tweened[keyIndex + 1].cels[layerId][0]).toBe(200);
  });

  it('refuses to tween the last frame, which has no following pose', () => {
    const store = useEditor.getState();
    const frames = store.doc.frames;
    store.setActiveFrame(frames[frames.length - 1].id);
    expect(useEditor.getState().tweenFrames(3)).toBe(0);
  });

  it('still restores structural snapshots', () => {
    const store = useEditor.getState();
    const before = store.doc.layers.length;
    store.addLayer();
    expect(useEditor.getState().doc.layers.length).toBe(before + 1);
    useEditor.getState().undo();
    expect(useEditor.getState().doc.layers.length).toBe(before);
  });
});
