import { useState } from 'react';
import { ra, RaError } from '../../achievements/ra';
import { setAccount, useAccount } from '../../achievements/account';
import { SettingRow, Switch } from '../../ui/controls';
import { useSettings } from '../../ui/settings-store';

export function AchievementsTab() {
  const [s, update] = useSettings();
  const account = useAccount();
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const a = s.achievements;
  const set = (patch: Partial<typeof a>) => update((x) => ({ ...x, achievements: { ...x.achievements, ...patch } }));

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await setAccount(await ra.login(user.trim(), password));
      setPassword('');
    } catch (err) {
      setError(err instanceof RaError ? err.message : 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="notice" style={{ marginTop: 12 }}>
        Achievements come from <a href="https://retroachievements.org">RetroAchievements</a>. Dreamport reads your account and each game's achievement list,
        then tracks unlocks <strong>in this browser</strong>. They are not posted to your RetroAchievements profile, because only emulators approved by
        RetroAchievements may submit unlocks.
      </div>
      <div className="group-title">Account</div>
      {account ? (
        <div className="bios-slot">
          {account.avatar && <img src={account.avatar} alt="" width={40} height={40} style={{ borderRadius: 8 }} />}
          <div className="grow">
            <div style={{ fontWeight: 700 }}>{account.user}</div>
            <div className="tiny muted">{account.score ? `${account.score.toLocaleString()} points on RetroAchievements` : 'Signed in'}</div>
          </div>
          <button type="button" className="btn btn-sm" onClick={() => void setAccount(null)}>
            Sign out
          </button>
        </div>
      ) : (
        <form className="stack" onSubmit={login} style={{ maxWidth: 420 }}>
          <label className="field">
            <span className="label">RetroAchievements username</span>
            <input type="text" autoComplete="username" value={user} onChange={(e) => setUser(e.target.value)} required />
          </label>
          <label className="field">
            <span className="label">Password</span>
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          <p className="tiny faint">Your password is sent once to sign in; only the login token is kept on this device.</p>
          {error && <p className="notice bad">{error}</p>}
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      )}
      <div className="group-title">Options</div>
      <SettingRow label="Track achievements">
        <Switch label="Track achievements" checked={a.enabled} onChange={(b) => set({ enabled: b })} />
      </SettingRow>
      <SettingRow label="Unlock pop-ups">
        <Switch label="Unlock pop-ups" checked={a.notifications} onChange={(b) => set({ notifications: b })} />
      </SettingRow>
      <SettingRow label="Include unofficial achievements" hint="Work-in-progress sets that may not trigger correctly.">
        <Switch label="Include unofficial achievements" checked={a.showUnofficial} onChange={(b) => set({ showUnofficial: b })} />
      </SettingRow>
    </div>
  );
}
