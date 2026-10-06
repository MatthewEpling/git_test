import { describe, expect, it } from 'vitest';
import { InputManager } from '../../src/input/manager';
import { DEVICE, JOY, ANALOG_INDEX } from '../../src/emu/libretro';

describe('input manager', () => {
  it('maps keyboard bindings to RetroPad buttons, sticks and triggers', () => {
    const m = new InputManager();
    m.keyDown('KeyK'); // DC A = RetroPad B
    m.keyDown('KeyA'); // stick left
    m.keyDown('KeyE'); // R trigger
    m.poll();
    const mask = m.state(0, DEVICE.JOYPAD, 0, JOY.MASK);
    expect(mask & (1 << JOY.B)).toBeTruthy();
    expect(m.state(0, DEVICE.JOYPAD, 0, JOY.B)).toBe(1);
    expect(m.state(0, DEVICE.ANALOG, ANALOG_INDEX.LEFT, 0)).toBe(-32767);
    expect(m.state(0, DEVICE.ANALOG, ANALOG_INDEX.BUTTON, JOY.R2)).toBe(32767);
    expect(m.state(1, DEVICE.JOYPAD, 0, JOY.MASK)).toBe(0); // port 2 has no gamepad
  });

  it('ignores reserved hotkeys and feeds remote players', () => {
    const m = new InputManager();
    m.reservedKeys.add('Enter');
    m.keyDown('Enter');
    m.ports[1] = { device: DEVICE.JOYPAD, source: 'remote-p1' };
    m.setRemote('p1', { buttons: 1 << JOY.START, axes: [0, 0, 0, 0], triggers: [0, 0] });
    m.poll();
    expect(m.state(0, DEVICE.JOYPAD, 0, JOY.START)).toBe(0);
    expect(m.state(1, DEVICE.JOYPAD, 0, JOY.START)).toBe(1);
  });

  it('reports Dreamcast keyboard keys', () => {
    const m = new InputManager();
    m.ports[0] = { device: DEVICE.KEYBOARD, source: 'keyboard' };
    m.keyDown('KeyQ');
    m.poll();
    expect(m.state(0, DEVICE.KEYBOARD, 0, 113)).toBe(1);
    expect(m.keyboardIsDevice).toBe(true);
  });
});
