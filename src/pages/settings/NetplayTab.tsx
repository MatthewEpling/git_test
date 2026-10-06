import { SettingRow, Slider } from '../../ui/controls';
import { useSettings } from '../../ui/settings-store';
import { defaultSignalUrl } from '../../netplay/signaling';

export function NetplayTab() {
  const [s, update] = useSettings();
  const n = s.netplay;
  const set = (patch: Partial<typeof n>) => update((x) => ({ ...x, netplay: { ...x.netplay, ...patch } }));
  return (
    <div>
      <p className="small muted" style={{ marginTop: 12 }}>
        Online play streams the host's game to friends over a direct peer-to-peer connection (WebRTC). Friends send their controller input back. Nothing is
        uploaded to a game server.
      </p>
      <SettingRow label="Your name" htmlFor="np-name">
        <input id="np-name" type="text" maxLength={24} placeholder="Player" value={n.displayName} onChange={(e) => set({ displayName: e.target.value })} />
      </SettingRow>
      <SettingRow label="Stream quality" hint="Higher looks sharper but needs more upload speed from the host." htmlFor="np-br">
        <Slider id="np-br" label="Stream quality" min={1500} max={15000} step={500} value={n.videoBitrateKbps} format={(v) => `${(v / 1000).toFixed(1)} Mbps`} onChange={(v) => set({ videoBitrateKbps: v })} />
      </SettingRow>
      <SettingRow label="Room server" hint={`Used for room codes. Leave blank for this site's server (${defaultSignalUrl()}). Invite codes work without one.`} htmlFor="np-sig">
        <input id="np-sig" type="url" placeholder="wss://…" value={n.signalUrl} onChange={(e) => set({ signalUrl: e.target.value })} />
      </SettingRow>
      <div className="setting" style={{ gridTemplateColumns: '1fr' }}>
        <label className="label" htmlFor="np-ice">
          ICE servers
        </label>
        <div className="hint">One per line. STUN finds a direct route; a TURN server (with username and password) relays traffic on strict networks.</div>
        <textarea id="np-ice" rows={3} value={n.iceServers} onChange={(e) => set({ iceServers: e.target.value })} placeholder={'stun:stun.l.google.com:19302\nturn:turn.example.com:3478 user password'} />
      </div>
    </div>
  );
}
