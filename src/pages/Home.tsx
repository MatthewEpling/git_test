import { useEffect, useRef, useState, type DragEvent } from 'react';
import { Icon, Logo } from '../ui/icons';
import { useToast } from '../ui/toasts';
import { formatBytes } from '../ui/controls';
import { useSettings } from '../ui/settings-store';
import { BIOS_SPECS, BiosError, listBios, removeBios, saveBios, type BiosInfo, type BiosKind } from '../storage/bios';
import { addGame, gameFiles, libraryAvailable, listGames, removeGame, type LibraryGame } from '../storage/library';
import { requestPersistentStorage } from '../storage/db';
import { ACCEPTED_EXTENSIONS, filesFromDataTransfer, resolveGames, type GameSet } from '../content/files';
import { identifyDisc, openDisc, regionLabel } from '../content/disc';
import { md5 } from '../content/md5';

export interface LaunchRequest {
  files: File[];
  /** The file the core opens; null boots the console with no disc (BIOS menu). */
  main: File | null;
  title: string;
  gameKey: string;
  libraryId?: string;
  raHash?: string | null;
  productNumber?: string;
}

interface Props {
  onPlay: (req: LaunchRequest) => void;
  onJoin: (room: string) => void;
  onJoinInvite: () => void;
  onSettings: () => void;
}

const BIOS_KINDS: BiosKind[] = ['boot', 'flash'];

export function Home({ onPlay, onJoin, onJoinInvite, onSettings }: Props) {
  const toast = useToast();
  const [settings] = useSettings();
  const [bios, setBios] = useState<Partial<Record<BiosKind, BiosInfo>>>({});
  const [games, setGames] = useState<LibraryGame[]>([]);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState<{ text: string; progress: number } | null>(null);
  const [saveToLibrary, setSaveToLibrary] = useState(libraryAvailable());
  const [room, setRoom] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const biosInput = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    setBios(await listBios());
    setGames(await listGames());
  };
  useEffect(() => {
    void refresh();
  }, []);

  const hasBoot = !!bios.boot;

  async function addBiosFiles(files: File[]) {
    for (const f of files) {
      try {
        const info = await saveBios(f);
        toast({
          kind: info.recognized ? 'success' : 'info',
          text: info.recognized
            ? `${BIOS_SPECS[info.kind].label} added and verified.`
            : `${BIOS_SPECS[info.kind].label} added. It doesn't match a known dump, but may still work.`,
        });
      } catch (e) {
        toast({ kind: 'error', text: e instanceof BiosError ? e.message : `Could not read ${f.name}.` });
      }
    }
    void requestPersistentStorage();
    await refresh();
  }

  async function describe(game: GameSet) {
    let title = game.name;
    let raHash: string | null | undefined;
    let productNumber: string | undefined;
    let region: string | undefined;
    try {
      const disc = await openDisc(game.main, game.files);
      const id = disc ? await identifyDisc(disc) : null;
      if (id) {
        title = titleCase(id.header.title) || title;
        raHash = id.raHash;
        productNumber = id.header.productNumber;
        region = regionLabel(id.header.areas);
      }
    } catch {
      // Unreadable header: keep the file name as the title.
    }
    return { title, raHash, productNumber, region };
  }

  async function openFiles(files: File[]) {
    if (!files.length) return;
    const biosFiles = files.filter((f) => /dc_(boot|flash)\.bin$/i.test(f.name) || (files.length === 1 && f.size === BIOS_SPECS.boot.size && /\.bin$/i.test(f.name)));
    if (biosFiles.length) {
      await addBiosFiles(biosFiles);
      files = files.filter((f) => !biosFiles.includes(f));
      if (!files.length) return;
    }
    setBusy({ text: 'Looking for games…', progress: 0 });
    try {
      const found = await resolveGames(files);
      if (!found.length) {
        toast({ kind: 'error', text: `No Dreamcast game found. Supported: ${ACCEPTED_EXTENSIONS.filter((e) => e !== '.raw' && e !== '.img').join(', ')}.` });
        return;
      }
      const incomplete = found.filter((g) => g.missing.length);
      for (const g of incomplete) {
        toast({ kind: 'error', text: `${g.main.name} is missing ${g.missing.slice(0, 3).join(', ')}${g.missing.length > 3 ? '…' : ''}. Select all of the game's files together.`, ms: 7000 });
      }
      const ok = found.filter((g) => !g.missing.length);
      if (!ok.length) return;

      if (saveToLibrary && libraryAvailable()) {
        void requestPersistentStorage();
        const added: LibraryGame[] = [];
        for (const [i, g] of ok.entries()) {
          setBusy({ text: `Reading ${g.name}…`, progress: 0 });
          const meta = await describe(g);
          setBusy({ text: `Adding ${meta.title} to your library (${i + 1}/${ok.length})…`, progress: 0 });
          added.push(await addGame(g, meta, (p) => setBusy((b) => (b ? { ...b, progress: p } : b))));
        }
        await refresh();
        if (added.length === 1) {
          await play(added[0]);
        } else toast({ kind: 'success', text: `Added ${added.length} games to your library.` });
      } else {
        const g = ok[0];
        const meta = await describe(g);
        const key = `file-${md5(`${g.main.name}:${g.files.reduce((n, f) => n + f.size, 0)}`).slice(0, 12)}`;
        onPlay({ files: g.files, main: g.main, title: meta.title, gameKey: key, raHash: meta.raHash, productNumber: meta.productNumber });
      }
    } catch (e) {
      toast({ kind: 'error', text: `Could not open the game: ${(e as Error).message}` });
    } finally {
      setBusy(null);
    }
  }

  async function play(g: LibraryGame) {
    try {
      const files = await gameFiles(g);
      const main = files.find((f) => f.name === g.mainFile)!;
      onPlay({ files, main, title: g.title, gameKey: g.id, libraryId: g.id, raHash: g.raHash, productNumber: g.productNumber });
    } catch {
      toast({ kind: 'error', text: `${g.title}'s files are missing from browser storage. Remove it and add it again.` });
    }
  }

  async function remove(g: LibraryGame) {
    if (!confirm(`Remove ${g.title} from your library? Its files are deleted from this browser. Saves and save states are kept.`)) return;
    await removeGame(g.id);
    await refresh();
  }

  const onDrop = async (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    void openFiles(await filesFromDataTransfer(e.dataTransfer));
  };

  return (
    <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => e.preventDefault()}>
      <header className="topbar">
        <div className="brand">
          <Logo />
          <span>Dreamport</span>
          <span className="badge accent">Dreamcast</span>
        </div>
        <div className="row">
          <button type="button" className="btn btn-ghost" onClick={onSettings}>
            <Icon.Settings width={18} height={18} /> Settings
          </button>
        </div>
      </header>

      <main className="home">
        <section className="hero">
          <div
            className={`dropzone ${over ? 'is-over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={onDrop}
          >
            <Icon.Disc className="disc-icon" />
            <div className="stack" style={{ gap: 6 }}>
              <h2>Drop a game here</h2>
              <p className="muted">GDI with its tracks, CHD, CDI, CUE/BIN, M3U playlists or homebrew ELF. You can drop a whole folder.</p>
            </div>
            {busy ? (
              <div className="stack" style={{ width: 'min(360px, 100%)' }} role="status">
                <span className="small">{busy.text}</span>
                <div className="progress" aria-hidden="true">
                  <span style={{ width: `${Math.round(busy.progress * 100)}%` }} />
                </div>
              </div>
            ) : (
              <div className="row wrap" style={{ justifyContent: 'center' }}>
                <button type="button" className="btn btn-primary btn-lg" onClick={() => fileInput.current?.click()}>
                  <Icon.File width={18} height={18} /> Choose files
                </button>
                <button type="button" className="btn btn-lg" onClick={() => folderInput.current?.click()}>
                  <Icon.Folder width={18} height={18} /> Choose folder
                </button>
              </div>
            )}
            {libraryAvailable() ? (
              <label className="row small muted">
                <input type="checkbox" checked={saveToLibrary} onChange={(e) => setSaveToLibrary(e.target.checked)} />
                Keep in my library (stored privately in this browser)
              </label>
            ) : (
              <p className="small faint">This browser can't store a game library, so you'll pick the files each time.</p>
            )}
            <input
              ref={fileInput}
              type="file"
              multiple
              hidden
              accept={[...ACCEPTED_EXTENSIONS, '.zip'].join(',')}
              onChange={(e) => {
                void openFiles([...(e.target.files ?? [])]);
                e.target.value = '';
              }}
            />
            <input
              ref={folderInput}
              type="file"
              hidden
              // @ts-expect-error -- non-standard but widely supported folder picker
              webkitdirectory=""
              onChange={(e) => {
                void openFiles([...(e.target.files ?? [])]);
                e.target.value = '';
              }}
            />
          </div>

          <div className="card stack">
            <div className="row between">
              <h2 style={{ fontSize: '1.05rem' }}>Your BIOS</h2>
              {hasBoot ? <span className="badge ok">Ready</span> : <span className="badge warn">Needed</span>}
            </div>
            <p className="small muted">
              Dreamport doesn't include any BIOS or games. Add the BIOS dumped from your own Dreamcast. It stays in this browser and is never uploaded.
            </p>
            {BIOS_KINDS.map((k) => {
              const info = bios[k];
              const spec = BIOS_SPECS[k];
              return (
                <div key={k} className="bios-slot">
                  <span className={`dot ${info ? (info.recognized ? 'ok' : 'warn') : ''}`} aria-hidden="true" />
                  <div className="grow">
                    <div style={{ fontWeight: 600 }}>
                      {spec.file} <span className="faint small">· {spec.required ? 'required' : 'optional'}</span>
                    </div>
                    <div className="tiny muted">{info ? (info.recognized ? 'Verified dump' : 'Unrecognized dump: may still work') : spec.description}</div>
                  </div>
                  {info && (
                    <button type="button" className="btn btn-sm btn-ghost btn-danger" onClick={() => void removeBios(k).then(refresh)}>
                      Remove
                    </button>
                  )}
                </div>
              );
            })}
            <button type="button" className="btn" onClick={() => biosInput.current?.click()}>
              Add BIOS files…
            </button>
            <input
              ref={biosInput}
              type="file"
              hidden
              multiple
              accept=".bin"
              onChange={(e) => {
                void addBiosFiles([...(e.target.files ?? [])]);
                e.target.value = '';
              }}
            />
            {hasBoot && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => onPlay({ files: [], main: null, title: 'Dreamcast system menu', gameKey: 'system-menu' })}
              >
                <Icon.Play width={16} height={16} /> Start console without a disc
              </button>
            )}
            {!hasBoot && (
              <p className="tiny faint">
                Homebrew (.elf) runs without a BIOS.{settings.emulation.allowHleBios ? ' HLE BIOS fallback is on, so discs will try to boot without one.' : ''}
              </p>
            )}
          </div>
        </section>

        <section>
          <div className="section-head">
            <h2>Library</h2>
            <span className="small faint">{games.length ? `${games.length} game${games.length === 1 ? '' : 's'}` : ''}</span>
          </div>
          {games.length === 0 ? (
            <div className="empty">Games you add are kept here so you can jump back in. Nothing yet: drop a game above.</div>
          ) : (
            <div className="library">
              {games.map((g) => (
                <article key={g.id} className="game-card">
                  <button type="button" className="cover" style={{ background: coverGradient(g.title) }} onClick={() => void play(g)} aria-label={`Play ${g.title}`}>
                    <span className="initials" aria-hidden="true">
                      {initials(g.title)}
                    </span>
                    <span className="play" aria-hidden="true">
                      <span>
                        <Icon.Play width={22} height={22} />
                      </span>
                    </span>
                  </button>
                  <button type="button" className="icon-btn menu-btn" aria-label={`Remove ${g.title}`} title="Remove from library" onClick={() => void remove(g)}>
                    <Icon.Close />
                  </button>
                  <div className="meta">
                    <div className="title">{g.title}</div>
                    <div className="row wrap" style={{ gap: 6 }}>
                      <span className="badge">{g.format.toUpperCase()}</span>
                      {g.region && <span className="badge">{g.region}</span>}
                      <span className="tiny faint">{formatBytes(g.totalSize)}</span>
                    </div>
                    <div className="tiny faint">{g.lastPlayed ? `Played ${new Date(g.lastPlayed).toLocaleDateString()}` : 'Not played yet'}</div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="card">
          <div className="row wrap between" style={{ gap: 16 }}>
            <div className="stack" style={{ gap: 4 }}>
              <h2 style={{ fontSize: '1.05rem' }}>
                <Icon.Users width={18} height={18} style={{ verticalAlign: -3, marginRight: 6 }} />
                Join a friend's game
              </h2>
              <p className="small muted">Your friend hosts from the game menu. You don't need the game or a BIOS to join.</p>
            </div>
            <form
              className="row wrap"
              onSubmit={(e) => {
                e.preventDefault();
                if (room.trim()) onJoin(room.trim().toUpperCase());
              }}
            >
              <label className="sr-only" htmlFor="room">
                Room code
              </label>
              <input
                id="room"
                type="text"
                placeholder="ROOM CODE"
                value={room}
                maxLength={6}
                onChange={(e) => setRoom(e.target.value.toUpperCase())}
                style={{ width: 150, fontFamily: 'var(--mono)', letterSpacing: '0.2em', textTransform: 'uppercase' }}
              />
              <button type="submit" className="btn btn-primary" disabled={room.trim().length < 6}>
                Join
              </button>
              <button type="button" className="btn btn-ghost" onClick={onJoinInvite}>
                Use an invite code
              </button>
            </form>
          </div>
        </section>

        <footer className="footer stack" style={{ gap: 6 }}>
          <p>
            Dreamport runs the open-source <a href="https://github.com/flyinghead/flycast">Flycast</a> emulator compiled to WebAssembly. Everything runs and is
            stored on your device. Only play games and BIOS files you have dumped from hardware you own.
          </p>
          <p>Dreamcast is a trademark of SEGA. Dreamport is not affiliated with or endorsed by SEGA.</p>
        </footer>
      </main>
    </div>
  );
}

function initials(title: string) {
  const words = title.replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '?').slice(0, 2)).toUpperCase();
}

function coverGradient(title: string) {
  let h = 0;
  for (const c of title) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const a = h % 360;
  return `linear-gradient(135deg, hsl(${a} 70% 45%), hsl(${(a + 50) % 360} 70% 22%))`;
}

export function titleCase(s: string) {
  if (!s) return s;
  // IP.BIN titles are usually upper case; soften them for display.
  return s === s.toUpperCase() ? s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()) : s;
}
