import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DecisionOption } from '../engine/state';
import { downloadJson, type Store } from '../persist/store';
import { webglAvailable } from '../render/webgl';
import { boardView } from '../render/view';
import { Board } from './Board';
import { DecisionPanel, HuntTrack, LogPanel, MonsterPanel, SettlementView, SurvivorSheet } from './panels';
import { choose, EngineError, exportable, IllegalCommand, persist, type Session, undo } from './session';

const MODE_KEY = 'lantern-table:board-mode';

function initialMode(): '3d' | '2d' {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(MODE_KEY);
  } catch {
    // storage blocked: fine, default below
  }
  if (saved === '2d') return '2d';
  return webglAvailable() ? '3d' : '2d';
}

export function Game({ initial, store, onExit }: { initial: Session; store: Store; onExit: () => void }) {
  const [session, setSession] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const has3d = useMemo(() => webglAvailable(), []);
  const [notice, setNotice] = useState<string | null>(has3d ? null : 'WebGL 2 isn’t available in this browser, so the board is shown in 2D.');
  const [mode, setMode] = useState<'3d' | '2d'>(initialMode);
  const [tab, setTab] = useState<string>('all');
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'failed'>('saved');
  const s = session.state;
  const c = session.content;

  useEffect(() => {
    let cancelled = false;
    setSaveState('saving');
    persist(store, session)
      .then(() => !cancelled && setSaveState('saved'))
      .catch(() => !cancelled && setSaveState('failed'));
    return () => {
      cancelled = true;
    };
  }, [session, store]);

  const pick = useCallback(
    (optionId: string) => {
      const d = session.state.pending;
      if (!d) return;
      try {
        setSession(choose(session, { decisionId: d.id, optionId }));
        setError(null);
      } catch (e) {
        if (e instanceof IllegalCommand) setError(`That isn't allowed right now: ${e.message}`);
        else setError(`The rules engine hit a problem: ${(e as Error).message}. You can undo the last step, or export a bug report.`);
      }
    },
    [session],
  );
  const onChoose = useCallback((o: DecisionOption) => pick(o.id), [pick]);

  const doUndo = () => {
    try {
      setSession(undo(session));
      setError(null);
    } catch (e) {
      setError(e instanceof EngineError ? e.message : String(e));
    }
  };

  const setBoardMode = (m: '3d' | '2d') => {
    setMode(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      // ignore
    }
  };

  const view = useMemo(() => boardView(s, c), [s, c]);
  const shown = s.survivors.filter((sv) => (tab === 'all' ? sv.alive || s.settlement.departing.includes(sv.id) : sv.id === tab));
  const relevant = s.phase === 'settlement' ? s.survivors : s.survivors.filter((sv) => s.settlement.departing.includes(sv.id) || !sv.alive);

  return (
    <div className="game">
      <header className="topbar">
        <div className="title">
          <strong>{s.settlement.name}</strong>
          <span>Year {s.settlement.year}</span>
          <span className="phase">{s.phase === 'over' ? 'campaign over' : s.phase}</span>
          {c.pack.meta.source === 'original-standin' && <span className="tag" title={c.pack.meta.notes}>Stand-in content</span>}
        </div>
        <div className="actions">
          <button onClick={doUndo} disabled={!session.record.commands.length} title="Rebuild the game without your last choice">
            ↶ Undo
          </button>
          <div role="group" aria-label="Board view" className="seg">
            <button aria-pressed={mode === '3d'} onClick={() => setBoardMode('3d')} disabled={!has3d}>
              3D
            </button>
            <button aria-pressed={mode === '2d'} onClick={() => setBoardMode('2d')}>
              2D
            </button>
          </div>
          <button onClick={() => downloadJson(`${session.record.name.replace(/\W+/g, '-')}.lantern-save.json`, exportable(session))} title="Seed + every choice: reproduces this game exactly">
            Export save
          </button>
          <span className={`save ${saveState}`} aria-live="polite">
            {saveState === 'saved' ? (store.persistent ? 'Saved' : 'Not saved (no storage)') : saveState === 'saving' ? 'Saving…' : 'Save failed'}
          </span>
          <button onClick={onExit}>Menu</button>
        </div>
      </header>
      {error && (
        <div className="banner bad" role="alert">
          {error}
          <button onClick={() => setError(null)}>Dismiss</button>
          <button onClick={() => downloadJson('lantern-table-bug-report.json', { ...exportable(session), error })}>Export bug report</button>
        </div>
      )}
      {notice && (
        <div className="banner" role="status">
          {notice}
          <button onClick={() => setNotice(null)}>Dismiss</button>
        </div>
      )}
      <main className="layout">
        <section className="stage" aria-label="Table">
          {s.phase === 'showdown' && view ? (
            <Board
              view={view}
              mode={mode}
              onPick={pick}
              onFallback={(reason) => {
                setBoardMode('2d');
                setNotice(`${reason} Switched to the 2D board.`);
              }}
            />
          ) : s.phase === 'hunt' ? (
            <HuntTrack s={s} c={c} />
          ) : (
            <SettlementView s={s} c={c} />
          )}
        </section>
        <aside className="side">
          <DecisionPanel s={s} onChoose={onChoose} busy={false} />
          <MonsterPanel s={s} c={c} />
        </aside>
        <section className="survivors" aria-label="Survivors">
          <div role="tablist" className="tabs">
            <button role="tab" aria-selected={tab === 'all'} onClick={() => setTab('all')}>
              {s.phase === 'settlement' ? 'Everyone' : 'Hunting party'}
            </button>
            {relevant.map((sv) => (
              <button key={sv.id} role="tab" aria-selected={tab === sv.id} onClick={() => setTab(sv.id)} className={sv.alive ? '' : 'dead'}>
                {sv.name}
              </button>
            ))}
          </div>
          <div className="sheets">
            {(tab === 'all' ? (s.phase === 'settlement' ? shown : shown.filter((sv) => s.settlement.departing.includes(sv.id) || !sv.alive)) : shown).map((sv) => (
              <SurvivorSheet key={sv.id} s={s} c={c} sv={sv} />
            ))}
          </div>
        </section>
        <LogPanel log={s.log} />
      </main>
    </div>
  );
}
