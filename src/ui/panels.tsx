import { useEffect, useMemo, useRef, useState } from 'react';
import { LOCATIONS, STATS } from '../content/schema';
import { gearSummary } from '../engine/campaign';
import type { Content } from '../engine/core';
import { statOf } from '../engine/core';
import type { Decision, DecisionOption, GameState, LogEntry, Survivor } from '../engine/state';
import { survivorColor } from '../render/view';

// ───────────────────────── Decision panel ─────────────────────────

export function DecisionPanel({ s, onChoose, busy }: { s: GameState; onChoose: (o: DecisionOption) => void; busy: boolean }) {
  const d = s.pending;
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [d?.id]);
  if (s.outcome) {
    return (
      <section className="panel decision" aria-live="polite">
        <h2 id="decision-title" tabIndex={-1} ref={headingRef}>{s.outcome.result === 'won' ? 'Campaign complete' : 'Campaign lost'}</h2>
        <p>{s.outcome.text}</p>
      </section>
    );
  }
  if (!d) return null;
  const groups = new Map<string, DecisionOption[]>();
  for (const o of d.options) {
    const g = o.group ?? '';
    groups.set(g, [...(groups.get(g) ?? []), o]);
  }
  const cellCount = d.options.filter((o) => o.cell).length;
  return (
    <section className="panel decision" aria-live="polite" aria-labelledby="decision-title">
      <h2 id="decision-title" tabIndex={-1} ref={headingRef}>
        {d.title}
      </h2>
      <p className="prompt">{d.prompt}</p>
      {[...groups].map(([g, opts]) => {
        const isCells = opts.every((o) => o.cell);
        const body = (
          <div className={`options ${isCells ? 'cells' : ''}`}>
            {opts.map((o) => (
              <button
                key={o.id}
                className={`option ${o.disabled ? 'is-disabled' : ''}`}
                aria-disabled={!!o.disabled || busy}
                onClick={() => !o.disabled && !busy && onChoose(o)}
                title={o.disabled ?? o.detail}
              >
                <span className="label">
                  {o.survivorId && <span className="swatch" style={{ background: survivorColor(s, o.survivorId) }} aria-hidden />}
                  {o.label}
                </span>
                {!isCells && o.detail && <span className="detail">{o.detail}</span>}
                {o.disabled && <span className="why-not">Unavailable: {o.disabled}</span>}
              </button>
            ))}
          </div>
        );
        if (isCells) {
          return (
            <details key={g} className="group">
              <summary>
                Pick a square from a list ({cellCount}) — or click a highlighted square on the board
              </summary>
              {body}
            </details>
          );
        }
        return (
          <div key={g} className="group">
            {g && <h3>{g}</h3>}
            {body}
          </div>
        );
      })}
    </section>
  );
}

// ───────────────────────── Survivor sheet ─────────────────────────

export function SurvivorSheet({ s, c, sv }: { s: GameState; c: Content; sv: Survivor }) {
  const cb = s.showdown?.combatants.find((x) => x.survivorId === sv.id);
  return (
    <article className={`sheet ${sv.alive ? '' : 'dead'}`} aria-label={`${sv.name}'s survivor sheet`}>
      <header>
        <span className="swatch big" style={{ background: survivorColor(s, sv.id) }} aria-hidden />
        <h3>{sv.name}</h3>
        <span className="tags">
          {!sv.alive && <span className="tag bad">Dead — {sv.causeOfDeath}</span>}
          {cb?.knockedDown && <span className="tag warn">Knocked down</span>}
          {s.showdown?.active === sv.id && <span className="tag">Activating</span>}
          {s.settlement.departing.includes(sv.id) && s.phase !== 'settlement' && <span className="tag">Departed</span>}
        </span>
      </header>
      <div className="vitals">
        <span>
          Survival <b>{sv.survival}</b>/{s.settlement.survivalLimit}
        </span>
        <span>
          Insanity <b>{sv.insanity}</b>
        </span>
        <span>
          Hunt XP <b>{sv.huntXp}</b>
        </span>
      </div>
      <table className="stats">
        <thead>
          <tr>
            {STATS.map((k) => (
              <th key={k} scope="col">
                {k.slice(0, 3)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {STATS.map((k) => {
              const now = statOf(s, c, sv, k);
              return (
                <td key={k} className={now !== sv.stats[k] ? 'modified' : ''} title={`${k}: ${sv.stats[k]} permanent${now !== sv.stats[k] ? `, ${now} with gear and showdown effects` : ''}`}>
                  {now}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
      {sv.body && (
        <div className="body" aria-label="Armor and injuries by location">
          {LOCATIONS.map((l) => {
            const b = sv.body![l];
            const noLight = c.rules.noLightInjury.includes(l);
            return (
              <div key={l} className="loc">
                <span className="name">{l}</span>
                <span className="armor" title="Armor points">
                  ⛨ {b.armor}
                </span>
                {!noLight && <span className={`box ${b.light ? 'on' : ''}`} title={b.light ? 'Light injury' : 'Light injury box (empty)'}>L</span>}
                <span className={`box heavy ${b.heavy ? 'on' : ''}`} title={b.heavy ? 'Heavy injury' : 'Heavy injury box (empty)'}>H</span>
              </div>
            );
          })}
        </div>
      )}
      <div className="lines">
        <div>
          <b>Gear:</b> {sv.gear.length ? sv.gear.map((g) => c.gear.get(g)?.name ?? g).join(', ') : 'none'} <span className="muted">(+ {c.gear.get(c.rules.unarmedWeapon)?.name})</span>
        </div>
        {sv.injuries.length > 0 && (
          <div>
            <b>Injuries:</b> {sv.injuries.join(', ')}
          </div>
        )}
        {sv.disorders.length + sv.fightingArts.length + sv.abilities.length > 0 && (
          <div>
            <b>Abilities:</b> {[...sv.fightingArts, ...sv.abilities, ...sv.disorders].join(', ')}
          </div>
        )}
      </div>
    </article>
  );
}

// ───────────────────────── Monster panel ─────────────────────────

export function MonsterPanel({ s, c }: { s: GameState; c: Content }) {
  const sd = s.showdown;
  if (!sd) return null;
  const m = c.monster(sd.monsterId);
  const lvl = c.level(sd.monsterId, sd.level);
  const ai = sd.currentAi ? c.aiCard(sd.monsterId, sd.currentAi) : null;
  const health = sd.aiDeck.length + sd.aiDiscard.length;
  return (
    <section className="panel monster" aria-label="Monster">
      <h2>
        {m.name} <span className="muted">level {sd.level}</span>
      </h2>
      <div className="vitals">
        <span>
          Health <b>{health}</b> AI cards
        </span>
        <span>
          Wounds <b>{sd.woundStack.length}</b>
        </span>
        <span>
          Round <b>{sd.round}</b>
        </span>
      </div>
      <div className="vitals small">
        <span>Movement {lvl.movement}</span>
        <span>Toughness {lvl.toughness + (sd.monster.mods.toughness ?? 0)}</span>
        <span>Evasion {lvl.evasion + (sd.monster.mods.evasion ?? 0)}</span>
        <span>Facing {sd.monster.facing}</span>
      </div>
      <div className="decks">
        <span title="AI deck / discard">
          AI {sd.aiDeck.length} / {sd.aiDiscard.length}
        </span>
        <span title="Hit location deck / discard">
          Hit loc. {sd.hlDeck.length} / {sd.hlDiscard.length}
        </span>
      </div>
      {ai && (
        <div className="card ai" aria-label="Current AI card">
          <div className="card-title">AI: {ai.name}</div>
          <div className="card-text">{ai.text}</div>
        </div>
      )}
    </section>
  );
}

// ───────────────────────── Hunt track ─────────────────────────

export function HuntTrack({ s, c }: { s: GameState; c: Content }) {
  const h = s.hunt;
  if (!h) return null;
  const spaces = Array.from({ length: c.rules.huntBoardLength + 1 }, (_, i) => i);
  const special = c.monster(h.monsterId).huntSpaces;
  return (
    <section className="hunt" aria-label="Hunt board">
      <h2>
        The hunt — {c.monster(h.monsterId).name}, level {h.level}
      </h2>
      <ol className="track">
        {spaces.map((i) => (
          <li key={i} className={`space ${i === h.survivorPos ? 'survivors' : ''} ${i === h.monsterPos ? 'quarry' : ''} ${special[String(i)] ? 'special' : ''} ${i > h.monsterPos ? 'beyond' : ''}`}>
            <span className="n">{i}</span>
            {i === h.survivorPos && <span className="token" aria-label="Survivors">🜂</span>}
            {i === h.monsterPos && <span className="token quarry" aria-label="Quarry">✦</span>}
          </li>
        ))}
      </ol>
      <p className="muted">
        Survivors at space {h.survivorPos}, quarry at space {h.monsterPos}. Hunt turn {h.turn}. Events resolve automatically; you're asked only when an event offers a choice.
      </p>
    </section>
  );
}

// ───────────────────────── Settlement ─────────────────────────

export function SettlementView({ s, c }: { s: GameState; c: Content }) {
  const st = s.settlement;
  const res = Object.entries(st.resources).sort();
  return (
    <section className="settlement" aria-label="Settlement">
      <h2>
        {st.name} — lantern year {st.year}
      </h2>
      <div className="vitals">
        <span>
          Endeavors <b>{st.endeavors}</b>
        </span>
        <span>
          Survival limit <b>{st.survivalLimit}</b>
        </span>
        <span>
          Population <b>{s.survivors.filter((x) => x.alive).length}</b>
        </span>
        <span>
          Deaths <b>{st.deaths}</b>
        </span>
      </div>
      <div className="columns">
        <div>
          <h3>Storage</h3>
          {res.length ? (
            <ul className="chips">
              {res.map(([id, n]) => (
                <li key={id} title={(c.resources.get(id)?.keywords ?? []).join(', ')}>
                  {c.resourceName(id)} ×{n}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No resources.</p>
          )}
          {Object.keys(st.gearStorage).length > 0 && (
            <ul className="chips gear">
              {Object.entries(st.gearStorage).map(([id, n]) => (
                <li key={id} title={gearSummary(c.gearItem(id))}>
                  {c.gearItem(id).name} ×{n}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3>Locations</h3>
          <ul className="cards">
            {st.locations.map((id) => (
              <li key={id} className="card">
                <div className="card-title">{c.locations.get(id)?.name}</div>
                <div className="card-text">{c.locations.get(id)?.text}</div>
              </li>
            ))}
          </ul>
          <h3>Innovations</h3>
          {st.innovations.length ? (
            <ul className="cards">
              {st.innovations.map((id) => (
                <li key={id} className="card">
                  <div className="card-title">{c.innovations.get(id)?.name}</div>
                  <div className="card-text">{c.innovations.get(id)?.text}</div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">None yet.</p>
          )}
        </div>
      </div>
      {st.defeatedQuarries.length > 0 && (
        <p className="muted">
          Defeated: {st.defeatedQuarries.map((q) => `${c.monster(q.monsterId).name} L${q.level} (year ${q.year})`).join('; ')}
        </p>
      )}
    </section>
  );
}

// ───────────────────────── Log ─────────────────────────

const KIND_LABEL: Record<LogEntry['kind'], string> = { info: 'info', roll: 'roll', choice: 'you', rule: 'rule', manual: 'manual', warn: 'note', phase: 'phase' };

export function LogPanel({ log }: { log: LogEntry[] }) {
  const [filter, setFilter] = useState<'all' | 'rolls' | 'choices'>('all');
  const end = useRef<HTMLDivElement>(null);
  const shown = useMemo(() => {
    const list = filter === 'all' ? log : log.filter((l) => (filter === 'rolls' ? l.kind === 'roll' : l.kind === 'choice'));
    return list.slice(-300);
  }, [log, filter]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [shown.length]);
  return (
    <section className="panel log" aria-label="Event log">
      <header>
        <h2>Event log</h2>
        <div role="group" aria-label="Filter the log" className="seg">
          {(['all', 'rolls', 'choices'] as const).map((f) => (
            <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {f}
            </button>
          ))}
        </div>
      </header>
      <div className="entries" role="log" aria-live="off">
        {shown.map((l) => (
          <div key={l.seq} className={`entry k-${l.kind}`}>
            <span className="badge">{KIND_LABEL[l.kind]}</span>
            {l.why ? (
              <details>
                <summary>{l.text}</summary>
                <div className="why">Why: {l.why}</div>
              </details>
            ) : (
              <span className="text">{l.text}</span>
            )}
          </div>
        ))}
        <div ref={end} />
      </div>
    </section>
  );
}

export function decisionTitle(d: Decision | null) {
  return d ? d.title : '';
}
