import { useEffect, useReducer } from 'react';
import type { Creation, Creature, Draft, Point, ReactionKey, WorldState } from '../types';
import { MILESTONES } from './content';
import { createSeedWorld } from './seed';

export const STORAGE_KEY = 'tiny-civilization:v1';

export type Action =
  | { type: 'updatePlayer'; patch: Partial<Omit<Creature, 'id' | 'gifts'>> }
  | { type: 'finishOnboarding' }
  | { type: 'addCreation'; id: string; draft: Draft; pos: Point; now: number }
  | { type: 'toggleReaction'; creationId: string; key: ReactionKey; by: string }
  | { type: 'addComment'; creationId: string; text: string; by: string; id: string; now: number }
  | { type: 'giveGift'; toId: string; item: string; note: string; id: string; now: number }
  | { type: 'seeMilestones'; count: number }
  | { type: 'reset'; now: number };

export function uid(prefix = 'id'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function milestonesReached(creationCount: number): number {
  return MILESTONES.filter((m) => creationCount >= m.at).length;
}

function mapCreation(state: WorldState, id: string, fn: (c: Creation) => Creation): WorldState {
  return { ...state, creations: state.creations.map((c) => (c.id === id ? fn(c) : c)) };
}

export function reducer(state: WorldState, action: Action): WorldState {
  switch (action.type) {
    case 'updatePlayer':
      return {
        ...state,
        creatures: state.creatures.map((c) => (c.id === state.playerId ? { ...c, ...action.patch } : c)),
      };
    case 'finishOnboarding':
      return { ...state, onboarded: true };
    case 'addCreation': {
      const creation: Creation = {
        ...action.draft,
        id: action.id,
        authorId: state.playerId,
        pos: action.pos,
        createdAt: action.now,
        reactions: { sprout: [], heart: [], sparkle: [], giggle: [] },
        comments: [],
      };
      return { ...state, creations: [creation, ...state.creations] };
    }
    case 'toggleReaction':
      return mapCreation(state, action.creationId, (c) => {
        const current = c.reactions[action.key];
        const next = current.includes(action.by) ? current.filter((id) => id !== action.by) : [...current, action.by];
        return { ...c, reactions: { ...c.reactions, [action.key]: next } };
      });
    case 'addComment': {
      const text = action.text.trim().slice(0, 140);
      if (!text) return state;
      return mapCreation(state, action.creationId, (c) => ({
        ...c,
        comments: [...c.comments, { id: action.id, authorId: action.by, text, createdAt: action.now }],
      }));
    }
    case 'giveGift':
      return {
        ...state,
        creatures: state.creatures.map((c) =>
          c.id === action.toId
            ? {
                ...c,
                gifts: [
                  { id: action.id, fromId: state.playerId, item: action.item, note: action.note.trim().slice(0, 80), createdAt: action.now },
                  ...c.gifts,
                ],
              }
            : c,
        ),
      };
    case 'seeMilestones':
      return { ...state, seenMilestones: Math.max(state.seenMilestones, action.count) };
    case 'reset':
      return createSeedWorld(action.now);
  }
}

function isWorldState(value: unknown): value is WorldState {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<WorldState>;
  return v.version === 1 && Array.isArray(v.creatures) && Array.isArray(v.creations) && typeof v.playerId === 'string';
}

export function loadWorld(): WorldState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isWorldState(parsed)) return parsed;
    }
  } catch {
    // Storage can be unavailable (private mode, blocked site data); fall back to a fresh world.
  }
  return createSeedWorld();
}

export function useWorld() {
  const [state, dispatch] = useReducer(reducer, undefined, loadWorld);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore quota or access errors; the session still works in memory.
    }
  }, [state]);
  return [state, dispatch] as const;
}
