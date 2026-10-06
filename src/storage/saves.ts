// Memory-card (VMU) and flash saves, plus save states.
//
// Flycast writes VMU and system flash files into its save directory. We mirror that
// directory into IndexedDB: restored before a game boots, synced while it runs.

import { db } from './db';

export interface SaveFileRecord {
  path: string;
  data: Uint8Array;
  updatedAt: number;
}

export async function loadSaveFiles(): Promise<SaveFileRecord[]> {
  const entries = await db.entries<SaveFileRecord>('saves').catch(() => []);
  return entries.map(([, v]) => v);
}

export async function storeSaveFile(path: string, data: Uint8Array) {
  await db.set('saves', path, { path, data, updatedAt: Date.now() } satisfies SaveFileRecord);
}

export async function deleteSaveFile(path: string) {
  await db.del('saves', path);
}

// ───────────────────────── Save states ─────────────────────────

export interface SaveState {
  gameKey: string;
  slot: number;
  /** gzip-compressed core state. */
  data: Uint8Array;
  rawSize: number;
  thumbnail: string;
  createdAt: number;
}

export type SaveStateMeta = Omit<SaveState, 'data'>;

export const STATE_SLOTS = 9;
const stateKey = (gameKey: string, slot: number) => `${gameKey}#${slot}`;

async function transform(data: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([data as BlobPart]).stream().pipeThrough(stream as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export async function writeState(gameKey: string, slot: number, raw: Uint8Array, thumbnail: string) {
  const data = await transform(raw, new CompressionStream('gzip'));
  const state: SaveState = { gameKey, slot, data, rawSize: raw.length, thumbnail, createdAt: Date.now() };
  await db.set('states', stateKey(gameKey, slot), state);
  return state;
}

export async function readState(gameKey: string, slot: number): Promise<Uint8Array | null> {
  const s = await db.get<SaveState>('states', stateKey(gameKey, slot));
  if (!s) return null;
  return transform(s.data, new DecompressionStream('gzip'));
}

export async function listStates(gameKey: string): Promise<SaveStateMeta[]> {
  const entries = await db.entries<SaveState>('states', `${gameKey}#`).catch(() => []);
  return entries.map(([, s]) => {
    const { data: _d, ...meta } = s;
    void _d;
    return meta;
  });
}

export async function deleteState(gameKey: string, slot: number) {
  await db.del('states', stateKey(gameKey, slot));
}

/** Raw state bytes for export, or import of a state file the user picked. */
export async function exportState(gameKey: string, slot: number) {
  return readState(gameKey, slot);
}
