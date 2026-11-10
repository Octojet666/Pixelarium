import { useEffect, useRef, useState } from 'react';
import { BrandMark, Icon } from '../components/Icon';
import { useEditor } from '../store/project';
import { useUi } from '../store/ui';
import { useInstallState } from '../lib/useInstall';
import { installApp } from '../lib/pwa';
import { openProjectInNewTab } from '../lib/session';
import { copyShareLink } from './projectActions';

function useOutsideClose(onClose: () => void) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [onClose]);
  return ref;
}

export function TopBar() {
  const doc = useEditor((s) => s.doc);
  const saveStatus = useEditor((s) => s.saveStatus);
  const historyState = useEditor((s) => s.historyState);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const saveNow = useEditor((s) => s.saveNow);
  const flipCanvas = useEditor((s) => s.flipCanvas);
  const rotateCanvas = useEditor((s) => s.rotateCanvas);
  const cropToSelection = useEditor((s) => s.cropToSelection);
  const clearActiveLayer = useEditor((s) => s.clearActiveLayer);
  const hasSelection = useEditor((s) => s.selection !== null);
  const setScreen = useUi((s) => s.setScreen);
  const openDialog = useUi((s) => s.openDialog);
  const pushToast = useUi((s) => s.pushToast);
  const [menu, setMenu] = useState<'file' | 'canvas' | null>(null);
  const menuRef = useOutsideClose(() => setMenu(null));

  const lastSaved = useEditor((s) => s.lastSavedAt);
  const install = useInstallState();

  const openInNewTab = async () => {
    await saveNow();
    if (useEditor.getState().saveStatus === 'error') {
      pushToast('Could not save this project, so it was not opened in a new tab.', 'error');
      return;
    }
    openProjectInNewTab(doc.id);
  };

  return (
    <div className="editor-topbar">
      <button className="topbar-brand" onClick={() => setScreen('home')} title="Back to the project library">
        <BrandMark size={26} />
      </button>
      <button className="project-chip" onClick={() => openDialog('rename')} title="Rename project">
        <span className="title">{doc.name}</span>
        <span className="dim mono">
          {doc.width}×{doc.height}
        </span>
      </button>

      <div className="save-state" style={{ marginLeft: 2 }}>
        <span className="pulse" />
        <span className={`save-state ${saveStatus}`}>
          {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'unsaved' ? 'Edited' : saveStatus === 'error' ? 'Save failed' : lastSaved ? 'Saved' : 'Saved locally'}
        </span>
      </div>

      <div className="topbar-group">
        <button className="iconbtn" onClick={undo} disabled={!historyState.canUndo} title={`Undo ${historyState.undoLabel ?? ''} (Ctrl+Z)`}>
          <Icon name="undo" />
        </button>
        <button className="iconbtn" onClick={redo} disabled={!historyState.canRedo} title={`Redo ${historyState.redoLabel ?? ''} (Ctrl+Shift+Z)`}>
          <Icon name="redo" />
        </button>
      </div>

      <div className="spacer" />

      <div className="topbar-group" ref={menuRef} style={{ position: 'relative' }}>
        <button className={`btn sm ghost${menu === 'file' ? ' active' : ''}`} onClick={() => setMenu(menu === 'file' ? null : 'file')}>
          File <Icon name="chevron-down" size={12} />
        </button>
        {menu === 'file' && (
          <div
            style={{
              position: 'absolute',
              top: 32,
              left: 0,
              minWidth: 214,
              background: 'var(--ink-3)',
              border: '1px solid var(--line)',
              borderRadius: 9,
              padding: 5,
              boxShadow: 'var(--shadow-panel)',
              zIndex: 40,
            }}
          >
            {[
              { label: 'New project…', hint: 'Ctrl+N', action: () => openDialog('new-project') },
              { label: 'Open project…', hint: 'Ctrl+O', action: () => openDialog('open-project') },
              { label: 'Save now', hint: 'Ctrl+S', action: () => void saveNow() },
              { label: 'Open in new tab', hint: 'multi-task', action: () => void openInNewTab() },
              { label: 'Copy share link', hint: 'no account', action: () => void copyShareLink() },
              { label: 'Export…', hint: 'Ctrl+E', action: () => openDialog('export') },
              { label: 'Import image…', hint: '', action: () => openDialog('import-image') },
              { label: 'Nine-slice preview…', hint: 'UI panels', action: () => openDialog('nine-slice') },
              { label: 'Project settings…', hint: '', action: () => openDialog('canvas-size') },
            ].map((item) => (
              <button
                key={item.label}
                className="btn ghost"
                style={{ width: '100%', justifyContent: 'space-between', height: 29 }}
                onClick={() => {
                  setMenu(null);
                  item.action();
                }}
              >
                {item.label}
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }} className="mono">
                  {item.hint}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="topbar-group" style={{ position: 'relative' }}>
        <button className="btn sm ghost" onClick={() => setMenu(menu === 'canvas' ? null : 'canvas')}>
          Canvas <Icon name="chevron-down" size={12} />
        </button>
        {menu === 'canvas' && (
          <div
            style={{
              position: 'absolute',
              top: 32,
              left: 0,
              minWidth: 200,
              background: 'var(--ink-3)',
              border: '1px solid var(--line)',
              borderRadius: 9,
              padding: 5,
              boxShadow: 'var(--shadow-panel)',
              zIndex: 40,
            }}
          >
            {[
              { label: 'Resize canvas…', action: () => openDialog('canvas-size') },
              { label: 'Crop to selection', action: cropToSelection, disabled: !hasSelection },
              { label: 'Flip horizontal', action: () => flipCanvas('horizontal') },
              { label: 'Flip vertical', action: () => flipCanvas('vertical') },
              { label: 'Rotate 90° clockwise', action: rotateCanvas },
              { label: 'Clear active layer', action: clearActiveLayer },
            ].map((item) => (
              <button
                key={item.label}
                className="btn ghost"
                style={{ width: '100%', justifyContent: 'flex-start', height: 29 }}
                disabled={item.disabled}
                onClick={() => {
                  setMenu(null);
                  item.action();
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="topbar-group">
        <button
          className="iconbtn"
          onClick={() => useUi.getState().setCinemaOpen(true)}
          title="Cinematic camera & video"
        >
          <Icon name="film" />
        </button>
        <button
          className="iconbtn"
          onClick={() => setScreen('playground')}
          title="Procedural playground"
        >
          <Icon name="sparkles" />
        </button>
        <button className="iconbtn" onClick={() => setScreen('tileset')} title="Tileset studio">
          <Icon name="grid-map" />
        </button>
        <button className="iconbtn" onClick={() => setScreen('showcase')} title="Showcase this artwork">
          <Icon name="share" />
        </button>
        <button className="iconbtn" onClick={() => setScreen('settings')} title="Settings">
          <Icon name="settings" />
        </button>
        <button className="iconbtn" onClick={() => openDialog('shortcuts')} title="Keyboard shortcuts (?)">
          <Icon name="keyboard" />
        </button>
      </div>

      <button className="btn sm" onClick={() => void saveNow()} title="Save project locally (Ctrl+S)">
        <Icon name="save" size={13} /> Save
      </button>
      <button
        className="btn primary sm"
        onClick={() => openDialog('export')}
        title="Export artwork (Ctrl+E)"
        style={{ marginLeft: 2 }}
      >
        <Icon name="download" size={13} /> Export
      </button>
      {install.canInstall && (
        <button
          className="btn sm ghost"
          onClick={async () => {
            const result = await installApp();
            if (result === 'accepted') pushToast('Pixelarium installed — it now opens as its own app.', 'success');
          }}
          title="Install Pixelarium as an app"
        >
          <Icon name="install" size={13} /> Install
        </button>
      )}
      <button
        className="iconbtn"
        onClick={() => {
          pushToast('Everything is saved locally in your browser. Cloud sync arrives with accounts.', 'info');
        }}
        title="Saved locally"
        aria-label="Saved locally"
      >
        <Icon name="shield" />
      </button>
    </div>
  );
}
