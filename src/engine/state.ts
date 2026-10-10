// The whole game, as plain serialisable data. Nothing here holds functions or class
// instances, so a state can be cloned, saved, diffed and replayed.
import type { Effect, Loc, Stat } from '../content/schema';
import type { RngState } from './rng';

export type Phase = 'hunt' | 'showdown' | 'settlement' | 'over';

export interface InjuryBoxes {
  armor: number;
  light: boolean;
  heavy: boolean;
}

export interface Survivor {
  id: string;
  name: string;
  alive: boolean;
  causeOfDeath?: string;
  /** Permanent stats (base plus permanent changes). */
  stats: Record<Stat, number>;
  survival: number;
  insanity: number;
  huntXp: number;
  injuries: string[];
  disorders: string[];
  fightingArts: string[];
  abilities: string[];
  /** Gear ids carried. The 3×3 gear grid and its affinities are in the rules backlog. */
  gear: string[];
  /** Armor and injury boxes while away from the settlement (hunt and showdown); null at home. */
  body: Record<Loc, InjuryBoxes> | null;
}

/** Per-survivor state that only exists during a showdown. */
export interface Combatant {
  survivorId: string;
  x: number;
  y: number;
  mods: Partial<Record<Stat, number>>;
  knockedDown: boolean;
  /** Skip the next activation (knocked down during the monster turn). */
  standsAtEndOfTurn: boolean;
  moved: boolean;
  acted: boolean;
  dodgedThisRound: boolean;
  /** Finished activating this survivors' turn. */
  turnDone: boolean;
  out: boolean;
}

export type Facing = 'N' | 'E' | 'S' | 'W';

export interface ShowdownState {
  monsterId: string;
  level: number;
  round: number;
  turn: 'monster' | 'survivors';
  monster: { x: number; y: number; facing: Facing; mods: Partial<Record<'evasion' | 'accuracy' | 'toughness' | 'damage', number>> };
  aiDeck: string[];
  aiDiscard: string[];
  woundStack: string[];
  hlDeck: string[];
  hlDiscard: string[];
  combatants: Combatant[];
  /** Survivor activating right now. */
  active: string | null;
  lastAttacker: string | null;
  currentAi: string | null;
  target: string | null;
  result: 'victory' | 'defeat' | null;
}

export interface HuntState {
  monsterId: string;
  level: number;
  survivorPos: number;
  monsterPos: number;
  turn: number;
  eventsSeen: string[];
}

export interface SettlementState {
  name: string;
  year: number;
  survivalLimit: number;
  resources: Record<string, number>;
  gearStorage: Record<string, number>;
  locations: string[];
  innovations: string[];
  endeavors: number;
  deaths: number;
  departing: string[];
  defeatedQuarries: { monsterId: string; level: number; year: number }[];
}

export interface DecisionOption {
  id: string;
  label: string;
  detail?: string;
  /** If set, the option is shown but can't be chosen, and this says why. */
  disabled?: string;
  /** Board square this option refers to (movement and placement). */
  cell?: [number, number];
  survivorId?: string;
  group?: string;
  danger?: boolean;
}

export interface Decision {
  id: number;
  kind: string;
  title: string;
  prompt: string;
  /** Survivor the decision is about, if any. */
  actor?: string;
  options: DecisionOption[];
  /** Kind-specific data the handler needs when the choice comes back. */
  data?: Record<string, unknown>;
}

export interface LogEntry {
  seq: number;
  year: number;
  phase: Phase;
  kind: 'info' | 'roll' | 'choice' | 'rule' | 'manual' | 'warn' | 'phase';
  text: string;
  /** Why it happened: the rule or card that caused it, and the numbers compared. */
  why?: string;
  rolls?: number[];
}

/** Who an effect's `attacker` and `target` refer to. */
export interface EffectCtx {
  attacker?: string;
  target?: string;
  source: string;
}

/** Work waiting to be done. The engine runs jobs until one needs a player decision. */
export type Job =
  | { t: 'effect'; effect: Effect; ctx: EffectCtx }
  | { t: 'yearStart' }
  | { t: 'chooseDeparting' }
  | { t: 'chooseQuarry' }
  | { t: 'huntTurn' }
  | { t: 'showdownSetup' }
  | { t: 'roundStart' }
  | { t: 'monsterTurn' }
  | { t: 'monsterAct'; cardId: string; targetId: string | null }
  | { t: 'monsterAttack'; cardId: string; targetId: string }
  | { t: 'monsterHits'; cardId: string; targetId: string; hits: number }
  | { t: 'applyHit'; targetId: string; cardId: string; hitIndex: number }
  | { t: 'onHitEffects'; cardId: string; targetId: string }
  | { t: 'survivorsTurn' }
  | { t: 'pickActivation' }
  | { t: 'activation'; survivorId: string }
  | { t: 'attackRoll'; survivorId: string; gearId: string }
  | { t: 'resolveHitLocation'; survivorId: string; gearId: string; cardId: string }
  | { t: 'woundRoll'; survivorId: string; gearId: string; cardId: string }
  | { t: 'checkShowdownEnd' }
  | { t: 'survivorsTurnEnd' }
  | { t: 'aftermath' }
  | { t: 'settlementStart' }
  | { t: 'settlementActions' }
  | { t: 'yearEnd' };

export interface GameState {
  version: 1;
  seed: string;
  packId: string;
  rng: RngState;
  phase: Phase;
  settlement: SettlementState;
  survivors: Survivor[];
  hunt: HuntState | null;
  showdown: ShowdownState | null;
  queue: Job[];
  pending: Decision | null;
  nextDecisionId: number;
  log: LogEntry[];
  outcome: { result: 'won' | 'lost'; text: string } | null;
}

/** A player's answer to a decision. The full list of these, plus the seed, is a save. */
export interface Command {
  decisionId: number;
  optionId: string;
}
