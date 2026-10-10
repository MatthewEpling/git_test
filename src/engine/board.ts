// Showdown board geometry: distances, adjacency, survivor movement range, monster pathing,
// facing and knockback. Orthogonal-only unless the rules config allows diagonals.
import type { Content } from './core';
import { combatant, survivor } from './core';
import type { Facing, GameState, ShowdownState } from './state';

export type Cell = [number, number];

const ORTHO: Cell[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAG: Cell[] = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

export function steps(c: Content): Cell[] {
  return c.rules.diagonalMovement ? [...ORTHO, ...DIAG] : ORTHO;
}

export function inBounds(c: Content, x: number, y: number) {
  return x >= 0 && y >= 0 && x < c.rules.board.width && y < c.rules.board.height;
}

export interface Footprint {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function monsterFootprint(c: Content, sd: ShowdownState): Footprint {
  const m = c.monster(sd.monsterId);
  return { x: sd.monster.x, y: sd.monster.y, w: m.size.w, h: m.size.h };
}

export function inFootprint(f: Footprint, x: number, y: number) {
  return x >= f.x && x < f.x + f.w && y >= f.y && y < f.y + f.h;
}

/** Squares between a cell and a footprint (0 = inside, 1 = adjacent). */
export function distToFootprint(c: Content, f: Footprint, x: number, y: number) {
  const dx = Math.max(f.x - x, 0, x - (f.x + f.w - 1));
  const dy = Math.max(f.y - y, 0, y - (f.y + f.h - 1));
  return c.rules.diagonalMovement ? Math.max(dx, dy) : dx + dy;
}

export function cellDist(c: Content, a: Cell, b: Cell) {
  const dx = Math.abs(a[0] - b[0]);
  const dy = Math.abs(a[1] - b[1]);
  return c.rules.diagonalMovement ? Math.max(dx, dy) : dx + dy;
}

/** Survivors standing on the board (alive and not taken out). */
export function standing(s: GameState) {
  return (s.showdown?.combatants ?? []).filter((cb) => !cb.out && survivor(s, cb.survivorId).alive);
}

/** Squares a survivor can end a move on, with the steps it takes. Survivors may pass
 *  through other survivors but not stop on them, and never pass through the monster. */
export function reachable(s: GameState, c: Content, survivorId: string, movement: number): Map<string, number> {
  const sd = s.showdown!;
  const me = combatant(s, survivorId)!;
  const f = monsterFootprint(c, sd);
  const others = new Set(standing(s).filter((x) => x.survivorId !== survivorId).map((x) => `${x.x},${x.y}`));
  const best = new Map<string, number>([[`${me.x},${me.y}`, 0]]);
  const queue: [number, number, number][] = [[me.x, me.y, 0]];
  while (queue.length) {
    const [x, y, cost] = queue.shift()!;
    if (cost >= movement) continue;
    for (const [dx, dy] of steps(c)) {
      const nx = x + dx;
      const ny = y + dy;
      const key = `${nx},${ny}`;
      if (!inBounds(c, nx, ny) || inFootprint(f, nx, ny)) continue;
      if ((best.get(key) ?? Infinity) <= cost + 1) continue;
      best.set(key, cost + 1);
      queue.push([nx, ny, cost + 1]);
    }
  }
  const out = new Map<string, number>();
  for (const [key, cost] of best) if (cost > 0 && !others.has(key)) out.set(key, cost);
  return out;
}

/** Where the monster ends up moving toward a target, and how far it moved.
 *  It stops as soon as it is adjacent; otherwise it gets as close as it can. */
export function monsterPath(s: GameState, c: Content, target: Cell, movement: number): { x: number; y: number; moved: number } {
  const sd = s.showdown!;
  const m = c.monster(sd.monsterId);
  const blocked = new Set(standing(s).map((x) => `${x.x},${x.y}`));
  const fits = (x: number, y: number) => {
    if (x < 0 || y < 0 || x + m.size.w > c.rules.board.width || y + m.size.h > c.rules.board.height) return false;
    for (let i = 0; i < m.size.w; i++) for (let j = 0; j < m.size.h; j++) if (blocked.has(`${x + i},${y + j}`)) return false;
    return true;
  };
  const distAt = (x: number, y: number) => distToFootprint(c, { x, y, w: m.size.w, h: m.size.h }, target[0], target[1]);
  const start = { x: sd.monster.x, y: sd.monster.y };
  if (distAt(start.x, start.y) <= 1) return { ...start, moved: 0 };
  const seen = new Map<string, number>([[`${start.x},${start.y}`, 0]]);
  const queue: [number, number, number][] = [[start.x, start.y, 0]];
  let best = { x: start.x, y: start.y, moved: 0, dist: distAt(start.x, start.y) };
  const better = (x: number, y: number, moved: number) => {
    const dist = distAt(x, y);
    const adjacent = dist <= 1;
    const bestAdjacent = best.dist <= 1;
    if (adjacent !== bestAdjacent) return adjacent;
    if (adjacent) return moved < best.moved || (moved === best.moved && (y < best.y || (y === best.y && x < best.x)));
    return dist < best.dist || (dist === best.dist && (moved < best.moved || (moved === best.moved && (y < best.y || (y === best.y && x < best.x)))));
  };
  while (queue.length) {
    const [x, y, cost] = queue.shift()!;
    if (better(x, y, cost)) best = { x, y, moved: cost, dist: distAt(x, y) };
    if (cost >= movement || distAt(x, y) <= 1) continue;
    for (const [dx, dy] of steps(c)) {
      const nx = x + dx;
      const ny = y + dy;
      const key = `${nx},${ny}`;
      if (seen.has(key) || !fits(nx, ny)) continue;
      seen.set(key, cost + 1);
      queue.push([nx, ny, cost + 1]);
    }
  }
  return { x: best.x, y: best.y, moved: best.moved };
}

/** Facing that points from the monster's centre toward a cell. */
export function faceToward(f: Footprint, cell: Cell): Facing {
  const cx = f.x + (f.w - 1) / 2;
  const cy = f.y + (f.h - 1) / 2;
  const dx = cell[0] - cx;
  const dy = cell[1] - cy;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'E' : 'W';
  return dy > 0 ? 'S' : 'N';
}

/** Whether a cell is beyond the monster's front edge. */
export function inFront(f: Footprint, facing: Facing, cell: Cell) {
  switch (facing) {
    case 'N':
      return cell[1] < f.y;
    case 'S':
      return cell[1] > f.y + f.h - 1;
    case 'E':
      return cell[0] > f.x + f.w - 1;
    case 'W':
      return cell[0] < f.x;
  }
}

/** Push a survivor straight away from the monster. Stops at the board edge or another
 *  survivor. Returns how many squares they actually moved. */
export function knockback(s: GameState, c: Content, survivorId: string, spaces: number): number {
  const sd = s.showdown!;
  const me = combatant(s, survivorId)!;
  const f = monsterFootprint(c, sd);
  const cx = f.x + (f.w - 1) / 2;
  const cy = f.y + (f.h - 1) / 2;
  const dx = me.x - cx;
  const dy = me.y - cy;
  const dir: Cell = Math.abs(dx) >= Math.abs(dy) ? [Math.sign(dx) || 1, 0] : [0, Math.sign(dy) || 1];
  const others = new Set(standing(s).filter((x) => x.survivorId !== survivorId).map((x) => `${x.x},${x.y}`));
  let moved = 0;
  for (let i = 0; i < spaces; i++) {
    const nx = me.x + dir[0];
    const ny = me.y + dir[1];
    if (!inBounds(c, nx, ny) || inFootprint(f, nx, ny) || others.has(`${nx},${ny}`)) break;
    me.x = nx;
    me.y = ny;
    moved++;
  }
  return moved;
}
