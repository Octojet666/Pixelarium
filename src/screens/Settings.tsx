import { useEffect, useState } from 'react';
import { PageNav } from './PageNav';
import { Slider } from '../components/Controls';
import { Icon } from '../components/Icon';
import { deleteStoredProject, listStoredProjects, loadStoredProject } from '../db/library';
import { serializeProject } from '../engine/serialize';
import { useEditor } from '../store/project';
import { useUi } from '../store/ui';
import { installApp } from '../lib/pwa';
import { useInstallState } from '../lib/useInstall';

export function Settings() {
  const ui = useUi();
  const install = useInstallState();
  const doc = useEditor((s) => s.doc);
  const pushToast = useUi((s) => s.pushToast);
  const [usage, setUsage] = useState<string>('—');
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        if (navigator.storage?.estimate) {
          const estimate = await navigator.storage.estimate();
          const used = estimate.usage ?? 0;
          setUsage(`${(used / 1024 / 1024).toFixed(2)} MB used${estimate.quota ? ` of ${(estimate.quota / 1024 / 1024 / 1024).toFixed(1)} GB` : ''}`);
        }
        setCount((await listStoredProjects()).length);
      } catch {
        setUsage('unavailable');
      }
    })();
  }, []);

  const exportEverything = async () => {
    try {
      const projects = await listStoredProjects();
      if (projects.length === 0) {
        pushToast('No saved projects to export yet.', 'warning');
        return;
      }
      const bundle: Record<string, unknown> = {};
      for (const p of projects) {
        const d = await loadStoredProject(p.id);
        if (d) bundle[d.id] = serializeProject(d);
      }
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'pixelarium-library-backup.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
      pushToast(`Exported ${projects.length} projects as a backup bundle.`, 'success');
    } catch {
      pushToast('Backup export failed.', 'error');
    }
  };

  return (
    <div className="page-shell">
      <div className="page-inner">
        <PageNav />
        <div className="page-head">
          <div>
            <span className="kicker">Preferences</span>
            <h1>Settings</h1>
            <p>Workspace preferences are stored in this browser. Project-specific data lives inside each .pxl file.</p>
          </div>
        </div>

        <div className="settings-layout">
          <nav className="settings-nav">
            <button className="active">Canvas & view</button>
            <button onClick={() => pushToast('Animation preferences live in the timeline header.', 'info')}>Animation</button>
            <button onClick={() => useUi.getState().openDialog('shortcuts')}>Shortcuts</button>
            <button onClick={() => useUi.getState().setScreen('docs')}>Manual</button>
          </nav>
          <div>
            <div className="settings-group">
              <h3>Canvas & view</h3>
              <div className="settings-row">
                <div>
                  <div>Grid size</div>
                  <div className="desc">Spacing of the guide grid over the canvas, in canvas pixels.</div>
                </div>
                <div className="control" style={{ width: 190 }}>
                  <Slider min={2} max={32} value={ui.gridSize} onChange={(gridSize) => ui.set({ gridSize })} format={(v) => `${v} px`} />
                </div>
              </div>
              <div className="settings-row">
                <div>
                  <div>Show grid</div>
                  <div className="desc">The same toggle as the grid button above the canvas (G).</div>
                </div>
                <div className="control">
                  <input type="checkbox" checked={ui.showGrid} onChange={(e) => ui.set({ showGrid: e.target.checked })} />
                </div>
              </div>
              <div className="settings-row">
                <div>
                  <div>Pixel grid</div>
                  <div className="desc">Draw a 1px grid between every pixel at high zoom. Helps with precise placement.</div>
                </div>
                <div className="control">
                  <input type="checkbox" checked={ui.showPixelGrid} onChange={(e) => ui.set({ showPixelGrid: e.target.checked })} />
                </div>
              </div>
              <div className="settings-row">
                <div>
                  <div>Transparency background</div>
                  <div className="desc">How the area behind transparent pixels is rendered.</div>
                </div>
                <div className="control">
                  <select className="select" value={ui.checker} onChange={(e) => ui.set({ checker: e.target.value as typeof ui.checker })} style={{ width: 160 }}>
                    <option value="transparent">Checkerboard</option>
                    <option value="dark">Dark</option>
                    <option value="light">Light</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="settings-group">
              <h3>Onion skin</h3>
              <div className="settings-row">
                <div>
                  <div>Ghost opacity</div>
                  <div className="desc">Base opacity for ghost frames. Further frames fade out automatically.</div>
                </div>
                <div className="control" style={{ width: 190 }}>
                  <Slider
                    min={5}
                    max={90}
                    value={Math.round(ui.onion.opacity * 100)}
                    onChange={(v) => ui.setOnion({ opacity: v / 100 })}
                    format={(v) => `${v}%`}
                  />
                </div>
              </div>
              <div className="settings-row">
                <div>
                  <div>Previous / next ghosts</div>
                  <div className="desc">How many frames to preview behind and ahead of the current one.</div>
                </div>
                <div className="control hstack">
                  <input
                    className="input mono"
                    type="number"
                    min={0}
                    max={5}
                    value={ui.onion.previous}
                    onChange={(e) => ui.setOnion({ previous: Math.max(0, Math.min(5, Number(e.target.value) || 0)) })}
                    style={{ width: 64 }}
                  />
                  <input
                    className="input mono"
                    type="number"
                    min={0}
                    max={5}
                    value={ui.onion.next}
                    onChange={(e) => ui.setOnion({ next: Math.max(0, Math.min(5, Number(e.target.value) || 0)) })}
                    style={{ width: 64 }}
                  />
                </div>
              </div>
            </div>

            <div className="settings-group">
              <h3>Workspace</h3>
              <div className="settings-row">
                <div>
                  <div>Timeline</div>
                  <div className="desc">Show the animation timeline below the canvas.</div>
                </div>
                <div className="control">
                  <input type="checkbox" checked={ui.timelineVisible} onChange={(e) => ui.set({ timelineVisible: e.target.checked })} />
                </div>
              </div>
              <div className="settings-row">
                <div>
                  <div>Reset panel sizes</div>
                  <div className="desc">Restore the timeline height and right panel width to their defaults.</div>
                </div>
                <div className="control">
                  <button className="btn sm" onClick={() => ui.set({ timelineHeight: 232, rightWidth: 296, leftWidth: 232 })}>
                    Reset layout
                  </button>
                </div>
              </div>
              <div className="settings-row">
                <div>
                  <div>Show the welcome tour</div>
                  <div className="desc">Open the three-step introduction again.</div>
                </div>
                <div className="control">
                  <button className="btn sm" onClick={() => ui.openDialog('onboarding')}>
                    Show tour
                  </button>
                </div>
              </div>
            </div>

            <div className="settings-group">
              <h3>App</h3>
              <div className="settings-row">
                <div>
                  <div>Install Pixelarium</div>
                  <div className="desc">
                    {install.standalone || install.installed
                      ? 'Running as an installed app. It opens in its own window with the same local projects and offline engine.'
                      : install.canInstall
                        ? 'Install once and Pixelarium opens from your dock or start menu, still working offline. Browser access keeps working too.'
                        : 'This browser has not offered the install prompt. Use its menu: “Install Pixelarium” (Chrome/Edge), or Share → “Add to Home Screen” on iOS and Android.'}
                  </div>
                </div>
                <div className="control">
                  {install.standalone || install.installed ? (
                    <span className="badge amber">installed</span>
                  ) : (
                    <button
                      className="btn sm"
                      onClick={async () => {
                        const result = await installApp();
                        pushToast(
                          result === 'accepted'
                            ? 'Pixelarium installed.'
                            : result === 'dismissed'
                              ? 'Install cancelled — you can try again from the browser menu.'
                              : 'Use your browser menu → Install Pixelarium, or Add to Home Screen on mobile.',
                          result === 'accepted' ? 'success' : 'info',
                        );
                      }}
                    >
                      <Icon name="install" size={13} /> Install app
                    </button>
                  )}
                </div>
              </div>
              <div className="settings-row">
                <div>
                  <div>Connection</div>
                  <div className="desc">
                    {install.online
                      ? 'Online. Once the app shell is cached, the editor keeps working with the network off.'
                      : 'Offline. The installed editor continues to save and open local projects.'}
                  </div>
                </div>
                <div className="control">
                  <span className={`badge${install.online ? '' : ' amber'}`}>{install.online ? 'online' : 'offline'}</span>
                </div>
              </div>
            </div>

            <div className="settings-group">
              <h3>Local data</h3>
              <div className="settings-row">
                <div>
                  <div>Storage usage</div>
                  <div className="desc">{usage} · {count ?? '—'} saved projects in this browser.</div>
                </div>
                <div className="control">
                  <button className="btn sm" onClick={exportEverything}>
                    <Icon name="download" size={13} /> Back up all
                  </button>
                </div>
              </div>
              <div className="settings-row">
                <div>
                  <div>Autosave</div>
                  <div className="desc">
                    Every edit schedules a save (debounced ~1s) plus a recovery draft. Save status is shown in the top bar.
                  </div>
                </div>
                <div className="control">
                  <button className="btn sm" onClick={() => void useEditor.getState().saveNow()}>
                    <Icon name="save" size={13} /> Save now
                  </button>
                </div>
              </div>
              <div className="settings-row">
                <div>
                  <div>Delete all local projects</div>
                  <div className="desc">
                    Permanently removes every project from this browser's IndexedDB, including “{doc.name}”. Export a
                    backup first — this cannot be undone.
                  </div>
                </div>
                <div className="control">
                  <button
                    className="btn sm danger"
                    onClick={async () => {
                      if (!window.confirm('Delete every local project? This cannot be undone.')) return;
                      const projects = await listStoredProjects();
                      for (const p of projects) await deleteStoredProject(p.id);
                      pushToast('All local projects deleted.', 'info');
                      setCount(0);
                    }}
                  >
                    <Icon name="trash" size={13} /> Delete all
                  </button>
                </div>
              </div>
            </div>

            <div className="settings-group">
              <h3>About</h3>
              <div className="settings-row">
                <div>
                  <div>Pixelarium</div>
                  <div className="desc">
                    Version 0.9.0 · local-first pixel studio · React 19, TypeScript, Vite, IndexedDB. The rendering
                    engine, GIF encoder and palette tooling are project code with unit tests.
                  </div>
                </div>
                <div className="control">
                  <button className="btn sm ghost" onClick={() => useUi.getState().setScreen('docs')}>
                    <Icon name="book" size={13} /> Manual
                  </button>
                </div>
              </div>
              <div className="settings-row">
                <div>
                  <div>Save to make this real</div>
                  <div className="desc">
                    Nothing is uploaded from this build. Cloud accounts, publishing and the community gallery require the
                    backend described in the roadmap; they are not simulated here.
                  </div>
                </div>
                <div className="control">
                  <span className="badge">local only</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
