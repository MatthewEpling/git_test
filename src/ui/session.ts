// A campaign being played: content, the command list (the save), and the current state.
// Every change goes through the engine; undo rebuilds the game without the last command.
import { apply, type Content, EngineError, IllegalCommand, newGame, replay } from '../engine/engine';
import type { Command, GameState } from '../engine/state';
import type { SaveRecord, Store } from '../persist/store';

export interface Session {
  content: Content;
  record: SaveRecord;
  state: GameState;
}

function summary(s: GameState) {
  if (s.outcome) return `${s.outcome.result === 'won' ? 'Won' : 'Lost'} — year ${s.settlement.year}`;
  const alive = s.survivors.filter((x) => x.alive).length;
  return `Year ${s.settlement.year}, ${s.phase}, ${alive} survivor${alive === 1 ? '' : 's'}`;
}

export function startSession(content: Content, seed: string, name: string): Session {
  const state = newGame(content, seed);
  const now = Date.now();
  return {
    content,
    state,
    record: {
      id: `save-${now.toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
      name,
      seed,
      packId: content.pack.meta.id,
      packVersion: content.pack.meta.version,
      commands: [],
      createdAt: now,
      updatedAt: now,
      summary: summary(state),
    },
  };
}

export function resumeSession(content: Content, record: SaveRecord): Session {
  if (record.packId !== content.pack.meta.id) throw new EngineError(`This save was made with content pack "${record.packId}".`);
  const state = replay(content, record.seed, record.commands);
  return { content, record, state };
}

export function choose(session: Session, cmd: Command): Session {
  const state = apply(session.state, session.content, cmd);
  const record = { ...session.record, commands: [...session.record.commands, cmd], updatedAt: Date.now(), summary: summary(state) };
  return { ...session, state, record };
}

export function undo(session: Session): Session {
  if (!session.record.commands.length) return session;
  const commands = session.record.commands.slice(0, -1);
  const state = replay(session.content, session.record.seed, commands);
  return { ...session, state, record: { ...session.record, commands, updatedAt: Date.now(), summary: summary(state) } };
}

export async function persist(store: Store, session: Session) {
  await store.putSave(session.record);
}

/** Everything needed to reproduce a game exactly, for bug reports and backups. */
export function exportable(session: Session) {
  return {
    format: 'lantern-table-save',
    version: 1,
    name: session.record.name,
    seed: session.record.seed,
    packId: session.record.packId,
    packVersion: session.record.packVersion,
    commands: session.record.commands,
  };
}

export { EngineError, IllegalCommand };
