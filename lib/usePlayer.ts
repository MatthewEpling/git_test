"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AccountType, HiscoresResult } from "./types";
import { useHiscoreCache, useManual, useSettings, useSync } from "./storage";
import { buildAccount } from "./account";

/** Everything a player page needs: cached hiscores, settings, synced/manual data, and the merged Account. */
export function usePlayer(rsn: string, typeFromUrl?: string | null) {
  const [settings, setSettings, settingsLoaded] = useSettings(rsn);
  const [sync, setSync] = useSync(rsn);
  const [manual, setManual] = useManual(rsn);
  const [cached, setCached, cacheLoaded] = useHiscoreCache(rsn);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const type: AccountType = (typeFromUrl as AccountType) || settings?.accountType || cached?.requestedType || "ironman";

  const refresh = useCallback(
    async (force = false) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/hiscores?rsn=${encodeURIComponent(rsn)}&type=${type}${force ? "&refresh=1" : ""}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || `Error ${res.status}`);
        setCached(json as HiscoresResult);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    },
    [rsn, type, setCached],
  );

  // Fetch on first load if we have nothing, the cache is >10 min old, or the account type changed.
  useEffect(() => {
    if (!cacheLoaded || !settingsLoaded) return;
    const stale = !cached || Date.now() - new Date(cached.fetchedAt).getTime() > 10 * 60 * 1000 || cached.requestedType !== type;
    if (stale) refresh(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheLoaded, settingsLoaded, type]);

  const account = useMemo(() => buildAccount(rsn, cached, sync, manual), [rsn, cached, sync, manual]);

  return {
    rsn,
    type,
    settings,
    setSettings,
    settingsLoaded,
    sync,
    setSync,
    manual,
    setManual,
    hiscores: cached,
    account,
    loading,
    error,
    refresh,
  };
}
