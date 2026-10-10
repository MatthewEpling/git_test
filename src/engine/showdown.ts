// The showdown: setup, rounds, the monster's AI turn, survivors' activations, attacks,
// hit location reactions, wounds and the end of the fight.
import type { AICard } from '../content/schema';
import { cellDist, distToFootprint, faceToward, inFront, monsterFootprint, monsterPath, reachable, standing } from './board';
import { ask, combatant, type Content, d, front, listJoin, log, opt, plural, statOf, survivor, weaponsOf } from './core';
import { damage, effectJobs } from './effects';
import { shuffle } from './rng';
import type { Combatant, Decision, DecisionOption, GameState } from './state';

export function setupShowdown(s: GameState, c: Content) {
  const h = s.hunt!;
  const m = c.monster(h.monsterId);
  const lvl = c.level(h.monsterId, h.level);
  const W = c.rules.board.width;
  const H = c.rules.board.height;
  // Build the AI deck: the level's count of each tier, drawn at random, then shuffled.
  const ai: string[] = [];
  for (const tier of ['basic', 'advanced', 'legendary'] as const) {
    const pool = shuffle(s.rng, m.aiCards.filter((x) => x.tier === tier).map((x) => x.id));
    ai.push(...pool.slice(0, lvl.aiDeck[tier]));
  }
  shuffle(s.rng, ai);
  const departing = s.settlement.departing.filter((id) => survivor(s, id).alive);
  const startX = Math.floor(W / 2) - departing.length + 1;
  const combatants: Combatant[] = departing.map((id, i) => ({
    survivorId: id,
    x: Math.max(0, Math.min(W - 1, startX + i * 2)),
    y: H - 3,
    mods: {},
    knockedDown: false,
    standsAtEndOfTurn: false,
    moved: false,
    acted: false,
    dodgedThisRound: false,
    turnDone: false,
    out: false,
  }));
  s.phase = 'showdown';
  s.showdown = {
    monsterId: m.id,
    level: h.level,
    round: 0,
    turn: 'monster',
    monster: { x: Math.floor(W / 2) - Math.floor(m.size.w / 2), y: Math.floor(H / 2) - m.size.h - 1, facing: 'S', mods: {} },
    aiDeck: ai,
    aiDiscard: [],
    woundStack: [],
    hlDeck: shuffle(s.rng, m.hitLocations.map((x) => x.id)),
    hlDiscard: [],
    combatants,
    active: null,
    lastAttacker: null,
    currentAi: null,
    target: null,
    result: null,
  };
  log(
    s,
    'phase',
    `Showdown: ${m.name}, level ${h.level}. Its AI deck holds ${plural(ai.length, 'card')} — that is its health.`,
    `Level ${h.level}: ${lvl.aiDeck.basic} basic, ${lvl.aiDeck.advanced} advanced, ${lvl.aiDeck.legendary} legendary AI cards; movement ${lvl.movement}, toughness ${lvl.toughness}, evasion ${lvl.evasion}. Survivors start along the south edge; the monster starts in the middle facing them (stand-in setup).`,
  );
  front(s, { t: 'roundStart' });
}

export function roundStart(s: GameState, c: Content) {
  const sd = s.showdown!;
  if (sd.result) return;
  sd.round++;
  for (const cb of sd.combatants) cb.dodgedThisRound = false;
  log(s, 'phase', `Round ${sd.round}.`);
  if (c.rules.monsterActsFirst) front(s, { t: 'monsterTurn' }, { t: 'survivorsTurn' }, { t: 'roundStart' });
  else front(s, { t: 'survivorsTurn' }, { t: 'monsterTurn' }, { t: 'roundStart' });
}

// ───────────────────────── Monster turn ─────────────────────────

export function monsterTurn(s: GameState, c: Content) {
  const sd = s.showdown!;
  if (sd.result) return;
  sd.turn = 'monster';
  sd.active = null;
  const m = c.monster(sd.monsterId);
  if (!sd.aiDeck.length && sd.aiDiscard.length) {
    sd.aiDeck = shuffle(s.rng, sd.aiDiscard);
    sd.aiDiscard = [];
    log(s, 'rule', 'The AI deck is empty: the AI discard pile is shuffled to form a new AI deck.');
  }
  if (!sd.aiDeck.length) {
    log(s, 'warn', `The ${m.name} has no AI cards to draw, so it does nothing this turn.`, 'All its AI cards are in the wound stack. What a monster does with no AI card left is in the rules backlog.');
    return;
  }
  const cardId = sd.aiDeck.shift()!;
  const card = c.aiCard(sd.monsterId, cardId);
  sd.currentAi = cardId;
  log(s, 'rule', `The ${m.name} draws AI card “${card.name}”: ${card.text}`, `${plural(sd.aiDeck.length, 'card')} left in the AI deck.`);
  front(s, ...effectJobs(card.before, { source: `AI: ${card.name}` }), { t: 'monsterAct', cardId, targetId: null }, { t: 'checkShowdownEnd' });
}

function injuryScore(s: GameState, id: string) {
  const sv = survivor(s, id);
  let n = sv.injuries.length * 2;
  for (const box of Object.values(sv.body ?? {})) n += (box.light ? 1 : 0) + (box.heavy ? 2 : 0);
  return n;
}

/** Survivors the card could target, and why. */
function targetCandidates(s: GameState, c: Content, card: AICard): { ids: string[]; why: string } {
  const sd = s.showdown!;
  const f = monsterFootprint(c, sd);
  const dist = (cb: Combatant) => distToFootprint(c, f, cb.x, cb.y);
  let pool = standing(s);
  const reachNote = card.reach < 99 ? ` within ${card.reach} square${card.reach === 1 ? '' : 's'}` : '';
  if (card.reach < 99) pool = pool.filter((cb) => dist(cb) <= card.reach);
  if (!pool.length) return { ids: [], why: `No survivor is standing${reachNote}.` };
  const closest = (list: Combatant[], label: string) => {
    const best = Math.min(...list.map(dist));
    return { ids: list.filter((cb) => dist(cb) === best).map((cb) => cb.survivorId), why: `${label}: ${best} square${best === 1 ? '' : 's'} away.` };
  };
  switch (card.targeting) {
    case 'closest':
      return closest(pool, `Closest survivor${reachNote}`);
    case 'closestInFront': {
      const front2 = pool.filter((cb) => inFront(f, sd.monster.facing, [cb.x, cb.y]));
      return front2.length ? closest(front2, `Closest survivor in front (facing ${sd.monster.facing})`) : closest(pool, `No survivor is in front, so the closest survivor`);
    }
    case 'lastAttacker': {
      const last = pool.find((cb) => cb.survivorId === sd.lastAttacker);
      return last ? { ids: [last.survivorId], why: 'The last survivor to attack it.' } : closest(pool, 'No standing survivor has attacked yet, so the closest survivor');
    }
    case 'mostInjured': {
      const best = Math.max(...pool.map((cb) => injuryScore(s, cb.survivorId)));
      const top = pool.filter((cb) => injuryScore(s, cb.survivorId) === best);
      return top.length === 1 ? { ids: [top[0].survivorId], why: 'The most injured survivor.' } : closest(top, 'Most injured (tied), then closest');
    }
    case 'random': {
      const pick = pool[d(s, pool.length) - 1];
      return { ids: [pick.survivorId], why: `Chosen at random from ${pool.length} survivors.` };
    }
  }
}

export function monsterAct(s: GameState, c: Content, cardId: string, targetId: string | null) {
  const sd = s.showdown!;
  if (sd.result) return;
  const card = c.aiCard(sd.monsterId, cardId);
  const m = c.monster(sd.monsterId);
  if (!targetId) {
    const { ids, why } = targetCandidates(s, c, card);
    if (!ids.length) {
      log(s, 'rule', `“${card.name}” finds no target.`, why);
      sd.aiDiscard.push(cardId);
      front(s, ...effectJobs(card.noTarget, { source: `AI: ${card.name}` }));
      return;
    }
    if (ids.length > 1) {
      ask(s, {
        kind: 'monsterTarget',
        title: `“${card.name}”: tied target`,
        prompt: `${why} ${listJoin(ids.map((id) => survivor(s, id).name))} are tied. The rules engine doesn't break this tie for you; choose which survivor the ${m.name} targets.`,
        options: ids.map((id) => opt(id, survivor(s, id).name, { survivorId: id })),
        data: { cardId, why },
      });
      return;
    }
    targetId = ids[0];
    log(s, 'rule', `The ${m.name} targets ${survivor(s, targetId).name}.`, why);
  }
  sd.target = targetId;
  const t = combatant(s, targetId)!;
  const lvl = c.level(sd.monsterId, sd.level);
  if (card.move) {
    const from = { x: sd.monster.x, y: sd.monster.y };
    const to = monsterPath(s, c, [t.x, t.y], lvl.movement);
    sd.monster.x = to.x;
    sd.monster.y = to.y;
    log(s, 'rule', to.moved ? `The ${m.name} moves ${plural(to.moved, 'square')} toward ${survivor(s, targetId).name}.` : `The ${m.name} doesn't need to move.`, to.moved ? `Movement ${lvl.movement}; moved from (${from.x},${from.y}) to (${to.x},${to.y}).` : 'Already adjacent to its target.');
  }
  const f = monsterFootprint(c, sd);
  sd.monster.facing = faceToward(f, [t.x, t.y]);
  sd.aiDiscard.push(cardId);
  if (!card.attack) return;
  const dist = distToFootprint(c, f, t.x, t.y);
  if (dist > 1) {
    log(s, 'rule', `${survivor(s, targetId).name} is out of reach (${dist} squares away), so the ${m.name} doesn't attack.`, 'Monster attacks need the target adjacent after moving.');
    front(s, ...effectJobs(card.noTarget, { source: `AI: ${card.name}` }));
    return;
  }
  front(s, { t: 'monsterAttack', cardId, targetId });
}

export function monsterAttack(s: GameState, c: Content, cardId: string, targetId: string) {
  const sd = s.showdown!;
  if (sd.result) return;
  const card = c.aiCard(sd.monsterId, cardId);
  const atk = card.attack!;
  const lvl = c.level(sd.monsterId, sd.level);
  const sv = survivor(s, targetId);
  if (!sv.alive) return;
  const evasion = statOf(s, c, sv, 'evasion');
  const accMod = lvl.accuracyMod + (sd.monster.mods.accuracy ?? 0);
  const need = atk.accuracy + evasion;
  const rolls: number[] = [];
  let hits = 0;
  for (let i = 0; i < atk.speed; i++) {
    const r = d(s, 10);
    rolls.push(r);
    if ((c.rules.monsterLanternAlwaysHits && r === 10) || r + accMod >= need) hits++;
  }
  log(
    s,
    'roll',
    `“${card.name}” attacks ${sv.name}: rolled ${rolls.join(', ')} — ${plural(hits, 'hit')}.`,
    `Each die hits on ${need}+ (attack ${atk.accuracy}+, plus ${sv.name}'s evasion ${evasion})${accMod ? `, with ${accMod >= 0 ? '+' : ''}${accMod} monster accuracy added to each roll` : ''}.`,
    rolls,
  );
  if (!hits) return;
  const cb = combatant(s, targetId)!;
  const dodge = c.rules.dodge;
  if (dodge.enabled && !cb.dodgedThisRound && !cb.knockedDown && sv.survival >= dodge.cost) {
    ask(s, {
      kind: 'dodge',
      title: `${sv.name} is hit ${plural(hits, 'time')}`,
      prompt: `${sv.name} can spend ${dodge.cost} survival (has ${sv.survival}) to dodge one hit. Each hit deals ${atk.damage + lvl.damageMod} damage to a random location.`,
      actor: targetId,
      options: [opt('dodge', `Dodge one hit (−${dodge.cost} survival)`, { detail: hits > 1 ? `${hits - 1} hit${hits - 1 === 1 ? '' : 's'} still land.` : 'No hits land.' }), opt('take', `Take ${plural(hits, 'hit')}`)],
      data: { cardId, targetId, hits },
    });
    return;
  }
  front(s, { t: 'monsterHits', cardId, targetId, hits });
}

export function monsterHits(s: GameState, cardId: string, targetId: string, hits: number) {
  const jobs = Array.from({ length: hits }, (_, i) => ({ t: 'applyHit' as const, targetId, cardId, hitIndex: i }));
  front(s, ...jobs, ...(hits ? [{ t: 'onHitEffects' as const, cardId, targetId }] : []));
}

export function applyHit(s: GameState, c: Content, targetId: string, cardId: string) {
  const sd = s.showdown!;
  if (sd.result || !survivor(s, targetId).alive) return;
  const card = c.aiCard(sd.monsterId, cardId);
  const lvl = c.level(sd.monsterId, sd.level);
  damage(s, c, targetId, card.attack!.damage + lvl.damageMod + (sd.monster.mods.damage ?? 0), 'random', `AI: ${card.name}`);
}

export function onHitEffects(s: GameState, c: Content, cardId: string, targetId: string) {
  const sd = s.showdown!;
  if (sd.result || !survivor(s, targetId).alive) return;
  const card = c.aiCard(sd.monsterId, cardId);
  front(s, ...effectJobs(card.onHit, { source: `AI: ${card.name}`, target: targetId }));
}

// ───────────────────────── Survivors' turn ─────────────────────────

export function survivorsTurn(s: GameState) {
  const sd = s.showdown!;
  if (sd.result) return;
  sd.turn = 'survivors';
  sd.currentAi = null;
  sd.target = null;
  for (const cb of sd.combatants) {
    cb.moved = false;
    cb.acted = false;
    cb.turnDone = cb.out;
  }
  log(s, 'phase', "The survivors' turn.");
  front(s, { t: 'pickActivation' });
}

export function pickActivation(s: GameState, c: Content) {
  const sd = s.showdown!;
  if (sd.result) return;
  sd.active = null;
  const list = standing(s);
  const open = list.filter((cb) => !cb.turnDone && !cb.knockedDown);
  if (!open.length) {
    front(s, { t: 'survivorsTurnEnd' });
    return;
  }
  const options: DecisionOption[] = list.map((cb) => {
    const sv = survivor(s, cb.survivorId);
    return opt(cb.survivorId, sv.name, {
      survivorId: cb.survivorId,
      detail: `Movement ${statOf(s, c, sv, 'movement')}, survival ${sv.survival}, insanity ${sv.insanity}.`,
      disabled: cb.knockedDown ? 'Knocked down: stands up at the end of this turn.' : cb.turnDone ? 'Already activated this turn.' : undefined,
    });
  });
  options.push(opt('endTurn', "End the survivors' turn", { detail: `${plural(open.length, 'survivor')} still able to act will skip this turn.` }));
  ask(s, { kind: 'pickActivation', title: `Round ${sd.round}: survivors' turn`, prompt: 'Choose a survivor to activate. Each survivor may move once and act once, in either order.', options });
}

export function weaponOptions(s: GameState, c: Content, survivorId: string): DecisionOption[] {
  const sd = s.showdown!;
  const cb = combatant(s, survivorId)!;
  const sv = survivor(s, survivorId);
  const f = monsterFootprint(c, sd);
  const dist = distToFootprint(c, f, cb.x, cb.y);
  const lvl = c.level(sd.monsterId, sd.level);
  const evasion = lvl.evasion + (sd.monster.mods.evasion ?? 0);
  return weaponsOf(c, sv).map((w) => {
    const speed = w.weapon!.speed + statOf(s, c, sv, 'speed');
    const acc = statOf(s, c, sv, 'accuracy');
    const need = Math.max(2, Math.min(10, w.weapon!.accuracy + evasion - acc));
    const str = statOf(s, c, sv, 'strength') + w.weapon!.strength;
    const tough = lvl.toughness + (sd.monster.mods.toughness ?? 0);
    const woundOn = Math.max(2, Math.min(10, tough - str + (c.rules.woundCompare === 'greaterThan' ? 1 : 0)));
    return opt(`attack:${w.id}`, `Attack with ${w.name}`, {
      group: 'Act',
      detail: `${plural(Math.max(1, speed), 'die', 'dice')}, each hits on ${need}+; each hit then wounds on ${woundOn}+ (strength ${str} vs toughness ${tough}).`,
      disabled: cb.acted ? 'Already acted this turn.' : dist > w.weapon!.range ? `The monster is ${dist} squares away; ${w.name} reaches ${w.weapon!.range}.` : undefined,
    });
  });
}

export function activation(s: GameState, c: Content, survivorId: string) {
  const sd = s.showdown!;
  if (sd.result) return;
  const cb = combatant(s, survivorId)!;
  const sv = survivor(s, survivorId);
  if (cb.out || !sv.alive || cb.knockedDown || (cb.moved && cb.acted)) {
    cb.turnDone = true;
    front(s, { t: 'pickActivation' });
    return;
  }
  sd.active = survivorId;
  const movement = statOf(s, c, sv, 'movement');
  const options: DecisionOption[] = [
    opt('move', `Move (up to ${movement})`, { group: 'Move', disabled: cb.moved ? 'Already moved this turn.' : movement <= 0 ? 'Movement is 0.' : undefined }),
    ...weaponOptions(s, c, survivorId),
    opt('done', `End ${sv.name}'s activation`, { group: 'Finish' }),
  ];
  ask(s, { kind: 'activation', title: `${sv.name}'s activation`, prompt: `${cb.moved ? 'Moved.' : 'Not moved yet.'} ${cb.acted ? 'Acted.' : 'Not acted yet.'}`, actor: survivorId, options });
}

function askMove(s: GameState, c: Content, survivorId: string) {
  const sv = survivor(s, survivorId);
  const cells = reachable(s, c, survivorId, statOf(s, c, sv, 'movement'));
  const f = monsterFootprint(c, s.showdown!);
  const options: DecisionOption[] = [...cells].map(([key, cost]) => {
    const [x, y] = key.split(',').map(Number);
    const dist = distToFootprint(c, f, x, y);
    return opt(`cell:${x},${y}`, `(${x}, ${y})`, { cell: [x, y], group: 'Squares', detail: `${plural(cost, 'step')}; ${dist === 1 ? 'adjacent to the monster' : `${dist} from the monster`}.` });
  });
  options.sort((a, b) => a.cell![1] - b.cell![1] || a.cell![0] - b.cell![0]);
  options.push(opt('cancel', 'Cancel move', { group: 'Finish' }));
  ask(s, { kind: 'move', title: `Move ${sv.name}`, prompt: 'Choose a highlighted square.', actor: survivorId, options });
}

export function attackRoll(s: GameState, c: Content, survivorId: string, gearId: string) {
  const sd = s.showdown!;
  if (sd.result) return;
  const cb = combatant(s, survivorId)!;
  const sv = survivor(s, survivorId);
  const w = c.gearItem(gearId);
  const lvl = c.level(sd.monsterId, sd.level);
  cb.acted = true;
  sd.lastAttacker = survivorId;
  const speed = w.weapon!.speed + statOf(s, c, sv, 'speed');
  const acc = statOf(s, c, sv, 'accuracy');
  const evasion = lvl.evasion + (sd.monster.mods.evasion ?? 0);
  const need = w.weapon!.accuracy + evasion;
  const rolls: number[] = [];
  let hits = 0;
  for (let i = 0; i < Math.max(1, speed); i++) {
    const r = d(s, 10);
    rolls.push(r);
    const lantern = c.rules.lanternAlwaysSucceeds && r === 10;
    const fail = c.rules.oneAlwaysFails && r === 1;
    if (lantern || (!fail && r + acc >= need)) hits++;
  }
  log(
    s,
    'roll',
    `${sv.name} attacks with the ${w.name}: rolled ${rolls.join(', ')} — ${plural(hits, 'hit')}.`,
    `Hit when roll + accuracy ${acc} ≥ ${need} (weapon ${w.weapon!.accuracy}+ plus monster evasion ${evasion})${c.rules.lanternAlwaysSucceeds ? '; a 10 always hits' : ''}${c.rules.oneAlwaysFails ? '; a 1 always misses' : ''}.`,
    rolls,
  );
  if (!hits) return;
  // Draw a hit location card for each hit; a trap ends the attack at once.
  const drawn: string[] = [];
  for (let i = 0; i < hits; i++) {
    if (!sd.hlDeck.length) {
      sd.hlDeck = shuffle(s.rng, sd.hlDiscard);
      sd.hlDiscard = [];
      log(s, 'rule', 'The hit location deck is empty: its discard pile is shuffled to form a new deck.');
    }
    const id = sd.hlDeck.shift();
    if (!id) break;
    const card = c.hitLocation(sd.monsterId, id);
    if (card.trap) {
      log(s, 'rule', `Trap! ${sv.name} draws “${card.name}”. ${card.text}`, `${drawn.length ? `The ${plural(drawn.length, 'other hit location')} drawn are discarded without effect. ` : ''}The attack ends and the hit location deck is reshuffled.`);
      sd.hlDiscard.push(...drawn, id);
      sd.hlDeck = shuffle(s.rng, [...sd.hlDeck, ...sd.hlDiscard]);
      sd.hlDiscard = [];
      front(s, ...effectJobs(card.reflex, { source: `Trap: ${card.name}`, attacker: survivorId }), { t: 'checkShowdownEnd' });
      return;
    }
    drawn.push(id);
  }
  log(s, 'rule', `${sv.name} draws hit locations: ${listJoin(drawn.map((id) => `“${c.hitLocation(sd.monsterId, id).name}”`))}.`, 'One hit location card per hit, resolved in the order drawn.');
  front(s, ...drawn.map((cardId) => ({ t: 'resolveHitLocation' as const, survivorId, gearId, cardId })), { t: 'checkShowdownEnd' });
}

export function resolveHitLocation(s: GameState, c: Content, survivorId: string, gearId: string, cardId: string) {
  const sd = s.showdown!;
  const card = c.hitLocation(sd.monsterId, cardId);
  if (sd.result || !survivor(s, survivorId).alive) {
    sd.hlDiscard.push(cardId);
    return;
  }
  front(s, ...effectJobs(card.reflex, { source: `Reflex: ${card.name}`, attacker: survivorId }), { t: 'woundRoll', survivorId, gearId, cardId });
}

export function woundRoll(s: GameState, c: Content, survivorId: string, gearId: string, cardId: string) {
  const sd = s.showdown!;
  const card = c.hitLocation(sd.monsterId, cardId);
  sd.hlDiscard.push(cardId);
  if (sd.result || !survivor(s, survivorId).alive) return;
  const sv = survivor(s, survivorId);
  const w = c.gearItem(gearId);
  const lvl = c.level(sd.monsterId, sd.level);
  const m = c.monster(sd.monsterId);
  const r = d(s, 10);
  const luck = statOf(s, c, sv, 'luck');
  const critOn = Math.max(2, Math.min(10, c.rules.criticalOn - luck + lvl.luck));
  const crit = r >= critOn;
  const strength = statOf(s, c, sv, 'strength') + w.weapon!.strength;
  const toughness = lvl.toughness + (sd.monster.mods.toughness ?? 0);
  const total = r + strength;
  const beats = c.rules.woundCompare === 'greaterThan' ? total > toughness : total >= toughness;
  const lantern = c.rules.lanternAlwaysSucceeds && r === 10;
  const fail = c.rules.oneAlwaysFails && r === 1;
  const wounds = !card.impervious && !fail && (crit || lantern || beats);
  const why = `Roll ${r} + strength ${strength} = ${total} vs toughness ${toughness} (${c.rules.woundCompare === 'greaterThan' ? 'must exceed' : 'must equal or exceed'})${crit ? `; ${r} ≥ ${critOn} is a critical` : ''}${card.impervious ? '; this location is impervious' : ''}${fail ? '; a 1 always fails' : ''}.`;
  const ctx = { source: `Hit location: ${card.name}`, attacker: survivorId };
  if (wounds) {
    log(s, 'roll', `${sv.name} ${crit ? 'critically wounds' : 'wounds'} the ${m.name} at the ${card.name} (rolled ${r}).`, why, [r]);
    const slain = woundMonster(s, c);
    if (slain) return;
    front(s, ...effectJobs(card.wound, ctx), ...(crit ? effectJobs(card.critical, ctx) : []));
  } else if (card.impervious && crit) {
    log(s, 'roll', `The ${card.name} can't be wounded, but ${sv.name}'s roll of ${r} is a critical.`, why, [r]);
    front(s, ...effectJobs(card.critical, ctx));
  } else {
    log(s, 'roll', `${sv.name} fails to wound at the ${card.name} (rolled ${r}).`, why, [r]);
    front(s, ...effectJobs(card.failure, ctx));
  }
}

/** Move the top AI card to the wound stack; returns true if the monster is slain. */
function woundMonster(s: GameState, c: Content): boolean {
  const sd = s.showdown!;
  const m = c.monster(sd.monsterId);
  if (!sd.aiDeck.length && sd.aiDiscard.length) {
    sd.aiDeck = shuffle(s.rng, sd.aiDiscard);
    sd.aiDiscard = [];
    log(s, 'rule', 'The AI deck is empty, so the AI discard pile is shuffled into a new AI deck before the wound.');
  }
  const top = sd.aiDeck.shift();
  if (!top) {
    log(s, 'rule', `The ${m.name} has no AI cards left: it is slain!`, 'A wound with no AI cards left in the deck or discard slays the monster.');
    endShowdown(s, 'victory');
    return true;
  }
  sd.woundStack.push(top);
  log(s, 'rule', `“${c.aiCard(sd.monsterId, top).name}” goes to the wound stack. ${plural(sd.aiDeck.length + sd.aiDiscard.length, 'AI card')} of health left.`, 'Each wound removes the top card of the AI deck.');
  return false;
}

export function checkShowdownEnd(s: GameState) {
  const sd = s.showdown!;
  if (sd.result) return;
  if (!standing(s).length) {
    log(s, 'rule', 'No survivor is left standing on the board. The showdown is lost.');
    endShowdown(s, 'defeat');
  }
}

export function survivorsTurnEnd(s: GameState) {
  const sd = s.showdown!;
  if (sd.result) return;
  for (const cb of standing(s)) {
    if (cb.knockedDown && cb.standsAtEndOfTurn) {
      cb.knockedDown = false;
      cb.standsAtEndOfTurn = false;
      log(s, 'rule', `${survivor(s, cb.survivorId).name} stands up.`, "Knocked-down survivors stand at the end of the survivors' turn (unverified timing; see the rules backlog).");
    }
  }
}

export function endShowdown(s: GameState, result: 'victory' | 'defeat') {
  const sd = s.showdown!;
  sd.result = result;
  sd.active = null;
  // Anything still queued belonged to the fight that just ended.
  s.queue = [{ t: 'aftermath' }];
  log(s, 'phase', result === 'victory' ? 'Victory! The showdown is won.' : 'Defeat. The showdown is lost.');
}

export function onShowdownDecision(s: GameState, c: Content, dcs: Decision, o: DecisionOption) {
  const sd = s.showdown!;
  switch (dcs.kind) {
    case 'monsterTarget': {
      const data = dcs.data as { cardId: string; why: string };
      log(s, 'choice', `The monster targets ${survivor(s, o.id).name}.`, `${data.why} Tie broken by the player.`);
      front(s, { t: 'monsterAct', cardId: data.cardId, targetId: o.id });
      return;
    }
    case 'dodge': {
      const data = dcs.data as { cardId: string; targetId: string; hits: number };
      let hits = data.hits;
      if (o.id === 'dodge') {
        const sv = survivor(s, data.targetId);
        sv.survival -= c.rules.dodge.cost;
        combatant(s, data.targetId)!.dodgedThisRound = true;
        hits--;
        log(s, 'choice', `${sv.name} spends ${c.rules.dodge.cost} survival to dodge one hit (${plural(hits, 'hit')} still land).`, 'Dodge: once per round.');
      } else {
        log(s, 'choice', `${survivor(s, data.targetId).name} takes the ${plural(hits, 'hit')}.`);
      }
      front(s, { t: 'monsterHits', cardId: data.cardId, targetId: data.targetId, hits });
      return;
    }
    case 'pickActivation': {
      if (o.id === 'endTurn') {
        for (const cb of sd.combatants) cb.turnDone = true;
        log(s, 'choice', "The survivors end their turn.");
        front(s, { t: 'survivorsTurnEnd' });
      } else {
        front(s, { t: 'activation', survivorId: o.id });
      }
      return;
    }
    case 'activation': {
      const id = dcs.actor!;
      const cb = combatant(s, id)!;
      if (o.id === 'move') {
        askMove(s, c, id);
      } else if (o.id === 'done') {
        cb.turnDone = true;
        log(s, 'choice', `${survivor(s, id).name} ends their activation.`);
        front(s, { t: 'pickActivation' });
      } else if (o.id.startsWith('attack:')) {
        front(s, { t: 'attackRoll', survivorId: id, gearId: o.id.slice(7) }, { t: 'activation', survivorId: id });
      }
      return;
    }
    case 'move': {
      const id = dcs.actor!;
      const cb = combatant(s, id)!;
      if (o.id !== 'cancel') {
        const [x, y] = o.cell!;
        const steps = cellDist(c, [cb.x, cb.y], [x, y]);
        log(s, 'choice', `${survivor(s, id).name} moves from (${cb.x}, ${cb.y}) to (${x}, ${y}).`, `${steps} square${steps === 1 ? '' : 's'} as the crow flies.`);
        cb.x = x;
        cb.y = y;
        cb.moved = true;
      }
      front(s, { t: 'activation', survivorId: id });
      return;
    }
  }
}
