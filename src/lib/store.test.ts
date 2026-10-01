import { describe, expect, it } from 'vitest';
import { MILESTONES, promptForDay } from './content';
import { createSeedWorld, PLAYER_ID } from './seed';
import { milestonesReached, reducer } from './store';

const NOW = 1_700_000_000_000;

describe('world reducer', () => {
  it('adds a creation authored by the player at the chosen spot', () => {
    const world = createSeedWorld(NOW);
    const next = reducer(world, {
      type: 'addCreation',
      id: 'new',
      draft: { kind: 'emoji', emoji: '🍄', caption: 'hi' },
      pos: { x: 10, y: 20 },
      now: NOW,
    });
    expect(next.creations[0]).toMatchObject({ id: 'new', authorId: PLAYER_ID, pos: { x: 10, y: 20 }, emoji: '🍄' });
    expect(next.creations).toHaveLength(world.creations.length + 1);
  });

  it('toggles a reaction on and off', () => {
    const world = createSeedWorld(NOW);
    const on = reducer(world, { type: 'toggleReaction', creationId: 'c1', key: 'heart', by: PLAYER_ID });
    expect(on.creations.find((c) => c.id === 'c1')!.reactions.heart).toContain(PLAYER_ID);
    const off = reducer(on, { type: 'toggleReaction', creationId: 'c1', key: 'heart', by: PLAYER_ID });
    expect(off.creations.find((c) => c.id === 'c1')!.reactions.heart).not.toContain(PLAYER_ID);
  });

  it('ignores blank comments and trims real ones', () => {
    const world = createSeedWorld(NOW);
    const blank = reducer(world, { type: 'addComment', creationId: 'c3', text: '   ', by: PLAYER_ID, id: 'k', now: NOW });
    expect(blank).toBe(world);
    const real = reducer(world, { type: 'addComment', creationId: 'c3', text: '  lovely  ', by: PLAYER_ID, id: 'k', now: NOW });
    expect(real.creations.find((c) => c.id === 'c3')!.comments.at(-1)!.text).toBe('lovely');
  });

  it('puts gifts on the recipient’s shelf', () => {
    const world = createSeedWorld(NOW);
    const next = reducer(world, { type: 'giveGift', toId: 'mabel', item: '🌰', note: 'for you', id: 'g', now: NOW });
    expect(next.creatures.find((c) => c.id === 'mabel')!.gifts[0]).toMatchObject({ fromId: PLAYER_ID, item: '🌰', note: 'for you' });
  });

  it('only edits the player’s own creature', () => {
    const world = createSeedWorld(NOW);
    const next = reducer(world, { type: 'updatePlayer', patch: { name: 'Mochi' } });
    expect(next.creatures.find((c) => c.id === PLAYER_ID)!.name).toBe('Mochi');
    expect(next.creatures.filter((c) => c.name === 'Mochi')).toHaveLength(1);
  });
});

describe('world growth', () => {
  it('starts with the first milestone already reached and already announced', () => {
    const world = createSeedWorld(NOW);
    expect(milestonesReached(world.creations.length)).toBe(world.seenMilestones);
  });

  it('unlocks every milestone eventually', () => {
    expect(milestonesReached(MILESTONES.at(-1)!.at)).toBe(MILESTONES.length);
  });
});

describe('daily prompt', () => {
  it('is stable within a day and changes the next day', () => {
    const morning = new Date(2026, 3, 10, 8);
    const night = new Date(2026, 3, 10, 23);
    const tomorrow = new Date(2026, 3, 11, 8);
    expect(promptForDay(morning)).toBe(promptForDay(night));
    expect(promptForDay(tomorrow)).not.toBe(promptForDay(morning));
  });
});
