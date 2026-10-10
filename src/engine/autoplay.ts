// A simple automatic player, used by tests and the "auto-play" developer tool. It never
// picks a disabled option and prefers sensible moves (approach the monster, attack with
// the best weapon, spend endeavors), so whole campaigns can be played without a person.
import { distToFootprint, monsterFootprint } from './board';
import type { Content } from './core';
import type { Command, GameState } from './state';

export function autoChoice(s: GameState, c: Content): Command {
  const dcs = s.pending!;
  const legal = dcs.options.filter((o) => !o.disabled);
  const pick = (id: string) => legal.find((o) => o.id === id);
  let choice = legal[0];
  switch (dcs.kind) {
    case 'departing':
      choice = pick('confirm') ?? choice;
      break;
    case 'quarry':
      choice = legal[0];
      break;
    case 'dodge':
      choice = pick('dodge') ?? choice;
      break;
    case 'pickActivation':
      choice = legal.find((o) => o.id !== 'endTurn') ?? choice;
      break;
    case 'activation': {
      const attacks = legal.filter((o) => o.id.startsWith('attack:'));
      if (attacks.length) choice = attacks[attacks.length - 1];
      else choice = pick('move') ?? pick('done') ?? choice;
      break;
    }
    case 'move': {
      const sd = s.showdown!;
      const f = monsterFootprint(c, sd);
      const cells = legal.filter((o) => o.cell);
      if (cells.length) {
        cells.sort((a, b) => distToFootprint(c, f, a.cell![0], a.cell![1]) - distToFootprint(c, f, b.cell![0], b.cell![1]));
        choice = cells[0];
      }
      break;
    }
    case 'settlement': {
      const prefer = legal.find((o) => o.id.startsWith('build:')) ?? legal.find((o) => o.id.startsWith('innovate:')) ?? legal.find((o) => o.id.startsWith('craft:')) ?? legal.find((o) => o.id.startsWith('equip:'));
      choice = prefer ?? pick('endYear') ?? choice;
      break;
    }
    case 'equipWho':
      choice = legal.find((o) => o.id !== 'cancel') ?? choice;
      break;
  }
  return { decisionId: dcs.id, optionId: choice.id };
}
