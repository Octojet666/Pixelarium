import { Icon } from '../components/Icon';
import { PageNav } from './PageNav';
import { SLOT_PX, emptyLayout, sampleLayout } from '../engine/mcGui';
import type { ProjectDoc } from '../types';
import { STUDIOS, type StudioEntry } from '../studios/registry';
import { StudioGallery } from '../studios/StudioExamples';
import type { TemplateDefinition } from '../engine/templates';
import { useEditor } from '../store/project';
import { useUi } from '../store/ui';

/**
 * The studio directory.
 *
 * Every card here starts something real: a template opens a document with starter art and switches to
 * the workspace that belongs to it, and the workspaces without templates open their existing screen.
 */

export function Studios() {
  const setScreen = useUi((s) => s.setScreen);
  const setPackMode = useUi((s) => s.setPackMode);
  const setOnion = useUi((s) => s.setOnion);
  const pushToast = useUi((s) => s.pushToast);
  const loadDocument = useEditor((s) => s.loadDocument);

  const start = (studio: StudioEntry, template: TemplateDefinition) => {
    const doc: ProjectDoc = template.build();

    // The GUI studio reads its layout from the project, so a fresh menu needs one.
    if (studio.id === 'gui') {
      const rows = Math.max(1, Math.min(6, Math.round((doc.height - 2) / SLOT_PX)));
      doc.gui = { ...emptyLayout({ rows, name: doc.name }), ...sampleLayout(), rows, name: doc.name };
    }
    if (studio.id === 'animation') {
      setOnion({ enabled: true, previous: 1, next: 1, opacity: 0.4 });
    }
    if (studio.id === 'game') setPackMode('game');
    if (studio.id === 'icons') setPackMode('icons');

    loadDocument(doc);
    setScreen(studio.surface);
    pushToast(`${template.name} ready — ${template.size}.`, 'success');
  };

  return (
    <div className="page-shell">
      <div className="page-inner">
        <PageNav />

        <section className="studios-head">
          <span className="kicker">Workspaces</span>
          <h1>
            One studio.
            <br />
            Multiple creative <em>disciplines</em>.
          </h1>
          <p>
            Every workspace shares the same engine — the pixel-perfect tools, layers, undo history, palettes,
            templates and local storage. Pick the one that matches what you are making; your project moves
            between them.
          </p>
        </section>

        <div className="studio-grid">
          {STUDIOS.map((studio) => (
            <article key={studio.id} className="studio-card">
              <header className="studio-card-head">
                <span className="studio-icon">
                  <Icon name={studio.icon} size={18} />
                </span>
                <div>
                  <h2>{studio.name}</h2>
                  <span className="studio-tagline">{studio.tagline}</span>
                </div>
              </header>

              <p className="studio-blurb">{studio.blurb}</p>

              <div className="studio-chips">
                {studio.capabilities.map((capability) => (
                  <span key={capability} className="studio-chip">
                    {capability}
                  </span>
                ))}
              </div>

              <div className="studio-actions">
                {studio.templates.map((template) => (
                  <button
                    key={template.id}
                    className="studio-template"
                    onClick={() => start(studio, template)}
                    title={template.blurb}
                  >
                    <span className="tpl-name">{template.name}</span>
                    <span className="tpl-size">{template.size}</span>
                  </button>
                ))}
                <button className="btn sm ghost" onClick={() => setScreen(studio.surface)}>
                  <Icon name="arrow-left" size={12} style={{ transform: 'rotate(180deg)' }} />
                  Open workspace
                </button>
              </div>

              {studio.note && <p className="studio-note">{studio.note}</p>}
            </article>
          ))}
        </div>

        <StudioGallery
          onStartTemplate={(studio, templateId) => {
            const template = studio.templates.find((entry) => entry.id === templateId);
            if (template) start(studio, template);
          }}
          onOpenWorkspace={(studio) => setScreen(studio.surface)}
        />
      </div>
    </div>
  );
}
