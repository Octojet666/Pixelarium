import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PageNav } from './PageNav';
import { Icon } from '../components/Icon';
import { Slider } from '../components/Controls';
import { createTilemap, addStarterTiles, composeTilemap, toTiledMap } from '../engine/tilemap';
import { downloadBlob, pixelsToCanvas, safeFilename } from '../editor/exporting';
import { useEditor } from '../store/project';
import { useUi } from '../store/ui';
import type { TilemapDoc } from '../types';

export function TilesetStudio() {
  const doc = useEditor((s) => s.doc);
  const setTilemap = useEditor((s) => s.setTilemap);
  const pushToast = useUi((s) => s.pushToast);
  const setScreen = useUi((s) => s.setScreen);
  const palette = doc.palettes.find((p) => p.id === doc.activePaletteId);

  const [map, setMap] = useState<TilemapDoc>(() => doc.tilemap ?? createTilemap(16, 16, 10, palette?.colors ?? []));
  const [selected, setSelected] = useState<string | null>(map.tiles[0]?.id ?? null);
  const [showGrid, setShowGrid] = useState(true);
  const [mapScale, setMapScale] = useState(2);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const paintingRef = useRef(false);

  useEffect(() => {
    if (!doc.tilemap) setMap((m) => ({ ...m }));
  }, [doc.tilemap]);

  const rendered = useMemo(() => composeTilemap(map), [map]);
  const width = map.cols * map.tileSize;
  const height = map.rows * map.tileSize;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx?.putImageData(new ImageData(new Uint8ClampedArray(rendered), width, height), 0, 0);
  }, [rendered, width, height]);

  const paint = (clientX: number, clientY: number, erase: boolean) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(((clientX - rect.left) / rect.width) * map.cols);
    const y = Math.floor(((clientY - rect.top) / rect.height) * map.rows);
    if (x < 0 || y < 0 || x >= map.cols || y >= map.rows) return;
    const index = y * map.cols + x;
    const tileId = erase ? null : selected;
    if (map.cells[index] === tileId) return;
    setMap((m) => {
      const cells = [...m.cells];
      cells[index] = tileId;
      return { ...m, cells };
    });
  };

  const resize = (cols: number, rows: number) => {
    setMap((m) => {
      const cells = new Array(cols * rows).fill(null) as (string | null)[];
      for (let y = 0; y < Math.min(rows, m.rows); y++) {
        for (let x = 0; x < Math.min(cols, m.cols); x++) {
          cells[y * cols + x] = m.cells[y * m.cols + x];
        }
      }
      return { ...m, cols, rows, cells };
    });
  };

  const save = () => {
    setTilemap(map);
    pushToast('Tilemap saved with the project.', 'success');
  };

  /* The tileset strip the Tiled map references; both exports share this canvas. */
  const buildTilesetCanvas = () => {
    const tileset = document.createElement('canvas');
    tileset.width = map.tileSize * map.tiles.length;
    tileset.height = map.tileSize;
    const ctx = tileset.getContext('2d');
    if (!ctx) return null;
    map.tiles.forEach((tile, i) => {
      const c = pixelsToCanvas(tile.pixels, map.tileSize, map.tileSize);
      ctx.drawImage(c, i * map.tileSize, 0);
    });
    return tileset;
  };

  const exportMap = async () => {
    const stem = safeFilename(doc.name);
    const canvas = pixelsToCanvas(rendered, width, height);
    canvas.toBlob((blob) => {
      if (blob) downloadBlob(blob, `${stem}-tilemap.png`);
    }, 'image/png');
    // Tiled needs the tileset image next to the map, so write both in one action.
    buildTilesetCanvas()?.toBlob((blob) => {
      if (blob) downloadBlob(blob, `${stem}-tileset.png`);
    }, 'image/png');
    const meta = toTiledMap(map, { image: `${stem}-tileset.png`, name: stem });
    downloadBlob(new Blob([JSON.stringify(meta, null, 2)], { type: 'application/json' }), `${stem}-tilemap.json`);
    pushToast('Exported map PNG, tileset PNG and Tiled map JSON.', 'success');
  };

  const exportTileset = async () => {
    buildTilesetCanvas()?.toBlob((blob) => {
      if (blob) downloadBlob(blob, `${safeFilename(doc.name)}-tileset.png`);
    }, 'image/png');
    pushToast('Tileset exported.', 'success');
  };

  const startPaint = useCallback(
    (e: React.PointerEvent) => {
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      paintingRef.current = true;
      paint(e.clientX, e.clientY, e.button === 2);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected, map],
  );

  return (
    <div className="page-shell">
      <div className="page-inner">
        <PageNav />
        <div className="page-head">
          <div>
            <span className="kicker">Game art</span>
            <h1>Tileset & tilemap studio</h1>
            <p>
              Turn your palette into a reusable tileset and lay out a level with snapped painting. The map and tiles are
              saved inside the project and exported as a map PNG, its tileset PNG and a Tiled map JSON that opens in Tiled.
            </p>
          </div>
          <div className="hstack" style={{ gap: 8 }}>
            <button className="btn sm" onClick={exportTileset}>
              <Icon name="download" size={13} /> Tileset PNG
            </button>
            <button className="btn sm" onClick={exportMap}>
              <Icon name="download" size={13} /> Map + JSON
            </button>
            <button className="btn primary sm" onClick={save}>
              <Icon name="save" size={13} /> Save to project
            </button>
            <button className="btn ghost sm" onClick={() => setScreen('editor')}>
              Editor
            </button>
          </div>
        </div>

        <div className="tileset-layout">
          <div className="tile-panel">
            <div className="section-head">
              <h3 style={{ fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                Tiles · {map.tileSize}px
              </h3>
              <button
                className="iconbtn"
                title="Add starter tiles from the active palette"
                onClick={() => {
                  const { tiles, cells } = addStarterTiles(map, palette?.colors ?? []);
                  setMap({ ...map, tiles: [...map.tiles, ...tiles], cells });
                  setSelected(tiles[0]?.id ?? selected);
                  pushToast('Added six starter tiles.', 'success');
                }}
              >
                <Icon name="plus" />
              </button>
            </div>
            <div className="tile-grid">
              {map.tiles.map((tile) => (
                <button
                  key={tile.id}
                  className={selected === tile.id ? 'active' : ''}
                  onClick={() => setSelected(tile.id)}
                  title={`${tile.name} — click to select, then paint the map`}
                >
                  <TilePreview pixels={tile.pixels} size={map.tileSize} />
                </button>
              ))}
              <button
                className={selected === null ? 'active' : ''}
                onClick={() => setSelected(null)}
                title="Eraser"
                style={{ display: 'grid', placeItems: 'center', color: 'var(--text-muted)' }}
              >
                <Icon name="eraser" />
              </button>
            </div>
            <div className="empty-note" style={{ textAlign: 'left', fontSize: 11 }}>
              Right-click paints empty space. The eraser tile in the grid clears single cells.
            </div>
          </div>

          <div className="vstack">
            <div className="map-stage">
              <canvas
                ref={canvasRef}
                style={{
                  width: width * mapScale,
                  height: height * mapScale,
                  cursor: 'crosshair',
                  imageRendering: 'pixelated',
                }}
                onPointerDown={startPaint}
                onPointerMove={(e) => {
                  if (paintingRef.current) paint(e.clientX, e.clientY, e.buttons === 2);
                }}
                onPointerUp={() => {
                  paintingRef.current = false;
                }}
                onPointerLeave={() => {
                  paintingRef.current = false;
                }}
                onContextMenu={(e) => e.preventDefault()}
              />
            </div>
            <div className="hstack" style={{ gap: 14, flexWrap: 'wrap' }}>
              <label className="checkline">
                <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} /> Grid overlay
              </label>
              <div style={{ width: 150 }}>
                <Slider label="Zoom" min={1} max={4} value={mapScale} onChange={setMapScale} format={(v) => `${v}×`} />
              </div>
              {showGrid && <span className="badge">grid {map.tileSize}px</span>}
            </div>
          </div>

          <div className="tile-panel">
            <div className="field">
              <label>Map size</label>
              <div className="hstack">
                <input
                  className="input mono"
                  type="number"
                  min={1}
                  max={64}
                  value={map.cols}
                  onChange={(e) => resize(Math.max(1, Math.min(64, Number(e.target.value) || 1)), map.rows)}
                />
                <span style={{ color: 'var(--text-muted)' }}>×</span>
                <input
                  className="input mono"
                  type="number"
                  min={1}
                  max={64}
                  value={map.rows}
                  onChange={(e) => resize(map.cols, Math.max(1, Math.min(64, Number(e.target.value) || 1)))}
                />
              </div>
            </div>
            <div className="field">
              <label>Tile size</label>
              <select
                className="select"
                value={map.tileSize}
                onChange={(e) => {
                  const tileSize = Number(e.target.value);
                  setMap(createTilemap(tileSize, map.cols, map.rows, palette?.colors ?? []));
                  pushToast(`Started a fresh ${tileSize}px tileset.`, 'info');
                }}
              >
                {[8, 16, 32].map((s) => (
                  <option key={s} value={s}>
                    {s} × {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="divider" />
            <button
              className="btn sm"
              onClick={() => {
                if (!selected) return;
                setMap({ ...map, cells: map.cells.map(() => selected) });
              }}
              disabled={!selected}
            >
              Fill map with tile
            </button>
            <button
              className="btn sm ghost"
              onClick={() => setMap({ ...map, cells: map.cells.map(() => null) })}
            >
              Clear map
            </button>
            <div className="stat-line">
              <span>Tiles</span>
              <b>{map.tiles.length}</b>
            </div>
            <div className="stat-line">
              <span>Placed cells</span>
              <b>{map.cells.filter(Boolean).length}</b>
            </div>
            <div className="stat-line">
              <span>Output</span>
              <b>
                {width}×{height}
              </b>
            </div>
            <div className="empty-note" style={{ textAlign: 'left', fontSize: 11 }}>
              Starter tiles use the active palette: {palette?.name ?? 'default colors'}.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TilePreview({ pixels, size }: { pixels: Uint8ClampedArray; size: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    canvas.width = size;
    canvas.height = size;
    canvas.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(pixels), size, size), 0, 0);
  }, [pixels, size]);
  return <canvas ref={ref} />;
}
