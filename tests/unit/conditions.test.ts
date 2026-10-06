import { describe, expect, it } from 'vitest';
import { MemoryTracker, TriggerRuntime, evaluateTrigger, parseTrigger } from '../../src/achievements/conditions';

const mem = () => new Uint8Array(0x100);

function runner(memAddr: string, bytes: Uint8Array) {
  const t = new TriggerRuntime(memAddr);
  const tracker = new MemoryTracker(bytes);
  return { t, step: () => (tracker.advance(bytes), t.step(tracker)) };
}

describe('parseTrigger', () => {
  it('parses sizes, flags, hits and alt groups', () => {
    const t = parseTrigger('0xH0010=5_R:0x 0020!=h1F.3._d0xX0030>=100S0xM0040=1S0xS0041=1');
    expect(t.core.conditions).toHaveLength(3);
    expect(t.core.conditions[0]).toMatchObject({ flag: '', left: { type: 'mem', size: '8', address: 0x10 }, op: '=', right: { type: 'const', value: 5 } });
    expect(t.core.conditions[1]).toMatchObject({ flag: 'ResetIf', left: { size: '16', address: 0x20 }, op: '!=', right: { value: 0x1f }, requiredHits: 3 });
    expect(t.core.conditions[2].left).toMatchObject({ type: 'delta', size: '32', address: 0x30 });
    expect(t.alts).toHaveLength(2);
    expect(t.alts[0].conditions[0].left.size).toBe('bit0');
    expect(t.alts[1].conditions[0].left.size).toBe('bit6');
  });

  it('parses float memory, arithmetic modifiers and recall', () => {
    const t = parseTrigger('K:0xH0001*2_A:{recall}_fF0010>f1.5');
    expect(t.core.conditions[0]).toMatchObject({ flag: 'Remember', op: '*', right: { value: 2 } });
    expect(t.core.conditions[1].left.type).toBe('recall');
    expect(t.core.conditions[2].left).toMatchObject({ size: 'float', address: 0x10 });
    expect(t.core.conditions[2].right).toMatchObject({ value: 1.5 });
  });
});

describe('evaluation', () => {
  it('needs the trigger to be false once before it can unlock', () => {
    const b = mem();
    b[0x10] = 5;
    const r = runner('0xH0010=5', b);
    expect(r.step()).toBe(false); // true from the start: stays waiting
    b[0x10] = 0;
    expect(r.step()).toBe(false);
    b[0x10] = 5;
    expect(r.step()).toBe(true);
    expect(r.t.state).toBe('triggered');
  });

  it('counts hits and resets them with ResetIf', () => {
    const b = mem();
    const r = runner('0xH0001=1.3._R:0xH0002=1', b);
    r.step();
    b[1] = 1;
    expect(r.step()).toBe(false);
    expect(r.step()).toBe(false);
    b[2] = 1; // reset
    expect(r.step()).toBe(false);
    b[2] = 0;
    expect(r.step()).toBe(false);
    expect(r.step()).toBe(false);
    expect(r.step()).toBe(true); // three hits after the reset
  });

  it('PauseIf freezes hit counting', () => {
    const b = mem();
    const r = runner('0xH0001=1.2._P:0xH0002=1', b);
    r.step();
    b[1] = 1;
    b[2] = 1;
    expect(r.step()).toBe(false);
    expect(r.step()).toBe(false);
    b[2] = 0;
    expect(r.step()).toBe(false); // first real hit
    expect(r.step()).toBe(true);
  });

  it('AddSource, SubSource and delta values', () => {
    const b = mem();
    b[1] = 10;
    b[2] = 3;
    const t = parseTrigger('A:0xH0001_B:0xH0002_0=7');
    const tr = new MemoryTracker(b);
    tr.advance();
    expect(evaluateTrigger(t, tr).triggered).toBe(true);
    const d = parseTrigger('0xH0003>d0xH0003');
    const tr2 = new MemoryTracker(b);
    tr2.get('8', 3);
    tr2.advance();
    expect(evaluateTrigger(d, tr2).triggered).toBe(false);
    b[3] = 4;
    tr2.advance();
    expect(evaluateTrigger(d, tr2).triggered).toBe(true);
  });

  it('AndNext / OrNext chains', () => {
    const b = mem();
    const and = parseTrigger('N:0xH0001=1_0xH0002=1');
    const or = parseTrigger('O:0xH0001=1_0xH0002=1');
    const tr = new MemoryTracker(b);
    b[1] = 1;
    tr.advance();
    expect(evaluateTrigger(and, tr).triggered).toBe(false);
    expect(evaluateTrigger(or, tr).triggered).toBe(true);
    b[2] = 1;
    tr.advance();
    expect(evaluateTrigger(and, tr).triggered).toBe(true);
  });

  it('AddAddress follows pointers', () => {
    const b = mem();
    b[0x04] = 0x40; // pointer (32-bit LE) to 0x40
    b[0x40 + 0x08] = 9;
    const t = parseTrigger('I:0xX0004_0xH0008=9');
    const tr = new MemoryTracker(b);
    tr.advance();
    expect(evaluateTrigger(t, tr).triggered).toBe(true);
  });

  it('alt groups: core and any alt', () => {
    const b = mem();
    b[1] = 1;
    const t = parseTrigger('0xH0001=1S0xH0002=1S0xH0003=1');
    const tr = new MemoryTracker(b);
    tr.advance();
    expect(evaluateTrigger(t, tr).triggered).toBe(false);
    b[3] = 1;
    tr.advance();
    expect(evaluateTrigger(t, tr).triggered).toBe(true);
  });

  it('reports Measured progress', () => {
    const b = mem();
    b[1] = 3;
    const t = parseTrigger('M:0xH0001>=10');
    const tr = new MemoryTracker(b);
    tr.advance();
    expect(evaluateTrigger(t, tr)).toMatchObject({ triggered: false, measured: { value: 3, target: 10 } });
  });

  it('reads BCD, bit and big-endian sizes', () => {
    const b = mem();
    b[1] = 0x42;
    b[2] = 0b00100000;
    b[3] = 0x12;
    b[4] = 0x34;
    const tr = new MemoryTracker(b);
    tr.advance();
    expect(evaluateTrigger(parseTrigger('b0xH0001=42'), tr).triggered).toBe(true);
    expect(evaluateTrigger(parseTrigger('0xR0002=1'), tr).triggered).toBe(true);
    expect(evaluateTrigger(parseTrigger('0xI0003=4660'), tr).triggered).toBe(true);
    expect(evaluateTrigger(parseTrigger('0xK0002=1'), tr).triggered).toBe(true);
  });
});
