// Campaign structure: a new settlement, the lantern year (timeline, departing survivors,
// quarry), the hunt, the aftermath of a showdown and the settlement phase.
import type { Gear } from '../content/schema';
import {
  ask,
  type Content,
  blankStats,
  d,
  describeCost,
  freshBody,
  front,
  listJoin,
  log,
  opt,
  payCost,
  plural,
  spend,
  survivor,
} from './core';
import { effectJobs } from './effects';
import { seedRng, shuffle } from './rng';
import type { Decision, DecisionOption, GameState } from './state';

/** Carry limit per survivor while the 3×3 gear grid isn't modelled (rules backlog). */
export const GEAR_LIMIT = 9;

export function createCampaign(c: Content, seed: string): GameState {
  const p = c.pack;
  const base = p.rules.survivorBase;
  const survivors = Array.from({ length: p.campaign.startingSurvivors }, (_, i) => ({
    id: `s${i + 1}`,
    name: p.campaign.survivorNames[i] ?? `Survivor ${i + 1}`,
    alive: true,
    stats: { ...blankStats(), movement: base.movement, accuracy: base.accuracy, strength: base.strength, evasion: base.evasion, luck: base.luck, speed: base.speed },
    survival: base.survival,
    insanity: base.insanity,
    huntXp: 0,
    injuries: [],
    disorders: [],
    fightingArts: [],
    abilities: [],
    gear: [...p.campaign.startingGear],
    body: null,
  }));
  const s: GameState = {
    version: 1,
    seed,
    packId: p.meta.id,
    rng: seedRng(seed),
    phase: 'settlement',
    settlement: {
      name: p.campaign.settlementName,
      year: 1,
      survivalLimit: p.rules.survivalLimitStart,
      resources: { ...p.campaign.startingResources },
      gearStorage: {},
      locations: p.locations.filter((l) => l.startsBuilt).map((l) => l.id),
      innovations: [],
      endeavors: 0,
      deaths: 0,
      departing: [],
      defeatedQuarries: [],
    },
    survivors,
    hunt: null,
    showdown: null,
    queue: [{ t: 'yearStart' }],
    pending: null,
    nextDecisionId: 1,
    log: [],
    outcome: null,
  };
  for (const sv of s.survivors) sv.survival = Math.min(sv.survival, s.settlement.survivalLimit);
  log(s, 'phase', `${p.campaign.name}: the settlement of ${p.campaign.settlementName} is founded with ${plural(survivors.length, 'survivor')}.`, `Seed "${seed}". Content pack "${p.meta.name}" v${p.meta.version}.`);
  return s;
}

export function living(s: GameState) {
  return s.survivors.filter((x) => x.alive);
}

export function yearStart(s: GameState, c: Content) {
  if (!living(s).length) return lose(s, 'Every survivor is dead. The lanterns go out.');
  s.phase = 'settlement';
  log(s, 'phase', `Lantern year ${s.settlement.year} begins.`);
  const events = c.pack.timeline.filter((t) => t.year === s.settlement.year);
  const jobs = events.flatMap((e) => {
    log(s, 'info', `Timeline — ${e.name}: ${e.text}`, `Timeline event for year ${e.year}.`);
    return effectJobs(e.effects, { source: `Timeline: ${e.name}` });
  });
  if (!s.settlement.departing.length) s.settlement.departing = living(s).slice(0, c.rules.maxDeparting).map((x) => x.id);
  s.settlement.departing = s.settlement.departing.filter((id) => survivor(s, id).alive);
  front(s, ...jobs, { t: 'chooseDeparting' });
}

export function chooseDeparting(s: GameState, c: Content) {
  if (!living(s).length) return lose(s, 'Every survivor is dead. The lanterns go out.');
  const chosen = new Set(s.settlement.departing);
  const max = c.rules.maxDeparting;
  const options: DecisionOption[] = living(s).map((sv) =>
    opt(`toggle:${sv.id}`, `${chosen.has(sv.id) ? '✔ ' : ''}${sv.name}`, {
      survivorId: sv.id,
      group: 'Survivors',
      detail: chosen.has(sv.id) ? 'Departing — choose to stay behind' : 'Staying — choose to send on the hunt',
      disabled: !chosen.has(sv.id) && chosen.size >= max ? `At most ${max} survivors can depart.` : undefined,
    }),
  );
  options.push(
    opt('confirm', `Depart with ${plural(chosen.size, 'survivor')}`, {
      group: 'Confirm',
      disabled: chosen.size === 0 ? 'Choose at least one survivor to depart.' : undefined,
    }),
  );
  ask(s, {
    kind: 'departing',
    title: 'Departing survivors',
    prompt: `Choose up to ${max} survivors to go on the hunt. Survivors who stay behind are safe this year.`,
    options,
  });
}

export function chooseQuarry(s: GameState, c: Content) {
  const options = c.pack.monsters
    .filter((m) => m.kind === 'quarry')
    .flatMap((m) =>
      m.levels.map((l) =>
        opt(`${m.id}:${l.level}`, `${m.name} — level ${l.level}`, {
          detail: `Movement ${l.movement}, toughness ${l.toughness}, ${l.aiDeck.basic + l.aiDeck.advanced + l.aiDeck.legendary} AI cards. Rewards: ${l.rewards.basic} basic + ${l.rewards.monster} monster resources.`,
        }),
      ),
    );
  ask(s, { kind: 'quarry', title: 'Choose your quarry', prompt: 'Which monster do the survivors hunt this year?', options });
}

export function startHunt(s: GameState, c: Content, monsterId: string, level: number) {
  const lvl = c.level(monsterId, level);
  s.phase = 'hunt';
  s.hunt = { monsterId, level, survivorPos: 0, monsterPos: lvl.huntPosition, turn: 0, eventsSeen: [] };
  for (const id of s.settlement.departing) {
    const sv = survivor(s, id);
    sv.body = freshBody(c, sv);
  }
  const names = s.settlement.departing.map((id) => survivor(s, id).name);
  log(s, 'phase', `The hunt begins: ${listJoin(names)} set out after the ${c.monster(monsterId).name} (level ${level}).`, `The quarry waits ${lvl.huntPosition} spaces away on the hunt board.`);
  front(s, { t: 'huntTurn' });
}

export function huntTurn(s: GameState, c: Content) {
  const h = s.hunt!;
  if (!s.settlement.departing.some((id) => survivor(s, id).alive)) {
    log(s, 'rule', 'Every departing survivor has died on the hunt.');
    front(s, { t: 'aftermath' });
    return;
  }
  h.turn++;
  h.survivorPos++;
  if (h.survivorPos >= h.monsterPos) {
    h.survivorPos = h.monsterPos;
    log(s, 'rule', `The survivors reach the ${c.monster(h.monsterId).name}. The showdown begins.`, `Survivors at space ${h.survivorPos}, quarry at space ${h.monsterPos}.`);
    front(s, { t: 'showdownSetup' });
    return;
  }
  const special = c.monster(h.monsterId).huntSpaces[String(h.survivorPos)];
  let eventId: string;
  let why: string;
  if (special) {
    eventId = special;
    why = `Space ${h.survivorPos} holds a ${c.monster(h.monsterId).name} hunt event.`;
  } else {
    const r = d(s, c.pack.huntEventTable.die);
    eventId = c.pack.huntEventTable.entries.find((e) => r >= e.min && r <= e.max)!.event;
    why = `Rolled ${r} on the 1d${c.pack.huntEventTable.die} hunt event table.`;
  }
  const ev = c.events.get(eventId)!;
  h.eventsSeen.push(eventId);
  log(s, 'roll', `Hunt space ${h.survivorPos} — ${ev.name}: ${ev.text}`, why);
  front(s, ...effectJobs(ev.effects, { source: `Hunt event: ${ev.name}` }), { t: 'huntTurn' });
}

export function aftermath(s: GameState, c: Content) {
  const result = s.showdown?.result ?? 'defeat';
  const monsterId = s.showdown?.monsterId ?? s.hunt?.monsterId ?? '';
  const level = s.showdown?.level ?? s.hunt?.level ?? 1;
  const returning = s.settlement.departing.filter((id) => survivor(s, id).alive);
  if (result === 'victory') {
    const lvl = c.level(monsterId, level);
    const basic = shuffle(s.rng, Object.entries(c.pack.basicResourceDeck).flatMap(([id, n]) => Array(n).fill(id) as string[]));
    const monsterDeck = shuffle(s.rng, Object.entries(c.monster(monsterId).resourceDeck).flatMap(([id, n]) => Array(n).fill(id) as string[]));
    const gained = [...basic.slice(0, lvl.rewards.basic), ...monsterDeck.slice(0, lvl.rewards.monster)];
    for (const id of gained) s.settlement.resources[id] = (s.settlement.resources[id] ?? 0) + 1;
    const counts = new Map<string, number>();
    for (const id of gained) counts.set(id, (counts.get(id) ?? 0) + 1);
    log(s, 'roll', `Rewards: ${listJoin([...counts].map(([id, n]) => `${n} ${c.resourceName(id)}`))}.`, `Level ${level} rewards: ${lvl.rewards.basic} drawn from the shuffled basic resource deck and ${lvl.rewards.monster} from the monster resource deck.`);
    s.settlement.defeatedQuarries.push({ monsterId, level, year: s.settlement.year });
    for (const id of returning) {
      survivor(s, id).huntXp++;
    }
    if (returning.length) log(s, 'rule', `${listJoin(returning.map((id) => survivor(s, id).name))} gain 1 hunt XP.`, 'Each survivor who returns from a victorious showdown gains 1 hunt XP.');
  } else {
    log(s, 'phase', returning.length ? `The hunt fails. ${listJoin(returning.map((id) => survivor(s, id).name))} limp home empty-handed.` : 'No one returns from the hunt.');
  }
  for (const sv of s.survivors) sv.body = null;
  s.showdown = null;
  s.hunt = null;
  s.settlement.departing = returning;
  front(s, { t: 'settlementStart' });
}

export function settlementStart(s: GameState, c: Content) {
  s.phase = 'settlement';
  if (!living(s).length) return lose(s, 'Every survivor is dead. The lanterns go out.');
  const returning = s.settlement.departing.length;
  const fromInnovations = s.settlement.innovations.reduce((n, id) => n + (c.innovations.get(id)?.grants.endeavorsPerYear ?? 0), 0);
  s.settlement.endeavors += returning * c.rules.endeavorsPerReturningSurvivor + fromInnovations;
  log(s, 'phase', `Settlement phase, year ${s.settlement.year}. ${plural(s.settlement.endeavors, 'endeavor')} available.`, `${returning} returning survivor(s) × ${c.rules.endeavorsPerReturningSurvivor}${fromInnovations ? ` + ${fromInnovations} from innovations` : ''}, plus any left over.`);
  front(s, { t: 'settlementActions' });
}

function gearCount(s: GameState) {
  return Object.values(s.settlement.gearStorage).reduce((a, b) => a + b, 0);
}

export function settlementActions(s: GameState, c: Content) {
  const st = s.settlement;
  const options: DecisionOption[] = [];
  for (const l of c.pack.locations) {
    if (st.locations.includes(l.id)) continue;
    const spent = payCost(c, st.resources, l.buildCost.resources);
    options.push(
      opt(`build:${l.id}`, `Build ${l.name}`, {
        group: 'Build',
        detail: `${l.text} Cost: ${plural(l.buildCost.endeavors, 'endeavor')} + ${describeCost(c, l.buildCost.resources)}.`,
        disabled: st.endeavors < l.buildCost.endeavors ? `Needs ${plural(l.buildCost.endeavors, 'endeavor')}; you have ${st.endeavors}.` : !spent ? `Not enough resources (${describeCost(c, l.buildCost.resources)}).` : undefined,
      }),
    );
  }
  for (const i of c.pack.innovations) {
    if (st.innovations.includes(i.id)) continue;
    const missing = i.requires.filter((r) => !st.innovations.includes(r));
    options.push(
      opt(`innovate:${i.id}`, `Innovate: ${i.name}`, {
        group: 'Innovate',
        detail: `${i.text} Cost: ${plural(i.endeavors, 'endeavor')}.`,
        disabled: missing.length ? `Requires ${listJoin(missing.map((r) => c.innovations.get(r)?.name ?? r))} first.` : st.endeavors < i.endeavors ? `Needs ${plural(i.endeavors, 'endeavor')}; you have ${st.endeavors}.` : undefined,
      }),
    );
  }
  for (const g of c.pack.gear) {
    if (!g.craftedAt) continue;
    const at = c.locations.get(g.craftedAt)!;
    const spent = payCost(c, st.resources, g.cost);
    options.push(
      opt(`craft:${g.id}`, `Craft ${g.name}`, {
        group: 'Craft',
        detail: `${gearSummary(g)} At the ${at.name}. Cost: ${describeCost(c, g.cost)}.`,
        disabled: !st.locations.includes(at.id) ? `Build the ${at.name} first.` : !spent ? `Not enough resources (${describeCost(c, g.cost)}).` : undefined,
      }),
    );
  }
  const roomFor = living(s).some((sv) => sv.gear.length < GEAR_LIMIT);
  for (const [id, n] of Object.entries(st.gearStorage)) {
    options.push(
      opt(`equip:${id}`, `Give ${c.gearItem(id).name} to a survivor`, {
        group: 'Gear',
        detail: `${n} in storage. ${gearSummary(c.gearItem(id))}`,
        disabled: roomFor ? undefined : `Every survivor is already carrying ${GEAR_LIMIT} items.`,
      }),
    );
  }
  for (const sv of living(s)) {
    for (const g of sv.gear) options.push(opt(`unequip:${sv.id}:${g}`, `Return ${c.gearItem(g).name} from ${sv.name} to storage`, { group: 'Gear', survivorId: sv.id }));
  }
  options.push(
    opt('endYear', st.endeavors ? `End the settlement phase (${plural(st.endeavors, 'endeavor')} carried over)` : 'End the settlement phase', {
      group: 'Finish',
      detail: `Year ${st.year} ends and the next lantern year begins.`,
    }),
  );
  ask(s, {
    kind: 'settlement',
    title: `Settlement phase — year ${st.year}`,
    prompt: `Spend endeavors to build and innovate, craft gear from resources and equip survivors. ${plural(st.endeavors, 'endeavor')} left; ${plural(gearCount(s), 'item')} in storage.`,
    options,
  });
}

export function gearSummary(g: Gear) {
  const parts: string[] = [];
  if (g.weapon) parts.push(`Weapon: speed ${g.weapon.speed}, accuracy ${g.weapon.accuracy}+, strength ${g.weapon.strength}${g.weapon.range > 1 ? `, reach ${g.weapon.range}` : ''}.`);
  if (g.armor) parts.push(`Armor ${g.armor.value} on ${listJoin(g.armor.locations)}.`);
  const bonus = Object.entries(g.bonuses).map(([k, v]) => `${(v ?? 0) >= 0 ? '+' : ''}${v} ${k}`);
  if (bonus.length) parts.push(`${bonus.join(', ')}.`);
  if (g.text && !g.weapon && !g.armor && !bonus.length) parts.push(g.text);
  return parts.join(' ');
}

export function onCampaignDecision(s: GameState, c: Content, dcs: Decision, o: DecisionOption) {
  const st = s.settlement;
  switch (dcs.kind) {
    case 'departing': {
      if (o.id === 'confirm') {
        log(s, 'choice', `${listJoin(st.departing.map((id) => survivor(s, id).name))} will depart.`);
        front(s, { t: 'chooseQuarry' });
      } else {
        const id = o.id.slice(7);
        st.departing = st.departing.includes(id) ? st.departing.filter((x) => x !== id) : [...st.departing, id];
        front(s, { t: 'chooseDeparting' });
      }
      return;
    }
    case 'quarry': {
      const [monsterId, level] = o.id.split(':');
      log(s, 'choice', `Quarry chosen: ${c.monster(monsterId).name}, level ${level}.`);
      startHunt(s, c, monsterId, Number(level));
      return;
    }
    case 'settlement': {
      const [verb, a, b] = o.id.split(':');
      if (verb === 'build') {
        const l = c.locations.get(a)!;
        const spent = payCost(c, st.resources, l.buildCost.resources)!;
        spend(s, spent);
        st.endeavors -= l.buildCost.endeavors;
        st.locations.push(l.id);
        log(s, 'choice', `Built the ${l.name}.`, `Spent ${plural(l.buildCost.endeavors, 'endeavor')}${Object.keys(spent).length ? ` and ${describeCost(c, spent)}` : ''}.`);
      } else if (verb === 'innovate') {
        const i = c.innovations.get(a)!;
        st.endeavors -= i.endeavors;
        st.innovations.push(i.id);
        st.survivalLimit += i.grants.survivalLimit;
        log(s, 'choice', `Innovated ${i.name}. ${i.text}`, `Spent ${plural(i.endeavors, 'endeavor')}.${i.grants.survivalLimit ? ` Survival limit is now ${st.survivalLimit}.` : ''}`);
      } else if (verb === 'craft') {
        const g = c.gearItem(a);
        const spent = payCost(c, st.resources, g.cost)!;
        spend(s, spent);
        st.gearStorage[g.id] = (st.gearStorage[g.id] ?? 0) + 1;
        log(s, 'choice', `Crafted a ${g.name}; it goes into settlement storage.`, `Spent ${describeCost(c, spent)}.`);
      } else if (verb === 'equip') {
        const g = c.gearItem(a);
        ask(s, {
          kind: 'equipWho',
          title: `Give ${g.name} to…`,
          prompt: `Choose a survivor to carry the ${g.name}.`,
          options: [
            ...living(s).map((sv) =>
              opt(sv.id, sv.name, {
                survivorId: sv.id,
                detail: `Carrying ${sv.gear.length ? listJoin(sv.gear.map((x) => c.gearItem(x).name)) : 'nothing'}.`,
                disabled: sv.gear.length >= GEAR_LIMIT ? `Already carrying ${GEAR_LIMIT} items.` : undefined,
              }),
            ),
            opt('cancel', 'Cancel'),
          ],
          data: { gearId: g.id },
        });
        return;
      } else if (verb === 'unequip') {
        const sv = survivor(s, a);
        sv.gear.splice(sv.gear.indexOf(b), 1);
        st.gearStorage[b] = (st.gearStorage[b] ?? 0) + 1;
        log(s, 'choice', `${sv.name} returns the ${c.gearItem(b).name} to storage.`);
      } else if (verb === 'endYear') {
        log(s, 'choice', `The settlement phase of year ${st.year} ends.`);
        front(s, { t: 'yearEnd' });
        return;
      }
      front(s, { t: 'settlementActions' });
      return;
    }
    case 'equipWho': {
      const gearId = (dcs.data as { gearId: string }).gearId;
      if (o.id !== 'cancel') {
        const sv = survivor(s, o.id);
        sv.gear.push(gearId);
        st.gearStorage[gearId]--;
        if (!st.gearStorage[gearId]) delete st.gearStorage[gearId];
        log(s, 'choice', `${sv.name} now carries the ${c.gearItem(gearId).name}.`);
      }
      front(s, { t: 'settlementActions' });
      return;
    }
  }
}

export function yearEnd(s: GameState, c: Content) {
  s.settlement.year++;
  if (s.settlement.year > c.pack.campaign.lastYear) {
    s.phase = 'over';
    s.outcome = {
      result: 'won',
      text: `${s.settlement.name} endured ${c.pack.campaign.lastYear} lantern years with ${plural(living(s).length, 'survivor')} alive and ${plural(s.settlement.defeatedQuarries.length, 'quarry', 'quarries')} defeated.`,
    };
    log(s, 'phase', `The campaign is over. ${s.outcome.text}`);
    return;
  }
  front(s, { t: 'yearStart' });
}

export function lose(s: GameState, text: string) {
  s.phase = 'over';
  s.outcome = { result: 'lost', text };
  s.queue = [];
  log(s, 'phase', text);
}
