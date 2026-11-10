import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { PageNav } from '../screens/PageNav';
import { compositeFrame } from '../engine/composite';
import {
  assetsFromDoc,
  autoColumns,
  buildManifest,
  emptyPack,
  framesAsAssets,
  packCellCount,
  packCells,
  packFilename,
  planSheet,
  validatePack,
  type AssetKind,
  type AssetPack,
} from '../engine/assetPack';
import { canvasToBlob, downloadBlob, exportAllFrames } from '../editor/exporting';
import { buildSheetJson, SHEET_JSON_FORMATS, type SheetJsonFormat } from '../engine/sheetFormats';
import { useEditor } from '../store/project';
import { useUi } from '../store/ui';

const KIND_OPTIONS: { id: AssetKind; label: string }[] = [
  { id: 'sprite', label: 'Sprite / character' },
  { id: 'icon', label: 'Icon' },
  { id: 'emote', label: 'Emote' },
  { id: 'ui', label: 'UI element' },
  { id: 'tile', label: 'Tile' },
];

/**
 * Shared asset-pack workspace, used by the Game Asset Studio and the Icon & Asset Pack Studio.
 *
 * The two disciplines differ in how a project is read - one animated asset versus one asset per frame -
 * and in the defaults they start from; the packing, manifest and export code is the same, which is the
 * point of building the studios on one engine.
 */
export function PackStudio() {
  const doc = useEditor((s) => s.doc);
  const revision = useEditor((s) => s.revision);
  const mode = useUi((s) => s.packMode);
  const setScreen = useUi((s) => s.setScreen);
  const pushToast = useUi((s) => s.pushToast);

  const [columns, setColumns] = useState(4);
  const [jsonFormat, setJsonFormat] = useState<SheetJsonFormat>('pixelarium');
  const [padding, setPadding] = useState(2);
  const [spacing, setSpacing] = useState(1);
  const [scale, setScale] = useState(1);
  const [perFrame, setPerFrame] = useState(mode === 'icons');
  const [kind, setKind] = useState<AssetKind>(mode === 'icons' ? 'icon' : 'sprite');
  const [pack, setPack] = useState<AssetPack>(() =>
    emptyPack({ name: mode === 'icons' ? 'UI icons' : 'Game assets', namespace: mode === 'icons' ? 'ui_icons' : 'game_assets' }),
  );
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  /* A different project or workflow resets the asset list to what the document actually contains. */
  useEffect(() => {
    const assets = perFrame ? framesAsAssets(doc, mode === 'icons' ? 'icon' : 'asset', kind) : assetsFromDoc(doc, kind);
    setPack((current) => ({ ...current, assets }));
  }, [doc.id, doc.frames.length, perFrame, kind, mode]);

  useEffect(() => {
    setPerFrame(mode === 'icons');
    setKind(mode === 'icons' ? 'icon' : 'sprite');
    setPack((current) => ({
      ...current,
      name: mode === 'icons' ? 'UI icons' : 'Game assets',
      namespace: mode === 'icons' ? 'ui_icons' : 'game_assets',
    }));
  }, [mode]);

  const cells = useMemo(() => packCells(pack), [pack]);
  const layout = useMemo(
    () => planSheet(cells, doc.width * scale, doc.height * scale, columns, padding, spacing),
    [cells, doc.width, doc.height, columns, padding, spacing, scale],
  );
  const problems = useMemo(() => validatePack(pack, doc), [pack, doc]);

  /* Draw the sheet exactly as the manifest describes it. */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = layout.width;
    canvas.height = layout.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;

    const source = document.createElement('canvas');
    source.width = doc.width;
    source.height = doc.height;
    const sourceCtx = source.getContext('2d');
    if (!sourceCtx) return;

    const cell = layout.rects[0];
    layout.rects.forEach((rect) => {
      const asset = pack.assets[rect.asset];
      const frameIndex = asset?.frames[rect.frame];
      if (frameIndex === undefined || frameIndex >= doc.frames.length) return;
      const pixels = compositeFrame(doc, frameIndex);
      const image = sourceCtx.createImageData(doc.width, doc.height);
      image.data.set(pixels);
      sourceCtx.putImageData(image, 0, 0);
      ctx.drawImage(source, rect.x, rect.y, cell?.w ?? doc.width, cell?.h ?? doc.height);
    });
  }, [doc, revision, layout, pack]);

  const updatePack = (patch: Partial<AssetPack>) => setPack((current) => ({ ...current, ...patch }));

  const describePack = () => `${packFilename(pack)}.png`;

  const exportPack = async (withFrames: boolean) => {
    setBusy(true);
    try {
      const canvas = canvasRef.current;
      if (!canvas) throw new Error('The sheet canvas is not ready.');
      const stem = packFilename(pack);
      // Aseprite tags address the sheet in cell order, so walk every asset's span in that same order.
      const tags: { name: string; from: number; to: number }[] = [];
      let cursor = 0;
      for (const asset of pack.assets) {
        if (asset.frames.length > 1) tags.push({ name: asset.name || asset.id, from: cursor, to: cursor + asset.frames.length - 1 });
        cursor += asset.frames.length;
      }
      const payload =
        jsonFormat === 'pixelarium'
          ? buildManifest(pack, layout, doc.frames.map((f) => f.duration), {
              sheetFile: describePack(),
              padding,
              spacing,
              fps: 8,
            })
          : buildSheetJson(jsonFormat, {
              image: describePack(),
              width: layout.width,
              height: layout.height,
              frames: layout.rects.map((rect) => {
                const asset = pack.assets[rect.asset];
                const frameIndex = asset?.frames[rect.frame] ?? 0;
                return {
                  name: `${asset?.id ?? 'asset'}_${rect.frame}`,
                  x: rect.x,
                  y: rect.y,
                  w: rect.w,
                  h: rect.h,
                  duration: doc.frames[frameIndex]?.duration ?? 120,
                  animation: asset?.id,
                };
              }),
              animations: pack.assets.map((asset) => ({
                name: asset.id,
                frames: asset.frames.map((_, order) => `${asset.id}_${order}`),
              })),
              tags,
            });
      downloadBlob(await canvasToBlob(canvas), `${stem}.png`);
      downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), `${stem}.json`);
      let frames = 0;
      if (withFrames) frames = await exportAllFrames(doc, scale, stem);
      pushToast(
        frames > 0 ? `Exported sheet, manifest and ${frames} frame PNGs.` : 'Exported sheet and manifest.',
        'success',
      );
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'Export failed.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const title = mode === 'icons' ? 'Icon & Asset Pack Studio' : 'Game Asset Studio';
  const cellCount = packCellCount(pack);

  return (
    <div className="page-shell">
      <div className="page-inner">
        <PageNav />

        <div className="studio-workspace-head">
          <div>
            <button className="studio-back" onClick={() => setScreen('studios')}>
              <Icon name="arrow-left" size={12} /> Studios
            </button>
            <h1 className="studio-title">{title}</h1>
            <p className="studio-sub">
              {doc.name} · {doc.width}×{doc.height} · {doc.frames.length} frames · {cellCount} cells ·{' '}
              {layout.width}×{layout.height} sheet
            </p>
          </div>
          <div className="studio-head-actions">
            <button className="btn sm" onClick={() => setScreen('editor')}>
              <Icon name="pencil" size={13} /> Edit art
            </button>
            <button className="btn sm primary" onClick={() => void exportPack(false)} disabled={busy || problems.length > 0}>
              <Icon name="image" size={13} /> Export pack
            </button>
          </div>
        </div>

        <div className="studio-split">
          <section className="studio-main">
            <div className="pack-canvas-wrap">
              <canvas ref={canvasRef} className="pack-canvas" aria-label="Sprite sheet preview" />
            </div>
            <p className="studio-hint">
              This is the sheet exactly as exported: {layout.columns}×{layout.rows} cells, {packCellCount(pack)} in
              total. Transparent pixels stay transparent, so the sheet drops straight into an engine.
            </p>

            <div className="pack-controls">
              <label className="gui-label" htmlFor="pack-columns">Columns</label>
              <input
                id="pack-columns"
                className="input mono"
                type="number"
                min={1}
                max={32}
                value={columns}
                onChange={(e) => setColumns(Math.max(1, Math.min(32, Number(e.target.value) || 1)))}
              />
              <button className="btn sm ghost" onClick={() => setColumns(autoColumns(cellCount))}>
                Auto
              </button>
              <label className="gui-label" htmlFor="pack-padding">Padding</label>
              <input
                id="pack-padding"
                className="input mono"
                type="number"
                min={0}
                max={16}
                value={padding}
                onChange={(e) => setPadding(Math.max(0, Math.min(16, Number(e.target.value) || 0)))}
              />
              <label className="gui-label" htmlFor="pack-spacing">Spacing</label>
              <input
                id="pack-spacing"
                className="input mono"
                type="number"
                min={0}
                max={16}
                value={spacing}
                onChange={(e) => setSpacing(Math.max(0, Math.min(16, Number(e.target.value) || 0)))}
              />
              <label className="gui-label" htmlFor="pack-scale">Scale</label>
              <select
                id="pack-scale"
                className="select"
                value={scale}
                onChange={(e) => setScale(Number(e.target.value))}
              >
                {[1, 2, 3, 4].map((value) => (
                  <option key={value} value={value}>
                    {value}×
                  </option>
                ))}
              </select>
            </div>

            <div className="studio-panel">
              <h3>Assets</h3>
              <div className="pack-asset-head">
                <label className="hstack" style={{ gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={perFrame}
                    onChange={(e) => setPerFrame(e.target.checked)}
                    aria-label="One asset per frame"
                  />
                  <span>One asset per frame (icon sheets)</span>
                </label>
                <select
                  className="select"
                  value={kind}
                  onChange={(e) => setKind(e.target.value as AssetKind)}
                  aria-label="Asset kind"
                >
                  {KIND_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="pack-asset-list">
                {pack.assets.map((asset, index) => (
                  <div key={asset.id} className="pack-asset-row">
                    <span className="mono pack-cell-badge">{index + 1}</span>
                    <input
                      className="input"
                      value={asset.name}
                      onChange={(e) =>
                        setPack((current) => ({
                          ...current,
                          assets: current.assets.map((a, i) => (i === index ? { ...a, name: e.target.value } : a)),
                        }))
                      }
                      aria-label={`Asset ${index + 1} name`}
                    />
                    <span className="studio-metric">
                      {asset.frames.length} frame{asset.frames.length === 1 ? '' : 's'}
                    </span>
                    <input
                      className="input mono"
                      value={asset.tags.join(', ')}
                      onChange={(e) =>
                        setPack((current) => ({
                          ...current,
                          assets: current.assets.map((a, i) =>
                            i === index
                              ? { ...a, tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) }
                              : a,
                          ),
                        }))
                      }
                      placeholder="tags"
                      aria-label={`Asset ${index + 1} tags`}
                    />
                  </div>
                ))}
              </div>
            </div>
          </section>

          <aside className="studio-side">
            <div className="studio-panel">
              <h3>Pack</h3>
              <div className="gui-field-row">
                <label className="gui-label" htmlFor="pack-name">Name</label>
                <input id="pack-name" className="input" value={pack.name} onChange={(e) => updatePack({ name: e.target.value })} />
              </div>
              <div className="gui-field-row">
                <label className="gui-label" htmlFor="pack-namespace">Namespace</label>
                <input
                  id="pack-namespace"
                  className="input mono"
                  value={pack.namespace}
                  onChange={(e) => updatePack({ namespace: e.target.value.toLowerCase() })}
                />
              </div>
              <div className="gui-field-row">
                <label className="gui-label" htmlFor="pack-author">Author</label>
                <input id="pack-author" className="input" value={pack.author} onChange={(e) => updatePack({ author: e.target.value })} />
              </div>
              <div className="gui-field-row">
                <label className="gui-label" htmlFor="pack-license">License</label>
                <input id="pack-license" className="input mono" value={pack.license} onChange={(e) => updatePack({ license: e.target.value })} />
              </div>
              <div className="gui-field-row">
                <label className="gui-label" htmlFor="pack-version">Version</label>
                <input id="pack-version" className="input mono" value={pack.version} onChange={(e) => updatePack({ version: e.target.value })} />
              </div>
              <div className="gui-field-row gui-field-stack">
                <label className="gui-label" htmlFor="pack-description">Description</label>
                <textarea
                  id="pack-description"
                  className="input gui-textarea"
                  rows={3}
                  value={pack.description}
                  onChange={(e) => updatePack({ description: e.target.value })}
                />
              </div>
            </div>

            <div className="studio-panel">
              <h3>Validation</h3>
              {problems.length === 0 ? (
                <p className="studio-ok">
                  <Icon name="check" size={12} /> Pack is consistent and ready to export.
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
                <label className="gui-label" htmlFor="pack-json-format">JSON</label>
                <select
                  id="pack-json-format"
                  className="select"
                  value={jsonFormat}
                  onChange={(e) => setJsonFormat(e.target.value as SheetJsonFormat)}
                >
                  {SHEET_JSON_FORMATS.map((format) => (
                    <option key={format.id} value={format.id}>
                      {format.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="studio-export-list">
                <button className="btn sm primary" onClick={() => void exportPack(false)} disabled={busy || problems.length > 0}>
                  <Icon name="image" size={13} /> Sheet + manifest
                </button>
                <button className="btn sm" onClick={() => void exportPack(true)} disabled={busy || problems.length > 0 || doc.frames.length > 24}>
                  <Icon name="layers" size={13} /> Sheet + manifest + PNGs
                </button>
              </div>
              <p className="studio-hint">
                {describePack()} and its <code>.json</code> file share one layout.{' '}
                {SHEET_JSON_FORMATS.find((format) => format.id === jsonFormat)?.hint} Per-frame PNGs export up to 24 frames.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
