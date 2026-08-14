/**
 * Offline-first history cache — IndexedDB-backed store for recent task history.
 * Used by RecentHistory so module work is recoverable even after localStorage
 * limits, incognito resets, or Supabase downtime. Falls back to an in-memory
 * store if IndexedDB is unavailable.
 */

const DB_NAME = 'lumina-history';
const DB_VERSION = 1;
const STORE = 'records';
const MAX_PER_MODULE = 20;
const MAX_TOTAL = 300;

export interface CachedRecord {
  id: string;
  module: string;
  createdAt: number;
  input: unknown;
  output?: unknown;
}

let dbPromise: Promise<IDBDatabase> | null = null;
let memoryStore: CachedRecord[] = [];
let idbAvailable = typeof window !== 'undefined' && !!window.indexedDB;

const openDb = (): Promise<IDBDatabase> => {
  if (!idbAvailable) throw new Error('IndexedDB unavailable');
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
};

const idbOp = async <T>(fn: (db: IDBDatabase) => IDBRequest<T>): Promise<T | null> => {
  if (!idbAvailable) return null;
  try {
    const db = await openDb();
    return await new Promise<T | null>((resolve) => {
      const req = fn(db);
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
};

// ---- public API ----

export const putRecord = async (record: CachedRecord): Promise<void> => {
  await idbOp(db => db.transaction(STORE, 'readwrite').objectStore(STORE).put(record));
  memoryStore = [record, ...memoryStore.filter(r => r.id !== record.id)].slice(0, MAX_TOTAL);
};

export const getRecent = async (module: string | string[], limit = 8): Promise<CachedRecord[]> => {
  // In-memory read path first (mirrors the last writes)
  const modules = Array.isArray(module) ? module : [module];
  const fromMemory = memoryStore
    .filter(r => modules.includes(r.module))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
  if (fromMemory.length > 0) return fromMemory;

  const all = await idbOp<CachedRecord[]>(db => {
    return db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
  });
  if (!all) return [];
  // prune on read: keep within limits
  const sorted = all.sort((a, b) => b.createdAt - a.createdAt);
  const kept = sorted.slice(0, MAX_TOTAL);
  if (kept.length !== all.length) {
    await idbOp(db => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      all.slice(MAX_TOTAL).forEach(r => store.delete(r.id));
      return store.getAllKeys();
    });
  }
  return kept.filter(r => modules.includes(r.module)).slice(0, limit);
};

export const removeRecord = async (id: string): Promise<void> => {
  await idbOp(db => db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id));
  memoryStore = memoryStore.filter(r => r.id !== id);
};

export const clearModule = async (module: string): Promise<void> => {
  const all = await idbOp<CachedRecord[]>(db => db.transaction(STORE, 'readonly').objectStore(STORE).getAll());
  if (all && all.length > 0) {
    await idbOp(db => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      all.filter(r => r.module === module).forEach(r => store.delete(r.id));
      return store.get(all[0].id);
    });
  }
  memoryStore = memoryStore.filter(r => r.module !== module);
};

export const isIndexedDBAvailable = () => idbAvailable;
