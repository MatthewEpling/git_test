import { useEffect, useRef, useState } from 'react';
import type { Board3D } from '../render/board3d';
import type { BoardView } from '../render/view';

export function Board({ view, mode, onPick, onFallback }: { view: BoardView; mode: '3d' | '2d'; onPick: (id: string) => void; onFallback: (reason: string) => void }) {
  return mode === '3d' ? <Board3DView view={view} onPick={onPick} onFallback={onFallback} /> : <Board2D view={view} onPick={onPick} />;
}

function Board3DView({ view, onPick, onFallback }: { view: BoardView; onPick: (id: string) => void; onFallback: (reason: string) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const board = useRef<Board3D | null>(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  const [hover, setHover] = useState<string | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let disposed = false;
    // three.js is loaded only when a showdown is first shown in 3D.
    import('../render/board3d')
      .then(({ Board3D }) => {
        if (disposed) return;
        try {
          board.current = new Board3D(host.current!, (id) => pickRef.current(id), setHover, onFallback);
          board.current.update(viewRef.current);
        } catch (e) {
          onFallback(`3D view couldn't start: ${(e as Error).message}.`);
        }
        setLoading(false);
      })
      .catch((e) => onFallback(`The 3D view failed to load (${(e as Error).message}).`));
    return () => {
      disposed = true;
      board.current?.dispose();
      board.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    board.current?.update(view);
  }, [view]);
  return (
    <div className="board3d" ref={host}>
      <div className="board-hud">
        {loading && <span className="hint">Loading the 3D table…</span>}
        {view.hint && <span className="hint">{view.hint}</span>}
        {hover && <span className="hover">{hover}</span>}
        <button className="small" onClick={() => board.current?.resetView()}>
          Reset camera
        </button>
      </div>
      <div className="board-help" aria-hidden>
        Drag to orbit · right-drag or shift-drag to pan · scroll to zoom
      </div>
    </div>
  );
}

export function Board2D({ view, onPick }: { view: BoardView; onPick: (id: string) => void }) {
  const cell = 34;
  const W = view.width * cell;
  const H = view.height * cell;
  const m = view.monster;
  const arrow = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[m.facing];
  const mcx = (m.x + m.w / 2) * cell;
  const mcy = (m.y + m.h / 2) * cell;
  const key = (e: React.KeyboardEvent, id?: string) => {
    if (id && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onPick(id);
    }
  };
  return (
    <div className="board2d">
      {view.hint && <p className="hint">{view.hint}</p>}
      <svg viewBox={`-2 -2 ${W + 4} ${H + 4}`} role="group" aria-label={`Showdown board, ${view.width} by ${view.height} squares`}>
        <rect x={0} y={0} width={W} height={H} className="b2-bg" />
        {Array.from({ length: view.width + 1 }, (_, i) => (
          <line key={`v${i}`} x1={i * cell} y1={0} x2={i * cell} y2={H} className="b2-grid" />
        ))}
        {Array.from({ length: view.height + 1 }, (_, i) => (
          <line key={`h${i}`} x1={0} y1={i * cell} x2={W} y2={i * cell} className="b2-grid" />
        ))}
        {view.cells.map((c) => (
          <rect
            key={c.pick}
            x={c.x * cell + 2}
            y={c.y * cell + 2}
            width={cell - 4}
            height={cell - 4}
            rx={4}
            className="b2-move"
            role="button"
            tabIndex={0}
            aria-label={`Move to square ${c.label}`}
            onClick={() => onPick(c.pick)}
            onKeyDown={(e) => key(e, c.pick)}
          />
        ))}
        <g
          className={`b2-monster ${m.pick ? 'pickable' : ''}`}
          role={m.pick ? 'button' : 'img'}
          tabIndex={m.pick ? 0 : undefined}
          aria-label={m.pick ? `${m.name}: ${m.pickLabel}` : `${m.name}, facing ${m.facing}`}
          onClick={() => m.pick && onPick(m.pick)}
          onKeyDown={(e) => key(e, m.pick)}
        >
          <rect x={m.x * cell + 2} y={m.y * cell + 2} width={m.w * cell - 4} height={m.h * cell - 4} rx={8} />
          <line x1={mcx} y1={mcy} x2={mcx + arrow[0] * cell * 0.9} y2={mcy + arrow[1] * cell * 0.9} className="b2-facing" />
          <text x={mcx} y={mcy + 4} textAnchor="middle">
            {m.name.split(' ').map((w) => w[0]).join('')}
          </text>
        </g>
        {view.survivors.map((sv) => (
          <g
            key={sv.id}
            className={`b2-survivor ${sv.pick ? 'pickable' : ''} ${sv.active ? 'active' : ''} ${sv.targeted ? 'targeted' : ''}`}
            role={sv.pick ? 'button' : 'img'}
            tabIndex={sv.pick ? 0 : undefined}
            aria-label={`${sv.name}${sv.knockedDown ? ', knocked down' : ''}${sv.pick ? `: ${sv.pickLabel}` : ''}`}
            onClick={() => sv.pick && onPick(sv.pick)}
            onKeyDown={(e) => key(e, sv.pick)}
          >
            <circle cx={(sv.x + 0.5) * cell} cy={(sv.y + 0.5) * cell} r={cell * 0.4} fill={sv.color} opacity={sv.knockedDown ? 0.5 : 1} />
            <text x={(sv.x + 0.5) * cell} y={(sv.y + 0.5) * cell + 5} textAnchor="middle">
              {sv.knockedDown ? '↓' : sv.initial}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
