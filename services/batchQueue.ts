/**
 * Batch Queue — run many videos through the pipeline one after another.
 * Stored locally (browser) so no server cost. Each batch item keeps its
 * own progress state: queued → processing → done / failed.
 */

const LS_KEY = 'lumina_batch_queue';

export type BatchStatus = 'queued' | 'processing' | 'done' | 'failed';

export interface BatchItem {
  id: string;
  name: string;
  fileName: string;
  language: string;
  voice: string;
  fileRef?: File; // restored only in same session
  status: BatchStatus;
  error?: string;
  startedAt?: number;
  finishedAt?: number;
}

export const loadBatchQueue = (): BatchItem[] => {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export const saveBatchQueue = (items: BatchItem[]): void => {
  try {
    // keep the list bounded
    localStorage.setItem(LS_KEY, JSON.stringify(items.slice(0, 50)));
  } catch {
    // ignore
  }
};

export const addToBatch = (item: Omit<BatchItem, 'id' | 'status'>): BatchItem => {
  const items = loadBatchQueue();
  const full: BatchItem = { ...item, id: `batch-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, status: 'queued' };
  items.push(full);
  saveBatchQueue(items);
  return full;
};

export const updateBatchItem = (id: string, patch: Partial<BatchItem>): BatchItem | null => {
  const items = loadBatchQueue();
  const idx = items.findIndex(i => i.id === id);
  if (idx === -1) return null;
  items[idx] = { ...items[idx], ...patch };
  saveBatchQueue(items);
  return items[idx];
};

export const removeFromBatch = (id: string): void => {
  const items = loadBatchQueue().filter(i => i.id !== id);
  saveBatchQueue(items);
};

export const clearDoneBatchItems = (): void => {
  const items = loadBatchQueue().filter(i => i.status !== 'done');
  saveBatchQueue(items);
};
