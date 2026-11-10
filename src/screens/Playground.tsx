import { useMemo, useState } from 'react';
import { PageNav } from './PageNav';
import { Icon } from '../components/Icon';
import { Slider } from '../components/Controls';
import { PixelCanvas } from '../components/PixelCanvas';
import { GENERATORS, generate, generatorPreset, mulberry32, type GeneratorKind } from '../engine/procedural';
import { compositeFrame } from '../engine/composite';
import { applyPalette, extractPalette, type DitherMethod } from '../engine/quantize';
import {
  addNoise,
  addOutline,
  adjustHsl,
  brightnessContrast,
  dropShadow,
  glow,
  mirrorPixels,
  pixelate,
  quantizeCel,
  tint,
  DEFAULT_EFFECTS,
  type EffectOptions,
} from '../engine/effects';
import { hexToRgba } from '../engine/color';
import { createCel } from '../engine/pixel';
import { createProject } from '../engine/document';
import { useEditor } from '../store/project';
import { useUi } from '../store/ui';

type LabTab = 'generate' | 'dither' | 'effects';

const EFFECT_LIST = [
  { id: 'outline', label: 'Outline', icon: 'target' },
  { id: 'shadow', label: 'Drop shadow', icon: 'layers' },
  { id: 'glow', label: 'Glow', icon: 'sparkles' },
  { id: 'tint', label: 'Tint', icon: 'palette' },
  { id: 'hue', label: 'Hue shift', icon: 'rotate' },
  { id: 'brightness', label: 'Brightness', icon: 'shade' },
  { id: 'noise', label: 'Noise', icon: 'dither' },
  { id: 'quantize', label: 'Quantize', icon: 'grid' },
  { id: 'pixelate', label: 'Pixelate', icon: 'image' },
  { id: 'mirror', label: 'Mirror', icon: 'flip-x' },
] as const;

export function Playground() {
  const [tab, setTab] = useState<LabTab>('generate');
  const setScreen = useUi((s) => s.setScreen);
  return (
    <div className="page-shell">
      <div className="page-inner">
        <PageNav />
        <div className="page-head">
          <div>
            <span className="kicker">Creative lab</span>
            <h1>Playground</h1>
            <p>
              Deterministic procedural generation, a dithering studio and pixel effects. Everything previews before it
              touches your artwork, and results become ordinary editable layers.
            </p>
          </div>
          <div className="hstack">
            <div className="tabs" style={{ width: 330 }}>
              <button className={tab === 'generate' ? 'active' : ''} onClick={() => setTab('generate')}>
                Generate
              </button>
              <button className={tab === 'dither' ? 'active' : ''} onClick={() => setTab('dither')}>
                Dither studio
              </button>
              <button className={tab === 'effects' ? 'active' : ''} onClick={() => setTab('effects')}>
                Effects
              </button>
            </div>
            <button className="btn ghost sm" onClick={() => setScreen('editor')}>
              <Icon name="arrow-left" size={13} /> Editor
            </button>
          </div>
        </div>
        {tab === 'generate' && <Generator />}
        {tab === 'dither' && <DitherStudio />}
        {tab === 'effects' && <EffectsStudio />}
      </div>
    </div>
  );
}

function Generator() {
  const doc = useEditor((s) => s.doc);
  const replaceActiveCel = useEditor((s) => s.replaceActiveCel);
  const loadDocument = useEditor((s) => s.loadDocument);
  const setScreen = useUi((s) => s.setScreen);
  const pushToast = useUi((s) => s.pushToast);
  const palette = doc.palettes.find((p) => p.id === doc.activePaletteId);
  const [kind, setKind] = useState<GeneratorKind>('mountains');
  const [seed, setSeed] = useState(4821);
  const [density, setDensity] = useState(0.6);
  const [complexity, setComplexity] = useState(4);
  const [symmetry, setSymmetry] = useState<'none' | 'x' | 'y' | 'xy'>('none');
  const [size, setSize] = useState(64);
  const [locked, setLocked] = useState(false);

  const result = useMemo(
    () =>
      generate({
        kind,
        seed,
        width: size,
        height: size,
        density,
        complexity,
        symmetry,
        palette: palette?.colors ?? ['#0b0a1a', '#5b4a9b', '#c9a6ff', '#38e8ff'],
      }),
    [kind, seed, size, density, complexity, symmetry, palette],
  );

  const reroll = () => {
    if (locked) {
      pushToast('Seed is locked. Unlock it to randomize.', 'info');
      return;
    }
    const rand = mulberry32((Date.now() & 0xffffffff) >>> 0);
    setSeed(Math.floor(rand() * 999999));
  };

  const applyAsLayer = () => {
    const canvas = createCel(doc.width, doc.height);
    const offsetX = Math.floor((doc.width - size) / 2);
    const offsetY = Math.floor((doc.height - size) / 2);
    for (let y = 0; y < doc.height; y++) {
      const sy = y - offsetY;
      if (sy < 0 || sy >= size) continue;
      for (let x = 0; x < doc.width; x++) {
        const sx = x - offsetX;
        if (sx < 0 || sx >= size) continue;
        const si = (sy * size + sx) * 4;
        const di = (y * doc.width + x) * 4;
        canvas[di] = result.pixels[si];
        canvas[di + 1] = result.pixels[si + 1];
        canvas[di + 2] = result.pixels[si + 2];
        canvas[di + 3] = result.pixels[si + 3];
      }
    }
    replaceActiveCel(`${GENERATORS.find((g) => g.kind === kind)?.label} #${seed}`, canvas, true);
    setScreen('editor');
    pushToast('Generated art inserted as an editable layer.', 'success');
  };

  const applyAsProject = () => {
    const next = createProject({ width: size, height: size, name: `${GENERATORS.find((g) => g.kind === kind)?.label} #${seed}` });
    const layer = next.layers[0];
    next.frames[0].cels[layer.id] = new Uint8ClampedArray(result.pixels);
    next.activePaletteId = palette?.id ?? next.activePaletteId;
    loadDocument(next);
    setScreen('editor');
    pushToast('Generated art opened as a new project.', 'success');
  };

  return (
    <div className="workbench">
      <div className="workbench-side">
        <div>
          <div className="kicker" style={{ marginBottom: 7 }}>
            Generator
          </div>
          <div className="gen-kind-grid">
            {GENERATORS.map((g) => (
              <button
                key={g.kind}
                className={`gen-kind${kind === g.kind ? ' active' : ''}`}
                onClick={() => {
                  setKind(g.kind);
                  const preset = generatorPreset(g.kind);
                  setDensity(preset.density);
                  setComplexity(preset.complexity);
                }}
                title={g.blurb}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>Seed</label>
          <div className="hstack" style={{ gap: 4 }}>
            <input
              className="input mono"
              type="number"
              value={seed}
              onChange={(e) => setSeed(Number(e.target.value) || 0)}
              style={{ flex: 1 }}
            />
            <button className={`iconbtn${locked ? ' active' : ''}`} onClick={() => setLocked(!locked)} title={locked ? 'Unlock seed' : 'Lock seed'}>
              <Icon name={locked ? 'lock' : 'unlock'} />
            </button>
            <button className="iconbtn" onClick={reroll} title="Randomize seed">
              <Icon name="magic" />
            </button>
          </div>
        </div>
        <Slider label="Density" min={0} max={100} value={Math.round(density * 100)} onChange={(v) => setDensity(v / 100)} format={(v) => `${v}%`} />
        <Slider label="Complexity" min={1} max={6} value={complexity} onChange={setComplexity} />
        <div className="field">
          <label>Symmetry</label>
          <select className="select" value={symmetry} onChange={(e) => setSymmetry(e.target.value as typeof symmetry)}>
            <option value="none">None</option>
            <option value="x">Mirror horizontally</option>
            <option value="y">Mirror vertically</option>
            <option value="xy">Mirror both</option>
          </select>
        </div>
        <div className="field">
          <label>Output size</label>
          <select className="select" value={size} onChange={(e) => setSize(Number(e.target.value))}>
            {[16, 32, 48, 64, 96, 128].map((s) => (
              <option key={s} value={s}>
                {s} × {s}
              </option>
            ))}
          </select>
        </div>
        <div className="empty-note" style={{ textAlign: 'left', fontSize: 11 }}>
          Colors come from <strong style={{ color: 'var(--text-dim)' }}>{palette?.name}</strong> ({palette?.colors.length} swatches).
          The same seed and settings always reproduce this exact result.
        </div>
      </div>

      <div className="stage-card">
        <div className="stage-toolbar">
          <div className="hstack" style={{ gap: 6 }}>
            <span className="badge amber">seed #{seed}</span>
            <span className="badge">{size}px</span>
            <span className="badge">{GENERATORS.find((g) => g.kind === kind)?.label}</span>
          </div>
          <div className="hstack" style={{ gap: 6 }}>
            <button className="btn sm" onClick={reroll}>
              <Icon name="magic" size={13} /> Reroll
            </button>
            <button className="btn sm" onClick={applyAsLayer}>
              <Icon name="layers" size={13} /> Add as layer
            </button>
            <button className="btn primary sm" onClick={applyAsProject}>
              <Icon name="sparkles" size={13} /> New project
            </button>
          </div>
        </div>
        <PixelCanvas pixels={result.pixels} width={size} height={size} scale={Math.max(2, Math.floor(400 / size))} />
        <div className="stage-meta">
          <span>{size}×{size}</span>
          <span>deterministic</span>
          <span>editable output</span>
        </div>
      </div>
    </div>
  );
}

function DitherStudio() {
  const doc = useEditor((s) => s.doc);
  const revision = useEditor((s) => s.revision);
  const replaceActiveCel = useEditor((s) => s.replaceActiveCel);
  const appendLayer = useEditor((s) => s.addLayer);
  const pushToast = useUi((s) => s.pushToast);
  const palette = doc.palettes.find((p) => p.id === doc.activePaletteId);
  const [method, setMethod] = useState<DitherMethod>('bayer4');
  const [intensity, setIntensity] = useState(1);
  const [maxColors, setMaxColors] = useState(12);
  const [useProjectPalette, setUseProjectPalette] = useState(true);

  const activeFrameId = useEditor((s) => s.activeFrameId);
  const frameIndex = useMemo(() => doc.frames.findIndex((f) => f.id === activeFrameId), [doc, activeFrameId]);
  const source = useMemo(() => {
    if (frameIndex < 0) return null;
    return compositeFrame(doc, frameIndex);
  }, [doc, frameIndex, revision]);

  const targetPalette = useMemo(() => {
    if (!source) return [];
    if (useProjectPalette && palette) return palette.colors.slice(0, maxColors);
    return extractPalette(source, maxColors);
  }, [source, palette, maxColors, useProjectPalette]);

  const result = useMemo(() => {
    if (!source) return null;
    return applyPalette(source, doc.width, doc.height, targetPalette, method, intensity);
  }, [source, doc.width, doc.height, targetPalette, method, intensity]);

  const apply = (asLayer: boolean) => {
    if (!result) return;
    if (!asLayer) {
      replaceActiveCel('Dither studio', result, false);
    } else {
      appendLayer('Dithered');
      const store = useEditor.getState();
      const cel = store.getActiveCel();
      if (!cel) return;
      const before = new Uint8ClampedArray(cel);
      cel.set(result);
      store.pushPixelEdit('Dither studio', before);
    }
    pushToast('Dithering applied to the current frame.', 'success');
  };

  if (!source || !result) {
    return <div className="empty-note">Open a project to use the dithering studio.</div>;
  }

  return (
    <div className="workbench">
      <div className="workbench-side">
        <div className="field">
          <label>Dithering method</label>
          <select className="select" value={method} onChange={(e) => setMethod(e.target.value as DitherMethod)}>
            <option value="none">None (nearest color)</option>
            <option value="bayer2">Bayer 2×2</option>
            <option value="bayer4">Bayer 4×4</option>
            <option value="bayer8">Bayer 8×8</option>
            <option value="floyd-steinberg">Floyd–Steinberg</option>
          </select>
        </div>
        <Slider label="Dither intensity" min={10} max={200} value={Math.round(intensity * 100)} onChange={(v) => setIntensity(v / 100)} format={(v) => `${v}%`} />
        <Slider label="Color count" min={2} max={32} value={maxColors} onChange={setMaxColors} />
        <label className="checkline">
          <input type="checkbox" checked={useProjectPalette} onChange={(e) => setUseProjectPalette(e.target.checked)} />
          Use the project palette
        </label>
        <div className="swatch-grid" style={{ marginTop: 4 }}>
          {targetPalette.map((c) => (
            <span key={c} className="swatch" style={{ background: c }} title={c} />
          ))}
        </div>
        <div className="divider" />
        <button className="btn" onClick={() => apply(false)}>
          <Icon name="check" size={13} /> Apply to layer
        </button>
        <button className="btn ghost" onClick={() => apply(true)}>
          <Icon name="layers" size={13} /> Apply to a new layer
        </button>
        <div className="empty-note" style={{ textAlign: 'left', fontSize: 11 }}>
          Preview uses a median-cut palette when the project palette is off. Applying replaces pixels on the active
          layer and stays in the undo history.
        </div>
      </div>
      <div className="stage-card" style={{ flexDirection: 'row', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
          <span className="kicker">Original</span>
          <PixelCanvas
            pixels={source}
            width={doc.width}
            height={doc.height}
            scale={Math.max(1, Math.floor(260 / Math.max(doc.width, doc.height)))}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
          <span className="kicker">Dithered · {targetPalette.length} colors</span>
          <PixelCanvas
            pixels={result}
            width={doc.width}
            height={doc.height}
            scale={Math.max(1, Math.floor(260 / Math.max(doc.width, doc.height)))}
          />
        </div>
      </div>
    </div>
  );
}

function EffectsStudio() {
  const doc = useEditor((s) => s.doc);
  const revision = useEditor((s) => s.revision);
  const activeLayerId = useEditor((s) => s.activeLayerId);
  const activeFrameId = useEditor((s) => s.activeFrameId);
  const replaceActiveCel = useEditor((s) => s.replaceActiveCel);
  const pushToast = useUi((s) => s.pushToast);
  const palette = doc.palettes.find((p) => p.id === doc.activePaletteId);
  const [effect, setEffect] = useState<(typeof EFFECT_LIST)[number]['id']>('outline');
  const [opts, setOpts] = useState<EffectOptions>({ ...DEFAULT_EFFECTS });
  const [asLayer, setAsLayer] = useState(true);

  const frame = doc.frames.find((f) => f.id === activeFrameId);
  const source = useMemo(() => {
    const cel = frame?.cels[activeLayerId];
    return cel ? new Uint8ClampedArray(cel) : createCel(doc.width, doc.height);
  }, [frame, activeLayerId, doc.width, doc.height, revision]);

  const result = useMemo(() => {
    switch (effect) {
      case 'outline':
        return addOutline(source, doc.width, doc.height, hexToRgba(opts.outlineColor), opts.outlineThickness);
      case 'shadow':
        return dropShadow(source, doc.width, doc.height, opts.shadowOffsetX, opts.shadowOffsetY, opts.shadowColor, opts.shadowOpacity);
      case 'glow':
        return glow(source, doc.width, doc.height, opts.glowColor, opts.glowRadius);
      case 'tint':
        return tint(source, opts.tintColor, opts.tintStrength);
      case 'hue':
        return adjustHsl(source, opts.hueShift, 1, 0);
      case 'brightness':
        return brightnessContrast(source, opts.brightness, opts.contrast);
      case 'noise':
        return addNoise(source, doc.width, doc.height, opts.noiseAmount, opts.noiseSeed);
      case 'quantize':
        return quantizeCel(source, doc.width, doc.height, palette?.colors.slice(0, opts.quantizeColors) ?? [], opts.dither);
      case 'pixelate':
        return pixelate(source, doc.width, doc.height, opts.pixelateSize);
      case 'mirror':
        return mirrorPixels(source, doc.width, doc.height, 'horizontal');
      default:
        return source;
    }
  }, [source, effect, opts, doc.width, doc.height, palette]);

  const update = (patch: Partial<EffectOptions>) => setOpts({ ...opts, ...patch });

  const apply = () => {
    replaceActiveCel(`Effect: ${EFFECT_LIST.find((e) => e.id === effect)?.label}`, result, asLayer);
    pushToast('Effect applied.', 'success');
  };

  return (
    <div className="workbench">
      <div className="workbench-side">
        <div className="field">
          <label>Effect</label>
          <div className="gen-kind-grid">
            {EFFECT_LIST.map((e) => (
              <button key={e.id} className={`gen-kind${effect === e.id ? ' active' : ''}`} onClick={() => setEffect(e.id)}>
                {e.label}
              </button>
            ))}
          </div>
        </div>
        {effect === 'outline' && (
          <>
            <label className="checkline">
              <input type="color" value={opts.outlineColor} onChange={(e) => update({ outlineColor: e.target.value })} />
              Outline color
            </label>
            <Slider label="Thickness" min={1} max={4} value={opts.outlineThickness} onChange={(v) => update({ outlineThickness: v })} />
          </>
        )}
        {effect === 'shadow' && (
          <>
            <Slider label="Offset X" min={-12} max={12} value={opts.shadowOffsetX} onChange={(v) => update({ shadowOffsetX: v })} />
            <Slider label="Offset Y" min={-12} max={12} value={opts.shadowOffsetY} onChange={(v) => update({ shadowOffsetY: v })} />
            <Slider label="Opacity" min={5} max={100} value={Math.round(opts.shadowOpacity * 100)} onChange={(v) => update({ shadowOpacity: v / 100 })} format={(v) => `${v}%`} />
            <label className="checkline">
              <input type="color" value={opts.shadowColor} onChange={(e) => update({ shadowColor: e.target.value })} /> Shadow color
            </label>
          </>
        )}
        {effect === 'glow' && (
          <>
            <Slider label="Radius" min={1} max={6} value={opts.glowRadius} onChange={(v) => update({ glowRadius: v })} />
            <label className="checkline">
              <input type="color" value={opts.glowColor} onChange={(e) => update({ glowColor: e.target.value })} /> Glow color
            </label>
          </>
        )}
        {effect === 'tint' && (
          <>
            <Slider label="Strength" min={5} max={100} value={Math.round(opts.tintStrength * 100)} onChange={(v) => update({ tintStrength: v / 100 })} format={(v) => `${v}%`} />
            <label className="checkline">
              <input type="color" value={opts.tintColor} onChange={(e) => update({ tintColor: e.target.value })} /> Tint color
            </label>
          </>
        )}
        {effect === 'hue' && <Slider label="Hue shift" min={-180} max={180} value={opts.hueShift} onChange={(v) => update({ hueShift: v })} format={(v) => `${v}°`} />}
        {effect === 'brightness' && (
          <>
            <Slider label="Brightness" min={-100} max={100} value={Math.round(opts.brightness * 100)} onChange={(v) => update({ brightness: v / 100 })} />
            <Slider label="Contrast" min={-100} max={100} value={Math.round(opts.contrast * 100)} onChange={(v) => update({ contrast: v / 100 })} />
          </>
        )}
        {effect === 'noise' && <Slider label="Amount" min={1} max={60} value={Math.round(opts.noiseAmount * 100)} onChange={(v) => update({ noiseAmount: v / 100 })} format={(v) => `${v}%`} />}
        {effect === 'quantize' && (
          <>
            <Slider label="Colors" min={2} max={Math.max(2, palette?.colors.length ?? 16)} value={opts.quantizeColors} onChange={(v) => update({ quantizeColors: v })} />
            <div className="field">
              <label>Dither</label>
              <select className="select" value={opts.dither} onChange={(e) => update({ dither: e.target.value as DitherMethod })}>
                <option value="none">None</option>
                <option value="bayer4">Bayer 4×4</option>
                <option value="floyd-steinberg">Floyd–Steinberg</option>
              </select>
            </div>
          </>
        )}
        {effect === 'pixelate' && <Slider label="Block size" min={2} max={8} value={opts.pixelateSize} onChange={(v) => update({ pixelateSize: v })} />}
        {effect === 'mirror' && <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>Flips the active layer horizontally.</p>}
        <div className="divider" />
        <label className="checkline">
          <input type="checkbox" checked={asLayer} onChange={(e) => setAsLayer(e.target.checked)} /> Apply to a new layer
        </label>
        <button className="btn primary" onClick={apply}>
          <Icon name="check" size={13} /> Apply effect
        </button>
        <div className="empty-note" style={{ textAlign: 'left', fontSize: 11 }}>
          Effects read the active layer only, so you can outline a character without touching the background. Applying to
          a new layer keeps the original intact.
        </div>
      </div>
      <div className="stage-card" style={{ flexDirection: 'row', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
          <span className="kicker">Layer</span>
          <PixelCanvas pixels={source} width={doc.width} height={doc.height} scale={Math.max(1, Math.floor(280 / Math.max(doc.width, doc.height)))} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
          <span className="kicker">Result</span>
          <PixelCanvas pixels={result} width={doc.width} height={doc.height} scale={Math.max(1, Math.floor(280 / Math.max(doc.width, doc.height)))} />
        </div>
      </div>
    </div>
  );
}
