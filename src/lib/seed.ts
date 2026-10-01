import type { Creation, Creature, ReactionKey, Stroke, WorldState } from '../types';
import { DAILY_PROMPTS } from './content';

export const PLAYER_ID = 'me';

const MIN = 60_000;
const HOUR = 60 * MIN;

function reactions(partial: Partial<Record<ReactionKey, string[]>> = {}): Record<ReactionKey, string[]> {
  return { sprout: [], heart: [], sparkle: [], giggle: [], ...partial };
}

const leafBoat: Stroke[] = [
  { color: '#4d7c3a', width: 4, points: [15, 55, 30, 72, 50, 78, 70, 72, 85, 55, 50, 60, 15, 55] },
  { color: '#4d7c3a', width: 2, points: [20, 58, 50, 66, 80, 58] },
  { color: '#3b2a1e', width: 3, points: [50, 62, 50, 20] },
  { color: '#b04a26', width: 3, points: [50, 22, 72, 36, 50, 44] },
  { color: '#2f6690', width: 2, points: [8, 84, 22, 80, 36, 85, 50, 81, 64, 85, 78, 80, 92, 84] },
];

const sunflower: Stroke[] = [
  { color: '#4d7c3a', width: 4, points: [50, 95, 50, 50] },
  { color: '#4d7c3a', width: 3, points: [50, 75, 34, 66, 50, 70] },
  { color: '#c08a1e', width: 5, points: [50, 18, 62, 24, 68, 36, 62, 48, 50, 54, 38, 48, 32, 36, 38, 24, 50, 18] },
  { color: '#3b2a1e', width: 7, points: [47, 34, 53, 38, 49, 40] },
];

const teaTable: Stroke[] = [
  { color: '#3b2a1e', width: 4, points: [15, 55, 85, 55] },
  { color: '#3b2a1e', width: 3, points: [25, 55, 22, 85] },
  { color: '#3b2a1e', width: 3, points: [75, 55, 78, 85] },
  { color: '#b04a26', width: 3, points: [35, 52, 35, 40, 50, 40, 50, 52] },
  { color: '#b04a26', width: 2, points: [50, 43, 56, 46, 50, 49] },
  { color: '#2f6690', width: 3, points: [62, 52, 62, 44, 72, 44, 72, 52] },
  { color: '#8a4f9e', width: 2, points: [40, 34, 42, 26, 39, 20] },
];

const moonLantern: Stroke[] = [
  { color: '#3b2a1e', width: 2, points: [50, 5, 50, 22] },
  { color: '#c08a1e', width: 4, points: [38, 25, 62, 25, 66, 55, 50, 68, 34, 55, 38, 25] },
  { color: '#c08a1e', width: 2, points: [50, 25, 50, 66] },
  { color: '#8a4f9e', width: 3, points: [55, 38, 48, 42, 50, 50, 57, 52] },
  { color: '#c08a1e', width: 2, points: [25, 40, 18, 40] },
  { color: '#c08a1e', width: 2, points: [75, 40, 82, 40] },
];

export function createSeedWorld(now = Date.now()): WorldState {
  const creatures: Creature[] = [
    {
      id: PLAYER_ID, name: 'Nib', species: 'blob', color: '#e8a87c', accessory: 'leaf',
      personality: 'Curious', status: 'Just hatched and looking around!', homeStyle: 'mushroom',
      home: { x: 30, y: 55 },
      gifts: [{ id: 'g-welcome', fromId: 'pip', item: '🌼', note: 'Welcome to the meadow!', createdAt: now - 20 * MIN }],
    },
    {
      id: 'pip', name: 'Pip', species: 'sprout', color: '#9fc490', accessory: 'none',
      personality: 'Curious', status: 'Mapping every puddle in the meadow.', homeStyle: 'mushroom',
      home: { x: 16, y: 30 },
      gifts: [{ id: 'g1', fromId: 'dot', item: '🍓', note: 'for your map-making snacks', createdAt: now - 5 * HOUR }],
    },
    {
      id: 'mabel', name: 'Mabel', species: 'moth', color: '#b7a3d9', accessory: 'scarf',
      personality: 'Dreamy', status: 'Collecting moonbeams in a jar.', homeStyle: 'teapot',
      home: { x: 44, y: 24 }, gifts: [],
    },
    {
      id: 'bramble', name: 'Bramble', species: 'pebble', color: '#c9b79c', accessory: 'crown',
      personality: 'Grumpy but soft', status: 'Not baking cookies. Definitely not.', homeStyle: 'stump',
      home: { x: 82, y: 20 },
      gifts: [{ id: 'g2', fromId: 'wick', item: '🪶', note: '', createdAt: now - 26 * HOUR }],
    },
    {
      id: 'dot', name: 'Dot', species: 'blob', color: '#e98c9a', accessory: 'flower',
      personality: 'Bubbly', status: 'Throwing a puddle party at noon!!', homeStyle: 'shell',
      home: { x: 52, y: 60 }, gifts: [],
    },
    {
      id: 'juniper', name: 'Juniper', species: 'sprout', color: '#8ec5d6', accessory: 'scarf',
      personality: 'Brave', status: 'Climbed the tall daisy. Twice.', homeStyle: 'stump',
      home: { x: 12, y: 74 }, gifts: [],
    },
    {
      id: 'wick', name: 'Wick', species: 'moth', color: '#f2c85b', accessory: 'none',
      personality: 'Shy', status: '…reading by lamplight.', homeStyle: 'teapot',
      home: { x: 88, y: 50 }, gifts: [],
    },
    {
      id: 'pudding', name: 'Pudding', species: 'blob', color: '#f2c85b', accessory: 'leaf',
      personality: 'Sleepy', status: 'Napping. Please leave snacks.', homeStyle: 'mushroom',
      home: { x: 36, y: 84 }, gifts: [],
    },
    {
      id: 'fen', name: 'Fen', species: 'pebble', color: '#9fc490', accessory: 'flower',
      personality: 'Wise', status: 'Listening to the slow things.', homeStyle: 'shell',
      home: { x: 66, y: 86 }, gifts: [],
    },
  ];

  const yesterdayPrompt = DAILY_PROMPTS[1];
  const creations: Creation[] = [
    {
      id: 'c1', authorId: 'pip', kind: 'doodle', strokes: leafBoat, caption: 'A leaf boat for the pond regatta',
      prompt: DAILY_PROMPTS[0], pos: { x: 72, y: 70 }, createdAt: now - 12 * MIN,
      reactions: reactions({ sprout: ['dot', 'fen'], sparkle: ['mabel'] }),
      comments: [{ id: 'k1', authorId: 'juniper', text: 'Can I be captain?? ⛵', createdAt: now - 8 * MIN }],
    },
    {
      id: 'c2', authorId: 'dot', kind: 'emoji', emoji: '🎈', caption: 'PARTY BALLOON! everyone is invited',
      pos: { x: 57, y: 52 }, createdAt: now - 34 * MIN,
      reactions: reactions({ heart: ['pip', 'pudding', 'juniper'], giggle: ['bramble'] }),
      comments: [{ id: 'k2', authorId: 'bramble', text: 'Hmph. I might come.', createdAt: now - 30 * MIN }],
    },
    {
      id: 'c3', authorId: 'mabel', kind: 'note', noteColor: '#efe2f7',
      text: 'If you find this note, the moon says hello. 🌙', caption: '',
      pos: { x: 40, y: 13 }, createdAt: now - 70 * MIN,
      reactions: reactions({ sparkle: ['wick', 'fen', 'pip'] }), comments: [],
    },
    {
      id: 'c4', authorId: 'bramble', kind: 'doodle', strokes: teaTable, caption: 'Built a table. For no one. (For everyone.)',
      prompt: DAILY_PROMPTS[5], pos: { x: 74, y: 30 }, createdAt: now - 2 * HOUR,
      reactions: reactions({ heart: ['dot', 'mabel', 'juniper', 'pudding'] }),
      comments: [
        { id: 'k3', authorId: 'dot', text: 'BRAMBLE THIS IS SO CUTE', createdAt: now - 100 * MIN },
        { id: 'k4', authorId: 'bramble', text: 'it is a normal amount of cute', createdAt: now - 95 * MIN },
      ],
    },
    {
      id: 'c5', authorId: 'pudding', kind: 'emoji', emoji: '🧺', caption: 'Snack basket. Help yourself. zzz',
      pos: { x: 28, y: 76 }, createdAt: now - 3 * HOUR,
      reactions: reactions({ giggle: ['pip'], heart: ['juniper'] }), comments: [],
    },
    {
      id: 'c6', authorId: 'fen', kind: 'note', noteColor: '#e2f2d5',
      text: 'Small steps make long paths. Walk slowly past the moss today.', caption: '',
      pos: { x: 58, y: 80 }, createdAt: now - 5 * HOUR,
      reactions: reactions({ sprout: ['mabel', 'wick'] }), comments: [],
    },
    {
      id: 'c7', authorId: 'juniper', kind: 'doodle', strokes: sunflower, caption: 'The tall daisy (it is actually a sunflower)',
      pos: { x: 9, y: 60 }, createdAt: now - 7 * HOUR,
      reactions: reactions({ sparkle: ['pip', 'dot'], giggle: ['bramble', 'pudding'] }),
      comments: [{ id: 'k5', authorId: 'pip', text: 'How did you get up there?!', createdAt: now - 6 * HOUR }],
    },
    {
      id: 'c8', authorId: 'wick', kind: 'doodle', strokes: moonLantern, caption: '…made a lantern. it glows a bit.',
      prompt: yesterdayPrompt, pos: { x: 90, y: 66 }, createdAt: now - 20 * HOUR,
      reactions: reactions({ sparkle: ['mabel', 'fen', 'dot', 'pip'] }),
      comments: [{ id: 'k6', authorId: 'mabel', text: 'It matches my moonbeams ✨', createdAt: now - 19 * HOUR }],
    },
    {
      id: 'c9', authorId: 'pip', kind: 'emoji', emoji: '🪺', caption: 'Found an empty nest. Leaving it for a new friend.',
      pos: { x: 22, y: 18 }, createdAt: now - 26 * HOUR,
      reactions: reactions({ heart: ['fen'] }), comments: [],
    },
    {
      id: 'c10', authorId: 'dot', kind: 'note', noteColor: '#ffe0d6',
      text: 'PUDDLE PARTY RULES: 1) splash 2) splash more 3) snacks', caption: '',
      pos: { x: 48, y: 70 }, createdAt: now - 30 * HOUR,
      reactions: reactions({ giggle: ['pip', 'juniper', 'wick'] }), comments: [],
    },
  ];

  return { version: 1, playerId: PLAYER_ID, creatures, creations, onboarded: false, seenMilestones: 1 };
}
