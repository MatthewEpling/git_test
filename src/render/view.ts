// What the board shows right now, derived from game state and the open decision. Both the
// 3D renderer and the 2D fallback draw from this, so they always offer the same choices.
import type { Content } from '../engine/core';
import { survivor } from '../engine/core';
import type { Facing, GameState } from '../engine/state';

export const SURVIVOR_COLORS = ['#d9a441', '#5fa8d3', '#c75b7a', '#7cc47f', '#b48ee0', '#e07b39', '#4fc1b7', '#d4d4d4'];

export interface BoardSurvivor {
  id: string;
  name: string;
  initial: string;
  x: number;
  y: number;
  color: string;
  knockedDown: boolean;
  active: boolean;
  targeted: boolean;
  /** Option id that selecting this survivor answers, if any. */
  pick?: string;
  pickLabel?: string;
}

export interface BoardCell {
  x: number;
  y: number;
  pick: string;
  label: string;
}

export interface BoardView {
  width: number;
  height: number;
  survivors: BoardSurvivor[];
  monster: { x: number; y: number; w: number; h: number; facing: Facing; name: string; pick?: string; pickLabel?: string };
  cells: BoardCell[];
  hint: string;
}

export function survivorColor(s: GameState, id: string) {
  return SURVIVOR_COLORS[Math.max(0, s.survivors.findIndex((x) => x.id === id)) % SURVIVOR_COLORS.length];
}

export function boardView(s: GameState, c: Content): BoardView | null {
  const sd = s.showdown;
  if (!sd) return null;
  const m = c.monster(sd.monsterId);
  const d = s.pending;
  const legal = (d?.options ?? []).filter((o) => !o.disabled);
  const bySurvivor = new Map(legal.filter((o) => o.survivorId).map((o) => [o.survivorId!, o]));
  const attacks = d?.kind === 'activation' ? legal.filter((o) => o.id.startsWith('attack:')) : [];
  const cells = legal.filter((o) => o.cell).map((o) => ({ x: o.cell![0], y: o.cell![1], pick: o.id, label: o.label }));
  let hint = '';
  if (cells.length) hint = 'Click a highlighted square to move there.';
  else if (bySurvivor.size && d?.kind !== 'activation') hint = 'Click a highlighted survivor, or use the buttons.';
  else if (attacks.length) hint = attacks.length === 1 ? 'Click the monster to attack, or use the buttons.' : 'Choose a weapon in the panel to attack.';
  return {
    width: c.rules.board.width,
    height: c.rules.board.height,
    survivors: sd.combatants
      .filter((cb) => !cb.out && survivor(s, cb.survivorId).alive)
      .map((cb) => {
        const sv = survivor(s, cb.survivorId);
        const o = d?.kind === 'activation' ? undefined : bySurvivor.get(cb.survivorId);
        return {
          id: sv.id,
          name: sv.name,
          initial: sv.name.slice(0, 1).toUpperCase(),
          x: cb.x,
          y: cb.y,
          color: survivorColor(s, sv.id),
          knockedDown: cb.knockedDown,
          active: sd.active === sv.id,
          targeted: sd.target === sv.id && sd.turn === 'monster',
          pick: o?.id,
          pickLabel: o?.label,
        };
      }),
    monster: {
      x: sd.monster.x,
      y: sd.monster.y,
      w: m.size.w,
      h: m.size.h,
      facing: sd.monster.facing,
      name: m.name.replace(/\s*\(.*\)$/, ''),
      pick: attacks.length === 1 ? attacks[0].id : undefined,
      pickLabel: attacks.length === 1 ? attacks[0].label : undefined,
    },
    cells,
    hint,
  };
}
