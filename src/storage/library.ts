// The game library: files the user chose to keep live in the browser's private file
// system (OPFS, which handles multi-gigabyte files), metadata in IndexedDB. Nothing ever
// leaves the device.

import { db } from './db';
import type { GameFormat, GameSet } from '../content/files';

export interface LibraryGame {
  id: string;
  title: string;
  format: GameFormat;
  mainFile: string;
  files: { name: string; size: number }[];
  totalSize: number;
  addedAt: number;
  lastPlayed?: number;
  playSeconds?: number;
  productNumber?: string;
  region?: string;
  raHash?: string | null;
  raGameId?: number;
}

export function libraryAvailable(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.storage?.getDirectory && 'createWritable' in (globalThis.FileSystemFileHandle?.prototype ?? {});
}

async function gamesDir(create = true) {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle('games', { create });
}

export async function listGames(): Promise<LibraryGame[]> {
  const entries = await db.entries<LibraryGame>('library').catch(() => []);
  return entries.map(([, g]) => g).sort((a, b) => (b.lastPlayed ?? b.addedAt) - (a.lastPlayed ?? a.addedAt));
}

export async function getGame(id: string) {
  return db.get<LibraryGame>('library', id);
}

export async function updateGame(id: string, patch: Partial<LibraryGame>) {
  const g = await getGame(id);
  if (g) await db.set('library', id, { ...g, ...patch });
}

export function newGameId() {
  return `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Copies a game's files into the library. Reports progress as 0..1. */
export async function addGame(game: GameSet, meta: Partial<LibraryGame>, onProgress?: (p: number) => void): Promise<LibraryGame> {
  const id = meta.id ?? newGameId();
  const dir = await (await gamesDir()).getDirectoryHandle(id, { create: true });
  const total = game.files.reduce((n, f) => n + f.size, 0);
  let done = 0;
  try {
    for (const f of game.files) {
      const handle = await dir.getFileHandle(f.name, { create: true });
      const writable = await handle.createWritable();
      const reader = f.stream().getReader();
      for (;;) {
        const { done: end, value } = await reader.read();
        if (end) break;
        await writable.write(value);
        done += value.length;
        onProgress?.(total ? done / total : 1);
      }
      await writable.close();
    }
  } catch (e) {
    await (await gamesDir()).removeEntry(id, { recursive: true }).catch(() => undefined);
    throw e;
  }
  const entry: LibraryGame = {
    id,
    title: meta.title ?? game.name,
    format: game.format,
    mainFile: game.main.name,
    files: game.files.map((f) => ({ name: f.name, size: f.size })),
    totalSize: total,
    addedAt: Date.now(),
    ...meta,
  };
  await db.set('library', id, entry);
  return entry;
}

/** Opens a library game's files (as File objects backed by OPFS). */
export async function gameFiles(game: LibraryGame): Promise<File[]> {
  const dir = await (await gamesDir(false)).getDirectoryHandle(game.id);
  return Promise.all(game.files.map(async (f) => (await dir.getFileHandle(f.name)).getFile()));
}

export async function removeGame(id: string) {
  await (await gamesDir(false).catch(() => null))?.removeEntry(id, { recursive: true }).catch(() => undefined);
  await db.del('library', id);
}
