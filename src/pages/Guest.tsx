import { useEffect, useRef, useState } from 'react';
import { NetplayGuest, type GuestStatus } from '../netplay/guest';
import { parseIceServers } from '../netplay/codec';
import { defaultSignalUrl } from '../netplay/signaling';
import { getSettings, useSettings } from '../ui/settings-store';
import { useToast } from '../ui/toasts';
import { Icon, Logo } from '../ui/icons';

type Mode = { kind: 'room'; room: string } | { kind: 'invite' };

export function Guest({ mode, onExit }: { mode: Mode; onExit: () => void }) {
  const toast = useToast();
  const [settings, update] = useSettings();
  const [name, setName] = useState(settings.netplay.displayName);
  const [step, setStep] = useState<'setup' | 'reply' | 'live'>('setup');
  const [status, setStatus] = useState<{ s: GuestStatus; detail?: string }>({ s: 'connecting' });
  const [info, setInfo] = useState({ host: 'Host', title: '', port: null as number | null, rttMs: null as number | null, paused: false });
  const [invite, setInvite] = useState('');
  const [reply, setReply] = useState('');
  const [chat, setChat] = useState('');
  const [log, setLog] = useState<{ from: string; text: string }[]>([]);
  const [muted, setMuted] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const guestRef = useRef<NetplayGuest | null>(null);
  // The stream can arrive before the video element exists (invite flow), so keep it.
  const [stream, setStream] = useState<MediaStream | null>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !stream) return;
    if (v.srcObject !== stream) v.srcObject = stream;
    v.play().catch(() => setNeedsTap(true));
  }, [stream, step]);

  useEffect(() => () => guestRef.current?.close(), []);

  // Keyboard + gamepad → the guest's input manager (sent to the host).
  // The connection object may not exist yet when this view appears, so look it up per event.
  useEffect(() => {
    if (step !== 'live') return;
    const inputs = () => {
      const g = guestRef.current;
      if (g) g.inputs.settings = getSettings().input;
      return g?.inputs;
    };
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || e.ctrlKey || e.metaKey) return;
      inputs()?.keyDown(e.code);
      if (Object.values(getSettings().input.keys).includes(e.code)) e.preventDefault();
    };
    const up = (e: KeyboardEvent) => inputs()?.keyUp(e.code);
    const blur = () => inputs()?.releaseAll();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [step]);

  const callbacks = {
    onStream: (s: MediaStream) => {
      setStream(s);
      // Tracks are added to the same stream object; re-attach so the element notices.
      const v = videoRef.current;
      if (v && v.srcObject === s) v.play().catch(() => setNeedsTap(true));
    },
    onStatus: (s: GuestStatus, detail?: string) => {
      setStatus({ s, detail });
      if (s === 'connected') setStep('live');
    },
    onInfo: (i: typeof info) => setInfo(i),
    onChat: (from: string, text: string) => {
      setLog((l) => [...l.slice(-50), { from, text }]);
      toast({ text: `${from}: ${text}` });
    },
  };

  async function start(e: React.FormEvent) {
    e.preventDefault();
    update((x) => ({ ...x, netplay: { ...x.netplay, displayName: name.trim() } }));
    const ice = parseIceServers(getSettings().netplay.iceServers);
    const who = name.trim() || 'Guest';
    try {
      if (mode.kind === 'room') {
        setStep('live');
        guestRef.current = await NetplayGuest.joinRoom(getSettings().netplay.signalUrl || defaultSignalUrl(), mode.room, who, ice, callbacks);
      } else {
        const { guest, reply: r } = await NetplayGuest.fromInvite(invite, who, ice, callbacks);
        guestRef.current = guest;
        setReply(r);
        setStep('reply');
      }
    } catch (err) {
      setStep('setup');
      toast({ kind: 'error', text: (err as Error).message, ms: 7000 });
    }
  }

  if (step !== 'live') {
    return (
      <div>
        <header className="topbar">
          <div className="brand">
            <Logo />
            <span>Dreamport</span>
          </div>
          <button type="button" className="btn btn-ghost" onClick={onExit}>
            Back
          </button>
        </header>
        <main className="home" style={{ maxWidth: 560 }}>
          <div className="card stack">
            <h1 style={{ fontSize: '1.3rem' }}>{mode.kind === 'room' ? `Join room ${mode.room}` : 'Join with an invite code'}</h1>
            <p className="muted small">You'll see and hear the host's game and play with your keyboard or controller. Controls follow your Settings → Controls bindings.</p>
            {step === 'setup' ? (
              <form className="stack" onSubmit={start}>
                <label className="field">
                  <span className="label">Your name</span>
                  <input type="text" maxLength={24} value={name} placeholder="Player" onChange={(e) => setName(e.target.value)} />
                </label>
                {mode.kind === 'invite' && (
                  <label className="field">
                    <span className="label">Invite code from the host</span>
                    <textarea rows={4} required value={invite} onChange={(e) => setInvite(e.target.value)} placeholder="DP1.…" />
                  </label>
                )}
                <button type="submit" className="btn btn-primary btn-lg">
                  {mode.kind === 'room' ? 'Join game' : 'Create my reply code'}
                </button>
              </form>
            ) : (
              <div className="stack">
                <label className="field">
                  <span className="label">Send this reply code back to {info.host}</span>
                  <textarea readOnly rows={4} value={reply} onFocus={(e) => e.target.select()} />
                </label>
                <button type="button" className="btn" onClick={() => void navigator.clipboard?.writeText(reply).then(() => toast({ text: 'Copied.' }))}>
                  <Icon.Copy width={16} height={16} /> Copy reply code
                </button>
                <p className="small muted" role="status">
                  Waiting for the host to paste it… {status.detail}
                </p>
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="player">
      <video ref={videoRef} className="display" autoPlay playsInline muted={muted} aria-label={`${info.title || 'Game'} stream from ${info.host}`} />
      <div className="overlay-top">
        <button type="button" className="icon-btn" aria-label="Leave game" title="Leave" onClick={onExit}>
          <Icon.Exit />
        </button>
        <span className="overlay-title grow">
          {info.title || 'Online game'} <span className="faint small">hosted by {info.host}</span>
        </span>
        <span className="stats">
          {status.s === 'connected' ? (info.port !== null ? `You are player ${info.port + 1}` : 'Spectating') : 'Connecting…'}
          {info.rttMs !== null ? ` · ${info.rttMs} ms` : ''}
        </span>
        <button type="button" className="icon-btn" aria-label={muted ? 'Unmute' : 'Mute'} onClick={() => setMuted((m) => !m)}>
          {muted ? <Icon.Mute /> : <Icon.Volume />}
        </button>
        <button type="button" className="icon-btn" aria-label="Fullscreen" onClick={() => void document.documentElement.requestFullscreen?.().catch(() => undefined)}>
          <Icon.Fullscreen />
        </button>
      </div>
      {(status.s !== 'connected' || needsTap || info.paused) && (
        <div className="paused-badge" style={{ pointerEvents: needsTap ? 'auto' : 'none' }}>
          {needsTap ? (
            <button
              type="button"
              className="btn btn-primary btn-lg"
              onClick={() => {
                void videoRef.current?.play();
                setNeedsTap(false);
              }}
            >
              Click to start the stream
            </button>
          ) : (
            <span>{status.s === 'closed' ? status.detail ?? 'Disconnected' : info.paused ? 'HOST PAUSED' : 'CONNECTING…'}</span>
          )}
        </div>
      )}
      <div className="overlay-bottom" style={{ pointerEvents: 'auto' }}>
        <form
          className="row grow"
          onSubmit={(e) => {
            e.preventDefault();
            if (!chat.trim()) return;
            guestRef.current?.chat(chat.trim());
            setLog((l) => [...l.slice(-50), { from: 'You', text: chat.trim() }]);
            setChat('');
          }}
          style={{ maxWidth: 520 }}
        >
          <input type="text" aria-label="Chat message" placeholder="Chat with the room… (Enter to send)" value={chat} maxLength={200} onChange={(e) => setChat(e.target.value)} />
        </form>
        {log.length > 0 && <span className="stats">{`${log.at(-1)!.from}: ${log.at(-1)!.text}`}</span>}
      </div>
    </div>
  );
}
