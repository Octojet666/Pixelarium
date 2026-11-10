import { useState } from 'react';
import { TOOL_BY_ID } from './tools';
import { Slider, Segmented } from '../components/Controls';
import { Icon } from '../components/Icon';
import { useEditor } from '../store/project';
import { useUi } from '../store/ui';
import {
  BUILTIN_BRUSHES,
  brushRowsFromPixels,
  deleteBrush,
  loadSavedBrushes,
  saveBrush,
  type BrushPreset,
} from '../engine/brushes';

function BrushThumb({ rows }: { rows: string[] }) {
  return (
    <span className="brush-thumb" aria-hidden>
      {rows.map((row, y) => (
        <span key={y} className="brush-thumb-row">
          {row.split('').map((cell, x) => (
            <span key={x} className={cell === '#' ? 'on' : ''} />
          ))}
        </span>
      ))}
    </span>
  );
}

export function ToolOptions() {
  const tool = useEditor((s) => s.tool);
  const settings = useEditor((s) => s.toolSettings);
  const update = useEditor((s) => s.updateToolSettings);
  const [collapsed, setCollapsed] = useState(false);
  const [brushTick, setBrushTick] = useState(0);
  const pushToast = useUi((s) => s.pushToast);
  const def = TOOL_BY_ID.get(tool);
  void brushTick;

  const brushes: BrushPreset[] = [...BUILTIN_BRUSHES, ...loadSavedBrushes()];

  const saveBrushFromSelection = () => {
    const store = useEditor.getState();
    const cel = store.getActiveCel();
    const bounds = store.selection?.bounds;
    if (!cel || !bounds) {
      pushToast('Select an area first — the selection becomes the brush shape.', 'warning');
      return;
    }
    const rows = brushRowsFromPixels(cel, store.doc.width, store.doc.height, bounds);
    if (!rows) {
      pushToast('That selection is empty.', 'warning');
      return;
    }
    const name = window.prompt('Name this brush', `Brush ${bounds.w}×${bounds.h}`) ?? '';
    const saved = saveBrush(name, rows);
    update({ brushId: saved.id });
    setBrushTick((t) => t + 1);
    pushToast(`Saved “${saved.name}”. It stays in this browser.`, 'success');
  };

  const showBrush = ['pencil', 'eraser', 'line', 'rect', 'rect-filled', 'ellipse', 'ellipse-filled', 'dither', 'spray', 'shade'].includes(tool);
  const showShape = ['pencil', 'eraser', 'line', 'dither', 'spray'].includes(tool);
  const showTolerance = tool === 'bucket';

  return (
    <div className="tool-options">
      <div className="tool-options-head">
        <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          {def && <Icon name={def.icon} size={14} />}
          {def?.label ?? 'Tool'}
        </span>
        <button className="iconbtn" style={{ width: 22, height: 22 }} onClick={() => setCollapsed((c) => !c)} aria-label="Collapse tool options">
          <Icon name={collapsed ? 'chevron-down' : 'chevron-up'} size={13} />
        </button>
      </div>
      {!collapsed && (
        <div className="tool-options-body">
          {showBrush && (
            <Slider
              label="Brush size"
              min={1}
              max={32}
              value={settings.size}
              onChange={(size) => update({ size })}
              format={(v) => `${v} px`}
            />
          )}
          {tool !== 'select' && tool !== 'select-free' && tool !== 'move' && tool !== 'eyedropper' && tool !== 'text' && (
            <Slider
              label="Opacity"
              min={5}
              max={100}
              value={Math.round(settings.opacity * 100)}
              onChange={(v) => update({ opacity: v / 100 })}
              format={(v) => `${v}%`}
            />
          )}
          {showShape && (
            <div className="row-between">
              <span className="label">Tip shape</span>
              <div style={{ width: 108 }}>
                <Segmented
                  options={[
                    { value: 'square', label: 'Square' },
                    { value: 'circle', label: 'Round' },
                  ]}
                  value={settings.shape}
                  onChange={(shape) => update({ shape })}
                />
              </div>
            </div>
          )}
          {showTolerance && (
            <Slider
              label="Tolerance"
              min={0}
              max={128}
              value={settings.tolerance}
              onChange={(tolerance) => update({ tolerance })}
            />
          )}
          {tool === 'spray' && (
            <Slider
              label="Density"
              min={5}
              max={100}
              value={Math.round(settings.sprayDensity * 100)}
              onChange={(v) => update({ sprayDensity: v / 100 })}
              format={(v) => `${v}%`}
            />
          )}
          {tool === 'dither' && (
            <div className="field">
              <label>Pattern</label>
              <select
                className="select"
                value={settings.ditherPattern}
                onChange={(e) => update({ ditherPattern: e.target.value as typeof settings.ditherPattern })}
              >
                <option value="bayer2">Bayer 2×2</option>
                <option value="bayer4">Bayer 4×4</option>
                <option value="checker">Checker</option>
                <option value="noise">Noise</option>
              </select>
            </div>
          )}
          {tool === 'gradient' && (
            <div className="field">
              <label>Gradient</label>
              <select
                className="select"
                value={settings.gradientMode}
                onChange={(e) => update({ gradientMode: e.target.value as 'linear' | 'radial' })}
              >
                <option value="linear">Linear</option>
                <option value="radial">Radial</option>
              </select>
            </div>
          )}
          {tool === 'text' && (
            <Slider
              label="Text scale"
              min={1}
              max={6}
              value={settings.fontScale}
              onChange={(fontScale) => update({ fontScale })}
              format={(v) => `${v}×`}
            />
          )}
          {tool === 'pencil' && (
            <label className="checkline">
              <input
                type="checkbox"
                checked={settings.pixelPerfect}
                onChange={(e) => update({ pixelPerfect: e.target.checked })}
              />
              Pixel-perfect strokes
            </label>
          )}
          <div className="divider" style={{ margin: '2px 0' }} />
          <div className="row-between">
            <span className="label">Mirror</span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                className={`iconbtn${settings.symmetryX ? ' active' : ''}`}
                onClick={() => update({ symmetryX: !settings.symmetryX })}
                title="Mirror horizontally"
              >
                <Icon name="flip-x" />
              </button>
              <button
                className={`iconbtn${settings.symmetryY ? ' active' : ''}`}
                onClick={() => update({ symmetryY: !settings.symmetryY })}
                title="Mirror vertically"
              >
                <Icon name="flip-y" />
              </button>
            </div>
          </div>
          <div className="divider" style={{ margin: '2px 0' }} />
          <div className="row-between">
            <span className="label">Tile mode</span>
            <button
              className={`btn sm ghost${settings.tileMode ? ' active' : ''}`}
              onClick={() => update({ tileMode: !settings.tileMode })}
              title="Wrap freehand strokes across the canvas edges for seamless tiles"
            >
              {settings.tileMode ? 'On' : 'Off'}
            </button>
          </div>
          {settings.tileMode && (
            <label className="checkline">
              <input
                type="checkbox"
                checked={settings.tilePreview}
                onChange={(e) => update({ tilePreview: e.target.checked })}
              />
              Show 3×3 tiled preview
            </label>
          )}
          <div className="row-between">
            <span className="label">Pressure</span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                className={`btn sm ghost${settings.pressureSize ? ' active' : ''}`}
                onClick={() => update({ pressureSize: !settings.pressureSize })}
                title="Pen pressure changes brush size"
              >
                Size
              </button>
              <button
                className={`btn sm ghost${settings.pressureOpacity ? ' active' : ''}`}
                onClick={() => update({ pressureOpacity: !settings.pressureOpacity })}
                title="Pen pressure changes opacity"
              >
                Flow
              </button>
            </div>
          </div>
          {showBrush && (
            <div className="field">
              <label>Brush</label>
              <div className="brush-row">
                <button
                  className={`brush-chip${settings.brushId === '' ? ' active' : ''}`}
                  onClick={() => update({ brushId: '' })}
                  title="Round or square tip (Tip shape below)"
                >
                  Tip
                </button>
                {brushes.map((brush) => (
                  <button
                    key={brush.id}
                    className={`brush-chip${settings.brushId === brush.id ? ' active' : ''}`}
                    onClick={() => update({ brushId: brush.id })}
                    onContextMenu={(e) => {
                      if (brush.builtin) return;
                      e.preventDefault();
                      deleteBrush(brush.id);
                      if (settings.brushId === brush.id) update({ brushId: '' });
                      setBrushTick((t) => t + 1);
                      pushToast(`Deleted “${brush.name}”.`, 'info');
                    }}
                    title={`${brush.name}${brush.builtin ? '' : ' — right-click to delete'}`}
                  >
                    <BrushThumb rows={brush.rows} />
                  </button>
                ))}
                <button className="brush-chip" onClick={saveBrushFromSelection} title="Save the selected pixels as a brush">
                  <Icon name="plus" size={12} />
                </button>
              </div>
              {settings.brushId !== '' && <p style={{ fontSize: 10, color: 'var(--text-muted)' }}>Custom brushes keep their own pixel size; the slider only scales built-ins.</p>}
            </div>
          )}
          <p style={{ fontSize: 10.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>{def?.hint}</p>
        </div>
      )}
    </div>
  );
}
