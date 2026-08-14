import React, { useState, useEffect } from 'react';
import { fetchModuleLogs, GenerationRecord } from '../services/supabase';
import { auth } from '../services/firebase';
import { toast } from 'react-hot-toast';
import { getRecent, putRecord, isIndexedDBAvailable } from '../services/historyCache';
import { Clock, Undo2, Loader2 } from 'lucide-react';
import { Skeleton } from './Skeleton';

const LOCAL_KEY = 'lumini_recent_history';
const MAX_LOCAL_ITEMS = 20;

export interface HistoryRecord {
  id?: string; // Supabase id (if cloud-synced)
  module: string;
  createdAt: string;
  input: any;
  output?: any;
}

interface RecentHistoryProps {
  moduleName: string | string[];
  /** Called with a history record's input data when the user clicks "Use again" */
  onRestore: (input: any) => void;
  restoreLabel?: string;
  burmeseRestoreLabel?: string;
}

/**
 * RecentHistory — a lightweight "recent tasks" panel rendered inline in each module.
 * Dual storage strategy:
 *  - Supabase (cloud) is the source of truth when available
 *  - localStorage keeps history available offline / before cloud logs are fetched
 */
export const RecentHistory: React.FC<RecentHistoryProps> = ({
  moduleName,
  onRestore,
  restoreLabel = 'Use Again',
  burmeseRestoreLabel = 'ပြန်သုံးမည်',
}) => {
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  // ---- Local (offline) persistence helpers ----
  const readLocal = (): HistoryRecord[] => {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      if (!raw) return [];
      const all: Record<string, HistoryRecord[]> = JSON.parse(raw);
      // moduleName can be a single string or a joined multi-module key; normalize to array
      const keys = Array.isArray(moduleName) ? moduleName : [moduleName];
      return keys.flatMap((k) => all[k] || []);
    } catch {
      return [];
    }
  };

  const writeLocal = (byModule: Record<string, HistoryRecord[]>) => {
    try {
      const existing: Record<string, HistoryRecord[]> = JSON.parse(
        localStorage.getItem(LOCAL_KEY) || '{}'
      );
      localStorage.setItem(LOCAL_KEY, JSON.stringify({ ...existing, ...byModule }));
    } catch {
      // storage unavailable — ignore
    }
  };

  // ---- Load records (cloud preferred, offline cache fallback) ----
  const loadData = async () => {
    const user = auth.currentUser;
    setLoading(true);
    try {
      if (user) {
        const cloud = await fetchModuleLogs(user.uid, moduleName);
        if (cloud && cloud.length > 0) {
          const parsed = cloud.map((l) => toRecord(l));
          setRecords(parsed);
          // Backfill both localStorage and the offline-first IndexedDB cache
          const byModule: Record<string, HistoryRecord[]> = {};
          if (Array.isArray(moduleName)) {
            moduleName.forEach((m) => {
              byModule[m] = parsed.filter((r) => r.module === m).slice(0, MAX_LOCAL_ITEMS);
            });
          } else {
            byModule[moduleName] = parsed.slice(0, MAX_LOCAL_ITEMS);
          }
          writeLocal(byModule);
          for (const rec of parsed) {
            await putRecord({ id: `cloud-${rec.id || rec.createdAt}`, module: rec.module, createdAt: new Date(rec.createdAt).getTime(), input: rec.input, output: rec.output });
          }
          setLoading(false);
          return;
        }
      }
      // Cloud returned nothing (or logged-out) → offline-first IndexedDB cache, then localStorage
      if (isIndexedDBAvailable()) {
        const cached = await getRecent(moduleName, MAX_LOCAL_ITEMS);
        if (cached.length > 0) {
          setRecords(cached.map((c) => ({ id: c.id, module: c.module, createdAt: new Date(c.createdAt).toISOString(), input: c.input, output: c.output })));
          setLoading(false);
          return;
        }
      }
      setRecords(readLocal());
    } catch {
      setRecords(readLocal());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [JSON.stringify(moduleName)]);

  // Listen for a custom DOM event that pages dispatch after a successful logGeneration
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { module: string; input: any; output?: any };
      if (!detail || !detail.module) return;
      const keys = Array.isArray(moduleName) ? moduleName : [moduleName];
      if (!keys.includes(detail.module)) return;
      const rec: HistoryRecord = {
        module: detail.module,
        createdAt: new Date().toISOString(),
        input: detail.input,
        output: detail.output,
      };
      setRecords((prev) => [rec, ...prev].slice(0, MAX_LOCAL_ITEMS));
      writeLocal({ [detail.module]: [rec] });
      if (isIndexedDBAvailable()) {
        putRecord({ id: `local-${rec.module}-${rec.createdAt}-${Math.random().toString(36).slice(2, 7)}`, module: rec.module, createdAt: Date.now(), input: rec.input, output: rec.output });
      }
      loadData();
    };
    window.addEventListener('lumini:taskLogged', handler);
    return () => window.removeEventListener('lumini:taskLogged', handler);
  }, [JSON.stringify(moduleName)]);

  const toRecord = (log: GenerationRecord): HistoryRecord => ({
    id: log.id,
    module: log.module,
    createdAt: log.created_at || new Date().toISOString(),
    input: safeJson(log.input_data),
    output: safeJson(log.output_data),
  });

  const safeJson = (data: any): any => {
    if (data == null) return data;
    if (typeof data !== 'string') return data;
    try {
      return JSON.parse(data);
    } catch {
      return data;
    }
  };

  const getModuleTitle = (mod: string): string => {
    switch (mod) {
      case 'voiceover': return 'Voiceover';
      case 'translation': return 'Translation';
      case 'transcription': return 'Transcription';
      case 'movierecap': return 'Movie Recap';
      case 'thumbnail': return 'Thumbnail';
      case 'subtitles': return 'Subtitle Studio';
      default: return mod.toUpperCase();
    }
  };

  const getInputSummary = (input: any): string => {
    if (!input) return 'No input data';
    const src = typeof input === 'string' ? input : JSON.stringify(input);
    return src.length > 70 ? src.slice(0, 70) + '…' : src;
  };

  const handleRestore = (rec: HistoryRecord) => {
    setRestoringId(rec.id || rec.createdAt);
    try {
      onRestore(rec.input);
      toast.success(`${restoreLabel} — ${burmeseRestoreLabel}`);
    } catch {
      toast.error('Failed to restore inputs.');
    } finally {
      setRestoringId(null);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl bg-zinc-950/60 border border-white/5 overflow-hidden" aria-label="မကြာသေးမီ လုပ်ဆောင်ချက်များ တင်နေပါသည်" aria-busy="true" role="status">
        <Skeleton className="h-9 rounded-none border-b border-white/5" />
        <div className="px-4 py-3 space-y-2.5">
          <Skeleton className="h-7 w-full" />
          <Skeleton className="h-7 w-5/6" />
        </div>
      </div>
    );
  }

  if (records.length === 0) return null;

  return (
    <div className="rounded-2xl bg-zinc-950/60 border border-white/5 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5">
        <Clock className="w-3.5 h-3.5 text-accent" />
        <span className="text-[11px] font-black uppercase tracking-widest text-white">
          Recent Tasks — မကြာသေးမီ လုပ်ဆောင်ချက်များ
        </span>
      </div>
      <div className="divide-y divide-white/5 max-h-64 overflow-y-auto">
        {records.map((rec) => {
          const key = rec.id || rec.createdAt;
          const isRestoring = restoringId === key;
          return (
            <div
              key={key}
              className="px-4 py-3 flex items-center gap-3 hover:bg-white/[0.03] transition-colors"
            >
              <span className="text-[9px] font-bold uppercase tracking-wider text-accent shrink-0">
                {getModuleTitle(rec.module)}
              </span>
              <span className="flex-1 text-[11px] text-zinc-300 font-mono truncate" title={JSON.stringify(rec.input)}>
                {getInputSummary(rec.input)}
              </span>
              <span className="text-[9px] text-zinc-500 shrink-0 hidden sm:block">
                {rec.createdAt ? new Date(rec.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
              </span>
              <button
                type="button"
                onClick={() => handleRestore(rec)}
                disabled={isRestoring}
                aria-label={isRestoring ? `ပြန်လည်ထည့်သွင်းနေပါသည် (${getModuleTitle(rec.module)})` : `${burmeseRestoreLabel} (${getModuleTitle(rec.module)})`}
                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-accent/10 hover:bg-accent/20 border border-accent/20 text-accent text-[10px] font-black uppercase tracking-wider transition-all disabled:opacity-50"
              >
                {isRestoring ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Undo2 className="w-3 h-3" />
                )}
                {restoreLabel}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/** Helper that pages can call after logGeneration to make this panel update instantly */
export function notifyTaskLogged(module: string, input: any, output?: any) {
  window.dispatchEvent(
    new CustomEvent('lumini:taskLogged', { detail: { module, input, output } })
  );
}
