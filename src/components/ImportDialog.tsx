import { useEffect, useRef, useState } from 'react';
import { Modal } from './Modal';
import { Field } from './Controls';
import { Icon } from './Icon';
import { importImageFile } from '../editor/exporting';
import { createLayer } from '../engine/document';
import { createCel, writeRegion } from '../engine/pixel';
import { useEditor } from '../store/project';
import { useUi } from '../store/ui';

function scaleToFit(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  targetW: number,
  targetH: number,
): Uint8ClampedArray {
  const src = document.createElement('canvas');
  src.width = width;
  src.height = height;
  src.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(pixels), width, height), 0, 0);
  const ratio = Math.min(targetW / width, targetH / height, 1);
  const drawW = Math.max(1, Math.round(width * ratio));
  const drawH = Math.max(1, Math.round(height * ratio));
  const out = document.createElement('canvas');
  out.width = targetW;
  out.height = targetH;
  const ctx = out.getContext('2d');
  if (!ctx) return new Uint8ClampedArray(targetW * targetH * 4);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, Math.round((targetW - drawW) / 2), Math.round((targetH - drawH) / 2), drawW, drawH);
  return new Uint8ClampedArray(ctx.getImageData(0, 0, targetW, targetH).data);
}

export function ImportDialog() {
  const close = useUi((s) => s.closeDialog);
  const pushToast = useUi((s) => s.pushToast);
  const setScreen = useUi((s) => s.setScreen);
  const doc = useEditor((s) => s.doc);
  const addLayer = useEditor((s) => s.addLayer);
  const addFrame = useEditor((s) => s.addFrame);
  const pushPixelEdit = useEditor((s) => s.pushPixelEdit);

  const [file, setFile] = useState<File | null>(null);
  const [image, setImage] = useState<{ pixels: Uint8ClampedArray; width: number; height: number } | null>(null);
  const [mode, setMode] = useState<'new-layer' | 'new-frame' | 'new-project'>('new-layer');
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!image || !canvasRef.current) return;
    const canvas = canvasRef.current;
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(image.pixels), image.width, image.height), 0, 0);
  }, [image]);

  const pick = async (f: File) => {
    setBusy(true);
    try {
      const loaded = await importImageFile(f);
      setFile(f);
      setImage(loaded);
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'Could not read that image.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const run = () => {
    if (!image || !file) return;
    const baseName = file.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'Imported image';
    if (mode === 'new-project') {
      const ratio = Math.min(1, 2048 / Math.max(image.width, image.height));
      const width = Math.max(1, Math.round(image.width * ratio));
      const height = Math.max(1, Math.round(image.height * ratio));
      const store = useEditor.getState();
      store.newDocument(width, height, baseName);
      const state = useEditor.getState();
      const layer = createLayer(baseName);
      const frame = state.doc.frames[0];
      frame.cels[layer.id] = createCel(width, height);
      state.doc.layers = [layer];
      writeRegion(frame.cels[layer.id], width, height, scaleToFit(image.pixels, image.width, image.height, width, height), {
        x: 0,
        y: 0,
        w: width,
        h: height,
      });
      useEditor.setState({ activeLayerId: layer.id, activeFrameId: frame.id, revision: state.revision + 1 });
      setScreen('editor');
      close();
      pushToast(`Imported ${file.name} as a ${width}×${height} project.`, 'success');
      return;
    }
    if (mode === 'new-layer') {
      addLayer(baseName);
      const store = useEditor.getState();
      const cel = store.getActiveCel();
      if (!cel) return;
      const before = new Uint8ClampedArray(cel);
      writeRegion(cel, store.doc.width, store.doc.height, scaleToFit(image.pixels, image.width, image.height, store.doc.width, store.doc.height), {
        x: 0,
        y: 0,
        w: store.doc.width,
        h: store.doc.height,
      });
      pushPixelEdit('Import image', before);
      setScreen('editor');
      close();
      pushToast(`Added ${file.name} as a new layer.`, 'success');
      return;
    }
    addFrame();
    const store = useEditor.getState();
    const cel = store.getActiveCel();
    if (!cel) return;
    const before = new Uint8ClampedArray(cel);
    writeRegion(cel, store.doc.width, store.doc.height, scaleToFit(image.pixels, image.width, image.height, store.doc.width, store.doc.height), {
      x: 0,
      y: 0,
      w: store.doc.width,
      h: store.doc.height,
    });
    pushPixelEdit('Import image', before);
    setScreen('editor');
    close();
    pushToast(`Added ${file.name} on a new frame.`, 'success');
  };

  return (
    <Modal
      title="Import image"
      subtitle="PNG, JPEG, WebP and GIF. Animated GIFs import their first frame."
      onClose={close}
      footer={
        <>
          <button className="btn ghost" onClick={close}>
            Cancel
          </button>
          <button className="btn primary" onClick={run} disabled={!image || busy}>
            <Icon name="upload" size={13} /> Import
          </button>
        </>
      }
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void pick(f);
          e.target.value = '';
        }}
      />
      <button
        className="new-project-tile"
        style={{ minHeight: 128 }}
        onClick={() => inputRef.current?.click()}
        type="button"
      >
        <span className="plus">
          <Icon name="image" size={16} />
        </span>
        <span>{file ? file.name : 'Choose an image file'}</span>
        <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
          {image ? `${image.width}×${image.height}px · ${(file?.size ? file.size / 1024 : 0).toFixed(0)} KB` : 'Up to 25 MB'}
        </span>
      </button>

      {image && (
        <div
          className="preview-stage"
          style={{ background: 'repeating-conic-gradient(#161620 0% 25%, #1d1d2a 0% 50%) 50% / 16px 16px', maxHeight: 220, overflow: 'hidden' }}
        >
          <canvas ref={canvasRef} style={{ maxWidth: '100%', maxHeight: 180, imageRendering: 'pixelated' }} />
        </div>
      )}

      <Field label="Organize as" hint={mode === 'new-project' ? `Creates a fresh ${doc.width}×${doc.height} canvas? No — it adopts the image size.` : undefined}>
        <select className="select" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
          <option value="new-layer">New layer in this project</option>
          <option value="new-frame">New frame in this project</option>
          <option value="new-project">New project from this image</option>
        </select>
      </Field>
      {image && mode !== 'new-project' && (
        <div className="empty-note" style={{ textAlign: 'left' }}>
          The image is centered and scaled down with nearest-neighbour sampling to fit {doc.width}×{doc.height}. Smaller
          images are never stretched, and transparency is preserved.
        </div>
      )}
    </Modal>
  );
}
