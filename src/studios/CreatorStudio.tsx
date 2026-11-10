import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { PageNav } from '../screens/PageNav';
import { compositeFrame } from '../engine/composite';
import { exportPng, exportGif } from '../editor/exporting';
import { useEditor } from '../store/project';
import { useUi } from '../store/ui';

interface PlatformPreset {
  id: string;
  name: string;
  size: number;
  shape: 'circle' | 'square';
  note: string;
}

/** Sizes the platforms themselves ask for, so a finished piece can be dropped straight in. */
const PRESETS: PlatformPreset[] = [
  { id: 'discord-emote', name: 'Discord emote', size: 128, shape: 'square', note: '128×128 · PNG or GIF' },
  { id: 'twitch-emote', name: 'Twitch emote', size: 112, shape: 'square', note: '28 / 56 / 112 · PNG' },
  { id: 'discord-avatar', name: 'Discord avatar', size: 256, shape: 'circle', note: 'Cropped to a circle' },
  { id: 'x-avatar', name: 'X / Twitter avatar', size: 400, shape: 'circle', note: 'Cropped to a circle' },
  { id: 'sticker', name: 'Sticker', size: 320, shape: 'square', note: 'Chat sticker packs' },
  { id: 'badge', name: 'Chat badge', size: 72, shape: 'square', note: '18 / 36 / 72 · PNG' },
  { id: 'icon', name: 'App icon', size: 512, shape: 'square', note: 'Favicon / launcher source' },
];

/** The preset a freshly opened project is probably making, judged by its template name. */
function presetForProject(doc: { name: string; width: number; height: number }): string {
  const name = doc.name.toLowerCase();
  if (name.includes('avatar') || name.includes('portrait')) return 'discord-avatar';
  if (name.includes('sticker')) return 'sticker';
  if (name.includes('badge')) return 'badge';
  if (name.includes('emote')) return 'discord-emote';
  if (name.includes('icon')) return 'icon';
  return PRESETS[0].id;
}

export function CreatorStudio() {
  const doc = useEditor((s) => s.doc);
  const revision = useEditor((s) => s.revision);
  const setScreen = useUi((s) => s.setScreen);
  const pushToast = useUi((s) => s.pushToast);

  const [presetId, setPresetId] = useState(() => presetForProject(doc));
  const [showGuide, setShowGuide] = useState(true);
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  /* Loading another project switches to the preset its name points at. */
  useEffect(() => {
    setPresetId(presetForProject(doc));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id]);

  const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[0];
  const scale = Math.max(1, Math.round(preset.size / Math.max(doc.width, doc.height)));
  const output = Math.max(1, Math.round(doc.width * scale));
  const fits = output >= preset.size * 0.75 && output <= preset.size * 1.25;
  const circle = preset.shape === 'circle';

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = doc.width;
    canvas.height = doc.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const image = ctx.createImageData(doc.width, doc.height);
    image.data.set(compositeFrame(doc, 0));
    ctx.putImageData(image, 0, 0);
  }, [doc, revision]);

  const areaShare = useMemo(() => {
    // How much of a square the inscribed circle keeps, shown as a rough crop warning.
    return circle ? Math.PI / 4 : 1;
  }, [circle]);

  const exportStill = async () => {
    setBusy(true);
    try {
      await exportPng(doc, 0, scale, `${doc.name}-${preset.id}`);
      pushToast(`Exported ${output}×${output} ${preset.name} PNG.`, 'success');
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'Export failed.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const exportLoop = () => {
    setBusy(true);
    try {
      exportGif(doc, { scale, loop: true, dither: 'none' }, `${doc.name}-${preset.id}`);
      pushToast('Animated GIF exported.', 'success');
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'GIF export failed.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page-shell">
      <div className="page-inner">
        <PageNav />

        <div className="studio-workspace-head">
          <div>
            <button className="studio-back" onClick={() => setScreen('studios')}>
              <Icon name="arrow-left" size={12} /> Studios
            </button>
            <h1 className="studio-title">Digital Creator Studio</h1>
            <p className="studio-sub">
              {doc.name} · {doc.width}×{doc.height} · {doc.frames.length} frame{doc.frames.length === 1 ? '' : 's'} ·{' '}
              {doc.layers.length} layer{doc.layers.length === 1 ? '' : 's'}
            </p>
          </div>
          <div className="studio-head-actions">
            <button className="btn sm" onClick={() => setScreen('editor')}>
              <Icon name="pencil" size={13} /> Edit art
            </button>
            <button className="btn sm primary" onClick={() => void exportStill()} disabled={busy}>
              <Icon name="image" size={13} /> Export {output}px
            </button>
          </div>
        </div>

        <div className="studio-split">
          <section className="studio-main">
            <div className={`creator-stage${circle && showGuide ? ' circle' : ''}`}>
              <canvas ref={canvasRef} className="creator-canvas" aria-label="Artwork preview" />
              {showGuide && circle && <span className="creator-mask" aria-hidden="true" />}
            </div>
            <p className="studio-hint">
              {circle ? (
                <>
                  The mask shows how {preset.name.toLowerCase()} crops your art: corners outside the circle are hidden
                  on the platform, so about {Math.round(areaShare * 100)}% of the square stays visible.
                </>
              ) : (
                <>{preset.name} keeps the full square, so nothing is cropped — the guide is here to size your art.</>
              )}
            </p>

            <div className="studio-panel">
              <h3>Platform</h3>
              <div className="creator-presets">
                {PRESETS.map((option) => (
                  <button
                    key={option.id}
                    className={`creator-preset${option.id === preset.id ? ' active' : ''}`}
                    onClick={() => setPresetId(option.id)}
                  >
                    <span className="creator-preset-name">{option.name}</span>
                    <span className="creator-preset-note">{option.note}</span>
                  </button>
                ))}
              </div>
            </div>
          </section>

          <aside className="studio-side">
            <div className="studio-panel">
              <h3>Output</h3>
              <div className="stat-line">
                <span>Artwork</span>
                <b>
                  {doc.width}×{doc.height}
                </b>
              </div>
              <div className="stat-line">
                <span>Target</span>
                <b>
                  {preset.size}×{preset.size}
                </b>
              </div>
              <div className="stat-line">
                <span>Export scale</span>
                <b>{scale}× → {output}px</b>
              </div>
              <div className="stat-line">
                <span>Shape</span>
                <b>{circle ? 'Circle' : 'Square'}</b>
              </div>
              {!fits && (
                <p className="studio-warn">
                  {output}px is far from the {preset.size}px target. Resize the canvas to {preset.size}×{preset.size} (or a
                  clean divisor) for the crispest result — pixel art exported at an odd scale gets soft edges on the
                  platform.
                </p>
              )}
              <label className="hstack" style={{ gap: 8 }}>
                <input
                  type="checkbox"
                  checked={showGuide}
                  onChange={(e) => setShowGuide(e.target.checked)}
                  aria-label="Show crop guide"
                />
                <span>Show crop guide</span>
              </label>
            </div>

            <div className="studio-panel">
              <h3>Export</h3>
              <div className="studio-export-list">
                <button className="btn sm primary" onClick={() => void exportStill()} disabled={busy}>
                  <Icon name="image" size={13} /> PNG · {output}px
                </button>
                <button
                  className="btn sm"
                  onClick={exportLoop}
                  disabled={busy || doc.frames.length < 2}
                  title={doc.frames.length < 2 ? 'Add a second frame to export an animated GIF' : undefined}
                >
                  <Icon name="film" size={13} /> Animated GIF
                </button>
              </div>
              <p className="studio-hint">
                One export per platform preset. The scale is a whole number, so pixels stay square and hard-edged.
              </p>
            </div>

            <div className="studio-panel">
              <h3>Safe areas</h3>
              <p className="studio-hint" style={{ marginTop: 0 }}>
                Keep faces and key shapes inside the middle two-thirds: platforms crop avatars to a circle and
                shrink emotes down to 28 px in chat. Working at 32–64 px and scaling up keeps details readable.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
