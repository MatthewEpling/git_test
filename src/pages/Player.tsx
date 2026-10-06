import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { EmulatorSession, type SessionStats } from '../emu/session';
import { DEVICE } from '../emu/libretro';
import { extOf } from '../content/files';
import { loadBiosData } from '../storage/bios';
import { getGame, updateGame } from '../storage/library';
import { saveOptionDefs } from '../storage/option-defs';
import { retroKeyFromCode, retroModifiers } from '../input/keys';
import type { HotkeyId } from '../input/bindings';
import { useSettings, getSettings } from '../ui/settings-store';
import { useToast } from '../ui/toasts';
import { Icon } from '../ui/icons';
import { Modal } from '../ui/Modal';
import { SettingsDialog, type SettingsTab } from './Settings';
import { StatesPanel } from './player/StatesPanel';
import { AchievementsPanel, type AchievementStatus } from './player/AchievementsPanel';
import { NetplayPanel } from './player/NetplayPanel';
import { PerformancePanel } from './player/PerformancePanel';
import { NetplayHost } from '../netplay/host';
import { parseIceServers } from '../netplay/codec';
import { defaultSignalUrl } from '../netplay/signaling';
import { loadAccount } from '../achievements/account';
import { ra, badgeUrl } from '../achievements/ra';
import { AchievementRunner, findGameByTitle, headerFromRam } from '../achievements/runtime';
import { titleCase, type LaunchRequest } from './Home';

type Panel = 'menu' | 'states' | 'netplay' | 'achievements' | 'performance' | null;

interface Props {
  launch: LaunchRequest;
  onExit: () => void;
}

export function Player({ launch, onExit }: Props) {
  const [settings] = useSettings();
  const toast = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<EmulatorSession | null>(null);
  const hostRef = useRef<NetplayHost | null>(null);
  const runnerRef = useRef<AchievementRunner | null>(null);
  const [status, setStatus] = useState<{ kind: 'loading'; text: string; progress: number } | { kind: 'running' } | { kind: 'error'; text: string }>({
    kind: 'loading',
    text: 'Preparing…',
    progress: 0,
  });
  const [session, setSession] = useState<EmulatorSession | null>(null);
  const [paused, setPaused] = useState(false);
  const [ff, setFf] = useState(false);
  const [idle, setIdle] = useState(false);
  const [stats, setStats] = useState<SessionStats>({ fps: 0, speed: 0, audioMs: 0, coreMs: 0, coreMaxMs: 0, presentMs: 0, lateFrames: 0, underruns: 0, underrunsPerSec: 0, vsync: false, refreshesPerFrame: 0, refreshHz: 0 });
  const [panel, setPanel] = useState<Panel>(null);
  const [settingsTab, setSettingsTab] = useState<SettingsTab | null>(null);
  const [slot, setSlot] = useState(1);
  const [statesVersion, setStatesVersion] = useState(0);
  const [netVersion, setNetVersion] = useState(0);
  const [chatLog, setChatLog] = useState<{ from: string; text: string }[]>([]);
  const [ach, setAch] = useState<AchievementStatus>({ kind: 'loading', text: 'Checking for achievements…' });
  const [achVersion, setAchVersion] = useState(0);
  const [disc, setDisc] = useState({ count: 0, index: 0 });
  const startedAt = useRef(Date.now());
  const menuOpen = panel !== null || settingsTab !== null;

  // ───────────────────────── Boot ─────────────────────────
  // Boot exactly once (React's development mode mounts components twice).
  const bootStarted = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (bootStarted.current) return;
    bootStarted.current = true;
    const isCancelled = () => !mounted.current;
    (async () => {
      const s = getSettings();
      const [boot, flash] = await Promise.all([loadBiosData('boot'), loadBiosData('flash')]);
      const isElf = !!launch.main && extOf(launch.main.name) === 'elf';
      if (!boot && !launch.main) {
        setStatus({ kind: 'error', text: 'Starting the console without a disc needs your Dreamcast BIOS (dc_boot.bin).' });
        return;
      }
      if (!boot && !isElf && !s.emulation.allowHleBios) {
        setStatus({
          kind: 'error',
          text: 'This game needs a Dreamcast BIOS (dc_boot.bin). Add it on the home screen, or turn on "Allow HLE BIOS fallback" in Settings → Emulation.',
        });
        return;
      }
      try {
        const sess = await EmulatorSession.start(
          canvasRef.current!,
          s,
          { files: launch.files, main: launch.main, gameKey: launch.gameKey, title: launch.title, bios: { boot, flash }, useHleBios: !boot || isElf },
          {
            onLoadProgress: (text, progress) => !isCancelled() && setStatus({ kind: 'loading', text, progress }),
            onToast: (text) => toast({ text }),
            onStats: (st) => setStats(st),
            onLog: (level, text) => {
              if (level === 'error') console.error(`[core] ${text}`);
            },
          },
        );
        if (isCancelled()) {
          void sess.stop();
          return;
        }
        sessionRef.current = sess;
        setSession(sess);
        if (import.meta.env.DEV) (window as unknown as { __dreamport?: unknown }).__dreamport = { session: sess, host: () => hostRef.current, runner: () => runnerRef.current };
        setStatus({ kind: 'running' });
        setDisc(sess.core.discInfo());
        saveOptionDefs({
          options: [...sess.core.options.values()],
          categories: [...sess.core.categories.values()],
          controllerTypes: sess.core.controllerTypes[0] ?? [],
          coreVersion: sess.core.libraryVersion,
        });
        if (launch.libraryId) void updateGame(launch.libraryId, { lastPlayed: Date.now() });
        if (!boot && !isElf) toast({ text: 'Running with the HLE BIOS: some games may not boot. Add your BIOS for best results.', ms: 6000 });
      } catch (e) {
        if (!isCancelled()) setStatus({ kind: 'error', text: (e as Error).message });
      }
    })();
  }, []);

  // ───────────────────────── Apply settings live ─────────────────────────
  useEffect(() => {
    const s = session;
    if (!s) return;
    s.applyVideo(settings.video);
    s.applyAudio(settings.audio);
    s.input.settings = settings.input;
    s.fastForwardSpeed = settings.emulation.fastForwardSpeed;
    s.input.reservedKeys = new Set(Object.values(settings.hotkeys).filter(Boolean));
  }, [session, settings.video, settings.audio, settings.input, settings.emulation.fastForwardSpeed, settings.hotkeys]);

  useEffect(() => {
    session?.applyCoreOptions(settings.coreOptions);
  }, [session, settings.coreOptions]);

  useEffect(() => {
    const s = session;
    if (!s) return;
    // Keep netplay guests on their ports when local port settings change.
    const remote = s.input.ports.map((p) => (p.source.startsWith('remote-') ? p : null));
    s.applyPorts(settings.ports.map((p, i) => remote[i] ?? p));
  }, [session, settings.ports]);

  // ───────────────────────── Actions ─────────────────────────
  const togglePause = useCallback((force?: boolean) => {
    const s = sessionRef.current;
    if (!s) return;
    const next = force ?? !s.paused;
    s.setPaused(next);
    setPaused(next);
    hostRef.current?.setPaused(next);
  }, []);

  const saveState = useCallback(
    async (n = slot) => {
      const s = sessionRef.current;
      if (!s) return;
      try {
        await s.saveState(n);
        setStatesVersion((v) => v + 1);
        toast({ kind: 'success', text: `Saved to slot ${n}.` });
      } catch (e) {
        toast({ kind: 'error', text: (e as Error).message });
      }
    },
    [slot, toast],
  );

  const loadState = useCallback(
    async (n = slot) => {
      const s = sessionRef.current;
      if (!s) return;
      try {
        if (await s.loadState(n)) {
          runnerRef.current?.resetTriggers();
          toast({ text: n === 0 ? 'Resumed your last session.' : `Loaded slot ${n}.` });
          setPanel(null);
          togglePause(false);
        } else toast({ kind: 'error', text: n === 0 ? 'No auto-save yet.' : `Slot ${n} is empty.` });
      } catch {
        toast({ kind: 'error', text: 'That save state could not be loaded (it may be from a different core version).' });
      }
    },
    [slot, toast, togglePause],
  );

  const screenshot = useCallback(() => {
    const s = sessionRef.current;
    if (!s) return;
    const a = document.createElement('a');
    a.href = s.screenshot();
    a.download = `${launch.title.replace(/[^\w-]+/g, '_')}-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
    a.click();
    toast({ text: 'Screenshot saved.' });
  }, [launch.title, toast]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void rootRef.current?.requestFullscreen?.().catch(() => toast({ kind: 'error', text: 'Fullscreen is not available here.' }));
  }, [toast]);

  const exit = useCallback(async () => {
    const s = sessionRef.current;
    hostRef.current?.close();
    hostRef.current = null;
    if (s) {
      if (getSettings().emulation.autoSaveState) await s.saveState(0).catch(() => undefined);
      await s.stop();
      if (launch.libraryId) {
        const g = await getGame(launch.libraryId);
        void updateGame(launch.libraryId, { playSeconds: (g?.playSeconds ?? 0) + Math.round((Date.now() - startedAt.current) / 1000) });
      }
    }
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    onExit();
  }, [launch.libraryId, onExit]);

  const openMenu = useCallback(() => {
    setPanel('menu');
    togglePause(true);
  }, [togglePause]);

  const closePanels = useCallback(() => {
    setPanel(null);
    setSettingsTab(null);
    togglePause(false);
    canvasRef.current?.focus();
  }, [togglePause]);

  // ───────────────────────── Keyboard, mouse, gamepad ─────────────────────────
  useEffect(() => {
    if (!session) return;
    const hotkeyFor = (code: string): HotkeyId | undefined =>
      (Object.entries(getSettings().hotkeys) as [HotkeyId, string][]).find(([, c]) => c === code)?.[0];
    const dialogOpen = () => !!document.querySelector('dialog[open]');

    const onKeyDown = (e: KeyboardEvent) => {
      if (dialogOpen()) return;
      const hk = hotkeyFor(e.code);
      if (hk) {
        e.preventDefault();
        if (e.repeat && hk !== 'fastForward') return;
        switch (hk) {
          case 'menu':
            if (document.pointerLockElement) return; // Esc first releases the mouse
            openMenu();
            return;
          case 'fastForward':
            session.setFastForward(true);
            setFf(true);
            return;
          case 'pause':
            togglePause();
            return;
          case 'saveState':
            void saveState();
            return;
          case 'loadState':
            void loadState();
            return;
          case 'prevSlot':
          case 'nextSlot':
            setSlot((n) => {
              const next = ((n - 1 + (hk === 'nextSlot' ? 1 : -1) + 9) % 9) + 1;
              toast({ text: `Save slot ${next}` });
              return next;
            });
            return;
          case 'screenshot':
            screenshot();
            return;
          case 'fullscreen':
            toggleFullscreen();
            return;
        }
      }
      if (e.ctrlKey || e.metaKey) return; // leave browser shortcuts alone
      session.input.keyDown(e.code);
      if (session.keyboardIsDevice && session.core.hasKeyboardCallback) {
        session.core.keyboardEvent(true, retroKeyFromCode(e.code), e.key.length === 1 ? e.key.charCodeAt(0) : 0, retroModifiers(e));
      }
      if (session.keyboardIsDevice || Object.values(getSettings().input.keys).includes(e.code)) e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (hotkeyFor(e.code) === 'fastForward') {
        session.setFastForward(false);
        setFf(false);
      }
      session.input.keyUp(e.code);
      if (session.keyboardIsDevice && session.core.hasKeyboardCallback) session.core.keyboardEvent(false, retroKeyFromCode(e.code), 0, retroModifiers(e));
    };
    const onBlur = () => session.input.releaseAll();

    const canvas = canvasRef.current!;
    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement === canvas) session.input.mouseMove(e.movementX, e.movementY);
      if (session.input.wantsLightgun) session.input.aim(session.presenter.toFrameCoords(e.clientX, e.clientY));
    };
    const onMouseDown = (e: MouseEvent) => {
      if (session.usesPointerLock && document.pointerLockElement !== canvas) {
        void canvas.requestPointerLock?.();
        return;
      }
      if (session.usesPointerLock || session.input.wantsLightgun) {
        session.input.mouseButton(e.button, true);
        e.preventDefault();
      }
    };
    const onMouseUp = (e: MouseEvent) => session.input.mouseButton(e.button, false);
    const onWheel = (e: WheelEvent) => {
      if (document.pointerLockElement === canvas) session.input.mouseWheel(e.deltaY);
    };
    const onContext = (e: MouseEvent) => {
      if (session.usesPointerLock || session.input.wantsLightgun) e.preventDefault();
    };
    const onLeave = () => session.input.wantsLightgun && session.input.aim(null);

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    window.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('wheel', onWheel, { passive: true });
    canvas.addEventListener('contextmenu', onContext);
    canvas.addEventListener('mouseleave', onLeave);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContext);
      canvas.removeEventListener('mouseleave', onLeave);
    };
  }, [session, openMenu, togglePause, saveState, loadState, screenshot, toggleFullscreen, toast]);

  // Gamepad menu chord (Home, or Back + Start), and resume audio on the first input.
  useEffect(() => {
    if (!session) return;
    let held = false;
    const id = window.setInterval(() => {
      const pressed = session.input.gamepadMenuPressed();
      if (pressed && !held) {
        if (document.querySelector('dialog[open]')) closePanels();
        else openMenu();
      }
      held = pressed;
    }, 80);
    const resume = () => session.audio.resume();
    window.addEventListener('pointerdown', resume);
    window.addEventListener('keydown', resume);
    return () => {
      clearInterval(id);
      window.removeEventListener('pointerdown', resume);
      window.removeEventListener('keydown', resume);
    };
  }, [session, openMenu, closePanels]);

  // Hide the toolbar and cursor when idle.
  useEffect(() => {
    let t = 0;
    const wake = () => {
      setIdle(false);
      clearTimeout(t);
      t = window.setTimeout(() => setIdle(true), 2500);
    };
    wake();
    window.addEventListener('mousemove', wake);
    window.addEventListener('pointerdown', wake);
    return () => {
      clearTimeout(t);
      window.removeEventListener('mousemove', wake);
      window.removeEventListener('pointerdown', wake);
    };
  }, []);

  // Pause in the background.
  useEffect(() => {
    if (!session) return;
    let pausedByUs = false;
    const onVis = () => {
      if (!getSettings().emulation.pauseInBackground || hostRef.current?.guests.size) return;
      if (document.hidden && !session.paused) {
        pausedByUs = true;
        togglePause(true);
      } else if (!document.hidden && pausedByUs && !document.querySelector('dialog[open]')) {
        pausedByUs = false;
        togglePause(false);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [session, togglePause]);

  // Save VMU data if the tab is closed mid-game.
  useEffect(() => {
    const flush = () => void sessionRef.current?.syncSaves();
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, []);

  useEffect(() => () => {
    hostRef.current?.close();
    void sessionRef.current?.stop();
  }, []);

  // ───────────────────────── Achievements ─────────────────────────
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    const s = getSettings();
    (async () => {
      const account = await loadAccount();
      if (!launch.main) return setAch({ kind: 'none', text: 'No game is running.' });
      if (!s.achievements.enabled) return setAch({ kind: 'off', reason: 'Achievement tracking is turned off.' });
      if (!account) return setAch({ kind: 'off', reason: 'Sign in to RetroAchievements to track achievements for this game.' });
      let gameId = 0;
      let matchedBy: 'hash' | 'title' = 'hash';
      try {
        const lib = launch.libraryId ? await getGame(launch.libraryId) : undefined;
        if (lib?.raGameId) gameId = lib.raGameId;
        else if (launch.raHash) gameId = await ra.gameIdForHash(launch.raHash);
        if (!gameId) {
          // CHD/CDI or an unknown dump: wait for the BIOS to load the disc header, then match by title.
          setAch({ kind: 'loading', text: 'Identifying the game…' });
          let header = null;
          const waits = !launch.main || extOf(launch.main.name) === 'elf' ? 0 : 40;
          for (let i = 0; i < waits && !cancelled && !header; i++) {
            await new Promise((r) => setTimeout(r, 500));
            header = headerFromRam(session.core);
          }
          const title = header?.title || launch.title;
          const match = await findGameByTitle(titleCase(title));
          if (match) {
            gameId = match.id;
            matchedBy = 'title';
          }
        }
        if (cancelled) return;
        if (!gameId) return setAch({ kind: 'none', text: 'RetroAchievements has no achievement set for this game (or this version of it).' });
        if (launch.libraryId) void updateGame(launch.libraryId, { raGameId: gameId });
        const game = await ra.game(account, gameId);
        const runner = new AchievementRunner(game, account, matchedBy, s.achievements.showUnofficial);
        await runner.init();
        if (cancelled) return;
        if (!runner.achievements.length) return setAch({ kind: 'none', text: `${game.title} has no official achievements yet.` });
        runner.onUnlock = (a) => {
          if (getSettings().achievements.notifications) toast({ kind: 'achievement', title: 'Achievement unlocked', text: `${a.title} (${a.points})`, image: badgeUrl(a.badge) });
          setAchVersion((v) => v + 1);
        };
        runner.onChange = () => setAchVersion((v) => v + 1);
        runnerRef.current = runner;
        session.frameHooks.add(runner.frame);
        setAch({ kind: 'ready', runner });
        const t = runner.totals;
        toast({ text: `${game.title}: ${t.unlocked}/${t.total} achievements unlocked (tracked locally).`, image: runner.game.icon ? `https://media.retroachievements.org${runner.game.icon}` : undefined });
      } catch (e) {
        if (!cancelled) setAch({ kind: 'none', text: `Achievements unavailable: ${(e as Error).message}` });
      }
    })();
    return () => {
      cancelled = true;
      if (runnerRef.current) session.frameHooks.delete(runnerRef.current.frame);
    };
  }, [session]);

  // ───────────────────────── Netplay ─────────────────────────
  const ensureHost = useCallback(() => {
    if (hostRef.current && !hostRef.current.closed) return hostRef.current;
    const s = sessionRef.current!;
    const st = getSettings();
    s.audio.resume();
    hostRef.current = new NetplayHost(s, {
      iceServers: parseIceServers(st.netplay.iceServers),
      bitrateKbps: st.netplay.videoBitrateKbps,
      hostName: st.netplay.displayName || 'Host',
      title: launch.title,
      onChange: () => setNetVersion((v) => v + 1),
      onChat: (from, text) => {
        setChatLog((l) => [...l.slice(-50), { from, text }]);
        toast({ text: `${from}: ${text}` });
      },
      onEvent: (text) => toast({ text }),
    });
    setNetVersion((v) => v + 1);
    return hostRef.current;
  }, [launch.title, toast]);

  const startRoom = useCallback(async () => {
    const host = ensureHost();
    await host.openRoom(getSettings().netplay.signalUrl || defaultSignalUrl());
  }, [ensureHost]);

  const stopHosting = useCallback(() => {
    hostRef.current?.close();
    hostRef.current = null;
    setChatLog([]);
    setNetVersion((v) => v + 1);
    const s = sessionRef.current;
    if (s) s.applyPorts(getSettings().ports);
  }, []);

  // ───────────────────────── Render ─────────────────────────
  const guests = hostRef.current ? [...hostRef.current.guests.values()].filter((g) => g.info.state === 'connected').length : 0;
  const lightgun = session?.input.wantsLightgun;
  void netVersion;

  const menuItems: { label: string; icon: ReactElement; onClick: () => void; kbd?: string; hidden?: boolean }[] = [
    { label: 'Resume', icon: <Icon.Play />, onClick: closePanels, kbd: settings.hotkeys.menu },
    { label: `Save state (slot ${slot})`, icon: <Icon.Save />, onClick: () => void saveState().then(closePanels), kbd: settings.hotkeys.saveState },
    { label: `Load state (slot ${slot})`, icon: <Icon.Load />, onClick: () => void loadState(), kbd: settings.hotkeys.loadState },
    { label: 'All save states…', icon: <Icon.Save />, onClick: () => setPanel('states') },
    { label: 'Online play…', icon: <Icon.Users />, onClick: () => setPanel('netplay') },
    { label: 'Achievements…', icon: <Icon.Trophy />, onClick: () => setPanel('achievements') },
    {
      label: 'Performance…',
      icon: <Icon.Forward />,
      onClick: () => {
        // Keep the game running so the numbers stay live.
        setPanel('performance');
        togglePause(false);
      },
    },
    { label: 'Settings…', icon: <Icon.Settings />, onClick: () => setSettingsTab('video') },
    { label: 'Controls…', icon: <Icon.Gamepad />, onClick: () => setSettingsTab('controls') },
    {
      label: `Swap disc (disc ${disc.index + 1} of ${disc.count})`,
      icon: <Icon.Disc />,
      hidden: disc.count < 2,
      onClick: () => {
        const s = sessionRef.current!;
        const next = (disc.index + 1) % disc.count;
        s.core.setEjected(true);
        s.core.setDiscIndex(next);
        s.core.setEjected(false);
        setDisc(s.core.discInfo());
        toast({ text: `Inserted disc ${next + 1}.` });
      },
    },
    { label: 'Screenshot', icon: <Icon.Camera />, onClick: screenshot, kbd: settings.hotkeys.screenshot },
    {
      label: 'Reset console',
      icon: <Icon.Reset />,
      onClick: () => {
        if (confirm('Reset the console? Unsaved progress is lost.')) {
          sessionRef.current?.reset();
          runnerRef.current?.resetTriggers();
          closePanels();
        }
      },
    },
    { label: 'Exit game', icon: <Icon.Exit />, onClick: () => void exit() },
  ];

  return (
    <div ref={rootRef} className={`player ${idle && !menuOpen ? 'idle hide-cursor' : ''} ${lightgun ? 'lightgun' : ''}`}>
      <canvas ref={canvasRef} className="display" tabIndex={0} aria-label={`${launch.title} game screen`} />

      {status.kind === 'running' && (
        <>
          <div className="overlay-top" onMouseDown={(e) => e.stopPropagation()}>
            <button type="button" className="icon-btn" aria-label="Exit game" title="Exit" onClick={() => void exit()}>
              <Icon.Exit />
            </button>
            <span className="overlay-title grow">{launch.title}</span>
            <button type="button" className={`icon-btn ${paused ? 'is-on' : ''}`} aria-label={paused ? 'Resume' : 'Pause'} title={paused ? 'Resume' : 'Pause'} onClick={() => togglePause()}>
              {paused ? <Icon.Play /> : <Icon.Pause />}
            </button>
            <button
              type="button"
              className={`icon-btn ${ff ? 'is-on' : ''}`}
              aria-label="Fast forward"
              aria-pressed={ff}
              title="Fast forward"
              onClick={() => {
                const next = !ff;
                sessionRef.current?.setFastForward(next);
                setFf(next);
              }}
            >
              <Icon.Forward />
            </button>
            <span className="toolbar-sep" />
            <button type="button" className="icon-btn" aria-label="Save state" title="Save state" onClick={() => void saveState()}>
              <Icon.Save />
            </button>
            <button type="button" className="icon-btn" aria-label="Save states" title="Save states" onClick={() => setPanel('states')}>
              <Icon.Load />
            </button>
            <button type="button" className={`icon-btn ${guests ? 'is-on' : ''}`} aria-label="Online play" title="Online play" onClick={() => setPanel('netplay')}>
              <Icon.Users />
            </button>
            <button type="button" className="icon-btn" aria-label="Achievements" title="Achievements" onClick={() => setPanel('achievements')}>
              <Icon.Trophy />
            </button>
            <button type="button" className="icon-btn" aria-label="Screenshot" title="Screenshot" onClick={screenshot}>
              <Icon.Camera />
            </button>
            <button type="button" className="icon-btn" aria-label="Settings" title="Settings" onClick={() => setSettingsTab('video')}>
              <Icon.Settings />
            </button>
            <button type="button" className="icon-btn" aria-label="Fullscreen" title="Fullscreen" onClick={toggleFullscreen}>
              <Icon.Fullscreen />
            </button>
            <button type="button" className="icon-btn" aria-label="Menu" title="Menu" onClick={openMenu}>
              <Icon.Menu />
            </button>
          </div>
          <div className="overlay-bottom">
            <span className="stats" hidden={settings.video.showFps}>
              {stats.fps.toFixed(0)} fps · {Math.round(stats.speed * 100)}%{ff ? ' · fast forward' : ''}
              {guests ? ` · ${guests + 1} players online` : ''}
            </span>
            {session?.usesPointerLock && <span className="stats">Click the game to use the mouse · Esc to release</span>}
          </div>
          {settings.video.showFps && (
            <span className="stats fps-corner perf" aria-live="off">
              <span>
                {stats.fps.toFixed(0)} fps · {Math.round(stats.speed * 100)}% speed
              </span>
              <span className={stats.coreMaxMs > 16.7 ? 'warn' : ''}>
                emulation {stats.coreMs.toFixed(1)} ms (worst {stats.coreMaxMs.toFixed(1)})
              </span>
              <span>display {stats.presentMs.toFixed(1)} ms</span>
              <span className={stats.lateFrames ? 'warn' : ''}>late frames {stats.lateFrames}/s</span>
              <span className={stats.audioMs < 20 || stats.underrunsPerSec ? 'warn' : ''}>
                audio buffer {stats.audioMs.toFixed(0)} ms · dropouts {stats.underrunsPerSec}/s ({stats.underruns} total)
              </span>
              <span>
                {stats.vsync ? `synced to display (1 frame per ${stats.refreshesPerFrame} refresh${stats.refreshesPerFrame > 1 ? 'es' : ''})` : 'timer paced'} ·{' '}
                {stats.refreshHz.toFixed(0)} Hz
              </span>
            </span>
          )}
          {paused && !menuOpen && (
            <div className="paused-badge">
              <span>PAUSED</span>
            </div>
          )}
        </>
      )}

      {status.kind !== 'running' && (
        <div className="loading">
          <div className="box">
            {status.kind === 'loading' ? (
              <>
                <div className="spinner" aria-hidden="true" />
                <h1 style={{ fontSize: '1.2rem' }}>{launch.title}</h1>
                <p className="muted small" role="status">
                  {status.text}
                </p>
                <div className="progress" aria-hidden="true">
                  <span style={{ width: `${Math.round(status.progress * 100)}%` }} />
                </div>
              </>
            ) : (
              <>
                <h1 style={{ fontSize: '1.2rem' }}>Couldn't start {launch.title}</h1>
                <p className="notice bad" role="alert">
                  {status.text}
                </p>
                <button type="button" className="btn btn-primary" onClick={onExit}>
                  Back to library
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <Modal open={panel === 'menu'} onClose={closePanels} title={launch.title} variant="sheet">
        <nav className="menu-list" aria-label="Game menu">
          {menuItems
            .filter((m) => !m.hidden)
            .map((m) => (
              <button key={m.label} type="button" className="menu-item" onClick={m.onClick}>
                {m.icon}
                <span>{m.label}</span>
                {m.kbd && <span className="kbd">{m.kbd.replace(/^Key/, '')}</span>}
              </button>
            ))}
        </nav>
        <p className="tiny faint" style={{ marginTop: 16 }}>
          {session?.core.libraryVersion ? `Flycast ${session.core.libraryVersion}` : ''} · Player 1 uses {describePort(settings.ports[0])}
        </p>
      </Modal>

      <Modal open={panel === 'states'} onClose={closePanels} title="Save states" variant="sheet">
        <StatesPanel gameKey={launch.gameKey} current={slot} onSelect={setSlot} onSave={(n) => saveState(n)} onLoad={(n) => loadState(n)} refreshKey={statesVersion} />
      </Modal>

      <Modal open={panel === 'netplay'} onClose={closePanels} title="Online play" variant="sheet">
        <NetplayPanel
          host={hostRef.current}
          version={netVersion}
          onStartRoom={startRoom}
          onStop={stopHosting}
          ensureHost={ensureHost}
          chatLog={chatLog}
          onChat={(text) => {
            hostRef.current?.chat(text);
            setChatLog((l) => [...l.slice(-50), { from: 'You', text }]);
          }}
        />
      </Modal>

      <Modal open={panel === 'performance'} onClose={closePanels} title="Performance" variant="sheet">
        <PerformancePanel stats={stats} />
      </Modal>

      <Modal open={panel === 'achievements'} onClose={closePanels} title="Achievements" variant="sheet">
        <AchievementsPanel status={ach} version={achVersion} onSignIn={() => setSettingsTab('achievements')} />
      </Modal>

      <SettingsDialog open={settingsTab !== null} onClose={closePanels} session={session} initialTab={settingsTab ?? 'video'} />
    </div>
  );
}

function describePort(p: { device: number; source: string }) {
  const device = p.device === DEVICE.KEYBOARD ? 'a Dreamcast keyboard' : p.device === DEVICE.MOUSE ? 'a mouse' : p.device === DEVICE.LIGHTGUN ? 'a light gun' : 'a controller';
  const src = p.source === 'auto' ? 'keyboard + first controller' : p.source === 'keyboard' ? 'keyboard' : p.source.startsWith('gamepad-') ? `controller ${Number(p.source.slice(8)) + 1}` : 'nothing';
  return `${device} (${src})`;
}

