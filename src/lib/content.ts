import type { Accessory, HomeStyle, ReactionKey, Species } from '../types';

export const SPECIES: { id: Species; label: string }[] = [
  { id: 'blob', label: 'Puddle blob' },
  { id: 'sprout', label: 'Sprout sprite' },
  { id: 'moth', label: 'Velvet moth' },
  { id: 'pebble', label: 'Pebble pal' },
];

export const ACCESSORIES: { id: Accessory; label: string }[] = [
  { id: 'none', label: 'Nothing' },
  { id: 'leaf', label: 'Leaf hat' },
  { id: 'scarf', label: 'Cozy scarf' },
  { id: 'flower', label: 'Flower' },
  { id: 'crown', label: 'Twig crown' },
];

export const HOME_STYLES: { id: HomeStyle; label: string }[] = [
  { id: 'mushroom', label: 'Mushroom cottage' },
  { id: 'teapot', label: 'Teapot house' },
  { id: 'stump', label: 'Stump burrow' },
  { id: 'shell', label: 'Snail-shell hut' },
];

export const COLORS = ['#e8a87c', '#9fc490', '#f2c85b', '#b7a3d9', '#8ec5d6', '#e98c9a', '#c9b79c'];

export const PERSONALITIES = [
  'Curious',
  'Dreamy',
  'Grumpy but soft',
  'Bubbly',
  'Brave',
  'Shy',
  'Sleepy',
  'Wise',
  'Mischievous',
  'Gentle',
];

export const REACTIONS: { key: ReactionKey; emoji: string; label: string }[] = [
  { key: 'sprout', emoji: '🌱', label: 'Growing on me' },
  { key: 'heart', emoji: '💛', label: 'Love it' },
  { key: 'sparkle', emoji: '✨', label: 'Magical' },
  { key: 'giggle', emoji: '😄', label: 'Made me giggle' },
];

export const GIFTS: { item: string; label: string }[] = [
  { item: '🌰', label: 'Acorn' },
  { item: '🪨', label: 'Smooth pebble' },
  { item: '🌼', label: 'Daisy' },
  { item: '🍓', label: 'Berry' },
  { item: '🪶', label: 'Feather' },
  { item: '🐚', label: 'Shell' },
  { item: '🍄', label: 'Mushroom' },
  { item: '💌', label: 'Tiny letter' },
];

export const EMOJI_PALETTE = [
  '🌻', '🍄', '🌈', '🪺', '🐌', '🐞', '🦔', '🐸', '🏮', '🪁',
  '⛲', '🛶', '🧺', '🍵', '🎐', '🪴', '🌙', '⭐', '🧶', '🍰',
  '🪵', '🍂', '🌷', '🐝', '🎈', '🫖', '🪷', '🕯️', '🎪', '🗿',
];

export const NOTE_COLORS = ['#fff4c7', '#ffe0d6', '#e2f2d5', '#dde9f7', '#efe2f7'];

export const DOODLE_COLORS = ['#3b2a1e', '#b04a26', '#4d7c3a', '#2f6690', '#c08a1e', '#8a4f9e'];

export const KIND_COMMENTS = ['So cozy! 🧡', 'I love this 🌱', 'How did you make it?', 'My creature wants one!', 'This made my day ✨'];

export const DAILY_PROMPTS = [
  'Make something your creature would build from a leaf.',
  'Draw the snack your creature packs for an adventure.',
  'Leave a note for whoever finds it next.',
  'What does your creature hang above their door?',
  'Invent a tiny holiday and show its decoration.',
  'Build a place where two creatures could share tea.',
  'What would your creature plant if it could grow anything?',
  'Make a sign for a road that does not exist yet.',
  'Draw a hat for a very small snail.',
  'Leave something that glows at night.',
  'What does your creature collect, secretly?',
  'Design a bench for watching clouds.',
  'Write a weather report for the world today.',
  'Make a tiny boat for the pond.',
];

export function dayIndex(date = new Date()): number {
  const start = Date.UTC(date.getFullYear(), 0, 0);
  const now = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.floor((now - start) / 86_400_000);
}

export function promptForDay(date = new Date()): string {
  return DAILY_PROMPTS[dayIndex(date) % DAILY_PROMPTS.length];
}

/** Things neighbours say when you tap them, keyed by personality. */
export const CHATTER: Record<string, string[]> = {
  Curious: ['What’s that over there?', 'I counted 14 ladybugs today!', 'Did the river always hum?'],
  Dreamy: ['The clouds look like teacups…', 'I dreamt the moon was a lantern.', 'Shh, the moss is thinking.'],
  'Grumpy but soft': ['Hmph. Nice weather. I guess.', 'Don’t tell anyone I made cookies.', 'Fine. You can sit here.'],
  Bubbly: ['HELLO HELLO HELLO!', 'Best day ever, again!', 'Wanna race to the pond?'],
  Brave: ['I climbed the tall daisy!', 'No puddle too deep!', 'Adventure awaits, friend.'],
  Shy: ['…oh! hi.', '(waves very small)', 'I like your hat. Um. Bye.'],
  Sleepy: ['*yawn* five more minutes…', 'Zzz… huh? Oh, hello.', 'Naps are a kind of travel.'],
  Wise: ['Small steps make long paths.', 'Every pebble was once a mountain.', 'Listen to the slow things.'],
  Mischievous: ['I did NOT hide your acorn.', 'Hehe. Look behind you.', 'Wanna see a trick?'],
  Gentle: ['Have you had water today?', 'The flowers missed you.', 'Rest here a while.'],
};

export const THANK_YOUS = [
  'gasps and hugs the gift tightly!',
  'puts it right on the windowsill.',
  'does a tiny happy dance.',
  'says “I’ll treasure it forever!”',
  'wiggles with joy.',
];

/** As the community makes more things, the world grows new features. */
export const MILESTONES: { at: number; label: string }[] = [
  { at: 8, label: 'Wildflowers bloomed along the path' },
  { at: 12, label: 'Lanterns now light the trail' },
  { at: 14, label: 'Someone built a little bridge over the stream' },
  { at: 17, label: 'A hot-air balloon drifts over the hills' },
  { at: 20, label: 'A tiny lighthouse rose by the pond' },
];
