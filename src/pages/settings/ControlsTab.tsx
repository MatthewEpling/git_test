import { useEffect, useState } from 'react';
import { CONTROLS, DEFAULT_HOTKEYS, DEFAULT_KEYS, DEFAULT_PAD, HOTKEYS, padInputLabel, type ControlId, type HotkeyId } from '../../input/bindings';
import { keyLabel } from '../../input/keys';
import { DEVICE, deviceBase } from '../../emu/libretro';
import type { PortConfig, PortSource } from '../../input/manager';
import type { ControllerType } from '../../emu/core';
import { loadOptionDefs } from '../../storage/option-defs';
import { SettingRow, Slider, Switch } from '../../ui/controls';
import { useSettings } from '../../ui/settings-store';

const FALLBACK_TYPES: ControllerType[] = [
  { id: DEVICE.JOYPAD, label: 'Controller' },
  { id: 1025, label: 'Arcade Stick' },
  { id: 513, label: 'Twin Stick' },
  { id: DEVICE.KEYBOARD, label: 'Keyboard' },
  { id: DEVICE.MOUSE, label: 'Mouse' },
  { id: DEVICE.LIGHTGUN, label: 'Light Gun' },
];

/** Dreamcast devices that make sense in a browser (others need special hardware). */
const SUPPORTED = new Set([DEVICE.JOYPAD, 1025, 513, 769, DEVICE.KEYBOARD, DEVICE.MOUSE, DEVICE.LIGHTGUN, 2561]);

type Listening = { kind: 'key' | 'pad'; id: ControlId } | { kind: 'hotkey'; id: HotkeyId } | null;

export function ControlsTab({ liveTypes }: { liveTypes: ControllerType[] | null }) {
  const [s, update] = useSettings();
  const [listening, setListening] = useState<Listening>(null);
  const pads = useGamepads();
  const types = (liveTypes ?? loadOptionDefs()?.controllerTypes ?? FALLBACK_TYPES).filter((t) => SUPPORTED.has(t.id));

  const setPort = (i: number, patch: Partial<PortConfig>) =>
    update((x) => ({ ...x, ports: x.ports.map((p, n) => (n === i ? { ...p, ...patch } : p)) }));
  const setInput = (patch: Partial<typeof s.input>) => update((x) => ({ ...x, input: { ...x.input, ...patch } }));

  // Capture the next key or gamepad input for rebinding.
  useEffect(() => {
    if (!listening) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Escape' && listening.kind !== 'hotkey') return setListening(null);
      const code = e.code === 'Backspace' || e.code === 'Delete' ? '' : e.code;
      if (listening.kind === 'key') setInput({ keys: { ...s.input.keys, [listening.id]: code || undefined } });
      else if (listening.kind === 'hotkey') update((x) => ({ ...x, hotkeys: { ...x.hotkeys, [listening.id]: code } }));
      else if (code === '') setInput({ pad: { ...s.input.pad, [listening.id]: undefined } });
      setListening(null);
    };
    let raf = 0;
    const baseline = snapshotPads();
    const poll = () => {
      if (listening.kind === 'pad') {
        const hit = detectPadInput(baseline);
        if (hit) {
          setInput({ pad: { ...s.input.pad, [listening.id]: hit } });
          setListening(null);
          return;
        }
      }
      raf = requestAnimationFrame(poll);
    };
    raf = requestAnimationFrame(poll);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      cancelAnimationFrame(raf);
    };
  }, [listening]);

  const sourceOptions = (i: number): { value: PortSource; label: string }[] => [
    ...(i === 0 ? [{ value: 'auto' as PortSource, label: 'Keyboard + 1st controller' }] : []),
    { value: 'keyboard', label: 'Keyboard' },
    ...[0, 1, 2, 3].map((n) => ({ value: `gamepad-${n}` as PortSource, label: `Controller ${n + 1}${pads[n] ? ` (${shortPadName(pads[n]!.id)})` : ''}` })),
    { value: 'none', label: 'Nobody' },
  ];

  const groups = [...new Set(CONTROLS.map((c) => c.group))];

  return (
    <div>
      <div className="group-title">Players</div>
      {s.ports.map((p, i) => (
        <div key={i} className="setting">
          <div>
            <div className="label">Player {i + 1}</div>
            <div className="hint">
              {deviceBase(p.device) === DEVICE.MOUSE && 'Click the game to capture the mouse; press Esc to let go.'}
              {deviceBase(p.device) === DEVICE.LIGHTGUN && 'Aim with the mouse. Left click fires, right click reloads (shoots off screen).'}
              {deviceBase(p.device) === DEVICE.KEYBOARD && 'Your keyboard types into the game. Hotkeys still work.'}
            </div>
          </div>
          <div className="row wrap" style={{ justifyContent: 'flex-end' }}>
            <select aria-label={`Player ${i + 1} device`} value={p.device} onChange={(e) => setPort(i, { device: Number(e.target.value) })} style={{ maxWidth: 170 }}>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
            <select aria-label={`Player ${i + 1} input`} value={p.source.startsWith('remote-') ? 'none' : p.source} onChange={(e) => setPort(i, { source: e.target.value as PortSource })} style={{ maxWidth: 220 }}>
              {sourceOptions(i).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      ))}

      <div className="group-title">Connected controllers</div>
      {pads.filter(Boolean).length === 0 ? (
        <p className="small muted">No controllers detected. Connect one and press any button (browsers only report controllers after a button press).</p>
      ) : (
        <div className="stack" style={{ gap: 8 }}>
          {pads.map(
            (g, n) =>
              g && (
                <div key={g.index} className="bios-slot">
                  <span className="badge">#{n + 1}</span>
                  <div className="grow stack" style={{ gap: 4 }}>
                    <span className="small" style={{ fontWeight: 600 }}>
                      {shortPadName(g.id)} {g.mapping === 'standard' ? '' : <span className="badge warn">non-standard layout: check bindings</span>}
                    </span>
                    <div className="pad-viz" aria-hidden="true">
                      {g.buttons.map((b, i) => (
                        <span key={i} className={b.pressed || b.value > 0.5 ? 'on' : ''}>
                          {i}
                        </span>
                      ))}
                      {g.axes.map((a, i) => (
                        <span key={`a${i}`} className={Math.abs(a) > 0.5 ? 'on' : ''}>
                          A{i} {a.toFixed(1)}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ),
          )}
        </div>
      )}

      <SettingRow label="Stick deadzone" htmlFor="dz">
        <Slider id="dz" label="Stick deadzone" min={0} max={0.5} step={0.01} value={s.input.deadzone} format={(n) => `${Math.round(n * 100)}%`} onChange={(n) => setInput({ deadzone: n })} />
      </SettingRow>
      <SettingRow label="Rumble" hint="Vibrates controllers that support it when the game uses a Puru Puru pack.">
        <Switch label="Rumble" checked={s.input.rumble} onChange={(b) => setInput({ rumble: b })} />
      </SettingRow>
      <SettingRow label="Mouse sensitivity" htmlFor="ms">
        <Slider id="ms" label="Mouse sensitivity" min={0.25} max={3} step={0.05} value={s.input.mouseSensitivity} format={(n) => `${n.toFixed(2)}×`} onChange={(n) => setInput({ mouseSensitivity: n })} />
      </SettingRow>

      <div className="row between" style={{ marginTop: 18 }}>
        <div className="group-title" style={{ margin: 0 }}>
          Bindings
        </div>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setInput({ keys: DEFAULT_KEYS, pad: DEFAULT_PAD })}>
          Reset bindings
        </button>
      </div>
      <p className="small muted" style={{ margin: '6px 0 10px' }}>
        Click a binding, then press a key or controller button. Backspace clears it, Esc cancels.
      </p>
      {groups.map((group) => (
        <section key={group}>
          <div className="small" style={{ fontWeight: 700, margin: '12px 0 4px' }}>
            {group}
          </div>
          <div className="bind-grid">
            {CONTROLS.filter((c) => c.group === group).map((c) => (
              <div key={c.id} className="bind-row">
                <span>{c.label}</span>
                <div className="row" style={{ gap: 6 }}>
                  <button
                    type="button"
                    className={`btn btn-sm bind-btn ${listening?.kind === 'key' && listening.id === c.id ? 'is-listening' : ''}`}
                    onClick={() => setListening({ kind: 'key', id: c.id })}
                    aria-label={`${c.label} keyboard binding: ${keyLabel(s.input.keys[c.id])}`}
                  >
                    {listening?.kind === 'key' && listening.id === c.id ? 'Press a key…' : keyLabel(s.input.keys[c.id])}
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm bind-btn ${listening?.kind === 'pad' && listening.id === c.id ? 'is-listening' : ''}`}
                    onClick={() => setListening({ kind: 'pad', id: c.id })}
                    aria-label={`${c.label} controller binding: ${padInputLabel(s.input.pad[c.id])}`}
                    title={padInputLabel(s.input.pad[c.id])}
                  >
                    {listening?.kind === 'pad' && listening.id === c.id ? 'Press a button…' : padInputLabel(s.input.pad[c.id])}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      <div className="row between" style={{ marginTop: 18 }}>
        <div className="group-title" style={{ margin: 0 }}>
          Hotkeys
        </div>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => update((x) => ({ ...x, hotkeys: DEFAULT_HOTKEYS }))}>
          Reset hotkeys
        </button>
      </div>
      <p className="small muted" style={{ margin: '6px 0 10px' }}>
        On a controller, press Home/Guide (or Back + Start) to open the menu.
      </p>
      <div className="bind-grid">
        {HOTKEYS.map((h) => (
          <div key={h.id} className="bind-row">
            <span>{h.label}</span>
            <button
              type="button"
              className={`btn btn-sm bind-btn ${listening?.kind === 'hotkey' && listening.id === h.id ? 'is-listening' : ''}`}
              onClick={() => setListening({ kind: 'hotkey', id: h.id })}
            >
              {listening?.kind === 'hotkey' && listening.id === h.id ? 'Press a key…' : keyLabel(s.hotkeys[h.id])}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function shortPadName(id: string) {
  return id.replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim().slice(0, 40) || 'Controller';
}

function connectedPads(): (Gamepad | null)[] {
  const list = navigator.getGamepads ? [...navigator.getGamepads()].filter((g): g is Gamepad => !!g && g.connected) : [];
  return [0, 1, 2, 3].map((i) => list[i] ?? null);
}

function useGamepads() {
  const [pads, setPads] = useState<(Gamepad | null)[]>(connectedPads);
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const tick = (t: number) => {
      if (t - last > 60) {
        last = t;
        setPads(connectedPads());
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return pads;
}

function snapshotPads() {
  return connectedPads().map((g) => (g ? { buttons: g.buttons.map((b) => b.pressed || b.value > 0.5), axes: [...g.axes] } : null));
}

function detectPadInput(baseline: ReturnType<typeof snapshotPads>): string | null {
  const pads = connectedPads();
  for (let n = 0; n < pads.length; n++) {
    const g = pads[n];
    if (!g) continue;
    const base = baseline[n];
    for (let i = 0; i < g.buttons.length; i++) {
      const on = g.buttons[i].pressed || g.buttons[i].value > 0.5;
      if (on && !base?.buttons[i] && i !== 16) return `b${i}`;
    }
    for (let i = 0; i < g.axes.length; i++) {
      const a = g.axes[i];
      if (Math.abs(a) > 0.6 && Math.abs(base?.axes[i] ?? 0) < 0.3) return `a${i}${a < 0 ? '-' : '+'}`;
    }
  }
  return null;
}
