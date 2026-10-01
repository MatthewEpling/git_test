import type { Creature } from '../types';
import type { Action } from '../lib/store';
import { ACCESSORIES, COLORS, HOME_STYLES, PERSONALITIES, SPECIES } from '../lib/content';
import { CreatureAvatar } from './CreatureAvatar';
import { HomeIcon } from './HomeIcon';

interface Props {
  creature: Creature;
  dispatch: React.Dispatch<Action>;
  compact?: boolean;
}

const COLOR_NAMES = ['Apricot', 'Moss', 'Honey', 'Lavender', 'Sky', 'Rose', 'Oat'];

export function CreatureEditor({ creature, dispatch, compact = false }: Props) {
  const set = (patch: Partial<Creature>) => dispatch({ type: 'updatePlayer', patch });

  return (
    <div className="editor">
      <div className="editor-preview" aria-hidden="true">
        <HomeIcon style={creature.homeStyle} door={creature.color} size={compact ? 76 : 96} />
        <span className="preview-bob">
          <CreatureAvatar species={creature.species} color={creature.color} accessory={creature.accessory} size={compact ? 84 : 110} />
        </span>
      </div>

      <label className="field">
        <span>Name</span>
        <input value={creature.name} maxLength={18} onChange={(e) => set({ name: e.target.value })} onBlur={(e) => !e.target.value.trim() && set({ name: 'Nib' })} />
      </label>

      <fieldset className="field">
        <legend>Kind of creature</legend>
        <div className="choice-row">
          {SPECIES.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`choice ${creature.species === s.id ? 'is-on' : ''}`}
              aria-pressed={creature.species === s.id}
              onClick={() => set({ species: s.id })}
            >
              <CreatureAvatar species={s.id} color={creature.color} accessory="none" size={44} />
              <span className="small">{s.label}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="field">
        <legend>Color</legend>
        <div className="swatches" role="radiogroup" aria-label="Creature color">
          {COLORS.map((c, i) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={creature.color === c}
              aria-label={COLOR_NAMES[i]}
              className="swatch swatch-lg"
              style={{ background: c }}
              onClick={() => set({ color: c })}
            />
          ))}
        </div>
      </fieldset>

      <fieldset className="field">
        <legend>Wearing</legend>
        <div className="chip-row">
          {ACCESSORIES.map((a) => (
            <button key={a.id} type="button" className={`chip ${creature.accessory === a.id ? 'is-on' : ''}`} aria-pressed={creature.accessory === a.id} onClick={() => set({ accessory: a.id })}>
              {a.label}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="field">
        <span>Personality</span>
        <select value={creature.personality} onChange={(e) => set({ personality: e.target.value })}>
          {PERSONALITIES.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </label>

      {!compact && (
        <>
          <label className="field">
            <span>Status</span>
            <input value={creature.status} maxLength={60} placeholder="What are they up to?" onChange={(e) => set({ status: e.target.value })} />
          </label>
          <fieldset className="field">
            <legend>Home</legend>
            <div className="chip-row">
              {HOME_STYLES.map((h) => (
                <button key={h.id} type="button" className={`chip ${creature.homeStyle === h.id ? 'is-on' : ''}`} aria-pressed={creature.homeStyle === h.id} onClick={() => set({ homeStyle: h.id })}>
                  {h.label}
                </button>
              ))}
            </div>
          </fieldset>
        </>
      )}
    </div>
  );
}
