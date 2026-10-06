// Decides how many emulated frames to run on each display refresh.
//
// When the display refreshes at (almost) a whole multiple of the console's 59.94 Hz
// (60, 120, 180, 240 Hz…), run one frame every N refreshes: perfectly even motion,
// with the audio resampler absorbing the tiny rate difference. Otherwise (e.g. 144 Hz)
// and in fast forward, fall back to a time accumulator.

export interface PaceResult {
  frames: number;
  /** We fell behind on this refresh (ran more than one frame to catch up, or dropped time). */
  late: boolean;
}

export class FramePacer {
  /** Smoothed time between display refreshes, in ms. */
  refreshMs = 0;
  vsync = false;
  refreshesPerFrame = 0;
  private ticks = 0;
  private acc = 0;
  private outliers = 0;
  private lockVotes = 0;
  private unlockVotes = 0;
  private locked = false;

  constructor(public frameMs: number) {}

  /** Learns the refresh interval from normal-looking intervals only, so one slow frame can't skew it. */
  private learn(dt: number) {
    if (dt <= 2 || dt >= 60) return;
    if (!this.refreshMs) {
      this.refreshMs = dt;
      return;
    }
    if (Math.abs(dt - this.refreshMs) / this.refreshMs < 0.25) {
      this.refreshMs = this.refreshMs * 0.99 + dt * 0.01;
      this.outliers = 0;
    } else if (++this.outliers > 60) {
      // Consistently different: the display really changed (e.g. moved to another monitor).
      this.refreshMs = dt;
      this.outliers = 0;
      this.locked = false;
      this.lockVotes = 0;
    }
  }

  /**
   * @param dt time since the previous refresh callback
   * @param busyMs how long the previous callback took; intervals it stretched are not
   *               used to learn the refresh rate (they measure us, not the display)
   */
  next(dt: number, fastForward = false, fastForwardSpeed = 1, busyMs = 0): PaceResult {
    dt = Math.min(dt, 250);
    if (busyMs < dt * 0.5) this.learn(dt);

    const ratio = this.refreshMs > 0 ? this.frameMs / this.refreshMs : 0;
    const n = Math.max(1, Math.round(ratio));
    const error = ratio > 0.5 ? Math.abs(ratio - n) / ratio : 1;
    // Hysteresis: lock after the rate has looked right for a while; unlock only when clearly off.
    if (!this.locked) {
      this.lockVotes = error < 0.015 ? this.lockVotes + 1 : 0;
      if (this.lockVotes >= 30) this.locked = true;
    } else {
      // Unlock only after the rate has looked wrong for about a second.
      this.unlockVotes = error > 0.04 ? this.unlockVotes + 1 : 0;
      if (this.unlockVotes >= 60) {
        this.locked = false;
        this.lockVotes = 0;
        this.unlockVotes = 0;
      }
    }
    this.vsync = !fastForward && this.locked;
    this.refreshesPerFrame = this.vsync ? n : 0;

    if (this.vsync) {
      this.acc = 0;
      // Count elapsed refreshes (more than one after a hitch); a frame per n of them.
      this.ticks += Math.max(1, Math.round(dt / this.refreshMs));
      let frames = Math.floor(this.ticks / n);
      this.ticks -= frames * n;
      const late = frames > 1;
      if (frames > 3) frames = 3; // don't spiral after a long stall
      return { frames, late };
    }

    this.ticks = 0;
    this.acc += dt * (fastForward ? fastForwardSpeed : 1);
    const max = fastForward ? fastForwardSpeed + 1 : 3;
    const frames = Math.min(max, Math.floor(this.acc / this.frameMs));
    this.acc -= frames * this.frameMs;
    let late = false;
    if (frames === max && this.acc > this.frameMs) {
      this.acc = 0; // too slow to keep up: drop the backlog instead of spiralling
      late = true;
    }
    return { frames, late };
  }
}
