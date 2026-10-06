import { useState } from 'react';
import type { NetplayHost } from '../../netplay/host';
import { Icon } from '../../ui/icons';
import { useToast } from '../../ui/toasts';

const COLORS = ['#ff7a3d', '#5aa9ff', '#4fd18b', '#f5c451'];

interface Props {
  host: NetplayHost | null;
  version: number;
  onStartRoom: () => Promise<void>;
  onStop: () => void;
  ensureHost: () => NetplayHost;
  chatLog: { from: string; text: string }[];
  onChat: (text: string) => void;
}

export function NetplayPanel({ host, onStartRoom, onStop, ensureHost, chatLog, onChat }: Props) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState<{ id: string; code: string } | null>(null);
  const [reply, setReply] = useState('');
  const [chat, setChat] = useState('');
  const guests = host ? [...host.guests.values()].map((g) => g.info) : [];
  const link = host?.room ? `${location.origin}${location.pathname}#join=${host.room}` : '';

  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text).then(
      () => toast({ text: 'Copied.' }),
      () => toast({ kind: 'error', text: 'Copy failed: select the text and copy it manually.' }),
    );
  };

  async function startRoom() {
    setBusy(true);
    try {
      await onStartRoom();
    } catch (e) {
      toast({ kind: 'error', text: (e as Error).message, ms: 7000 });
    } finally {
      setBusy(false);
    }
  }

  async function makeInvite() {
    setBusy(true);
    try {
      setInvite(await ensureHost().createInvite());
      setReply('');
    } catch (e) {
      toast({ kind: 'error', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function acceptReply() {
    if (!invite || !host) return;
    try {
      await host.acceptReply(invite.id, reply);
      setInvite(null);
      setReply('');
      toast({ text: 'Connecting to your friend…' });
    } catch (e) {
      toast({ kind: 'error', text: (e as Error).message });
    }
  }

  return (
    <div className="stack">
      <p className="small muted">
        Friends see and hear your game and play as players 2–4 with their own controller or keyboard. They don't need the game or a BIOS.
      </p>

      {host?.room ? (
        <div className="stack" style={{ gap: 8 }}>
          <span className="small" style={{ fontWeight: 700 }}>
            Room code
          </span>
          <div className="code-box" aria-label={`Room code ${host.room}`}>
            {host.room}
          </div>
          <div className="row">
            <button type="button" className="btn btn-sm grow" onClick={() => copy(link)}>
              <Icon.Copy width={16} height={16} /> Copy invite link
            </button>
            <button type="button" className="btn btn-sm" onClick={() => copy(host.room!)}>
              Copy code
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn btn-primary" onClick={() => void startRoom()} disabled={busy}>
          <Icon.Users width={18} height={18} /> Host with a room code
        </button>
      )}

      <details>
        <summary className="small" style={{ cursor: 'pointer', fontWeight: 600 }}>
          No room server? Invite with codes instead
        </summary>
        <div className="stack" style={{ marginTop: 10 }}>
          <p className="tiny muted">Works anywhere: send your friend the invite code, they send back a reply code. One invite per friend.</p>
          {!invite ? (
            <button type="button" className="btn btn-sm" onClick={() => void makeInvite()} disabled={busy}>
              {busy ? 'Preparing…' : 'Create invite code'}
            </button>
          ) : (
            <>
              <label className="field">
                <span className="label small">1. Send this invite code</span>
                <textarea readOnly rows={3} value={invite.code} onFocus={(e) => e.target.select()} />
              </label>
              <button type="button" className="btn btn-sm" onClick={() => copy(invite.code)}>
                <Icon.Copy width={16} height={16} /> Copy invite code
              </button>
              <label className="field">
                <span className="label small">2. Paste their reply code</span>
                <textarea rows={3} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="DP1.…" />
              </label>
              <button type="button" className="btn btn-sm btn-primary" disabled={!reply.trim()} onClick={() => void acceptReply()}>
                Connect
              </button>
            </>
          )}
        </div>
      </details>

      <div className="stack" style={{ gap: 8 }}>
        <span className="small" style={{ fontWeight: 700 }}>
          Players
        </span>
        <div className="player-row">
          <span className="player-dot" style={{ background: COLORS[0] }}>
            1
          </span>
          <span className="grow">You (host)</span>
        </div>
        {guests.length === 0 && <p className="tiny faint">Nobody has joined yet.</p>}
        {guests.map((g) => (
          <div key={g.id} className="player-row">
            <span className="player-dot" style={{ background: g.port !== null ? COLORS[g.port] : 'var(--line-2)' }}>
              {g.port !== null ? g.port + 1 : '–'}
            </span>
            <div className="grow">
              <div style={{ fontWeight: 600 }}>{g.name}</div>
              <div className="tiny muted">{g.state === 'connected' ? (g.rttMs !== null ? `${g.rttMs} ms ping` : 'Connected') : 'Connecting…'}</div>
            </div>
            <select
              aria-label={`Controller port for ${g.name}`}
              value={g.port ?? ''}
              onChange={(e) => host?.assignPort(g.id, e.target.value === '' ? null : Number(e.target.value))}
              style={{ width: 120 }}
            >
              <option value="">Spectate</option>
              {[1, 2, 3].map((p) => (
                <option key={p} value={p}>
                  Player {p + 1}
                </option>
              ))}
            </select>
            <button type="button" className="icon-btn" aria-label={`Remove ${g.name}`} onClick={() => host?.kick(g.id)}>
              <Icon.Close />
            </button>
          </div>
        ))}
      </div>

      {host && (
        <div className="stack" style={{ gap: 8 }}>
          <span className="small" style={{ fontWeight: 700 }}>
            Chat
          </span>
          <div className="chat-log" aria-live="polite">
            {chatLog.length === 0 ? (
              <span className="tiny faint">Messages appear here.</span>
            ) : (
              chatLog.map((m, i) => (
                <div key={i}>
                  <strong>{m.from}:</strong> {m.text}
                </div>
              ))
            )}
          </div>
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              if (chat.trim()) {
                onChat(chat.trim());
                setChat('');
              }
            }}
          >
            <input type="text" aria-label="Chat message" placeholder="Say something…" value={chat} maxLength={200} onChange={(e) => setChat(e.target.value)} />
            <button type="submit" className="btn btn-sm">
              Send
            </button>
          </form>
          <button type="button" className="btn btn-sm btn-ghost btn-danger" onClick={onStop}>
            Stop hosting
          </button>
        </div>
      )}
    </div>
  );
}
