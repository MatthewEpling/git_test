// App settings, kept in localStorage (small and read synchronously at startup).

import { DEFAULT_PRESENTER, type PresenterSettings } from '../emu/presenter';
import { DEFAULT_HOTKEYS, type HotkeyId } from '../input/bindings';
import { DEFAULT_INPUT, DEFAULT_PORTS, type InputSettings, type PortConfig } from '../input/manager';

export interface AppSettings {
  video: PresenterSettings & { showFps: boolean };
  audio: { volume: number; muted: boolean; latencyMs: number };
  input: InputSettings;
  ports: PortConfig[];
  hotkeys: Record<HotkeyId, string>;
  /** Flycast core options chosen by the user (key → value). */
  coreOptions: Record<string, string>;
  emulation: {
    /** Let games boot with Flycast's built-in HLE BIOS when no BIOS was uploaded. */
    allowHleBios: boolean;
    fastForwardSpeed: number;
    pauseInBackground: boolean;
    autoSaveState: boolean;
  };
  netplay: { displayName: string; signalUrl: string; iceServers: string; videoBitrateKbps: number };
  achievements: { enabled: boolean; notifications: boolean; showUnofficial: boolean };
}

export const DEFAULT_SETTINGS: AppSettings = {
  video: { ...DEFAULT_PRESENTER, showFps: false },
  audio: { volume: 0.8, muted: false, latencyMs: 80 },
  input: DEFAULT_INPUT,
  ports: DEFAULT_PORTS,
  hotkeys: DEFAULT_HOTKEYS,
  coreOptions: {},
  emulation: { allowHleBios: false, fastForwardSpeed: 3, pauseInBackground: true, autoSaveState: true },
  netplay: {
    displayName: '',
    signalUrl: '',
    iceServers: 'stun:stun.l.google.com:19302',
    videoBitrateKbps: 6000,
  },
  achievements: { enabled: true, notifications: true, showUnofficial: false },
};

const KEY = 'dreamport:settings:v1';

function merge<T>(base: T, saved: unknown): T {
  if (!saved || typeof saved !== 'object' || Array.isArray(base)) return (saved as T) ?? base;
  const out = { ...base } as Record<string, unknown>;
  for (const [k, v] of Object.entries(saved as Record<string, unknown>)) {
    const b = (base as Record<string, unknown>)[k];
    out[k] = b && typeof b === 'object' && !Array.isArray(b) ? merge(b, v) : v;
  }
  return out as T;
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return merge(DEFAULT_SETTINGS, JSON.parse(raw));
  } catch {
    // Storage blocked or corrupt: fall back to defaults.
  }
  return structuredClone(DEFAULT_SETTINGS);
}

export function saveSettings(s: AppSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Ignore quota/access errors; settings still apply for this session.
  }
}
