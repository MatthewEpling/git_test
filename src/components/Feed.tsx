import { useState } from 'react';
import type { WorldState } from '../types';
import type { Action } from '../lib/store';
import { CreationCard } from './CreationCard';

interface Props {
  world: WorldState;
  dispatch: React.Dispatch<Action>;
  todaysPrompt: string;
  onVisit: (id: string) => void;
  onFindOnMap: (id: string) => void;
  limit?: number;
}

type Filter = 'all' | 'prompt' | 'mine';

export function Feed({ world, dispatch, todaysPrompt, onVisit, onFindOnMap, limit }: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const creatures = new Map(world.creatures.map((c) => [c.id, c]));
  let items = [...world.creations].sort((a, b) => b.createdAt - a.createdAt);
  if (filter === 'prompt') items = items.filter((c) => c.prompt === todaysPrompt);
  if (filter === 'mine') items = items.filter((c) => c.authorId === world.playerId);
  if (limit) items = items.slice(0, limit);

  return (
    <section className="feed" aria-label="Community feed">
      {!limit && (
        <div className="filters" role="group" aria-label="Filter the feed">
          {(
            [
              ['all', 'Everything'],
              ['prompt', 'Today’s prompt'],
              ['mine', 'Mine'],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" className={`chip ${filter === id ? 'is-on' : ''}`} aria-pressed={filter === id} onClick={() => setFilter(id)}>
              {label}
            </button>
          ))}
        </div>
      )}
      {items.length === 0 && (
        <div className="empty card">
          <span aria-hidden="true">🍃</span>
          <p>Nothing here yet. Be the first to make something!</p>
        </div>
      )}
      {items.map((c) => (
        <CreationCard
          key={c.id}
          creation={c}
          creatures={creatures}
          playerId={world.playerId}
          dispatch={dispatch}
          onVisit={onVisit}
          onFindOnMap={onFindOnMap}
        />
      ))}
    </section>
  );
}
