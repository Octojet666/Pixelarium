import { TOOLS } from './tools';
import { Icon } from '../components/Icon';
import { useEditor } from '../store/project';
import { useUi } from '../store/ui';

export function ToolRail() {
  const tool = useEditor((s) => s.tool);
  const setTool = useEditor((s) => s.setTool);
  const primary = useEditor((s) => s.doc.primary);
  const secondary = useEditor((s) => s.doc.secondary);
  const swapColors = useEditor((s) => s.swapColors);
  const setRightTab = useUi((s) => s.set);

  let lastGroup = -1;

  return (
    <div className="tool-rail" role="toolbar" aria-label="Drawing tools">
      {TOOLS.map((t) => {
        const sep = lastGroup !== -1 && t.group !== lastGroup;
        lastGroup = t.group;
        return (
          <div key={t.id} style={{ display: 'contents' }}>
            {sep && <div className="tool-sep" />}
            <button
              className={`tool-btn${tool === t.id ? ' active' : ''}`}
              onClick={() => setTool(t.id)}
              title={`${t.label}${t.shortcut ? ` (${t.shortcut})` : ''} — ${t.hint}`}
              aria-label={t.label}
              aria-pressed={tool === t.id}
            >
              <Icon name={t.icon} />
              {t.shortcut && <span className="kbd-hint">{t.shortcut}</span>}
            </button>
          </div>
        );
      })}
      <div className="rail-colors">
        <div className="rail-swatches">
          <button
            className="primary"
            style={{ background: primary }}
            title={`Primary color ${primary} — click to open the color panel`}
            onClick={() => setRightTab({ rightTab: 'color' })}
            aria-label="Primary color"
          />
          <button
            className="secondary"
            style={{ background: secondary }}
            title={`Secondary color ${secondary} — right-click to paint with it`}
            onClick={() => setRightTab({ rightTab: 'color' })}
            aria-label="Secondary color"
          />
        </div>
        <button className="swap-btn" onClick={swapColors} title="Swap colors (X)" aria-label="Swap colors">
          <Icon name="swap" size={14} />
        </button>
      </div>
    </div>
  );
}
