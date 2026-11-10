import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '../components/Modal';
import { Icon } from '../components/Icon';
import { Field, Segmented, Slider } from '../components/Controls';
import { useEditor } from '../store/project';
import { useUi } from '../store/ui';
import type { CinemaAspect, FrameCamera } from '../types';
import {
  DEFAULT_CAMERA,
  DEFAULT_CINEMA,
  animationDuration,
  aspectRatio,
  cameraAt,
  frameCamera,
  outputSize,
  renderCameraFrame,
  timelineAt,
} from '../engine/camera';
import { downloadBlob, exportCinematicVideo, pickVideoMime, videoExtension } from './video';

const ASPECTS: { value: CinemaAspect; label: string }[] = [
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '1:1', label: '1:1' },
  { value: '4:3', label: '4:3' },
  { value: 'source', label: 'Canvas' },
];

function slug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'pixelarium-scene';
}

export function Cinematic() {
  const open = useUi((s) => s.cinemaOpen);
  if (!open) return null;
  return <CinematicDialog />;
}

function CinematicDialog() {
  const doc = useEditor((s) => s.doc);
  const revision = useEditor((s) => s.revision);
  const activeFrameId = useEditor((s) => s.activeFrameId);
  const setFrameCamera = useEditor((s) => s.setFrameCamera);
  const setAllFrameCameras = useEditor((s) => s.setAllFrameCameras);
  const setCinemaSettings = useEditor((s) => s.setCinemaSettings);
  const setActiveFrame = useEditor((s) => s.setActiveFrame);
  const close = useUi((s) => s.setCinemaOpen);
  const pushToast = useUi((s) => s.pushToast);

  const settings = doc.cinema ?? DEFAULT_CINEMA;
  const initialIndex = Math.max(0, doc.frames.findIndex((f) => f.id === activeFrameId));
  const [head, setHead] = useState({ frameIndex: initialIndex, progress: 0 });
  const [draft, setDraft] = useState<FrameCamera>(() => frameCamera(doc.frames[initialIndex]));
  const [playing, setPlaying] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [exportHeight, setExportHeight] = useState(720);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const elapsedRef = useRef(0);

  const frameIndex = Math.min(head.frameIndex, doc.frames.length - 1);
  const frame = doc.frames[frameIndex];
  const totalMs = useMemo(() => animationDuration(doc), [doc, revision]);
  const mime = useMemo(() => pickVideoMime(), []);
  const keys = doc.frames.filter((f) => f.camera).length;
  const ratio = aspectRatio(doc, settings.aspect);

  /* Load the camera of the frame under the playhead when paused. */
  useEffect(() => {
    if (playing) return;
    setDraft(frameCamera(doc.frames[Math.min(head.frameIndex, doc.frames.length - 1)]));
    // Only when the playhead moves, not on every camera edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [head.frameIndex, playing]);

  /* Playback clock. */
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    elapsedRef.current = elapsedForFrame(doc, head.frameIndex);
    const tick = (now: number) => {
      elapsedRef.current += now - last;
      last = now;
      const next = timelineAt(doc, elapsedRef.current, true);
      setHead({ frameIndex: next.frameIndex, progress: next.progress });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  /* Draw the cinematic frame. */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { width, height } = outputSize(ratio, 540);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const camera = playing ? cameraAt(doc, head.frameIndex, head.progress, true) : draft;
    renderCameraFrame(ctx, doc, head.frameIndex, camera, width, height, settings);
  }, [doc, revision, head, draft, playing, settings, ratio]);

  /* Space toggles playback, arrows step frames. */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (event.code === 'Space') {
        event.preventDefault();
        setPlaying((p) => !p);
      } else if (event.key === 'ArrowRight') {
        step(1);
      } else if (event.key === 'ArrowLeft') {
        step(-1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc]);

  const step = (delta: number) => {
    setPlaying(false);
    const nextFrame = Math.max(0, Math.min(doc.frames.length - 1, frameIndex + delta));
    setHead({ frameIndex: nextFrame, progress: 0 });
    setActiveFrame(doc.frames[nextFrame].id);
  };

  const selectFrame = (index: number) => {
    setPlaying(false);
    setHead({ frameIndex: index, progress: 0 });
    setActiveFrame(doc.frames[index].id);
  };

  const keyFrame = () => {
    if (!frame) return;
    setFrameCamera(frame.id, draft);
    pushToast(`Camera keyframe set on frame ${frameIndex + 1}.`, 'success');
  };

  const clearFrameKey = () => {
    if (!frame) return;
    setFrameCamera(frame.id, null);
    pushToast(`Camera key removed from frame ${frameIndex + 1}.`, 'info');
  };

  const keyAllFrames = () => {
    setAllFrameCameras(draft);
    pushToast(`Camera set on all ${doc.frames.length} frames — a static shot.`, 'success');
  };

  const moveCamera = (patch: Partial<FrameCamera>) => setDraft((c) => ({ ...c, ...patch }));

  const hasKey = frame?.camera !== undefined;
  const differs =
    !frame?.camera ||
    Math.abs(frame.camera.x - draft.x) > 0.001 ||
    Math.abs(frame.camera.y - draft.y) > 0.001 ||
    Math.abs(frame.camera.zoom - draft.zoom) > 0.001;

  const exportVideo = async () => {
    if (exporting) return;
    setPlaying(false);
    setExporting(true);
    setProgress(0);
    try {
      const result = await exportCinematicVideo({
        doc,
        settings,
        height: exportHeight,
        fps: settings.fps,
        onProgress: setProgress,
      });
      downloadBlob(result.blob, `${slug(doc.name)}-${result.width}x${result.height}.${videoExtension(result.mime)}`);
      pushToast(
        `Video exported: ${result.width}×${result.height}, ${(result.durationMs / 1000).toFixed(1)}s.`,
        'success',
      );
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'Video export failed.', 'error');
    } finally {
      setExporting(false);
      setProgress(0);
    }
  };

  return (
    <Modal
      title="Cinematic camera"
      subtitle="Animate a camera across your frames, preview the shot, and record it as a video."
      onClose={() => close(false)}
      wide
      className="cinema-modal"
    >
      <div className="cinema-body">
        <div className="cinema-main">
          <div className="cinema-stage">
            <canvas ref={canvasRef} aria-label="Cinematic preview" />
            <div className="cinema-overlay">
              <span className="badge amber">
                {settings.aspect === 'source' ? `${doc.width}:${doc.height}` : settings.aspect}
              </span>
              <span className="badge">
                frame {frameIndex + 1}/{doc.frames.length}
              </span>
              {keys > 0 && <span className="badge">{keys} keys</span>}
            </div>
          </div>

          <div className="cinema-transport">
            <button className="iconbtn" onClick={() => step(-1)} title="Previous frame (←)" aria-label="Previous frame">
              <Icon name="prev" />
            </button>
            <button
              className="iconbtn play"
              onClick={() => setPlaying((p) => !p)}
              title={playing ? 'Pause (Space)' : 'Play (Space)'}
              aria-label={playing ? 'Pause' : 'Play'}
            >
              <Icon name={playing ? 'pause' : 'play'} />
            </button>
            <button className="iconbtn" onClick={() => step(1)} title="Next frame (→)" aria-label="Next frame">
              <Icon name="next" />
            </button>
            <input
              className="cinema-scrub"
              type="range"
              min={0}
              max={Math.max(0, doc.frames.length - 1)}
              step={1}
              value={frameIndex}
              aria-label="Frame"
              onChange={(e) => selectFrame(Number(e.target.value))}
            />
            <span className="mono dim" style={{ fontSize: 10.5 }}>
              {(totalMs / 1000).toFixed(2)}s
            </span>
          </div>

          <div className="cinema-frames">
            {doc.frames.map((f, index) => (
              <button
                key={f.id}
                className={`cinema-frame${index === frameIndex ? ' active' : ''}${f.camera ? ' keyed' : ''}`}
                onClick={() => selectFrame(index)}
                title={f.camera ? `Frame ${index + 1} · camera keyframe` : `Frame ${index + 1} · no key`}
              >
                {index + 1}
                <span className="key-dot" />
              </button>
            ))}
          </div>

          <p className="cinema-note">
            Only keyed frames define a pose, and the camera eases between two keys across every frame in between — two
            keys are enough for a pan. Before the first key the camera holds still; playback loops the animation.
          </p>
        </div>

        <aside className="cinema-side">
          <Field label="Scene format">
            <Segmented value={settings.aspect} options={ASPECTS} onChange={(aspect) => setCinemaSettings({ aspect })} />
          </Field>
          <Field label="Fitting" hint="Contain keeps the whole canvas visible; cover fills the frame and crops.">
            <Segmented
              value={settings.fit}
              options={[
                { value: 'contain', label: 'Contain' },
                { value: 'cover', label: 'Cover' },
              ]}
              onChange={(fit) => setCinemaSettings({ fit: fit as 'contain' | 'cover' })}
            />
          </Field>
          <Field label="Background">
            <div className="hstack">
              <input
                type="color"
                className="color-input"
                value={settings.background}
                onChange={(e) => setCinemaSettings({ background: e.target.value })}
                aria-label="Scene background"
              />
              <span className="mono dim" style={{ fontSize: 11 }}>{settings.background}</span>
            </div>
          </Field>

          <div className="cinema-camera-head">
            <span>Frame {frameIndex + 1} camera</span>
            <span className={`badge${hasKey ? ' amber' : ''}`}>{hasKey ? 'keyed' : 'no key'}</span>
          </div>
          <Slider label="Camera X" min={0} max={100} value={Math.round(draft.x * 100)} onChange={(v) => moveCamera({ x: v / 100 })} format={(v) => `${v}%`} />
          <Slider label="Camera Y" min={0} max={100} value={Math.round(draft.y * 100)} onChange={(v) => moveCamera({ y: v / 100 })} format={(v) => `${v}%`} />
          <Slider label="Zoom" min={25} max={400} step={5} value={Math.round(draft.zoom * 100)} onChange={(v) => moveCamera({ zoom: v / 100 })} format={(v) => `${(v / 100).toFixed(2)}×`} />
          <div className="hstack" style={{ gap: 6 }}>
            <button className="btn sm primary" onClick={keyFrame} disabled={!differs && hasKey}>
              <Icon name="target" size={13} /> Key this frame
            </button>
            <button className="btn sm" onClick={() => setDraft(DEFAULT_CAMERA)}>
              Reset
            </button>
          </div>
          <div className="hstack" style={{ gap: 6 }}>
            <button className="btn sm ghost" onClick={keyAllFrames}>
              Key all frames
            </button>
            <button className="btn sm ghost" onClick={clearFrameKey} disabled={!hasKey}>
              Remove key
            </button>
          </div>

          <div className="cine-divider" />

          <Field label="Video export" hint="Recorded in real time from the canvas, so keep this tab visible.">
            <div className="hstack" style={{ gap: 6 }}>
              <select
                className="select"
                value={exportHeight}
                onChange={(e) => setExportHeight(Number(e.target.value))}
                aria-label="Video resolution"
              >
                <option value={480}>854×480 class</option>
                <option value={720}>720p</option>
                <option value={1080}>1080p</option>
              </select>
              <select
                className="select"
                value={settings.fps}
                onChange={(e) => setCinemaSettings({ fps: Number(e.target.value) })}
                aria-label="Video frame rate"
              >
                <option value={12}>12 fps</option>
                <option value={24}>24 fps</option>
                <option value={30}>30 fps</option>
                <option value={60}>60 fps</option>
              </select>
            </div>
          </Field>
          <div className="cinema-export-meta">
            <span>
              {Math.round(outputSize(ratio, exportHeight).width)}×{Math.round(outputSize(ratio, exportHeight).height)}
            </span>
            <span>·</span>
            <span>{(totalMs / 1000).toFixed(1)}s</span>
            <span>·</span>
            <span>{mime ? videoExtension(mime).toUpperCase() : 'unsupported'}</span>
          </div>
          <button className="btn primary" onClick={() => void exportVideo()} disabled={exporting || !mime}>
            <Icon name="film" size={14} /> {exporting ? `Recording ${Math.round(progress * 100)}%` : 'Export video'}
          </button>
          {exporting && <progress className="cinema-progress" value={progress} max={1} />}
          {!mime && <p className="cinema-note">This browser has no MediaRecorder support; try Chrome, Edge or Safari.</p>}
          <p className="cinema-note">
            Video has no audio and no Pixelarium watermark. Frame timing follows the animation timeline exactly.
          </p>
        </aside>
      </div>
    </Modal>
  );
}

function elapsedForFrame(doc: { frames: { duration: number }[] }, frameIndex: number): number {
  let elapsed = 0;
  for (let i = 0; i < frameIndex; i++) elapsed += Math.max(10, doc.frames[i].duration);
  return elapsed;
}
