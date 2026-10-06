import { useEffect, useState } from 'react';
import { listStates, STATE_SLOTS, type SaveStateMeta } from '../../storage/saves';

interface Props {
  gameKey: string;
  current: number;
  onSelect: (slot: number) => void;
  onSave: (slot: number) => Promise<void>;
  onLoad: (slot: number) => Promise<void>;
  refreshKey: number;
}

export function StatesPanel({ gameKey, current, onSelect, onSave, onLoad, refreshKey }: Props) {
  const [states, setStates] = useState<SaveStateMeta[]>([]);
  useEffect(() => {
    void listStates(gameKey).then(setStates);
  }, [gameKey, refreshKey]);
  const bySlot = new Map(states.map((s) => [s.slot, s]));
  const auto = bySlot.get(0);
  return (
    <div className="stack">
      {auto && (
        <button type="button" className="slot" onClick={() => void onLoad(0)}>
          <div className="row">
            <div className="thumb" style={{ width: 96, backgroundImage: `url(${auto.thumbnail})` }} />
            <div>
              <strong>Resume where you left off</strong>
              <div className="tiny muted">Auto-saved {new Date(auto.createdAt).toLocaleString()}</div>
            </div>
          </div>
        </button>
      )}
      <div className="slots">
        {Array.from({ length: STATE_SLOTS }, (_, i) => i + 1).map((slot) => {
          const s = bySlot.get(slot);
          return (
            <div key={slot} className={`slot ${slot === current ? 'is-current' : ''}`}>
              <button
                type="button"
                className="thumb"
                style={{ backgroundImage: s ? `url(${s.thumbnail})` : undefined, border: 0, cursor: s ? 'pointer' : 'default' }}
                onClick={() => (s ? void onLoad(slot) : onSelect(slot))}
                aria-label={s ? `Load slot ${slot}` : `Select empty slot ${slot}`}
              >
                {!s && 'Empty'}
              </button>
              <div className="row between">
                <span className="tiny" style={{ fontWeight: 700 }}>
                  Slot {slot}
                </span>
                <button type="button" className="btn btn-sm btn-ghost" style={{ minHeight: 26, padding: '0 8px' }} onClick={() => void onSave(slot).then(() => onSelect(slot))}>
                  Save
                </button>
              </div>
              <span className="tiny faint">{s ? new Date(s.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
