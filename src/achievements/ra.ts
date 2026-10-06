// RetroAchievements API client (the "connect" endpoint the official emulators use).
//
// Requests go through a same-origin `/ra/` proxy (Vite in development, a Netlify redirect
// or the bundled Node server in production) because RetroAchievements does not allow
// cross-origin browser requests. Only read endpoints are used: unlocks are tracked
// locally and never submitted, since this emulator is not an approved RA client.

export const RA_BASE = `${import.meta.env.BASE_URL}ra/dorequest.php`;
export const RA_DREAMCAST = 40;

export interface RaUser {
  user: string;
  token: string;
  score?: number;
  avatar?: string;
}

export interface RaAchievement {
  id: number;
  title: string;
  description: string;
  points: number;
  memAddr: string;
  badge: string;
  /** 3 = core (official), 5 = unofficial. */
  flags: number;
  type?: string | null;
}

export interface RaGame {
  id: number;
  title: string;
  icon?: string;
  achievements: RaAchievement[];
  richPresence?: string;
}

export class RaError extends Error {}

async function request(params: Record<string, string | number>, fetchImpl: typeof fetch = fetch): Promise<Record<string, unknown>> {
  const body = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  let res: Response;
  try {
    res = await fetchImpl(RA_BASE, { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  } catch {
    throw new RaError('Could not reach RetroAchievements. Check your connection.');
  }
  let json: Record<string, unknown>;
  try {
    json = await res.json();
  } catch {
    throw new RaError(
      res.status === 404
        ? 'The RetroAchievements proxy is missing. Run the app with "npm run dev", "npm start" or on Netlify.'
        : `RetroAchievements returned an unexpected response (${res.status}).`,
    );
  }
  if (json.Success === false) throw new RaError(String(json.Error ?? 'RetroAchievements rejected the request.'));
  return json;
}

export const badgeUrl = (badge: string, locked = false) => `https://media.retroachievements.org/Badge/${badge}${locked ? '_lock' : ''}.png`;
export const gameIconUrl = (icon?: string) => (icon ? `https://media.retroachievements.org${icon.startsWith('/') ? '' : '/'}${icon}` : '');

export const ra = {
  async login(user: string, password: string, f?: typeof fetch): Promise<RaUser> {
    const j = await request({ r: 'login2', u: user, p: password }, f);
    return { user: String(j.User), token: String(j.Token), score: Number(j.Score ?? 0), avatar: j.AvatarUrl ? String(j.AvatarUrl) : undefined };
  },

  async resume(user: string, token: string, f?: typeof fetch): Promise<RaUser> {
    const j = await request({ r: 'login2', u: user, t: token }, f);
    return { user: String(j.User), token: String(j.Token ?? token), score: Number(j.Score ?? 0), avatar: j.AvatarUrl ? String(j.AvatarUrl) : undefined };
  },

  /** Game id for a disc hash (0 when the hash is unknown to RetroAchievements). */
  async gameIdForHash(hash: string, f?: typeof fetch): Promise<number> {
    const j = await request({ r: 'gameid', m: hash }, f);
    return Number(j.GameID ?? 0);
  },

  /** All Dreamcast games that have achievement sets: id → title. */
  async gameList(f?: typeof fetch): Promise<{ id: number; title: string }[]> {
    const j = await request({ r: 'officialgameslist', c: RA_DREAMCAST }, f);
    const resp = (j.Response ?? {}) as Record<string, string>;
    return Object.entries(resp).map(([id, title]) => ({ id: Number(id), title }));
  },

  async game(user: RaUser, gameId: number, f?: typeof fetch): Promise<RaGame> {
    const j = await request({ r: 'patch', u: user.user, t: user.token, g: gameId }, f);
    const p = (j.PatchData ?? {}) as Record<string, unknown>;
    const list = (p.Achievements ?? []) as Record<string, unknown>[];
    return {
      id: Number(p.ID ?? gameId),
      title: String(p.Title ?? ''),
      icon: p.ImageIcon ? String(p.ImageIcon) : undefined,
      richPresence: p.RichPresencePatch ? String(p.RichPresencePatch) : undefined,
      achievements: list.map((a) => ({
        id: Number(a.ID),
        title: String(a.Title ?? ''),
        description: String(a.Description ?? ''),
        points: Number(a.Points ?? 0),
        memAddr: String(a.MemAddr ?? ''),
        badge: String(a.BadgeName ?? '00000'),
        flags: Number(a.Flags ?? 3),
        type: (a.Type as string | null) ?? null,
      })),
    };
  },

  /** Achievement ids the user has already unlocked on RetroAchievements (read-only). */
  async officialUnlocks(user: RaUser, gameId: number, hardcore: boolean, f?: typeof fetch): Promise<number[]> {
    const j = await request({ r: 'unlocks', u: user.user, t: user.token, g: gameId, h: hardcore ? 1 : 0 }, f);
    return ((j.UserUnlocks ?? []) as number[]).map(Number);
  },
};

/** Fuzzy title match used when a disc can't be hashed (CHD/CDI): best RA game for a title. */
export function bestTitleMatch(title: string, games: { id: number; title: string }[]): { id: number; title: string } | null {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/\(.*?\)|\[.*?\]/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  const want = norm(title);
  if (!want) return null;
  const wantWords = new Set(want.split(' '));
  let best: { id: number; title: string } | null = null;
  let bestScore = 0;
  for (const g of games) {
    const n = norm(g.title);
    if (n === want) return g;
    const words = n.split(' ');
    const overlap = words.filter((w) => wantWords.has(w)).length;
    const score = overlap / Math.max(words.length, wantWords.size);
    if (score > bestScore) {
      bestScore = score;
      best = g;
    }
  }
  return bestScore >= 0.6 ? best : null;
}
