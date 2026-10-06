import { SettingRow, Slider, Switch } from '../../ui/controls';
import { useSettings } from '../../ui/settings-store';

export function AudioTab() {
  const [s, update] = useSettings();
  const a = s.audio;
  const set = (patch: Partial<typeof a>) => update((x) => ({ ...x, audio: { ...x.audio, ...patch } }));
  return (
    <div>
      <SettingRow label="Volume" htmlFor="vol">
        <Slider id="vol" label="Volume" min={0} max={1} step={0.05} value={a.volume} format={(n) => `${Math.round(n * 100)}%`} onChange={(n) => set({ volume: n })} />
      </SettingRow>
      <SettingRow label="Mute">
        <Switch label="Mute" checked={a.muted} onChange={(b) => set({ muted: b })} />
      </SettingRow>
      <SettingRow label="Audio latency" hint="Lower is more responsive; raise it if you hear crackling." htmlFor="lat">
        <Slider id="lat" label="Audio latency" min={30} max={200} step={10} value={a.latencyMs} format={(n) => `${n} ms`} onChange={(n) => set({ latencyMs: n })} />
      </SettingRow>
    </div>
  );
}
