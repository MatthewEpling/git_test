// Runs a RetroAchievements set against the emulator's RAM and records unlocks locally.

import { MemoryTracker, TriggerRuntime, type AchievementState } from './conditions';
import { ra, bestTitleMatch, type RaGame, type RaUser, type RaAchievement } from './ra';
import { db } from '../storage/db';
import { MEMORY } from '../emu/libretro';
import type { FlycastCore } from '../emu/core';
import { parseIpBin, type DiscHeader } from '../content/disc';

export interface AchievementView extends RaAchievement {
  state: AchievementState | 'unlocked';
  unlockedAt?: number;
  officialUnlock: boolean;
  measured?: { value: number; target: number };
  error?: string;
}

interface StoredUnlocks {
  [id: string]: number;
}

const unlockKey = (user: string, gameId: number) => `${user.toLowerCase()}:${gameId}`;

export async function loadUnlocks(user: string, gameId: number): Promise<StoredUnlocks> {
  return (await db.get<StoredUnlocks>('achievements', unlockKey(user, gameId)).catch(() => undefined)) ?? {};
}

export class AchievementRunner {
  private runtimes = new Map<number, TriggerRuntime>();
  private errors = new Map<number, string>();
  private tracker: MemoryTracker | null = null;
  private unlocks: StoredUnlocks = {};
  private official = new Set<number>();
  readonly achievements: RaAchievement[];
  onUnlock?: (a: AchievementView) => void;
  onChange?: () => void;
  private changedAt = 0;

  constructor(
    readonly game: RaGame,
    readonly user: RaUser,
    readonly matchedBy: 'hash' | 'title' | 'manual',
    includeUnofficial: boolean,
  ) {
    this.achievements = game.achievements.filter((a) => a.flags === 3 || (includeUnofficial && a.flags === 5));
  }

  async init() {
    this.unlocks = await loadUnlocks(this.user.user, this.game.id);
    const official = await ra.officialUnlocks(this.user, this.game.id, false).catch(() => []);
    this.official = new Set(official);
    for (const a of this.achievements) {
      if (this.unlocks[a.id] || this.official.has(a.id)) continue;
      try {
        this.runtimes.set(a.id, new TriggerRuntime(a.memAddr));
      } catch (e) {
        this.errors.set(a.id, (e as Error).message);
      }
    }
  }

  /** Frame hook: evaluates every locked achievement against the current RAM. */
  readonly frame = (core: FlycastCore) => {
    const ram = core.memory(MEMORY.SYSTEM_RAM);
    if (!ram) return;
    if (!this.tracker) this.tracker = new MemoryTracker(ram);
    this.tracker.advance(ram);
    let changed = false;
    for (const [id, rt] of this.runtimes) {
      const before = rt.measured?.value;
      if (rt.step(this.tracker)) {
        this.runtimes.delete(id);
        this.unlocks[id] = Date.now();
        void db.set('achievements', unlockKey(this.user.user, this.game.id), { ...this.unlocks });
        const view = this.views().find((v) => v.id === id);
        if (view) this.onUnlock?.(view);
        changed = true;
      } else if (rt.measured?.value !== before) changed = true;
    }
    const now = performance.now();
    if (changed && now - this.changedAt > 250) {
      this.changedAt = now;
      this.onChange?.();
    }
  };

  /** After loading a save state, memory jumps: start every trigger fresh. */
  resetTriggers() {
    this.tracker = null;
    for (const [id, a] of this.runtimes) {
      void a;
      const def = this.achievements.find((x) => x.id === id);
      if (def) this.runtimes.set(id, new TriggerRuntime(def.memAddr));
    }
  }

  views(): AchievementView[] {
    return this.achievements.map((a) => {
      const rt = this.runtimes.get(a.id);
      const unlockedAt = this.unlocks[a.id];
      return {
        ...a,
        state: unlockedAt || this.official.has(a.id) ? 'unlocked' : rt?.state ?? 'disabled',
        unlockedAt,
        officialUnlock: this.official.has(a.id),
        measured: rt?.measured,
        error: this.errors.get(a.id),
      };
    });
  }

  get totals() {
    const v = this.views();
    const unlocked = v.filter((a) => a.state === 'unlocked');
    return {
      unlocked: unlocked.length,
      total: v.length,
      points: unlocked.reduce((n, a) => n + a.points, 0),
      totalPoints: v.reduce((n, a) => n + a.points, 0),
    };
  }
}

/** Reads the IP.BIN header the BIOS copies to 0x8C008000 (RAM offset 0x8000). */
export function headerFromRam(core: FlycastCore): DiscHeader | null {
  const ram = core.memory(MEMORY.SYSTEM_RAM);
  if (!ram || ram.length < 0x8100) return null;
  return parseIpBin(ram.slice(0x8000, 0x8100));
}

let gameListCache: Promise<{ id: number; title: string }[]> | null = null;
export function dreamcastGameList() {
  if (!gameListCache) gameListCache = ra.gameList().catch((e) => {
    gameListCache = null;
    throw e;
  });
  return gameListCache;
}

export async function findGameByTitle(title: string) {
  return bestTitleMatch(title, await dreamcastGameList());
}
