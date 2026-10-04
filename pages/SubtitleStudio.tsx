import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Upload, Download, Trash2, Play, Pause, Copy, Check, Send, Plus, X, Captions, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { CREDIT_COSTS, ContentType } from '../types';
import { auth } from '../services/firebase';
import { logGeneration } from '../services/supabase';
import { generateSrt, downloadSrt, formatSrtTime, MAX_FILE_BYTES, SRT_LANGUAGES, SrtLanguage } from '../services/srtService';

interface SubtitleStudioProps {
  onSpendCredits: (amount: number) => boolean;
  onNavigate?: (path: string) => void;
}

interface FileItem {
  id: string;
  file: File;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  message?: string;
  progress: number;
  srt: string;
}

interface Cue {
  start: string;
  end: string;
  text: string;
}

const MYANMAR_FONT = { fontFamily: 'Akkhayar21, sans-serif' };

function parseSrt(srt: string): Cue[] {
  return srt
    .replace(/\r\n?/g, '\n')
    .trim()
    .split(/\n\s*\n/)
    .map(block => {
      const lines = block.split('\n');
      const t = lines.findIndex(l => l.includes('-->'));
      if (t === -1) return null;
      const [start, end] = lines[t].split('-->').map(s => s.trim());
      const text = lines.slice(t + 1).join('\n').trim();
      return text ? { start, end, text } : null;
    })
    .filter((c): c is Cue => c !== null);
}

const cuesToSrt = (cues: Cue[]) =>
  cues.map((c, i) => `${i + 1}\n${c.start} --> ${c.end}\n${c.text}`).join('\n\n') + (cues.length ? '\n' : '');

function toSeconds(t: string): number {
  const [h, m, s] = t.replace(',', '.').split(':').map(Number);
  return (h || 0) * 3600 + (m || 0) * 60 + (s || 0);
}

const SubtitleStudio: React.FC<SubtitleStudioProps> = ({ onSpendCredits, onNavigate }) => {
  const [queue, setQueue] = useState<FileItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [language, setLanguage] = useState<SrtLanguage>('BURMESE');
  const [isRunning, setIsRunning] = useState(false);
  const [tab, setTab] = useState<'cues' | 'raw'>('cues');
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [copied, setCopied] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const selected = queue.find(i => i.id === selectedId) ?? null;
  const cues = useMemo(() => parseSrt(selected?.srt ?? ''), [selected?.srt]);
  const pendingCount = queue.filter(i => i.status === 'pending').length;

  // Load the selected file into the player only when the file itself changes
  const selectedFile = selected?.file;
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !selectedFile) return;
    const url = URL.createObjectURL(selectedFile);
    audio.src = url;
    setPlaying(false);
    setTime(0);
    return () => URL.revokeObjectURL(url);
  }, [selectedFile]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const patchItem = (id: string, patch: Partial<FileItem>) =>
    setQueue(prev => prev.map(i => (i.id === id ? { ...i, ...patch } : i)));

  const addFiles = (files: FileList | File[]) => {
    const items: FileItem[] = [];
    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_BYTES) {
        toast.error(`${file.name} — 100MB ထက် ကြီးနေပါသည်`);
        continue;
      }
      items.push({ id: crypto.randomUUID(), file, status: 'pending', progress: 0, srt: '' });
    }
    if (!items.length) return;
    setQueue(prev => [...prev, ...items]);
    setSelectedId(id => id ?? items[0].id);
  };

  const removeItem = (id: string) => {
    setQueue(prev => prev.filter(i => i.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const processItem = async (item: FileItem, signal: AbortSignal) => {
    if (!onSpendCredits(CREDIT_COSTS[ContentType.SUBTITLE])) throw new Error('Credit မလုံလောက်ပါ');
    patchItem(item.id, { status: 'processing', progress: 0, message: 'စတင်နေပါသည်...', srt: '' });

    try {
      const result = await generateSrt(item.file, language, {
        signal,
        onProgress: p => patchItem(item.id, { progress: p.percent, message: p.message, srt: p.srt }),
      });

      patchItem(item.id, {
        status: 'completed',
        progress: 100,
        message: `စာတန်း ${result.cueCount} ခု`,
        srt: result.srt,
      });

      if (result.failedChunks > 0) {
        toast(`${item.file.name} — အပိုင်း ${result.failedChunks} ခု မအောင်မြင်ပါ၊ ပြန်စစ်ပါ`, { icon: '⚠️' });
      } else {
        toast.success(`${item.file.name} — ပြီးပါပြီ`);
      }

      const user = auth.currentUser;
      if (user) {
        logGeneration(user.uid, user.email || '', 'subtitles', { fileName: item.file.name, language }, { resultLength: result.srt.length }).catch(() => {});
      }
    } catch (err) {
      const aborted = (err as Error)?.name === 'AbortError';
      patchItem(item.id, {
        status: aborted ? 'pending' : 'failed',
        progress: 0,
        message: aborted ? 'ရပ်လိုက်ပါသည်' : (err as Error)?.message || 'မအောင်မြင်ပါ',
      });
      if (!aborted) toast.error((err as Error)?.message || 'မအောင်မြင်ပါ');
    }
  };

  const run = async (only?: FileItem) => {
    const targets = only ? [only] : queue.filter(i => i.status === 'pending' || i.status === 'failed');
    if (!targets.length) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setIsRunning(true);
    // Files run one after another; chunks inside each file run in parallel.
    for (const item of targets) {
      if (controller.signal.aborted) break;
      setSelectedId(item.id);
      try {
        await processItem(item, controller.signal);
      } catch (err) {
        toast.error((err as Error)?.message);
        break;
      }
    }
    setIsRunning(false);
    abortRef.current = null;
  };

  const updateSrt = (srt: string) => selected && patchItem(selected.id, { srt });
  const updateCues = (next: Cue[]) => updateSrt(cuesToSrt(next));

  const updateCue = (idx: number, field: keyof Cue, value: string) =>
    updateCues(cues.map((c, i) => (i === idx ? { ...c, [field]: value } : c)));

  const addCue = () => {
    const lastEnd = cues.length ? toSeconds(cues[cues.length - 1].end) : 0;
    updateCues([...cues, { start: formatSrtTime(lastEnd + 0.1), end: formatSrtTime(lastEnd + 3), text: '...' }]);
    setEditingIdx(cues.length);
  };

  const copySrt = async () => {
    if (!selected?.srt) return;
    await navigator.clipboard.writeText(selected.srt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const sendToRecap = () => {
    if (!selected?.srt) return;
    localStorage.setItem('lumini_active_srt', selected.srt);
    localStorage.setItem('lumini_active_srt_name', `${selected.file.name.replace(/\.[^.]+$/, '')}.srt`);
    toast.success('Movie Recap သို့ ပို့ပြီးပါပြီ');
    if (onNavigate) onNavigate('recap');
    else window.dispatchEvent(new CustomEvent('lumini:navigate', { detail: 'recap' }));
  };

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) audio.pause();
    else audio.play().catch(() => {});
  };

  const seek = (sec: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = sec;
    audio.play().catch(() => {});
  };

  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const hasSrt = Boolean(selected?.srt.trim());

  return (
    <div className="max-w-5xl mx-auto pb-10 px-2 sm:px-4">
      <audio
        ref={audioRef}
        onTimeUpdate={e => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={e => setDuration(e.currentTarget.duration || 0)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        className="hidden"
      />

      <header className="mb-4 flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center text-white">
          <Captions className="w-4 h-4" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white !mb-0">Subtitle Studio</h1>
          <p className="text-[11px] text-slate-400 dark:text-zinc-500">Audio / Video → SRT · Gemini AI</p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4 items-start">
        {/* ── Left: input ── */}
        <aside className="rounded-xl bg-white dark:bg-[#0e0e11] border border-gray-200 dark:border-white/10 p-3.5 space-y-3">
          <div
            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={e => { e.preventDefault(); setIsDragging(false); addFiles(e.dataTransfer.files); }}
            onClick={() => fileInputRef.current?.click()}
            className={`rounded-xl border-2 border-dashed cursor-pointer p-5 text-center transition-colors ${
              isDragging ? 'border-amber-500 bg-amber-500/10' : 'border-gray-300 dark:border-white/10 hover:border-amber-400'
            }`}
          >
            <Upload className="w-6 h-6 text-amber-400 mx-auto mb-1.5" />
            <p className="text-xs font-semibold text-slate-700 dark:text-zinc-200">ဖိုင် ဆွဲထည့် / နှိပ်၍ ရွေးပါ</p>
            <p className="text-[10px] text-slate-400 mt-0.5">MP3 · WAV · M4A · MP4 · 100MB အထိ</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,video/*"
              multiple
              className="hidden"
              onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }}
            />
          </div>

          <div>
            <label htmlFor="srt-language" className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
              စာတန်း ဘာသာ
            </label>
            <select
              id="srt-language"
              value={language}
              disabled={isRunning}
              onChange={e => setLanguage(e.target.value as SrtLanguage)}
              className="w-full bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg px-2.5 py-2 text-xs text-slate-800 dark:text-zinc-100 outline-none focus:border-amber-400"
            >
              {SRT_LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </div>

          {isRunning ? (
            <button
              id="srt-stop"
              onClick={() => abortRef.current?.abort()}
              className="w-full py-2.5 rounded-lg bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 text-xs font-bold flex items-center justify-center gap-1.5"
            >
              <X className="w-3.5 h-3.5" /> ရပ်မည်
            </button>
          ) : (
            <button
              id="srt-start"
              onClick={() => run()}
              disabled={!queue.some(i => i.status === 'pending' || i.status === 'failed')}
              className="w-full py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed"
            >
              SRT ထုတ်မည် {pendingCount > 0 && `(${pendingCount})`}
            </button>
          )}

          {queue.length > 0 && (
            <ul className="space-y-1.5 max-h-64 overflow-y-auto pt-1 border-t border-gray-100 dark:border-white/5">
              {queue.map(item => (
                <li
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  className={`group p-2 rounded-lg border cursor-pointer transition-colors ${
                    selectedId === item.id ? 'border-amber-500 bg-amber-500/5' : 'border-transparent hover:bg-gray-50 dark:hover:bg-white/[0.03]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <p className="flex-1 min-w-0 text-xs font-medium text-slate-800 dark:text-zinc-200 truncate">{item.file.name}</p>
                    {item.status !== 'processing' && (
                      <button
                        onClick={e => { e.stopPropagation(); removeItem(item.id); }}
                        className="p-0.5 text-slate-400 hover:text-rose-400 opacity-0 group-hover:opacity-100"
                        aria-label="Remove"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <p className={`text-[10px] mt-0.5 truncate ${item.status === 'failed' ? 'text-rose-400' : 'text-slate-400'}`}>
                    {item.message || 'စောင့်ဆိုင်းနေသည်'}
                  </p>
                  {item.status === 'processing' && (
                    <div className="mt-1.5 h-1 bg-gray-200 dark:bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-500 transition-all duration-500" style={{ width: `${item.progress}%` }} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* ── Right: player + editor ── */}
        <section className="min-h-[480px] rounded-xl bg-white dark:bg-[#0e0e11] border border-gray-200 dark:border-white/10 flex flex-col overflow-hidden">
          {!selected ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-10 text-slate-400">
              <Captions className="w-8 h-8 opacity-40 mb-2" />
              <p className="text-xs">ဖိုင်တစ်ခု ထည့်ပါ</p>
            </div>
          ) : (
            <>
              {/* Player */}
              <div className="flex items-center gap-3 p-3 border-b border-gray-100 dark:border-white/5">
                <button
                  onClick={togglePlay}
                  className="w-8 h-8 rounded-full bg-amber-500 hover:bg-amber-600 text-white flex items-center justify-center shrink-0"
                  aria-label={playing ? 'Pause' : 'Play'}
                >
                  {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={duration || 1}
                  step={0.05}
                  value={time}
                  onChange={e => { const t = Number(e.target.value); setTime(t); if (audioRef.current) audioRef.current.currentTime = t; }}
                  className="flex-1 h-1 accent-amber-500 cursor-pointer"
                />
                <span className="text-[10px] font-mono text-slate-400 shrink-0">{mmss(time)} / {mmss(duration)}</span>
              </div>

              {/* Toolbar */}
              <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-white/5">
                <div className="flex gap-1 text-[11px] font-semibold">
                  {(['cues', 'raw'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      className={`px-2.5 py-1 rounded-md ${tab === t ? 'bg-amber-500/10 text-amber-500' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                      {t === 'cues' ? `Cues (${cues.length})` : 'SRT'}
                    </button>
                  ))}
                </div>
                {hasSrt && selected.status !== 'processing' && (
                  <div className="flex gap-1.5">
                    <button onClick={sendToRecap} title="Movie Recap သို့ ပို့မည်" className="p-1.5 rounded-md text-slate-500 hover:text-emerald-500 hover:bg-emerald-500/10">
                      <Send className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={copySrt} title="Copy" className="p-1.5 rounded-md text-slate-500 hover:text-amber-500 hover:bg-amber-500/10">
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      id="srt-download"
                      onClick={() => downloadSrt(selected.srt, selected.file.name)}
                      className="px-2.5 py-1 rounded-md bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-bold flex items-center gap-1"
                    >
                      <Download className="w-3 h-3" /> .srt
                    </button>
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-3">
                {selected.status === 'processing' && (
                  <div className="mb-3 flex items-center gap-2 text-[11px] text-amber-500 font-medium">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span className="flex-1">{selected.message}</span>
                    <span className="font-mono">{selected.progress}%</span>
                  </div>
                )}

                {tab === 'raw' ? (
                  <textarea
                    value={selected.srt}
                    onChange={e => updateSrt(e.target.value)}
                    readOnly={selected.status === 'processing'}
                    placeholder="SRT..."
                    className="w-full h-full min-h-[380px] bg-transparent text-xs font-mono text-slate-800 dark:text-zinc-200 outline-none resize-none leading-relaxed"
                    style={MYANMAR_FONT}
                  />
                ) : cues.length > 0 ? (
                  <div className="space-y-1">
                    {cues.map((cue, idx) => {
                      const active = time >= toSeconds(cue.start) && time <= toSeconds(cue.end);
                      const editing = editingIdx === idx;
                      return (
                        <div
                          key={idx}
                          className={`group rounded-lg px-2.5 py-2 text-xs transition-colors ${
                            active ? 'bg-amber-500/10' : 'hover:bg-gray-50 dark:hover:bg-white/[0.03]'
                          }`}
                        >
                          <div className="flex items-start gap-2.5">
                            <button
                              onClick={() => seek(toSeconds(cue.start))}
                              className="font-mono text-[10px] text-amber-500 hover:underline shrink-0 mt-0.5"
                            >
                              {cue.start.slice(3, 8)}
                            </button>
                            <p
                              onClick={() => setEditingIdx(editing ? null : idx)}
                              className="flex-1 text-slate-800 dark:text-zinc-200 leading-relaxed whitespace-pre-line cursor-text"
                              style={MYANMAR_FONT}
                            >
                              {cue.text}
                            </p>
                            <button
                              onClick={() => updateCues(cues.filter((_, i) => i !== idx))}
                              className="p-0.5 text-slate-400 hover:text-rose-400 opacity-0 group-hover:opacity-100"
                              aria-label="Delete cue"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>

                          {editing && (
                            <div className="mt-2 space-y-1.5 pl-10">
                              <div className="flex gap-2">
                                {(['start', 'end'] as const).map(f => (
                                  <input
                                    key={f}
                                    value={cue[f]}
                                    onChange={e => updateCue(idx, f, e.target.value)}
                                    className="w-1/2 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded px-2 py-1 text-[10px] font-mono text-slate-800 dark:text-zinc-200"
                                  />
                                ))}
                              </div>
                              <textarea
                                value={cue.text}
                                onChange={e => updateCue(idx, 'text', e.target.value)}
                                rows={2}
                                className="w-full bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded px-2 py-1 text-xs text-slate-800 dark:text-zinc-200 resize-none"
                                style={MYANMAR_FONT}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {selected.status !== 'processing' && (
                      <button
                        onClick={addCue}
                        className="w-full mt-2 py-2 rounded-lg border border-dashed border-gray-300 dark:border-white/10 text-slate-400 hover:text-amber-500 text-[11px] flex items-center justify-center gap-1"
                      >
                        <Plus className="w-3 h-3" /> Cue ထည့်မည်
                      </button>
                    )}
                  </div>
                ) : selected.status !== 'processing' ? (
                  <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center gap-2">
                    {selected.status === 'failed' && <p className="text-xs text-rose-400 max-w-sm">{selected.message}</p>}
                    <button
                      onClick={() => run(selected)}
                      disabled={isRunning}
                      className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold disabled:opacity-40"
                    >
                      {selected.status === 'failed' ? 'ပြန်စမ်းမည်' : 'SRT ထုတ်မည်'}
                    </button>
                  </div>
                ) : null}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
};

export default SubtitleStudio;
