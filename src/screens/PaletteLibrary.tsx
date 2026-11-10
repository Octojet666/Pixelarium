import { useMemo, useState } from 'react';
import { PageNav } from './PageNav';
import { Icon } from '../components/Icon';
import { BUILTIN_PALETTES, paletteFromHexList, parsePaletteText, paletteToHexText } from '../engine/palettes';
import { extractPalette } from '../engine/quantize';
import { compositeFrame } from '../engine/composite';
import { useEditor } from '../store/project';
import { useUi } from '../store/ui';

export function PaletteLibrary() {
  const doc = useEditor((s) => s.doc);
  // Palettes are mutated in place, so the document reference alone never changes; revision does.
  const revision = useEditor((s) => s.revision);
  const setActivePalette = useEditor((s) => s.setActivePalette);
  const addPalette = useEditor((s) => s.addPalette);
  const updatePaletteColors = useEditor((s) => s.updatePaletteColors);
  const removePalette = useEditor((s) => s.removePalette);
  const setPrimary = useEditor((s) => s.setPrimary);
  const setScreen = useUi((s) => s.setScreen);
  const pushToast = useUi((s) => s.pushToast);
  const [importText, setImportText] = useState('');
  const [showImport, setShowImport] = useState(false);

  const palettes = useMemo(() => doc.palettes, [doc, revision]);
  const builtinIds = new Set(BUILTIN_PALETTES.map((p) => p.id));

  const activatePalette = (id: string) => {
    setActivePalette(id);
    pushToast('Palette applied to this project.', 'success');
  };

  const exportPalette = (id: string) => {
    const palette = palettes.find((p) => p.id === id);
    if (!palette) return;
    const blob = new Blob([paletteToHexText(palette)], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${palette.name.toLowerCase().replace(/\s+/g, '-')}.hex`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    pushToast(`Exported “${palette.name}”.`, 'success');
  };

  const extractFromCanvas = () => {
    const store = useEditor.getState();
    const idx = store.doc.frames.findIndex((f) => f.id === store.activeFrameId);
    if (idx < 0) return;
    const colors = extractPalette(compositeFrame(store.doc, idx), 16);
    if (colors.length === 0) {
      pushToast('Draw something first — this frame has no opaque pixels.', 'warning');
      return;
    }
    addPalette(paletteFromHexList('Palette from artwork', colors));
    pushToast('Created a palette from the current frame.', 'success');
  };

  return (
    <div className="page-shell">
      <div className="page-inner">
        <PageNav />
        <div className="page-head">
          <div>
            <span className="kicker">Color</span>
            <h1>Palette library</h1>
            <p>
              Nine curated palettes designed around a mood and a light source, plus palettes you build yourself. Palettes
              live inside the project, so they travel with exported <code>.pxl</code> files.
            </p>
          </div>
          <div className="hstack" style={{ gap: 8 }}>
            <button className="btn sm" onClick={extractFromCanvas}>
              <Icon name="magic" size={13} /> Extract from artwork
            </button>
            <button className="btn sm" onClick={() => setShowImport((v) => !v)}>
              <Icon name="upload" size={13} /> Import palette
            </button>
            <button
              className="btn primary sm"
              onClick={() => {
                addPalette(paletteFromHexList(`Palette ${palettes.length + 1 - BUILTIN_PALETTES.length}`, [doc.primary, doc.secondary]));
                pushToast('New palette created from your active colors.', 'success');
              }}
            >
              <Icon name="plus" size={13} /> New palette
            </button>
          </div>
        </div>

        {showImport && (
          <div className="palette-card" style={{ marginBottom: 16 }}>
            <div className="section-head">
              <h3 style={{ fontFamily: 'var(--font-ui)', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                Paste a palette
              </h3>
              <button className="iconbtn" onClick={() => setShowImport(false)}>
                <Icon name="close" />
              </button>
            </div>
            <textarea
              className="input"
              rows={4}
              placeholder={'#0b0a1a\n#241d4a\n#b06cff\n…  or a JASC-PAL / GIMP palette'}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
            />
            <div className="hstack">
              <button
                className="btn sm"
                onClick={() => {
                  const parsed = parsePaletteText(importText, 'Pasted palette');
                  if (parsed.colors.length < 2) {
                    pushToast('That text does not contain at least two colors.', 'warning');
                    return;
                  }
                  addPalette(parsed);
                  setImportText('');
                  setShowImport(false);
                  pushToast(`Imported ${parsed.colors.length} colors.`, 'success');
                }}
              >
                Add palette
              </button>
              <input
                type="file"
                accept=".hex,.gpl,.pal,.txt,text/plain"
                className="input"
                style={{ paddingTop: 5 }}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const text = await file.text();
                  const parsed = parsePaletteText(text, file.name.replace(/\.[^.]+$/, ''));
                  if (parsed.colors.length < 2) {
                    pushToast('No colors found in that file.', 'warning');
                    return;
                  }
                  addPalette(parsed);
                  pushToast(`Imported “${parsed.name}”.`, 'success');
                  e.target.value = '';
                }}
              />
            </div>
          </div>
        )}

        <div className="palette-browser">
          {palettes.map((palette) => {
            const active = palette.id === doc.activePaletteId;
            return (
              <div key={palette.id} className={`palette-card${active ? ' active' : ''}`}>
                <div className="row-between">
                  <h3>{palette.name}</h3>
                  {active ? (
                    <span className="badge amber">In use</span>
                  ) : builtinIds.has(palette.id) ? (
                    <span className="badge">Built-in</span>
                  ) : (
                    <span className="badge">Custom</span>
                  )}
                </div>
                <p>
                  {sortedDescription(palette.id) ??
                    `${palette.colors.length} colors · custom to this project.`}
                </p>
                <div className="palette-strip">
                  {palette.colors.map((c, i) => (
                    <button
                      key={`${c}-${i}`}
                      style={{ background: c }}
                      title={`${c.toUpperCase()} — click to set as primary color`}
                      onClick={() => {
                        setPrimary(c);
                        pushToast(`Primary color set to ${c.toUpperCase()}.`, 'info');
                      }}
                    />
                  ))}
                </div>
                <div className="palette-actions">
                  <button className="btn sm" onClick={() => activatePalette(palette.id)} disabled={active}>
                    {active ? 'Active' : 'Use in project'}
                  </button>
                  <div className="spacer" />
                  <button className="iconbtn" title="Export as .hex" onClick={() => exportPalette(palette.id)}>
                    <Icon name="download" />
                  </button>
                  {!builtinIds.has(palette.id) && (
                    <>
                      <button
                        className="iconbtn"
                        title="Add the primary color"
                        onClick={() => updatePaletteColors(palette.id, [...palette.colors, doc.primary])}
                      >
                        <Icon name="plus" />
                      </button>
                      <button
                        className="iconbtn"
                        title="Remove this palette"
                        onClick={() => {
                          if (window.confirm(`Remove “${palette.name}” from this project?`)) removePalette(palette.id);
                        }}
                      >
                        <Icon name="trash" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="hstack" style={{ marginTop: 26 }}>
          <button className="btn ghost sm" onClick={() => setScreen('editor')}>
            <Icon name="arrow-left" size={13} /> Back to the editor
          </button>
        </div>
      </div>
    </div>
  );

  function sortedDescription(id: string) {
    return BUILTIN_PALETTES.find((p) => p.id === id)?.description;
  }
}
