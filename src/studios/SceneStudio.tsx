import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { Slider } from '../components/Controls';
import { PageNav } from '../screens/PageNav';
import { canvasToBlob, downloadBlob } from '../editor/exporting';
import { useEditor } from '../store/project';
import { useUi } from '../store/ui';
import {
  MAX_SCENE_SIZE,
  addProp,
  clamp,
  composeScene,
  emptyScene,
  propAt,
  propBounds,
  removeProp,
  reorderProp,
  sceneFilename,
  updateProp,
  validateScene,
  type SceneBackdrop,
  type SceneDoc,
  type SceneProp,
} from '../engine/scene';

const PRESETS: { label: string; width: number; height: number }[] = [
  { label: '16:9 · 320×180', width: 320, height: 180 },
  { label: '4:3 · 256×192', width: 256, height: 192 },
  { label: '1:1 · 256×256', width: 256, height: 256 },
  { label: '9:16 · 180×320', width: 180, height: 320 },
];

/** Draws pixels into a fresh canvas, nearest-neighbour when scaled up. */
function pixelsToCanvas(pixels: Uint8ClampedArray, width: number, height: number): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const image = ctx.createImageData(width, height);
  image.data.set(pixels);
  ctx.putImageData(image, 0, 0);
  return canvas;
}

export function SceneStudio() {
  const doc = useEditor((s) => s.doc);
  const revision = useEditor((s) => s.revision);
  const activeFrameId = useEditor((s) => s.activeFrameId);
  const setScene = useEditor((s) => s.setScene);
  const setScreen = useUi((s) => s.setScreen);
  const pushToast = useUi((s) => s.pushToast);

  const [scene, setLocal] = useState<SceneDoc>(() => doc.scene ?? emptyScene(doc));
  const [selected, setSelected] = useState<string | null>(() => scene.props[scene.props.length - 1]?.id ?? null);
  const [dirty, setDirty] = useState(false);
  const [exportScale, setExportScale] = useState(2);
  const [addFrame, setAddFrame] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null);

  const frameIndex = Math.max(0, doc.frames.findIndex((frame) => frame.id === activeFrameId));

  /* A different project - or a fresh save - replaces the local scene. */
  useEffect(() => {
    const next = doc.scene ?? emptyScene(doc);
    setLocal(next);
    setSelected(next.props[next.props.length - 1]?.id ?? null);
    setDirty(!doc.scene);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id, doc.scene]);

  const edit = (next: SceneDoc) => {
    setLocal(next);
    setDirty(true);
  };

  const patchScene = (patch: Partial<SceneDoc>) => edit({ ...scene, ...patch });
  const patchBackdrop = (patch: Partial<SceneBackdrop>) => edit({ ...scene, backdrop: { ...scene.backdrop, ...patch } });
  const patchFx = (patch: Partial<SceneDoc['fx']>) => edit({ ...scene, fx: { ...scene.fx, ...patch } });

  const selectedProp = scene.props.find((prop) => prop.id === selected) ?? null;
  const patchProp = (id: string, patch: Partial<SceneProp>) => edit(updateProp(scene, id, patch));

  const problems = useMemo(
    () => validateScene(doc, { ...scene, width: clamp(scene.width, 8, MAX_SCENE_SIZE), height: clamp(scene.height, 8, MAX_SCENE_SIZE) }),
    [doc, scene],
  );

  const previewScale = Math.max(
    1,
    Math.min(8, Math.floor(Math.min(700 / Math.max(1, scene.width), 560 / Math.max(1, scene.height)))),
  );

  /* Preview: composited scene, then a selection outline drawn on the display canvas. */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pixels = composeScene(doc, scene);
    const source = pixelsToCanvas(pixels, scene.width, scene.height);
    if (!source) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

    const active = scene.props.find((prop) => prop.id === selected);
    if (active) {
      const rect = propBounds(doc, active);
      ctx.strokeStyle = '#f5b942';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.strokeRect(
        rect.x * previewScale + 1,
        rect.y * previewScale + 1,
        rect.w * previewScale - 2,
        rect.h * previewScale - 2,
      );
      ctx.setLineDash([]);
    }
  }, [doc, revision, scene, selected, previewScale]);

  const scenePoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * scene.width,
      y: ((event.clientY - rect.top) / rect.height) * scene.height,
    };
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = scenePoint(event);
    const hit = propAt(doc, scene, point.x, point.y);
    if (!hit) {
      setSelected(null);
      return;
    }
    setSelected(hit.id);
    dragRef.current = { id: hit.id, dx: point.x - hit.x, dy: point.y - hit.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const point = scenePoint(event);
    setLocal((current) =>
      updateProp(current, drag.id, {
        x: Math.round(point.x - drag.dx),
        y: Math.round(point.y - drag.dy),
      }),
    );
    setDirty(true);
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  const save = () => {
    setScene(scene);
    setDirty(false);
    pushToast('Scene saved in the project.', 'success');
  };

  const addFrom = (frame: number) => {
    const next = addProp(scene, doc, { name: `${doc.name} · frame ${frame + 1}`, frame, scale: 2 });
    edit(next);
    setSelected(next.props[next.props.length - 1]?.id ?? null);
  };

  const exportPng = async () => {
    const pixels = composeScene(doc, scene);
    const base = pixelsToCanvas(pixels, scene.width, scene.height);
    if (!base) return;
    const out = document.createElement('canvas');
    out.width = scene.width * exportScale;
    out.height = scene.height * exportScale;
    const ctx = out.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(base, 0, 0, out.width, out.height);
    downloadBlob(await canvasToBlob(out), `${sceneFilename(doc.name)}_${exportScale}x.png`);
    pushToast(`Exported ${out.width}×${out.height} scene PNG.`, 'success');
  };

  const light = scene.fx.light;

  return (
    <div className="page-shell">
      <div className="page-inner">
        <PageNav />

        <div className="studio-workspace-head">
          <div>
            <button className="studio-back" onClick={() => setScreen('studios')}>
              <Icon name="arrow-left" size={12} /> Studios
            </button>
            <h1 className="studio-title">Scene &amp; Composition</h1>
            <p className="studio-sub">
              {doc.name} · {doc.width}×{doc.height} sprite framed in {scene.width}×{scene.height} ·{' '}
              {scene.props.length} placed
              {dirty && <span className="studio-dirty">unsaved scene changes</span>}
            </p>
          </div>
          <div className="studio-head-actions">
            <button className="btn sm" onClick={() => setScreen('editor')}>
              <Icon name="pencil" size={13} /> Paint sprite
            </button>
            <button className="btn sm primary" onClick={save} disabled={!dirty}>
              <Icon name="check" size={13} /> Save scene
            </button>
          </div>
        </div>

        <div className="studio-split">
          <section className="studio-main">
            <div className="scene-canvas-wrap">
              <canvas
                ref={canvasRef}
                width={scene.width * previewScale}
                height={scene.height * previewScale}
                className="scene-canvas"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                aria-label="Scene preview — drag a sprite to move it"
              />
            </div>
            <p className="studio-hint">
              Click a sprite to select it, drag to move. The preview is the composition at {previewScale}×; exports
              render at full scene resolution.
            </p>

            <div className="scene-prop-list">
              {scene.props.length === 0 && <span className="studio-metric">No sprites in the scene yet.</span>}
              {[...scene.props]
                .map((prop, index) => ({ prop, index }))
                .reverse()
                .map(({ prop, index }) => (
                  <button
                    key={prop.id}
                    className={`gui-slot-chip${prop.id === selected ? ' active' : ''}`}
                    onClick={() => setSelected(prop.id)}
                    title={`${prop.name} · frame ${prop.frame + 1} · ${prop.scale}×`}
                  >
                    <span className="mono">{index + 1}</span>
                    <span className="gui-slot-material">{prop.name}</span>
                  </button>
                ))}
            </div>

            <div className="gui-grid-tools">
              <label className="gui-label" htmlFor="scene-add-frame">Frame</label>
              <select
                id="scene-add-frame"
                className="select"
                value={addFrame}
                onChange={(e) => setAddFrame(Number(e.target.value))}
              >
                {doc.frames.map((frame, index) => (
                  <option key={frame.id} value={index}>
                    Frame {index + 1}
                  </option>
                ))}
              </select>
              <button className="btn sm" onClick={() => addFrom(addFrame)} disabled={scene.props.length >= 64}>
                <Icon name="plus" size={12} /> Place frame
              </button>
              <button className="btn sm ghost" onClick={() => addFrom(frameIndex)}>
                <Icon name="layers" size={12} /> Place current
              </button>
            </div>
          </section>

          <aside className="studio-side">
            <div className="studio-panel">
              <h3>Scene</h3>
              <div className="gui-field-row">
                <label className="gui-label" htmlFor="scene-preset">Size</label>
                <select
                  id="scene-preset"
                  className="select"
                  value={`${scene.width}x${scene.height}`}
                  onChange={(e) => {
                    const [width, height] = e.target.value.split('x').map(Number);
                    patchScene({ width, height });
                  }}
                >
                  {!PRESETS.some((preset) => preset.width === scene.width && preset.height === scene.height) && (
                    <option value={`${scene.width}x${scene.height}`}>Custom</option>
                  )}
                  {PRESETS.map((preset) => (
                    <option key={preset.label} value={`${preset.width}x${preset.height}`}>
                      {preset.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="gui-field-row">
                <label className="gui-label" htmlFor="scene-width">Width</label>
                <input
                  id="scene-width"
                  className="input mono"
                  type="number"
                  min={8}
                  max={MAX_SCENE_SIZE}
                  value={scene.width}
                  onChange={(e) =>
                    patchScene({ width: clamp(Math.round(Number(e.target.value) || 8), 8, MAX_SCENE_SIZE) })
                  }
                />
                <label className="gui-label" htmlFor="scene-height">Height</label>
                <input
                  id="scene-height"
                  className="input mono"
                  type="number"
                  min={8}
                  max={MAX_SCENE_SIZE}
                  value={scene.height}
                  onChange={(e) =>
                    patchScene({ height: clamp(Math.round(Number(e.target.value) || 8), 8, MAX_SCENE_SIZE) })
                  }
                />
              </div>
              <Slider
                label="Vignette"
                value={scene.fx.vignette}
                min={0}
                max={100}
                suffix="%"
                onChange={(vignette) => patchFx({ vignette })}
              />
              <div className="gui-field-row">
                <label className="gui-label" htmlFor="scene-light-on">Light</label>
                <input
                  id="scene-light-on"
                  type="checkbox"
                  checked={Boolean(light)}
                  onChange={(e) =>
                    patchFx({
                      light: e.target.checked
                        ? {
                            x: Math.round(scene.width * 0.62),
                            y: Math.round(scene.height * 0.38),
                            radius: Math.round(Math.min(scene.width, scene.height) * 0.55),
                            color: '#ffe6a8',
                            strength: 55,
                          }
                        : null,
                    })
                  }
                />
                <span className="studio-metric">{light ? 'warm key light' : 'off'}</span>
              </div>
              {light && (
                <>
                  <div className="gui-field-row">
                    <label className="gui-label" htmlFor="scene-light-color">Colour</label>
                    <input
                      id="scene-light-color"
                      className="input mono"
                      type="color"
                      value={light.color}
                      onChange={(e) => patchFx({ light: { ...light, color: e.target.value } })}
                    />
                  </div>
                  <div className="gui-field-row">
                    <label className="gui-label" htmlFor="scene-light-x">X</label>
                    <input
                      id="scene-light-x"
                      className="input mono scene-num"
                      type="number"
                      min={0}
                      max={scene.width}
                      value={light.x}
                      onChange={(e) => patchFx({ light: { ...light, x: Math.round(Number(e.target.value) || 0) } })}
                    />
                    <label className="gui-label" htmlFor="scene-light-y">Y</label>
                    <input
                      id="scene-light-y"
                      className="input mono scene-num"
                      type="number"
                      min={0}
                      max={scene.height}
                      value={light.y}
                      onChange={(e) => patchFx({ light: { ...light, y: Math.round(Number(e.target.value) || 0) } })}
                    />
                  </div>
                  <Slider
                    label="Radius"
                    value={light.radius}
                    min={1}
                    max={Math.max(scene.width, scene.height)}
                    suffix="px"
                    onChange={(radius) => patchFx({ light: { ...light, radius } })}
                  />
                  <Slider
                    label="Strength"
                    value={light.strength}
                    min={0}
                    max={100}
                    suffix="%"
                    onChange={(strength) => patchFx({ light: { ...light, strength } })}
                  />
                </>
              )}
            </div>

            <div className="studio-panel">
              <h3>Backdrop</h3>
              <div className="gui-field-row">
                <label className="gui-label" htmlFor="scene-backdrop">Type</label>
                <select
                  id="scene-backdrop"
                  className="select"
                  value={scene.backdrop.kind}
                  onChange={(e) => patchBackdrop({ kind: e.target.value as SceneBackdrop['kind'] })}
                >
                  <option value="flat">Flat</option>
                  <option value="vertical">Vertical gradient</option>
                  <option value="radial">Radial gradient</option>
                </select>
              </div>
              <div className="gui-field-row">
                <label className="gui-label" htmlFor="scene-from">From</label>
                <input
                  id="scene-from"
                  className="input mono"
                  type="color"
                  value={scene.backdrop.from}
                  onChange={(e) => patchBackdrop({ from: e.target.value })}
                />
                <label className="gui-label" htmlFor="scene-to">To</label>
                <input
                  id="scene-to"
                  className="input mono"
                  type="color"
                  value={scene.backdrop.to}
                  onChange={(e) => patchBackdrop({ to: e.target.value })}
                />
              </div>
              <div className="gui-field-row">
                <label className="gui-label" htmlFor="scene-dither">Dither</label>
                <input
                  id="scene-dither"
                  type="checkbox"
                  checked={scene.backdrop.dither}
                  onChange={(e) => patchBackdrop({ dither: e.target.checked })}
                />
                <span className="studio-metric">two-colour Bayer banding</span>
              </div>
            </div>

            <div className="studio-panel">
              <h3>{selectedProp ? selectedProp.name : 'Sprite'}</h3>
              {selectedProp ? (
                <>
                  <div className="gui-field-row">
                    <label className="gui-label" htmlFor="scene-prop-frame">Frame</label>
                    <select
                      id="scene-prop-frame"
                      className="select"
                      value={selectedProp.frame}
                      onChange={(e) => patchProp(selectedProp.id, { frame: Number(e.target.value) })}
                    >
                      {doc.frames.map((frame, index) => (
                        <option key={frame.id} value={index}>
                          Frame {index + 1}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="gui-field-row">
                    <label className="gui-label" htmlFor="scene-prop-x">X</label>
                    <input
                      id="scene-prop-x"
                      className="input mono scene-num"
                      type="number"
                      value={selectedProp.x}
                      onChange={(e) => patchProp(selectedProp.id, { x: Math.round(Number(e.target.value) || 0) })}
                    />
                    <label className="gui-label" htmlFor="scene-prop-y">Y</label>
                    <input
                      id="scene-prop-y"
                      className="input mono scene-num"
                      type="number"
                      value={selectedProp.y}
                      onChange={(e) => patchProp(selectedProp.id, { y: Math.round(Number(e.target.value) || 0) })}
                    />
                  </div>
                  <Slider
                    label="Scale"
                    value={selectedProp.scale}
                    min={1}
                    max={8}
                    suffix="×"
                    onChange={(scale) => patchProp(selectedProp.id, { scale })}
                  />
                  <Slider
                    label="Opacity"
                    value={selectedProp.opacity}
                    min={0}
                    max={100}
                    suffix="%"
                    onChange={(opacity) => patchProp(selectedProp.id, { opacity })}
                  />
                  <div className="gui-field-row">
                    <label className="gui-label" htmlFor="scene-prop-flip">Flip X</label>
                    <input
                      id="scene-prop-flip"
                      type="checkbox"
                      checked={selectedProp.flipX}
                      onChange={(e) => patchProp(selectedProp.id, { flipX: e.target.checked })}
                    />
                  </div>
                  <div className="hstack" style={{ gap: 6, flexWrap: 'wrap' }}>
                    <button
                      className="btn sm ghost"
                      onClick={() => edit(reorderProp(scene, selectedProp.id, -1))}
                      title="Send backward"
                    >
                      <Icon name="layers" size={12} /> Back
                    </button>
                    <button
                      className="btn sm ghost"
                      onClick={() => edit(reorderProp(scene, selectedProp.id, 1))}
                      title="Bring forward"
                    >
                      <Icon name="layers" size={12} /> Front
                    </button>
                    <button
                      className="btn sm ghost"
                      onClick={() => {
                        edit(removeProp(scene, selectedProp.id));
                        setSelected(null);
                      }}
                    >
                      <Icon name="trash" size={12} /> Remove
                    </button>
                  </div>
                </>
              ) : (
                <p className="studio-metric">Select a sprite in the preview or the list to place and shape it.</p>
              )}
            </div>

            <div className="studio-panel">
              <h3>Validation</h3>
              {problems.length === 0 ? (
                <p className="studio-ok">
                  <Icon name="check" size={12} /> No problems — the scene is exportable.
                </p>
              ) : (
                <ul className="studio-problems">
                  {problems.map((problem) => (
                    <li key={problem}>{problem}</li>
                  ))}
                </ul>
              )}
            </div>

            <div className="studio-panel">
              <h3>Export</h3>
              <div className="gui-field-row">
                <label className="gui-label" htmlFor="scene-export-scale">Scale</label>
                <select
                  id="scene-export-scale"
                  className="select"
                  value={exportScale}
                  onChange={(e) => setExportScale(Number(e.target.value))}
                >
                  {[1, 2, 4].map((scale) => (
                    <option key={scale} value={scale}>
                      {scale}× · {scene.width * scale}×{scene.height * scale}
                    </option>
                  ))}
                </select>
              </div>
              <button className="btn sm primary" onClick={exportPng}>
                <Icon name="download" size={12} /> Scene PNG
              </button>
              <p className="studio-hint">
                PNG keeps the composition flat, nearest-neighbour scaled. Save the scene first if you want these
                settings back in the project file.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
