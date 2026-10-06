// A libretro frontend for the Flycast (Dreamcast) core compiled to WebAssembly.
//
// The core renders with WebGL2 into its own canvas. This class owns the Emscripten module,
// answers the core's environment requests, and forwards video, audio and input through
// small hooks so the rest of the app never touches raw WASM memory.

import {
  ANALOG_INDEX,
  DEVICE,
  ENV,
  HW_CONTEXT,
  HW_FRAME_BUFFER_VALID,
  JOY,
  LOG_LEVELS,
  MEMORY,
  PIXEL_FORMAT,
} from './libretro';

/* eslint-disable @typescript-eslint/no-explicit-any */
type EmModule = any;

export interface CoreOptionValue {
  value: string;
  label: string;
}

export interface CoreOption {
  key: string;
  label: string;
  info: string;
  category: string;
  values: CoreOptionValue[];
  defaultValue: string;
  visible: boolean;
}

export interface CoreOptionCategory {
  key: string;
  label: string;
  info: string;
}

export interface ControllerType {
  id: number;
  label: string;
}

export interface Geometry {
  baseWidth: number;
  baseHeight: number;
  maxWidth: number;
  maxHeight: number;
  aspect: number;
}

export interface Timing {
  fps: number;
  sampleRate: number;
}

export type InputStateFn = (port: number, device: number, index: number, id: number) => number;

export interface CoreHooks {
  /** Called after each retro_run that produced a frame. */
  onVideo?: (frame: VideoFrame) => void;
  /** Interleaved stereo int16 samples. */
  onAudio?: (samples: Int16Array) => void;
  onInputPoll?: () => void;
  inputState?: InputStateFn;
  onRumble?: (port: number, effect: 'strong' | 'weak', strength: number) => void;
  onMessage?: (text: string, durationMs: number) => void;
  onLog?: (level: (typeof LOG_LEVELS)[number], text: string) => void;
  onGeometry?: (g: Geometry) => void;
  onOptionsChanged?: () => void;
}

export type VideoFrame =
  | { kind: 'hw'; width: number; height: number }
  | { kind: 'sw'; width: number; height: number; rgba: Uint8Array }
  | { kind: 'dupe' };

export interface CoreStartOptions {
  /** URL of the patched Emscripten glue (flycast_libretro.js). */
  coreUrl: string;
  /** Canvas the core renders into through WebGL2. */
  canvas: HTMLCanvasElement;
  hooks: CoreHooks;
  /** Option values to apply before retro_init (keyed by core option key). */
  optionOverrides?: Record<string, string>;
  username?: string;
}

export const SYSTEM_DIR = '/system';
export const SAVE_DIR = '/saves';
export const CONTENT_DIR = '/content';

const decoder = new TextDecoder();

export class FlycastCore {
  private mod!: EmModule;
  private hooks: CoreHooks;
  private readonly canvas: HTMLCanvasElement;
  private strings = new Map<string, number>();
  private callbacks: number[] = [];
  private pixelFormat: number = PIXEL_FORMAT.RGB1555;
  private hwContextReset = 0;
  private hwContextDestroy = 0;
  private usesHwRender = false;
  private variablesDirty = false;
  private updateDisplayCallback = 0;
  private diskControl: Record<string, number> = {};
  private keyboardCallback = 0;
  private lastFrame: VideoFrame = { kind: 'dupe' };
  private framePending = false;
  private optionValues = new Map<string, string>();
  private overrides: Record<string, string>;
  private username: string;

  readonly options = new Map<string, CoreOption>();
  readonly categories = new Map<string, CoreOptionCategory>();
  /** Controller types per port, as declared by SET_CONTROLLER_INFO. */
  controllerTypes: ControllerType[][] = [];
  geometry: Geometry = { baseWidth: 640, baseHeight: 480, maxWidth: 640, maxHeight: 480, aspect: 4 / 3 };
  timing: Timing = { fps: 59.94, sampleRate: 44100 };
  libraryVersion = '';
  validExtensions: string[] = [];
  gameLoaded = false;
  /** Unhandled environment commands, for diagnostics. */
  readonly unhandledEnv = new Set<number>();

  private constructor(opts: CoreStartOptions) {
    this.hooks = opts.hooks;
    this.canvas = opts.canvas;
    this.overrides = opts.optionOverrides ?? {};
    this.username = opts.username ?? 'Player';
  }

  static async create(opts: CoreStartOptions): Promise<FlycastCore> {
    const core = new FlycastCore(opts);
    await core.boot(opts.coreUrl);
    return core;
  }

  setHooks(hooks: Partial<CoreHooks>) {
    this.hooks = { ...this.hooks, ...hooks };
  }

  // ───────────────────────── Boot ─────────────────────────

  private async boot(coreUrl: string) {
    // Import the glue from a blob URL: bundlers leave it alone, and locateFile below
    // still points the core at the real .wasm next to it.
    const res = await fetch(coreUrl);
    if (!res.ok) throw new Error(`Could not load the emulator core (${res.status}).`);
    const blobUrl = URL.createObjectURL(new Blob([await res.text()], { type: 'text/javascript' }));
    let factory: (opts: object) => Promise<EmModule>;
    try {
      factory = (await import(/* @vite-ignore */ blobUrl)).default;
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
    const base = new URL(coreUrl.slice(0, coreUrl.lastIndexOf('/') + 1), location.href).href;
    const log = (level: (typeof LOG_LEVELS)[number]) => (text: string) => this.hooks.onLog?.(level, text);
    this.mod = await factory({
      canvas: this.canvas,
      locateFile: (p: string) => base + p,
      print: log('info'),
      printErr: log('warn'),
    });
    const mod = this.mod;

    // Emscripten's GL layer must have a current WebGL2 context before the core makes
    // any GL call (its context_reset runs during retro_load_game).
    const handle = mod.GL.createContext(this.canvas, {
      majorVersion: 2,
      minorVersion: 0,
      alpha: false,
      depth: true,
      stencil: true,
      antialias: false,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    if (!handle) throw new Error('WebGL2 is not available in this browser.');
    mod.GL.makeContextCurrent(handle);

    for (const dir of [SYSTEM_DIR, `${SYSTEM_DIR}/dc`, SAVE_DIR, `${SAVE_DIR}/dc`, CONTENT_DIR]) {
      try {
        mod.FS.mkdir(dir);
      } catch {
        // already exists
      }
    }

    this.readSystemInfo();

    mod._retro_set_environment(this.fn((cmd: number, data: number) => (this.environment(cmd, data) ? 1 : 0), 'iii'));
    mod._retro_set_video_refresh(this.fn((data: number, w: number, h: number, pitch: number) => this.videoRefresh(data, w, h, pitch), 'viiii'));
    mod._retro_set_audio_sample(this.fn((l: number, r: number) => this.hooks.onAudio?.(new Int16Array([l, r])), 'vii'));
    mod._retro_set_audio_sample_batch(this.fn((ptr: number, frames: number) => this.audioBatch(ptr, frames), 'iii'));
    mod._retro_set_input_poll(this.fn(() => this.hooks.onInputPoll?.(), 'v'));
    mod._retro_set_input_state(
      this.fn((port: number, device: number, index: number, id: number) => {
        const v = this.hooks.inputState?.(port, device, index, id) ?? 0;
        return v | 0;
      }, 'iiiii'),
    );
    mod._retro_init();
  }

  private readSystemInfo() {
    const mod = this.mod;
    // retro_system_info { library_name, library_version, valid_extensions, need_fullpath, block_extract }
    const ptr = mod._malloc(20);
    mod._retro_get_system_info(ptr);
    this.libraryVersion = this.readString(mod.getValue(ptr + 4, 'i32'));
    this.validExtensions = this.readString(mod.getValue(ptr + 8, 'i32'))
      .split('|')
      .filter(Boolean)
      .map((e) => e.toLowerCase());
    mod._free(ptr);
  }

  // ───────────────────────── Helpers ─────────────────────────

  private fn(f: (...args: number[]) => number | void, sig: string): number {
    const ptr = this.mod.addFunction(f, sig);
    this.callbacks.push(ptr);
    return ptr;
  }

  private readString(ptr: number): string {
    if (!ptr) return '';
    const heap: Uint8Array = this.mod.HEAPU8;
    let end = ptr;
    while (heap[end] !== 0) end++;
    return decoder.decode(heap.subarray(ptr, end));
  }

  /** Allocates (and caches) a NUL-terminated string the core may keep a pointer to. */
  private cString(s: string): number {
    const cached = this.strings.get(s);
    if (cached) return cached;
    const bytes = new TextEncoder().encode(s);
    const ptr = this.mod._malloc(bytes.length + 1);
    this.mod.HEAPU8.set(bytes, ptr);
    this.mod.HEAPU8[ptr + bytes.length] = 0;
    this.strings.set(s, ptr);
    return ptr;
  }

  private u32(ptr: number) {
    return this.mod.getValue(ptr, 'i32') >>> 0;
  }

  private callPtr(ptr: number, sig: string, args: number[] = []): number {
    return this.mod.dynCall(sig, ptr, args);
  }

  // ───────────────────────── Environment ─────────────────────────

  private environment(cmd: number, data: number): boolean {
    const mod = this.mod;
    switch (cmd) {
      case ENV.GET_CAN_DUPE:
        mod.setValue(data, 1, 'i8');
        return true;
      case ENV.GET_OVERSCAN:
        mod.setValue(data, 0, 'i8');
        return true;
      case ENV.SET_ROTATION:
      case ENV.SET_PERFORMANCE_LEVEL:
      case ENV.SET_SERIALIZATION_QUIRKS:
      case ENV.SET_SUBSYSTEM_INFO:
      case ENV.SET_MEMORY_MAPS:
      case ENV.SET_SUPPORT_NO_GAME:
      case ENV.SET_INPUT_DESCRIPTORS:
      case ENV.SET_CONTENT_INFO_OVERRIDE:
        return true;
      case ENV.GET_SYSTEM_DIRECTORY:
      case ENV.GET_CORE_ASSETS_DIRECTORY:
        mod.setValue(data, this.cString(SYSTEM_DIR), 'i32');
        return true;
      case ENV.GET_SAVE_DIRECTORY:
        mod.setValue(data, this.cString(SAVE_DIR), 'i32');
        return true;
      case ENV.GET_LIBRETRO_PATH:
        mod.setValue(data, this.cString('/core/flycast_libretro'), 'i32');
        return true;
      case ENV.GET_USERNAME:
        mod.setValue(data, this.cString(this.username), 'i32');
        return true;
      case ENV.GET_LANGUAGE:
        mod.setValue(data, 0, 'i32');
        return true;
      case ENV.SET_PIXEL_FORMAT: {
        const fmt = mod.getValue(data, 'i32');
        if (fmt !== PIXEL_FORMAT.XRGB8888 && fmt !== PIXEL_FORMAT.RGB565 && fmt !== PIXEL_FORMAT.RGB1555) return false;
        this.pixelFormat = fmt;
        return true;
      }
      case ENV.GET_PREFERRED_HW_RENDER:
        mod.setValue(data, HW_CONTEXT.OPENGLES3, 'i32');
        return true;
      case ENV.SET_HW_RENDER:
        return this.setupHwRender(data);
      case ENV.GET_LOG_INTERFACE:
        mod.setValue(data, this.fn((level: number, fmt: number, va: number) => this.log(level, fmt, va), 'viii'), 'i32');
        return true;
      case ENV.GET_INPUT_BITMASKS:
        return true;
      case ENV.GET_INPUT_DEVICE_CAPABILITIES: {
        const caps = (1 << DEVICE.JOYPAD) | (1 << DEVICE.MOUSE) | (1 << DEVICE.KEYBOARD) | (1 << DEVICE.LIGHTGUN) | (1 << DEVICE.ANALOG);
        mod.setValue(data, caps, 'i32');
        mod.setValue(data + 4, 0, 'i32');
        return true;
      }
      case ENV.GET_INPUT_MAX_USERS:
        mod.setValue(data, 4, 'i32');
        return true;
      case ENV.GET_RUMBLE_INTERFACE:
        mod.setValue(
          data,
          this.fn((port: number, effect: number, strength: number) => {
            this.hooks.onRumble?.(port, effect === 0 ? 'strong' : 'weak', (strength & 0xffff) / 0xffff);
            return 1;
          }, 'iiii'),
          'i32',
        );
        return true;
      case ENV.SET_CONTROLLER_INFO:
        this.readControllerInfo(data);
        return true;
      case ENV.SET_GEOMETRY:
        this.readGeometry(data);
        return true;
      case ENV.SET_SYSTEM_AV_INFO:
        this.readAvInfo(data);
        return true;
      case ENV.SET_MESSAGE: {
        const text = this.readString(mod.getValue(data, 'i32'));
        const frames = mod.getValue(data + 4, 'i32');
        this.hooks.onMessage?.(text, (frames / 60) * 1000);
        return true;
      }
      case ENV.GET_MESSAGE_INTERFACE_VERSION:
        mod.setValue(data, 1, 'i32');
        return true;
      case ENV.SET_MESSAGE_EXT: {
        const text = this.readString(mod.getValue(data, 'i32'));
        const duration = mod.getValue(data + 4, 'i32');
        this.hooks.onMessage?.(text, duration);
        return true;
      }
      case ENV.GET_CORE_OPTIONS_VERSION:
        mod.setValue(data, 2, 'i32');
        return true;
      case ENV.SET_VARIABLES:
        this.readVariablesV0(data);
        return true;
      case ENV.SET_CORE_OPTIONS:
        this.readOptionsV1(data);
        return true;
      case ENV.SET_CORE_OPTIONS_INTL:
        this.readOptionsV1(mod.getValue(data, 'i32'));
        return true;
      case ENV.SET_CORE_OPTIONS_V2:
        this.readOptionsV2(data);
        return true;
      case ENV.SET_CORE_OPTIONS_V2_INTL:
        this.readOptionsV2(mod.getValue(data, 'i32'));
        return true;
      case ENV.SET_CORE_OPTIONS_DISPLAY: {
        const key = this.readString(mod.getValue(data, 'i32'));
        const opt = this.options.get(key);
        if (opt) opt.visible = !!mod.HEAPU8[data + 4];
        return true;
      }
      case ENV.SET_CORE_OPTIONS_UPDATE_DISPLAY_CALLBACK:
        this.updateDisplayCallback = data ? mod.getValue(data, 'i32') : 0;
        return true;
      case ENV.GET_VARIABLE: {
        const key = this.readString(mod.getValue(data, 'i32'));
        const value = this.optionValues.get(key);
        if (value === undefined) {
          mod.setValue(data + 4, 0, 'i32');
          return false;
        }
        mod.setValue(data + 4, this.cString(value), 'i32');
        return true;
      }
      case ENV.SET_VARIABLE: {
        if (!data) return true;
        const key = this.readString(mod.getValue(data, 'i32'));
        const value = this.readString(mod.getValue(data + 4, 'i32'));
        if (this.options.has(key)) this.optionValues.set(key, value);
        this.hooks.onOptionsChanged?.();
        return true;
      }
      case ENV.GET_VARIABLE_UPDATE:
        mod.setValue(data, this.variablesDirty ? 1 : 0, 'i8');
        this.variablesDirty = false;
        return true;
      case ENV.SET_KEYBOARD_CALLBACK:
        this.keyboardCallback = mod.getValue(data, 'i32');
        return true;
      case ENV.GET_DISK_CONTROL_INTERFACE_VERSION:
        mod.setValue(data, 1, 'i32');
        return true;
      case ENV.SET_DISK_CONTROL_INTERFACE:
      case ENV.SET_DISK_CONTROL_EXT_INTERFACE: {
        const names = [
          'setEjectState',
          'getEjectState',
          'getImageIndex',
          'setImageIndex',
          'getNumImages',
          'replaceImageIndex',
          'addImageIndex',
          'setInitialImage',
          'getImagePath',
          'getImageLabel',
        ];
        const count = cmd === ENV.SET_DISK_CONTROL_EXT_INTERFACE ? names.length : 7;
        this.diskControl = {};
        for (let i = 0; i < count; i++) this.diskControl[names[i]] = mod.getValue(data + i * 4, 'i32');
        return true;
      }
      case ENV.GET_AUDIO_VIDEO_ENABLE:
        mod.setValue(data, 3, 'i32');
        return true;
      case ENV.GET_FASTFORWARDING:
        mod.setValue(data, 0, 'i8');
        return true;
      case ENV.GET_TARGET_REFRESH_RATE:
        mod.setValue(data, this.timing.fps, 'float');
        return true;
      default:
        this.unhandledEnv.add(cmd);
        return false;
    }
  }

  private setupHwRender(data: number): boolean {
    const mod = this.mod;
    const type = mod.getValue(data, 'i32');
    if (type !== HW_CONTEXT.OPENGLES3 && type !== HW_CONTEXT.OPENGLES2 && type !== HW_CONTEXT.OPENGLES_VERSION && type !== HW_CONTEXT.OPENGL) {
      return false;
    }
    this.hwContextReset = mod.getValue(data + 4, 'i32');
    // Render into the canvas's default framebuffer.
    mod.setValue(data + 8, this.fn(() => 0, 'i'), 'i32');
    mod.setValue(data + 12, this.fn((sym: number) => mod._emscripten_GetProcAddress(sym), 'ii'), 'i32');
    this.hwContextDestroy = mod.getValue(data + 32, 'i32');
    this.usesHwRender = true;
    return true;
  }

  private readGeometry(ptr: number) {
    const mod = this.mod;
    this.geometry = {
      baseWidth: this.u32(ptr),
      baseHeight: this.u32(ptr + 4),
      maxWidth: this.u32(ptr + 8) || this.geometry.maxWidth,
      maxHeight: this.u32(ptr + 12) || this.geometry.maxHeight,
      aspect: mod.getValue(ptr + 16, 'float') || this.geometry.aspect,
    };
    if (!(this.geometry.aspect > 0)) this.geometry.aspect = this.geometry.baseWidth / this.geometry.baseHeight;
    this.resizeCanvas();
    this.hooks.onGeometry?.(this.geometry);
  }

  private readAvInfo(ptr: number) {
    this.readGeometry(ptr);
    const fps = this.mod.getValue(ptr + 24, 'double');
    const rate = this.mod.getValue(ptr + 32, 'double');
    if (fps > 0) this.timing.fps = fps;
    if (rate > 0) this.timing.sampleRate = rate;
  }

  private resizeCanvas() {
    const w = Math.max(this.geometry.maxWidth, this.geometry.baseWidth, 1);
    const h = Math.max(this.geometry.maxHeight, this.geometry.baseHeight, 1);
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
  }

  private readControllerInfo(ptr: number) {
    const ports: ControllerType[][] = [];
    for (let p = 0; ; p++) {
      const types = this.mod.getValue(ptr + p * 8, 'i32');
      const count = this.u32(ptr + p * 8 + 4);
      if (!types) break;
      const list: ControllerType[] = [];
      for (let i = 0; i < count; i++) {
        list.push({ label: this.readString(this.mod.getValue(types + i * 8, 'i32')), id: this.u32(types + i * 8 + 4) });
      }
      ports.push(list);
    }
    this.controllerTypes = ports;
  }

  // ───────────────────────── Core options ─────────────────────────

  private addOption(opt: Omit<CoreOption, 'visible'>) {
    if (!opt.key || opt.values.length === 0) return;
    this.options.set(opt.key, { ...opt, visible: true });
    const override = this.overrides[opt.key];
    const current = override !== undefined && opt.values.some((v) => v.value === override) ? override : opt.defaultValue;
    this.optionValues.set(opt.key, current);
  }

  private readValues(ptr: number): CoreOptionValue[] {
    const values: CoreOptionValue[] = [];
    for (let i = 0; i < 128; i++) {
      const v = this.mod.getValue(ptr + i * 8, 'i32');
      if (!v) break;
      const value = this.readString(v);
      const label = this.readString(this.mod.getValue(ptr + i * 8 + 4, 'i32')) || value;
      values.push({ value, label });
    }
    return values;
  }

  private readVariablesV0(ptr: number) {
    for (let i = 0; ; i++) {
      const key = this.mod.getValue(ptr + i * 8, 'i32');
      if (!key) break;
      const desc = this.readString(this.mod.getValue(ptr + i * 8 + 4, 'i32'));
      const [label, list = ''] = desc.split('; ');
      const values = list.split('|').map((v) => ({ value: v, label: v }));
      this.addOption({ key: this.readString(key), label, info: '', category: '', values, defaultValue: values[0]?.value ?? '' });
    }
  }

  private readOptionsV1(ptr: number) {
    const SIZE = 12 + 128 * 8 + 4;
    for (let i = 0; ; i++) {
      const base = ptr + i * SIZE;
      const key = this.mod.getValue(base, 'i32');
      if (!key) break;
      const values = this.readValues(base + 12);
      const def = this.readString(this.mod.getValue(base + 12 + 128 * 8, 'i32'));
      this.addOption({
        key: this.readString(key),
        label: this.readString(this.mod.getValue(base + 4, 'i32')),
        info: this.readString(this.mod.getValue(base + 8, 'i32')),
        category: '',
        values,
        defaultValue: def || values[0]?.value || '',
      });
    }
  }

  private readOptionsV2(ptr: number) {
    const mod = this.mod;
    const cats = mod.getValue(ptr, 'i32');
    const defs = mod.getValue(ptr + 4, 'i32');
    if (cats) {
      for (let i = 0; ; i++) {
        const key = mod.getValue(cats + i * 12, 'i32');
        if (!key) break;
        const k = this.readString(key);
        this.categories.set(k, {
          key: k,
          label: this.readString(mod.getValue(cats + i * 12 + 4, 'i32')),
          info: this.readString(mod.getValue(cats + i * 12 + 8, 'i32')),
        });
      }
    }
    // key, desc, desc_categorized, info, info_categorized, category_key, values[128], default_value
    const SIZE = 24 + 128 * 8 + 4;
    for (let i = 0; defs; i++) {
      const base = defs + i * SIZE;
      const key = mod.getValue(base, 'i32');
      if (!key) break;
      const values = this.readValues(base + 24);
      const def = this.readString(mod.getValue(base + 24 + 128 * 8, 'i32'));
      const descCat = this.readString(mod.getValue(base + 8, 'i32'));
      this.addOption({
        key: this.readString(key),
        label: descCat || this.readString(mod.getValue(base + 4, 'i32')),
        info: this.readString(mod.getValue(base + 16, 'i32')) || this.readString(mod.getValue(base + 12, 'i32')),
        category: this.readString(mod.getValue(base + 20, 'i32')),
        values,
        defaultValue: def || values[0]?.value || '',
      });
    }
  }

  getOption(key: string): string | undefined {
    return this.optionValues.get(key);
  }

  getOptionValues(): Record<string, string> {
    return Object.fromEntries(this.optionValues);
  }

  /** Changes core options; the core picks them up on its next GET_VARIABLE_UPDATE poll. */
  setOptions(values: Record<string, string>) {
    let changed = false;
    for (const [key, value] of Object.entries(values)) {
      if (this.optionValues.has(key) && this.optionValues.get(key) !== value) {
        this.optionValues.set(key, value);
        changed = true;
      } else if (!this.optionValues.has(key)) {
        this.overrides[key] = value;
      }
    }
    if (changed) {
      this.variablesDirty = true;
      if (this.updateDisplayCallback) this.callPtr(this.updateDisplayCallback, 'i');
    }
  }

  // ───────────────────────── Logging ─────────────────────────

  private log(level: number, fmtPtr: number, va: number) {
    const text = formatPrintf(this.readString(fmtPtr), va, this.mod, (p) => this.readString(p)).replace(/\s+$/, '');
    if (text) this.hooks.onLog?.(LOG_LEVELS[level] ?? 'info', text);
  }

  // ───────────────────────── Video / audio ─────────────────────────

  private videoRefresh(data: number, width: number, height: number, pitch: number) {
    this.framePending = true;
    if (data === HW_FRAME_BUFFER_VALID) {
      this.lastFrame = { kind: 'hw', width, height };
    } else if (data === 0) {
      this.lastFrame = { kind: 'dupe' };
    } else {
      this.lastFrame = { kind: 'sw', width, height, rgba: this.convertSoftwareFrame(data, width, height, pitch) };
    }
  }

  private convertSoftwareFrame(ptr: number, w: number, h: number, pitch: number): Uint8Array {
    const out = new Uint8Array(w * h * 4);
    const heap: Uint8Array = this.mod.HEAPU8;
    for (let y = 0; y < h; y++) {
      const row = ptr + y * pitch;
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4;
        if (this.pixelFormat === PIXEL_FORMAT.XRGB8888) {
          const p = row + x * 4;
          out[o] = heap[p + 2];
          out[o + 1] = heap[p + 1];
          out[o + 2] = heap[p];
        } else {
          const v = heap[row + x * 2] | (heap[row + x * 2 + 1] << 8);
          if (this.pixelFormat === PIXEL_FORMAT.RGB565) {
            out[o] = ((v >> 11) & 31) * 8.226;
            out[o + 1] = ((v >> 5) & 63) * 4.048;
            out[o + 2] = (v & 31) * 8.226;
          } else {
            out[o] = ((v >> 10) & 31) * 8.226;
            out[o + 1] = ((v >> 5) & 31) * 8.226;
            out[o + 2] = (v & 31) * 8.226;
          }
        }
        out[o + 3] = 255;
      }
    }
    return out;
  }

  private audioBatch(ptr: number, frames: number): number {
    if (this.hooks.onAudio && frames > 0) {
      const start = ptr >> 1;
      this.hooks.onAudio(this.mod.HEAP16.slice(start, start + frames * 2));
    }
    return frames;
  }

  // ───────────────────────── Content ─────────────────────────

  /** Writes a file into the emulator's in-memory file system (data is taken over, not copied). */
  writeFile(path: string, data: Uint8Array) {
    const dir = path.slice(0, path.lastIndexOf('/'));
    this.mkdirp(dir);
    this.mod.FS.writeFile(path, data, { canOwn: true });
  }

  readFile(path: string): Uint8Array | null {
    try {
      return this.mod.FS.readFile(path) as Uint8Array;
    } catch {
      return null;
    }
  }

  listFiles(dir: string): string[] {
    const out: string[] = [];
    const walk = (d: string) => {
      let entries: string[] = [];
      try {
        entries = this.mod.FS.readdir(d);
      } catch {
        return;
      }
      for (const name of entries) {
        if (name === '.' || name === '..') continue;
        const p = `${d}/${name}`;
        if (this.mod.FS.isDir(this.mod.FS.stat(p).mode)) walk(p);
        else out.push(p);
      }
    };
    walk(dir);
    return out;
  }

  removeFile(path: string) {
    try {
      this.mod.FS.unlink(path);
    } catch {
      // ignore
    }
  }

  private mkdirp(dir: string) {
    let cur = '';
    for (const part of dir.split('/').filter(Boolean)) {
      cur += `/${part}`;
      try {
        this.mod.FS.mkdir(cur);
      } catch {
        // exists
      }
    }
  }

  /** Loads content already written to the FS (Flycast needs a full path). Pass null to boot the BIOS. */
  loadGame(path: string | null): boolean {
    const mod = this.mod;
    let ok: number;
    if (path === null) {
      ok = mod._retro_load_game(0);
    } else {
      const info = mod._malloc(16);
      mod.setValue(info, this.cString(path), 'i32');
      mod.setValue(info + 4, 0, 'i32');
      mod.setValue(info + 8, 0, 'i32');
      mod.setValue(info + 12, 0, 'i32');
      ok = mod._retro_load_game(info);
      mod._free(info);
    }
    if (!ok) return false;
    const av = mod._malloc(40);
    mod._retro_get_system_av_info(av);
    this.readAvInfo(av);
    mod._free(av);
    if (this.usesHwRender && this.hwContextReset) this.callPtr(this.hwContextReset, 'v');
    this.gameLoaded = true;
    return true;
  }

  setControllerPortDevice(port: number, device: number) {
    this.mod._retro_set_controller_port_device(port, device);
  }

  // ───────────────────────── Running ─────────────────────────

  /** Runs one emulated frame. Returns the frame the core produced (or a dupe). */
  runFrame(): VideoFrame {
    this.framePending = false;
    this.mod._retro_run();
    const frame = this.framePending ? this.lastFrame : ({ kind: 'dupe' } as const);
    this.hooks.onVideo?.(frame);
    return frame;
  }

  reset() {
    this.mod._retro_reset();
  }

  saveState(): Uint8Array | null {
    const size = this.mod._retro_serialize_size();
    if (!size) return null;
    const ptr = this.mod._malloc(size);
    try {
      if (!this.mod._retro_serialize(ptr, size)) return null;
      return this.mod.HEAPU8.slice(ptr, ptr + size);
    } finally {
      this.mod._free(ptr);
    }
  }

  loadState(data: Uint8Array): boolean {
    const ptr = this.mod._malloc(data.length);
    try {
      this.mod.HEAPU8.set(data, ptr);
      return !!this.mod._retro_unserialize(ptr, data.length);
    } finally {
      this.mod._free(ptr);
    }
  }

  /** Live view of a memory region (e.g. the 16 MB system RAM) for achievements. */
  memory(region: number = MEMORY.SYSTEM_RAM): Uint8Array | null {
    const ptr = this.mod._retro_get_memory_data(region);
    const size = this.mod._retro_get_memory_size(region);
    if (!ptr || !size) return null;
    return new Uint8Array(this.mod.HEAPU8.buffer, ptr, size);
  }

  setCheats(codes: string[]) {
    this.mod._retro_cheat_reset();
    codes.forEach((code, i) => this.mod._retro_cheat_set(i, 1, this.cString(code)));
  }

  keyboardEvent(down: boolean, keycode: number, character: number, modifiers: number) {
    if (this.keyboardCallback) this.callPtr(this.keyboardCallback, 'viiii', [down ? 1 : 0, keycode, character, modifiers]);
  }

  get hasKeyboardCallback() {
    return this.keyboardCallback !== 0;
  }

  // ───────────────────────── Disc control ─────────────────────────

  get supportsDiscSwap() {
    return !!this.diskControl.setEjectState && !!this.diskControl.getNumImages;
  }

  discInfo(): { count: number; index: number; ejected: boolean } {
    const dc = this.diskControl;
    if (!this.supportsDiscSwap) return { count: 0, index: 0, ejected: false };
    return {
      count: this.callPtr(dc.getNumImages, 'i'),
      index: this.callPtr(dc.getImageIndex, 'i'),
      ejected: !!this.callPtr(dc.getEjectState, 'i'),
    };
  }

  setEjected(ejected: boolean) {
    if (this.diskControl.setEjectState) this.callPtr(this.diskControl.setEjectState, 'ii', [ejected ? 1 : 0]);
  }

  setDiscIndex(index: number) {
    if (this.diskControl.setImageIndex) this.callPtr(this.diskControl.setImageIndex, 'ii', [index]);
  }

  /** Adds a disc image (already in the FS) to the core's disc list. */
  addDisc(path: string): boolean {
    const dc = this.diskControl;
    if (!dc.addImageIndex || !dc.replaceImageIndex || !dc.getNumImages) return false;
    if (!this.callPtr(dc.addImageIndex, 'i')) return false;
    const index = this.callPtr(dc.getNumImages, 'i') - 1;
    const info = this.mod._malloc(16);
    this.mod.setValue(info, this.cString(path), 'i32');
    this.mod.setValue(info + 4, 0, 'i32');
    this.mod.setValue(info + 8, 0, 'i32');
    this.mod.setValue(info + 12, 0, 'i32');
    const ok = !!this.callPtr(dc.replaceImageIndex, 'iii', [index, info]);
    this.mod._free(info);
    return ok;
  }

  // ───────────────────────── Teardown ─────────────────────────

  get usesHardwareRendering() {
    return this.usesHwRender;
  }

  destroy() {
    try {
      if (this.usesHwRender && this.hwContextDestroy) this.callPtr(this.hwContextDestroy, 'v');
      if (this.gameLoaded) this.mod._retro_unload_game();
      this.mod._retro_deinit();
    } catch {
      // The core may already be in a failed state; nothing more to release safely.
    }
    const gl = this.canvas.getContext('webgl2');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  }
}

/** Minimal printf for the core's log interface (varargs arrive as a pointer on wasm32). */
export function formatPrintf(fmt: string, va: number, mod: EmModule, readString: (p: number) => string): string {
  let ptr = va;
  const next = (bytes: 4 | 8) => {
    ptr = Math.ceil(ptr / bytes) * bytes;
    const at = ptr;
    ptr += bytes;
    return at;
  };
  return fmt.replace(/%([-+ 0#]*)(\d+|\*)?(?:\.(\d+|\*))?(hh|h|ll|l|z|j|t|L)?([diouxXcsfFeEgGp%])/g, (_m, flags: string, width: string, prec: string, len: string, conv: string) => {
    if (conv === '%') return '%';
    if (width === '*') width = String(mod.getValue(next(4), 'i32'));
    if (prec === '*') prec = String(mod.getValue(next(4), 'i32'));
    let s: string;
    switch (conv) {
      case 'd':
      case 'i':
        s = len === 'll' ? String(mod.getValue(next(8), 'i64')) : String(mod.getValue(next(4), 'i32'));
        break;
      case 'u':
      case 'x':
      case 'X':
      case 'o': {
        const radix = conv === 'u' ? 10 : conv === 'o' ? 8 : 16;
        let n: bigint | number;
        if (len === 'll') {
          const at = next(8);
          n = (BigInt(mod.getValue(at + 4, 'i32') >>> 0) << 32n) | BigInt(mod.getValue(at, 'i32') >>> 0);
        } else n = mod.getValue(next(4), 'i32') >>> 0;
        s = n.toString(radix);
        if (conv === 'X') s = s.toUpperCase();
        break;
      }
      case 'c':
        s = String.fromCharCode(mod.getValue(next(4), 'i32'));
        break;
      case 's':
        s = readString(mod.getValue(next(4), 'i32'));
        if (prec) s = s.slice(0, Number(prec));
        break;
      case 'p':
        s = '0x' + (mod.getValue(next(4), 'i32') >>> 0).toString(16);
        break;
      default: {
        const v = mod.getValue(next(8), 'double');
        s = conv === 'e' || conv === 'E' ? v.toExponential(prec ? Number(prec) : 6) : v.toFixed(prec ? Number(prec) : 6);
      }
    }
    if (width) s = s.padStart(Number(width), flags.includes('0') && !flags.includes('-') ? '0' : ' ');
    return s;
  });
}

export { ANALOG_INDEX, DEVICE, JOY };
