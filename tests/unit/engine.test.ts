import { describe, expect, test } from 'vitest';
import pack from '../../src/content/standin/pack.json';
import { loadPack } from '../../src/content/validate';
import { autoChoice } from '../../src/engine/autoplay';
import { apply, Content, IllegalCommand, newGame, replay } from '../../src/engine/engine';
import type { Command, GameState } from '../../src/engine/state';

function content() {
  const r = loadPack(pack);
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return new Content(r.pack);
}

function play(c: Content, seed: string, maxCommands = 5000) {
  let s = newGame(c, seed);
  const commands: Command[] = [];
  const kinds = new Set<string>();
  while (!s.outcome && commands.length < maxCommands) {
    kinds.add(s.pending!.kind);
    const cmd = autoChoice(s, c);
    commands.push(cmd);
    s = apply(s, c, cmd);
  }
  return { s, commands, kinds };
}

describe('engine', () => {
  const c = content();

  test('a new game starts by choosing departing survivors', () => {
    const s = newGame(c, 'test-seed');
    expect(s.pending?.kind).toBe('departing');
    expect(s.survivors).toHaveLength(4);
    expect(s.log[0].text).toMatch(/founded/);
  });

  test('whole campaigns play to an outcome through every phase', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f']) {
      const { s, kinds } = play(c, seed);
      expect(s.outcome, `seed ${seed} never finished`).not.toBeNull();
      for (const k of ['departing', 'quarry', 'pickActivation', 'activation', 'move']) expect(kinds, `seed ${seed}`).toContain(k);
      expect(s.log.some((l) => /Showdown:/.test(l.text))).toBe(true);
      expect(s.log.some((l) => /Settlement phase/.test(l.text)) || s.outcome?.result === 'lost').toBe(true);
    }
  });

  test('at least one seed wins a showdown and reaches year 2 with rewards', () => {
    const wins = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((seed) => play(c, seed).s).filter((s) => s.settlement.defeatedQuarries.length > 0);
    expect(wins.length).toBeGreaterThan(0);
    expect(wins[0].log.some((l) => /^Rewards:/.test(l.text))).toBe(true);
  });

  test('the same seed and commands always give the same game', () => {
    const { s, commands } = play(c, 'determinism');
    const again = replay(c, 'determinism', commands);
    expect(again).toEqual(s);
  });

  test('undo is a replay without the last command', () => {
    let s = newGame(c, 'undo');
    const commands: Command[] = [];
    for (let i = 0; i < 12; i++) {
      const cmd = autoChoice(s, c);
      commands.push(cmd);
      s = apply(s, c, cmd);
    }
    const before = replay(c, 'undo', commands.slice(0, -1));
    expect(before.pending?.id).toBe(commands[commands.length - 1].decisionId);
  });

  test('illegal commands are refused with a reason and leave the state untouched', () => {
    const s = newGame(c, 'illegal');
    const snapshot = structuredClone(s);
    expect(() => apply(s, c, { decisionId: s.pending!.id + 1, optionId: 'confirm' })).toThrow(IllegalCommand);
    expect(() => apply(s, c, { decisionId: s.pending!.id, optionId: 'nope' })).toThrow(/isn't one of the options/);
    // Deselect everyone: confirming is then disabled.
    let t: GameState = s;
    for (const id of t.settlement.departing) t = apply(t, c, { decisionId: t.pending!.id, optionId: `toggle:${id}` });
    expect(() => apply(t, c, { decisionId: t.pending!.id, optionId: 'confirm' })).toThrow(/at least one survivor/);
    expect(s).toEqual(snapshot);
  });

  test('every log entry from a full game has text, and rolls carry their dice', () => {
    const { s } = play(c, 'log');
    for (const l of s.log) {
      expect(l.text.length).toBeGreaterThan(0);
      if (l.kind === 'roll' && l.rolls) expect(l.rolls.every((r) => r >= 1)).toBe(true);
    }
  });
});
