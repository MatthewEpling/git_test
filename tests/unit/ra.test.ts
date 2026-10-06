import { describe, expect, it, vi } from 'vitest';
import { bestTitleMatch, ra, RaError } from '../../src/achievements/ra';

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));

describe('RetroAchievements client', () => {
  it('logs in and loads a game patch', async () => {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      const p = new URLSearchParams(String(init?.body));
      if (p.get('r') === 'login2') return json({ Success: true, User: 'ana', Token: 'tok', Score: 10 });
      if (p.get('r') === 'patch') return json({ Success: true, PatchData: { ID: 7, Title: 'Game', Achievements: [{ ID: 1, Title: 'First', Description: 'Do it', Points: 5, MemAddr: '0xH0001=1', BadgeName: '123', Flags: 3 }] } });
      return json({ Success: false, Error: 'nope' });
    });
    const user = await ra.login('ana', 'pw', fetchMock as unknown as typeof fetch);
    expect(user).toMatchObject({ user: 'ana', token: 'tok' });
    const game = await ra.game(user, 7, fetchMock as unknown as typeof fetch);
    expect(game.achievements[0]).toMatchObject({ id: 1, memAddr: '0xH0001=1', points: 5, flags: 3 });
    await expect(ra.gameIdForHash('x', fetchMock as unknown as typeof fetch)).rejects.toBeInstanceOf(RaError);
  });

  it('explains a missing proxy', async () => {
    const f = () => Promise.resolve(new Response('<html>', { status: 404 }));
    await expect(ra.gameList(f as unknown as typeof fetch)).rejects.toThrow(/proxy/);
  });

  it('matches titles loosely', () => {
    const games = [
      { id: 1, title: 'Sonic Adventure' },
      { id: 2, title: 'Sonic Adventure 2' },
      { id: 3, title: 'Crazy Taxi' },
    ];
    expect(bestTitleMatch('SONIC ADVENTURE 2', games)?.id).toBe(2);
    expect(bestTitleMatch('Crazy Taxi (USA)', games)?.id).toBe(3);
    expect(bestTitleMatch('Shenmue', games)).toBeNull();
  });
});
