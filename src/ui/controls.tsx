// Small form controls shared by the settings screens.
import type { ReactNode } from 'react';

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="switch">
      <input type="checkbox" role="switch" checked={checked} aria-label={label} onChange={(e) => onChange(e.target.checked)} />
      <span />
    </label>
  );
}

export function SettingRow({ label, hint, children, htmlFor }: { label: string; hint?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="setting">
      <div>
        <label className="label" htmlFor={htmlFor}>
          {label}
        </label>
        {hint && <div className="hint">{hint}</div>}
      </div>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        {children}
      </div>
    </div>
  );
}

export function Slider(props: { id?: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format?: (v: number) => string; label: string }) {
  return (
    <div className="row" style={{ width: '100%' }}>
      <input
        id={props.id}
        type="range"
        aria-label={props.label}
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
      <span className="mono small" style={{ minWidth: 48, textAlign: 'right' }}>
        {props.format ? props.format(props.value) : props.value}
      </span>
    </div>
  );
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(n < 10 * 1024 ** 2 ? 1 : 0)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}
