export type Species = 'blob' | 'sprout' | 'moth' | 'pebble';
export type Accessory = 'none' | 'leaf' | 'scarf' | 'flower' | 'crown';
export type HomeStyle = 'mushroom' | 'teapot' | 'stump' | 'shell';

/** Positions on the world map are percentages (0–100) of its width and height. */
export interface Point {
  x: number;
  y: number;
}

export interface Gift {
  id: string;
  fromId: string;
  item: string;
  note: string;
  createdAt: number;
}

export interface Creature {
  id: string;
  name: string;
  species: Species;
  color: string;
  accessory: Accessory;
  personality: string;
  status: string;
  homeStyle: HomeStyle;
  home: Point;
  gifts: Gift[];
}

/** A doodle is a set of strokes in a 100×100 coordinate space, so it stays tiny and scales cleanly. */
export interface Stroke {
  color: string;
  width: number;
  points: number[];
}

export type CreationKind = 'note' | 'emoji' | 'doodle';
export type ReactionKey = 'sprout' | 'heart' | 'sparkle' | 'giggle';

export interface Comment {
  id: string;
  authorId: string;
  text: string;
  createdAt: number;
}

export interface Creation {
  id: string;
  authorId: string;
  kind: CreationKind;
  text?: string;
  noteColor?: string;
  emoji?: string;
  strokes?: Stroke[];
  caption: string;
  prompt?: string;
  pos: Point;
  createdAt: number;
  reactions: Record<ReactionKey, string[]>;
  comments: Comment[];
}

export interface WorldState {
  version: 1;
  playerId: string;
  creatures: Creature[];
  creations: Creation[];
  onboarded: boolean;
  /** Growth milestones the player has already been told about. */
  seenMilestones: number;
}

export type Draft = Pick<Creation, 'kind' | 'text' | 'noteColor' | 'emoji' | 'strokes' | 'caption' | 'prompt'>;
