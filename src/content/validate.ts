// Loads a content pack: schema check first, then cross-references (every id that one piece
// of content mentions must exist). Problems come back as readable messages, never thrown
// half-way through a game.
import { ContentPack, type Effect } from './schema';

export type LoadResult = { ok: true; pack: ContentPack; warnings: string[] } | { ok: false; errors: string[] };

export function loadPack(raw: unknown): LoadResult {
  const parsed = ContentPack.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.slice(0, 40).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    };
  }
  const pack = parsed.data;
  const errors: string[] = [];
  const warnings: string[] = [];
  const resourceIds = new Set(pack.resources.map((r) => r.id));
  const gearIds = new Set(pack.gear.map((g) => g.id));
  const locationIds = new Set(pack.locations.map((l) => l.id));
  const eventIds = new Set(pack.huntEvents.map((e) => e.id));
  const innovationIds = new Set(pack.innovations.map((i) => i.id));
  const keywords = new Set(pack.resources.flatMap((r) => r.keywords));

  const dupes = (label: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) errors.push(`${label}: duplicate id "${id}"`);
      seen.add(id);
    }
  };
  dupes('resources', pack.resources.map((r) => r.id));
  dupes('gear', pack.gear.map((g) => g.id));
  dupes('locations', pack.locations.map((l) => l.id));
  dupes('huntEvents', pack.huntEvents.map((e) => e.id));
  dupes('monsters', pack.monsters.map((m) => m.id));

  const checkEffects = (where: string, effects: Effect[]) => {
    for (const e of effects) {
      if (e.op === 'resource' && !resourceIds.has(e.id)) errors.push(`${where}: unknown resource "${e.id}"`);
      if (e.op === 'choice') e.options.forEach((o, i) => checkEffects(`${where} → option ${i + 1}`, o.effects));
      if (e.op === 'roll') {
        checkTable(`${where} → ${e.label}`, e.die, e.table);
        e.table.forEach((row) => checkEffects(`${where} → ${row.label}`, row.effects));
      }
    }
  };
  const checkTable = (where: string, die: number, rows: { min: number; max: number }[]) => {
    const covered = new Array(die + 1).fill(0);
    for (const r of rows) for (let v = r.min; v <= r.max; v++) if (v >= 1 && v <= die) covered[v]++;
    for (let v = 1; v <= die; v++) {
      if (covered[v] === 0) errors.push(`${where}: no row for a roll of ${v}`);
      if (covered[v] > 1) errors.push(`${where}: more than one row for a roll of ${v}`);
    }
  };
  const checkCost = (where: string, cost: Record<string, number>) => {
    for (const key of Object.keys(cost)) {
      if (key.startsWith('keyword:')) {
        if (!keywords.has(key.slice(8))) errors.push(`${where}: no resource has keyword "${key.slice(8)}"`);
      } else if (!resourceIds.has(key)) errors.push(`${where}: unknown resource "${key}"`);
    }
  };

  if (!gearIds.has(pack.rules.unarmedWeapon)) errors.push(`rules.unarmedWeapon: unknown gear "${pack.rules.unarmedWeapon}"`);
  for (const g of pack.gear) {
    checkCost(`gear ${g.id}`, g.cost);
    if (g.craftedAt && !locationIds.has(g.craftedAt)) errors.push(`gear ${g.id}: unknown location "${g.craftedAt}"`);
    if (Object.keys(g.cost).length && !g.craftedAt) warnings.push(`gear ${g.id} has a cost but no craftedAt location, so it can't be crafted`);
  }
  for (const l of pack.locations) checkCost(`location ${l.id}`, l.buildCost.resources);
  for (const i of pack.innovations) for (const r of i.requires) if (!innovationIds.has(r)) errors.push(`innovation ${i.id}: requires unknown "${r}"`);
  for (const e of pack.huntEvents) checkEffects(`hunt event ${e.id}`, e.effects);
  checkTable('huntEventTable', pack.huntEventTable.die, pack.huntEventTable.entries);
  for (const row of pack.huntEventTable.entries) if (!eventIds.has(row.event)) errors.push(`huntEventTable: unknown event "${row.event}"`);
  for (const [id] of Object.entries(pack.basicResourceDeck)) if (!resourceIds.has(id)) errors.push(`basicResourceDeck: unknown resource "${id}"`);
  for (const [loc, table] of Object.entries(pack.severeInjuries)) {
    checkTable(`severeInjuries.${loc}`, table.die, table.entries);
    table.entries.forEach((row) => checkEffects(`severeInjuries.${loc} → ${row.name}`, row.effects));
  }
  for (const t of pack.timeline) checkEffects(`timeline year ${t.year}`, t.effects);
  for (const id of pack.campaign.startingGear) if (!gearIds.has(id)) errors.push(`campaign.startingGear: unknown gear "${id}"`);
  for (const id of Object.keys(pack.campaign.startingResources)) if (!resourceIds.has(id)) errors.push(`campaign.startingResources: unknown resource "${id}"`);
  if (!pack.monsters.some((m) => m.id === pack.campaign.startingQuarry)) errors.push(`campaign.startingQuarry: unknown monster "${pack.campaign.startingQuarry}"`);

  for (const m of pack.monsters) {
    for (const c of m.aiCards) {
      checkEffects(`monster ${m.id} AI ${c.id}`, [...c.before, ...c.onHit, ...c.noTarget]);
    }
    for (const h of m.hitLocations) checkEffects(`monster ${m.id} hit location ${h.id}`, [...h.reflex, ...h.failure, ...h.wound, ...h.critical]);
    for (const id of Object.keys(m.resourceDeck)) if (!resourceIds.has(id)) errors.push(`monster ${m.id}: resource deck has unknown resource "${id}"`);
    for (const [space, ev] of Object.entries(m.huntSpaces)) {
      if (!eventIds.has(ev)) errors.push(`monster ${m.id}: hunt space ${space} has unknown event "${ev}"`);
    }
    for (const lvl of m.levels) {
      for (const tier of ['basic', 'advanced', 'legendary'] as const) {
        const have = m.aiCards.filter((c) => c.tier === tier).length;
        if (have < lvl.aiDeck[tier]) errors.push(`monster ${m.id} level ${lvl.level}: needs ${lvl.aiDeck[tier]} ${tier} AI cards but the pack has ${have}`);
      }
      if (lvl.huntPosition > pack.rules.huntBoardLength) errors.push(`monster ${m.id} level ${lvl.level}: hunt position ${lvl.huntPosition} is past the end of the hunt board`);
    }
    if (!m.hitLocations.some((h) => !h.trap)) errors.push(`monster ${m.id}: hit location deck has no non-trap cards`);
  }

  const unverified = Object.entries(pack.rules.verification).filter(([, v]) => v.status !== 'verified');
  if (unverified.length) warnings.push(`${unverified.length} rule values are not verified against the rulebook (see the rules backlog).`);
  return errors.length ? { ok: false, errors } : { ok: true, pack, warnings };
}
