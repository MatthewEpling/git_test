// The signed-in RetroAchievements account (token only; passwords are never stored).
import { useEffect, useState } from 'react';
import { kv } from '../storage/db';
import type { RaUser } from './ra';

const KEY = 'ra:user';
let current: RaUser | null = null;
let loaded: Promise<void> | null = null;
const listeners = new Set<(u: RaUser | null) => void>();

export function loadAccount(): Promise<RaUser | null> {
  if (!loaded) loaded = kv.get<RaUser>(KEY).then((u) => void (current = u ?? null));
  return loaded.then(() => current);
}

export async function setAccount(u: RaUser | null) {
  current = u;
  await kv.set(KEY, u);
  listeners.forEach((l) => l(u));
}

export function useAccount(): RaUser | null {
  const [u, set] = useState(current);
  useEffect(() => {
    listeners.add(set);
    void loadAccount().then(set);
    return () => void listeners.delete(set);
  }, []);
  return u;
}
