import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { Field } from './Controls';
import { Icon } from './Icon';
import { ExportDialog } from './ExportDialog';
import { ImportDialog } from './ImportDialog';
import { NineSliceDialog } from './NineSliceDialog';
import { BUILTIN_PALETTES } from '../engine/palettes';
import { createProject } from '../engine/document';
import {
  deleteStoredProject,
  listStoredProjects,
  loadRecoveryDraft,
  type ProjectSummary,
} from '../db/library';
import { openProjectFile, openRecovery, openStoredProject } from '../editor/projectActions';
import { useEditor } from '../store/project';
import { useUi } from '../store/ui';

const PRESETS = [
  { label: 'Icon', w: 16, h: 16 },
  { label: 'Sprite', w: 32, h: 32 },
  { label: 'Character', w: 64, h: 64 },
  { label: 'Artwork', w: 128, h: 128 },
  { label: 'Illustration', w: 256, h: 256 },
  { label: 'Scene', w: 320, h: 180 },
];

function NewProjectDialog() {
  const close = useUi((s) => s.closeDialog);
  const setScreen = useUi((s) => s.setScreen);
  const pushToast = useUi((s) => s.pushToast);
  const [name, setName] = useState('Untitled project');
  const [width, setWidth] = useState(64);
  const [height, setHeight] = useState(64);
  const [paletteId, setPaletteId] = useState(BUILTIN_PALETTES[0].id);

  const create = () => {
    const w = Math.max(1, Math.min(2048, Math.round(width)));
    const h = Math.max(1, Math.min(2048, Math.round(height)));
    const store = useEditor.getState();
    const doc = createProject({ width: w, height: h, name: name.trim() || 'Untitled project' });
    doc.activePaletteId = paletteId;
    store.loadDocument(doc);
    void store.saveNow();
    setScreen('editor');
    close();
    pushToast(`Created “${doc.name}”.`, 'success');
  };

  return (
    <Modal
      title="New project"
      subtitle="Canvas size can be changed later without losing artwork."
      onClose={close}
      footer={
        <>
          <button className="btn ghost" onClick={close}>
            Cancel
          </button>
          <button className="btn primary" onClick={create}>
            Create project
          </button>
        </>
      }
    >
      <Field label="Project name">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </Field>
      <div className="field">
        <label>Presets</label>
        <div className="preset-row">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              className="preset-chip"
              onClick={() => {
                setWidth(p.w);
                setHeight(p.h);
              }}
              type="button"
              style={width === p.w && height === p.h ? { borderColor: 'var(--amber-deep)' } : undefined}
            >
              <strong>
                {p.w}×{p.h}
              </strong>
              <span>{p.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="hstack" style={{ gap: 12 }}>
        <Field label="Width">
          <input
            className="input mono"
            type="number"
            min={1}
            max={2048}
            value={width}
            onChange={(e) => setWidth(Number(e.target.value) || 1)}
          />
        </Field>
        <Field label="Height">
          <input
            className="input mono"
            type="number"
            min={1}
            max={2048}
            value={height}
            onChange={(e) => setHeight(Number(e.target.value) || 1)}
          />
        </Field>
        <Field label="Palette">
          <select className="select" value={paletteId} onChange={(e) => setPaletteId(e.target.value)}>
            {BUILTIN_PALETTES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="empty-note" style={{ textAlign: 'left' }}>
        Every project starts with one transparent layer and one frame. Palettes are saved with the project, so switching
        later never loses the colors you used.
      </div>
    </Modal>
  );
}

function OpenProjectDialog() {
  const close = useUi((s) => s.closeDialog);
  const pushToast = useUi((s) => s.pushToast);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [recovery, setRecovery] = useState<{ name: string; savedAt: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const list = await listStoredProjects();
      setProjects(list);
      const draft = await loadRecoveryDraft();
      setRecovery(draft ? { name: draft.doc.name, savedAt: draft.savedAt } : null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <Modal
      title="Open project"
      subtitle="Projects are stored in this browser. Export .pxl files to move them between devices."
      onClose={close}
      wide
      footer={
        <>
          <button className="btn ghost" onClick={close}>
            Close
          </button>
          <button
            className="btn"
            onClick={() => {
              setImporting(true);
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = '.pxl,application/json';
              input.onchange = async () => {
                const file = input.files?.[0];
                if (file) {
                  const ok = await openProjectFile(file);
                  if (ok) close();
                }
                setImporting(false);
              };
              input.click();
            }}
            disabled={importing}
          >
            <Icon name="upload" size={13} /> Import .pxl
          </button>
        </>
      }
    >
      {recovery && (
        <div className="issue warning" style={{ cursor: 'default' }}>
          <span className="issue-kind">Recovered autosave</span>
          <strong>{recovery.name}</strong>
          <p>
            A draft was saved at {new Date(recovery.savedAt).toLocaleString()}. Recover it if Pixelarium closed before
            your last manual save.
          </p>
          <div style={{ marginTop: 6 }}>
            <button
              className="btn sm"
              onClick={async () => {
                const ok = await openRecovery();
                if (ok) close();
              }}
            >
              Recover draft
            </button>
          </div>
        </div>
      )}
      {loading ? (
        <div className="empty-note">Reading the local library…</div>
      ) : projects.length === 0 ? (
        <div className="empty-note">
          No saved projects yet. Create one, or open a demo from the library screen.
        </div>
      ) : (
        <div className="vstack" style={{ gap: 6 }}>
          {projects.map((p) => (
            <div
              key={p.id}
              className="issue"
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, cursor: 'default' }}
            >
              <div style={{ minWidth: 0 }}>
                <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</strong>
                <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
                  {p.width}×{p.height} · {p.frameCount} frames · {p.layerCount} layers · {new Date(p.updatedAt).toLocaleDateString()}
                </span>
              </div>
              <div className="hstack" style={{ gap: 4 }}>
                <button
                  className="btn sm"
                  onClick={async () => {
                    const ok = await openStoredProject(p.id);
                    if (ok) close();
                  }}
                >
                  Open
                </button>
                <button
                  className="iconbtn"
                  title="Delete project"
                  onClick={async () => {
                    if (!window.confirm(`Delete “${p.name}” permanently? This cannot be undone.`)) return;
                    await deleteStoredProject(p.id);
                    pushToast('Project deleted.', 'info');
                    void refresh();
                  }}
                >
                  <Icon name="trash" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

function CanvasSizeDialog() {
  const doc = useEditor((s) => s.doc);
  const close = useUi((s) => s.closeDialog);
  const resizeCanvas = useEditor((s) => s.resizeCanvas);
  const pushToast = useUi((s) => s.pushToast);
  const [width, setWidth] = useState(doc.width);
  const [height, setHeight] = useState(doc.height);
  const [anchor, setAnchor] = useState<'top-left' | 'center'>('center');

  return (
    <Modal
      title="Resize canvas"
      subtitle="Existing pixels are positioned from the anchor. Larger canvases add transparency."
      onClose={close}
      footer={
        <>
          <button className="btn ghost" onClick={close}>
            Cancel
          </button>
          <button
            className="btn primary"
            onClick={() => {
              resizeCanvas(width, height, anchor);
              close();
              pushToast(`Canvas resized to ${Math.round(width)}×${Math.round(height)}.`, 'success');
            }}
          >
            Resize canvas
          </button>
        </>
      }
    >
      <div className="hstack" style={{ gap: 12 }}>
        <Field label="Width">
          <input className="input mono" type="number" min={1} max={2048} value={width} onChange={(e) => setWidth(Number(e.target.value) || 1)} />
        </Field>
        <Field label="Height">
          <input className="input mono" type="number" min={1} max={2048} value={height} onChange={(e) => setHeight(Number(e.target.value) || 1)} />
        </Field>
        <Field label="Anchor">
          <select className="select" value={anchor} onChange={(e) => setAnchor(e.target.value as typeof anchor)}>
            <option value="center">Center</option>
            <option value="top-left">Top left</option>
          </select>
        </Field>
      </div>
      <div className="empty-note" style={{ textAlign: 'left' }}>
        Current size {doc.width}×{doc.height}. Undo restores the previous size and every layer.
      </div>
    </Modal>
  );
}

function RenameDialog() {
  const doc = useEditor((s) => s.doc);
  const close = useUi((s) => s.closeDialog);
  const setProjectName = useEditor((s) => s.setProjectName);
  const setProjectMeta = useEditor((s) => s.setProjectMeta);
  const [name, setName] = useState(doc.name);
  const [description, setDescription] = useState(doc.meta.description);
  const [author, setAuthor] = useState(doc.meta.author);
  const [tags, setTags] = useState(doc.meta.tags.join(', '));

  return (
    <Modal
      title="Project details"
      subtitle="Metadata travels with exported .pxl files and showcase pages."
      onClose={close}
      footer={
        <>
          <button className="btn ghost" onClick={close}>
            Cancel
          </button>
          <button
            className="btn primary"
            onClick={() => {
              if (name.trim()) setProjectName(name.trim());
              setProjectMeta({
                description,
                author,
                tags: tags
                  .split(',')
                  .map((t) => t.trim())
                  .filter(Boolean),
              });
              close();
            }}
          >
            Save details
          </button>
        </>
      }
    >
      <Field label="Name">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Description">
        <textarea className="input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <div className="hstack" style={{ gap: 12 }}>
        <Field label="Author">
          <input className="input" value={author} onChange={(e) => setAuthor(e.target.value)} />
        </Field>
        <Field label="Tags" hint="Comma separated">
          <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function TagsDialog() {
  const doc = useEditor((s) => s.doc);
  const close = useUi((s) => s.closeDialog);
  const addTag = useEditor((s) => s.addTag);
  const removeTag = useEditor((s) => s.removeTag);
  const [name, setName] = useState('walk');
  const [from, setFrom] = useState(0);
  const [to, setTo] = useState(Math.max(0, doc.frames.length - 1));
  const [mode, setMode] = useState<'forward' | 'reverse' | 'pingpong'>('forward');

  return (
    <Modal
      title="Animation tags"
      subtitle="Tags name frame ranges so exporters and game engines can address them."
      onClose={close}
      footer={
        <button className="btn ghost" onClick={close}>
          Close
        </button>
      }
    >
      {doc.tags.length === 0 ? (
        <div className="empty-note">No tags yet. Create a range like “idle” or “walk” below.</div>
      ) : (
        <div className="vstack" style={{ gap: 6 }}>
          {doc.tags.map((t) => (
            <div key={t.id} className="tag-row">
              <Icon name="tag" size={13} />
              <strong>{t.name}</strong>
              <span className="mono" style={{ color: 'var(--text-muted)' }}>
                frames {t.from + 1}–{t.to + 1} · {t.mode}
              </span>
              <div className="spacer" />
              <button className="iconbtn" onClick={() => removeTag(t.id)} title="Delete tag">
                <Icon name="trash" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="divider" />
      <div className="hstack" style={{ gap: 10, flexWrap: 'wrap' }}>
        <Field label="Name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} style={{ width: 130 }} />
        </Field>
        <Field label="From">
          <input
            className="input mono"
            type="number"
            min={1}
            max={doc.frames.length}
            value={from + 1}
            onChange={(e) => setFrom(Math.max(0, Math.min(doc.frames.length - 1, Number(e.target.value) - 1)))}
            style={{ width: 76 }}
          />
        </Field>
        <Field label="To">
          <input
            className="input mono"
            type="number"
            min={1}
            max={doc.frames.length}
            value={to + 1}
            onChange={(e) => setTo(Math.max(0, Math.min(doc.frames.length - 1, Number(e.target.value) - 1)))}
            style={{ width: 76 }}
          />
        </Field>
        <Field label="Direction">
          <select className="select" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} style={{ width: 128 }}>
            <option value="forward">Forward</option>
            <option value="reverse">Reverse</option>
            <option value="pingpong">Ping-pong</option>
          </select>
        </Field>
        <div style={{ alignSelf: 'flex-end' }}>
          <button
            className="btn"
            onClick={() => {
              if (!name.trim()) return;
              const lo = Math.min(from, to);
              const hi = Math.max(from, to);
              addTag({ name: name.trim(), from: lo, to: hi, mode });
              setName('walk');
            }}
          >
            <Icon name="plus" size={13} /> Add tag
          </button>
        </div>
      </div>
    </Modal>
  );
}

const SHORTCUTS: { group: string; items: [string, string][] }[] = [
  {
    group: 'Tools',
    items: [
      ['Pencil / Eraser', 'B / E'],
      ['Line / Rectangle / Ellipse', 'L / R / O'],
      ['Filled rectangle / ellipse', 'Shift + R / Shift + E'],
      ['Bucket / Gradient', 'G / Shift + G'],
      ['Dither / Spray', 'D / A'],
      ['Eyedropper', 'I'],
      ['Select / Lasso / Move', 'M / Q / V'],
      ['Text', 'T'],
      ['Swap colors', 'X'],
      ['Brush size', '[ ]'],
    ],
  },
  {
    group: 'Canvas & view',
    items: [
      ['Zoom in / out', '+ / −'],
      ['Fit canvas', '0'],
      ['Pan', 'Space + drag'],
      ['Toggle grid', "'"],
      ['Toggle onion skin', 'Shift + O'],
      ['Zoom with wheel', 'Wheel'],
      ['Pixel grid', 'Settings → Canvas'],
      ['First / last frame', 'Home / End'],
    ],
  },
  {
    group: 'Selection & history',
    items: [
      ['Undo / Redo', 'Ctrl + Z / Ctrl + Shift + Z'],
      ['Select all / Deselect', 'Ctrl + A / Ctrl + D'],
      ['Copy / Cut / Paste', 'Ctrl + C / Ctrl + X / Ctrl + V'],
      ['Delete selection contents', 'Delete'],
      ['Clear selection', 'Escape'],
    ],
  },
  {
    group: 'Frames',
    items: [
      ['New frame', 'Ctrl + Alt + N'],
      ['Duplicate frame', 'Ctrl + Alt + D'],
      ['Delete frame', 'Ctrl + Alt + Backspace'],
      ['Move frame left / right', 'Ctrl + Alt + ← / →'],
      ['Play / pause', 'Enter'],
      ['Previous / next frame', ', / .'],
      ['First / last frame', 'Home / End'],
    ],
  },
  {
    group: 'Layers',
    items: [
      ['New layer', 'Ctrl + Shift + N'],
      ['Duplicate layer', 'Ctrl + Shift + D'],
      ['Select layer below / above', 'Alt + [ / Alt + ]'],
      ['Show or hide active layer', 'Alt + H'],
    ],
  },
  {
    group: 'Project',
    items: [
      ['Save locally', 'Ctrl + S'],
      ['Export project file', 'Ctrl + Shift + S'],
      ['Export dialog', 'Ctrl + E'],
      ['New project', 'Ctrl + N'],
      ['Open project', 'Ctrl + O'],
      ['Shortcut reference', '?'],
    ],
  },
];

function ShortcutsDialog() {
  const close = useUi((s) => s.closeDialog);
  return (
    <Modal title="Keyboard shortcuts" subtitle="Press ? anywhere in the editor. Shortcuts ignore text fields and open dialogs." onClose={close} wide>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22 }}>
        {SHORTCUTS.map((section) => (
          <div key={section.group}>
            <div className="kicker" style={{ marginBottom: 6 }}>
              {section.group}
            </div>
            {section.items.map(([label, keys]) => (
              <div className="shortcut-row" key={label}>
                <span>{label}</span>
                <kbd>{keys}</kbd>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Modal>
  );
}

function AboutDialog() {
  const doc = useEditor((s) => s.doc);
  const close = useUi((s) => s.closeDialog);
  const setScreen = useUi((s) => s.setScreen);
  const setDialog = useUi((s) => s.openDialog);
  return (
    <Modal
      title="About this project"
      subtitle="Native project format and local storage details."
      onClose={close}
      footer={
        <button className="btn ghost" onClick={close}>
          Close
        </button>
      }
    >
      <div className="stat-grid">
        <div className="stat">
          <div className="k">Canvas</div>
          <div className="v">
            {doc.width}×{doc.height}
          </div>
        </div>
        <div className="stat">
          <div className="k">Layers / frames</div>
          <div className="v">
            {doc.layers.length} / {doc.frames.length}
          </div>
        </div>
        <div className="stat">
          <div className="k">Created</div>
          <div className="v" style={{ fontSize: 11 }}>
            {new Date(doc.meta.createdAt).toLocaleDateString()}
          </div>
        </div>
        <div className="stat">
          <div className="k">Modified</div>
          <div className="v" style={{ fontSize: 11 }}>
            {new Date(doc.meta.updatedAt).toLocaleString()}
          </div>
        </div>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7 }}>
        Pixelarium stores this project in IndexedDB under this browser profile. Nothing is uploaded. Use{' '}
        <strong>File → Export project file</strong> to create a portable <code>.pxl</code> file, and drag it back in via{' '}
        <strong>Open</strong>. The format is documented in the repository under <code>docs/PROJECT_FORMAT.md</code>.
      </p>
      <div className="hstack">
        <button className="btn sm" onClick={() => setDialog('export')}>
          Export options
        </button>
        <button className="btn sm ghost" onClick={() => setScreen('docs')}>
          Open the manual
        </button>
      </div>
    </Modal>
  );
}

function OnboardingDialog() {
  const close = useUi((s) => s.closeDialog);
  const setScreen = useUi((s) => s.setScreen);
  const [step, setStep] = useState(0);
  useEffect(() => {
    localStorage.setItem('pixelarium.onboarded', '1');
  }, []);
  const steps = [
    {
      title: 'A studio, not just a canvas',
      body: 'Pixelarium pairs a real pixel engine with animation, palettes and export tools. Everything is local-first: no account, no upload, no waiting.',
    },
    {
      title: 'Draw, then animate',
      body: 'Use the tool rail on the left, the color and layer panels on the right, and the timeline below. Every frame holds one cel per layer, so a leaf can rustle while the tree stays still.',
    },
    {
      title: 'Make it shareable',
      body: 'Export PNG, sprite sheets, GIFs or portable .pxl project files. The showcase page presents your work with palette identity and frame details.',
    },
  ];
  return (
    <Modal
      title="Welcome to Pixelarium"
      subtitle="Every pixel has a story."
      onClose={close}
      footer={
        <>
          <button className="btn ghost" onClick={close}>
            Skip
          </button>
          {step < steps.length - 1 ? (
            <button className="btn primary" onClick={() => setStep(step + 1)}>
              Continue
            </button>
          ) : (
            <button
              className="btn primary"
              onClick={() => {
                close();
                setScreen('home');
              }}
            >
              Start creating
            </button>
          )}
        </>
      }
    >
      <div className="kicker">Step {step + 1} of {steps.length}</div>
      <h3 className="display" style={{ fontSize: 23 }}>
        {steps[step].title}
      </h3>
      <p style={{ fontSize: 12.5, color: 'var(--text-dim)', lineHeight: 1.7 }}>{steps[step].body}</p>
      <div className="hstack" style={{ gap: 6 }}>
        {steps.map((_, i) => (
          <span
            key={i}
            style={{
              width: i === step ? 20 : 6,
              height: 6,
              borderRadius: 3,
              background: i === step ? 'var(--amber)' : 'var(--ink-5)',
              transition: 'width 0.2s ease',
            }}
          />
        ))}
      </div>
    </Modal>
  );
}

export function Dialogs() {
  const dialog = useUi((s) => s.dialog);
  switch (dialog) {
    case 'new-project':
      return <NewProjectDialog />;
    case 'open-project':
      return <OpenProjectDialog />;
    case 'export':
      return <ExportDialog />;
    case 'import-image':
      return <ImportDialog />;
    case 'canvas-size':
      return <CanvasSizeDialog />;
    case 'rename':
      return <RenameDialog />;
    case 'tags':
      return <TagsDialog />;
    case 'nine-slice':
      return <NineSliceDialog />;
    case 'shortcuts':
      return <ShortcutsDialog />;
    case 'about':
      return <AboutDialog />;
    case 'onboarding':
      return <OnboardingDialog />;
    default:
      return null;
  }
}
