import { useId, type ReactNode } from 'react';
import { useUi } from '../store/ui';

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange,
  format,
}: {
  label?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
  format?: (value: number) => string;
}) {
  const id = useId();
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="vstack" style={{ gap: 4 }}>
      {(label || format) && (
        <div className="row-between">
          {label && (
            <label htmlFor={id} className="label">
              {label}
            </label>
          )}
          <span className="value-readout" style={{ marginLeft: 'auto' }}>
            {format ? format(value) : value}
            {suffix}
          </span>
        </div>
      )}
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ ['--fill' as string]: `${pct}%` }}
      />
    </div>
  );
}

export function NumberField({
  label,
  value,
  min,
  max,
  onChange,
  suffix,
  step = 1,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  suffix?: string;
  step?: number;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <div className="hstack" style={{ gap: 4 }}>
        <input
          className="input mono"
          type="number"
          min={min}
          max={max}
          step={step}
          value={Math.round(value)}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v)) onChange(Math.max(min, Math.min(max, v)));
          }}
        />
        {suffix && <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{suffix}</span>}
      </div>
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="seg" role="group">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={value === o.value ? 'active' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toasts() {
  const toasts = useUi((s) => s.toasts);
  const dismiss = useUi((s) => s.dismissToast);
  if (toasts.length === 0) return null;
  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} onClick={() => dismiss(t.id)}>
          <span className="dot" />
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint && <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{hint}</span>}
    </div>
  );
}

/** Pointer-drag resize helper (horizontal/vertical). */
export function dragResize(
  e: React.PointerEvent,
  onMove: (delta: number) => void,
  axis: 'x' | 'y',
): void {
  e.preventDefault();
  const start = axis === 'x' ? e.clientX : e.clientY;
  const target = e.currentTarget as HTMLElement;
  target.classList.add(axis === 'x' ? 'dragging' : 'dragging');
  const move = (ev: PointerEvent) => onMove((axis === 'x' ? ev.clientX : ev.clientY) - start);
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    target.classList.remove('dragging');
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}
