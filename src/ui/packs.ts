// Content packs available to this browser: the original stand-in pack that ships with the
// app, plus packs the player imported from their own materials (kept in IndexedDB only).
import builtinJson from '../content/standin/pack.json';
import { loadPack } from '../content/validate';
import { Content } from '../engine/core';
import type { PackRecord, Store } from '../persist/store';

export interface PackEntry {
  id: string;
  name: string;
  version: string;
  source: 'original-standin' | 'user-provided';
  content: Content | null;
  errors: string[];
  warnings: string[];
}

export const BUILTIN_PACK_JSON = builtinJson;

function entryFrom(json: unknown, fallbackId: string, fallbackName: string): PackEntry {
  const r = loadPack(json);
  if (!r.ok) return { id: fallbackId, name: fallbackName, version: '?', source: 'user-provided', content: null, errors: r.errors, warnings: [] };
  return { id: r.pack.meta.id, name: r.pack.meta.name, version: r.pack.meta.version, source: r.pack.meta.source, content: new Content(r.pack), errors: [], warnings: r.warnings };
}

export async function loadPacks(store: Store): Promise<PackEntry[]> {
  const builtin = entryFrom(builtinJson, 'ashen-proving', 'Ashen Proving');
  const user = (await store.packs()).map((p: PackRecord) => entryFrom(p.json, p.id, p.name));
  return [builtin, ...user];
}

/** Validate an imported file and keep it. User packs are always marked user-provided. */
export async function importPack(store: Store, json: unknown): Promise<PackEntry> {
  const marked = typeof json === 'object' && json && 'meta' in json ? { ...json, meta: { ...(json as { meta: object }).meta, source: 'user-provided' } } : json;
  const entry = entryFrom(marked, 'invalid', 'Invalid pack');
  if (entry.content) {
    if (entry.id === 'ashen-proving') {
      return { ...entry, content: null, errors: ['This pack uses the id "ashen-proving", which belongs to the built-in stand-in pack. Give your pack its own meta.id.'] };
    }
    await store.putPack({ id: entry.id, name: entry.name, version: entry.version, importedAt: Date.now(), json: marked });
  }
  return entry;
}
