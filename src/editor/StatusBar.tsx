import { TOOL_BY_ID } from './tools';
import { useEditor } from '../store/project';
import { useUi } from '../store/ui';

export function StatusBar() {
  const doc = useEditor((s) => s.doc);
  const activeFrameId = useEditor((s) => s.activeFrameId);
  const activeLayerId = useEditor((s) => s.activeLayerId);
  const tool = useEditor((s) => s.tool);
  const selectedCount = useEditor((s) => {
    if (!s.selection) return 0;
    let n = 0;
    for (let i = 0; i < s.selection.mask.length; i++) if (s.selection.mask[i]) n++;
    return n;
  });
  const saveStatus = useEditor((s) => s.saveStatus);
  const zoom = useUi((s) => s.zoom);
  const cursor = useUi((s) => s.cursor);
  const openDialog = useUi((s) => s.openDialog);

  const frameIndex = doc.frames.findIndex((f) => f.id === activeFrameId);
  const layer = doc.layers.find((l) => l.id === activeLayerId);
  const toolDef = TOOL_BY_ID.get(tool);

  return (
    <div className="statusbar">
      <span>
        {doc.width} × {doc.height}
      </span>
      <span className="sep" />
      <span>{cursor ? `${cursor.x}, ${cursor.y}` : '—, —'}</span>
      <span className="sep" />
      <span>{Math.round(zoom * 100)}%</span>
      <span className="sep" />
      <span>
        frame {frameIndex + 1}/{doc.frames.length}
      </span>
      <span className="sep" />
      <span className="accent">{layer?.name ?? 'No layer'}</span>
      {selectedCount > 0 && (
        <>
          <span className="sep" />
          <span>{selectedCount.toLocaleString()} px selected</span>
        </>
      )}
      <div className="right">
        {toolDef && <span>{toolDef.label}</span>}
        <span className="sep" />
        <span>{saveStatus === 'saved' ? 'Saved locally' : saveStatus === 'saving' ? 'Saving…' : saveStatus === 'error' ? 'Save failed' : 'Unsaved changes'}</span>
        <button className="iconbtn" style={{ width: 20, height: 20 }} onClick={() => openDialog('shortcuts')} title="Keyboard shortcuts">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
            <rect x="1.5" y="4" width="13" height="8" rx="1.5" />
            <path d="M4 6.5h.01M7 6.5h.01M10 6.5h.01M12 6.5h.01M5.5 9.5h5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
