import { useEffect, useRef } from 'react';
import { Icon } from '../components/Icon';
import { STUDIOS, type StudioEntry } from './registry';
import { examplesFor, type StudioExample } from './examples';

/**
 * The "What you can make" gallery.
 *
 * One strip per studio, three thumbnails each, all drawn by the real engines through
 * `examplesFor`. Clicking a thumbnail opens the studio - and starts the matching template when
 * the example has one, so a thumbnail opens the matching studio and template.
 */

interface StudioGalleryProps {
  onStartTemplate: (studio: StudioEntry, templateId: string) => void;
  onOpenWorkspace: (studio: StudioEntry) => void;
}

export function StudioGallery({ onStartTemplate, onOpenWorkspace }: StudioGalleryProps) {
  return (
    <section className="example-section">
      <header className="example-section-head">
        <span className="kicker">Examples</span>
        <h2>What you can make</h2>
        <p>
          Every thumbnail below is rendered by the same engine that powers the workspace — the walk cycle is
          the real walk cycle, the tilemap is composed by the tilemap exporter, the dither is the dither the
          lab produces. Click one to open it.
        </p>
      </header>

      {STUDIOS.map((studio) => (
        <div key={studio.id} className="example-group">
          <div className="example-group-head">
            <span className="studio-icon">
              <Icon name={studio.icon} size={15} />
            </span>
            <h3>{studio.name}</h3>
            <button className="example-open" onClick={() => onOpenWorkspace(studio)}>
              Open workspace
            </button>
          </div>
          <div className="example-grid">
            {examplesFor(studio.id).map((item) => (
              <ExampleCard
                key={item.id}
                example={item}
                onOpen={() => (item.templateId ? onStartTemplate(studio, item.templateId) : onOpenWorkspace(studio))}
              />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

function ExampleCard({ example, onOpen }: { example: StudioExample; onOpen: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = example.width;
    canvas.height = example.height;
    canvas
      .getContext('2d')
      ?.putImageData(new ImageData(new Uint8ClampedArray(example.pixels), example.width, example.height), 0, 0);
  }, [example]);

  return (
    <button className="example-card" onClick={onOpen} title={example.caption}>
      <span className="example-stage">
        <canvas ref={canvasRef} className="example-canvas" />
      </span>
      <span className="example-meta">
        <span className="example-title">{example.title}</span>
        <span className="example-caption">{example.caption}</span>
      </span>
    </button>
  );
}
