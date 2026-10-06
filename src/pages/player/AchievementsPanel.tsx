import { badgeUrl, gameIconUrl } from '../../achievements/ra';
import type { AchievementRunner } from '../../achievements/runtime';

export type AchievementStatus =
  | { kind: 'off'; reason: string }
  | { kind: 'loading'; text: string }
  | { kind: 'none'; text: string }
  | { kind: 'ready'; runner: AchievementRunner };

export function AchievementsPanel({ status, onSignIn, version }: { status: AchievementStatus; onSignIn: () => void; version: number }) {
  void version;
  if (status.kind === 'off')
    return (
      <div className="stack">
        <p className="muted">{status.reason}</p>
        <button type="button" className="btn btn-primary" onClick={onSignIn}>
          Achievement settings
        </button>
      </div>
    );
  if (status.kind === 'loading' || status.kind === 'none') return <p className="muted">{status.text}</p>;
  const { runner } = status;
  const t = runner.totals;
  const views = runner.views().sort((a, b) => Number(b.state === 'unlocked') - Number(a.state === 'unlocked'));
  return (
    <div className="stack">
      <div className="row">
        {runner.game.icon && <img src={gameIconUrl(runner.game.icon)} alt="" width={56} height={56} style={{ borderRadius: 10 }} />}
        <div className="grow">
          <div style={{ fontWeight: 700 }}>{runner.game.title}</div>
          <div className="small muted">
            {t.unlocked} of {t.total} unlocked · {t.points} / {t.totalPoints} points
          </div>
          {runner.matchedBy === 'title' && <div className="tiny" style={{ color: 'var(--yellow)' }}>Matched by title: if achievements don't trigger, your version may differ.</div>}
        </div>
      </div>
      <div className="progress" aria-hidden="true">
        <span style={{ width: `${(t.unlocked / Math.max(1, t.total)) * 100}%` }} />
      </div>
      <p className="tiny faint">Tracked in this browser only (not posted to RetroAchievements).</p>
      <div className="ach-list">
        {views.map((a) => (
          <div key={a.id} className={`ach ${a.state === 'unlocked' ? '' : 'locked'}`}>
            <img src={badgeUrl(a.badge, a.state !== 'unlocked')} alt="" loading="lazy" />
            <div className="grow stack" style={{ gap: 2 }}>
              <div className="row between">
                <strong className="small">{a.title}</strong>
                <span className="badge">{a.points}</span>
              </div>
              <span className="tiny muted">{a.description}</span>
              {a.state === 'unlocked' && (
                <span className="tiny" style={{ color: 'var(--green)' }}>
                  {a.officialUnlock ? 'Unlocked on RetroAchievements' : `Unlocked ${a.unlockedAt ? new Date(a.unlockedAt).toLocaleDateString() : ''}`}
                </span>
              )}
              {a.measured && a.state !== 'unlocked' && a.measured.target > 0 && (
                <div className="row" style={{ gap: 8 }}>
                  <div className="progress grow" aria-hidden="true">
                    <span style={{ width: `${Math.min(100, (a.measured.value / a.measured.target) * 100)}%` }} />
                  </div>
                  <span className="tiny mono">
                    {a.measured.value}/{a.measured.target}
                  </span>
                </div>
              )}
              {a.error && <span className="tiny" style={{ color: 'var(--red)' }}>Can't be tracked: {a.error}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
