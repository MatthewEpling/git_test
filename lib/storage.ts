"use client";
import { useCallback, useEffect, useState } from "react";
import type { HiscoresResult, Settings, WikiSyncData, QuestStatus } from "./types";

const key = (kind: string, rsn: string) => `ironnav:${kind}:${rsn.toLowerCase().replace(/[\s_-]+/g, " ").trim()}`;

function read<T>(k: string, fallback: T): T {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(k: string, v: unknown) {
  try {
    if (v === undefined || v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, JSON.stringify(v));
    window.dispatchEvent(new CustomEvent("ironnav-storage", { detail: k }));
  } catch {
    /* storage full or blocked — nothing to do */
  }
}

/** useState backed by localStorage, synced across components and tabs. */
export function useStored<T>(kind: string, rsn: string, fallback: T) {
  const k = key(kind, rsn);
  const [value, setValue] = useState<T>(fallback);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setValue(read(k, fallback));
    setLoaded(true);
    const onChange = (e: Event) => {
      const changed = e instanceof StorageEvent ? e.key : (e as CustomEvent).detail;
      if (changed === k) setValue(read(k, fallback));
    };
    window.addEventListener("ironnav-storage", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("ironnav-storage", onChange);
      window.removeEventListener("storage", onChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k]);

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      const resolved = typeof next === "function" ? (next as (p: T) => T)(read(k, fallback)) : next;
      write(k, resolved);
      setValue(resolved);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [k],
  );
  return [value, set, loaded] as const;
}

export const DEFAULT_SETTINGS: Settings = {
  accountType: "ironman",
  membership: "p2p",
  playstyle: "balanced",
  hoursPerDay: 2,
  goal: "whats_next",
};

export const useSettings = (rsn: string) => useStored<Settings | null>("settings", rsn, null);
export const useSync = (rsn: string) => useStored<WikiSyncData | null>("wikisync", rsn, null);
export const useHiscoreCache = (rsn: string) => useStored<HiscoresResult | null>("hiscores", rsn, null);
/** Step ids the player ticked by hand */
export const useChecked = (rsn: string) => useStored<Record<string, boolean>>("checked", rsn, {});
/** stepId of branch point → chosen option index */
export const useBranches = (rsn: string) => useStored<Record<string, number>>("branches", rsn, {});
/** Manual-mode quest/diary/unlock state (when not using WikiSync) */
export type ManualState = {
  quests: Record<string, QuestStatus>;
  diaries: Record<string, boolean>; // "Ardougne Easy"
  unlocks: Record<string, boolean>; // unlock id → owned
  shipTier?: string;
};
export const useManual = (rsn: string) =>
  useStored<ManualState>("manual", rsn, { quests: {}, diaries: {}, unlocks: {} });

export function rememberRecent(rsn: string, type: string) {
  try {
    const list = read<{ rsn: string; type: string }[]>("ironnav:recent", []).filter(
      (x) => x.rsn.toLowerCase() !== rsn.toLowerCase(),
    );
    list.unshift({ rsn, type });
    localStorage.setItem("ironnav:recent", JSON.stringify(list.slice(0, 5)));
  } catch {}
}
export const readRecent = () => read<{ rsn: string; type: string }[]>("ironnav:recent", []);
