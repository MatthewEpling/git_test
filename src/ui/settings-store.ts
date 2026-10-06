// React hook around the persisted app settings.
import { useCallback, useEffect, useState } from 'react';
import { loadSettings, saveSettings, type AppSettings } from '../storage/settings';

type Updater = (s: AppSettings) => AppSettings;

let current = loadSettings();
const listeners = new Set<(s: AppSettings) => void>();

export function getSettings() {
  return current;
}

export function updateSettings(fn: Updater) {
  current = fn(current);
  saveSettings(current);
  listeners.forEach((l) => l(current));
}

export function useSettings(): [AppSettings, (fn: Updater) => void] {
  const [s, set] = useState(current);
  useEffect(() => {
    listeners.add(set);
    return () => void listeners.delete(set);
  }, []);
  return [s, useCallback(updateSettings, [])];
}
