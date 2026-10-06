// Dreamcast controls, how they map onto the libretro RetroPad, and default bindings.

import { JOY } from '../emu/libretro';

/** A control the player can bind. Axis controls are half-axes (e.g. stick left). */
export type ControlId =
  | 'a'
  | 'b'
  | 'x'
  | 'y'
  | 'start'
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'ltrigger'
  | 'rtrigger'
  | 'stickUp'
  | 'stickDown'
  | 'stickLeft'
  | 'stickRight'
  | 'c'
  | 'z'
  | 'd'
  | 'stick2Up'
  | 'stick2Down'
  | 'stick2Left'
  | 'stick2Right';

export interface ControlDef {
  id: ControlId;
  label: string;
  group: 'Buttons' | 'D-pad' | 'Analog stick' | 'Triggers' | 'Extra (arcade / twin stick)';
  /** RetroPad button bit this control sets, if it is a button. */
  joy?: number;
  /** Analog axis this control pushes: [stick index 0/1, axis 0=x 1=y, direction -1/1]. */
  axis?: [number, number, -1 | 1];
  /** Analog trigger (L2/R2) this control presses fully. */
  trigger?: 0 | 1;
}

// Flycast maps RetroPad B→A, A→B, Y→X, X→Y (by position), L2/R2→the analog triggers,
// and Y/X/L/R extras to C/Z/D on six-button pads.
export const CONTROLS: ControlDef[] = [
  { id: 'a', label: 'A', group: 'Buttons', joy: JOY.B },
  { id: 'b', label: 'B', group: 'Buttons', joy: JOY.A },
  { id: 'x', label: 'X', group: 'Buttons', joy: JOY.Y },
  { id: 'y', label: 'Y', group: 'Buttons', joy: JOY.X },
  { id: 'start', label: 'Start', group: 'Buttons', joy: JOY.START },
  { id: 'up', label: 'Up', group: 'D-pad', joy: JOY.UP },
  { id: 'down', label: 'Down', group: 'D-pad', joy: JOY.DOWN },
  { id: 'left', label: 'Left', group: 'D-pad', joy: JOY.LEFT },
  { id: 'right', label: 'Right', group: 'D-pad', joy: JOY.RIGHT },
  { id: 'stickUp', label: 'Stick up', group: 'Analog stick', axis: [0, 1, -1] },
  { id: 'stickDown', label: 'Stick down', group: 'Analog stick', axis: [0, 1, 1] },
  { id: 'stickLeft', label: 'Stick left', group: 'Analog stick', axis: [0, 0, -1] },
  { id: 'stickRight', label: 'Stick right', group: 'Analog stick', axis: [0, 0, 1] },
  { id: 'ltrigger', label: 'L trigger', group: 'Triggers', trigger: 0, joy: JOY.L2 },
  { id: 'rtrigger', label: 'R trigger', group: 'Triggers', trigger: 1, joy: JOY.R2 },
  { id: 'c', label: 'C', group: 'Extra (arcade / twin stick)', joy: JOY.L },
  { id: 'z', label: 'Z', group: 'Extra (arcade / twin stick)', joy: JOY.R },
  { id: 'd', label: 'D', group: 'Extra (arcade / twin stick)', joy: JOY.SELECT },
  { id: 'stick2Up', label: 'Right stick up', group: 'Extra (arcade / twin stick)', axis: [1, 1, -1] },
  { id: 'stick2Down', label: 'Right stick down', group: 'Extra (arcade / twin stick)', axis: [1, 1, 1] },
  { id: 'stick2Left', label: 'Right stick left', group: 'Extra (arcade / twin stick)', axis: [1, 0, -1] },
  { id: 'stick2Right', label: 'Right stick right', group: 'Extra (arcade / twin stick)', axis: [1, 0, 1] },
];

export type KeyBindings = Partial<Record<ControlId, string>>;

export const DEFAULT_KEYS: KeyBindings = {
  a: 'KeyK',
  b: 'KeyL',
  x: 'KeyJ',
  y: 'KeyI',
  start: 'Enter',
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  stickUp: 'KeyW',
  stickDown: 'KeyS',
  stickLeft: 'KeyA',
  stickRight: 'KeyD',
  ltrigger: 'KeyQ',
  rtrigger: 'KeyE',
  c: 'KeyU',
  z: 'KeyO',
  d: 'KeyH',
  stick2Up: 'Numpad8',
  stick2Down: 'Numpad5',
  stick2Left: 'Numpad4',
  stick2Right: 'Numpad6',
};

/** A gamepad input: a button index, or a half-axis like "a1-" (axis 1, negative). */
export type PadInput = string;

export type PadBindings = Partial<Record<ControlId, PadInput>>;

// W3C "standard" gamepad layout.
export const DEFAULT_PAD: PadBindings = {
  a: 'b0',
  b: 'b1',
  x: 'b2',
  y: 'b3',
  start: 'b9',
  up: 'b12',
  down: 'b13',
  left: 'b14',
  right: 'b15',
  stickUp: 'a1-',
  stickDown: 'a1+',
  stickLeft: 'a0-',
  stickRight: 'a0+',
  ltrigger: 'b6',
  rtrigger: 'b7',
  c: 'b4',
  z: 'b5',
  d: 'b8',
  stick2Up: 'a3-',
  stick2Down: 'a3+',
  stick2Left: 'a2-',
  stick2Right: 'a2+',
};

export function padInputLabel(input: PadInput | undefined): string {
  if (!input) return '—';
  const names: Record<string, string> = {
    b0: 'A / Cross',
    b1: 'B / Circle',
    b2: 'X / Square',
    b3: 'Y / Triangle',
    b4: 'LB / L1',
    b5: 'RB / R1',
    b6: 'LT / L2',
    b7: 'RT / R2',
    b8: 'Back / Select',
    b9: 'Start',
    b10: 'L-stick press',
    b11: 'R-stick press',
    b12: 'D-pad up',
    b13: 'D-pad down',
    b14: 'D-pad left',
    b15: 'D-pad right',
    b16: 'Home / Guide',
    'a0-': 'L-stick left',
    'a0+': 'L-stick right',
    'a1-': 'L-stick up',
    'a1+': 'L-stick down',
    'a2-': 'R-stick left',
    'a2+': 'R-stick right',
    'a3-': 'R-stick up',
    'a3+': 'R-stick down',
  };
  return names[input] ?? (input.startsWith('b') ? `Button ${input.slice(1)}` : `Axis ${input.slice(1)}`);
}

export type HotkeyId = 'menu' | 'fastForward' | 'pause' | 'saveState' | 'loadState' | 'prevSlot' | 'nextSlot' | 'screenshot' | 'fullscreen';

export const HOTKEYS: { id: HotkeyId; label: string }[] = [
  { id: 'menu', label: 'Open menu' },
  { id: 'fastForward', label: 'Fast forward (hold)' },
  { id: 'pause', label: 'Pause / resume' },
  { id: 'saveState', label: 'Save state' },
  { id: 'loadState', label: 'Load state' },
  { id: 'prevSlot', label: 'Previous save slot' },
  { id: 'nextSlot', label: 'Next save slot' },
  { id: 'screenshot', label: 'Screenshot' },
  { id: 'fullscreen', label: 'Fullscreen' },
];

export const DEFAULT_HOTKEYS: Record<HotkeyId, string> = {
  menu: 'Escape',
  fastForward: 'Tab',
  pause: 'KeyP',
  saveState: 'F2',
  loadState: 'F4',
  prevSlot: 'F6',
  nextSlot: 'F7',
  screenshot: 'F9',
  fullscreen: 'F10',
};
