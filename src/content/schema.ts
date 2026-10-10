// Content schemas. Everything the engine knows about cards, monsters, events, gear and rule
// numbers comes from a content pack that must pass these schemas (and the cross-reference
// checks in validate.ts) before a campaign can start. Correcting content never needs an
// engine change.
import { z } from 'zod';

export const LOCATIONS = ['head', 'arms', 'body', 'waist', 'legs'] as const;
export const Loc = z.enum(LOCATIONS);
export type Loc = z.infer<typeof Loc>;

export const STATS = ['movement', 'accuracy', 'strength', 'evasion', 'luck', 'speed'] as const;
export const Stat = z.enum(STATS);
export type Stat = z.infer<typeof Stat>;

const Id = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'ids are lower-case words joined by hyphens');

/** Who an effect applies to. */
export const Who = z.enum([
  'attacker', // the survivor whose attack caused this (hit location cards)
  'target', // the monster's current target
  'all', // every survivor still in play
  'random', // one random survivor in play
  'choose', // the player picks one survivor in play
]);
export type Who = z.infer<typeof Who>;

/** The effect language. Anything it can't express is written as `manual`, which pauses the
 *  game and asks the player to apply it by hand, so nothing is ever skipped silently. */
export type Effect =
  | { op: 'log'; text: string }
  | { op: 'manual'; text: string }
  | { op: 'damage'; who: Who; amount: number; location?: Loc | 'random' }
  | { op: 'knockdown'; who: Who }
  | { op: 'survival'; who: Who; amount: number }
  | { op: 'insanity'; who: Who; amount: number }
  | { op: 'stat'; who: Who; stat: Stat; amount: number; duration: 'showdown' | 'permanent' }
  | { op: 'resource'; id: string; count: number }
  | { op: 'huntMove'; spaces: number }
  | { op: 'knockback'; who: Who; spaces: number }
  | { op: 'severeInjury'; who: Who; location: Loc | 'random' }
  | { op: 'death'; who: Who; cause: string }
  | { op: 'choice'; prompt: string; options: { label: string; detail?: string; effects: Effect[] }[] }
  | { op: 'roll'; label: string; die: number; table: { min: number; max: number; label: string; effects: Effect[] }[] };

export const Effect: z.ZodType<Effect> = z.lazy(() =>
  z.discriminatedUnion('op', [
    z.object({ op: z.literal('log'), text: z.string() }),
    z.object({ op: z.literal('manual'), text: z.string() }),
    z.object({ op: z.literal('damage'), who: Who, amount: z.number().int().min(1), location: z.union([Loc, z.literal('random')]).optional() }),
    z.object({ op: z.literal('knockdown'), who: Who }),
    z.object({ op: z.literal('survival'), who: Who, amount: z.number().int() }),
    z.object({ op: z.literal('insanity'), who: Who, amount: z.number().int() }),
    z.object({ op: z.literal('stat'), who: Who, stat: Stat, amount: z.number().int(), duration: z.enum(['showdown', 'permanent']) }),
    z.object({ op: z.literal('resource'), id: Id, count: z.number().int().min(1) }),
    z.object({ op: z.literal('huntMove'), spaces: z.number().int() }),
    z.object({ op: z.literal('knockback'), who: Who, spaces: z.number().int().min(1) }),
    z.object({ op: z.literal('severeInjury'), who: Who, location: z.union([Loc, z.literal('random')]) }),
    z.object({ op: z.literal('death'), who: Who, cause: z.string() }),
    z.object({
      op: z.literal('choice'),
      prompt: z.string(),
      options: z.array(z.object({ label: z.string(), detail: z.string().optional(), effects: z.array(Effect) })).min(2),
    }),
    z.object({
      op: z.literal('roll'),
      label: z.string(),
      die: z.number().int().min(2),
      table: z.array(z.object({ min: z.number().int(), max: z.number().int(), label: z.string(), effects: z.array(Effect) })).min(1),
    }),
  ]),
);

const Effects = z.array(Effect).default([]);

/** Every rule number the engine uses, with a note on how sure we are of it. */
export const Verification = z.object({
  status: z.enum(['verified', 'unverified', 'standin']),
  note: z.string(),
});

export const RulesConfig = z.object({
  board: z.object({ width: z.number().int().min(8), height: z.number().int().min(8) }),
  survivorBase: z.object({
    movement: z.number().int(),
    accuracy: z.number().int(),
    strength: z.number().int(),
    evasion: z.number().int(),
    luck: z.number().int(),
    speed: z.number().int(),
    survival: z.number().int().min(0),
    insanity: z.number().int().min(0),
  }),
  survivalLimitStart: z.number().int().min(0),
  /** Faces of the survivor hit location die, in order. */
  hitLocationDie: z.array(Loc).min(2),
  /** Locations that skip the light injury box (a first injury there is already heavy). */
  noLightInjury: z.array(Loc),
  /** A natural 10 on a survivor's to-hit or to-wound roll always succeeds. */
  lanternAlwaysSucceeds: z.boolean(),
  /** A natural 1 on a survivor's to-hit or to-wound roll always fails. */
  oneAlwaysFails: z.boolean(),
  /** How a to-wound total is compared with toughness. */
  woundCompare: z.enum(['greaterThan', 'atLeast']),
  /** Base critical threshold on the natural to-wound die before luck. */
  criticalOn: z.number().int().min(2).max(10),
  /** A natural 10 on a monster's attack die always hits. */
  monsterLanternAlwaysHits: z.boolean(),
  maxDeparting: z.number().int().min(1),
  huntBoardLength: z.number().int().min(3),
  endeavorsPerReturningSurvivor: z.number().int().min(0),
  /** The weapon every survivor always has. */
  unarmedWeapon: Id,
  /** Whether survivors and the monster may move and count adjacency diagonally. */
  diagonalMovement: z.boolean(),
  /** 'oneLevel': damage that gets past armor raises the injury by one level per hit.
   *  'perPoint': every point past armor raises it by one level. */
  injuryPerHit: z.enum(['oneLevel', 'perPoint']),
  /** Survivors may spend survival to dodge one hit, once per round. */
  dodge: z.object({ enabled: z.boolean(), cost: z.number().int().min(1) }),
  monsterActsFirst: z.boolean(),
  verification: z.record(z.string(), Verification),
});
export type RulesConfig = z.infer<typeof RulesConfig>;

export const Resource = z.object({
  id: Id,
  name: z.string(),
  kind: z.enum(['basic', 'monster', 'strange']),
  keywords: z.array(z.string()).default([]),
});
export type Resource = z.infer<typeof Resource>;

export const Gear = z.object({
  id: Id,
  name: z.string(),
  keywords: z.array(z.string()).default([]),
  text: z.string().default(''),
  weapon: z
    .object({ speed: z.number().int().min(1), accuracy: z.number().int().min(1).max(10), strength: z.number().int(), range: z.number().int().min(1).default(1) })
    .optional(),
  armor: z.object({ locations: z.array(Loc).min(1), value: z.number().int().min(1) }).optional(),
  /** Showdown-long stat bonuses while carried. */
  bonuses: z.partialRecord(Stat, z.number().int()).default({}),
  /** Resources spent to craft: an id, or `keyword:<word>` for any resource with that keyword. */
  cost: z.record(z.string(), z.number().int().min(1)).default({}),
  craftedAt: Id.optional(),
});
export type Gear = z.infer<typeof Gear>;

export const SettlementLocation = z.object({
  id: Id,
  name: z.string(),
  text: z.string().default(''),
  buildCost: z.object({ endeavors: z.number().int().min(0), resources: z.record(z.string(), z.number().int().min(1)).default({}) }),
  startsBuilt: z.boolean().default(false),
});
export type SettlementLocation = z.infer<typeof SettlementLocation>;

export const Innovation = z.object({
  id: Id,
  name: z.string(),
  text: z.string(),
  endeavors: z.number().int().min(0).default(1),
  /** Permanent settlement-wide changes applied when gained. */
  grants: z
    .object({
      survivalLimit: z.number().int().default(0),
      newSurvivorStats: z.partialRecord(Stat, z.number().int()).default({}),
      endeavorsPerYear: z.number().int().default(0),
    })
    .default({ survivalLimit: 0, newSurvivorStats: {}, endeavorsPerYear: 0 }),
  requires: z.array(Id).default([]),
});
export type Innovation = z.infer<typeof Innovation>;

export const Targeting = z.enum(['closest', 'closestInFront', 'lastAttacker', 'mostInjured', 'random']);
export type Targeting = z.infer<typeof Targeting>;

export const AICard = z.object({
  id: Id,
  name: z.string(),
  tier: z.enum(['basic', 'advanced', 'legendary']),
  text: z.string(),
  targeting: Targeting,
  /** Targets beyond this many spaces (after moving) are out of reach this turn. */
  reach: z.number().int().min(1).default(99),
  move: z.boolean().default(true),
  attack: z.object({ speed: z.number().int().min(1), accuracy: z.number().int().min(1).max(10), damage: z.number().int().min(1) }).optional(),
  before: Effects,
  onHit: Effects,
  noTarget: Effects,
});
export type AICard = z.infer<typeof AICard>;

export const HitLocation = z.object({
  id: Id,
  name: z.string(),
  text: z.string().default(''),
  trap: z.boolean().default(false),
  impervious: z.boolean().default(false),
  reflex: Effects,
  failure: Effects,
  wound: Effects,
  critical: Effects,
});
export type HitLocation = z.infer<typeof HitLocation>;

export const MonsterLevel = z.object({
  level: z.number().int().min(1),
  movement: z.number().int().min(1),
  toughness: z.number().int().min(1),
  accuracyMod: z.number().int().default(0),
  damageMod: z.number().int().default(0),
  evasion: z.number().int().default(0),
  luck: z.number().int().default(0),
  aiDeck: z.object({ basic: z.number().int().min(0), advanced: z.number().int().min(0), legendary: z.number().int().min(0) }),
  huntPosition: z.number().int().min(1),
  rewards: z.object({ basic: z.number().int().min(0), monster: z.number().int().min(0) }),
});

export const Monster = z.object({
  id: Id,
  name: z.string(),
  kind: z.enum(['quarry', 'nemesis']),
  text: z.string().default(''),
  size: z.object({ w: z.number().int().min(1), h: z.number().int().min(1) }),
  levels: z.array(MonsterLevel).min(1),
  aiCards: z.array(AICard).min(1),
  hitLocations: z.array(HitLocation).min(1),
  /** Monster resource deck: resource id → copies. */
  resourceDeck: z.record(Id, z.number().int().min(1)),
  /** Optional monster-specific hunt events placed along the hunt board. */
  huntSpaces: z.record(z.string(), Id).default({}),
});
export type Monster = z.infer<typeof Monster>;

export const HuntEvent = z.object({
  id: Id,
  name: z.string(),
  text: z.string(),
  effects: Effects,
});
export type HuntEvent = z.infer<typeof HuntEvent>;

export const RollTable = z.object({
  die: z.number().int().min(2),
  entries: z.array(z.object({ min: z.number().int(), max: z.number().int(), name: z.string(), text: z.string().default(''), effects: Effects, record: z.boolean().default(true) })).min(1),
});
export type RollTable = z.infer<typeof RollTable>;

export const ContentPack = z.object({
  meta: z.object({
    id: Id,
    name: z.string(),
    version: z.string(),
    /** 'original-standin' ships in the repo; 'user-provided' packs stay in the player's browser. */
    source: z.enum(['original-standin', 'user-provided']),
    notes: z.string().default(''),
  }),
  rules: RulesConfig,
  resources: z.array(Resource).min(1),
  gear: z.array(Gear).min(1),
  locations: z.array(SettlementLocation).min(1),
  innovations: z.array(Innovation).default([]),
  monsters: z.array(Monster).min(1),
  huntEvents: z.array(HuntEvent).min(1),
  huntEventTable: z.object({ die: z.number().int().min(2), entries: z.array(z.object({ min: z.number().int(), max: z.number().int(), event: Id })).min(1) }),
  basicResourceDeck: z.record(Id, z.number().int().min(1)),
  severeInjuries: z.record(Loc, RollTable),
  timeline: z.array(z.object({ year: z.number().int().min(1), name: z.string(), text: z.string(), effects: Effects })).default([]),
  campaign: z.object({
    name: z.string(),
    settlementName: z.string(),
    startingSurvivors: z.number().int().min(1),
    survivorNames: z.array(z.string()).min(4),
    startingResources: z.record(Id, z.number().int().min(1)).default({}),
    startingGear: z.array(Id).default([]),
    startingQuarry: Id,
    lastYear: z.number().int().min(1),
  }),
});
export type ContentPack = z.infer<typeof ContentPack>;
