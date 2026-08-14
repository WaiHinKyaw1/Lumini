import React, { useState, useEffect } from 'react';
import { fetchModuleLogs, deleteRecord, GenerationRecord } from '../services/supabase';
import { auth } from '../services/firebase';
import { toast } from 'react-hot-toast';

interface ModuleLogHistoryProps {
  moduleName: string | string[];
  title?: string;
  burmeseTitle?: string;
  refreshTrigger?: any; // Allows outer component to trigger reload on action completion
}

export const ModuleLogHistory: React.FC<ModuleLogHistoryProps> = ({
  moduleName,
  title = "Past Activity Records",
  burmeseTitle = "ယခင်လုပ်ဆောင်မှု မှတ်တမ်းများ",
  refreshTrigger
}) => {
  const [logs, setLogs] = useState<GenerationRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadData = async () => {
    const user = auth.currentUser;
    if (!user) return;
    
    setLoading(true);
    try {
      const fetched = await fetchModuleLogs(user.uid, moduleName);
      setLogs(fetched);
    } catch (e) {
      console.error("Failed to load module-specific logs:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [JSON.stringify(moduleName), refreshTrigger]);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!window.confirm("သေချာပါသလား? ဤသတင်းအချက်အလက်ကို ဖျက်ပါမည်။\n(Are you sure you want to delete this record?)")) {
      return;
    }

    try {
      const success = await deleteRecord(id);
      if (success) {
        toast.success("မှတ်တမ်းကို အောင်မြင်စွာ ဖျက်ပြီးပါပြီ (Record deleted)");
        setLogs((prev) => prev.filter((item) => item.id !== id));
      } else {
        toast.error("ဖျက်ရန် အဆင်မပြေပါ (Failed to delete)");
      }
    } catch (error: any) {
      toast.error(error.message || "Error deleting log");
    }
  };

  const getModuleTitle = (mod: string) => {
    switch (mod) {
      case 'voiceover': return 'Voice Synthesis';
      case 'translation': return 'Translator';
      case 'transcription': return 'Transcription';
      case 'recap_insights': return 'AI Video Recapper';
      case 'thumbnail': return 'Thumbnail Generator';
      case 'subtitles': return 'Subtitle Studio';
      case 'videostudio_transcribe': return 'Video Studio - Transcribe';
      case 'videostudio_translate': return 'Video Studio - Translate';
      case 'videostudio_voiceover': return 'Video Studio - Voice';
      default: return mod.toUpperCase();
    }
  };

  if (logs.length === 0 && !loading) {
    return null; // Don't clutter the page if there are no records
  }

  return (
    <div className="mt-12 pt-10 border-t border-white/10 space-y-6">
      <div className="flex justify-between items-center px-1">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-accent rounded-full animate-pulse"></span>
            <h3 className="text-sm font-black text-white uppercase tracking-wider">
              {burmeseTitle}
            </h3>
          </div>
          <p className="text-[9px] text-zinc-500 uppercase tracking-widest">
            {title} — Connected to Supabase real-time sync
          </p>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="p-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-zinc-400 hover:text-white transition-all disabled:opacity-50"
          title="Refresh History Logs"
        >
          <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H17" />
          </svg>
        </button>
      </div>

      <div className="space-y-3">
        {logs.map((log) => {
          const isExpanded = expandedId === log.id;
          let inputObj: any = null;
          let outputObj: any = null;
          try {
            inputObj = JSON.parse(log.input_data);
          } catch (_) {
            inputObj = log.input_data;
          }
          try {
            outputObj = JSON.parse(log.output_data);
          } catch (_) {
            outputObj = log.output_data;
          }

          return (
            <div
              key={log.id}
              className="rounded-2xl bg-zinc-950/60 border border-white/5 hover:border-white/10 overflow-hidden transition-all duration-300"
            >
              <div
                onClick={() => setExpandedId(isExpanded ? null : (log.id || null))}
                className="w-full p-4 flex items-center justify-between text-left text-xs text-white cursor-pointer select-none"
              >
                <div className="flex items-center gap-4">
                  <span className="text-[10px] font-bold text-zinc-400">
                    {getModuleTitle(log.module)}
                  </span>
                  <span className="text-[9px] text-zinc-600 font-mono">
                    {log.created_at ? new Date(log.created_at).toLocaleString() : 'Just now'}
                  </span>
                </div>
                
                <div className="flex items-center gap-4">
                  <button
                    onClick={(e) => handleDelete(e, log.id || '')}
                    className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-550 text-rose-450 hover:text-white transition-all duration-200"
                    title="Delete record"
                    type="button"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>

                  <div className="flex items-center gap-1.5 cursor-pointer">
                    <span className="text-[9px] text-zinc-500 uppercase tracking-wilder font-bold">
                      {isExpanded ? 'Hide' : 'Details'}
                    </span>
                    <svg
                      className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </div>

              {isExpanded && (
                <div className="px-5 pb-5 border-t border-white/5 space-y-4 pt-4 text-xs text-zinc-400">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Inputs */}
                    <div className="space-y-1 bg-white/5 border border-white/5 p-3 rounded-xl">
                      <h5 className="text-[10px] font-black uppercase text-accent tracking-widest mb-2">Input Parameters (ထည့်သွင်းမှု)</h5>
                      {typeof inputObj === 'object' ? (
                        <ul className="space-y-1 font-mono text-[11px] text-zinc-300">
                          {Object.entries(inputObj).map(([key, val]) => (
                            <li key={key} className="flex gap-2">
                              <span className="text-zinc-500 shrink-0">{key}:</span>
                              <span className="text-zinc-200 line-clamp-2 overflow-ellipsis">{String(val)}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="font-mono text-[11px] text-zinc-300 whitespace-pre-wrap">{String(inputObj)}</p>
                      )}
                    </div>

                    {/* Outputs */}
                    <div className="space-y-1 bg-white/5 border border-white/5 p-3 rounded-xl">
                      <h5 className="text-[10px] font-black uppercase text-green-400 tracking-widest mb-2">Result Snap (ရလဒ်)</h5>
                      {typeof outputObj === 'object' ? (
                        <ul className="space-y-1 font-mono text-[11px] text-zinc-300">
                          {Object.entries(outputObj).map(([key, val]) => (
                            <li key={key} className="flex gap-2">
                              <span className="text-zinc-500 shrink-0">{key}:</span>
                              <span className="text-zinc-200 line-clamp-3 overflow-ellipsis">{String(val)}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="font-mono text-[11px] text-zinc-300 whitespace-pre-wrap">{String(outputObj)}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
