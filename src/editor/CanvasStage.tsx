import { useCallback, useEffect, useRef, useState } from 'react';
import type { Rect, ToolId } from '../types';
import { compositeFrame, tintPixels } from '../engine/composite';
import { hexToRgba, rgbaToHex } from '../engine/color';
import { PaintStroke, unionRect } from './painting';
import { brushMask } from '../engine/brushes';
import { thumbnailDataUrl } from './exporting';
import { useEditor } from '../store/project';
import { useUi } from '../store/ui';
import { Icon } from '../components/Icon';

const TOOL_LABELS: Record<string, string> = {
  pencil: 'Pencil',
  eraser: 'Eraser',
  line: 'Line',
  rect: 'Rectangle',
  'rect-filled': 'Filled rectangle',
  ellipse: 'Ellipse',
  'ellipse-filled': 'Filled ellipse',
  bucket: 'Fill',
  dither: 'Dither',
  spray: 'Spray',
  gradient: 'Gradient',
  move: 'Move',
  text: 'Text',
  shade: 'Shade',
};

export function CanvasStage() {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const mainRef = useRef<HTMLCanvasElement | null>(null);
  const onionRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const tileRef = useRef<HTMLCanvasElement | null>(null);

  const doc = useEditor((s) => s.doc);
  const revision = useEditor((s) => s.revision);
  const toolSettings = useEditor((s) => s.toolSettings);
  const tilePreviewActive = toolSettings.tileMode && toolSettings.tilePreview;
  const selection = useEditor((s) => s.selection);
  const zoom = useUi((s) => s.zoom);
  const panX = useUi((s) => s.panX);
  const panY = useUi((s) => s.panY);
  const showGrid = useUi((s) => s.showGrid);
  const showPixelGrid = useUi((s) => s.showPixelGrid);
  const gridSize = useUi((s) => s.gridSize);
  const onion = useUi((s) => s.onion);
  const checker = useUi((s) => s.checker);
  const highlights = useUi((s) => s.assistantHighlights);
  const setHover = useUi((s) => s.set);

  const compositeRef = useRef<Uint8ClampedArray | null>(null);
  const compositeSizeRef = useRef({ w: 0, h: 0 });
  const strokeRef = useRef<PaintStroke | null>(null);
  const paintButtonRef = useRef(0);
  const modeRef = useRef<'none' | 'paint' | 'pan' | 'pinch' | 'touch-pending'>('none');
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const hoverRef = useRef<{ x: number; y: number } | null>(null);
  const antsRef = useRef(0);
  const rafRef = useRef(0);
  const pendingRef = useRef<{ full: boolean; rect: Rect | null }>({ full: true, rect: null });
  const tempCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const spaceRef = useRef(false);
  const userAdjustedRef = useRef(false);
  const touchRef = useRef(new Map<number, { x: number; y: number }>());
  const touchPendingRef = useRef<{
    startX: number;
    startY: number;
    pt: { x: number; y: number };
    button: number;
    tool: ToolId;
  } | null>(null);
  const pinchRef = useRef<{
    startDist: number;
    startZoom: number;
    startPanX: number;
    startPanY: number;
    startCx: number;
    startCy: number;
  } | null>(null);
  const [textDraft, setTextDraft] = useState<{ x: number; y: number; left: number; top: number; value: string } | null>(
    null,
  );

  const stageW = doc.width * zoom;
  const stageH = doc.height * zoom;

  /* Fit a freshly opened document, then keep it fitted until the user zooms or pans. */
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    userAdjustedRef.current = false;
    const fit = () => {
      if (userAdjustedRef.current) return;
      const rect = vp.getBoundingClientRect();
      if (rect.width < 20 || rect.height < 20) return;
      useUi.getState().zoomToFit(doc.width, doc.height, rect.width, rect.height);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(vp);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id]);

  const drawOverlay = useCallback(() => {
    const canvas = overlayRef.current;
    if (!canvas) return;
    const st = useEditor.getState();
    const ui = useUi.getState();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = st.doc.width * ui.zoom;
    const cssH = st.doc.height * ui.zoom;
    const wantW = Math.max(1, Math.round(cssW * dpr));
    const wantH = Math.max(1, Math.round(cssH * dpr));
    if (canvas.width !== wantW || canvas.height !== wantH) {
      canvas.width = wantW;
      canvas.height = wantH;
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    const z = ui.zoom;

    if (ui.showGrid && z * ui.gridSize >= 6) {
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255,255,255,0.075)';
      ctx.beginPath();
      for (let x = ui.gridSize; x < st.doc.width; x += ui.gridSize) {
        ctx.moveTo(Math.round(x * z) + 0.5, 0);
        ctx.lineTo(Math.round(x * z) + 0.5, cssH);
      }
      for (let y = ui.gridSize; y < st.doc.height; y += ui.gridSize) {
        ctx.moveTo(0, Math.round(y * z) + 0.5);
        ctx.lineTo(cssW, Math.round(y * z) + 0.5);
      }
      ctx.stroke();
    }

    if (ui.showPixelGrid && z >= 9) {
      ctx.strokeStyle = 'rgba(255,255,255,0.045)';
      ctx.beginPath();
      for (let x = 1; x < st.doc.width; x++) {
        ctx.moveTo(Math.round(x * z) + 0.5, 0);
        ctx.lineTo(Math.round(x * z) + 0.5, cssH);
      }
      for (let y = 1; y < st.doc.height; y++) {
        ctx.moveTo(0, Math.round(y * z) + 0.5);
        ctx.lineTo(cssW, Math.round(y * z) + 0.5);
      }
      ctx.stroke();
    }

    const settings = st.toolSettings;
    if (settings.symmetryX) {
      ctx.strokeStyle = 'rgba(176,108,255,0.55)';
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo((st.doc.width / 2) * z, 0);
      ctx.lineTo((st.doc.width / 2) * z, cssH);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (settings.symmetryY) {
      ctx.strokeStyle = 'rgba(79,209,224,0.5)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(0, (st.doc.height / 2) * z);
      ctx.lineTo(cssW, (st.doc.height / 2) * z);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    const nine = st.doc.nineSlice;
    if (nine) {
      ctx.save();
      ctx.strokeStyle = 'rgba(245,185,66,0.7)';
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      if (nine.left > 0) {
        ctx.moveTo(nine.left * z + 0.5, 0);
        ctx.lineTo(nine.left * z + 0.5, cssH);
      }
      if (nine.right > 0) {
        ctx.moveTo((st.doc.width - nine.right) * z + 0.5, 0);
        ctx.lineTo((st.doc.width - nine.right) * z + 0.5, cssH);
      }
      if (nine.top > 0) {
        ctx.moveTo(0, nine.top * z + 0.5);
        ctx.lineTo(cssW, nine.top * z + 0.5);
      }
      if (nine.bottom > 0) {
        ctx.moveTo(0, (st.doc.height - nine.bottom) * z + 0.5);
        ctx.lineTo(cssW, (st.doc.height - nine.bottom) * z + 0.5);
      }
      ctx.stroke();
      ctx.restore();
    }

    // Selection: outlines around masked pixels
    const sel = st.selection;
    const draft = strokeRef.current?.selectionDraft ?? null;
    const lasso = strokeRef.current?.lasso;
    if (sel) {
      ctx.save();
      ctx.lineWidth = 1;
      const b = sel.bounds;
      for (let y = b.y; y < b.y + b.h; y++) {
        for (let x = b.x; x < b.x + b.w; x++) {
          if (!sel.mask[y * st.doc.width + x]) continue;
          const px = x * z;
          const py = y * z;
          if (!sel.mask[(y - 1) * st.doc.width + x] || y === 0) {
            ctx.beginPath();
            ctx.moveTo(px, py + 0.5);
            ctx.lineTo(px + z, py + 0.5);
          }
          if (y === st.doc.height - 1 || !sel.mask[(y + 1) * st.doc.width + x]) {
            ctx.beginPath();
            ctx.moveTo(px, py + z - 0.5);
            ctx.lineTo(px + z, py + z - 0.5);
          }
          if (!sel.mask[y * st.doc.width + (x - 1)] || x === 0) {
            ctx.beginPath();
            ctx.moveTo(px + 0.5, py);
            ctx.lineTo(px + 0.5, py + z);
          }
          if (x === st.doc.width - 1 || !sel.mask[y * st.doc.width + (x + 1)]) {
            ctx.beginPath();
            ctx.moveTo(px + z - 0.5, py);
            ctx.lineTo(px + z - 0.5, py + z);
          }
        }
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.stroke();
      ctx.setLineDash([4, 4]);
      ctx.lineDashOffset = -antsRef.current;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      ctx.restore();
    }

    if (draft && st.tool === 'select' && draft.w > 0 && draft.h > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(245,185,66,0.95)';
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1;
      ctx.strokeRect(draft.x * z + 0.5, draft.y * z + 0.5, draft.w * z, draft.h * z);
      ctx.restore();
    }

    if (lasso && lasso.length > 1) {
      ctx.save();
      ctx.strokeStyle = 'rgba(245,185,66,0.9)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      lasso.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x * z + z / 2, p.y * z + z / 2);
        else ctx.lineTo(p.x * z + z / 2, p.y * z + z / 2);
      });
      ctx.stroke();
      ctx.restore();
    }

    if (ui.assistantHighlights.length > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(245,185,66,0.9)';
      ctx.lineWidth = 1.5;
      for (const p of ui.assistantHighlights) {
        ctx.strokeRect(p.x * z + 0.5, p.y * z + 0.5, z - 1, z - 1);
      }
      ctx.restore();
    }

    // Brush cursor
    const hover = hoverRef.current;
    if (hover && modeRef.current !== 'pan' && z >= 2 && st.tool !== 'select' && st.tool !== 'select-free') {
      const size = Math.max(1, settings.size);
      const isShape = ['line', 'rect', 'rect-filled', 'ellipse', 'ellipse-filled', 'gradient'].includes(st.tool);
      const w = isShape ? z : size * z;
      const h = isShape ? z : size * z;
      const off = Math.floor(size / 2);
      const x = (hover.x - (isShape ? 0 : off)) * z;
      const y = (hover.y - (isShape ? 0 : off)) * z;
      ctx.save();
      ctx.strokeStyle = 'rgba(0,0,0,0.65)';
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      ctx.restore();
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, cssW - 1, cssH - 1);
  }, []);

  const drawTilePreview = useCallback(() => {
    const canvas = tileRef.current;
    if (!canvas) return;
    const st = useEditor.getState();
    if (!st.toolSettings.tileMode || !st.toolSettings.tilePreview) {
      canvas.width = 0;
      canvas.height = 0;
      return;
    }
    const frameIndex = st.doc.frames.findIndex((f) => f.id === st.activeFrameId);
    if (frameIndex < 0) return;
    const { width, height } = st.doc;
    const tile = document.createElement('canvas');
    tile.width = width;
    tile.height = height;
    const tileCtx = tile.getContext('2d');
    if (!tileCtx) return;
    const pixels = new Uint8ClampedArray(compositeFrame(st.doc, frameIndex));
    tileCtx.putImageData(new ImageData(pixels, width, height), 0, 0);
    canvas.width = width * 3;
    canvas.height = height * 3;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) ctx.drawImage(tile, x * width, y * height);
    }
  }, []);

  const drawOnion = useCallback(() => {
    const canvas = onionRef.current;
    if (!canvas) return;
    const st = useEditor.getState();
    const ui = useUi.getState();
    if (!ui.onion.enabled) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    const frameIndex = st.doc.frames.findIndex((f) => f.id === st.activeFrameId);
    if (frameIndex < 0) return;
    let temp = tempCanvasRef.current;
    if (!temp || temp.width !== st.doc.width || temp.height !== st.doc.height) {
      temp = document.createElement('canvas');
      temp.width = st.doc.width;
      temp.height = st.doc.height;
      tempCanvasRef.current = temp;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const renderGhost = (index: number, tintHex: string, alpha: number) => {
      if (index < 0 || index >= st.doc.frames.length) return;
      const pixels = compositeFrame(st.doc, index);
      const [r, g, b] = hexToRgba(tintHex).slice(0, 3) as [number, number, number];
      const tinted = tintPixels(pixels, [r, g, b], 0.65, alpha);
      const tctx = temp!.getContext('2d');
      if (!tctx) return;
      tctx.putImageData(new ImageData(new Uint8ClampedArray(tinted), st.doc.width, st.doc.height), 0, 0);
      ctx.drawImage(temp!, 0, 0);
    };

    for (let i = ui.onion.previous; i >= 1; i--) {
      renderGhost(frameIndex - i, ui.onion.tintPrevious, ui.onion.opacity / i);
    }
    for (let i = ui.onion.next; i >= 1; i--) {
      renderGhost(frameIndex + i, ui.onion.tintNext, ui.onion.opacity / i);
    }
  }, []);

  const paint = useCallback(
    (full: boolean, rect: Rect | null) => {
      const st = useEditor.getState();
      const canvas = mainRef.current;
      if (!canvas) return;
      const { width, height } = st.doc;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        full = true;
      }
      if (compositeSizeRef.current.w !== width || compositeSizeRef.current.h !== height) {
        compositeRef.current = new Uint8ClampedArray(width * height * 4);
        compositeSizeRef.current = { w: width, h: height };
        full = true;
      }
      const buf = compositeRef.current;
      if (!buf) return;
      const frameIndex = st.doc.frames.findIndex((f) => f.id === st.activeFrameId);
      if (frameIndex < 0) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      if (full || !rect) {
        compositeFrame(st.doc, frameIndex, buf);
        ctx.putImageData(new ImageData(new Uint8ClampedArray(buf), width, height), 0, 0);
        drawOnion();
        drawOverlay();
        drawTilePreview();
        return;
      }
      const r: Rect = {
        x: Math.max(0, Math.floor(rect.x)),
        y: Math.max(0, Math.floor(rect.y)),
        w: 0,
        h: 0,
      };
      r.w = Math.min(width - r.x, Math.ceil(rect.w));
      r.h = Math.min(height - r.y, Math.ceil(rect.h));
      if (r.w <= 0 || r.h <= 0) return;
      compositeFrame(st.doc, frameIndex, buf, { dirty: r });
      const offset = (r.y * width + r.x) * 4;
      const view = new Uint8ClampedArray(buf.buffer, buf.byteOffset + offset, r.w * r.h * 4);
      ctx.putImageData(new ImageData(new Uint8ClampedArray(view), r.w, r.h), r.x, r.y);
      drawOverlay();
      drawTilePreview();
    },
    [drawOnion, drawOverlay, drawTilePreview],
  );

  const schedule = useCallback(
    (full: boolean, rect?: Rect | null) => {
      if (full) pendingRef.current.full = true;
      else if (rect) {
        pendingRef.current.rect = pendingRef.current.rect ? unionRect(pendingRef.current.rect, rect) : rect;
      }
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        const p = pendingRef.current;
        pendingRef.current = { full: false, rect: null };
        paint(p.full, p.rect);
      });
    },
    [paint],
  );

  /* ---- store subscriptions (no React re-render during drawing) ---- */
  useEffect(() => {
    const unsub = useEditor.subscribe((s, prev) => {
      if (s.revision !== prev.revision || s.activeFrameId !== prev.activeFrameId) {
        schedule(true);
      }
    });
    const unsubUi = useUi.subscribe((s, prev) => {
      if (
        s.zoom !== prev.zoom ||
        s.showGrid !== prev.showGrid ||
        s.showPixelGrid !== prev.showPixelGrid ||
        s.gridSize !== prev.gridSize ||
        s.assistantHighlights !== prev.assistantHighlights
      ) {
        schedule(true);
      }
      if (s.onion !== prev.onion) {
        schedule(true);
      }
    });
    schedule(true);
    return () => {
      unsub();
      unsubUi();
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };
  }, [schedule]);

  useEffect(() => {
    schedule(true);
  }, [zoom, selection, onion, showGrid, showPixelGrid, gridSize, highlights, doc.width, doc.height, revision, schedule]);

  useEffect(() => {
    if (tilePreviewActive) drawTilePreview();
  }, [tilePreviewActive, revision, doc.id, drawTilePreview]);

  useEffect(() => {
    if (!selection) return;
    const t = window.setInterval(() => {
      antsRef.current = (antsRef.current + 1) % 8;
      drawOverlay();
    }, 110);
    return () => window.clearInterval(t);
  }, [selection, drawOverlay]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceRef.current = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceRef.current = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  /* ---- wheel zoom ---- */
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      userAdjustedRef.current = true;
      const ui = useUi.getState();
      if (e.shiftKey) {
        ui.setPan(ui.panX - e.deltaY, ui.panY);
        return;
      }
      const rect = vp.getBoundingClientRect();
      const cx = e.clientX - rect.left - rect.width / 2;
      const cy = e.clientY - rect.top - rect.height / 2;
      const factor = e.deltaY < 0 ? 1.18 : 1 / 1.18;
      const next = Math.max(0.5, Math.min(64, ui.zoom * factor));
      const ratio = next / ui.zoom;
      ui.setZoom(next);
      ui.setPan(cx - (cx - ui.panX) * ratio, cy - (cy - ui.panY) * ratio);
    };
    vp.addEventListener('wheel', onWheel, { passive: false });
    return () => vp.removeEventListener('wheel', onWheel);
  }, []);

  const docPoint = (e: React.PointerEvent | PointerEvent) => {
    const canvas = mainRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const z = useUi.getState().zoom;
    return {
      x: Math.floor((e.clientX - rect.left) / z),
      y: Math.floor((e.clientY - rect.top) / z),
    };
  };

  const finishStroke = () => {
    const stroke = strokeRef.current;
    const store = useEditor.getState();
    strokeRef.current = null;
    if (!stroke) return;
    const activeTool = store.tool;
    const oldSelection = store.selection;
    const result = stroke.end();
    const sel = result.selectionRect;

    if (activeTool === 'move') {
      store.endStroke();
      if (oldSelection && sel) {
        store.translateSelection(sel.x - oldSelection.bounds.x, sel.y - oldSelection.bounds.y);
      } else if (sel) {
        store.setRectSelection(sel);
      }
    } else if (activeTool === 'select') {
      if (!sel || sel.w < 1 || sel.h < 1) store.clearSelection();
      else store.setRectSelection(sel);
    } else if (activeTool === 'select-free') {
      if (result.selectionPoints && result.selectionPoints.length >= 3) {
        store.setLassoSelection(result.selectionPoints);
      } else {
        store.clearSelection();
      }
    } else {
      store.endStroke();
    }
    const state = useEditor.getState();
    const idx = state.doc.frames.findIndex((f) => f.id === state.activeFrameId);
    if (idx >= 0) state.setThumbnail(thumbnailDataUrl(state.doc, idx, 320));
    schedule(true);
  };

  /** Pen eraser tips report button 5, which standard pointer events otherwise ignore. */
  const pressureOf = (e: React.PointerEvent) =>
    e.pointerType === 'pen' ? Math.max(0.05, e.pressure || 0.5) : 1;

  /** Shared stroke start, used by mouse/pen and by deferred touch input. */
  const startStrokeAt = (pt: { x: number; y: number }, paintButton: number, strokeTool: ToolId, pressure: number) => {
    const store = useEditor.getState();
    const layer = store.getActiveLayer();
    if (layer?.locked) {
      useUi.getState().pushToast(`${layer.name} is locked. Unlock it to paint.`, 'warning');
      return;
    }
    const cel = store.getActiveCel();
    if (!cel) return;
    paintButtonRef.current = paintButton;
    const painting = !['select', 'select-free'].includes(strokeTool);
    if (painting && strokeTool !== 'move') {
      store.beginStroke(TOOL_LABELS[strokeTool] ?? 'Draw');
    } else if (strokeTool === 'move') {
      store.beginStroke('Move pixels');
    }
    const stroke = new PaintStroke({
      cel,
      width: store.doc.width,
      height: store.doc.height,
      tool: strokeTool,
      settings: store.toolSettings,
      primary: hexToRgba(store.doc.primary),
      secondary: hexToRgba(store.doc.secondary),
      mask: store.selection?.mask ?? null,
      brush: brushMask(store.toolSettings.brushId, store.toolSettings.size),
      indexed: store.doc.indexed === true,
    });
    strokeRef.current = stroke;
    stroke.setPressure(pressure);
    stroke.start(pt.x, pt.y, paintButton);
    modeRef.current = 'paint';
    const dirty = stroke.takeDirty();
    if (dirty) schedule(false, dirty);
    else schedule(true);
  };

  const updatePinch = () => {
    const pinch = pinchRef.current;
    const viewport = viewportRef.current;
    const points = [...touchRef.current.values()];
    if (!pinch || !viewport || points.length < 2) return;
    const [a, b] = points;
    const rect = viewport.getBoundingClientRect();
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    const ui = useUi.getState();
    const next = Math.max(0.5, Math.min(64, pinch.startZoom * (dist / pinch.startDist)));
    const ratio = next / pinch.startZoom;
    const curCx = midX - rect.left - rect.width / 2;
    const curCy = midY - rect.top - rect.height / 2;
    ui.setZoom(next);
    ui.setPan(
      curCx - (pinch.startCx - pinch.startPanX) * ratio,
      curCy - (pinch.startCy - pinch.startPanY) * ratio,
    );
    userAdjustedRef.current = true;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const store = useEditor.getState();
    const ui = useUi.getState();
    const pt = docPoint(e);

    if (e.pointerType === 'touch') {
      touchRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touchRef.current.size === 2) {
        // Second finger: abandon the pending stroke and start a pinch gesture.
        touchPendingRef.current = null;
        if (modeRef.current === 'paint') {
          modeRef.current = 'none';
          finishStroke();
        }
        const [a, b] = [...touchRef.current.values()];
        const rect = viewport.getBoundingClientRect();
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        pinchRef.current = {
          startDist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
          startZoom: ui.zoom,
          startPanX: ui.panX,
          startPanY: ui.panY,
          startCx: midX - rect.left - rect.width / 2,
          startCy: midY - rect.top - rect.height / 2,
        };
        modeRef.current = 'pinch';
        return;
      }
    }

    if (e.button === 1 || spaceRef.current || (e.button === 0 && e.altKey)) {
      modeRef.current = 'pan';
      panStartRef.current = { x: e.clientX, y: e.clientY, panX: ui.panX, panY: ui.panY };
      viewport.classList.add('panning');
      return;
    }

    const paintButton = e.button === 2 ? 2 : 0;

    if (store.tool === 'eyedropper') {
      const buf = compositeRef.current;
      const w = store.doc.width;
      if (buf && pt.x >= 0 && pt.y >= 0 && pt.x < w && pt.y < store.doc.height) {
        const i = (pt.y * w + pt.x) * 4;
        const hex = rgbaToHex([buf[i], buf[i + 1], buf[i + 2], buf[i + 3]]);
        if (paintButton === 2) store.setSecondary(hex);
        else store.setPrimary(hex);
      }
      return;
    }

    if (store.tool === 'text') {
      const vpRect = viewport.getBoundingClientRect();
      setTextDraft({
        x: pt.x,
        y: pt.y,
        left: e.clientX - vpRect.left + 10,
        top: e.clientY - vpRect.top + 10,
        value: '',
      });
      return;
    }

    // A pen's eraser tip draws with the eraser without changing the selected tool.
    // Chromium reports button 5; some drivers only set the eraser bit in `buttons`.
    const eraserTip = e.pointerType === 'pen' && (e.button === 5 || (e.buttons & 32) !== 0);
    const strokeTool: ToolId = eraserTip ? 'eraser' : store.tool;

    if (e.pointerType === 'touch') {
      // Wait for movement so a second finger can turn this into a pinch instead of a dot.
      touchPendingRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        pt,
        button: paintButton,
        tool: strokeTool,
      };
      modeRef.current = 'touch-pending';
      return;
    }

    startStrokeAt(pt, paintButton, strokeTool, pressureOf(e));
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const pt = docPoint(e);
    if (e.pointerType === 'touch') {
      const known = touchRef.current.get(e.pointerId);
      if (known) {
        known.x = e.clientX;
        known.y = e.clientY;
      }
      if (modeRef.current === 'pinch') {
        updatePinch();
        return;
      }
      if (modeRef.current === 'touch-pending') {
        const pending = touchPendingRef.current;
        if (!pending) return;
        if (Math.hypot(e.clientX - pending.startX, e.clientY - pending.startY) < 6) return;
        touchPendingRef.current = null;
        startStrokeAt(pending.pt, pending.button, pending.tool, 1);
      }
    } else if (!hoverRef.current || hoverRef.current.x !== pt.x || hoverRef.current.y !== pt.y) {
      hoverRef.current = pt;
      setHover({ cursor: pt });
      drawOverlay();
    }
    if (modeRef.current === 'pan') {
      const start = panStartRef.current;
      useUi.getState().setPan(start.panX + (e.clientX - start.x), start.panY + (e.clientY - start.y));
      return;
    }
    const stroke = strokeRef.current;
    if (!stroke || modeRef.current !== 'paint') return;
    stroke.setPressure(pressureOf(e));
    stroke.move(pt.x, pt.y, paintButtonRef.current, e.shiftKey);
    const dirty = stroke.takeDirty();
    if (dirty) schedule(false, dirty);
    else drawOverlay();
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') {
      touchRef.current.delete(e.pointerId);
      if (modeRef.current === 'pinch') {
        if (touchRef.current.size < 2) {
          modeRef.current = 'none';
          pinchRef.current = null;
        }
        return;
      }
      if (modeRef.current === 'touch-pending') {
        const pending = touchPendingRef.current;
        touchPendingRef.current = null;
        if (pending) startStrokeAt(pending.pt, pending.button, pending.tool, 1);
        modeRef.current = 'none';
        finishStroke();
        return;
      }
    }
    if (modeRef.current === 'pan') {
      modeRef.current = 'none';
      viewportRef.current?.classList.remove('panning');
      return;
    }
    if (modeRef.current !== 'paint') return;
    modeRef.current = 'none';
    finishStroke();
  };

  const onPointerLeave = () => {
    hoverRef.current = null;
    setHover({ cursor: null });
    drawOverlay();
  };

  const commitText = () => {
    if (!textDraft) return;
    const value = textDraft.value;
    const store = useEditor.getState();
    setTextDraft(null);
    if (!value.trim()) return;
    store.stampText(value, textDraft.x, textDraft.y, store.doc.primary, store.toolSettings.fontScale);
    const state = useEditor.getState();
    const idx = state.doc.frames.findIndex((f) => f.id === state.activeFrameId);
    if (idx >= 0) state.setThumbnail(thumbnailDataUrl(state.doc, idx, 320));
    schedule(true);
  };

  const zoomStep = (factor: number) => {
    userAdjustedRef.current = true;
    const ui = useUi.getState();
    ui.setZoom(ui.zoom * factor);
  };

  const cycleChecker = () => {
    const ui = useUi.getState();
    ui.set({ checker: ui.checker === 'transparent' ? 'dark' : ui.checker === 'dark' ? 'light' : 'transparent' });
  };

  const fit = () => {
    userAdjustedRef.current = true;
    const vp = viewportRef.current;
    if (!vp) return;
    const rect = vp.getBoundingClientRect();
    useUi.getState().zoomToFit(doc.width, doc.height, rect.width, rect.height);
  };

  const checkerSize = Math.max(6, Math.min(28, Math.round(zoom * 3)));

  return (
    <div
      ref={viewportRef}
      className="canvas-viewport"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={onPointerLeave}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        className="stage-wrap"
        style={{ transform: `translate(-50%, -50%) translate(${panX}px, ${panY}px)` }}
      >
        <div ref={stageRef} className="stage" style={{ width: stageW, height: stageH }}>
          <div
            className="checker"
            style={
              checker === 'transparent'
                ? {
                    backgroundSize: `${checkerSize}px ${checkerSize}px`,
                    backgroundPosition: `0 0, 0 ${checkerSize / 2}px, ${checkerSize / 2}px ${-checkerSize / 2}px, ${-checkerSize / 2}px 0`,
                  }
                : { background: checker === 'light' ? '#d9d5e2' : '#111118', backgroundImage: 'none' }
            }
          />
          <canvas ref={onionRef} width={doc.width} height={doc.height} style={{ opacity: 0.9 }} />
          <canvas ref={mainRef} width={doc.width} height={doc.height} />
          <canvas ref={overlayRef} className="overlay-canvas" />
        </div>
      </div>

      <div className="canvas-hud bottom-left">
        <button className="iconbtn" onClick={() => zoomStep(1 / 1.25)} title="Zoom out (-)" aria-label="Zoom out">
          <Icon name="zoom-out" />
        </button>
        <span className="zoom-readout">{Math.round(zoom * 100)}%</span>
        <button className="iconbtn" onClick={() => zoomStep(1.25)} title="Zoom in (+)" aria-label="Zoom in">
          <Icon name="zoom-in" />
        </button>
        <span className="sep" />
        <button className="iconbtn" onClick={fit} title="Fit canvas (0)" aria-label="Fit canvas">
          <Icon name="fit" />
        </button>
      </div>

      <div className="canvas-hud top-right">
        <button
          className={`iconbtn${showGrid ? ' active' : ''}`}
          onClick={() => useUi.getState().set({ showGrid: !showGrid })}
          title="Toggle grid (')"
        >
          <Icon name="grid" />
        </button>
        <button
          className={`iconbtn${onion.enabled ? ' active' : ''}`}
          onClick={() => useUi.getState().setOnion({ enabled: !onion.enabled })}
          title="Toggle onion skin (Shift+O)"
        >
          <Icon name="onion" />
        </button>
        <button className={`iconbtn${checker !== 'transparent' ? ' active' : ''}`} onClick={cycleChecker} title="Cycle background">
          <Icon name="image" />
        </button>
        <button
          className={`iconbtn${toolSettings.tileMode ? ' active' : ''}`}
          onClick={() => {
            const next = !useEditor.getState().toolSettings.tileMode;
            useEditor.getState().updateToolSettings({ tileMode: next, tilePreview: next });
          }}
          title="Tile mode — strokes wrap across edges"
        >
          <Icon name="grid-map" />
        </button>
      </div>

      {tilePreviewActive && (
        <div className="tile-preview">
          <canvas ref={tileRef} />
        </div>
      )}

      {textDraft && (
        <div className="text-draft" style={{ left: textDraft.left, top: textDraft.top }}>
          <input
            autoFocus
            value={textDraft.value}
            placeholder="Type, then press Enter"
            onChange={(e) => setTextDraft({ ...textDraft, value: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitText();
              }
              if (e.key === 'Escape') setTextDraft(null);
            }}
          />
          <button className="btn sm" onMouseDown={(e) => e.preventDefault()} onClick={commitText}>
            Place
          </button>
          <button className="btn ghost sm" onClick={() => setTextDraft(null)}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
