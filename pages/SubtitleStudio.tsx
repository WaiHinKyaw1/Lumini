import React, { useState, useEffect, useRef, useCallback } from 'react';
import { generateSubtitles } from '../services/geminiService';
import {
  transcribeWithGroq,
  transcribeWithServerWorker,
  getGroqApiKey
} from '../services/whisperService';
import { CREDIT_COSTS, ContentType } from '../types';
import { auth } from '../services/firebase';
import { logGeneration } from '../services/supabase';
import {
  Upload, Download, Trash2, Play, Pause,
  Copy, Check,
  Clock, Send, Plus, Zap, ChevronDown
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  isMediaWorkerConfigured,
  isMediaWorkerAvailable,
  uploadMedia,
  extractAudioFromMedia
} from '../services/mediaWorkerApi';

interface SubtitleStudioProps {
  onSpendCredits: (amount: number) => boolean;
  onNavigate?: (path: string) => void;
}

interface FileItem {
  id: string;
  file: File;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  statusText?: string;
  progress?: number;
  result?: string;
  error?: string;
}

interface SrtCue {
  index: number;
  start: string;
  end: string;
  text: string;
}

function parseSrtCues(srt: string): SrtCue[] {
  if (!srt) return [];
  const blocks = srt.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split(/\n\s*\n/);
  const cues: SrtCue[] = [];
  for (const block of blocks) {
    const lines = block.trim().split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) continue;
    const timeIdx = lines.findIndex(l => l.includes('-->'));
    if (timeIdx === -1) continue;
    const idxNum = parseInt(lines[0], 10);
    const timeParts = lines[timeIdx].split('-->');
    if (timeParts.length !== 2) continue;
    const text = lines.slice(timeIdx + 1).join('\n').replace(/<[^>]*>/g, '').trim();
    if (!text) continue;
    cues.push({ index: isNaN(idxNum) ? cues.length + 1 : idxNum, start: timeParts[0].trim(), end: timeParts[1].trim(), text });
  }
  return cues;
}

function cuesToSrt(cues: SrtCue[]): string {
  return cues.map((c, i) => `${i + 1}\n${c.start} --> ${c.end}\n${c.text}`).join('\n\n') + '\n';
}

function srtToSeconds(t: string): number {
  if (!t) return 0;
  const [h, m, s] = t.replace(',', '.').split(':');
  return (parseFloat(h) || 0) * 3600 + (parseFloat(m) || 0) * 60 + (parseFloat(s) || 0);
}

const LANGUAGES = [
  { value: 'BURMESE', label: 'မြန်မာ (Burmese)', code: 'MM' },
  { value: 'ENGLISH', label: 'English', code: 'EN' },
  { value: 'THAI', label: 'ไทย (Thai)', code: 'TH' },
  { value: 'CHINESE', label: '中文 (Chinese)', code: 'ZH' },
  { value: 'JAPANESE', label: '日本語', code: 'JA' },
  { value: 'KOREAN', label: '한국어', code: 'KO' },
];

const SubtitleStudio: React.FC<SubtitleStudioProps> = ({ onSpendCredits, onNavigate }) => {
  const [queue, setQueue] = useState<FileItem[]>([]);
  const [language, setLanguage] = useState('BURMESE');
  const [isProcessingAll, setIsProcessingAll] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [cues, setCues] = useState<SrtCue[]>([]);
  const [editingCueIdx, setEditingCueIdx] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'cards' | 'raw'>('cards');
  const [rawSrtText, setRawSrtText] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [audioTime, setAudioTime] = useState(0);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [isLangOpen, setIsLangOpen] = useState(false);

  const isMounted = useRef(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioUrlRef = useRef<string | null>(null);
  const langDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (langDropdownRef.current && !langDropdownRef.current.contains(e.target as Node)) {
        setIsLangOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, []);

  useEffect(() => {
    return () => {
      isMounted.current = false;
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    };
  }, []);

  useEffect(() => {
    const item = queue.find(i => i.id === selectedItemId);
    if (item?.result) {
      setCues(parseSrtCues(item.result));
      setRawSrtText(item.result);
    } else {
      setCues([]);
      setRawSrtText('');
    }
    setEditingCueIdx(null);
    if (item?.file) {
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = URL.createObjectURL(item.file);
      if (audioRef.current) {
        audioRef.current.src = audioUrlRef.current;
        audioRef.current.load();
        setIsAudioPlaying(false);
        setAudioTime(0);
      }
    }
  }, [selectedItemId, queue]);

  const addFiles = useCallback((files: FileList | File[]) => {
    const newItems: FileItem[] = Array.from(files).map(file => ({
      id: Math.random().toString(36).slice(2, 11),
      file,
      status: 'pending' as const,
    }));
    setQueue(prev => {
      const updated = [...prev, ...newItems];
      if (!selectedItemId && newItems.length > 0) setSelectedItemId(newItems[0].id);
      return updated;
    });
  }, [selectedItemId]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
  };

  const removeFile = (id: string) => {
    setQueue(prev => prev.filter(i => i.id !== id));
    if (selectedItemId === id) setSelectedItemId(null);
  };

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve((r.result as string).split(',')[1]);
      r.onerror = reject;
      r.readAsDataURL(file);
    });

  const compressAudioFile = async (mediaFile: File): Promise<{ blob: Blob; base64: string; mimeType: string }> => {
    return new Promise((resolve, reject) => {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext || AudioContext;
      const audioCtx = new AudioCtx();
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const ab = e.target?.result as ArrayBuffer;
          const audioBuffer = await audioCtx.decodeAudioData(ab);
          const sampleRate = 16000;
          const offlineCtx = new OfflineAudioContext(1, Math.ceil(audioBuffer.duration * sampleRate), sampleRate);
          const source = offlineCtx.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(offlineCtx.destination);
          source.start();
          const rendered = await offlineCtx.startRendering();

          const length = rendered.length * 2 + 44;
          const buf = new ArrayBuffer(length);
          const view = new DataView(buf);
          let pos = 0;
          const setU16 = (d: number) => { view.setUint16(pos, d, true); pos += 2; };
          const setU32 = (d: number) => { view.setUint32(pos, d, true); pos += 4; };
          const writeStr = (s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(pos++, s.charCodeAt(i)); };
          writeStr('RIFF'); setU32(length - 8); writeStr('WAVE'); writeStr('fmt ');
          setU32(16); setU16(1); setU16(1);
          setU32(sampleRate); setU32(sampleRate * 2);
          setU16(2); setU16(16); writeStr('data'); setU32(length - pos - 4);
          const channel = rendered.getChannelData(0);
          for (let i = 0; i < channel.length; i++) {
            let s = Math.max(-1, Math.min(1, channel[i]));
            s = (s < 0 ? s * 32768 : s * 32767) | 0;
            view.setInt16(pos, s, true); pos += 2;
          }
          const blob = new Blob([buf], { type: 'audio/wav' });
          const r2 = new FileReader();
          r2.onload = () => resolve({ blob, base64: (r2.result as string).split(',')[1], mimeType: 'audio/wav' });
          r2.onerror = reject;
          r2.readAsDataURL(blob);
        } catch (err) { reject(err); }
        finally { if (audioCtx.state !== 'closed') audioCtx.close(); }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(mediaFile);
    });
  };

  const processFile = async (item: FileItem) => {
    if (item.file.size > 250 * 1024 * 1024) throw new Error('ဖိုင်ဆိုဒ် ကြီးလွန်းပါသည် (အများဆုံး 250MB)');
    if (!onSpendCredits(CREDIT_COSTS[ContentType.SUBTITLE])) throw new Error('Credit မလုံလောက်ပါ');

    setQueue(prev => prev.map(i => i.id === item.id ? { ...i, status: 'processing' as const, statusText: 'စတင်နေပါသည်...', progress: 15 } : i));

    try {
      let audioBlob: Blob = item.file;
      let base64 = '';
      let mimeType = item.file.type || 'audio/mp3';
      const isVideo = item.file.type.startsWith('video/') || /\.(mp4|webm|mov|mkv)$/i.test(item.file.name);

      if (isVideo) {
        let isWorkerOnline = false;
        if (isMediaWorkerConfigured()) {
          try { isWorkerOnline = await isMediaWorkerAvailable(); } catch { }
        }

        let extracted = false;
        if (isWorkerOnline) {
          try {
            setQueue(prev => prev.map(i => i.id === item.id ? { ...i, statusText: 'ဆာဗာသို့ တင်သွင်းနေပါသည်...', progress: 30 } : i));
            const uploaded = await uploadMedia(item.file);
            setQueue(prev => prev.map(i => i.id === item.id ? { ...i, statusText: 'အသံဖိုင် သီးသန့် ခွဲထုတ်နေပါသည်...', progress: 50 } : i));
            const res = await extractAudioFromMedia(uploaded.fileId);
            base64 = res.audioBase64;
            mimeType = res.mimeType || 'audio/mp3';
            const byteChars = atob(base64);
            const byteNumbers = new Array(byteChars.length);
            for (let k = 0; k < byteChars.length; k++) byteNumbers[k] = byteChars.charCodeAt(k);
            audioBlob = new Blob([new Uint8Array(byteNumbers)], { type: mimeType });
            extracted = true;
          } catch { }
        }

        if (!extracted) {
          try {
            const comp = await compressAudioFile(item.file);
            audioBlob = comp.blob;
            base64 = comp.base64;
            mimeType = comp.mimeType;
          } catch {
            base64 = await fileToBase64(item.file);
            mimeType = item.file.type || 'video/mp4';
          }
        }
      } else {
        try {
          const comp = await compressAudioFile(item.file);
          audioBlob = comp.blob;
          base64 = comp.base64;
          mimeType = comp.mimeType;
        } catch {
          base64 = await fileToBase64(item.file);
        }
      }

      setQueue(prev => prev.map(i => i.id === item.id ? { ...i, statusText: '⚡ Fast Whisper ဖြင့် ၁ စက္ကန့်အတွင်း စာတန်းပြောင်းနေပါသည်...', progress: 65 } : i));

      let result = '';
      const groqKey = getGroqApiKey();

      if (groqKey) {
        result = await transcribeWithGroq(audioBlob, {
          language,
          apiKey: groqKey,
          onProgress: (msg, pct) => {
            setQueue(prev => prev.map(i => i.id === item.id ? { ...i, statusText: msg, progress: pct } : i));
          }
        });
      } else if (isMediaWorkerConfigured()) {
        try {
          result = await transcribeWithServerWorker(audioBlob, { language });
        } catch {
          result = await generateSubtitles(base64, mimeType, language);
        }
      } else {
        result = await generateSubtitles(base64, mimeType, language);
      }

      if (!isMounted.current) return;
      const finalCues = parseSrtCues(result);
      if (finalCues.length === 0 && !result.includes('-->')) {
        throw new Error('အသံဖိုင်တွင် စကားပြောသံ ရှင်းလင်းစွာ မပါရှိပါ');
      }

      const u = auth.currentUser;
      if (u) {
        logGeneration(u.uid, u.email || '', 'subtitles', { fileName: item.file.name, language }, { resultLength: result?.length || 0 }).catch(() => { });
      }

      setQueue(prev => prev.map(i => i.id === item.id ? {
        ...i,
        status: 'completed' as const,
        statusText: `အောင်မြင်ပါသည် (${finalCues.length} Cues)`,
        progress: 100,
        result
      } : i));

      if (selectedItemId === item.id) {
        setCues(finalCues);
        setRawSrtText(result);
      }
      toast.success(`${item.file.name} — SRT ထွက်ရှိပါပြီ!`);
    } catch (err: unknown) {
      if (isMounted.current) {
        const errorMsg = (err as { message?: string })?.message || 'ပြဿနာတစ်ခု ဖြစ်ပွားခဲ့ပါသည်';
        setQueue(prev => prev.map(i => i.id === item.id ? {
          ...i,
          status: 'failed' as const,
          statusText: 'မအောင်မြင်ပါ',
          progress: 0,
          error: errorMsg
        } : i));
        throw err;
      }
    }
  };

  const handleProcess = async (item?: FileItem) => {
    const targets = item ? [item] : queue.filter(i => i.status === 'pending');
    if (targets.length === 0) { toast.error('Transcription ပြုလုပ်ရန် ဖိုင်မရှိပါ'); return; }
    setIsProcessingAll(true);
    await Promise.all(targets.map(async t => {
      try { await processFile(t); }
      catch (e: unknown) { toast.error((e as { message?: string })?.message || 'ပြဿနာတစ်ခု ဖြစ်ပွားခဲ့ပါသည်'); }
    }));
    if (isMounted.current) setIsProcessingAll(false);
  };

  const downloadSRT = (item: FileItem) => {
    if (!item.result && !rawSrtText) return;
    const content = activeTab === 'raw' ? rawSrtText : (cues.length > 0 && selectedItemId === item.id ? cuesToSrt(cues) : item.result || rawSrtText);
    const blob = new Blob(['\uFEFF' + content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${item.file.name.replace(/\.[^.]+$/, '')}.srt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('SRT ဖိုင် ဒေါင်းလုဒ်လုပ်ပြီးပါပြီ!');
  };

  const copySrt = async (item: FileItem) => {
    const content = activeTab === 'raw' ? rawSrtText : (cues.length > 0 && selectedItemId === item.id ? cuesToSrt(cues) : (item.result || rawSrtText));
    await navigator.clipboard.writeText(content);
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 2000);
    toast.success('SRT စာတန်းများကို Copy ကူးပြီးပါပြီ!');
  };

  const sendToMovieRecap = (item: FileItem) => {
    const content = activeTab === 'raw' ? rawSrtText : (cues.length > 0 && selectedItemId === item.id ? cuesToSrt(cues) : (item.result || rawSrtText));
    if (!content.trim()) {
      toast.error('ပေးပို့ရန် SRT စာတန်း မရှိသေးပါ');
      return;
    }
    try {
      localStorage.setItem('lumini_active_srt', content);
      localStorage.setItem('lumini_active_srt_name', `${item.file.name.replace(/\.[^.]+$/, '')}.srt`);
      toast.success('Movie Recap သို့ SRT စာတန်း ပို့ပြီးပါပြီ!');
      if (onNavigate) {
        onNavigate('recap');
      } else {
        window.dispatchEvent(new CustomEvent('lumini:navigate', { detail: 'recap' }));
      }
    } catch {
      toast.error('ပေးပို့ခြင်း မအောင်မြင်ပါ');
    }
  };

  const updateCue = (idx: number, field: 'start' | 'end' | 'text', value: string) => {
    const updated = cues.map((c, i) => i === idx ? { ...c, [field]: value } : c);
    setCues(updated);
    const newSrt = cuesToSrt(updated);
    setRawSrtText(newSrt);
    setQueue(prev => prev.map(item => item.id === selectedItemId ? { ...item, result: newSrt } : item));
  };

  const deleteCue = (idx: number) => {
    const updated = cues.filter((_, i) => i !== idx);
    setCues(updated);
    const newSrt = cuesToSrt(updated);
    setRawSrtText(newSrt);
    setQueue(prev => prev.map(item => item.id === selectedItemId ? { ...item, result: newSrt } : item));
  };

  const addCue = () => {
    const last = cues[cues.length - 1];
    const newCue: SrtCue = {
      index: cues.length + 1,
      start: last ? last.end : '00:00:00,000',
      end: '00:00:04,000',
      text: 'စာတန်းထိုး အသစ်'
    };
    const updated = [...cues, newCue];
    setCues(updated);
    const newSrt = cuesToSrt(updated);
    setRawSrtText(newSrt);
    setQueue(prev => prev.map(item => item.id === selectedItemId ? { ...item, result: newSrt } : item));
    setEditingCueIdx(updated.length - 1);
  };

  const toggleAudio = () => {
    if (!audioRef.current) return;
    if (isAudioPlaying) {
      audioRef.current.pause();
      setIsAudioPlaying(false);
    } else {
      audioRef.current.play().then(() => setIsAudioPlaying(true)).catch(() => { });
    }
  };

  const seekToCue = (cue: SrtCue) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = srtToSeconds(cue.start);
    audioRef.current.play().then(() => setIsAudioPlaying(true)).catch(() => { });
  };

  const selectedItem = queue.find(i => i.id === selectedItemId);
  const activeCue = audioTime > 0 ? cues.find(c => srtToSeconds(c.start) <= audioTime && srtToSeconds(c.end) >= audioTime) : null;
  const formatDuration = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  return (
    <div className="max-w-5xl mx-auto pb-10 px-2 sm:px-4">
      <audio
        ref={audioRef}
        onTimeUpdate={() => audioRef.current && setAudioTime(audioRef.current.currentTime)}
        onEnded={() => setIsAudioPlaying(false)}
        className="hidden"
      />

      {/* HEADER */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center text-white shadow-sm">
            <Zap className="w-4 h-4 fill-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-white !mb-0">Subtitle Studio</h1>
            <p className="text-[11px] text-slate-400 dark:text-zinc-500">
              ⚡ Fast Whisper (1s Instant Burma SRT)
            </p>
          </div>
        </div>

        {isProcessingAll && (
          <span className="flex items-center gap-1.5 text-xs font-bold text-amber-400 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/20">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            Transcribing...
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[290px_1fr] gap-4 items-start">

        {/* LEFT COLUMN: Clean Upload & Queue */}
        <div className="space-y-3">
          <div className="rounded-xl bg-white dark:bg-[#0e0e11] border border-gray-200 dark:border-white/10 p-3.5 space-y-3 shadow-sm">
            
            {/* Upload Area */}
            <div
              onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`w-full rounded-xl border-2 border-dashed cursor-pointer p-4 text-center transition-all ${isDragging
                ? 'border-amber-500 bg-amber-500/10'
                : 'border-gray-300 dark:border-white/10 hover:border-amber-400 hover:bg-amber-500/5'
                }`}
            >
              <Upload className="w-6 h-6 text-amber-400 mx-auto mb-1" />
              <p className="text-xs font-bold text-slate-800 dark:text-zinc-200">
                Audio / Video ဖိုင် တင်ပါ
              </p>
              <p className="text-[10px] text-slate-400 dark:text-zinc-500 mt-0.5">
                .mp3, .wav, .m4a, .mp4
              </p>
              <input ref={fileInputRef} type="file" accept="video/*,audio/*,.mp4,.mov,.mp3,.wav,.m4a" multiple onChange={handleFileChange} className="hidden" />
            </div>

            {/* Language Custom Dropdown */}
            <div ref={langDropdownRef} className="relative">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                ဘာသာစကား
              </label>
              <button
                type="button"
                onClick={() => setIsLangOpen(!isLangOpen)}
                className="w-full bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg px-2.5 py-2 text-xs text-slate-800 dark:text-zinc-100 flex items-center justify-between outline-none hover:border-amber-400 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="w-6 h-4 rounded bg-amber-500/15 text-amber-500 dark:text-amber-400 text-[9px] font-bold flex items-center justify-center font-mono">
                    {LANGUAGES.find(l => l.value === language)?.code || 'MM'}
                  </span>
                  <span className="font-semibold text-slate-800 dark:text-zinc-100">
                    {LANGUAGES.find(l => l.value === language)?.label || 'မြန်မာ (Burmese)'}
                  </span>
                </div>
                <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${isLangOpen ? 'rotate-180 text-amber-400' : ''}`} />
              </button>

              {isLangOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 z-30 bg-white dark:bg-[#18181c] border border-gray-200 dark:border-white/10 rounded-xl shadow-xl overflow-hidden py-1">
                  {LANGUAGES.map(l => (
                    <button
                      key={l.value}
                      type="button"
                      onClick={() => {
                        setLanguage(l.value);
                        setIsLangOpen(false);
                      }}
                      className={`w-full px-3 py-2 text-xs flex items-center justify-between transition-colors ${
                        language === l.value
                          ? 'bg-amber-500/10 text-amber-500 dark:text-amber-400 font-bold'
                          : 'text-slate-800 dark:text-zinc-200 hover:bg-gray-100 dark:hover:bg-white/5'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-4 rounded bg-gray-100 dark:bg-white/10 text-slate-700 dark:text-zinc-300 text-[9px] font-bold flex items-center justify-center font-mono">
                          {l.code}
                        </span>
                        <span className="text-slate-800 dark:text-zinc-100">{l.label}</span>
                      </div>
                      {language === l.value && <Check className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Transcribe Button */}
            <button
              onClick={() => handleProcess()}
              disabled={isProcessingAll || queue.filter(i => i.status === 'pending').length === 0}
              className="w-full py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold shadow-md shadow-amber-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-1.5 active:scale-98"
            >
              <Zap className="w-3.5 h-3.5 fill-white" />
              <span>{isProcessingAll ? 'Transcribing (~1s)...' : `Start Transcribe (${queue.filter(i => i.status === 'pending').length})`}</span>
            </button>
          </div>

          {/* Queue List */}
          {queue.length > 0 && (
            <div className="rounded-xl bg-white dark:bg-[#0e0e11] border border-gray-200 dark:border-white/10 p-3 space-y-2 shadow-sm">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-400">
                <span>Queue ({queue.length})</span>
                <button onClick={() => { setQueue([]); setSelectedItemId(null); }} className="text-rose-400 hover:underline">
                  Clear
                </button>
              </div>

              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {queue.map(item => (
                  <div
                    key={item.id}
                    onClick={() => setSelectedItemId(item.id)}
                    className={`p-2 rounded-lg border text-xs cursor-pointer flex items-center justify-between gap-2 transition-all ${selectedItemId === item.id
                      ? 'border-amber-500 bg-amber-500/10'
                      : 'border-gray-200 dark:border-white/5 bg-gray-50 dark:bg-white/[0.02]'
                      }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-slate-800 dark:text-zinc-200 truncate">{item.file.name}</p>
                      <p className="text-[10px] text-slate-400 truncate mt-0.5">{item.statusText || item.status}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      {item.status === 'pending' && (
                        <button
                          onClick={e => { e.stopPropagation(); handleProcess(item); }}
                          className="p-1 rounded bg-amber-500/20 text-amber-400 hover:bg-amber-500/30"
                        >
                          <Zap className="w-3 h-3 fill-current" />
                        </button>
                      )}
                      <button
                        onClick={e => { e.stopPropagation(); removeFile(item.id); }}
                        className="p-1 text-slate-400 hover:text-rose-400"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Player & Editor */}
        <div className="min-h-[480px] flex flex-col gap-3">
          {!selectedItem ? (
            <div className="flex-1 rounded-xl bg-white dark:bg-[#0e0e11] border border-gray-200 dark:border-white/10 flex flex-col items-center justify-center p-10 text-center shadow-sm">
              <Zap className="w-8 h-8 text-amber-400/40 mb-2" />
              <p className="text-xs font-bold text-slate-600 dark:text-zinc-400">Audio ဖိုင် ရွေးချယ်ပါ</p>
              <p className="text-[10px] text-slate-400 dark:text-zinc-500 mt-0.5">၁ စက္ကန့်အတွင်း SRT ထွက်ရှိပါမည်</p>
            </div>
          ) : (
            <>
              {/* Player Bar */}
              <div className="rounded-xl bg-white dark:bg-[#0e0e11] border border-gray-200 dark:border-white/10 p-2.5 flex items-center gap-3 shadow-sm">
                <button
                  onClick={toggleAudio}
                  className="w-8 h-8 rounded-lg bg-amber-500 hover:bg-amber-600 text-white flex items-center justify-center shrink-0 shadow-sm"
                >
                  {isAudioPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="font-bold text-slate-800 dark:text-zinc-200 truncate">{selectedItem.file.name}</span>
                    <span className="font-mono text-slate-400">{formatDuration(audioTime)} / {formatDuration(audioRef.current?.duration || 0)}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={audioRef.current?.duration || 100}
                    step="0.05"
                    value={audioTime}
                    onChange={e => {
                      const t = Number(e.target.value);
                      setAudioTime(t);
                      if (audioRef.current) audioRef.current.currentTime = t;
                    }}
                    className="w-full h-1.5 accent-amber-500 cursor-pointer"
                  />
                </div>
                {activeCue && (
                  <span className="hidden sm:inline-block px-2 py-1 rounded bg-amber-500/10 text-amber-400 text-[10px] font-bold truncate max-w-[180px]" style={{ fontFamily: 'Akkhayar21, sans-serif' }}>
                    {activeCue.text}
                  </span>
                )}
              </div>

              {/* Editor Card */}
              <div className="flex-1 rounded-xl bg-white dark:bg-[#0e0e11] border border-gray-200 dark:border-white/10 shadow-sm overflow-hidden flex flex-col">
                
                {/* Header Actions */}
                <div className="flex items-center justify-between px-3.5 py-2 border-b border-gray-100 dark:border-white/5">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setActiveTab('cards')}
                      className={`px-2.5 py-1 rounded-md text-[10px] font-bold ${activeTab === 'cards' ? 'bg-amber-500/10 text-amber-500' : 'text-slate-400'}`}
                    >
                      Cues ({cues.length})
                    </button>
                    <button
                      onClick={() => setActiveTab('raw')}
                      className={`px-2.5 py-1 rounded-md text-[10px] font-bold ${activeTab === 'raw' ? 'bg-amber-500/10 text-amber-500' : 'text-slate-400'}`}
                    >
                      Raw SRT
                    </button>
                  </div>

                  {selectedItem.status === 'completed' && (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => sendToMovieRecap(selectedItem)}
                        className="px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold flex items-center gap-1"
                      >
                        <Send className="w-3 h-3" /> Movie Recap
                      </button>
                      <button
                        onClick={() => copySrt(selectedItem)}
                        className="px-2 py-1 rounded-md bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 text-slate-700 dark:text-zinc-300 text-[10px] font-bold flex items-center gap-1"
                      >
                        {copiedId === selectedItem.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        {copiedId === selectedItem.id ? 'Copied' : 'Copy'}
                      </button>
                      <button
                        onClick={() => downloadSRT(selectedItem)}
                        className="px-2.5 py-1 rounded-md bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-bold flex items-center gap-1"
                      >
                        <Download className="w-3 h-3" /> Download .SRT
                      </button>
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 p-3 overflow-y-auto">
                  {selectedItem.status === 'processing' ? (
                    <div className="flex flex-col items-center justify-center h-full py-16 text-center space-y-2">
                      <Zap className="w-8 h-8 text-amber-400 animate-pulse fill-amber-400" />
                      <p className="text-xs font-bold text-slate-800 dark:text-zinc-200">{selectedItem.statusText || 'Transcribing...'}</p>
                    </div>
                  ) : activeTab === 'raw' ? (
                    <textarea
                      value={rawSrtText}
                      onChange={e => {
                        setRawSrtText(e.target.value);
                        setCues(parseSrtCues(e.target.value));
                        setQueue(prev => prev.map(item => item.id === selectedItemId ? { ...item, result: e.target.value } : item));
                      }}
                      className="w-full h-full min-h-[360px] bg-transparent border-none text-xs font-mono text-slate-900 dark:text-zinc-100 outline-none resize-none leading-relaxed"
                      placeholder="SRT text..."
                    />
                  ) : cues.length > 0 ? (
                    <div className="space-y-1.5">
                      {cues.map((cue, idx) => {
                        const isActive = audioTime > 0 && srtToSeconds(cue.start) <= audioTime && srtToSeconds(cue.end) >= audioTime;
                        const isEditing = editingCueIdx === idx;
                        return (
                          <div
                            key={idx}
                            className={`p-2 rounded-lg border text-xs transition-all ${isActive
                              ? 'border-amber-500 bg-amber-500/10'
                              : 'border-gray-200 dark:border-white/5 bg-gray-50 dark:bg-white/[0.02]'
                              }`}
                          >
                            <div className="flex items-center gap-2 cursor-pointer" onClick={() => setEditingCueIdx(isEditing ? null : idx)}>
                              <span className="font-mono text-[9px] font-bold text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded">
                                {cue.start}
                              </span>
                              <p className="flex-1 truncate text-slate-800 dark:text-zinc-200" style={{ fontFamily: 'Akkhayar21, sans-serif' }}>
                                {cue.text}
                              </p>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={e => { e.stopPropagation(); seekToCue(cue); }}
                                  className="p-1 text-slate-400 hover:text-amber-400"
                                >
                                  <Clock className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={e => { e.stopPropagation(); deleteCue(idx); }}
                                  className="p-1 text-slate-400 hover:text-rose-400"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>

                            {isEditing && (
                              <div className="mt-2 pt-2 border-t border-gray-200 dark:border-white/10 space-y-1.5">
                                <div className="flex gap-2">
                                  <input
                                    value={cue.start}
                                    onChange={e => updateCue(idx, 'start', e.target.value)}
                                    className="w-1/2 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded px-2 py-1 text-[10px] font-mono text-slate-800 dark:text-zinc-200"
                                  />
                                  <input
                                    value={cue.end}
                                    onChange={e => updateCue(idx, 'end', e.target.value)}
                                    className="w-1/2 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded px-2 py-1 text-[10px] font-mono text-slate-800 dark:text-zinc-200"
                                  />
                                </div>
                                <input
                                  value={cue.text}
                                  onChange={e => updateCue(idx, 'text', e.target.value)}
                                  className="w-full bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded px-2 py-1 text-xs text-slate-800 dark:text-zinc-200"
                                  style={{ fontFamily: 'Akkhayar21, sans-serif' }}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}

                      <button
                        onClick={addCue}
                        className="w-full py-2 rounded-lg border border-dashed border-gray-300 dark:border-white/10 text-slate-400 hover:text-amber-400 text-[11px] font-bold flex items-center justify-center gap-1"
                      >
                        <Plus className="w-3 h-3" /> Add Cue
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full py-16 text-center">
                      <p className="text-xs text-slate-400 mb-2">စာတန်း မထွက်ရှိသေးပါ</p>
                      <button
                        onClick={() => handleProcess(selectedItem)}
                        className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold"
                      >
                        Transcribe Now
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default SubtitleStudio;
