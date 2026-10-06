import { SHADERS, shaderById } from '../../emu/shaders';
import type { AspectMode } from '../../emu/presenter';
import { SettingRow, Slider, Switch } from '../../ui/controls';
import { useSettings } from '../../ui/settings-store';

export function VideoTab() {
  const [s, update] = useSettings();
  const v = s.video;
  const set = (patch: Partial<typeof v>) => update((x) => ({ ...x, video: { ...x.video, ...patch } }));
  const shader = shaderById(v.shader);
  return (
    <div>
      <div className="group-title">Filter</div>
      <div className="stack" style={{ gap: 8 }} role="radiogroup" aria-label="Display filter">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 8 }}>
          {SHADERS.map((sh) => (
            <button
              key={sh.id}
              type="button"
              role="radio"
              aria-checked={v.shader === sh.id}
              className="slot"
              style={{ borderColor: v.shader === sh.id ? 'var(--accent)' : undefined, padding: 10 }}
              onClick={() => set({ shader: sh.id })}
            >
              <strong>{sh.label}</strong>
              <span className="tiny muted">{sh.description}</span>
            </button>
          ))}
        </div>
      </div>
      {shader.params.map((p) => {
        const key = `${shader.id}.${p.id}`;
        return (
          <SettingRow key={key} label={p.label} htmlFor={key}>
            <Slider
              id={key}
              label={p.label}
              min={p.min}
              max={p.max}
              step={p.step}
              value={v.params[key] ?? p.default}
              format={(n) => n.toFixed(2)}
              onChange={(n) => set({ params: { ...v.params, [key]: n } })}
            />
          </SettingRow>
        );
      })}

      <div className="group-title">Picture</div>
      <SettingRow label="Aspect ratio" hint="Auto follows the game (16:9 when the widescreen hack is on)." htmlFor="aspect">
        <select id="aspect" value={v.aspect} onChange={(e) => set({ aspect: e.target.value as AspectMode })}>
          <option value="auto">Auto</option>
          <option value="4:3">4:3</option>
          <option value="16:9">16:9</option>
          <option value="stretch">Stretch to window</option>
        </select>
      </SettingRow>
      <SettingRow label="Integer scaling" hint="Scale by whole numbers only, for perfectly even pixels.">
        <Switch label="Integer scaling" checked={v.integerScale} onChange={(b) => set({ integerScale: b })} />
      </SettingRow>
      <SettingRow label="Brightness" htmlFor="br">
        <Slider id="br" label="Brightness" min={0.5} max={1.5} step={0.05} value={v.brightness} format={(n) => `${Math.round(n * 100)}%`} onChange={(n) => set({ brightness: n })} />
      </SettingRow>
      <SettingRow label="Contrast" htmlFor="ct">
        <Slider id="ct" label="Contrast" min={0.5} max={1.5} step={0.05} value={v.contrast} format={(n) => `${Math.round(n * 100)}%`} onChange={(n) => set({ contrast: n })} />
      </SettingRow>
      <SettingRow label="Saturation" htmlFor="sat">
        <Slider id="sat" label="Saturation" min={0} max={2} step={0.05} value={v.saturation} format={(n) => `${Math.round(n * 100)}%`} onChange={(n) => set({ saturation: n })} />
      </SettingRow>
      <SettingRow label="Gamma" htmlFor="gm">
        <Slider id="gm" label="Gamma" min={0.6} max={1.6} step={0.05} value={v.gamma} format={(n) => n.toFixed(2)} onChange={(n) => set({ gamma: n })} />
      </SettingRow>
      <SettingRow label="Show performance stats" hint="Frame rate, emulation and display time, late frames and audio dropouts. Useful when a game stutters.">
        <Switch label="Show performance stats" checked={v.showFps} onChange={(b) => set({ showFps: b })} />
      </SettingRow>
      <p className="small faint" style={{ marginTop: 12 }}>
        Internal resolution, widescreen and other rendering options are under Emulation → Video.
      </p>
    </div>
  );
}
