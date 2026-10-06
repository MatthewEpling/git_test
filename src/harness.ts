// Developer harness used by the automated tests: boots a homebrew ELF straight into the core.
import { FlycastCore, CONTENT_DIR } from './emu/core';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const logEl = document.getElementById('log')!;
const logs: string[] = [];
const stats = { frames: 0, hwFrames: 0, dupes: 0, audioSamples: 0, polls: 0, lastSize: '' };
let pad = 0;

declare global {
  interface Window {
    harness: {
      boot: (url: string, opts?: Record<string, string>) => Promise<unknown>;
      stats: typeof stats;
      logs: string[];
      setPad: (mask: number) => void;
      core?: FlycastCore;
      run: (frames: number) => void;
    };
  }
}

let raf = 0;
window.harness = {
  stats,
  logs,
  setPad: (m) => (pad = m),
  run: (n) => {
    for (let i = 0; i < n; i++) window.harness.core!.runFrame();
  },
  async boot(url, opts = {}) {
    const core = await FlycastCore.create({
      coreUrl: '/core/flycast_libretro.js',
      canvas,
      optionOverrides: { flycast_hle_bios: 'enabled', ...opts },
      hooks: {
        onLog: (level, text) => {
          logs.push(`[${level}] ${text}`);
          if (logs.length > 400) logs.shift();
        },
        onVideo: (f) => {
          stats.frames++;
          if (f.kind === 'hw') {
            stats.hwFrames++;
            stats.lastSize = `${f.width}x${f.height}`;
          } else if (f.kind === 'dupe') stats.dupes++;
        },
        onAudio: (s) => (stats.audioSamples += s.length / 2),
        onInputPoll: () => stats.polls++,
        inputState: (port, device, _index, id) => (port === 0 && (device & 0xff) === 1 ? (id === 256 ? pad : (pad >> id) & 1) : 0),
      },
    });
    window.harness.core = core;
    const data = new Uint8Array(await (await fetch(url)).arrayBuffer());
    const name = url.split('/').pop()!;
    core.writeFile(`${CONTENT_DIR}/${name}`, data);
    const ok = core.loadGame(`${CONTENT_DIR}/${name}`);
    if (ok) for (let port = 0; port < 4; port++) core.setControllerPortDevice(port, port === 0 ? 1 : 0);
    const loop = () => {
      core.runFrame();
      raf = requestAnimationFrame(loop);
    };
    if (ok) raf = requestAnimationFrame(loop);
    logEl.textContent = `loaded=${ok} version=${core.libraryVersion} ext=${core.validExtensions.join(',')}`;
    return {
      ok,
      version: core.libraryVersion,
      ext: core.validExtensions,
      geometry: core.geometry,
      timing: core.timing,
      hw: core.usesHardwareRendering,
      options: core.options.size,
      categories: [...core.categories.keys()],
      controllerTypes: core.controllerTypes,
      unhandled: [...core.unhandledEnv],
    };
  },
};
void raf;
