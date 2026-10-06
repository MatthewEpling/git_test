import type { SessionStats } from '../../emu/session';
import { useSettings } from '../../ui/settings-store';

interface Tweak {
  key: string;
  label: string;
  hint: string;
  options: { value: string; label: string }[];
  /** Value used by the speed preset. */
  fast: string;
}

// The Flycast options most likely to reduce per-frame cost in heavy 3D scenes.
const TWEAKS: Tweak[] = [
  {
    key: 'reicast_alpha_sorting',
    label: 'Transparency sorting',
    hint: 'Fast sorting issues far fewer draw calls in scenes full of see-through objects. Rarely visible.',
    options: [
      { value: 'per-triangle (normal)', label: 'Accurate' },
      { value: 'per-strip (fast, least accurate)', label: 'Fast' },
    ],
    fast: 'per-strip (fast, least accurate)',
  },
  {
    key: 'reicast_enable_dsp',
    label: 'Audio effects (DSP)',
    hint: 'Emulates reverb and echo. Turning it off saves CPU; some sounds lose their echo.',
    options: [
      { value: 'enabled', label: 'On' },
      { value: 'disabled', label: 'Off' },
    ],
    fast: 'disabled',
  },
  {
    key: 'reicast_delay_frame_swapping',
    label: 'Delay frame swapping',
    hint: 'Avoids flicker in a few games; Flycast advises turning it off on slower machines.',
    options: [
      { value: 'enabled', label: 'On' },
      { value: 'disabled', label: 'Off' },
    ],
    fast: 'disabled',
  },
  {
    key: 'reicast_volume_modifier_enable',
    label: 'Shadows (modifier volumes)',
    hint: 'Draws shadows such as the car shadow. Off saves GPU passes but removes them.',
    options: [
      { value: 'enabled', label: 'On' },
      { value: 'disabled', label: 'Off' },
    ],
    fast: 'enabled',
  },
  {
    key: 'reicast_internal_resolution',
    label: 'Internal resolution',
    hint: 'Higher is sharper but costs GPU time. 640x480 is the Dreamcast’s own.',
    options: ['640x480', '960x720', '1280x960', '1920x1440'].map((v) => ({ value: v, label: v === '640x480' ? '640x480 (native)' : v })),
    fast: '640x480',
  },
  {
    key: 'reicast_frame_skipping',
    label: 'Frame skipping',
    hint: 'Draws only every 2nd or 3rd frame. Last resort: keeps game speed, but motion is less smooth.',
    options: [
      { value: 'disabled', label: 'Off' },
      { value: '1', label: 'Skip 1' },
      { value: '2', label: 'Skip 2' },
    ],
    fast: 'disabled',
  },
];

const DEFAULTS: Record<string, string> = {
  reicast_alpha_sorting: 'per-triangle (normal)',
  reicast_enable_dsp: 'enabled',
  reicast_delay_frame_swapping: 'enabled',
  reicast_volume_modifier_enable: 'enabled',
  reicast_internal_resolution: '640x480',
  reicast_frame_skipping: 'disabled',
};

export function PerformancePanel({ stats }: { stats: SessionStats }) {
  const [s, update] = useSettings();
  const value = (k: string) => s.coreOptions[k] ?? DEFAULTS[k];
  const set = (patch: Record<string, string>) => update((x) => ({ ...x, coreOptions: { ...x.coreOptions, ...patch }, video: { ...x.video, showFps: true } }));
  const budget = 1000 / 59.94;
  const over = stats.coreMs > budget * 0.95;

  return (
    <div className="stack">
      <div className={`notice ${over ? 'warn' : ''}`}>
        <div style={{ fontWeight: 700 }}>
          {stats.fps.toFixed(0)} fps · {Math.round(stats.speed * 100)}% speed
        </div>
        <div className="small">
          Emulation takes <strong>{stats.coreMs.toFixed(1)} ms</strong> per frame (worst {stats.coreMaxMs.toFixed(1)} ms). Full speed needs under{' '}
          {budget.toFixed(1)} ms. {over ? 'This scene is over budget, so try the settings below.' : 'You have headroom.'}
        </div>
        {stats.soundMs !== null && stats.graphicsMs !== null && (
          <div className="small" style={{ marginTop: 4 }}>
            Split: CPU {Math.max(0, stats.coreMs - stats.soundMs - stats.graphicsMs).toFixed(1)} ms · sound chip {stats.soundMs.toFixed(1)} ms · graphics{' '}
            {stats.graphicsMs.toFixed(1)} ms
          </div>
        )}
      </div>
      <p className="small muted">
        Changes apply live. Change one at a time and watch the emulation time; it updates every second. They're saved for all games.
      </p>
      <div className="row">
        <button type="button" className="btn btn-primary grow" onClick={() => set(Object.fromEntries(TWEAKS.map((t) => [t.key, t.fast])))}>
          Apply speed preset
        </button>
        <button type="button" className="btn" onClick={() => set(DEFAULTS)}>
          Accurate defaults
        </button>
      </div>
      {TWEAKS.map((t) => (
        <div key={t.key} className="setting" style={{ gridTemplateColumns: 'minmax(0,1fr) 150px' }}>
          <div>
            <label className="label" htmlFor={`perf-${t.key}`}>
              {t.label}
            </label>
            <div className="hint">{t.hint}</div>
          </div>
          <select id={`perf-${t.key}`} value={value(t.key)} onChange={(e) => set({ [t.key]: e.target.value })}>
            {t.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}
