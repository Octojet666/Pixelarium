import { useMemo } from 'react';
import { PageNav } from './PageNav';
import { Icon } from '../components/Icon';
import { PixelCanvas, ProjectLoop } from '../components/PixelCanvas';
import { compositeFrame } from '../engine/composite';
import { analyzePixels } from '../engine/analyze';
import { exportGif, exportPng } from '../editor/exporting';
import { useEditor } from '../store/project';
import { useUi } from '../store/ui';

export function Showcase() {
  const doc = useEditor((s) => s.doc);
  const setScreen = useUi((s) => s.setScreen);
  const openDialog = useUi((s) => s.openDialog);
  const pushToast = useUi((s) => s.pushToast);

  const dna = useMemo(() => analyzePixels(compositeFrame(doc, 0)), [doc]);
  const palette = doc.palettes.find((p) => p.id === doc.activePaletteId);
  const durationMs = doc.frames.reduce((a, f) => a + f.duration, 0);
  const isEmpty = dna.totalOpaque === 0;

  return (
    <div className="page-shell showcase-page">
      <PageNav />
      <div className="showcase-hero">
        <div className="showcase-art">
          {isEmpty ? (
            <div className="empty-note" style={{ maxWidth: 300 }}>
              This canvas is still empty. Draw something in the editor and the showcase will present it here.
            </div>
          ) : (
            <ProjectLoop doc={doc} scale={Math.max(2, Math.floor(340 / Math.max(doc.width, doc.height)))} />
          )}
        </div>
        <div className="showcase-info">
          <span className="kicker">Showcase · {doc.frames.length > 1 ? 'animated' : 'still'}</span>
          <h1>{doc.name}</h1>
          <p className="lede">
            {doc.meta.description ||
              'No description yet. Add one in Project details so this page reads the way you want it to.'}
          </p>
          <div className="showcase-meta">
            <span className="badge amber">{doc.width}×{doc.height}</span>
            <span className="badge">{doc.frames.length} frames</span>
            <span className="badge">{doc.layers.length} layers</span>
            <span className="badge">{palette?.name ?? 'No palette'}</span>
            <span className="badge">{dna.uniqueColors} colors</span>
          </div>
          <div className="hstack" style={{ flexWrap: 'wrap', gap: 8 }}>
            <button className="btn primary" onClick={() => setScreen('editor')}>
              <Icon name="pencil" size={14} /> Open in editor
            </button>
            <button className="btn" onClick={() => openDialog('export')}>
              <Icon name="download" size={14} /> Export
            </button>
            <button
              className="btn ghost"
              onClick={() => {
                try {
                  exportGif(doc, { scale: 4, loop: true, dither: 'bayer4' }, doc.name);
                  pushToast('GIF export started.', 'success');
                } catch (error) {
                  pushToast(error instanceof Error ? error.message : 'GIF export failed.', 'error');
                }
              }}
            >
              <Icon name="film" size={14} /> GIF
            </button>
            <button
              className="btn ghost"
              onClick={() => void exportPng(doc, 0, 4, `${doc.name}-hero`)}
              title="Export a 4× PNG of the first frame"
            >
              <Icon name="image" size={14} /> PNG
            </button>
          </div>
          <div className="showcase-details">
            <div>
              <div className="k">Artist</div>
              <div className="v">{doc.meta.author || 'Anonymous'}</div>
            </div>
            <div>
              <div className="k">Loop</div>
              <div className="v">{(durationMs / 1000).toFixed(2)}s</div>
            </div>
            <div>
              <div className="k">Palette</div>
              <div className="v">{palette?.colors.length ?? 0} colors</div>
            </div>
            <div>
              <div className="k">Created</div>
              <div className="v">{new Date(doc.meta.createdAt).toLocaleDateString()}</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1180, width: '100%', margin: '0 auto', padding: '0 30px 70px' }}>
        <div className="home-two-col">
          <div>
            <div className="section-title">
              <h2>Palette DNA</h2>
              <span>extracted from frame 1</span>
            </div>
            {isEmpty ? (
              <div className="empty-note">Nothing to analyze yet.</div>
            ) : (
              <div className="home-side-card" style={{ gap: 14 }}>
                <div className="dna-bars" style={{ height: 12 }}>
                  {dna.colors.slice(0, 14).map((c) => (
                    <span key={c.hex} style={{ background: c.hex, flex: Math.max(0.04, c.share) }} />
                  ))}
                </div>
                <div className="stat-grid">
                  <div className="stat">
                    <div className="k">Dominant</div>
                    <div className="v" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {dna.colors[0] && <span style={{ width: 10, height: 10, background: dna.colors[0].hex, borderRadius: 2 }} />}
                      {dna.colors[0]?.hex.toUpperCase()}
                    </div>
                  </div>
                  <div className="stat">
                    <div className="k">Contrast range</div>
                    <div className="v">{dna.contrast.range}%</div>
                  </div>
                  <div className="stat">
                    <div className="k">Temperature</div>
                    <div className="v" style={{ fontSize: 12 }}>{dna.temperature}</div>
                  </div>
                  <div className="stat">
                    <div className="k">Hue spread</div>
                    <div className="v">{dna.hueSpread}°</div>
                  </div>
                </div>
                {palette && (
                  <div className="palette-strip" style={{ height: 30 }}>
                    {palette.colors.map((c) => (
                      <span key={c} style={{ background: c, flex: 1 }} title={c} />
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="section-title" style={{ marginTop: 26 }}>
              <h2>Frames</h2>
              <span>{doc.frames.length} cel composites</span>
            </div>
            <div className="hstack" style={{ flexWrap: 'wrap', gap: 10 }}>
              {doc.frames.map((frame, i) => (
                <div key={frame.id} className="home-side-card" style={{ padding: 8, gap: 6 }}>
                  <PixelCanvas
                    pixels={compositeFrame(doc, i)}
                    width={doc.width}
                    height={doc.height}
                    scale={Math.max(1, Math.floor(84 / Math.max(doc.width, doc.height)))}
                  />
                  <span className="mono" style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    {i + 1} · {frame.duration}ms
                  </span>
                </div>
              ))}
            </div>
          </div>

          <aside className="vstack" style={{ gap: 14 }}>
            <div className="home-side-card">
              <h3>Publishing</h3>
              <p style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.65 }}>
                This release is a local-first studio: publishing to a public gallery needs the account and community
                service, which is specified in the roadmap but not yet shipped. Nothing here is uploaded or shared
                silently.
              </p>
              <button className="btn sm" disabled title="Requires the community service">
                <Icon name="upload" size={13} /> Publish (coming with accounts)
              </button>
              <button className="btn sm ghost" onClick={() => openDialog('rename')}>
                Edit description & credit
              </button>
            </div>
            <div className="home-side-card">
              <h3>Remix etiquette</h3>
              <p style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.65 }}>
                Exported <code>.pxl</code> files keep the original author and description, so a remix carries attribution
                even before the community service exists. Add the original creator to the author field when you build on
                someone's work.
              </p>
            </div>
            <div className="home-side-card">
              <h3>Project facts</h3>
              <div className="stat-line">
                <span>Tags</span>
                <b style={{ fontSize: 10.5 }}>{doc.meta.tags.join(', ') || '—'}</b>
              </div>
              <div className="stat-line">
                <span>Animation tags</span>
                <b>{doc.tags.length}</b>
              </div>
              <div className="stat-line">
                <span>Tilemap</span>
                <b>{doc.tilemap ? 'Yes' : 'None'}</b>
              </div>
              <div className="stat-line">
                <span>Format</span>
                <b>.pxl v1</b>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
