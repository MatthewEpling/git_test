// One running game: owns the core, display, audio and input wiring, the frame loop,
// save syncing and save states.

import { FlycastCore, CONTENT_DIR, SAVE_DIR, SYSTEM_DIR, type VideoFrame } from './core';
import { Presenter, type PresenterSettings } from './presenter';
import { AudioOutput } from './audio';
import { FramePacer } from './pacing';
import { DEVICE, deviceBase } from './libretro';
import { InputManager, type PortConfig } from '../input/manager';
import { loadSaveFiles, storeSaveFile, readState, writeState } from '../storage/saves';
import { extOf } from '../content/files';
import type { AppSettings } from '../storage/settings';

export const CORE_URL = `${import.meta.env.BASE_URL}core/flycast_libretro.js`;

/** Core options the app always controls (the browser build can't support other values). */
export const FORCED_OPTIONS: Record<string, string> = {
  reicast_threaded_rendering: 'disabled',
  reicast_alpha_sorting: 'per-triangle (normal)',
  reicast_emulate_bba: 'disabled',
  reicast_custom_textures: 'disabled',
  reicast_dump_textures: 'disabled',
};

/** Options hidden from the settings screen (managed by the app or meaningless in a browser). */
export const HIDDEN_OPTIONS = new Set([
  'reicast_hle_bios',
  'reicast_threaded_rendering',
  'reicast_oit_abuffer_size',
  'reicast_oit_layers',
  'reicast_emulate_bba',
  'reicast_upnp',
  'reicast_dcnet',
  'reicast_custom_textures',
  'reicast_preload_custom_textures',
  'reicast_dump_textures',
  'reicast_dump_replaced_textures',
  'reicast_network_output',
  'reicast_allow_service_buttons',
  'reicast_force_freeplay',
  'reicast_linked_vmu_storage',
]);

/** Options that only take effect after a restart. */
export const RESTART_OPTIONS = new Set(['reicast_region', 'reicast_language', 'reicast_broadcast', 'reicast_widescreen_cheats', 'reicast_dc_32mb_mod', 'reicast_per_content_vmus']);

export interface LaunchOptions {
  files: File[];
  /** null boots the console with no disc. */
  main: File | null;
  /** Stable id for save states (library id, or a hash of the file name). */
  gameKey: string;
  title: string;
  bios: { boot: Uint8Array | null; flash: Uint8Array | null };
  useHleBios: boolean;
}

export interface SessionEvents {
  onToast?: (text: string, kind?: 'info' | 'success' | 'error') => void;
  onLog?: (level: string, text: string) => void;
  onStats?: (s: SessionStats) => void;
  onLoadProgress?: (text: string, fraction: number) => void;
}

export type FrameHook = (core: FlycastCore, frame: number) => void;

export interface SessionStats {
  fps: number;
  /** Emulation speed relative to the real console (1 = full speed). */
  speed: number;
  audioMs: number;
  /** Average and worst time spent inside the core per emulated frame. */
  coreMs: number;
  coreMaxMs: number;
  /** Time to copy the frame and draw it with the filter. */
  presentMs: number;
  /** Display refreshes where we fell behind (visible stutter). */
  lateFrames: number;
  /** Audio buffer underruns since the game started (heard as crackles). */
  underruns: number;
  /** Underruns during the last second. */
  underrunsPerSec: number;
  /** True when frames are locked to the display's refresh (every Nth refresh). */
  vsync: boolean;
  /** Display refreshes per emulated frame when locked (1 at 60 Hz, 2 at 120 Hz, 3 at 180 Hz). */
  refreshesPerFrame: number;
  refreshHz: number;
}

const SAVE_SYNC_MS = 4000;

export class EmulatorSession {
  readonly core: FlycastCore;
  readonly presenter: Presenter;
  readonly audio = new AudioOutput();
  readonly input: InputManager;
  readonly coreCanvas: HTMLCanvasElement;
  readonly gameKey: string;
  readonly title: string;
  private events: SessionEvents;
  private raf = 0;
  private last = 0;
  private frameMs = 1000 / 59.94;
  private stopped = false;
  private savedMtimes = new Map<string, number>();
  private saveTimer = 0;
  private statsAcc = { frames: 0, since: performance.now(), coreMs: 0, coreMax: 0, steps: 0, presentMs: 0, presents: 0, late: 0 };
  /** Audio produced during the current frame; flushed to the worklet once per frame. */
  readonly pendingAudio: Int16Array[] = [];
  private pacer = new FramePacer(1000 / 59.94);
  private lastUnderruns = 0;
  paused = false;
  fastForward = false;
  fastForwardSpeed = 3;
  slot = 1;
  frameCount = 0;
  readonly frameHooks = new Set<FrameHook>();
  /** Hooks run after each displayed frame (netplay uses this to stream). */
  readonly presentHooks = new Set<() => void>();

  private constructor(core: FlycastCore, presenter: Presenter, input: InputManager, coreCanvas: HTMLCanvasElement, launch: LaunchOptions, events: SessionEvents) {
    this.core = core;
    this.presenter = presenter;
    this.input = input;
    this.coreCanvas = coreCanvas;
    this.gameKey = launch.gameKey;
    this.title = launch.title;
    this.events = events;
  }

  static async start(display: HTMLCanvasElement, settings: AppSettings, launch: LaunchOptions, events: SessionEvents = {}): Promise<EmulatorSession> {
    const progress = events.onLoadProgress ?? (() => undefined);
    const coreCanvas = document.createElement('canvas');
    coreCanvas.width = 640;
    coreCanvas.height = 480;
    const input = new InputManager();
    input.settings = settings.input;
    input.ports = settings.ports.map((p) => ({ ...p }));

    progress('Starting the emulator core…', 0.05);
    let session: EmulatorSession | null = null;
    const core = await FlycastCore.create({
      coreUrl: CORE_URL,
      canvas: coreCanvas,
      username: settings.netplay.displayName || 'Player',
      optionOverrides: {
        ...settings.coreOptions,
        ...FORCED_OPTIONS,
        reicast_hle_bios: launch.useHleBios ? 'enabled' : 'disabled',
        // Homebrew that writes pixels straight to VRAM needs the framebuffer path.
        ...(launch.main && extOf(launch.main.name) === 'elf' ? { reicast_emulate_framebuffer: 'enabled' } : {}),
      },
      hooks: {
        onLog: (level, text) => events.onLog?.(level, text),
        onMessage: (text) => events.onToast?.(text),
        onAudio: (s) => session && !session.fastForward && session.pendingAudio.push(s),
        onInputPoll: () => undefined,
        inputState: (port, device, index, id) => input.state(port, device, index, id),
        onRumble: (port, effect, strength) => input.rumble(port, effect, strength),
        onGeometry: (g) => {
          if (session) session.presenter.coreAspect = g.aspect;
        },
      },
    });
    const presenter = new Presenter(display);
    presenter.settings = settings.video;
    presenter.coreAspect = core.geometry.aspect;
    session = new EmulatorSession(core, presenter, input, coreCanvas, launch, events);

    try {
      progress('Loading BIOS and saves…', 0.1);
      if (launch.bios.boot) core.writeFile(`${SYSTEM_DIR}/dc/dc_boot.bin`, launch.bios.boot.slice());
      if (launch.bios.flash) core.writeFile(`${SYSTEM_DIR}/dc/dc_flash.bin`, launch.bios.flash.slice());
      for (const save of await loadSaveFiles()) {
        core.writeFile(save.path, save.data.slice());
      }

      const total = launch.files.reduce((n, f) => n + f.size, 0);
      let done = 0;
      const dir = `${CONTENT_DIR}/${launch.gameKey}`;
      for (const f of launch.files) {
        progress(`Reading ${f.name}…`, 0.15 + 0.75 * (total ? done / total : 0));
        core.writeFile(`${dir}/${f.name}`, new Uint8Array(await f.arrayBuffer()));
        done += f.size;
      }

      progress('Booting…', 0.95);
      if (!core.loadGame(launch.main ? `${dir}/${launch.main.name}` : null)) {
        throw new Error('The emulator could not load this game. Check that the image is complete and in a supported format.');
      }
      session.applyPorts(input.ports);
      session.frameMs = 1000 / core.timing.fps;
      session.pacer.frameMs = session.frameMs;
      session.snapshotSaveMtimes();

      await session.audio.init(core.timing.sampleRate);
      session.applyAudio(settings.audio);
      session.fastForwardSpeed = settings.emulation.fastForwardSpeed;
      session.presenter.resize();
      session.saveTimer = window.setInterval(() => void session!.syncSaves(), SAVE_SYNC_MS);
      session.startLoop();
      progress('Running', 1);
      return session;
    } catch (e) {
      session.destroyNow();
      throw e;
    }
  }

  // ───────────────────────── Loop ─────────────────────────

  private startLoop() {
    this.last = performance.now();
    const tick = (now: number) => {
      if (this.stopped) return;
      this.raf = requestAnimationFrame(tick);
      const dt = Math.min(now - this.last, 250);
      this.last = now;
      if (this.paused) {
        this.presenter.resize();
        if (this.presenter.needsRedraw()) this.presenter.draw();
        return;
      }
      const pace = this.pacer.next(dt, this.fastForward, this.fastForwardSpeed);
      const toRun = pace.frames;
      if (pace.late) this.statsAcc.late++;

      let frame: VideoFrame | null = null;
      for (let i = 0; i < toRun; i++) frame = this.step() ?? frame;
      const t0 = performance.now();
      if (frame) this.presenter.upload(frame, this.coreCanvas);
      this.presenter.resize();
      // On refreshes without a new frame (e.g. 2 of every 3 at 180 Hz) the picture is unchanged.
      if (frame || this.presenter.needsRedraw()) this.presenter.draw();
      this.statsAcc.presentMs += performance.now() - t0;
      this.statsAcc.presents++;
      if (toRun) for (const h of this.presentHooks) h();
      this.reportStats(toRun, now);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private step(): VideoFrame | null {
    this.input.poll();
    const t0 = performance.now();
    const frame = this.core.runFrame();
    const ms = performance.now() - t0;
    this.statsAcc.coreMs += ms;
    this.statsAcc.coreMax = Math.max(this.statsAcc.coreMax, ms);
    this.statsAcc.steps++;
    this.flushAudio();
    this.frameCount++;
    for (const hook of this.frameHooks) {
      try {
        hook(this.core, this.frameCount);
      } catch (e) {
        this.events.onLog?.('error', `frame hook: ${(e as Error).message}`);
      }
    }
    return frame.kind === 'dupe' ? null : frame;
  }

  /** Sends this frame's audio to the worklet in one message. */
  private flushAudio() {
    const chunks = this.pendingAudio;
    if (!chunks.length) return;
    if (chunks.length === 1) this.audio.push(chunks[0]);
    else {
      const out = new Int16Array(chunks.reduce((n, c) => n + c.length, 0));
      let o = 0;
      for (const c of chunks) {
        out.set(c, o);
        o += c.length;
      }
      this.audio.push(out);
    }
    chunks.length = 0;
  }

  private reportStats(ran: number, now: number) {
    const a = this.statsAcc;
    a.frames += ran;
    const elapsed = now - a.since;
    if (elapsed >= 1000) {
      const fps = (a.frames * 1000) / elapsed;
      this.events.onStats?.({
        fps,
        speed: fps / this.core.timing.fps,
        audioMs: this.audio.buffered * 1000,
        coreMs: a.steps ? a.coreMs / a.steps : 0,
        coreMaxMs: a.coreMax,
        presentMs: a.presents ? a.presentMs / a.presents : 0,
        lateFrames: a.late,
        underruns: this.audio.underruns,
        underrunsPerSec: this.audio.underruns - this.lastUnderruns,
        vsync: this.pacer.vsync,
        refreshesPerFrame: this.pacer.refreshesPerFrame,
        refreshHz: this.pacer.refreshMs ? 1000 / this.pacer.refreshMs : 0,
      });
      this.statsAcc = { frames: 0, since: now, coreMs: 0, coreMax: 0, steps: 0, presentMs: 0, presents: 0, late: 0 };
      this.lastUnderruns = this.audio.underruns;
    }
  }

  /** Runs exactly one frame while paused. */
  frameAdvance() {
    const f = this.step();
    if (f) this.presenter.upload(f, this.coreCanvas);
    this.presenter.draw();
  }

  setPaused(p: boolean) {
    this.paused = p;
    if (p) this.audio.clear();
    this.input.releaseAll();
    if (p) void this.syncSaves();
  }

  setFastForward(on: boolean) {
    if (this.fastForward === on) return;
    this.fastForward = on;
    if (!on) this.audio.clear();
  }

  // ───────────────────────── Settings ─────────────────────────

  applyVideo(v: PresenterSettings) {
    this.presenter.settings = v;
  }

  applyAudio(a: AppSettings['audio']) {
    this.audio.setVolume(a.volume);
    this.audio.setMuted(a.muted);
    this.audio.setLatency(a.latencyMs / 1000);
  }

  applyCoreOptions(values: Record<string, string>) {
    this.core.setOptions({ ...values, ...FORCED_OPTIONS });
  }

  applyPorts(ports: PortConfig[]) {
    this.input.ports = ports.map((p) => ({ ...p }));
    ports.forEach((p, i) => this.core.setControllerPortDevice(i, p.source === 'none' ? DEVICE.NONE : p.device));
  }

  get usesPointerLock() {
    return this.input.wantsPointerLock;
  }

  get keyboardIsDevice() {
    return this.input.keyboardIsDevice;
  }

  portDeviceBase(port: number) {
    return deviceBase(this.input.ports[port]?.device ?? 0);
  }

  // ───────────────────────── Saves ─────────────────────────

  private saveFilePaths(): string[] {
    const sys = this.core.listFiles(`${SYSTEM_DIR}/dc`).filter((p) => !/dc_(boot|flash)\.bin$/i.test(p));
    return [...this.core.listFiles(SAVE_DIR), ...sys];
  }

  private snapshotSaveMtimes() {
    for (const p of this.saveFilePaths()) this.savedMtimes.set(p, this.mtime(p));
  }

  private mtime(path: string): number {
    const data = this.core.readFile(path);
    // MEMFS timestamps are coarse; combine with a cheap checksum so in-place writes count.
    let h = data?.length ?? 0;
    if (data) for (let i = 0; i < data.length; i += 61) h = (h * 31 + data[i]) | 0;
    return h;
  }

  /** Writes any changed VMU/flash files to IndexedDB. */
  async syncSaves(): Promise<number> {
    let n = 0;
    for (const p of this.saveFilePaths()) {
      const m = this.mtime(p);
      if (this.savedMtimes.get(p) === m) continue;
      const data = this.core.readFile(p);
      if (!data) continue;
      await storeSaveFile(p, data.slice());
      this.savedMtimes.set(p, m);
      n++;
    }
    return n;
  }

  async saveState(slot = this.slot) {
    const raw = this.core.saveState();
    if (!raw) throw new Error('This game cannot be saved right now.');
    return writeState(this.gameKey, slot, raw, this.presenter.snapshot(320));
  }

  async loadState(slot = this.slot): Promise<boolean> {
    const data = await readState(this.gameKey, slot);
    if (!data) return false;
    const ok = this.core.loadState(data);
    this.audio.clear();
    return ok;
  }

  reset() {
    this.core.reset();
    this.audio.clear();
  }

  screenshot(): string {
    this.presenter.draw();
    return this.presenter.snapshot();
  }

  // ───────────────────────── Shutdown ─────────────────────────

  async stop() {
    if (this.stopped) return;
    await this.syncSaves().catch(() => undefined);
    this.destroyNow();
  }

  private destroyNow() {
    this.stopped = true;
    cancelAnimationFrame(this.raf);
    clearInterval(this.saveTimer);
    this.frameHooks.clear();
    this.presentHooks.clear();
    void this.audio.close();
    this.core.destroy();
    this.presenter.destroy();
  }
}
