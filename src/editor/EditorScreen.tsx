import { useEffect, useRef, type CSSProperties } from 'react';
import { CanvasStage } from './CanvasStage';
import { ToolRail } from './ToolRail';
import { ToolOptions } from './ToolOptions';
import { TopBar } from './TopBar';
import { ColorPanel } from './ColorPanel';
import { LayersPanel } from './LayersPanel';
import { AnalysisPanel } from './AnalysisPanel';
import { Timeline } from './Timeline';
import { StatusBar } from './StatusBar';
import { AnimationPreview } from './AnimationPreview';
import { dragResize } from '../components/Controls';
import { Icon } from '../components/Icon';
import { useEditor } from '../store/project';
import { useUi } from '../store/ui';
import { TOOL_SHORTCUTS } from './tools';
import { exportProjectFile } from './exporting';

function usePlayback() {
  const playing = useUi((s) => s.playing);
  const playMode = useUi((s) => s.playMode);
  const loop = useUi((s) => s.loop);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let direction = 1;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(200, now - last);
      last = now;
      acc += dt;
      const store = useEditor.getState();
      const frames = store.doc.frames;
      const idx = frames.findIndex((f) => f.id === store.activeFrameId);
      if (idx < 0) return;
      const duration = Math.max(20, frames[idx].duration);
      if (acc < duration) return;
      acc = 0;
      let next = idx;
      if (playMode === 'forward') next = idx + 1;
      else if (playMode === 'reverse') next = idx - 1;
      else {
        next = idx + direction;
        if (next >= frames.length) {
          direction = -1;
          next = frames.length - 2;
        } else if (next < 0) {
          direction = 1;
          next = 1;
        }
      }
      if (next >= frames.length || next < 0) {
        if (!loop) {
          useUi.getState().setPlaying(false);
          return;
        }
        next = playMode === 'reverse' ? frames.length - 1 : 0;
      }
      if (frames[next]) store.setActiveFrame(frames[next].id);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, playMode, loop]);
}

function useEditorShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      const store = useEditor.getState();
      const ui = useUi.getState();
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      // Option/Alt changes e.key on macOS, so Alt combinations read the physical code instead.
      const altKey = !e.altKey
        ? key
        : e.code.startsWith('Key')
          ? e.code.slice(3).toLowerCase()
          : e.code === 'BracketLeft'
            ? '['
            : e.code === 'BracketRight'
              ? ']'
              : key;

      if (mod && e.altKey) {
        switch (altKey) {
          case 'n':
            e.preventDefault();
            store.addFrame();
            return;
          case 'd':
            e.preventDefault();
            store.duplicateFrame();
            return;
          case 'arrowleft':
            e.preventDefault();
            store.moveFrame(store.activeFrameId, 'left');
            return;
          case 'arrowright':
            e.preventDefault();
            store.moveFrame(store.activeFrameId, 'right');
            return;
          case 'backspace':
            e.preventDefault();
            store.deleteFrame(store.activeFrameId);
            return;
          default:
            return;
        }
      }

      if (mod) {
        switch (key) {
          case 'z':
            e.preventDefault();
            if (e.shiftKey) store.redo();
            else store.undo();
            return;
          case 'y':
            e.preventDefault();
            store.redo();
            return;
          case 's':
            e.preventDefault();
            if (e.shiftKey) {
              exportProjectFile(store.doc);
              ui.pushToast('Project file exported (.pxl).', 'success');
            } else {
              void store.saveNow();
            }
            return;
          case 'o':
            e.preventDefault();
            ui.openDialog('open-project');
            return;
          case 'n':
            e.preventDefault();
            if (e.shiftKey) store.addLayer();
            else ui.openDialog('new-project');
            return;
          case 'a':
            e.preventDefault();
            store.selectAll();
            return;
          case 'd':
            e.preventDefault();
            if (e.shiftKey) store.duplicateLayer();
            else store.clearSelection();
            return;
          case 'c':
            e.preventDefault();
            store.copySelection();
            ui.pushToast('Copied selection.', 'info');
            return;
          case 'x':
            e.preventDefault();
            if (store.selection) {
              store.copySelection();
              store.deleteSelection();
              ui.pushToast('Cut selection.', 'info');
            }
            return;
          case 'v':
            e.preventDefault();
            store.pasteSelection();
            return;
          case 'e':
            e.preventDefault();
            ui.openDialog('export');
            return;
          default:
            return;
        }
      }

      if (ui.dialog) return;

      if (e.altKey) {
        const layers = store.doc.layers;
        const index = layers.findIndex((l) => l.id === store.activeLayerId);
        switch (altKey) {
          case '[': {
            e.preventDefault();
            const next = layers[Math.max(0, index - 1)];
            if (next && next.id !== store.activeLayerId) store.setActiveLayer(next.id);
            return;
          }
          case ']': {
            e.preventDefault();
            const next = layers[Math.min(layers.length - 1, index + 1)];
            if (next && next.id !== store.activeLayerId) store.setActiveLayer(next.id);
            return;
          }
          case 'h': {
            e.preventDefault();
            const layer = layers.find((l) => l.id === store.activeLayerId);
            if (layer) store.setLayerProps(layer.id, { visible: !layer.visible });
            return;
          }
          default:
            return;
        }
      }

      if (e.shiftKey) {
        switch (key) {
          case 'r':
            e.preventDefault();
            store.setTool('rect-filled');
            return;
          case 'e':
            e.preventDefault();
            store.setTool('ellipse-filled');
            return;
          case 'g':
            e.preventDefault();
            store.setTool('gradient');
            return;
          case 'o':
            e.preventDefault();
            ui.setOnion({ enabled: !ui.onion.enabled });
            return;
          default:
            break;
        }
      }

      const tool = TOOL_SHORTCUTS.get(key);
      if (tool) {
        e.preventDefault();
        store.setTool(tool);
        return;
      }

      switch (e.key) {
        case 'x':
        case 'X':
          store.swapColors();
          break;
        case '[':
          store.updateToolSettings({ size: Math.max(1, store.toolSettings.size - 1) });
          break;
        case ']':
          store.updateToolSettings({ size: Math.min(32, store.toolSettings.size + 1) });
          break;
        case '+':
        case '=':
          ui.setZoom(ui.zoom * 1.25);
          break;
        case '-':
          ui.setZoom(ui.zoom / 1.25);
          break;
        case '0':
          ui.zoomToFit(store.doc.width, store.doc.height, window.innerWidth - 560, window.innerHeight - 300);
          break;
        case "'":
          ui.set({ showGrid: !ui.showGrid });
          break;
        case 'Home': {
          const first = store.doc.frames[0];
          if (first) {
            e.preventDefault();
            store.setActiveFrame(first.id);
          }
          break;
        }
        case 'End': {
          const last = store.doc.frames[store.doc.frames.length - 1];
          if (last) {
            e.preventDefault();
            store.setActiveFrame(last.id);
          }
          break;
        }
        case 'Enter':
          ui.togglePlaying();
          break;
        case ',': {
          const idx = store.getActiveFrameIndex();
          store.setActiveFrame(store.doc.frames[Math.max(0, idx - 1)]?.id ?? store.activeFrameId);
          break;
        }
        case '.': {
          const idx = store.getActiveFrameIndex();
          store.setActiveFrame(
            store.doc.frames[Math.min(store.doc.frames.length - 1, idx + 1)]?.id ?? store.activeFrameId,
          );
          break;
        }
        case 'Delete':
        case 'Backspace':
          if (store.selection) {
            e.preventDefault();
            store.deleteSelection();
          }
          break;
        case 'Escape':
          store.clearSelection();
          ui.setHighlights([]);
          break;
        case '?':
          ui.openDialog('shortcuts');
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export function EditorScreen() {
  usePlayback();
  useEditorShortcuts();

  const timelineVisible = useUi((s) => s.timelineVisible);
  const timelineHeight = useUi((s) => s.timelineHeight);
  const rightWidth = useUi((s) => s.rightWidth);
  const leftWidth = useUi((s) => s.leftWidth);
  const rightTab = useUi((s) => s.rightTab);
  const uiSet = useUi((s) => s.set);
  const timelineRef = useRef(timelineHeight);
  const rightRef = useRef(rightWidth);
  timelineRef.current = timelineHeight;
  rightRef.current = rightWidth;

  return (
    <div className="editor-shell">
      <TopBar />
      <div className="editor-body">
        <div className="editor-left" style={{ '--left-w': `${leftWidth}px` } as CSSProperties}>
          <ToolRail />
        </div>
        <div className="editor-center">
          <div className="editor-stage-area">
            <CanvasStage />
            <ToolOptions />
          </div>
          {timelineVisible && (
            <>
              <div
                className="resizer-h"
                onPointerDown={(e) => {
                  const start = timelineRef.current;
                  dragResize(e, (delta) => {
                    const next = Math.max(120, Math.min(window.innerHeight - 280, start - delta));
                    uiSet({ timelineHeight: next });
                  }, 'y');
                }}
              />
              <div style={{ height: timelineHeight, flexShrink: 0, minHeight: 0 }}>
                <Timeline />
              </div>
            </>
          )}
          <StatusBar />
        </div>
        <div
          className="resizer-v"
          onPointerDown={(e) => {
            const start = rightRef.current;
            dragResize(e, (delta) => {
              const next = Math.max(240, Math.min(520, start - delta));
              uiSet({ rightWidth: next });
            }, 'x');
          }}
        />
        <div className="side-panel" style={{ width: rightWidth }}>
          <div className="panel-tabs">
            <button className={rightTab === 'color' ? 'active' : ''} onClick={() => uiSet({ rightTab: 'color' })}>
              Color
            </button>
            <button className={rightTab === 'layers' ? 'active' : ''} onClick={() => uiSet({ rightTab: 'layers' })}>
              Layers
            </button>
            <button className={rightTab === 'analysis' ? 'active' : ''} onClick={() => uiSet({ rightTab: 'analysis' })}>
              Analyze
            </button>
          </div>
          {rightTab === 'color' && <ColorPanel />}
          {rightTab === 'layers' && <LayersPanel />}
          {rightTab === 'analysis' && <AnalysisPanel />}
        </div>
      </div>
      <AnimationPreview />
      <MobilePanels />
    </div>
  );
}

/** Colour, layers and the timeline live in a bottom sheet on phones. */
function MobilePanels() {
  const panel = useUi((s) => s.mobilePanel);
  const setPanel = useUi((s) => s.setMobilePanel);
  useEffect(() => {
    // Widening the window past the phone breakpoint should not leave a floating sheet behind.
    const mq = window.matchMedia('(max-width: 820px)');
    const onChange = () => {
      if (!mq.matches) setPanel('none');
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [setPanel]);
  const tabs: {
    id: 'tool' | 'color' | 'layers' | 'timeline';
    label: string;
    icon: 'pencil' | 'palette' | 'layers' | 'film';
  }[] = [
    { id: 'tool', label: 'Tool', icon: 'pencil' },
    { id: 'color', label: 'Colour', icon: 'palette' },
    { id: 'layers', label: 'Layers', icon: 'layers' },
    { id: 'timeline', label: 'Frames', icon: 'film' },
  ];
  return (
    <>
      <div className="mobile-dock" role="toolbar" aria-label="Panels">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`mobile-dock-btn${panel === tab.id ? ' active' : ''}`}
            onClick={() => setPanel(panel === tab.id ? 'none' : tab.id)}
          >
            <Icon name={tab.icon} size={16} />
            {tab.label}
          </button>
        ))}
      </div>
      {panel !== 'none' && (
        <div className="mobile-sheet" role="dialog" aria-label={`${panel} panel`}>
          <div className="mobile-sheet-head">
            <div className="mobile-sheet-tabs">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  className={panel === tab.id ? 'active' : ''}
                  onClick={() => setPanel(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <button className="iconbtn" onClick={() => setPanel('none')} aria-label="Close panel">
              <Icon name="close" />
            </button>
          </div>
          <div className="mobile-sheet-body">
            {panel === 'tool' && <ToolOptions />}
            {panel === 'color' && <ColorPanel />}
            {panel === 'layers' && <LayersPanel />}
            {panel === 'timeline' && <Timeline />}
          </div>
        </div>
      )}
    </>
  );
}
