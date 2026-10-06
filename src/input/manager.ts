// Turns keyboards, gamepads, the mouse and remote netplay players into the per-port
// state the core asks for each frame.

import { ANALOG_INDEX, DEVICE, JOY, LIGHTGUN_ID, MOUSE_ID, deviceBase } from '../emu/libretro';
import { CONTROLS, DEFAULT_KEYS, DEFAULT_PAD, type ControlId, type KeyBindings, type PadBindings } from './bindings';
import { retroKeyFromCode } from './keys';

/** One controller's worth of state, in RetroPad terms. Also the netplay wire format. */
export interface PadState {
  buttons: number;
  /** Left X, left Y, right X, right Y in -32768..32767. */
  axes: [number, number, number, number];
  /** L2/R2 analog triggers in 0..32767. */
  triggers: [number, number];
}

export const emptyPad = (): PadState => ({ buttons: 0, axes: [0, 0, 0, 0], triggers: [0, 0] });

/** Where a port's input comes from. */
export type PortSource = 'auto' | 'keyboard' | `gamepad-${number}` | `remote-${string}` | 'none';

export interface PortConfig {
  /** libretro device id (may include a subclass, e.g. arcade stick). */
  device: number;
  source: PortSource;
}

export const DEFAULT_PORTS: PortConfig[] = [
  { device: DEVICE.JOYPAD, source: 'auto' },
  { device: DEVICE.JOYPAD, source: 'gamepad-1' },
  { device: DEVICE.JOYPAD, source: 'gamepad-2' },
  { device: DEVICE.JOYPAD, source: 'gamepad-3' },
];

export interface InputSettings {
  keys: KeyBindings;
  pad: PadBindings;
  deadzone: number;
  /** Multiplier for mouse movement sent to the Dreamcast mouse. */
  mouseSensitivity: number;
  rumble: boolean;
}

export const DEFAULT_INPUT: InputSettings = {
  keys: DEFAULT_KEYS,
  pad: DEFAULT_PAD,
  deadzone: 0.15,
  mouseSensitivity: 1,
  rumble: true,
};

interface RemoteInput {
  pad: PadState;
  keys: Set<number>;
}

const AXIS_MAX = 32767;

export class InputManager {
  ports: PortConfig[] = DEFAULT_PORTS.map((p) => ({ ...p }));
  settings: InputSettings = { ...DEFAULT_INPUT };
  /** Physical keys held, by KeyboardEvent.code. */
  readonly keysDown = new Set<string>();
  /** Codes reserved for hotkeys/UI that must not reach the game. */
  reservedKeys = new Set<string>();
  private remotes = new Map<string, RemoteInput>();
  private padSnapshot: PadState[] = [emptyPad(), emptyPad(), emptyPad(), emptyPad()];
  private gamepads: Gamepad[] = [];
  private mouse = { dx: 0, dy: 0, buttons: 0, wheel: 0 };
  private mouseFrame = { dx: 0, dy: 0, buttons: 0, wheel: 0 };
  private gun = { x: 0, y: 0, offscreen: true, buttons: 0 };
  private rumbleState = new Map<number, { strong: number; weak: number; last: number }>();
  /** Set when any gamepad input is seen, so the UI can say "controller connected". */
  onGamepadsChanged?: (pads: Gamepad[]) => void;
  private knownPads = '';

  // ───────────────────────── Local devices ─────────────────────────

  keyDown(code: string) {
    this.keysDown.add(code);
  }

  keyUp(code: string) {
    this.keysDown.delete(code);
  }

  releaseAll() {
    this.keysDown.clear();
    this.mouse = { dx: 0, dy: 0, buttons: 0, wheel: 0 };
    this.gun.buttons = 0;
  }

  mouseMove(dx: number, dy: number) {
    this.mouse.dx += dx * this.settings.mouseSensitivity;
    this.mouse.dy += dy * this.settings.mouseSensitivity;
  }

  mouseButton(button: number, down: boolean) {
    const bit = 1 << button;
    this.mouse.buttons = down ? this.mouse.buttons | bit : this.mouse.buttons & ~bit;
    this.gun.buttons = this.mouse.buttons;
  }

  mouseWheel(delta: number) {
    this.mouse.wheel += Math.sign(delta);
  }

  /** Light-gun aim in -1..1 frame coordinates (null when off screen). */
  aim(pos: { x: number; y: number } | null) {
    if (pos) this.gun = { ...this.gun, x: pos.x, y: pos.y, offscreen: false };
    else this.gun.offscreen = true;
  }

  /** Whether any port uses a device that captures the mouse. */
  get wantsPointerLock(): boolean {
    return this.ports.some((p) => deviceBase(p.device) === DEVICE.MOUSE && this.isLocal(p.source));
  }

  get wantsLightgun(): boolean {
    return this.ports.some((p) => deviceBase(p.device) === DEVICE.LIGHTGUN && this.isLocal(p.source));
  }

  /** Whether the local keyboard is wired to a Dreamcast keyboard device. */
  get keyboardIsDevice(): boolean {
    return this.ports.some((p) => deviceBase(p.device) === DEVICE.KEYBOARD && (p.source === 'keyboard' || p.source === 'auto'));
  }

  private isLocal(source: PortSource) {
    return source === 'auto' || source === 'keyboard' || source.startsWith('gamepad-');
  }

  // ───────────────────────── Remote (netplay) ─────────────────────────

  setRemote(id: string, pad: PadState, keys: number[] = []) {
    this.remotes.set(id, { pad, keys: new Set(keys) });
  }

  removeRemote(id: string) {
    this.remotes.delete(id);
  }

  /** The local player's combined pad state (sent to the host when we are a netplay guest). */
  localPad(): PadState {
    this.readGamepads();
    const pad = this.keyboardPad();
    const gp = this.gamepadPad(0);
    if (gp) mergePad(pad, gp);
    return pad;
  }

  localRetroKeys(): number[] {
    return [...this.keysDown].map(retroKeyFromCode).filter(Boolean);
  }

  // ───────────────────────── Per-frame polling ─────────────────────────

  private readGamepads() {
    const list = typeof navigator !== 'undefined' && navigator.getGamepads ? [...navigator.getGamepads()] : [];
    this.gamepads = list.filter((g): g is Gamepad => !!g && g.connected);
    const ids = this.gamepads.map((g) => `${g.index}:${g.id}`).join('|');
    if (ids !== this.knownPads) {
      this.knownPads = ids;
      this.onGamepadsChanged?.(this.gamepads);
    }
  }

  /** Call once per emulated frame, before the core runs. */
  poll() {
    this.readGamepads();
    for (let port = 0; port < 4; port++) this.padSnapshot[port] = this.padFor(this.ports[port]?.source ?? 'none');
    this.mouseFrame = { ...this.mouse };
    this.mouse.dx = 0;
    this.mouse.dy = 0;
    this.mouse.wheel = 0;
  }

  private padFor(source: PortSource): PadState {
    if (source === 'none') return emptyPad();
    if (source === 'auto') {
      const pad = this.keyboardPad();
      const gp = this.gamepadPad(0);
      if (gp) mergePad(pad, gp);
      return pad;
    }
    if (source === 'keyboard') return this.keyboardPad();
    if (source.startsWith('gamepad-')) return this.gamepadPad(Number(source.slice(8))) ?? emptyPad();
    if (source.startsWith('remote-')) return this.remotes.get(source.slice(7))?.pad ?? emptyPad();
    return emptyPad();
  }

  private keyboardPad(): PadState {
    const pad = emptyPad();
    const keys = this.settings.keys;
    for (const c of CONTROLS) {
      const code = keys[c.id];
      if (!code || !this.keysDown.has(code) || this.reservedKeys.has(code)) continue;
      applyControl(pad, c.id, 1);
    }
    return pad;
  }

  private gamepadPad(n: number): PadState | null {
    const gp = this.gamepads[n];
    if (!gp) return null;
    const pad = emptyPad();
    const dz = this.settings.deadzone;
    for (const c of CONTROLS) {
      const input = this.settings.pad[c.id];
      if (!input) continue;
      let value = 0;
      if (input.startsWith('b')) {
        const b = gp.buttons[Number(input.slice(1))];
        value = b ? Math.max(b.value, b.pressed ? 1 : 0) : 0;
      } else if (input.startsWith('a')) {
        const axis = gp.axes[Number(input.slice(1, -1))] ?? 0;
        const dir = input.endsWith('-') ? -1 : 1;
        value = Math.max(0, axis * dir);
        value = value < dz ? 0 : (value - dz) / (1 - dz);
      }
      if (value > 0) applyControl(pad, c.id, value);
    }
    // Home/Guide is reserved for the menu.
    return pad;
  }

  /** True while the gamepad menu chord (Home, or Back+Start) is held on any pad. */
  gamepadMenuPressed(): boolean {
    return this.gamepads.some((g) => g.buttons[16]?.pressed || (g.buttons[8]?.pressed && g.buttons[9]?.pressed));
  }

  // ───────────────────────── Core queries ─────────────────────────

  state(port: number, device: number, index: number, id: number): number {
    const cfg = this.ports[port];
    if (!cfg || cfg.source === 'none') return 0;
    const base = deviceBase(device);
    if (base === DEVICE.JOYPAD) {
      const pad = this.padSnapshot[port];
      return id === JOY.MASK ? pad.buttons : (pad.buttons >> id) & 1;
    }
    if (base === DEVICE.ANALOG) {
      const pad = this.padSnapshot[port];
      if (index === ANALOG_INDEX.BUTTON) {
        if (id === JOY.L2) return pad.triggers[0];
        if (id === JOY.R2) return pad.triggers[1];
        return (pad.buttons >> id) & 1 ? AXIS_MAX : 0;
      }
      return pad.axes[index * 2 + id] ?? 0;
    }
    if (base === DEVICE.KEYBOARD) {
      if (cfg.source.startsWith('remote-')) return this.remotes.get(cfg.source.slice(7))?.keys.has(id) ? 1 : 0;
      for (const code of this.keysDown) if (!this.reservedKeys.has(code) && retroKeyFromCode(code) === id) return 1;
      return 0;
    }
    if (base === DEVICE.MOUSE) {
      const m = this.mouseFrame;
      switch (id) {
        case MOUSE_ID.X:
          return Math.round(m.dx);
        case MOUSE_ID.Y:
          return Math.round(m.dy);
        case MOUSE_ID.LEFT:
          return m.buttons & 1;
        case MOUSE_ID.RIGHT:
          return (m.buttons >> 2) & 1;
        case MOUSE_ID.MIDDLE:
          return (m.buttons >> 1) & 1;
        case MOUSE_ID.WHEELUP:
          return m.wheel < 0 ? 1 : 0;
        case MOUSE_ID.WHEELDOWN:
          return m.wheel > 0 ? 1 : 0;
        default:
          return 0;
      }
    }
    if (base === DEVICE.LIGHTGUN) {
      const g = this.gun;
      const pad = this.padSnapshot[port];
      switch (id) {
        case LIGHTGUN_ID.SCREEN_X:
          return Math.round(g.x * AXIS_MAX);
        case LIGHTGUN_ID.SCREEN_Y:
          return Math.round(g.y * AXIS_MAX);
        case LIGHTGUN_ID.IS_OFFSCREEN:
          return g.offscreen || (g.buttons & 4) ? 1 : 0;
        case LIGHTGUN_ID.TRIGGER:
          return g.buttons & 1 || (g.buttons & 4) ? 1 : 0;
        case LIGHTGUN_ID.RELOAD:
          return (g.buttons >> 2) & 1;
        case LIGHTGUN_ID.AUX_A:
          return (g.buttons >> 1) & 1 || (pad.buttons >> JOY.B) & 1;
        case LIGHTGUN_ID.AUX_B:
          return (pad.buttons >> JOY.A) & 1;
        case LIGHTGUN_ID.START:
          return (pad.buttons >> JOY.START) & 1;
        case LIGHTGUN_ID.DPAD_UP:
          return (pad.buttons >> JOY.UP) & 1;
        case LIGHTGUN_ID.DPAD_DOWN:
          return (pad.buttons >> JOY.DOWN) & 1;
        case LIGHTGUN_ID.DPAD_LEFT:
          return (pad.buttons >> JOY.LEFT) & 1;
        case LIGHTGUN_ID.DPAD_RIGHT:
          return (pad.buttons >> JOY.RIGHT) & 1;
        default:
          return 0;
      }
    }
    return 0;
  }

  // ───────────────────────── Rumble ─────────────────────────

  rumble(port: number, effect: 'strong' | 'weak', strength: number) {
    if (!this.settings.rumble) return;
    const cfg = this.ports[port];
    if (!cfg) return;
    const state = this.rumbleState.get(port) ?? { strong: 0, weak: 0, last: 0 };
    state[effect] = strength;
    this.rumbleState.set(port, state);
    const n = cfg.source === 'auto' ? 0 : cfg.source.startsWith('gamepad-') ? Number(cfg.source.slice(8)) : -1;
    const gp = n >= 0 ? this.gamepads[n] : undefined;
    const actuator = (gp as (Gamepad & { vibrationActuator?: GamepadHapticActuator }) | undefined)?.vibrationActuator;
    if (!actuator?.playEffect) return;
    const now = performance.now();
    if (state.strong === 0 && state.weak === 0) {
      void actuator.reset?.();
      return;
    }
    if (now - state.last < 50) return;
    state.last = now;
    void actuator
      .playEffect('dual-rumble', { duration: 200, strongMagnitude: state.strong, weakMagnitude: state.weak })
      .catch(() => undefined);
  }
}

function applyControl(pad: PadState, id: ControlId, value: number) {
  const c = CONTROLS.find((x) => x.id === id)!;
  if (c.axis) {
    const [stick, axis, dir] = c.axis;
    const i = stick * 2 + axis;
    const v = Math.round(dir * value * AXIS_MAX);
    if (Math.abs(v) > Math.abs(pad.axes[i])) pad.axes[i] = v;
    return;
  }
  if (c.trigger !== undefined) {
    pad.triggers[c.trigger] = Math.max(pad.triggers[c.trigger], Math.round(value * AXIS_MAX));
    if (value > 0.5) pad.buttons |= 1 << c.joy!;
    return;
  }
  if (c.joy !== undefined && value > 0.5) pad.buttons |= 1 << c.joy;
}

function mergePad(into: PadState, from: PadState) {
  into.buttons |= from.buttons;
  for (let i = 0; i < 4; i++) if (Math.abs(from.axes[i]) > Math.abs(into.axes[i])) into.axes[i] = from.axes[i];
  for (let i = 0; i < 2; i++) into.triggers[i] = Math.max(into.triggers[i], from.triggers[i]);
}

export { applyControl, mergePad };
