// Cache of the core's option definitions and controller types, so settings can be shown
// from the home screen (they are only known once the core has booted).
import type { ControllerType, CoreOption, CoreOptionCategory } from '../emu/core';

export interface OptionDefs {
  options: CoreOption[];
  categories: CoreOptionCategory[];
  controllerTypes: ControllerType[];
  coreVersion: string;
}

const KEY = 'dreamport:core-option-defs:v1';

export function loadOptionDefs(): OptionDefs | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as OptionDefs) : null;
  } catch {
    return null;
  }
}

export function saveOptionDefs(d: OptionDefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    // ignore
  }
}
