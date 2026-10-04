import React, { useState, useEffect } from 'react';
import { History, X, Copy, Check, Download, RotateCcw, Trash2, Play, Pause } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { getLocalModuleHistory, fetchModuleHistory, clearModuleHistory, ModuleHistoryRecord } from '../services/moduleHistory';

interface ModuleHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  module: 'subtitle' | 'recap' | 'insights' | 'transcription' | 'thumbnail' | 'voiceover';
  moduleTitle?: string;
  onRestore?: (record: ModuleHistoryRecord) => void;
}

export const ModuleHistoryModal: React.FC<ModuleHistoryModalProps> = ({
  isOpen,
  onClose,
  module,
  moduleTitle,
  onRestore
}) => {
  const [records, setRecords] = useState<ModuleHistoryRecord[]>(() => getLocalModuleHistory(module));
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);

  const refresh = async () => {
    // 1. Show local immediately
    setRecords(getLocalModuleHistory(module));
    setLoading(true);
    try {
      // 2. Query Supabase
      const cloud = await fetchModuleHistory(module);
      setRecords(cloud);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      refresh();
    } else {
      if (audioElement) {
        audioElement.pause();
        setPlayingId(null);
      }
    }
  }, [isOpen, module]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (!detail || detail.module === module) {
        refresh();
      }
    };
    window.addEventListener('lumini:historyUpdated', handler);
    return () => window.removeEventListener('lumini:historyUpdated', handler);
  }, [module]);

  if (!isOpen) return null;

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      toast.success('Copy ကူးပြီးပါပြီ');
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error('Copy မရပါ');
    }
  };

  const handleDownload = (record: ModuleHistoryRecord) => {
    const a = document.createElement('a');
    if (record.outputType === 'image') {
      a.href = record.outputData;
      a.download = `thumbnail_${record.timestamp}.png`;
    } else if (record.outputType === 'audio') {
      a.href = record.outputData;
      a.download = `voiceover_${record.timestamp}.mp3`;
    } else if (record.outputType === 'srt') {
      const blob = new Blob(['\uFEFF' + record.outputData], { type: 'text/plain;charset=utf-8' });
      a.href = URL.createObjectURL(blob);
      a.download = `${record.title || 'subtitles'}.srt`;
    } else {
      const blob = new Blob([record.outputData], { type: 'text/plain;charset=utf-8' });
      a.href = URL.createObjectURL(blob);
      a.download = `${record.title || 'output'}.txt`;
    }
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.success('Download စတင်ပါပြီ');
  };

  const handleToggleAudio = (id: string, audioUrl: string) => {
    if (playingId === id && audioElement) {
      audioElement.pause();
      setPlayingId(null);
    } else {
      if (audioElement) audioElement.pause();
      const audio = new Audio(audioUrl);
      audio.onended = () => setPlayingId(null);
      audio.play().then(() => {
        setAudioElement(audio);
        setPlayingId(id);
      }).catch(() => {
        toast.error('Audio ဖွင့်မရပါ');
      });
    }
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-xl bg-white dark:bg-[#121215] border border-gray-200 dark:border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-white/10">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white leading-tight">
                {moduleTitle || 'Module'} History
              </h2>
              <p className="text-[10px] text-slate-400 dark:text-zinc-400">
                နောက်ဆုံး သိမ်းဆည်းထားသော Record ၃ ခု
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {records.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  clearModuleHistory(module);
                  setRecords([]);
                  toast.success('History ရှင်းပြီးပါပြီ');
                }}
                className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-rose-500/10 transition-colors"
                title="Clear all 3 records"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {records.length === 0 ? (
            <div className="py-12 text-center text-slate-400 dark:text-zinc-500 space-y-2">
              <History className="w-8 h-8 mx-auto opacity-30" />
              <p className="text-xs font-semibold">မှတ်တမ်း မရှိသေးပါ</p>
              <p className="text-[10px]">Generate လုပ်ထားသော output data များသည် ဤနေရာတွင် အလိုအလျောက် ပေါ်လာပါမည်။</p>
            </div>
          ) : (
            records.map((item, idx) => (
              <div
                key={item.id}
                className="rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50/60 dark:bg-white/[0.02] p-3 space-y-2.5 transition-all hover:border-amber-500/30"
              >
                {/* Meta header */}
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-5 h-5 rounded-md bg-amber-500/15 text-amber-500 font-bold text-[10px] flex items-center justify-center shrink-0">
                      #{idx + 1}
                    </span>
                    <span className="font-bold text-slate-800 dark:text-zinc-200 truncate text-[11px]" title={item.title}>
                      {item.title || 'Untitled task'}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 shrink-0">
                    {formatTime(item.timestamp)}
                  </span>
                </div>

                {/* Output Display based on type */}
                {item.outputType === 'image' ? (
                  <div className="relative rounded-lg overflow-hidden border border-gray-200 dark:border-white/10 max-h-48 bg-black/40 flex items-center justify-center">
                    <img src={item.outputData} alt={item.title} className="w-full h-full object-contain max-h-48" />
                  </div>
                ) : item.outputType === 'audio' ? (
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleToggleAudio(item.id, item.outputData)}
                        className="w-8 h-8 rounded-full bg-amber-500 hover:bg-amber-600 text-white flex items-center justify-center shrink-0"
                      >
                        {playingId === item.id ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
                      </button>
                      <span className="text-xs font-semibold text-slate-700 dark:text-zinc-300">Audio Preview</span>
                    </div>
                  </div>
                ) : (
                  <div className="relative">
                    <pre
                      className="p-2.5 rounded-lg bg-white dark:bg-black/40 border border-gray-200 dark:border-white/5 text-[11px] font-mono text-slate-800 dark:text-zinc-200 max-h-32 overflow-y-auto whitespace-pre-wrap leading-relaxed select-text"
                      style={{ fontFamily: 'Akkhayar21, monospace' }}
                    >
                      {item.outputData.slice(0, 1000)}
                      {item.outputData.length > 1000 && '...'}
                    </pre>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-end gap-1.5 pt-1">
                  {item.outputType !== 'image' && item.outputType !== 'audio' && (
                    <button
                      type="button"
                      onClick={() => handleCopy(item.id, item.outputData)}
                      className="px-2.5 py-1 rounded-lg border border-gray-200 dark:border-white/10 hover:border-amber-400 bg-white dark:bg-white/5 text-slate-700 dark:text-zinc-300 text-[10px] font-bold flex items-center gap-1 transition-colors"
                    >
                      {copiedId === item.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedId === item.id ? 'Copied' : 'Copy'}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleDownload(item)}
                    className="px-2.5 py-1 rounded-lg border border-gray-200 dark:border-white/10 hover:border-amber-400 bg-white dark:bg-white/5 text-slate-700 dark:text-zinc-300 text-[10px] font-bold flex items-center gap-1 transition-colors"
                  >
                    <Download className="w-3 h-3" />
                    <span>Download</span>
                  </button>

                  {onRestore && (
                    <button
                      type="button"
                      onClick={() => {
                        onRestore(item);
                        onClose();
                        toast.success('Record ကို ပြန်လည်အသုံးပြုလိုက်ပါပြီ');
                      }}
                      className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-bold flex items-center gap-1 shadow-sm transition-all"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>ပြန်သုံးမည် (Restore)</span>
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
