import { useState } from 'react';
import type { Creature, WorldState } from '../types';
import type { Action } from '../lib/store';
import { uid } from '../lib/store';
import { GIFTS, SPECIES, THANK_YOUS } from '../lib/content';
import { timeAgo } from '../lib/time';
import { CreatureAvatar } from './CreatureAvatar';
import { HomeIcon } from './HomeIcon';

interface Props {
  creature: Creature;
  world: WorldState;
  dispatch: React.Dispatch<Action>;
  onEditProfile: () => void;
  onOpenCreation: (id: string) => void;
}

export function VisitHome({ creature, world, dispatch, onEditProfile, onOpenCreation }: Props) {
  const [gift, setGift] = useState('');
  const [note, setNote] = useState('');
  const [thanks, setThanks] = useState<string | null>(null);
  const isMe = creature.id === world.playerId;
  const names = new Map(world.creatures.map((c) => [c.id, c.name]));
  const theirs = world.creations.filter((c) => c.authorId === creature.id).slice(0, 6);

  function give(e: React.FormEvent) {
    e.preventDefault();
    if (!gift) return;
    dispatch({ type: 'giveGift', toId: creature.id, item: gift, note, id: uid('g'), now: Date.now() });
    setThanks(`${creature.name} ${THANK_YOUS[Math.floor(Math.random() * THANK_YOUS.length)]}`);
    setGift('');
    setNote('');
  }

  return (
    <div className="visit">
      <div className="visit-scene">
        <HomeIcon style={creature.homeStyle} door={creature.color} size={120} />
        <div className={`visit-creature ${thanks ? 'is-happy' : ''}`}>
          <CreatureAvatar species={creature.species} color={creature.color} accessory={creature.accessory} size={96} title={creature.name} />
        </div>
      </div>

      <div className="profile-lines">
        <p>
          <span className="pill">{SPECIES.find((s) => s.id === creature.species)?.label}</span>{' '}
          <span className="pill pill-warm">{creature.personality}</span>
        </p>
        <p className="status-bubble">“{creature.status}”</p>
      </div>

      <section aria-labelledby="shelf-h">
        <h3 id="shelf-h">Gift shelf</h3>
        {creature.gifts.length === 0 ? (
          <p className="muted">The shelf is empty… for now.</p>
        ) : (
          <ul className="shelf">
            {creature.gifts.map((g) => (
              <li key={g.id} className="shelf-item" title={g.note || undefined}>
                <span className="shelf-emoji" aria-hidden="true">{g.item}</span>
                <span className="small">
                  from <strong>{g.fromId === world.playerId ? 'you' : names.get(g.fromId)}</strong>
                  <span className="muted"> · {timeAgo(g.createdAt)}</span>
                  {g.note && <span className="gift-note">“{g.note}”</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {theirs.length > 0 && (
        <section aria-labelledby="made-h">
          <h3 id="made-h">Made by {isMe ? 'you' : creature.name}</h3>
          <div className="made-row">
            {theirs.map((c) => (
              <button key={c.id} type="button" className="made-thumb" onClick={() => onOpenCreation(c.id)} aria-label={c.caption || c.text || 'Open creation'}>
                {c.kind === 'emoji' ? c.emoji : c.kind === 'note' ? '✉️' : '✎'}
              </button>
            ))}
          </div>
        </section>
      )}

      {isMe ? (
        <button type="button" className="btn btn-primary btn-block" onClick={onEditProfile}>
          Edit my creature
        </button>
      ) : (
        <form className="gift-form" onSubmit={give}>
          <h3>Leave a gift</h3>
          {thanks && (
            <p className="thanks" role="status">
              💛 {thanks}
            </p>
          )}
          <div className="gift-grid" role="radiogroup" aria-label="Choose a gift">
            {GIFTS.map((g) => (
              <button
                key={g.item}
                type="button"
                role="radio"
                aria-checked={gift === g.item}
                className={`gift-pick ${gift === g.item ? 'is-on' : ''}`}
                onClick={() => setGift(g.item)}
              >
                <span aria-hidden="true">{g.item}</span>
                <span className="small">{g.label}</span>
              </button>
            ))}
          </div>
          <label className="field">
            <span>Tiny note <span className="muted">(optional)</span></span>
            <input value={note} maxLength={80} placeholder="Thought you’d like this!" onChange={(e) => setNote(e.target.value)} />
          </label>
          <button type="submit" className="btn btn-primary btn-block" disabled={!gift}>
            Leave gift on the doorstep 🎁
          </button>
        </form>
      )}
    </div>
  );
}
