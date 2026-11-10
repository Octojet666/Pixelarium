import { BrandMark, Icon } from '../components/Icon';
import { useEditor } from '../store/project';
import { useUi, type Screen } from '../store/ui';

const LINKS: { id: Screen; label: string }[] = [
  { id: 'home', label: 'Library' },
  { id: 'studios', label: 'Studios' },
  { id: 'palettes', label: 'Palettes' },
  { id: 'playground', label: 'Playground' },
  { id: 'tileset', label: 'Tileset' },
  { id: 'showcase', label: 'Showcase' },
  { id: 'docs', label: 'Manual' },
];

export function PageNav({ compact = false }: { compact?: boolean }) {
  const screen = useUi((s) => s.screen);
  const setScreen = useUi((s) => s.setScreen);
  const openDialog = useUi((s) => s.openDialog);
  const docName = useEditor((s) => s.doc.name);

  return (
    <div className="page-nav">
      <button className="hstack" style={{ gap: 9, padding: '0 6px', cursor: 'pointer' }} onClick={() => setScreen('home')}>
        <BrandMark size={28} />
        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.05 }}>
          <span className="display" style={{ fontSize: 18, letterSpacing: '-0.02em' }}>
            Pixelarium
          </span>
          <span style={{ fontSize: 8.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            pixel studio
          </span>
        </span>
      </button>
      {!compact && (
        <div className="nav-links">
          {LINKS.map((l) => (
            <button key={l.id} className={screen === l.id ? 'active' : ''} onClick={() => setScreen(l.id)}>
              {l.label}
            </button>
          ))}
        </div>
      )}
      <div className="spacer" />
      <div className="hstack" style={{ gap: 8 }}>
        <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-muted)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {docName}
        </span>
        <button className="btn sm" onClick={() => setScreen('editor')}>
          <Icon name="pencil" size={13} /> Editor
        </button>
        <button className="btn primary sm" onClick={() => openDialog('new-project')}>
          <Icon name="plus" size={13} /> New
        </button>
      </div>
    </div>
  );
}
