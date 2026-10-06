import { useMemo, useState } from 'react';
import type { CoreOption } from '../../emu/core';
import { HIDDEN_OPTIONS, RESTART_OPTIONS } from '../../emu/session';
import { loadOptionDefs } from '../../storage/option-defs';
import { SettingRow, Switch } from '../../ui/controls';
import { useSettings } from '../../ui/settings-store';

const CATEGORY_LABELS: Record<string, string> = {
  system: 'System',
  video: 'Video',
  performance: 'Performance',
  hacks: 'Hacks and enhancements',
  input: 'Input',
  expansions: 'Controller expansions',
  vmu: 'VMU',
};

export function EmulationTab({ liveOptions, inGame }: { liveOptions: CoreOption[] | null; inGame: boolean }) {
  const [s, update] = useSettings();
  const [query, setQuery] = useState('');
  const defs = liveOptions ?? loadOptionDefs()?.options ?? null;
  const e = s.emulation;
  const setEmu = (patch: Partial<typeof e>) => update((x) => ({ ...x, emulation: { ...x.emulation, ...patch } }));

  const groups = useMemo(() => {
    const out = new Map<string, CoreOption[]>();
    for (const o of defs ?? []) {
      if (HIDDEN_OPTIONS.has(o.key)) continue;
      const q = query.trim().toLowerCase();
      if (q && !`${o.label} ${o.info}`.toLowerCase().includes(q)) continue;
      const cat = o.category || 'system';
      out.set(cat, [...(out.get(cat) ?? []), o]);
    }
    return out;
  }, [defs, query]);

  const value = (o: CoreOption) => s.coreOptions[o.key] ?? o.defaultValue;
  const setOpt = (key: string, v: string) => update((x) => ({ ...x, coreOptions: { ...x.coreOptions, [key]: v } }));

  return (
    <div>
      <div className="group-title">Dreamport</div>
      <SettingRow label="Allow HLE BIOS fallback" hint="Boot discs with Flycast's built-in BIOS replacement when you haven't added a BIOS. Less compatible; off keeps a real BIOS required.">
        <Switch label="Allow HLE BIOS fallback" checked={e.allowHleBios} onChange={(b) => setEmu({ allowHleBios: b })} />
      </SettingRow>
      <SettingRow
        label="Emulator core"
        htmlFor="core-build"
        hint={
          <>
            Experimental is a newer build of the same emulator that spends less time on its CPU emulation. Try it if a game runs below full speed, and compare
            the emulation time in the performance stats.{inGame && <span className="badge warn">Takes effect after restarting the game</span>}
          </>
        }
      >
        <select id="core-build" value={e.coreBuild} onChange={(ev) => setEmu({ coreBuild: ev.target.value as typeof e.coreBuild })}>
          <option value="standard">Standard</option>
          <option value="native">Experimental (faster CPU)</option>
        </select>
      </SettingRow>
      <SettingRow label="Fast-forward speed" htmlFor="ff">
        <select id="ff" value={e.fastForwardSpeed} onChange={(ev) => setEmu({ fastForwardSpeed: Number(ev.target.value) })}>
          {[2, 3, 4, 6, 8].map((n) => (
            <option key={n} value={n}>
              {n}×
            </option>
          ))}
        </select>
      </SettingRow>
      <SettingRow label="Pause when the tab is hidden">
        <Switch label="Pause when the tab is hidden" checked={e.pauseInBackground} onChange={(b) => setEmu({ pauseInBackground: b })} />
      </SettingRow>
      <SettingRow label="Save state when exiting" hint="Kept in a separate auto slot, so your numbered slots stay untouched.">
        <Switch label="Save state when exiting" checked={e.autoSaveState} onChange={(b) => setEmu({ autoSaveState: b })} />
      </SettingRow>

      <div className="row between" style={{ marginTop: 18 }}>
        <input type="search" placeholder="Search emulator options…" aria-label="Search emulator options" value={query} onChange={(ev) => setQuery(ev.target.value)} style={{ maxWidth: 320 }} />
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => update((x) => ({ ...x, coreOptions: {} }))} disabled={!Object.keys(s.coreOptions).length}>
          Reset to defaults
        </button>
      </div>
      {!defs && <p className="notice" style={{ marginTop: 12 }}>Start any game once to load the emulator's options here.</p>}
      {[...groups.entries()].map(([cat, opts]) => (
        <section key={cat}>
          <div className="group-title">{CATEGORY_LABELS[cat] ?? cat}</div>
          {opts.map((o) => (
            <SettingRow
              key={o.key}
              label={o.label.replace(/\s*\(Restart Required\)/i, '')}
              htmlFor={o.key}
              hint={
                <>
                  {o.info && <span>{o.info.length > 220 ? `${o.info.slice(0, 220)}…` : o.info} </span>}
                  {(RESTART_OPTIONS.has(o.key) || /restart/i.test(o.label)) && inGame && <span className="badge warn">Takes effect after restarting the game</span>}
                </>
              }
            >
              <select id={o.key} value={value(o)} onChange={(ev) => setOpt(o.key, ev.target.value)}>
                {o.values.map((v) => (
                  <option key={v.value} value={v.value}>
                    {v.label}
                  </option>
                ))}
              </select>
            </SettingRow>
          ))}
        </section>
      ))}
    </div>
  );
}
