import { useState } from 'react';
import { Modal } from './Modal';
import { Field } from './Controls';
import { Icon } from './Icon';
import { useEditor } from '../store/project';
import { useUi } from '../store/ui';
import { SHEET_JSON_FORMATS, type SheetJsonFormat } from '../engine/sheetFormats';
import {
  exportAllFrames,
  exportGif,
  exportPng,
  exportProjectFile,
  exportSpriteSheet,
  safeFilename,
} from '../editor/exporting';

type Tab = 'image' | 'sheet' | 'gif' | 'project';

const DITHER_OPTIONS = [
  { value: 'none', label: 'No dithering' },
  { value: 'bayer4', label: 'Bayer 4×4' },
  { value: 'bayer8', label: 'Bayer 8×8' },
  { value: 'floyd-steinberg', label: 'Floyd–Steinberg' },
] as const;

export function ExportDialog() {
  const doc = useEditor((s) => s.doc);
  const activeFrameId = useEditor((s) => s.activeFrameId);
  const close = useUi((s) => s.closeDialog);
  const pushToast = useUi((s) => s.pushToast);
  const [tab, setTab] = useState<Tab>('image');
  const [scale, setScale] = useState(1);
  const [transparent, setTransparent] = useState(true);
  const [bgColor, setBgColor] = useState('#0b0a1a');
  const [allFrames, setAllFrames] = useState(false);
  const [columns, setColumns] = useState(Math.min(8, doc.frames.length));
  const [padding, setPadding] = useState(0);
  const [spacing, setSpacing] = useState(0);
  const [withJson, setWithJson] = useState(true);
  const [jsonFormat, setJsonFormat] = useState<SheetJsonFormat>('aseprite');
  const [dither, setDither] = useState<(typeof DITHER_OPTIONS)[number]['value']>('bayer4');
  const [usePalette, setUsePalette] = useState(false);
  const [loop, setLoop] = useState(true);
  const [busy, setBusy] = useState(false);

  const frameIndex = Math.max(0, doc.frames.findIndex((f) => f.id === activeFrameId));
  const background = transparent ? undefined : bgColor;
  const activePalette = doc.palettes.find((p) => p.id === doc.activePaletteId);
  const name = safeFilename(doc.name);

  const run = async (fn: () => Promise<void> | void) => {
    setBusy(true);
    try {
      await fn();
      pushToast('Export complete.', 'success');
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'Export failed.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Export"
      subtitle={`${doc.width}×${doc.height} · ${doc.frames.length} frame${doc.frames.length === 1 ? '' : 's'} · nearest-neighbour scaling`}
      onClose={close}
      wide
      footer={
        <>
          <button className="btn ghost" onClick={close}>
            Close
          </button>
          {tab === 'project' ? (
            <button
              className="btn primary"
              onClick={() => {
                exportProjectFile(doc);
                pushToast('Project file exported (.pxl).', 'success');
              }}
            >
              <Icon name="download" size={13} /> Download .pxl
            </button>
          ) : tab === 'gif' ? (
            <button
              className="btn primary"
              disabled={busy}
              onClick={() =>
                void run(() => {
                  exportGif(
                    doc,
                    {
                      scale,
                      loop,
                      dither,
                      palette: usePalette ? activePalette?.colors : undefined,
                      background,
                    },
                    doc.name,
                  );
                })
              }
            >
              <Icon name="download" size={13} /> Export GIF
            </button>
          ) : tab === 'sheet' ? (
            <button
              className="btn primary"
              disabled={busy}
              onClick={() =>
                void run(() =>
                  exportSpriteSheet(
                    doc,
                    { columns, padding, spacing, scale, background },
                    `${name}-sheet`,
                    withJson,
                    jsonFormat,
                  ),
                )
              }
            >
              <Icon name="download" size={13} /> Export sprite sheet
            </button>
          ) : allFrames ? (
            <button
              className="btn primary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const count = await exportAllFrames(doc, scale, doc.name, background);
                  pushToast(`Downloaded ${count} PNG frames. Check your browser's download bar.`, 'success');
                })
              }
            >
              <Icon name="download" size={13} /> Export {doc.frames.length} PNGs
            </button>
          ) : (
            <button
              className="btn primary"
              disabled={busy}
              onClick={() =>
                void run(() => exportPng(doc, frameIndex, scale, `${name}-frame-${frameIndex + 1}`, background))
              }
            >
              <Icon name="download" size={13} /> Export PNG
            </button>
          )}
        </>
      }
    >
      <div className="tabs">
        {(
          [
            ['image', 'PNG'],
            ['sheet', 'Sprite sheet'],
            ['gif', 'Animated GIF'],
            ['project', 'Project file'],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {tab !== 'project' && (
        <div className="hstack" style={{ flexWrap: 'wrap', gap: 14 }}>
          <Field label="Output scale">
            <select className="select" style={{ width: 120 }} value={scale} onChange={(e) => setScale(Number(e.target.value))}>
              {[1, 2, 3, 4, 6, 8, 10, 16].map((s) => (
                <option key={s} value={s}>
                  {s}× — {doc.width * s}×{doc.height * s}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Background">
            <div className="hstack">
              <label className="checkline">
                <input type="checkbox" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} /> Transparent
              </label>
              {!transparent && (
                <input
                  type="color"
                  value={bgColor}
                  onChange={(e) => setBgColor(e.target.value)}
                  style={{ width: 34, height: 26, background: 'none', border: '1px solid var(--line)', borderRadius: 5 }}
                  aria-label="Background color"
                />
              )}
            </div>
          </Field>
        </div>
      )}

      {tab === 'image' && (
        <div className="vstack">
          <label className="checkline">
            <input type="checkbox" checked={allFrames} onChange={(e) => setAllFrames(e.target.checked)} />
            Export every frame as a numbered PNG
          </label>
          <div className="empty-note" style={{ textAlign: 'left' }}>
            PNG output preserves transparency, is written at true pixel resolution and uses nearest-neighbour scaling so
            pixels stay square at any size.
          </div>
        </div>
      )}

      {tab === 'sheet' && (
        <div className="vstack">
          <div className="hstack" style={{ gap: 14, flexWrap: 'wrap' }}>
            <Field label="Columns">
              <input
                className="input mono"
                type="number"
                min={1}
                max={64}
                value={columns}
                onChange={(e) => setColumns(Math.max(1, Math.min(64, Number(e.target.value) || 1)))}
                style={{ width: 90 }}
              />
            </Field>
            <Field label="Padding" hint="px around the sheet">
              <input
                className="input mono"
                type="number"
                min={0}
                max={64}
                value={padding}
                onChange={(e) => setPadding(Math.max(0, Number(e.target.value) || 0))}
                style={{ width: 90 }}
              />
            </Field>
            <Field label="Spacing" hint="px between cells">
              <input
                className="input mono"
                type="number"
                min={0}
                max={64}
                value={spacing}
                onChange={(e) => setSpacing(Math.max(0, Number(e.target.value) || 0))}
                style={{ width: 90 }}
              />
            </Field>
          </div>
          <label className="checkline">
            <input type="checkbox" checked={withJson} onChange={(e) => setWithJson(e.target.checked)} />
            Also download JSON frame metadata
          </label>
          {withJson && (
            <Field label="JSON format" hint={SHEET_JSON_FORMATS.find((format) => format.id === jsonFormat)?.hint}>
              <select
                className="select"
                style={{ width: 220 }}
                value={jsonFormat}
                onChange={(e) => setJsonFormat(e.target.value as SheetJsonFormat)}
              >
                {SHEET_JSON_FORMATS.map((format) => (
                  <option key={format.id} value={format.id}>
                    {format.label}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <div className="empty-note" style={{ textAlign: 'left' }}>
            {doc.frames.length} frames → {Math.ceil(doc.frames.length / Math.max(1, columns))} rows at {doc.width * scale}×
            {doc.height * scale}px per cell.
          </div>
        </div>
      )}

      {tab === 'gif' && (
        <div className="vstack">
          <div className="hstack" style={{ gap: 14, flexWrap: 'wrap' }}>
            <Field label="Dithering">
              <select
                className="select"
                style={{ width: 180 }}
                value={dither}
                onChange={(e) => setDither(e.target.value as typeof dither)}
              >
                {DITHER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Loop">
              <label className="checkline">
                <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} /> Loop forever
              </label>
            </Field>
            <Field label="Palette">
              <label className="checkline">
                <input type="checkbox" checked={usePalette} onChange={(e) => setUsePalette(e.target.checked)} />
                Use {activePalette?.name ?? 'active palette'}
              </label>
            </Field>
          </div>
          <div className="empty-note" style={{ textAlign: 'left' }}>
            Frames keep their individual durations ({(doc.frames.reduce((a, f) => a + f.duration, 0) / 1000).toFixed(2)}s
            loop). GIF is limited to 256 colors{usePalette && activePalette ? `; this palette has ${activePalette.colors.length}` : '; a palette is built automatically'}.
          </div>
        </div>
      )}

      {tab === 'project' && (
        <div className="vstack">
          <div className="empty-note" style={{ textAlign: 'left' }}>
            The native <code>.pxl</code> format mixes readable JSON with base64 cel data. It preserves layers, frames,
            durations, palettes, tags and metadata. Photoshop-style formats are not supported.
          </div>
          <div className="stat-grid">
            <div className="stat">
              <div className="k">Layers</div>
              <div className="v">{doc.layers.length}</div>
            </div>
            <div className="stat">
              <div className="k">Frames</div>
              <div className="v">{doc.frames.length}</div>
            </div>
            <div className="stat">
              <div className="k">Palettes</div>
              <div className="v">{doc.palettes.length}</div>
            </div>
            <div className="stat">
              <div className="k">Tags</div>
              <div className="v">{doc.tags.length}</div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
