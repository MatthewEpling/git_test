import { describe, expect, it } from 'vitest';
import { FramePacer } from '../../src/emu/pacing';

const FRAME = 1000 / 59.94;

/** Simulates a display at `hz` with optional jitter; returns frames run per refresh. */
function simulate(hz: number, refreshes: number, jitterMs = 0, seed = 1) {
  const pacer = new FramePacer(FRAME);
  let rng = seed;
  const rand = () => ((rng = (rng * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
  const out: number[] = [];
  for (let i = 0; i < refreshes; i++) out.push(pacer.next(1000 / hz + rand() * jitterMs).frames);
  return { pacer, out: out.slice(200) }; // skip warm-up while the refresh rate is learned
}

/** Lengths of the gaps (in refreshes) between emulated frames. */
function cadence(out: number[]) {
  const gaps: number[] = [];
  let since = 0;
  for (const f of out) {
    since++;
    if (f > 0) {
      gaps.push(since);
      since = 0;
    }
  }
  return new Set(gaps.slice(1));
}

describe('frame pacing', () => {
  it.each([
    [60, 1],
    [120, 2],
    [180, 3],
    [240, 4],
  ])('%i Hz locks to one frame every %i refresh(es), evenly, despite jitter', (hz, n) => {
    const { pacer, out } = simulate(hz, 3000, 0.4);
    expect(pacer.vsync).toBe(true);
    expect(pacer.refreshesPerFrame).toBe(n);
    expect(cadence(out)).toEqual(new Set([n]));
    expect(Math.max(...out)).toBe(1);
  });

  it('runs at the console rate on a 144 Hz display (not lockable)', () => {
    const { pacer, out } = simulate(144, 3000);
    expect(pacer.vsync).toBe(false);
    const fps = (out.reduce((a, b) => a + b, 0) / out.length) * 144;
    expect(fps).toBeGreaterThan(59.5);
    expect(fps).toBeLessThan(60.4);
  });

  it('catches up after a hitch, but not without limit', () => {
    const pacer = new FramePacer(FRAME);
    for (let i = 0; i < 300; i++) pacer.next(1000 / 180);
    expect(pacer.next(1000 / 180 * 7)).toEqual({ frames: 2, late: true });
    for (let i = 0; i < 300; i++) pacer.next(1000 / 60);
    expect(pacer.next(200).frames).toBe(3);
  });

  it('stays locked through heavy jitter at 180 Hz', () => {
    const { pacer, out } = simulate(180, 5000, 1.2, 7);
    expect(pacer.refreshesPerFrame).toBe(3);
    expect(cadence(out)).toEqual(new Set([3]));
  });

  it('relearns when the window moves to a display with a different refresh rate', () => {
    const pacer = new FramePacer(FRAME);
    for (let i = 0; i < 400; i++) pacer.next(1000 / 60);
    expect(pacer.refreshesPerFrame).toBe(1);
    for (let i = 0; i < 400; i++) pacer.next(1000 / 180);
    expect(pacer.vsync).toBe(true);
    expect(pacer.refreshesPerFrame).toBe(3);
  });

  it('fast forward runs several frames per refresh', () => {
    const pacer = new FramePacer(FRAME);
    let total = 0;
    for (let i = 0; i < 600; i++) total += pacer.next(1000 / 60, true, 4).frames;
    expect(total / 600).toBeGreaterThan(3.8);
  });
});

describe('frame pacing under load', () => {
  it('keeps the real refresh rate when its own frames stretch the intervals', () => {
    const pacer = new FramePacer(FRAME);
    for (let i = 0; i < 400; i++) pacer.next(1000 / 180, false, 1, 1);
    // Overloaded: each callback takes ~18 ms, so refreshes arrive every ~22 ms.
    for (let i = 0; i < 400; i++) pacer.next(22.2, false, 1, 18);
    expect(1000 / pacer.refreshMs).toBeGreaterThan(170);
    expect(pacer.refreshesPerFrame).toBe(3);
  });
});
