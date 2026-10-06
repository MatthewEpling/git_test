// A tiny promise wrapper around IndexedDB: a few object stores keyed by string.

const DB_NAME = 'dreamport';
const DB_VERSION = 1;
export type StoreName = 'bios' | 'saves' | 'states' | 'library' | 'kv' | 'achievements';
const STORES: StoreName[] = ['bios', 'saves', 'states', 'library', 'kv', 'achievements'];

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        for (const s of STORES) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    dbPromise.catch(() => (dbPromise = null));
  }
  return dbPromise;
}

function run<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error ?? req.error);
        tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
      }),
  );
}

export const db = {
  get: <T>(store: StoreName, key: string) => run<T | undefined>(store, 'readonly', (s) => s.get(key) as IDBRequest<T | undefined>),
  set: (store: StoreName, key: string, value: unknown) => run(store, 'readwrite', (s) => s.put(value, key)).then(() => undefined),
  del: (store: StoreName, key: string) => run(store, 'readwrite', (s) => s.delete(key)).then(() => undefined),
  keys: (store: StoreName) => run(store, 'readonly', (s) => s.getAllKeys()).then((k) => k.map(String)),
  async entries<T>(store: StoreName, prefix = ''): Promise<[string, T][]> {
    const range = prefix ? IDBKeyRange.bound(prefix, `${prefix}￿`) : undefined;
    const [keys, values] = await Promise.all([
      run(store, 'readonly', (s) => s.getAllKeys(range)),
      run(store, 'readonly', (s) => s.getAll(range) as IDBRequest<T[]>),
    ]);
    return keys.map((k, i) => [String(k), values[i]]);
  },
  async clear(store: StoreName) {
    await run(store, 'readwrite', (s) => s.clear());
  },
};

/** Persistent key-value settings (small JSON values). */
export const kv = {
  get: <T>(key: string) => db.get<T>('kv', key).catch(() => undefined),
  set: (key: string, value: unknown) => db.set('kv', key, value).catch(() => undefined),
};

/** Asks the browser not to evict our storage (saves, BIOS, library) under pressure. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    return e ? { usage: e.usage ?? 0, quota: e.quota ?? 0 } : null;
  } catch {
    return null;
  }
}
