// Shared engine helpers: content lookup, the log, asking for decisions, queueing work and
// computing survivors' current numbers.
import type { ContentPack, Gear, HuntEvent, Innovation, Loc, Monster, Resource, SettlementLocation, Stat } from '../content/schema';
import { LOCATIONS, STATS } from '../content/schema';
import { roll } from './rng';
import type { Combatant, Decision, DecisionOption, GameState, InjuryBoxes, Job, LogEntry, Survivor } from './state';

export class EngineError extends Error {}
/** A command that isn't legal right now (stale decision, unknown or disabled option). */
export class IllegalCommand extends Error {}

/** Read-only, indexed view of a validated content pack. */
export class Content {
  readonly gear = new Map<string, Gear>();
  readonly resources = new Map<string, Resource>();
  readonly locations = new Map<string, SettlementLocation>();
  readonly innovations = new Map<string, Innovation>();
  readonly monsters = new Map<string, Monster>();
  readonly events = new Map<string, HuntEvent>();
  constructor(readonly pack: ContentPack) {
    for (const g of pack.gear) this.gear.set(g.id, g);
    for (const r of pack.resources) this.resources.set(r.id, r);
    for (const l of pack.locations) this.locations.set(l.id, l);
    for (const i of pack.innovations) this.innovations.set(i.id, i);
    for (const m of pack.monsters) this.monsters.set(m.id, m);
    for (const e of pack.huntEvents) this.events.set(e.id, e);
  }
  get rules() {
    return this.pack.rules;
  }
  monster(id: string): Monster {
    const m = this.monsters.get(id);
    if (!m) throw new EngineError(`Unknown monster "${id}"`);
    return m;
  }
  level(monsterId: string, level: number) {
    const l = this.monster(monsterId).levels.find((x) => x.level === level);
    if (!l) throw new EngineError(`Monster "${monsterId}" has no level ${level}`);
    return l;
  }
  aiCard(monsterId: string, cardId: string) {
    const card = this.monster(monsterId).aiCards.find((x) => x.id === cardId);
    if (!card) throw new EngineError(`Unknown AI card "${cardId}"`);
    return card;
  }
  hitLocation(monsterId: string, cardId: string) {
    const card = this.monster(monsterId).hitLocations.find((x) => x.id === cardId);
    if (!card) throw new EngineError(`Unknown hit location "${cardId}"`);
    return card;
  }
  gearItem(id: string): Gear {
    const g = this.gear.get(id);
    if (!g) throw new EngineError(`Unknown gear "${id}"`);
    return g;
  }
  resourceName(id: string) {
    return this.resources.get(id)?.name ?? id;
  }
}

// ───────────────────────── Log ─────────────────────────

export function log(s: GameState, kind: LogEntry['kind'], text: string, why?: string, rolls?: number[]) {
  s.log.push({ seq: s.log.length + 1, year: s.settlement.year, phase: s.phase, kind, text, why, rolls });
}

// ───────────────────────── Jobs and decisions ─────────────────────────

/** Queue jobs to run next, in the order given, before anything already queued. */
export function front(s: GameState, ...jobs: Job[]) {
  s.queue.unshift(...jobs);
}

/** Queue jobs to run after everything already queued. */
export function later(s: GameState, ...jobs: Job[]) {
  s.queue.push(...jobs);
}

export function ask(s: GameState, d: Omit<Decision, 'id'>) {
  if (!d.options.some((o) => !o.disabled)) {
    throw new EngineError(`Decision "${d.kind}" has no legal option: ${d.options.map((o) => `${o.label} (${o.disabled})`).join('; ')}`);
  }
  s.pending = { ...d, id: s.nextDecisionId++ };
}

export function opt(id: string, label: string, extra: Partial<DecisionOption> = {}): DecisionOption {
  return { id, label, ...extra };
}

// ───────────────────────── Dice ─────────────────────────

export function d(s: GameState, sides: number) {
  return roll(s.rng, sides);
}

// ───────────────────────── Survivors ─────────────────────────

export function survivor(s: GameState, id: string): Survivor {
  const sv = s.survivors.find((x) => x.id === id);
  if (!sv) throw new EngineError(`Unknown survivor "${id}"`);
  return sv;
}

export function combatant(s: GameState, id: string): Combatant | undefined {
  return s.showdown?.combatants.find((c) => c.survivorId === id);
}

/** Survivors an effect with `all` / `random` / `choose` can reach right now. */
export function survivorsInPlay(s: GameState): Survivor[] {
  if (s.phase === 'showdown' && s.showdown) {
    return s.showdown.combatants.filter((c) => !c.out).map((c) => survivor(s, c.survivorId)).filter((x) => x.alive);
  }
  if (s.phase === 'hunt') return s.settlement.departing.map((id) => survivor(s, id)).filter((x) => x.alive);
  return s.survivors.filter((x) => x.alive);
}

/** Current value of a stat: permanent value, plus gear bonuses, plus showdown modifiers. */
export function statOf(s: GameState, c: Content, sv: Survivor, stat: Stat): number {
  let v = sv.stats[stat];
  for (const g of sv.gear) v += c.gear.get(g)?.bonuses[stat] ?? 0;
  const cb = combatant(s, sv.id);
  if (cb) v += cb.mods[stat] ?? 0;
  return v;
}

export function weaponsOf(c: Content, sv: Survivor): Gear[] {
  const out = [c.gearItem(c.rules.unarmedWeapon)];
  for (const id of sv.gear) {
    const g = c.gear.get(id);
    if (g?.weapon && !out.some((w) => w.id === g.id)) out.push(g);
  }
  return out;
}

/** Armor and empty injury boxes for a survivor about to depart. */
export function freshBody(c: Content, sv: Survivor): Record<Loc, InjuryBoxes> {
  const body = Object.fromEntries(LOCATIONS.map((l) => [l, { armor: 0, light: false, heavy: false }])) as Record<Loc, InjuryBoxes>;
  for (const id of sv.gear) {
    const a = c.gear.get(id)?.armor;
    if (a) for (const l of a.locations) body[l].armor += a.value;
  }
  return body;
}

export function clampSurvival(s: GameState, sv: Survivor) {
  sv.survival = Math.max(0, Math.min(s.settlement.survivalLimit, sv.survival));
}

export function blankStats(): Record<Stat, number> {
  return Object.fromEntries(STATS.map((k) => [k, 0])) as Record<Stat, number>;
}

/** Plain-English list: "a, b and c". */
export function listJoin(items: string[]) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export function plural(n: number, word: string, many = `${word}s`) {
  return `${n} ${n === 1 ? word : many}`;
}

/** Spend resources matching a cost: exact ids first, then keyword costs from what's left.
 *  Returns null if the settlement can't pay. Never mutates `have`. */
export function payCost(c: Content, have: Record<string, number>, cost: Record<string, number>): Record<string, number> | null {
  const left = { ...have };
  const spent: Record<string, number> = {};
  const take = (id: string, n: number) => {
    left[id] -= n;
    spent[id] = (spent[id] ?? 0) + n;
  };
  for (const [key, n] of Object.entries(cost)) {
    if (key.startsWith('keyword:')) continue;
    if ((left[key] ?? 0) < n) return null;
    take(key, n);
  }
  for (const [key, n] of Object.entries(cost)) {
    if (!key.startsWith('keyword:')) continue;
    const word = key.slice(8);
    let need = n;
    // Prefer basic resources for keyword costs so rare monster resources are kept.
    const candidates = Object.keys(left)
      .filter((id) => left[id] > 0 && c.resources.get(id)?.keywords.includes(word))
      .sort((a, b) => (c.resources.get(a)?.kind === 'basic' ? 0 : 1) - (c.resources.get(b)?.kind === 'basic' ? 0 : 1) || a.localeCompare(b));
    for (const id of candidates) {
      const n2 = Math.min(need, left[id]);
      if (n2 > 0) take(id, n2);
      need -= n2;
      if (!need) break;
    }
    if (need) return null;
  }
  return spent;
}

export function describeCost(c: Content, cost: Record<string, number>) {
  const parts = Object.entries(cost).map(([k, n]) => (k.startsWith('keyword:') ? `${n} ${k.slice(8)}` : `${n} ${c.resourceName(k)}`));
  return parts.length ? parts.join(' + ') : 'free';
}

export function spend(s: GameState, spent: Record<string, number>) {
  for (const [id, n] of Object.entries(spent)) {
    s.settlement.resources[id] -= n;
    if (s.settlement.resources[id] <= 0) delete s.settlement.resources[id];
  }
}
