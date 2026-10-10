// Resolves the content effect language. Effects that need a player (choose a survivor,
// pick an option, apply something by hand) pause the engine with a decision; everything
// else is applied and logged with the reason.
import type { Effect, Loc, Who } from '../content/schema';
import { knockback } from './board';
import { ask, combatant, type Content, clampSurvival, d, front, log, opt, survivor, survivorsInPlay } from './core';
import type { Decision, DecisionOption, EffectCtx, GameState } from './state';

export function effectJobs(effects: Effect[], ctx: EffectCtx) {
  return effects.map((effect) => ({ t: 'effect' as const, effect, ctx }));
}

/** Survivor ids an effect applies to, or null if a decision was opened to pick one. */
function resolveWho(s: GameState, effect: Effect & { who: Who }, ctx: EffectCtx): string[] | null {
  const inPlay = survivorsInPlay(s);
  switch (effect.who) {
    case 'attacker':
    case 'target': {
      const id = effect.who === 'attacker' ? ctx.attacker : ctx.target;
      if (!id) {
        log(s, 'warn', `${ctx.source}: this effect needs ${effect.who === 'attacker' ? 'an attacking survivor' : 'a target'}, but there isn't one here, so it does nothing.`);
        return [];
      }
      return survivor(s, id).alive ? [id] : [];
    }
    case 'all':
      return inPlay.map((x) => x.id);
    case 'random': {
      if (!inPlay.length) return [];
      const pick = inPlay[d(s, inPlay.length) - 1];
      log(s, 'roll', `${ctx.source}: the random survivor is ${pick.name}.`, `Rolled among ${inPlay.length} survivors in play.`);
      return [pick.id];
    }
    case 'choose': {
      if (inPlay.length <= 1) return inPlay.map((x) => x.id);
      ask(s, {
        kind: 'chooseSurvivor',
        title: ctx.source,
        prompt: `Choose who this affects: ${describeEffect(effect)}.`,
        options: inPlay.map((x) => opt(x.id, x.name, { survivorId: x.id })),
        data: { effect, ctx },
      });
      return null;
    }
  }
}

export function describeEffect(e: Effect): string {
  switch (e.op) {
    case 'damage':
      return `${e.amount} damage${e.location ? ` to ${e.location === 'random' ? 'a random location' : `the ${e.location}`}` : ''}`;
    case 'knockdown':
      return 'knocked down';
    case 'survival':
      return `${e.amount >= 0 ? '+' : ''}${e.amount} survival`;
    case 'insanity':
      return `${e.amount >= 0 ? '+' : ''}${e.amount} insanity`;
    case 'stat':
      return `${e.amount >= 0 ? '+' : ''}${e.amount} ${e.stat}${e.duration === 'permanent' ? ' (permanent)' : ' (this showdown)'}`;
    case 'knockback':
      return `knocked back ${e.spaces}`;
    case 'severeInjury':
      return `a severe ${e.location === 'random' ? '' : `${e.location} `}injury`;
    case 'death':
      return 'death';
    default:
      return e.op;
  }
}

export function runEffect(s: GameState, c: Content, effect: Effect, ctx: EffectCtx) {
  switch (effect.op) {
    case 'log':
      log(s, 'info', effect.text, ctx.source);
      return;
    case 'manual':
      ask(s, {
        kind: 'manual',
        title: `Apply by hand: ${ctx.source}`,
        prompt: `${effect.text}\n\nThe engine can't apply this automatically yet. Apply it on your own sheets or ignore it if it doesn't apply, then continue.`,
        options: [opt('done', 'Done — continue')],
        data: { text: effect.text, source: ctx.source },
      });
      return;
    case 'resource': {
      s.settlement.resources[effect.id] = (s.settlement.resources[effect.id] ?? 0) + effect.count;
      log(s, 'info', `Gained ${effect.count} ${c.resourceName(effect.id)}.`, ctx.source);
      return;
    }
    case 'huntMove': {
      if (!s.hunt) {
        log(s, 'warn', `${ctx.source}: hunt movement has no effect outside a hunt.`);
        return;
      }
      const before = s.hunt.survivorPos;
      s.hunt.survivorPos = Math.max(0, s.hunt.survivorPos + effect.spaces);
      log(s, 'info', `The survivors move ${effect.spaces > 0 ? 'forward' : 'back'} on the hunt board (space ${before} → ${s.hunt.survivorPos}).`, ctx.source);
      return;
    }
    case 'choice':
      ask(s, {
        kind: 'effectChoice',
        title: ctx.source,
        prompt: effect.prompt,
        options: effect.options.map((o, i) => opt(String(i), o.label, { detail: o.detail })),
        data: { effect, ctx },
      });
      return;
    case 'roll': {
      const r = d(s, effect.die);
      const row = effect.table.find((t) => r >= t.min && r <= t.max)!;
      log(s, 'roll', `${effect.label}: rolled ${r} — ${row.label}.`, `${ctx.source}, 1d${effect.die} table.`, [r]);
      front(s, ...effectJobs(row.effects, ctx));
      return;
    }
  }
  // Effects aimed at survivors.
  const ids = resolveWho(s, effect, ctx);
  if (ids === null) return;
  if (!ids.length) {
    log(s, 'info', `${ctx.source}: no survivor is affected.`);
    return;
  }
  for (const id of ids) applyToSurvivor(s, c, effect, id, ctx);
}

function applyToSurvivor(s: GameState, c: Content, effect: Effect, id: string, ctx: EffectCtx) {
  const sv = survivor(s, id);
  if (!sv.alive) return;
  const cb = combatant(s, id);
  switch (effect.op) {
    case 'damage': {
      const loc = effect.location ?? 'random';
      damage(s, c, id, effect.amount, loc, ctx.source);
      return;
    }
    case 'knockdown':
      if (!cb || cb.out) {
        log(s, 'info', `${sv.name} would be knocked down, which only matters during a showdown.`, ctx.source);
        return;
      }
      knockDown(s, id, ctx.source);
      return;
    case 'survival': {
      const before = sv.survival;
      sv.survival += effect.amount;
      clampSurvival(s, sv);
      log(s, 'info', `${sv.name}: survival ${before} → ${sv.survival}.`, `${ctx.source}${sv.survival !== before + effect.amount ? ` (survival stays between 0 and the survival limit of ${s.settlement.survivalLimit})` : ''}`);
      return;
    }
    case 'insanity': {
      const before = sv.insanity;
      sv.insanity = Math.max(0, sv.insanity + effect.amount);
      log(s, 'info', `${sv.name}: insanity ${before} → ${sv.insanity}.`, `${ctx.source}${sv.insanity !== before + effect.amount ? ' (insanity can’t go below 0)' : ''}`);
      return;
    }
    case 'stat': {
      if (effect.duration === 'permanent') {
        sv.stats[effect.stat] += effect.amount;
        log(s, 'info', `${sv.name}: ${effect.stat} ${effect.amount >= 0 ? '+' : ''}${effect.amount} permanently (now ${sv.stats[effect.stat]}).`, ctx.source);
      } else if (cb) {
        cb.mods[effect.stat] = (cb.mods[effect.stat] ?? 0) + effect.amount;
        log(s, 'info', `${sv.name}: ${effect.stat} ${effect.amount >= 0 ? '+' : ''}${effect.amount} until the showdown ends.`, ctx.source);
      } else {
        log(s, 'info', `${sv.name}: a showdown-only ${effect.stat} change has no effect outside a showdown.`, ctx.source);
      }
      return;
    }
    case 'knockback': {
      if (!cb || cb.out) {
        log(s, 'info', `${sv.name} would be knocked back, which only matters during a showdown.`, ctx.source);
        return;
      }
      const moved = knockback(s, c, id, effect.spaces);
      log(s, 'info', `${sv.name} is knocked back ${moved} of ${effect.spaces} squares.`, `${ctx.source}${moved < effect.spaces ? ' (stopped by the board edge or another survivor)' : ''}`);
      return;
    }
    case 'severeInjury': {
      const loc: Loc = effect.location === 'random' ? hitLocationRoll(s, c, sv.name) : effect.location;
      severeInjury(s, c, id, loc, ctx.source);
      return;
    }
    case 'death':
      kill(s, id, effect.cause, ctx.source);
      return;
  }
}

export function hitLocationRoll(s: GameState, c: Content, who: string): Loc {
  const faces = c.rules.hitLocationDie;
  const r = d(s, faces.length);
  const loc = faces[r - 1];
  log(s, 'roll', `Hit location for ${who}: ${loc}.`, `Hit location die face ${r} of ${faces.length}.`, [r]);
  return loc;
}

/** Damage to one location: armor soaks first, then injuries rise (rules.injuryPerHit). */
export function damage(s: GameState, c: Content, id: string, amount: number, where: Loc | 'random', source: string) {
  const sv = survivor(s, id);
  if (!sv.body) {
    log(s, 'warn', `${sv.name} would take ${amount} damage, but survivors only track damage while away from the settlement.`, source);
    return;
  }
  const loc: Loc = where === 'random' ? hitLocationRoll(s, c, sv.name) : where;
  const box = sv.body[loc];
  if (amount <= box.armor) {
    box.armor -= amount;
    log(s, 'info', `${sv.name}'s ${loc} armor absorbs ${amount} damage (${box.armor} armor left there).`, source);
    return;
  }
  const past = amount - box.armor;
  const soaked = box.armor;
  box.armor = 0;
  const levels = c.rules.injuryPerHit === 'oneLevel' ? 1 : past;
  log(s, 'info', `${sv.name} takes ${amount} damage to the ${loc}${soaked ? `; armor soaks ${soaked} and breaks` : ' (no armor left there)'}.`, `${source}. Injury rule: ${c.rules.injuryPerHit === 'oneLevel' ? 'one injury level per hit that gets past armor' : 'one injury level per point past armor'}.`);
  for (let i = 0; i < levels; i++) {
    if (!survivor(s, id).alive) return;
    raiseInjury(s, c, id, loc, source);
  }
}

function raiseInjury(s: GameState, c: Content, id: string, loc: Loc, source: string) {
  const sv = survivor(s, id);
  const box = sv.body![loc];
  const hasLight = !c.rules.noLightInjury.includes(loc);
  if (hasLight && !box.light) {
    box.light = true;
    log(s, 'rule', `${sv.name} suffers a light ${loc} injury.`, source);
  } else if (!box.heavy) {
    box.heavy = true;
    log(s, 'rule', `${sv.name} suffers a heavy ${loc} injury and is knocked down.`, `${source}${hasLight ? ' (the light box was already marked)' : ` (the ${loc} has no light injury box)`}.`);
    if (combatant(s, id) && !combatant(s, id)!.out) knockDown(s, id, `heavy ${loc} injury`);
  } else {
    log(s, 'rule', `${sv.name}'s ${loc} is already heavily injured: roll for a severe ${loc} injury.`, source);
    severeInjury(s, c, id, loc, source);
  }
}

export function severeInjury(s: GameState, c: Content, id: string, loc: Loc, source: string) {
  const sv = survivor(s, id);
  const table = c.pack.severeInjuries[loc];
  const r = d(s, table.die);
  const row = table.entries.find((e) => r >= e.min && r <= e.max)!;
  // Only lasting results go on the survivor's sheet; momentary ones are just logged.
  if (row.record) sv.injuries.push(`${row.name} (${loc})`);
  log(s, 'roll', `${sv.name} — severe ${loc} injury: rolled ${r}, ${row.name}. ${row.text}`, `${source}; severe ${loc} injury table.`, [r]);
  front(s, ...effectJobs(row.effects, { source: `${row.name} (${sv.name})`, target: id, attacker: id }));
}

export function knockDown(s: GameState, id: string, source: string) {
  const cb = combatant(s, id);
  if (!cb || cb.out) return;
  if (!cb.knockedDown) log(s, 'rule', `${survivor(s, id).name} is knocked down.`, source);
  cb.knockedDown = true;
  cb.standsAtEndOfTurn = true;
}

export function kill(s: GameState, id: string, cause: string, source: string) {
  const sv = survivor(s, id);
  if (!sv.alive) return;
  sv.alive = false;
  sv.causeOfDeath = cause;
  sv.body = null;
  s.settlement.deaths++;
  const cb = combatant(s, id);
  if (cb) cb.out = true;
  s.settlement.departing = s.settlement.departing.filter((x) => x !== id);
  log(s, 'rule', `${sv.name} dies of ${cause}.`, source);
}

export function onEffectDecision(s: GameState, dcs: Decision, o: DecisionOption) {
  const data = dcs.data as { effect: Effect; ctx: EffectCtx };
  if (dcs.kind === 'chooseSurvivor') {
    // Re-run the same effect aimed at the chosen survivor.
    const retarget = { ...data.effect, who: 'target' } as Effect;
    front(s, { t: 'effect', effect: retarget, ctx: { ...data.ctx, target: o.id } });
  } else if (dcs.kind === 'effectChoice') {
    const e = data.effect as Extract<Effect, { op: 'choice' }>;
    front(s, ...effectJobs(e.options[Number(o.id)].effects, data.ctx));
  } else if (dcs.kind === 'manual') {
    log(s, 'manual', `Applied by hand: ${(dcs.data as { text: string }).text}`, (dcs.data as { source: string }).source);
  }
}
