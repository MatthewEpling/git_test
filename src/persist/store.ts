// Browser persistence. Campaign saves and user content packs live in IndexedDB on this
// device only; nothing is sent anywhere. If IndexedDB is unavailable (private windows in
// some browsers), a memory store is used and the UI warns that saves won't survive a reload.
import type { Command } from '../engine/state';

export interface SaveRecord {
  id: string;
  name: string;
  seed: string;
  packId: string;
  packVersion: string;
  commands: Command[];
  createdAt: number;
  updatedAt: number;
  summary: string;
}

export interface PackRecord {
  id: string;
  name: string;
  version: string;
  importedAt: number;
  json: unknown;
}

type StoreName = 'saves' | 'packs';

interface Backend {
  get<T>(store: StoreName, id: string): Promise<T | undefined>;
  all<T>(store: StoreName): Promise<T[]>;
  put<T extends { id: string }>(store: StoreName, value: T): Promise<void>;
  remove(store: StoreName, id: string): Promise<void>;
}

function memoryBackend(): Backend {
  const data: Record<StoreName, Map<string, unknown>> = { saves: new Map(), packs: new Map() };
  return {
    async get(store, id) {
      return structuredClone(data[store].get(id)) as never;
    },
    async all(store) {
      return [...data[store].values()].map((v) => structuredClone(v)) as never;
    },
    async put(store, value) {
      data[store].set(value.id, structuredClone(value));
    },
    async remove(store, id) {
      data[store].delete(id);
    },
  };
}

function idbBackend(db: IDBDatabase): Backend {
  const tx = <T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) =>
    new Promise<T>((resolve, reject) => {
      const t = db.transaction(store, mode);
      const req = fn(t.objectStore(store));
      t.oncomplete = () => resolve(req.result);
      t.onerror = () => reject(t.error ?? req.error);
      t.onabort = () => reject(t.error ?? new Error('Storage transaction aborted'));
    });
  return {
    get: (store, id) => tx(store, 'readonly', (s) => s.get(id)) as never,
    all: (store) => tx(store, 'readonly', (s) => s.getAll()) as never,
    put: async (store, value) => {
      await tx(store, 'readwrite', (s) => s.put(value));
    },
    remove: async (store, id) => {
      await tx(store, 'readwrite', (s) => s.delete(id));
    },
  };
}

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB is not available'));
    const req = indexedDB.open('lantern-table', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('saves')) db.createObjectStore('saves', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('packs')) db.createObjectStore('packs', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Storage is blocked by another open tab'));
  });
}

export class Store {
  private constructor(
    private backend: Backend,
    readonly persistent: boolean,
    readonly problem: string | null,
  ) {}

  static async open(): Promise<Store> {
    try {
      return new Store(idbBackend(await openIdb()), true, null);
    } catch (e) {
      return new Store(memoryBackend(), false, `Browser storage isn't available (${(e as Error).message}). You can play, but saves will be lost when this tab closes. Use “Export save” to keep a copy.`);
    }
  }

  async saves() {
    const list = await this.backend.all<SaveRecord>('saves');
    return list.sort((a, b) => b.updatedAt - a.updatedAt);
  }
  save(id: string) {
    return this.backend.get<SaveRecord>('saves', id);
  }
  putSave(rec: SaveRecord) {
    return this.backend.put('saves', rec);
  }
  removeSave(id: string) {
    return this.backend.remove('saves', id);
  }
  packs() {
    return this.backend.all<PackRecord>('packs');
  }
  putPack(rec: PackRecord) {
    return this.backend.put('packs', rec);
  }
  removePack(id: string) {
    return this.backend.remove('packs', id);
  }
}

/** Offer a JSON file for download. */
export function downloadJson(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function readJsonFile(file: File): Promise<unknown> {
  return file.text().then((t) => {
    try {
      return JSON.parse(t);
    } catch {
      throw new Error(`${file.name} isn't valid JSON.`);
    }
  });
}
