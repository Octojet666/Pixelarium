import { useEffect, useRef, useState } from 'react';
import type { BlendMode, Layer } from '../types';
import { BLEND_MODES } from '../types';
import { Icon } from '../components/Icon';
import { Slider } from '../components/Controls';
import { useEditor } from '../store/project';

function CelThumb({ layer, frameId }: { layer: Layer; frameId: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const revision = useEditor((s) => s.revision);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const store = useEditor.getState();
    const frame = store.doc.frames.find((f) => f.id === frameId);
    const cel = frame?.cels[layer.id];
    if (!cel) return;
    const { width, height } = store.doc;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.putImageData(new ImageData(new Uint8ClampedArray(cel), width, height), 0, 0);
  }, [layer.id, frameId, revision]);
  return <canvas ref={ref} />;
}

export function LayersPanel() {
  const doc = useEditor((s) => s.doc);
  const revision = useEditor((s) => s.revision);
  const activeLayerId = useEditor((s) => s.activeLayerId);
  const activeFrameId = useEditor((s) => s.activeFrameId);
  const setActiveLayer = useEditor((s) => s.setActiveLayer);
  const addLayer = useEditor((s) => s.addLayer);
  const duplicateLayer = useEditor((s) => s.duplicateLayer);
  const deleteLayer = useEditor((s) => s.deleteLayer);
  const moveLayer = useEditor((s) => s.moveLayer);
  const mergeLayerDown = useEditor((s) => s.mergeLayerDown);
  const setLayerProps = useEditor((s) => s.setLayerProps);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');

  const active = doc.layers.find((l) => l.id === activeLayerId);
  const ordered = [...doc.layers].reverse();
  void revision;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
      <div className="layer-tools">
        <button className="iconbtn" onClick={() => addLayer()} title="New layer (Ctrl+Shift+N)">
          <Icon name="plus" />
        </button>
        <button className="iconbtn" onClick={duplicateLayer} title="Duplicate layer (Ctrl+Shift+D)">
          <Icon name="copy" />
        </button>
        <button className="iconbtn" onClick={() => moveLayer(activeLayerId, 'up')} title="Move layer up">
          <Icon name="chevron-up" />
        </button>
        <button className="iconbtn" onClick={() => moveLayer(activeLayerId, 'down')} title="Move layer down">
          <Icon name="chevron-down" />
        </button>
        <button className="iconbtn" onClick={mergeLayerDown} title="Merge down" disabled={doc.layers.findIndex((l) => l.id === activeLayerId) <= 0}>
          <Icon name="merge" />
        </button>
        <div className="spacer" />
        <button
          className="iconbtn"
          onClick={() => deleteLayer()}
          title="Delete layer"
          disabled={doc.layers.length <= 1}
        >
          <Icon name="trash" />
        </button>
      </div>
      <div className="panel-scroll" style={{ minHeight: 120 }}>
        {ordered.map((layer) => (
          <div
            key={layer.id}
            className={`layer-row${layer.id === activeLayerId ? ' active' : ''}${!layer.visible ? ' hidden-layer' : ''}`}
            onClick={() => setActiveLayer(layer.id)}
            onDoubleClick={() => {
              setRenaming(layer.id);
              setDraftName(layer.name);
            }}
          >
            <button
              className={`layer-eye${layer.visible ? '' : ' off'}`}
              onClick={(e) => {
                e.stopPropagation();
                setLayerProps(layer.id, { visible: !layer.visible });
              }}
              title={layer.visible ? 'Hide layer' : 'Show layer'}
              aria-label={layer.visible ? `Hide ${layer.name}` : `Show ${layer.name}`}
            >
              <Icon name={layer.visible ? 'eye' : 'eye-off'} size={14} />
            </button>
            <div className="layer-thumb">
              <CelThumb layer={layer} frameId={activeFrameId} />
            </div>
            {renaming === layer.id ? (
              <input
                className="input"
                autoFocus
                style={{ height: 22, fontSize: 12 }}
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onBlur={() => {
                  if (draftName.trim()) setLayerProps(layer.id, { name: draftName.trim() });
                  setRenaming(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (draftName.trim()) setLayerProps(layer.id, { name: draftName.trim() });
                    setRenaming(null);
                  }
                  if (e.key === 'Escape') setRenaming(null);
                }}
              />
            ) : (
              <span className="layer-name" title={`${layer.name}${layer.locked ? ' (locked)' : ''}`}>
                {layer.name}
              </span>
            )}
            <div className="layer-meta">
              {layer.blend !== 'normal' && <span>{layer.blend.slice(0, 3)}</span>}
              {layer.opacity < 255 && <span className="mono">{Math.round((layer.opacity / 255) * 100)}%</span>}
              <button
                className="layer-eye"
                onClick={(e) => {
                  e.stopPropagation();
                  setLayerProps(layer.id, { locked: !layer.locked });
                }}
                title={layer.locked ? 'Unlock layer' : 'Lock layer'}
                aria-label={layer.locked ? 'Unlock layer' : 'Lock layer'}
              >
                <Icon name={layer.locked ? 'lock' : 'unlock'} size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>
      {active && (
        <div className="layer-props">
          <div className="row-between">
            <span className="label">Blend</span>
            <select
              className="select"
              style={{ width: 130, height: 26 }}
              value={active.blend}
              onChange={(e) => setLayerProps(active.id, { blend: e.target.value as BlendMode })}
            >
              {BLEND_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {mode[0].toUpperCase() + mode.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <Slider
            label="Opacity"
            min={0}
            max={255}
            value={active.opacity}
            onChange={(opacity) => setLayerProps(active.id, { opacity }, false)}
            format={(v) => `${Math.round((v / 255) * 100)}%`}
          />
        </div>
      )}
    </div>
  );
}
