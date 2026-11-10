import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { compositeFrame } from '../engine/composite';
import { buildSpriteSheet, downloadBlob, canvasToBlob, exportGif, safeFilename } from './exporting';
import { Icon } from '../components/Icon';
import { useEditor } from '../store/project';
import { useUi } from '../store/ui';

export function AnimationPreview() {
  const open = useUi((s) => s.previewOpen);
  const previewScale = useUi((s) => s.previewScale);
  const uiSet = useUi((s) => s.set);
  const close = () => uiSet({ previewOpen: false });
  const doc = useEditor((s) => s.doc);
  const activeFrameId = useEditor((s) => s.activeFrameId);
  const revision = useEditor((s) => s.revision);
  const [playing, setPlaying] = useState(true);
  const [bg, setBg] = useState<'transparent' | 'dark' | 'light'>('dark');
  const [tagId, setTagId] = useState<string>('');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const [frameIndex, setFrameIndex] = useState(0);

  const tag = doc.tags.find((t) => t.id === tagId);
  const frames = tag
    ? doc.frames.slice(Math.min(tag.from, tag.to), Math.max(tag.from, tag.to) + 1)
    : doc.frames;

  useEffect(() => {
    if (!open) return;
    const initial = doc.frames.findIndex((f) => f.id === activeFrameId);
    setFrameIndex(initial >= 0 ? initial : 0);
  }, [open, activeFrameId, doc.frames]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key === ' ') {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let local = frameIndex;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(200, now - last);
      last = now;
      if (!playing) return;
      acc += dt;
      const frame = frames[local];
      if (!frame) return;
      if (acc < Math.max(20, frame.duration)) return;
      acc = 0;
      local = (local + 1) % frames.length;
      setFrameIndex(local);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [open, playing, frames, frameIndex]);

  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const frame = frames[frameIndex];
    if (!frame) return;
    const index = doc.frames.indexOf(frame);
    let temp = offscreenRef.current;
    if (!temp) {
      temp = document.createElement('canvas');
      offscreenRef.current = temp;
    }
    temp.width = doc.width;
    temp.height = doc.height;
    const tctx = temp.getContext('2d');
    if (!tctx) return;
    const pixels = compositeFrame(doc, index);
    tctx.putImageData(new ImageData(new Uint8ClampedArray(pixels), doc.width, doc.height), 0, 0);
    canvas.width = doc.width;
    canvas.height = doc.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(temp, 0, 0, doc.width, doc.height);
  }, [open, doc, frames, frameIndex, revision]);

  if (!open) return null;

  const totalMs = frames.reduce((a, f) => a + f.duration, 0);

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal" style={{ width: 'min(680px, 100%)' }} role="dialog" aria-label="Animation preview">
        <div className="modal-head">
          <div>
            <h2>Animation preview</h2>
            <p>
              {frames.length} frames · {(totalMs / 1000).toFixed(2)}s loop · {Math.round(1000 / (totalMs / frames.length || 1))} fps
            </p>
          </div>
          <button className="iconbtn" onClick={close} aria-label="Close preview">
            <Icon name="close" />
          </button>
        </div>
        <div className="modal-body">
          <div
            className="preview-stage"
            style={{
              background:
                bg === 'transparent'
                  ? 'repeating-conic-gradient(#161620 0% 25%, #1d1d2a 0% 50%) 50% / 16px 16px'
                  : bg === 'light'
                    ? '#e9e6f0'
                    : undefined,
            }}
          >
            <canvas
              ref={canvasRef}
              style={{ width: doc.width * previewScale, height: doc.height * previewScale, imageRendering: 'pixelated' }}
            />
          </div>
          <div className="hstack" style={{ flexWrap: 'wrap' }}>
            <button className="btn sm" onClick={() => setPlaying((p) => !p)}>
              <Icon name={playing ? 'pause' : 'play'} size={13} /> {playing ? 'Pause' : 'Play'}
            </button>
            <input
              type="range"
              min={0}
              max={Math.max(0, frames.length - 1)}
              value={frameIndex}
              onChange={(e) => {
                setPlaying(false);
                setFrameIndex(Number(e.target.value));
              }}
              style={{ flex: 1, minWidth: 120 }}
            />
            <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {frameIndex + 1}/{frames.length}
            </span>
            <div style={{ width: 110 }}>
              <select className="select" style={{ height: 26 }} value={previewScale} onChange={(e) => uiSet({ previewScale: Number(e.target.value) })}>
                {[1, 2, 3, 4, 6, 8].map((s) => (
                  <option key={s} value={s}>
                    {s}× scale
                  </option>
                ))}
              </select>
            </div>
            <div style={{ width: 124 }}>
              <select className="select" style={{ height: 26 }} value={bg} onChange={(e) => setBg(e.target.value as typeof bg)}>
                <option value="dark">Dark backdrop</option>
                <option value="light">Light backdrop</option>
                <option value="transparent">Checkerboard</option>
              </select>
            </div>
            {doc.tags.length > 0 && (
              <div style={{ width: 130 }}>
                <select className="select" style={{ height: 26 }} value={tagId} onChange={(e) => setTagId(e.target.value)}>
                  <option value="">All frames</option>
                  {doc.tags.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
        <div className="modal-foot">
          <button
            className="btn sm ghost"
            onClick={async () => {
              const canvas = buildSpriteSheet(doc, { columns: doc.frames.length, padding: 0, spacing: 0, scale: previewScale });
              downloadBlob(await canvasToBlob(canvas), `${safeFilename(doc.name)}-strip.png`);
            }}
          >
            <Icon name="film" size={13} /> Export strip
          </button>
          <button
            className="btn sm"
            onClick={() => {
              try {
                exportGif(doc, { scale: 4, loop: true, dither: 'bayer4' }, doc.name);
                useUi.getState().pushToast('GIF export started with a quantized palette.', 'success');
              } catch (error) {
                useUi.getState().pushToast(error instanceof Error ? error.message : 'GIF export failed', 'error');
              }
            }}
          >
            <Icon name="download" size={13} /> Export GIF
          </button>
          <button className="btn primary sm" onClick={close}>
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
