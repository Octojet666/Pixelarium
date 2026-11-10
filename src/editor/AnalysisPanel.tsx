import { useMemo } from 'react';
import { compositeFrame } from '../engine/composite';
import { analyzePixels, inspectPixels, type AssistantIssue } from '../engine/analyze';
import { extractPalette } from '../engine/quantize';
import { paletteFromHexList } from '../engine/palettes';
import { Icon } from '../components/Icon';
import { useEditor } from '../store/project';
import { useUi } from '../store/ui';

export function AnalysisPanel() {
  const doc = useEditor((s) => s.doc);
  const revision = useEditor((s) => s.revision);
  const activeFrameId = useEditor((s) => s.activeFrameId);
  const activeLayerId = useEditor((s) => s.activeLayerId);
  const settings = useEditor((s) => s.toolSettings);
  const addPalette = useEditor((s) => s.addPalette);
  const snapToPalette = useEditor((s) => s.snapToPalette);
  const setHighlights = useUi((s) => s.setHighlights);
  const pushToast = useUi((s) => s.pushToast);

  const frameIndex = doc.frames.findIndex((f) => f.id === activeFrameId);
  const palette = doc.palettes.find((p) => p.id === doc.activePaletteId);

  const { dna, issues } = useMemo(() => {
    if (frameIndex < 0) {
      return { dna: analyzePixels(new Uint8ClampedArray(0)), issues: [] as AssistantIssue[] };
    }
    void revision;
    const pixels = compositeFrame(doc, frameIndex);
    const analysis = analyzePixels(pixels);
    const found = inspectPixels(pixels, doc.width, doc.height, {
      palette: palette?.colors ?? [],
      symmetryX: settings.symmetryX,
      symmetryY: settings.symmetryY,
    });
    return { dna: analysis, issues: found };
  }, [doc, frameIndex, revision, palette, settings.symmetryX, settings.symmetryY, activeLayerId]);

  const extract = () => {
    if (frameIndex < 0) return;
    const colors = extractPalette(compositeFrame(doc, frameIndex), 16);
    if (colors.length === 0) {
      pushToast('This frame is empty — nothing to extract.', 'warning');
      return;
    }
    addPalette(paletteFromHexList('Frame palette', colors));
    pushToast(`Saved a ${colors.length}-color palette from this frame.`, 'success');
  };

  const focusIssue = (issue: AssistantIssue) => {
    if (issue.points.length === 0) {
      setHighlights([]);
      return;
    }
    setHighlights(issue.points);
    pushToast(`Highlighting ${issue.points.length} pixel${issue.points.length === 1 ? '' : 's'}. Click the issue again to clear.`, 'info');
  };

  return (
    <div className="panel-scroll">
      <div className="panel-section">
        <div className="section-head">
          <h3>Palette DNA</h3>
          <button className="iconbtn" style={{ width: 22, height: 22 }} onClick={extract} title="Save this frame's palette">
            <Icon name="plus" size={13} />
          </button>
        </div>
        {dna.totalOpaque === 0 ? (
          <div className="empty-note">Draw on this frame to generate its color identity.</div>
        ) : (
          <>
            <div className="dna-bars">
              {dna.colors.slice(0, 12).map((c) => (
                <span key={c.hex} style={{ background: c.hex, flex: Math.max(0.04, c.share) }} />
              ))}
            </div>
            <div className="dna-list">
              {dna.colors.slice(0, 6).map((c) => (
                <div className="dna-row" key={c.hex}>
                  <span className="sw" style={{ background: c.hex }} />
                  <span className="bar">
                    <i style={{ width: `${Math.max(3, c.share * 100)}%` }} />
                  </span>
                  <span className="mono" style={{ color: 'var(--text-muted)' }}>
                    {Math.round(c.share * 100)}%
                  </span>
                </div>
              ))}
            </div>
            <div className="stat-grid">
              <div className="stat">
                <div className="k">Colors</div>
                <div className="v">{dna.uniqueColors}</div>
              </div>
              <div className="stat">
                <div className="k">Contrast</div>
                <div className="v">{dna.contrast.range}%</div>
              </div>
              <div className="stat">
                <div className="k">Saturation</div>
                <div className="v">{Math.round(dna.saturation.mean * 100)}%</div>
              </div>
              <div className="stat">
                <div className="k">Temperature</div>
                <div className="v" style={{ fontSize: 12 }}>{dna.temperature}</div>
              </div>
            </div>
            <p style={{ fontSize: 10.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Hue spread {dna.hueSpread}° · lightness {dna.contrast.min}–{dna.contrast.max}%.{' '}
              {dna.families[0] && `Dominant family: ${dna.families[0].name.toLowerCase()}.`}
            </p>
            <button className="btn sm" onClick={snapToPalette}>
              Snap layer to palette
            </button>
          </>
        )}
      </div>

      <div className="panel-section">
        <div className="section-head">
          <h3>Pixel assistant</h3>
          <span className="badge">{issues.length} checks</span>
        </div>
        {issues.length === 0 ? (
          <div className="empty-note">
            No issues found on this frame. Rules check stray pixels, outline consistency, palette drift and symmetry.
            <br />
            <button className="btn sm ghost" style={{ marginTop: 8 }} onClick={() => setHighlights([])}>
              Clear highlights
            </button>
          </div>
        ) : (
          <div className="vstack" style={{ gap: 7 }}>
            {issues.map((issue) => (
              <button key={`${issue.kind}-${issue.title}`} className={`issue ${issue.severity}`} onClick={() => focusIssue(issue)}>
                <span className="issue-kind">{issue.kind.replace(/-/g, ' ')}</span>
                <strong>{issue.title}</strong>
                <p>{issue.detail}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="panel-section">
        <div className="section-head">
          <h3>Workspace</h3>
        </div>
        <div className="stat-line">
          <span>Canvas</span>
          <b>
            {doc.width}×{doc.height}
          </b>
        </div>
        <div className="stat-line">
          <span>Layers</span>
          <b>{doc.layers.length}</b>
        </div>
        <div className="stat-line">
          <span>Frames</span>
          <b>{doc.frames.length}</b>
        </div>
        <div className="stat-line">
          <span>Active palette</span>
          <b style={{ fontSize: 10.5 }}>{palette?.name ?? '—'}</b>
        </div>
        <button className="btn sm ghost" onClick={() => useUi.getState().openDialog('about')}>
          About this project
        </button>
      </div>
    </div>
  );
}
