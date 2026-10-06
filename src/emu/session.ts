// One running game: owns the core, display, audio and input wiring, the frame loop,
// save syncing and save states.

import { FlycastCore, CONTENT_DIR, SAVE_DIR, SYSTEM_DIR, type VideoFrame } from './core';
import { Presenter, type PresenterSettings } from './presenter';
import { AudioOutput } from './audio';
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
  main: File;
  /** Stable id for save states (library id, or a hash of the file name). */
  gameKey: string;
  title: string;
  bios: { boot: Uint8Array | null; flash: Uint8Array | null };
  useHleBios: boolean;
}

export interface SessionEvents {
  onToast?: (text: string, kind?: 'info' | 'success' | 'error') => void;
  onLog?: (level: string, text: string) => void;
  onStats?: (s: { fps: number; speed: number; audioMs: number }) => void;
  onLoadProgress?: (text: string, fraction: number) => void;
}

export type FrameHook = (core: FlycastCore, frame: number) => void;

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
  private acc = 0;
  private frameMs = 1000 / 59.94;
  private stopped = false;
  private savedMtimes = new Map<string, number>();
  private saveTimer = 0;
  private statsAcc = { frames: 0, since: performance.now() };
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
        ...(extOf(launch.main.name) === 'elf' ? { reicast_emulate_framebuffer: 'enabled' } : {}),
      },
      hooks: {
        onLog: (level, text) => events.onLog?.(level, text),
        onMessage: (text) => events.onToast?.(text),
        onAudio: (s) => session && !session.fastForward && session.audio.push(s),
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
      if (!core.loadGame(`${dir}/${launch.main.name}`)) {
        throw new Error('The emulator could not load this game. Check that the image is complete and in a supported format.');
      }
      session.applyPorts(input.ports);
      session.frameMs = 1000 / core.timing.fps;
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
      this.acc += dt * (this.fastForward ? this.fastForwardSpeed : 1);
      let ran = 0;
      let frame: VideoFrame | null = null;
      const maxFrames = this.fastForward ? this.fastForwardSpeed + 1 : 3;
      while (this.acc >= this.frameMs && ran < maxFrames) {
        frame = this.step() ?? frame;
        this.acc -= this.frameMs;
        ran++;
      }
      if (ran === maxFrames) this.acc = 0; // too slow to keep up: drop the backlog instead of spiralling
      if (frame && frame.kind !== 'dupe') this.presenter.upload(frame, this.coreCanvas);
      this.presenter.resize();
      this.presenter.draw();
      if (ran) for (const h of this.presentHooks) h();
      this.reportStats(ran, now);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private step(): VideoFrame | null {
    this.input.poll();
    const frame = this.core.runFrame();
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

  private reportStats(ran: number, now: number) {
    this.statsAcc.frames += ran;
    const elapsed = now - this.statsAcc.since;
    if (elapsed >= 1000) {
      const fps = (this.statsAcc.frames * 1000) / elapsed;
      this.events.onStats?.({ fps, speed: fps / this.core.timing.fps, audioMs: this.audio.buffered * 1000 });
      this.statsAcc = { frames: 0, since: now };
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
