// Public engine API. A game is (content pack, seed, commands): `newGame` sets it up,
// `apply` answers the current decision, `replay` rebuilds any point from the command list
// (used for loading saves and for undo). Every step is deterministic.
import {
  aftermath,
  chooseDeparting,
  chooseQuarry,
  createCampaign,
  huntTurn,
  onCampaignDecision,
  settlementActions,
  settlementStart,
  yearEnd,
  yearStart,
} from './campaign';
import { Content, EngineError, IllegalCommand, log } from './core';
import { onEffectDecision, runEffect } from './effects';
import {
  activation,
  applyHit,
  attackRoll,
  checkShowdownEnd,
  monsterAct,
  monsterAttack,
  monsterHits,
  monsterTurn,
  onHitEffects,
  onShowdownDecision,
  pickActivation,
  resolveHitLocation,
  roundStart,
  setupShowdown,
  survivorsTurn,
  survivorsTurnEnd,
  woundRoll,
} from './showdown';
import type { Command, GameState, Job } from './state';

export { Content, EngineError, IllegalCommand };

const MAX_STEPS = 20000;

function handleJob(s: GameState, c: Content, job: Job) {
  switch (job.t) {
    case 'effect':
      return runEffect(s, c, job.effect, job.ctx);
    case 'yearStart':
      return yearStart(s, c);
    case 'chooseDeparting':
      return chooseDeparting(s, c);
    case 'chooseQuarry':
      return chooseQuarry(s, c);
    case 'huntTurn':
      return huntTurn(s, c);
    case 'showdownSetup':
      return setupShowdown(s, c);
    case 'roundStart':
      return roundStart(s, c);
    case 'monsterTurn':
      return monsterTurn(s, c);
    case 'monsterAct':
      return monsterAct(s, c, job.cardId, job.targetId);
    case 'monsterAttack':
      return monsterAttack(s, c, job.cardId, job.targetId);
    case 'monsterHits':
      return monsterHits(s, job.cardId, job.targetId, job.hits);
    case 'applyHit':
      return applyHit(s, c, job.targetId, job.cardId);
    case 'onHitEffects':
      return onHitEffects(s, c, job.cardId, job.targetId);
    case 'survivorsTurn':
      return survivorsTurn(s);
    case 'pickActivation':
      return pickActivation(s, c);
    case 'activation':
      return activation(s, c, job.survivorId);
    case 'attackRoll':
      return attackRoll(s, c, job.survivorId, job.gearId);
    case 'resolveHitLocation':
      return resolveHitLocation(s, c, job.survivorId, job.gearId, job.cardId);
    case 'woundRoll':
      return woundRoll(s, c, job.survivorId, job.gearId, job.cardId);
    case 'checkShowdownEnd':
      return checkShowdownEnd(s);
    case 'survivorsTurnEnd':
      return survivorsTurnEnd(s);
    case 'aftermath':
      return aftermath(s, c);
    case 'settlementStart':
      return settlementStart(s, c);
    case 'settlementActions':
      return settlementActions(s, c);
    case 'yearEnd':
      return yearEnd(s, c);
  }
}

/** Run automatic steps until the game needs a player decision or ends. */
export function run(s: GameState, c: Content) {
  let n = 0;
  while (!s.pending && !s.outcome && s.queue.length) {
    if (++n > MAX_STEPS) throw new EngineError('The engine ran too many steps without needing a decision (a content loop?).');
    handleJob(s, c, s.queue.shift()!);
  }
  if (!s.pending && !s.outcome) throw new EngineError('The engine stopped with nothing left to do and no decision to make.');
}

export function newGame(c: Content, seed: string): GameState {
  const s = createCampaign(c, seed);
  run(s, c);
  return s;
}

/** Answer the current decision. Returns a new state; the old one is untouched. */
export function apply(state: GameState, c: Content, cmd: Command): GameState {
  const s = structuredClone(state);
  applyInPlace(s, c, cmd);
  return s;
}

function applyInPlace(s: GameState, c: Content, cmd: Command) {
  const dcs = s.pending;
  if (!dcs) throw new IllegalCommand('There is no decision to answer right now.');
  if (dcs.id !== cmd.decisionId) throw new IllegalCommand('That choice belongs to an earlier decision.');
  const o = dcs.options.find((x) => x.id === cmd.optionId);
  if (!o) throw new IllegalCommand(`"${cmd.optionId}" isn't one of the options for this decision.`);
  if (o.disabled) throw new IllegalCommand(o.disabled);
  s.pending = null;
  switch (dcs.kind) {
    case 'chooseSurvivor':
    case 'effectChoice':
    case 'manual':
      if (dcs.kind !== 'manual') log(s, 'choice', `${dcs.title}: ${o.label}.`);
      onEffectDecision(s, dcs, o);
      break;
    case 'departing':
    case 'quarry':
    case 'settlement':
    case 'equipWho':
      onCampaignDecision(s, c, dcs, o);
      break;
    case 'monsterTarget':
    case 'dodge':
    case 'pickActivation':
    case 'activation':
    case 'move':
      onShowdownDecision(s, c, dcs, o);
      break;
    default:
      throw new EngineError(`No handler for decision "${dcs.kind}".`);
  }
  run(s, c);
}

/** Rebuild a game from its seed and commands. Throws if a command no longer fits, which
 *  means the save was made with different content or a different engine version. */
export function replay(c: Content, seed: string, commands: Command[]): GameState {
  const s = createCampaign(c, seed);
  run(s, c);
  for (const [i, cmd] of commands.entries()) {
    try {
      applyInPlace(s, c, cmd);
    } catch (e) {
      throw new EngineError(`Replay failed at step ${i + 1} of ${commands.length}: ${(e as Error).message}`);
    }
  }
  return s;
}
