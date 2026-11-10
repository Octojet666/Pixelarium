import { useEffect, useRef, useState } from 'react';
import { hexToHsl, hexToRgb, hslToHex, hexToRgba } from '../engine/color';
import { extractPalette } from '../engine/quantize';
import { parsePaletteText, paletteToHexText, paletteFromHexList, sortPalette } from '../engine/palettes';
import { replaceColor } from '../engine/draw';
import { compositeFrame } from '../engine/composite';
import { Icon } from '../components/Icon';
import { Slider } from '../components/Controls';
import { useEditor } from '../store/project';
import { useUi } from '../store/ui';

const RECENT_KEY = 'pixelarium.recent-colors';

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((c) => typeof c === 'string').slice(0, 24) : [];
  } catch {
    return [];
  }
}

export function ColorPanel() {
  const doc = useEditor((s) => s.doc);
  // Document mutations happen in place, so subscribe to the revision counter too.
  const revision = useEditor((s) => s.revision);
  void revision;
  const primary = doc.primary;
  const secondary = doc.secondary;
  const setPrimary = useEditor((s) => s.setPrimary);
  const setSecondary = useEditor((s) => s.setSecondary);
  const swapColors = useEditor((s) => s.swapColors);
  const setActivePalette = useEditor((s) => s.setActivePalette);
  const updatePaletteColors = useEditor((s) => s.updatePaletteColors);
  const addPalette = useEditor((s) => s.addPalette);
  const copyPalette = useEditor((s) => s.copyPalette);
  const snapToPalette = useEditor((s) => s.snapToPalette);
  const setIndexed = useEditor((s) => s.setIndexed);
  const remapAllToPalette = useEditor((s) => s.remapAllToPalette);
  const setScreen = useUi((s) => s.setScreen);
  const pushToast = useUi((s) => s.pushToast);

  const [hue, setHue] = useState(() => Math.round(hexToHsl(primary)[0] * 360));
  const [hexDraft, setHexDraft] = useState(primary);
  const [recent, setRecent] = useState<string[]>(loadRecent);
  const [editingSwatch, setEditingSwatch] = useState(false);
  const svRef = useRef<HTMLDivElement | null>(null);
  const hueRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const palette = doc.palettes.find((p) => p.id === doc.activePaletteId) ?? doc.palettes[0];

  useEffect(() => {
    setHexDraft(primary);
    const [h, s] = hexToHsl(primary);
    if (s > 0.02) setHue(Math.round(h * 360));
  }, [primary]);

  useEffect(() => {
    setRecent((prev) => {
      if (prev[0] === primary) return prev;
      const next = [primary, ...prev.filter((c) => c !== primary)].slice(0, 24);
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {
        /* storage may be disabled */
      }
      return next;
    });
  }, [primary]);

  const [, sat, light] = hexToHsl(primary);
  const svX = sat * 100;
  const svY = (1 - light) * 100;
  const [r, g, b] = hexToRgb(primary);
  const hsl = hexToHsl(primary);

  const pickSV = (clientX: number, clientY: number) => {
    const el = svRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const s = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const v = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height));
    // HSV -> HSL
    const l = v * (1 - s / 2);
    const sl = l === 0 || l === 1 ? 0 : (v - l) / Math.min(l, 1 - l);
    setPrimary(hslToHex(hue / 360, sl, l));
  };

  const pickHue = (clientX: number) => {
    const el = hueRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const h = Math.max(0, Math.min(359, ((clientX - rect.left) / rect.width) * 360));
    setHue(Math.round(h));
    const [hh, ss, ll] = hexToHsl(primary);
    void hh;
    setPrimary(hslToHex(h / 360, ss || 0.6, ll || 0.5));
  };

  const startDrag = (handler: (x: number, y: number) => void) => (e: React.PointerEvent) => {
    e.preventDefault();
    handler(e.clientX, e.clientY);
    const move = (ev: PointerEvent) => handler(ev.clientX, ev.clientY);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const applyHex = (value: string) => {
    const normalized = value.trim().match(/^#?[0-9a-fA-F]{6}$/) ? `#${value.trim().replace('#', '').toLowerCase()}` : null;
    if (!normalized) {
      pushToast('Enter a 6-digit hex color, e.g. #ffcc00.', 'warning');
      setHexDraft(primary);
      return;
    }
    setPrimary(normalized);
  };

  const importPalette = async (file: File) => {
    const text = await file.text();
    const imported = parsePaletteText(text, file.name.replace(/\.[^.]+$/, ''));
    if (imported.colors.length === 0) {
      pushToast('No colors found in that file.', 'warning');
      return;
    }
    addPalette(imported);
    pushToast(`Imported ${imported.colors.length} colors as “${imported.name}”.`, 'success');
  };

  const exportPalette = () => {
    if (!palette) return;
    const blob = new Blob([paletteToHexText(palette)], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${palette.name.toLowerCase().replace(/\s+/g, '-')}.hex`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const extractFromArtwork = () => {
    const store = useEditor.getState();
    const idx = store.doc.frames.findIndex((f) => f.id === store.activeFrameId);
    if (idx < 0) return;
    const pixels = compositeFrame(store.doc, idx);
    const colors = extractPalette(pixels, 16);
    if (colors.length === 0) {
      pushToast('Draw something first — the artwork is empty.', 'warning');
      return;
    }
    addPalette(paletteFromHexList('Extracted palette', colors));
    pushToast(`Extracted ${colors.length} colors from this frame.`, 'success');
  };

  const replacePrimaryWithSecondary = () => {
    const store = useEditor.getState();
    const cel = store.getActiveCel();
    if (!cel) return;
    const before = new Uint8ClampedArray(cel);
    replaceColor(cel, store.doc.width, store.doc.height, hexToRgba(primary), hexToRgba(secondary), 0);
    store.pushPixelEdit('Replace color', before);
    pushToast(`Replaced ${primary.toUpperCase()} with ${secondary.toUpperCase()} on this layer.`, 'success');
  };

  return (
    <div className="panel-scroll">
      <div className="panel-section">
        <div className="color-sv" ref={svRef} onPointerDown={startDrag(pickSV)}>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hue} 100% 50%))`,
            }}
          />
          <div className="thumb" style={{ left: `${svX}%`, top: `${svY}%` }} />
        </div>
        <div className="hue-slider" ref={hueRef} onPointerDown={startDrag((x) => pickHue(x))}>
          <div className="thumb" style={{ left: `${(hue / 360) * 100}%` }} />
        </div>
        <div className="fg-bg">
          <button
            className="iconbtn"
            style={{ background: primary, border: '1px solid var(--line)', width: 34, height: 30 }}
            onClick={() => setEditingSwatch((v) => !v)}
            title="Primary color"
            aria-label="Primary color"
          />
          <button
            style={{
              background: secondary,
              width: 24,
              height: 24,
              borderRadius: 5,
              border: '1px solid var(--line)',
            }}
            onClick={() => setSecondary(primary)}
            title="Secondary color — click to copy primary"
            aria-label="Secondary color"
          />
          <button className="swap-btn" onClick={swapColors} title="Swap (X)" aria-label="Swap colors">
            <Icon name="swap" size={14} />
          </button>
          <input
            className="input mono"
            style={{ width: 88, height: 26, marginLeft: 'auto' }}
            value={hexDraft}
            onChange={(e) => setHexDraft(e.target.value)}
            onBlur={() => applyHex(hexDraft)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                applyHex(hexDraft);
                (e.target as HTMLInputElement).blur();
              }
            }}
            spellCheck={false}
            aria-label="Hex color"
          />
        </div>
        {editingSwatch && (
          <div className="stat-grid">
            <div className="stat">
              <div className="k">RGB</div>
              <div className="v" style={{ fontSize: 11 }}>
                {r} {g} {b}
              </div>
            </div>
            <div className="stat">
              <div className="k">HSL</div>
              <div className="v" style={{ fontSize: 11 }}>
                {Math.round(hsl[0] * 360)}° {Math.round(hsl[1] * 100)}% {Math.round(hsl[2] * 100)}%
              </div>
            </div>
          </div>
        )}
      </div>

      {recent.length > 0 && (
        <div className="panel-section">
          <div className="section-head">
            <h3>Recent</h3>
            <button className="iconbtn" style={{ width: 20, height: 20 }} onClick={() => setRecent([])} title="Clear recent colors">
              <Icon name="trash" size={12} />
            </button>
          </div>
          <div className="recent-strip">
            {recent.map((c) => (
              <button key={c} style={{ background: c }} title={c} onClick={() => setPrimary(c)} onContextMenu={(e) => { e.preventDefault(); setSecondary(c); }} />
            ))}
          </div>
        </div>
      )}

      <div className="panel-section">
        <div className="section-head">
          <h3>Palette</h3>
          <button className="iconbtn" style={{ width: 22, height: 22 }} onClick={() => setScreen('palettes')} title="Open the palette library">
            <Icon name="external" size={13} />
          </button>
        </div>
        <select className="select" value={doc.activePaletteId} onChange={(e) => setActivePalette(e.target.value)}>
          {doc.palettes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {p.colors.length}
            </option>
          ))}
        </select>
        <label className="checkline" title="Colors you pick snap to this palette and brush opacity stays opaque">
          <input type="checkbox" checked={doc.indexed === true} onChange={(e) => setIndexed(e.target.checked)} />
          Indexed color mode
        </label>
        {palette && (
          <>
            <div className="swatch-grid">
              {palette.colors.map((c, i) => (
                <button
                  key={`${c}-${i}`}
                  className={`swatch${c === primary ? ' active' : ''}`}
                  style={{ background: c }}
                  title={`${c.toUpperCase()} — click to use, right-click for secondary`}
                  onClick={() => setPrimary(c)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setSecondary(c);
                  }}
                />
              ))}
              <button
                className="swatch"
                style={{
                  background: 'var(--ink-3)',
                  color: 'var(--text-muted)',
                  display: 'grid',
                  placeItems: 'center',
                  borderStyle: 'dashed',
                }}
                title="Add the primary color to this palette"
                onClick={() => updatePaletteColors(palette.id, [...palette.colors, primary])}
              >
                <Icon name="plus" size={12} />
              </button>
            </div>
            <div className="palette-actions">
              <button className="btn sm" onClick={() => updatePaletteColors(palette.id, sortPalette(palette.colors, 'hue'))} title="Sort by hue">
                Sort
              </button>
              <button className="btn sm" onClick={extractFromArtwork} title="Build a palette from the current frame">
                Extract
              </button>
              <button className="btn sm" onClick={snapToPalette} title="Snap every pixel on the active layer to this palette">
                Snap
              </button>
              <button className="btn sm" onClick={remapAllToPalette} title="Snap every layer and every frame to this palette">
                Remap all
              </button>
              <div className="spacer" />
              <button className="iconbtn" onClick={copyPalette} title="Copy palette colors">
                <Icon name="copy" />
              </button>
              <button className="iconbtn" onClick={exportPalette} title="Export palette as .hex">
                <Icon name="download" />
              </button>
              <button className="iconbtn" onClick={() => fileRef.current?.click()} title="Import palette (.hex, .gpl, .pal)">
                <Icon name="upload" />
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".hex,.gpl,.pal,.txt,text/plain"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importPalette(f);
                e.target.value = '';
              }}
            />
            <div className="hstack">
              <button className="btn sm ghost" onClick={replacePrimaryWithSecondary} title="Replace every pixel of the primary color on this layer">
                Replace color
              </button>
              <button
                className="btn sm ghost"
                onClick={() => {
                  const colors = palette.colors.filter((c) => c !== primary);
                  updatePaletteColors(palette.id, colors.length >= 2 ? colors : palette.colors);
                }}
                disabled={!palette.colors.includes(primary)}
              >
                Remove swatch
              </button>
            </div>
          </>
        )}
      </div>

      <div className="panel-section">
        <div className="section-head">
          <h3>Tint</h3>
        </div>
        <Slider
          label="Brush opacity"
          min={5}
          max={100}
          value={Math.round(useEditor.getState().toolSettings.opacity * 100)}
          onChange={(v) => useEditor.getState().updateToolSettings({ opacity: v / 100 })}
          format={(v) => `${v}%`}
        />
      </div>
    </div>
  );
}
