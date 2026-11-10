import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../components/Icon';
import { ProjectLoop } from '../components/PixelCanvas';
import { HeroScene } from '../components/HeroScene';
import { PageNav } from './PageNav';
import { createDemoProjects, createProject } from '../engine/document';
import { BUILTIN_PALETTES } from '../engine/palettes';
import { deleteStoredProject, listStoredProjects, loadStoredProject, type ProjectSummary } from '../db/library';
import { duplicateStoredProject, openDemoProject, openStoredProject } from '../editor/projectActions';
import { openProjectInNewTab } from '../lib/session';
import { deserializeProject, serializeProject } from '../engine/serialize';
import { useEditor } from '../store/project';
import { useUi } from '../store/ui';
import { useInstallState } from '../lib/useInstall';
import { installApp } from '../lib/pwa';
import type { ProjectDoc } from '../types';

let demoCache: ProjectDoc[] | null = null;
function getDemos(): ProjectDoc[] {
  if (!demoCache) demoCache = createDemoProjects();
  return demoCache;
}

const SIZES = [
  { label: 'Icon', w: 16, h: 16 },
  { label: 'Sprite', w: 32, h: 32 },
  { label: 'Character', w: 64, h: 64 },
  { label: 'Artwork', w: 128, h: 128 },
  { label: 'Illustration', w: 256, h: 256 },
  { label: 'Wide scene', w: 320, h: 180 },
];

function ProjectCard({
  summary,
  onDelete,
  onDuplicate,
  onOpenInTab,
}: {
  summary: ProjectSummary;
  onDelete: () => void;
  onDuplicate: () => void;
  onOpenInTab: () => void;
}) {
  return (
    <div
      className="project-card"
      role="button"
      tabIndex={0}
      onClick={() => void openStoredProject(summary.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          void openStoredProject(summary.id);
        }
      }}
    >
      <div className="project-thumb">
        {summary.thumbnail ? (
          <img src={summary.thumbnail} alt="" />
        ) : (
          <span className="blank">{summary.width} × {summary.height}</span>
        )}
        {summary.updatedAt > Date.now() - 1000 * 60 * 60 * 24 && <span className="draft-flag">recent</span>}
      </div>
      <div className="card-actions">
        <button
          className="iconbtn"
          onClick={(e) => {
            e.stopPropagation();
            onOpenInTab();
          }}
          title="Open in a new tab"
        >
          <Icon name="external" />
        </button>
        <button
          className="iconbtn"
          onClick={(e) => {
            e.stopPropagation();
            onDuplicate();
          }}
          title="Duplicate project"
        >
          <Icon name="copy" />
        </button>
        <button
          className="iconbtn"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          title="Delete project"
        >
          <Icon name="trash" />
        </button>
      </div>
      <div className="project-card-body">
        <span className="name">{summary.name}</span>
        <span className="meta">
          <span>
            {summary.width}×{summary.height}
          </span>
          <span>{summary.frameCount}f</span>
          <span>{summary.layerCount}l</span>
          <span style={{ marginLeft: 'auto' }}>{new Date(summary.updatedAt).toLocaleDateString()}</span>
        </span>
      </div>
    </div>
  );
}

function DemoCard({ doc }: { doc: ProjectDoc }) {
  return (
    <button
      className="project-card"
      onClick={() => {
        void openDemoProject(deserializeProject(serializeProject(doc)));
      }}
    >
      <div className="project-thumb" style={{ background: '#0a0a10' }}>
        <ProjectLoop doc={doc} scale={3} />
        <span className="draft-flag" style={{ background: 'rgba(176,108,255,0.16)', borderColor: 'rgba(176,108,255,0.4)', color: '#d4b9ff' }}>
          demo
        </span>
      </div>
      <div className="project-card-body">
        <span className="name">{doc.name}</span>
        <span className="meta">
          <span>
            {doc.width}×{doc.height}
          </span>
          <span>{doc.frames.length} frames</span>
          <span style={{ marginLeft: 'auto' }}>{doc.layers.length} layers</span>
        </span>
      </div>
    </button>
  );
}

export function Home() {
  const setScreen = useUi((s) => s.setScreen);
  const openDialog = useUi((s) => s.openDialog);
  const setOpeningOpen = useUi((s) => s.setOpeningOpen);
  const pushToast = useUi((s) => s.pushToast);
  const install = useInstallState();
  const loadDocument = useEditor((s) => s.loadDocument);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const demos = useMemo(() => getDemos(), []);

  const refresh = async () => {
    try {
      setProjects(await listStoredProjects());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const startPreset = (w: number, h: number) => {
    const doc = createProject({ width: w, height: h, name: `Untitled ${w}×${h}` });
    loadDocument(doc);
    setScreen('editor');
    pushToast(`New ${w}×${h} canvas ready.`, 'success');
  };

  return (
    <div className="page-shell">
      <div className="page-inner">
        <PageNav />
        <section className="home-hero">
          <div className="hero-copy">
            <span className="kicker">Pixel-art studio · local-first · open source</span>
            <h1>
              Every pixel
              <br />
              has a <em>story</em>.
            </h1>
            <p>
              A complete studio for sprites, scenes and animation. Draw on a real pixel engine, animate with onion skin,
              build palettes with character, and export game-ready assets — all in your browser, with or without an
              account.
            </p>
            <div className="hero-actions">
              <button className="btn primary" onClick={() => openDialog('new-project')}>
                <Icon name="plus" size={14} /> New project
              </button>
              <button className="btn" onClick={() => openDialog('open-project')}>
                <Icon name="folder" size={14} /> Open
              </button>
              <button className="btn ghost" onClick={() => void openDemoProject(deserializeProject(serializeProject(demos[0])))}>
                <Icon name="sparkles" size={14} /> Open the demo
              </button>
              {install.canInstall && (
                <button
                  className="btn ghost"
                  onClick={async () => {
                    const result = await installApp();
                    if (result === 'accepted') pushToast('Pixelarium installed — open it any time from your app list.', 'success');
                  }}
                  title="Install Pixelarium as an app"
                >
                  <Icon name="install" size={14} /> Install app
                </button>
              )}
            </div>
            <div className="hero-note">
              <span className="dot" />
              Works offline in the browser or as an installed app · autosaves locally · exports .pxl, PNG, GIF and sprite sheets
            </div>
          </div>
          <div className="hero-art">
            <HeroScene />
            <div className="art-label">
              <span className="sw" />
              Dusk Peaks · live scene · 64×64
            </div>
          </div>
        </section>

        <section className="home-two-col">
          <div>
            <div className="section-title">
              <h2>Your projects</h2>
              <span>{loading ? 'Reading local storage…' : `${projects.length} saved locally`}</span>
            </div>
            <div className="project-grid">
              {projects.map((p) => (
                <ProjectCard
                  key={p.id}
                  summary={p}
                  onDelete={async () => {
                    if (!window.confirm(`Delete “${p.name}”? This cannot be undone.`)) return;
                    await deleteStoredProject(p.id);
                    pushToast('Project deleted.', 'info');
                    void refresh();
                  }}
                  onDuplicate={async () => {
                    const doc = await loadStoredProject(p.id);
                    if (doc) await duplicateStoredProject(doc);
                    void refresh();
                  }}
                  onOpenInTab={() => openProjectInNewTab(p.id)}
                />
              ))}
              <button className="new-project-tile" onClick={() => openDialog('new-project')}>
                <span className="plus">+</span>
                <span style={{ fontSize: 12.5 }}>New project</span>
                <span style={{ fontSize: 10.5 }}>from a preset or custom size</span>
              </button>
            </div>

            <div className="section-title" style={{ marginTop: 28 }}>
              <h2>Start from a size</h2>
              <span>one click to a fresh canvas</span>
            </div>
            <div className="preset-row">
              {SIZES.map((s) => (
                <button key={s.label} className="preset-chip" onClick={() => startPreset(s.w, s.h)}>
                  <strong>
                    {s.w}×{s.h}
                  </strong>
                  <span>{s.label}</span>
                </button>
              ))}
            </div>

            <div className="section-title" style={{ marginTop: 30 }}>
              <h2>Demo artwork</h2>
              <span>made with the tools in this studio</span>
            </div>
            <div className="project-grid">
              {demos.map((doc) => (
                <DemoCard key={doc.id} doc={doc} />
              ))}
              <div className="project-card" style={{ cursor: 'default' }}>
                <div className="project-thumb" style={{ padding: 18 }}>
                  <div style={{ textAlign: 'left', width: '100%' }}>
                    <div className="kicker" style={{ marginBottom: 6 }}>
                      How they were made
                    </div>
                    <p style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                      Both demos are authored from layered geometry and the procedural generators, then exported through
                      the same PNG and GIF pipeline you use. Open one, change a palette, and it becomes yours.
                    </p>
                  </div>
                </div>
                <div className="project-card-body">
                  <span className="name">Editable by design</span>
                  <span className="meta">no flat images anywhere</span>
                </div>
              </div>
            </div>
          </div>

          <aside className="vstack" style={{ gap: 14 }}>
            <div className="home-side-card">
              <h3>Where to go next</h3>
              <button className="btn ghost" style={{ justifyContent: 'flex-start' }} onClick={() => setOpeningOpen(true)}>
                <Icon name="film" size={14} /> Watch the opening
              </button>
              <button className="btn ghost" style={{ justifyContent: 'flex-start' }} onClick={() => setScreen('playground')}>
                <Icon name="sparkles" size={14} /> Procedural playground
              </button>
              <button className="btn ghost" style={{ justifyContent: 'flex-start' }} onClick={() => setScreen('tileset')}>
                <Icon name="grid-map" size={14} /> Tileset & tilemap studio
              </button>
              <button className="btn ghost" style={{ justifyContent: 'flex-start' }} onClick={() => setScreen('palettes')}>
                <Icon name="palette" size={14} /> Palette library
              </button>
              <button className="btn ghost" style={{ justifyContent: 'flex-start' }} onClick={() => setScreen('showcase')}>
                <Icon name="share" size={14} /> Showcase page
              </button>
              <button className="btn ghost" style={{ justifyContent: 'flex-start' }} onClick={() => setScreen('docs')}>
                <Icon name="book" size={14} /> Studio manual
              </button>
            </div>
            <div className="home-side-card">
              <h3>Local-first, honestly</h3>
              <div className="stat-line">
                <span>Storage</span>
                <b>IndexedDB</b>
              </div>
              <div className="stat-line">
                <span>Account required</span>
                <b>Never</b>
              </div>
              <div className="stat-line">
                <span>Project format</span>
                <b>.pxl</b>
              </div>
              <div className="stat-line">
                <span>Exports</span>
                <b>PNG · GIF · JSON</b>
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                Projects never leave this browser unless you export them. Sharing and community publishing are planned
                on top of an optional account — the editor will keep working without one.
              </p>
            </div>
          </aside>
        </section>

        <div className="palette-marquee" aria-label="Built-in palettes">
          {BUILTIN_PALETTES.slice(0, 7).map((p) => (
            <div key={p.id} className="mini-palette" title={p.name}>
              {p.colors.slice(0, 8).map((c) => (
                <span key={c} style={{ background: c }} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

