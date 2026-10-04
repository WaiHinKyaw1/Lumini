/**
 * Module History Service
 * Stores the last 3 output records per module in Supabase (cloud)
 * with instant local cache (localStorage) for offline/instant load.
 */

import { supabase, isSupabaseConfigured, logGeneration, fetchModuleLogs } from './supabase';
import { auth } from './firebase';

export interface ModuleHistoryRecord {
  id: string;
  module: 'subtitle' | 'recap' | 'insights' | 'transcription' | 'thumbnail' | 'voiceover';
  title: string;
  timestamp: number;
  input?: Record<string, unknown> | string;
  outputType: 'text' | 'srt' | 'image' | 'audio' | 'recap';
  outputData: string; // The raw output (text, srt, base64 data-url, audio data-url, etc.)
  extra?: Record<string, unknown>;
}

const STORAGE_PREFIX = 'lumini_module_history_';
export const MAX_HISTORY_ITEMS = 3;

/** Get immediately from local storage (synchronous) */
export function getLocalModuleHistory(module: string): ModuleHistoryRecord[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${module}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, MAX_HISTORY_ITEMS) : [];
  } catch {
    return [];
  }
}

/** Save to local cache */
function setLocalModuleHistory(module: string, records: ModuleHistoryRecord[]): void {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${module}`, JSON.stringify(records.slice(0, MAX_HISTORY_ITEMS)));
  } catch {
    // Ignore storage limit
  }
}

const MODULE_ALIASES: Record<string, string[]> = {
  subtitle: ['subtitle', 'subtitle_studio'],
  recap: ['recap', 'movie_recap'],
  insights: ['insights', 'recap_insights', 'video_insights'],
  transcription: ['transcription'],
  thumbnail: ['thumbnail', 'thumbnail_gen'],
  voiceover: ['voiceover', 'voiceover_studio']
};

/**
 * Fetch latest 3 records from Supabase, syncing with local cache.
 */
export async function fetchModuleHistory(module: string): Promise<ModuleHistoryRecord[]> {
  const local = getLocalModuleHistory(module);
  const user = auth.currentUser;

  if (!user || !supabase || !isSupabaseConfigured) {
    return local;
  }

  try {
    const modulesToQuery = MODULE_ALIASES[module] || [module];
    const logs = await fetchModuleLogs(user.uid, modulesToQuery);
    if (!logs || logs.length === 0) {
      return local;
    }

    const cloudRecords: ModuleHistoryRecord[] = logs.slice(0, MAX_HISTORY_ITEMS).map((log) => {
      let outputPayload: Record<string, unknown> = {};
      try {
        outputPayload = typeof log.output_data === 'string' ? JSON.parse(log.output_data) : (log.output_data || {});
      } catch {
        outputPayload = { data: String(log.output_data || '') };
      }

      let inputPayload: Record<string, unknown> = {};
      try {
        inputPayload = typeof log.input_data === 'string' ? JSON.parse(log.input_data) : (log.input_data || {});
      } catch {
        inputPayload = { text: String(log.input_data || '') };
      }

      return {
        id: log.id || String(log.created_at || Math.random()),
        module: log.module as ModuleHistoryRecord['module'],
        title: String(outputPayload.title || inputPayload.fileName || inputPayload.topic || inputPayload.title || 'Task Record'),
        timestamp: log.created_at ? new Date(log.created_at).getTime() : Date.now(),
        input: inputPayload,
        outputType: (outputPayload.type as ModuleHistoryRecord['outputType']) || 'text',
        outputData: String(outputPayload.data || outputPayload.text || log.output_data || ''),
        extra: (outputPayload.extra as Record<string, unknown>) || undefined,
      };
    });

    // Merge cloud and local, keep newest 3
    const mergedMap = new Map<string, ModuleHistoryRecord>();
    for (const r of [...cloudRecords, ...local]) {
      if (!mergedMap.has(r.id)) {
        mergedMap.set(r.id, r);
      }
    }

    const merged = Array.from(mergedMap.values())
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, MAX_HISTORY_ITEMS);

    setLocalModuleHistory(module, merged);
    return merged;
  } catch (err) {
    console.warn('Failed to fetch module history from Supabase:', err);
    return local;
  }
}

/**
 * Save new output record to Supabase and local cache.
 */
export async function saveModuleHistory(
  record: Omit<ModuleHistoryRecord, 'id' | 'timestamp'> & { id?: string; timestamp?: number }
): Promise<void> {
  const fullRecord: ModuleHistoryRecord = {
    ...record,
    id: record.id || Math.random().toString(36).slice(2, 10),
    timestamp: record.timestamp || Date.now(),
  };

  // 1. Immediately update local storage
  const local = getLocalModuleHistory(record.module);
  const updatedLocal = [fullRecord, ...local.filter(item => item.id !== fullRecord.id)].slice(0, MAX_HISTORY_ITEMS);
  setLocalModuleHistory(record.module, updatedLocal);

  window.dispatchEvent(new CustomEvent('lumini:historyUpdated', { detail: { module: record.module } }));

  // 2. Persist to Supabase if logged in
  const user = auth.currentUser;
  if (user && supabase && isSupabaseConfigured) {
    try {
      await logGeneration(
        user.uid,
        user.email || '',
        record.module,
        typeof record.input === 'object' ? record.input : { text: String(record.input || '') },
        {
          type: record.outputType,
          data: record.outputData,
          title: record.title,
          extra: record.extra || {}
        }
      );
    } catch (e) {
      console.warn('Supabase log generation failed:', e);
    }
  }
}

export function clearModuleHistory(module: string): void {
  try {
    localStorage.removeItem(`${STORAGE_PREFIX}${module}`);
    window.dispatchEvent(new CustomEvent('lumini:historyUpdated', { detail: { module } }));
  } catch {
    // Ignore
  }
}
