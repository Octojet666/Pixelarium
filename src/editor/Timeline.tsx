import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { useEditor } from '../store/project';
import { useUi } from '../store/ui';
import { MAX_TWEEN_FRAMES, TWEEN_EASINGS, type TweenEasing } from '../engine/tween';

function CelMini({ frameId, layerId }: { frameId: string; layerId: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const revision = useEditor((s) => s.revision);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const store = useEditor.getState();
    const frame = store.doc.frames.find((f) => f.id === frameId);
    const cel = frame?.cels[layerId];
    if (!cel) return;
    const { width, height } = store.doc;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx?.putImageData(new ImageData(new Uint8ClampedArray(cel), width, height), 0, 0);
  }, [frameId, layerId, revision]);
  return <canvas ref={ref} />;
}

export function Timeline() {
  const doc = useEditor((s) => s.doc);
  const revision = useEditor((s) => s.revision);
  const activeFrameId = useEditor((s) => s.activeFrameId);
  const activeLayerId = useEditor((s) => s.activeLayerId);
  const setActiveFrame = useEditor((s) => s.setActiveFrame);
  const setActiveLayer = useEditor((s) => s.setActiveLayer);
  const addFrame = useEditor((s) => s.addFrame);
  const duplicateFrame = useEditor((s) => s.duplicateFrame);
  const deleteFrame = useEditor((s) => s.deleteFrame);
  const copyFrame = useEditor((s) => s.copyFrame);
  const pasteFrame = useEditor((s) => s.pasteFrame);
  const moveFrame = useEditor((s) => s.moveFrame);
  const setFrameDuration = useEditor((s) => s.setFrameDuration);
  const tweenFrames = useEditor((s) => s.tweenFrames);
  const hasFrameClipboard = useEditor((s) => s.frameClipboard !== null);
  const pushToast = useUi((s) => s.pushToast);
  const [tweenCount, setTweenCount] = useState(3);
  const [tweenEasing, setTweenEasing] = useState<TweenEasing>('easeInOut');

  const playing = useUi((s) => s.playing);
  const setPlaying = useUi((s) => s.setPlaying);
  const playMode = useUi((s) => s.playMode);
  const loop = useUi((s) => s.loop);
  const fps = useUi((s) => s.fps);
  const onion = useUi((s) => s.onion);
  const setOnion = useUi((s) => s.setOnion);
  const uiSet = useUi((s) => s.set);
  const openDialog = useUi((s) => s.openDialog);

  const frames = doc.frames;
  const currentIndex = frames.findIndex((f) => f.id === activeFrameId);
  const ordered = [...doc.layers].reverse();
  const activeFrame = frames[currentIndex];
  void revision;

  const step = (dir: -1 | 1) => {
    const next = (currentIndex + dir + frames.length) % frames.length;
    setActiveFrame(frames[next].id);
  };

  return (
    <div className="timeline" style={{ height: '100%' }}>
      <div className="timeline-head">
        <div className="hstack" style={{ gap: 2 }}>
          <button className="iconbtn" onClick={addFrame} title="Add frame (Ctrl+Alt+N)">
            <Icon name="plus" />
          </button>
          <button className="iconbtn" onClick={duplicateFrame} title="Duplicate frame (Ctrl+Alt+D)">
            <Icon name="copy" />
          </button>
          <button className="iconbtn" onClick={copyFrame} title="Copy frame">
            <Icon name="film" />
          </button>
          <button className="iconbtn" onClick={pasteFrame} disabled={!hasFrameClipboard} title="Paste frame">
            <Icon name="upload" />
          </button>
          <button className="iconbtn" onClick={() => moveFrame(activeFrameId, 'left')} title="Move frame left (Ctrl+Alt+←)">
            <Icon name="chevron-left" />
          </button>
          <button className="iconbtn" onClick={() => moveFrame(activeFrameId, 'right')} title="Move frame right (Ctrl+Alt+→)">
            <Icon name="chevron-right" />
          </button>
          <button className="iconbtn" onClick={() => deleteFrame()} disabled={frames.length <= 1} title="Delete frame (Ctrl+Alt+Backspace)">
            <Icon name="trash" />
          </button>
        </div>

        <span style={{ width: 1, height: 18, background: 'var(--line)' }} />
        <div className="hstack" style={{ gap: 2 }}>
          <button className="iconbtn" onClick={() => setActiveFrame(frames[0].id)} title="First frame">
            <Icon name="first" />
          </button>
          <button className="iconbtn" onClick={() => step(-1)} title="Previous frame (,)">
            <Icon name="prev" />
          </button>
          <button className="iconbtn active" onClick={() => setPlaying(!playing)} title="Play / pause (Enter)">
            <Icon name={playing ? 'pause' : 'play'} />
          </button>
          <button className="iconbtn" onClick={() => step(1)} title="Next frame (.)">
            <Icon name="next" />
          </button>
          <button
            className={`iconbtn${loop ? ' active' : ''}`}
            onClick={() => uiSet({ loop: !loop })}
            title="Loop playback"
          >
            <Icon name="loop" />
          </button>
        </div>
        <select
          className="select"
          style={{ width: 108, height: 26 }}
          value={playMode}
          onChange={(e) => uiSet({ playMode: e.target.value as typeof playMode })}
          title="Playback direction"
        >
          <option value="forward">Forward</option>
          <option value="reverse">Reverse</option>
          <option value="pingpong">Ping-pong</option>
        </select>
        <div className="hstack" style={{ gap: 4 }}>
          <input
            className="input mono"
            type="number"
            min={1}
            max={60}
            value={fps}
            style={{ width: 54, height: 26 }}
            onChange={(e) => uiSet({ fps: Math.max(1, Math.min(60, Number(e.target.value) || 8)) })}
            title="Base frames per second (used until per-frame durations override it)"
          />
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>FPS</span>
        </div>
        <div className="spacer" />
        <button
          className={`iconbtn${onion.enabled ? ' active' : ''}`}
          onClick={() => setOnion({ enabled: !onion.enabled })}
          title="Onion skin"
        >
          <Icon name="onion" />
        </button>
        <button className="btn sm ghost" onClick={() => openDialog('tags')} title="Animation tags and sequences">
          <Icon name="tag" size={13} /> Tags
        </button>
        <button className="btn sm ghost" onClick={() => uiSet({ previewOpen: true })} title="Open the animation preview">
          <Icon name="external" size={13} /> Preview
        </button>
        {activeFrame && (
          <div className="hstack" style={{ gap: 4 }}>
            <input
              className="input mono"
              type="number"
              min={10}
              max={10000}
              step={10}
              value={activeFrame.duration}
              style={{ width: 64, height: 26 }}
              onChange={(e) => setFrameDuration(activeFrame.id, Number(e.target.value))}
              title="Active frame duration in milliseconds"
            />
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>ms</span>
          </div>
        )}
      </div>

      <div className="timeline-scroll">
        <div style={{ minWidth: 'max-content' }}>
          <div className="frame-number-row">
            <div className="gutter">
              <div style={{ padding: '0 8px', fontSize: 10, color: 'var(--text-muted)', lineHeight: '22px', letterSpacing: '0.08em' }}>
                LAYERS
              </div>
            </div>
            {frames.map((frame, i) => {
              const tagged = doc.tags.some((t) => i >= t.from && i <= t.to);
              return (
                <div
                  key={frame.id}
                  className={`frame-num${frame.id === activeFrameId ? ' active' : ''}`}
                  onClick={() => setActiveFrame(frame.id)}
                  title={`Frame ${i + 1} — ${frame.duration}ms${frame.label ? ` · ${frame.label}` : ''}`}
                >
                  {i + 1}
                  {tagged && <span className="tag-dot" />}
                </div>
              );
            })}
          </div>
          {ordered.map((layer) => (
            <div key={layer.id} style={{ display: 'flex', alignItems: 'stretch' }}>
              <div
                className={`timeline-layer-label${layer.id === activeLayerId ? ' active' : ''}`}
                onClick={() => setActiveLayer(layer.id)}
                title={`${layer.name}${layer.locked ? ' — locked' : ''}`}
              >
                <span style={{ width: 4, height: 4, borderRadius: 1, background: layer.visible ? 'var(--text-muted)' : 'transparent', border: '1px solid var(--text-muted)' }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{layer.name}</span>
              </div>
              <div className="timeline-cels">
                {frames.map((frame) => {
                  const cel = frame.cels[layer.id];
                  let hasContent = false;
                  if (cel) {
                    for (let i = 3; i < cel.length; i += 4) {
                      if (cel[i] !== 0) {
                        hasContent = true;
                        break;
                      }
                    }
                  }
                  return (
                    <div
                      key={frame.id}
                      className={`cel${hasContent ? ' has-content' : ''}${frame.id === activeFrameId ? ' active-frame' : ''}${
                        frame.id === activeFrameId && layer.id === activeLayerId ? ' active-cel' : ''
                      }`}
                      onClick={() => {
                        setActiveFrame(frame.id);
                        setActiveLayer(layer.id);
                      }}
                      title={`Frame ${frames.indexOf(frame) + 1} · ${layer.name}${layer.locked ? ' (locked)' : ''}`}
                    >
                      {hasContent && <CelMini frameId={frame.id} layerId={layer.id} />}
                      <span className={`cel-dot${hasContent ? ' has' : ''}`} />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '4px 10px',
          borderTop: '1px solid var(--line-soft)',
          fontSize: 10.5,
          color: 'var(--text-muted)',
        }}
      >
        <span className="mono">
          {frames.length} frames · {doc.tags.length} tags
        </span>
        {/* In-betweening: key the two extremes, let the tool fill the middle. */}
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>In-between</span>
          <input
            className="input mono"
            type="number"
            min={1}
            max={MAX_TWEEN_FRAMES}
            value={tweenCount}
            style={{ width: 44, height: 22, padding: '0 6px', fontSize: 10 }}
            onChange={(e) => setTweenCount(Math.max(1, Math.min(MAX_TWEEN_FRAMES, Number(e.target.value) || 1)))}
            title={`How many frames to generate between this frame and the next (1-${MAX_TWEEN_FRAMES})`}
          />
          <select
            className="select"
            style={{ width: 92, height: 22, padding: '0 6px', fontSize: 10 }}
            value={tweenEasing}
            onChange={(e) => setTweenEasing(e.target.value as TweenEasing)}
            title="Timing curve for the generated frames"
          >
            {TWEEN_EASINGS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            className="btn sm ghost"
            style={{ height: 22, padding: '0 8px', fontSize: 10 }}
            disabled={currentIndex < 0 || currentIndex >= frames.length - 1}
            onClick={() => {
              const made = tweenFrames(tweenCount, tweenEasing);
              if (made === 0) {
                pushToast('Add a frame after this one to tween between two poses.', 'warning');
              } else {
                pushToast(`Generated ${made} in-between frame${made === 1 ? '' : 's'}. Undo removes them.`, 'success');
              }
            }}
            title="Generate the frames between this frame and the next (both ends stay untouched)"
          >
            Fill
          </button>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          Onion:
          <select
            className="select"
            style={{ width: 62, height: 22, padding: '0 6px', fontSize: 10 }}
            value={onion.previous}
            onChange={(e) => setOnion({ previous: Number(e.target.value), enabled: true })}
            title="Previous frames"
          >
            {[0, 1, 2, 3].map((n) => (
              <option key={n} value={n}>
                −{n}
              </option>
            ))}
          </select>
          <select
            className="select"
            style={{ width: 62, height: 22, padding: '0 6px', fontSize: 10 }}
            value={onion.next}
            onChange={(e) => setOnion({ next: Number(e.target.value), enabled: true })}
            title="Next frames"
          >
            {[0, 1, 2, 3].map((n) => (
              <option key={n} value={n}>
                +{n}
              </option>
            ))}
          </select>
        </span>
      </div>
    </div>
  );
}
