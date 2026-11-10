import { useEffect, useRef, useState } from 'react';
import type { ProjectDoc } from '../types';
import { compositeFrame } from '../engine/composite';
import { blitPixels } from '../editor/exporting';

/** A crisp RGBA preview at document resolution, scaled up with CSS. */
export function PixelCanvas({
  pixels,
  width,
  height,
  scale = 1,
  className,
  style,
  title,
}: {
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
  scale?: number;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (ref.current) blitPixels(ref.current, pixels, width, height);
  }, [pixels, width, height]);
  return (
    <canvas
      ref={ref}
      width={width}
      height={height}
      className={className}
      title={title}
      style={{ imageRendering: 'pixelated', width: width * scale, height: height * scale, ...style }}
    />
  );
}

/** Animated preview of a project (respects each frame's duration). */
export function ProjectLoop({
  doc,
  scale,
  playing = true,
  frameIndex,
  maxFrames,
}: {
  doc: ProjectDoc;
  scale: number;
  playing?: boolean;
  frameIndex?: number;
  maxFrames?: number;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [local, setLocal] = useState(0);
  const frames = doc.frames.slice(0, maxFrames ?? doc.frames.length);
  const index = frameIndex ?? local;

  useEffect(() => {
    if (!playing || frameIndex !== undefined) return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let i = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(200, now - last);
      last = now;
      acc += dt;
      const frame = frames[i];
      if (!frame) return;
      if (acc >= Math.max(30, frame.duration)) {
        acc = 0;
        i = (i + 1) % frames.length;
        setLocal(i);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, frames, frameIndex]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const frame = frames[Math.min(index, frames.length - 1)];
    if (!frame) return;
    const frameIdx = doc.frames.indexOf(frame);
    const pixels = compositeFrame(doc, frameIdx);
    blitPixels(canvas, pixels, doc.width, doc.height);
  }, [doc, frames, index]);

  return (
    <canvas
      ref={ref}
      width={doc.width}
      height={doc.height}
      style={{
        imageRendering: 'pixelated',
        width: doc.width * scale,
        height: doc.height * scale,
        maxWidth: '100%',
        objectFit: 'contain',
      }}
    />
  );
}
