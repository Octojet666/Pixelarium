import { useEffect, useRef, useState } from 'react';
import { Modal } from './Modal';
import { compositeFrame } from '../engine/composite';
import { defaultNineSlice, renderNineSlice } from '../engine/nineSlice';
import { useEditor } from '../store/project';
import { useUi } from '../store/ui';
import type { NineSliceInsets } from '../types';

const EDGES: { key: keyof NineSliceInsets; label: string }[] = [
  { key: 'left', label: 'Left' },
  { key: 'right', label: 'Right' },
  { key: 'top', label: 'Top' },
  { key: 'bottom', label: 'Bottom' },
];

export function NineSliceDialog() {
  const close = useUi((s) => s.closeDialog);
  const pushToast = useUi((s) => s.pushToast);
  const doc = useEditor((s) => s.doc);
  const setNineSlice = useEditor((s) => s.setNineSlice);

  const [insets, setInsets] = useState<NineSliceInsets>(
    () => doc.nineSlice ?? defaultNineSlice(doc.width, doc.height),
  );
  const [targetW, setTargetW] = useState(() => Math.min(480, Math.max(24, doc.width * 3)));
  const [targetH, setTargetH] = useState(() => Math.min(480, Math.max(24, doc.height * 3)));
  const previewRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = previewRef.current;
    if (!canvas) return;
    const store = useEditor.getState();
    const index = store.doc.frames.findIndex((f) => f.id === store.activeFrameId);
    if (index < 0) return;
    const source = new Uint8ClampedArray(compositeFrame(store.doc, index));
    const out = new Uint8ClampedArray(
      renderNineSlice(source, store.doc.width, store.doc.height, insets, targetW, targetH),
    );
    canvas.width = targetW;
    canvas.height = targetH;
    canvas.getContext('2d')?.putImageData(new ImageData(out, targetW, targetH), 0, 0);
  }, [insets, targetW, targetH, doc.width, doc.height]);

  const setEdge = (key: keyof NineSliceInsets, value: number) => {
    const max = key === 'left' || key === 'right' ? doc.width - 1 : doc.height - 1;
    setInsets((prev) => {
      const next = { ...prev, [key]: Math.max(0, Math.min(max, Math.round(value))) };
      const pair = key === 'left' || key === 'right' ? ['left', 'right'] : ['top', 'bottom'];
      const other = pair[0] === key ? pair[1] : pair[0];
      const limit = key === 'left' || key === 'right' ? doc.width - 1 : doc.height - 1;
      if (next[key as keyof NineSliceInsets] + next[other as keyof NineSliceInsets] > limit) {
        next[other as keyof NineSliceInsets] = Math.max(0, limit - next[key as keyof NineSliceInsets]);
      }
      return next;
    });
  };

  const download = () => {
    const canvas = previewRef.current;
    if (!canvas) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `${doc.name.toLowerCase().replace(/\s+/g, '-')}-9slice-${targetW}x${targetH}.png`;
    a.click();
  };

  return (
    <Modal
      title="Nine-slice preview"
      subtitle="Corners stay exact while edges and the middle stretch — for UI panels, buttons and frames."
      onClose={close}
      footer={
        <>
          {doc.nineSlice && (
            <button
              className="btn ghost sm"
              onClick={() => {
                setNineSlice(null);
                close();
                pushToast('Nine-slice guides removed.', 'info');
              }}
            >
              Remove guides
            </button>
          )}
          <span className="spacer" style={{ flex: 1 }} />
          <button className="btn sm" onClick={close}>
            Cancel
          </button>
          <button
            className="btn primary sm"
            onClick={() => {
              setNineSlice(insets);
              close();
              pushToast('Nine-slice guides saved with this project.', 'success');
            }}
          >
            Save guides
          </button>
        </>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 220px', gap: 16 }}>
        <div
          style={{
            display: 'grid',
            placeItems: 'center',
            minHeight: 220,
            padding: 12,
            borderRadius: 10,
            border: '1px solid var(--line)',
            background: 'var(--ink-1)',
          }}
        >
          <canvas ref={previewRef} style={{ maxWidth: '100%', imageRendering: 'pixelated' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {EDGES.map((edge) => (
            <label key={edge.key} style={{ display: 'grid', gap: 3, fontSize: 11 }}>
              <span className="row-between">
                <span>{edge.label}</span>
                <span className="mono" style={{ color: 'var(--text-muted)' }}>
                  {insets[edge.key]} px
                </span>
              </span>
              <input
                type="range"
                min={0}
                max={(edge.key === 'left' || edge.key === 'right' ? doc.width : doc.height) - 1}
                value={insets[edge.key]}
                onChange={(e) => setEdge(edge.key, Number(e.target.value))}
              />
            </label>
          ))}
          <div className="divider" style={{ margin: '2px 0' }} />
          <label style={{ display: 'grid', gap: 3, fontSize: 11 }}>
            <span className="row-between">
              <span>Target width</span>
              <span className="mono" style={{ color: 'var(--text-muted)' }}>
                {targetW} px
              </span>
            </span>
            <input type="range" min={8} max={480} value={targetW} onChange={(e) => setTargetW(Number(e.target.value))} />
          </label>
          <label style={{ display: 'grid', gap: 3, fontSize: 11 }}>
            <span className="row-between">
              <span>Target height</span>
              <span className="mono" style={{ color: 'var(--text-muted)' }}>
                {targetH} px
              </span>
            </span>
            <input type="range" min={8} max={480} value={targetH} onChange={(e) => setTargetH(Number(e.target.value))} />
          </label>
          <button className="btn sm ghost" onClick={download} style={{ marginTop: 'auto' }}>
            Download PNG
          </button>
        </div>
      </div>
    </Modal>
  );
}
