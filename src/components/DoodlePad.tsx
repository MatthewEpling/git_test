import { useRef, useState } from 'react';
import type { Stroke } from '../types';
import { DOODLE_COLORS } from '../lib/content';
import { strokePath } from './Doodle';

interface Props {
  strokes: Stroke[];
  onChange: (strokes: Stroke[]) => void;
}

const COLOR_NAMES = ['Ink brown', 'Brick red', 'Moss green', 'River blue', 'Honey gold', 'Plum'];

const WIDTHS = [
  { w: 2.5, label: 'Thin pen' },
  { w: 5, label: 'Thick brush' },
];

export function DoodlePad({ strokes, onChange }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [color, setColor] = useState(DOODLE_COLORS[0]);
  const [width, setWidth] = useState(WIDTHS[0].w);
  const [current, setCurrent] = useState<Stroke | null>(null);

  function toPoint(e: React.PointerEvent): [number, number] {
    const rect = svgRef.current!.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    const clamp = (n: number) => Math.round(Math.min(100, Math.max(0, n)) * 10) / 10;
    return [clamp(x), clamp(y)];
  }

  function down(e: React.PointerEvent<SVGSVGElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    const [x, y] = toPoint(e);
    setCurrent({ color, width, points: [x, y] });
  }

  function move(e: React.PointerEvent) {
    if (!current) return;
    const [x, y] = toPoint(e);
    const pts = current.points;
    const dx = x - pts[pts.length - 2];
    const dy = y - pts[pts.length - 1];
    if (dx * dx + dy * dy < 1.5) return;
    setCurrent({ ...current, points: [...pts, x, y] });
  }

  function up() {
    if (!current) return;
    if (strokes.length < 200) onChange([...strokes, current]);
    setCurrent(null);
  }

  return (
    <div className="doodle-pad">
      <svg
        ref={svgRef}
        viewBox="0 0 100 100"
        className="doodle-canvas"
        role="img"
        aria-label="Drawing area. Draw with your finger, pen or mouse."
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      >
        {[...strokes, ...(current ? [current] : [])].map((s, i) => (
          <path key={i} d={strokePath(s.points)} fill="none" stroke={s.color} strokeWidth={s.width} strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {strokes.length === 0 && !current && (
          <text x="50" y="52" textAnchor="middle" className="doodle-hint">
            draw here ✎
          </text>
        )}
      </svg>
      <div className="doodle-tools">
        <div className="swatches" role="radiogroup" aria-label="Ink color">
          {DOODLE_COLORS.map((c, i) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={color === c}
              aria-label={COLOR_NAMES[i] ?? c}
              className="swatch"
              style={{ background: c }}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
        <div className="row gap-s">
          {WIDTHS.map((o) => (
            <button
              key={o.w}
              type="button"
              className={`chip ${width === o.w ? 'is-on' : ''}`}
              aria-pressed={width === o.w}
              onClick={() => setWidth(o.w)}
            >
              <span className="brush-dot" style={{ width: o.w * 2.4, height: o.w * 2.4 }} aria-hidden="true" />
              {o.label}
            </button>
          ))}
          <button type="button" className="chip" onClick={() => onChange(strokes.slice(0, -1))} disabled={!strokes.length}>
            ↶ Undo
          </button>
          <button type="button" className="chip" onClick={() => onChange([])} disabled={!strokes.length}>
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}
