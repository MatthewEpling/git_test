import { useId, useState } from 'react';
import type { Creation, Creature } from '../types';
import type { Action } from '../lib/store';
import { uid } from '../lib/store';
import { KIND_COMMENTS, REACTIONS } from '../lib/content';
import { timeAgo } from '../lib/time';
import { CreatureAvatar } from './CreatureAvatar';
import { Doodle } from './Doodle';

interface Props {
  creation: Creation;
  creatures: Map<string, Creature>;
  playerId: string;
  dispatch: React.Dispatch<Action>;
  onVisit: (creatureId: string) => void;
  onFindOnMap?: (creationId: string) => void;
  /** Start with the comment thread open (used in the detail sheet). */
  expanded?: boolean;
}

export function CreationBody({ creation, size = 'large' }: { creation: Creation; size?: 'large' | 'small' }) {
  if (creation.kind === 'note') {
    return (
      <p className={`paper-note note-${size}`} style={{ background: creation.noteColor }}>
        {creation.text}
      </p>
    );
  }
  if (creation.kind === 'emoji') {
    return (
      <div className={`emoji-stage emoji-${size}`} role="img" aria-label={`Emoji ${creation.emoji}`}>
        {creation.emoji}
      </div>
    );
  }
  return (
    <div className={`doodle-frame doodle-${size}`}>
      <Doodle strokes={creation.strokes ?? []} size={size === 'large' ? 200 : 96} label={creation.caption || 'A doodle'} />
    </div>
  );
}

export function CreationCard({ creation, creatures, playerId, dispatch, onVisit, onFindOnMap, expanded = false }: Props) {
  const [showComments, setShowComments] = useState(expanded);
  const [draft, setDraft] = useState('');
  const [burst, setBurst] = useState<string | null>(null);
  const inputId = useId();
  const author = creatures.get(creation.authorId);
  const mine = creation.authorId === playerId;

  function react(key: (typeof REACTIONS)[number]['key']) {
    const already = creation.reactions[key].includes(playerId);
    dispatch({ type: 'toggleReaction', creationId: creation.id, key, by: playerId });
    if (!already) {
      setBurst(key);
      setTimeout(() => setBurst(null), 650);
    }
  }

  function comment(text: string) {
    if (!text.trim()) return;
    dispatch({ type: 'addComment', creationId: creation.id, text, by: playerId, id: uid('k'), now: Date.now() });
    setDraft('');
  }

  return (
    <article className="card creation-card">
      <header className="card-head">
        <button type="button" className="author" onClick={() => onVisit(creation.authorId)} aria-label={`Visit ${author?.name ?? 'author'}’s home`}>
          {author && <CreatureAvatar species={author.species} color={author.color} accessory={author.accessory} size={40} />}
          <span>
            <strong>{mine ? `${author?.name} (you)` : author?.name}</strong>
            <span className="muted small">{timeAgo(creation.createdAt)}</span>
          </span>
        </button>
        {onFindOnMap && (
          <button type="button" className="chip" onClick={() => onFindOnMap(creation.id)}>
            📍 On map
          </button>
        )}
      </header>

      {creation.prompt && <p className="prompt-badge">✎ {creation.prompt}</p>}
      <CreationBody creation={creation} />
      {creation.caption && <p className="caption">{creation.caption}</p>}

      <div className="reactions" role="group" aria-label="Reactions">
        {REACTIONS.map((r) => {
          const by = creation.reactions[r.key];
          const on = by.includes(playerId);
          return (
            <button
              key={r.key}
              type="button"
              className={`reaction ${on ? 'is-on' : ''} ${burst === r.key ? 'is-burst' : ''}`}
              aria-pressed={on}
              aria-label={`${r.label}, ${by.length} ${by.length === 1 ? 'reaction' : 'reactions'}`}
              title={r.label}
              onClick={() => react(r.key)}
            >
              <span aria-hidden="true">{r.emoji}</span>
              <span className="count" aria-hidden="true">{by.length || ''}</span>
            </button>
          );
        })}
        <button
          type="button"
          className="reaction comment-toggle"
          aria-expanded={showComments}
          onClick={() => setShowComments((v) => !v)}
        >
          💬 <span className="count">{creation.comments.length || ''}</span>
          <span className="sr-only">comments</span>
        </button>
      </div>

      {showComments && (
        <div className="comments">
          {creation.comments.map((k) => {
            const who = creatures.get(k.authorId);
            return (
              <div key={k.id} className="comment">
                {who && <CreatureAvatar species={who.species} color={who.color} accessory={who.accessory} size={26} />}
                <p>
                  <strong>{k.authorId === playerId ? 'You' : who?.name}</strong> {k.text}
                </p>
              </div>
            );
          })}
          <div className="kind-chips" aria-label="Quick kind words">
            {KIND_COMMENTS.slice(0, 3).map((t) => (
              <button key={t} type="button" className="chip chip-soft" onClick={() => comment(t)}>
                {t}
              </button>
            ))}
          </div>
          <form
            className="comment-form"
            onSubmit={(e) => {
              e.preventDefault();
              comment(draft);
            }}
          >
            <label className="sr-only" htmlFor={inputId}>
              Write a friendly comment
            </label>
            <input
              id={inputId}
              value={draft}
              maxLength={140}
              placeholder="Say something kind…"
              onChange={(e) => setDraft(e.target.value)}
            />
            <button type="submit" className="btn btn-small" disabled={!draft.trim()}>
              Send
            </button>
          </form>
        </div>
      )}
    </article>
  );
}
