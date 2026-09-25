import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { generateSubtitles } from '../services/geminiService';
import { CREDIT_COSTS, ContentType } from '../types';
import { auth } from '../services/firebase';
import { logGeneration } from '../services/supabase';
import {
  Upload, FileText, Download, Trash2, Play, Pause,
  CheckCircle2, AlertCircle, Sparkles, Copy, Check,
  ChevronRight, Languages, Clock, Mic, Film, Send, Code, ListFilter, Plus, X
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
  { value: 'BURMESE', label: 'မြန်မာ (Burmese)', flag: '🇲🇲' },
  { value: 'ENGLISH', label: 'English', flag: '🇬🇧' },
  { value: 'THAI', label: 'ไทย (Thai)', flag: '🇹🇭' },
  { value: 'CHINESE', label: '中文 (Chinese)', flag: '🇨🇳' },
  { value: 'JAPANESE', label: '日本語 (Japanese)', flag: '🇯🇵' },
  { value: 'KOREAN', label: '한국어 (Korean)', flag: '🇰🇷' },
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
  const isMounted = useRef(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioUrlRef = useRef<string | null>(null);

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

  // Client-side lightweight audio extraction and compression (WAV 16kHz mono) for ultra-fast Gemini transcription
  const compressAudioFile = async (mediaFile: File): Promise<{ base64: string; mimeType: string }> => {
    return new Promise((resolve, reject) => {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext || AudioContext;
      const audioCtx = new AudioCtx();
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const ab = e.target?.result as ArrayBuffer;
          const audioBuffer = await audioCtx.decodeAudioData(ab);
          const numCh = 1; // mono for compact size (32KB/sec)
          const sampleRate = 16000; // 16kHz gold standard for speech AI
          const offlineCtx = new OfflineAudioContext(numCh, Math.ceil(audioBuffer.duration * sampleRate), sampleRate);
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
          setU32(16); setU16(1); setU16(1); // PCM mono
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
          r2.onload = () => resolve({ base64: (r2.result as string).split(',')[1], mimeType: 'audio/wav' });
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
    setQueue(prev => prev.map(i => i.id === item.id ? { ...i, status: 'processing' as const, statusText: 'စတင်ပြင်ဆင်နေပါသည်...', progress: 5 } : i));
    try {
      let base64 = '';
      let mimeType = 'audio/mp3';
      const isVideo = item.file.type.startsWith('video/') || /\.(mp4|webm|mov|mkv)$/i.test(item.file.name);

      if (isVideo) {
        let isWorkerOnline = false;
        if (isMediaWorkerConfigured()) {
          try { isWorkerOnline = await isMediaWorkerAvailable(); } catch { }
        }

        let extractedSuccess = false;

        if (isWorkerOnline) {
          try {
            // AWS EC2 FFmpeg ultra-fast audio extraction (converts 100MB video to 300KB MP3!)
            setQueue(prev => prev.map(i => i.id === item.id ? { ...i, statusText: 'ဆာဗာသို့ တင်သွင်းနေပါသည်...', progress: 10 } : i));
            const uploaded = await uploadMedia(item.file, (pct) => {
              const overall = Math.min(45, 10 + Math.round(pct * 0.35));
              setQueue(prev => prev.map(i => i.id === item.id ? { ...i, statusText: `ဗီဒီယို တင်နေပါသည် (${pct}%)...`, progress: overall } : i));
            });

            setQueue(prev => prev.map(i => i.id === item.id ? { ...i, statusText: 'FFmpeg ဖြင့် အသံဖိုင် သီးသန့် ခွဲထုတ်နေပါသည်...', progress: 48 } : i));
            const extracted = await extractAudioFromMedia(uploaded.fileId);
            base64 = extracted.audioBase64;
            mimeType = extracted.mimeType || 'audio/mp3';
            extractedSuccess = true;
            setQueue(prev => prev.map(i => i.id === item.id ? { ...i, progress: 50 } : i));
          } catch (uploadErr) {
            console.warn('Media worker extraction failed, falling back to local extraction:', uploadErr);
          }
        }

        if (!extractedSuccess) {
          // Fallback: browser audio extraction
          setQueue(prev => prev.map(i => i.id === item.id ? { ...i, statusText: 'Browser တွင် အသံဖိုင် ခွဲထုတ်နေပါသည်...', progress: 25 } : i));
          try {
            const compressed = await compressAudioFile(item.file);
            base64 = compressed.base64;
            mimeType = compressed.mimeType;
            setQueue(prev => prev.map(i => i.id === item.id ? { ...i, progress: 50 } : i));
          } catch {
            if (item.file.size > 25 * 1024 * 1024) {
              throw new Error('ဗီဒီယိုဖိုင် အရွယ်အစား ကြီးမားပါသည် (>25MB)။ အသံဖိုင် (MP3/M4A/WAV) သို့ပြောင်း၍ တင်သွင်းပါက ၃ စက္ကန့်အတွင်း အမြန်ဆုံး ရရှိပါမည်။');
            }
            setQueue(prev => prev.map(i => i.id === item.id ? { ...i, statusText: 'ဗီဒီယိုဖိုင် ဖတ်ရှုနေပါသည်...', progress: 35 } : i));
            base64 = await fileToBase64(item.file);
            mimeType = item.file.type || 'video/mp4';
            setQueue(prev => prev.map(i => i.id === item.id ? { ...i, progress: 50 } : i));
          }
        }
      } else {
        // Direct Audio File: Compress to 16kHz mono WAV in browser (<1s) for lightweight ultra-fast Gemini transfer
        setQueue(prev => prev.map(i => i.id === item.id ? { ...i, statusText: 'အသံဖိုင် 16kHz သို့ အမြန်ပြောင်းလဲနေပါသည်...', progress: 20 } : i));
        try {
          const compressed = await compressAudioFile(item.file);
          base64 = compressed.base64;
          mimeType = compressed.mimeType;
          setQueue(prev => prev.map(i => i.id === item.id ? { ...i, progress: 48 } : i));
        } catch {
          base64 = await fileToBase64(item.file);
          mimeType = item.file.type || 'audio/mp3';
          setQueue(prev => prev.map(i => i.id === item.id ? { ...i, progress: 48 } : i));
        }
      }

      setQueue(prev => prev.map(i => i.id === item.id ? { ...i, statusText: 'Gemini AI Subtitle စတင်ချိတ်ဆက်နေပါသည်...', progress: 50 } : i));

      // Active progress heartbeat while waiting for Gemini AI stream so progress never stalls
      let currentProgress = 50;
      const progressTimer = setInterval(() => {
        if (currentProgress < 95) {
          const step = currentProgress < 75 ? 2 : (currentProgress < 88 ? 1 : (Math.random() > 0.4 ? 1 : 0));
          currentProgress += step;
          const statusMessages = [
            'AI Subtitle စတင်ချိတ်ဆက်နေပါသည်...',
            'အသံလှိုင်းများကို AI မှ စတင်နားဆင်နေပါသည်...',
            'စကားပြောသံနှင့် အချိန် Timeline များကို တွက်ချက်နေပါသည်...',
            'Subtitle စာတန်းများကို စတင်ရေးသားထုတ်ယူနေပါသည်...',
            'စာတန်းများကို အချောသတ် စစ်ဆေးနေပါသည်...'
          ];
          const msgIdx = Math.min(statusMessages.length - 1, Math.floor((currentProgress - 50) / 10));
          setQueue(prev => prev.map(i => i.id === item.id && i.status === 'processing' ? {
            ...i,
            statusText: statusMessages[msgIdx],
            progress: currentProgress
          } : i));
        }
      }, 700);

      let result = '';
      try {
        result = await generateSubtitles(base64, mimeType, language, (partialText, cueCount) => {
          if (!isMounted.current) return;
          const dynamicPct = Math.min(96, Math.max(currentProgress, 72 + Math.min(24, cueCount * 2)));
          const cueLabel = cueCount > 0 ? ` (${cueCount} Cues တွေ့ရှိ)` : '';
          setQueue(prev => prev.map(i => i.id === item.id ? {
            ...i,
            statusText: `AI စာတန်းများ ထုတ်ယူနေပါသည်${cueLabel}...`,
            progress: dynamicPct,
            result: partialText
          } : i));
          if (selectedItemId === item.id && partialText) {
            setRawSrtText(partialText);
            const parsed = parseSrtCues(partialText);
            if (parsed.length > 0) setCues(parsed);
          }
        });
      } finally {
        clearInterval(progressTimer);
      }

      if (!isMounted.current) return;
      const finalCues = parseSrtCues(result);
      if (finalCues.length === 0 && !result.includes('-->')) {
        throw new Error('အသံဖိုင်တွင် စကားပြောသံ ရှင်းလင်းစွာ မပါရှိပါ သို့မဟုတ် Subtitle စာတန်း မထွက်ရှိပါ။');
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
      toast.success(`${item.file.name} — Subtitle အောင်မြင်စွာ ထုတ်ယူပြီးပါပြီ! (${finalCues.length} Cues)`);
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
    toast.success('SRT စာတန်းများကို Clipboard သို့ ကူးယူပြီးပါပြီ!');
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
      toast.success('Movie Recap သို့ SRT စာတန်း ပေးပို့ပြီးပါပြီ!');
      if (onNavigate) {
        onNavigate('recap');
      } else {
        window.dispatchEvent(new CustomEvent('lumini:navigate', { detail: 'recap' }));
      }
    } catch {
      toast.error('Movie Recap သို့ ပေးပို့ခြင်း မအောင်မြင်ပါ');
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
    const newStart = last ? last.end : '00:00:00,000';
    const newEnd = '00:00:04,000';
    const newCue: SrtCue = {
      index: cues.length + 1,
      start: newStart,
      end: newEnd,
      text: 'စာတန်းထိုး အသစ်'
    };
    const updated = [...cues, newCue];
    setCues(updated);
    const newSrt = cuesToSrt(updated);
    setRawSrtText(newSrt);
    setQueue(prev => prev.map(item => item.id === selectedItemId ? { ...item, result: newSrt } : item));
    setEditingCueIdx(updated.length - 1);
  };

  const handleRawSrtChange = (val: string) => {
    setRawSrtText(val);
    setCues(parseSrtCues(val));
    setQueue(prev => prev.map(item => item.id === selectedItemId ? { ...item, result: val } : item));
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

  const getStatusColor = (status: FileItem['status']) => ({
    pending: 'text-zinc-400 bg-zinc-800/50',
    processing: 'text-indigo-400 bg-indigo-500/15',
    completed: 'text-emerald-400 bg-emerald-500/15',
    failed: 'text-rose-400 bg-rose-500/15',
  }[status]);

  const getStatusLabel = (status: FileItem['status']) => ({
    pending: 'Pending',
    processing: 'Processing...',
    completed: 'Done',
    failed: 'Failed',
  }[status]);

  const formatDuration = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  return (
    <div className="module-page max-w-7xl mx-auto pb-10">
      <audio
        ref={audioRef}
        onTimeUpdate={() => audioRef.current && setAudioTime(audioRef.current.currentTime)}
        onEnded={() => setIsAudioPlaying(false)}
        className="hidden"
      />

      {/* HEADER */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-600 via-indigo-600 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-600/20">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white !mb-0">Subtitle Studio</h1>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                AI Audio/Video Transcription & Burma SRT Generator • {CREDIT_COSTS[ContentType.SUBTITLE]} Credits
              </p>
            </div>
          </div>
        </div>
        <div className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl border text-[11px] font-semibold self-start sm:self-auto ${isProcessingAll
          ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
          : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
          }`}>
          <span className={`w-2 h-2 rounded-full ${isProcessingAll ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`} />
          {isProcessingAll ? 'AI Transcription Active' : 'System Ready'}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-5 items-start">

        {/* LEFT PANEL */}
        <div className="space-y-4">
          <div className="rounded-2xl bg-white dark:bg-[#0c0c0e] border border-gray-200 dark:border-white/10 p-5 shadow-sm space-y-4">
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500 flex items-center gap-1.5">
              <Upload className="w-3.5 h-3.5 text-indigo-400" /> Upload Media
            </h3>

            <div
              onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`w-full rounded-2xl border-2 border-dashed cursor-pointer transition-all p-6 text-center ${isDragging
                ? 'border-indigo-500 bg-indigo-500/10 scale-[1.01]'
                : 'border-gray-300 dark:border-white/10 hover:border-indigo-400 hover:bg-indigo-500/5'
                }`}
            >
              <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mx-auto mb-3 transition-transform hover:scale-110">
                {isDragging ? <Sparkles className="w-6 h-6 animate-bounce" /> : <Upload className="w-6 h-6" />}
              </div>
              <p className="text-xs font-bold text-slate-800 dark:text-zinc-200 mb-1">
                {isDragging ? 'ဖိုင်ကို ဤနေရာတွင် ချပါ...' : 'Drag & Drop သို့မဟုတ် နှိပ်၍ တင်ပါ'}
              </p>
              <p className="text-[10px] text-slate-400 dark:text-zinc-500">
                Audio (.mp3, .wav, .m4a) သို့မဟုတ် Video (.mp4, .mov, .webm)
              </p>
              <input ref={fileInputRef} type="file" accept="video/*,audio/*,.mp4,.mov,.mkv,.webm,.mp3,.wav,.m4a,.aac" multiple onChange={handleFileChange} className="hidden" />
            </div>

            {/* <div className="bg-indigo-50/50 dark:bg-indigo-500/5 border border-indigo-200/50 dark:border-indigo-500/10 rounded-xl p-3 text-[11px] space-y-1.5 text-slate-600 dark:text-zinc-400">
              <div className="flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400 font-bold text-[11px]">
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                <span>အမြန်ဆုံး အသုံးပြုနည်း အကြံပြုချက်</span>
              </div>
              <p className="leading-relaxed">
                • <strong>Voiceover Audio (MP3/M4A/WAV)</strong> တိုက်ရိုက်တင်ပါက <span className="text-emerald-500 font-bold">၃ စက္ကန့်အတွင်း</span> SRT ချက်ချင်းထွက်ပါသည်။
              </p>
              <p className="leading-relaxed">
                • <strong>Video (MP4/MOV)</strong> ဆိုပါက Cloud Server (FFmpeg) ဖြင့် အသံဖိုင် သီးသန့် ခွဲထုတ်ပြီး SRT ထုတ်ပေးပါသည်။
              </p>
            </div> */}

            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 block mb-1.5">
                <Languages className="w-3 h-3 inline mr-1 text-indigo-400" />Target Language (ဘာသာစကား)
              </label>
              <select
                value={language}
                onChange={e => setLanguage(e.target.value)}
                className="w-full bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl px-3 py-2.5 text-xs text-slate-900 dark:text-zinc-100 outline-none focus:border-indigo-400 cursor-pointer transition-all"
              >
                {LANGUAGES.map(l => (
                  <option key={l.value} value={l.value}>{l.flag} {l.label}</option>
                ))}
              </select>
            </div>

            <button
              onClick={() => handleProcess()}
              disabled={isProcessingAll || queue.filter(i => i.status === 'pending').length === 0}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold tracking-wide shadow-lg shadow-indigo-600/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4 text-indigo-200" />
              <span>{isProcessingAll ? 'Transcribing...' : `Start Transcription (${queue.filter(i => i.status === 'pending').length})`}</span>
            </button>
          </div>

          {/* Queue List */}
          <div className="rounded-2xl bg-white dark:bg-[#0c0c0e] border border-gray-200 dark:border-white/10 p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500 flex items-center gap-1.5">
                <Film className="w-3.5 h-3.5 text-indigo-400" /> Queue ({queue.length})
              </h3>
              {queue.length > 0 && (
                <button onClick={() => { setQueue([]); setSelectedItemId(null); }} className="text-[10px] font-bold text-rose-500 hover:text-rose-400 transition-colors">
                  Clear all
                </button>
              )}
            </div>

            <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
              {queue.length === 0 ? (
                <div className="text-center py-10 text-zinc-500">
                  <Mic className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-[11px] font-medium">ဖိုင် မရှိသေးပါ</p>
                  <p className="text-[9px] text-zinc-500 mt-0.5">ဗီဒီယို သို့မဟုတ် အသံဖိုင် တင်သွင်းပါ</p>
                </div>
              ) : queue.map(item => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={() => setSelectedItemId(item.id)}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${selectedItemId === item.id
                    ? 'border-indigo-500/50 bg-indigo-500/[0.08] ring-1 ring-indigo-500/20'
                    : 'border-gray-200 dark:border-white/[0.08] bg-gray-50 dark:bg-white/[0.03] hover:border-indigo-300 dark:hover:border-indigo-500/30'
                    }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${getStatusColor(item.status)}`}>
                      {item.status === 'processing' ? (
                        <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      ) : item.status === 'completed' ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      ) : item.status === 'failed' ? (
                        <AlertCircle className="w-3.5 h-3.5" />
                      ) : (
                        <FileText className="w-3.5 h-3.5" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <p className="text-[11px] font-bold text-slate-800 dark:text-zinc-100 truncate">{item.file.name}</p>
                        {item.status === 'processing' && (
                          <span className="text-[10px] font-bold text-indigo-500 dark:text-indigo-400 font-mono shrink-0">
                            {item.progress || 5}%
                          </span>
                        )}
                      </div>
                      <p className="text-[9px] text-slate-400 dark:text-zinc-500 mt-0.5 truncate max-w-[170px]">
                        {item.statusText || getStatusLabel(item.status)}
                        {item.status === 'completed' && item.result && ` • ${parseSrtCues(item.result).length} Cues`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      {item.status === 'pending' && (
                        <button
                          onClick={e => { e.stopPropagation(); handleProcess(item); }}
                          className="p-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 transition-colors"
                          title="Transcribe this file"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={e => { e.stopPropagation(); removeFile(item.id); }}
                        className="p-1.5 rounded-lg hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  {item.status === 'processing' && (
                    <div className="mt-2.5 w-full bg-indigo-100 dark:bg-white/10 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-teal-400 rounded-full transition-all duration-300 ease-out"
                        style={{ width: `${Math.max(5, item.progress || 5)}%` }}
                      />
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div className="min-h-[640px] flex flex-col gap-4">
          {!selectedItem ? (
            <div className="flex-1 rounded-2xl bg-white dark:bg-[#0c0c0e] border border-gray-200 dark:border-white/10 flex flex-col items-center justify-center p-12 text-center shadow-sm">
              <div className="w-16 h-16 rounded-3xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mx-auto mb-4">
                <FileText className="w-8 h-8" />
              </div>
              <h3 className="text-sm font-bold text-slate-700 dark:text-zinc-200 mb-1">ဖိုင် ရွေးချယ်ထားခြင်း မရှိသေးပါ</h3>
              <p className="text-[11px] text-slate-400 dark:text-zinc-500 max-w-sm">
                ဘယ်ဘက် Queue မှ ဖိုင်တစ်ခုကို ရွေးချယ်ပြီး Subtitle စာတန်းများကို စစ်ဆေးတည်းဖြတ်ပါ
              </p>
            </div>
          ) : (
            <>
              {/* Synchronized Audio/Media Player */}
              <div className="rounded-2xl bg-white dark:bg-[#0c0c0e] border border-gray-200 dark:border-white/10 p-4 flex items-center gap-3.5 shadow-sm">
                <button
                  onClick={toggleAudio}
                  className="w-10 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-indigo-600/25 transition-all active:scale-95"
                >
                  {isAudioPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-bold text-slate-800 dark:text-zinc-100 truncate">{selectedItem.file.name}</p>
                    <span className="text-[10px] font-mono text-slate-400 dark:text-zinc-400 shrink-0 ml-2">
                      {formatDuration(audioTime)} / {formatDuration(audioRef.current?.duration || 0)}
                    </span>
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
                    className="w-full h-1.5 accent-indigo-500 cursor-pointer"
                  />
                </div>
                {activeCue && (
                  <div className="hidden sm:flex items-center px-3 py-1.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 max-w-[220px]">
                    <span className="text-[10px] font-bold text-indigo-400 truncate" style={{ fontFamily: language === 'BURMESE' ? 'Akkhayar21, sans-serif' : 'inherit' }}>
                      💬 {activeCue.text}
                    </span>
                  </div>
                )}
              </div>

              {/* SRT Editor Container */}
              <div className="flex-1 rounded-2xl bg-white dark:bg-[#0c0c0e] border border-gray-200 dark:border-white/10 shadow-sm overflow-hidden flex flex-col">
                {/* Editor Header & Actions */}
                <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b border-gray-100 dark:border-white/[0.08]">
                  <div className="flex items-center gap-3">
                    {/* View Switcher: Cards vs Raw */}
                    <div className="flex items-center bg-gray-100 dark:bg-white/5 p-0.5 rounded-lg border border-gray-200 dark:border-white/10">
                      <button
                        onClick={() => setActiveTab('cards')}
                        className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-[10px] font-bold transition-all ${activeTab === 'cards'
                          ? 'bg-white dark:bg-white/10 text-indigo-400 shadow-sm'
                          : 'text-slate-500 dark:text-zinc-400'
                          }`}
                      >
                        <ListFilter className="w-3 h-3" />
                        <span>Timeline Cues ({cues.length})</span>
                      </button>
                      <button
                        onClick={() => setActiveTab('raw')}
                        className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-[10px] font-bold transition-all ${activeTab === 'raw'
                          ? 'bg-white dark:bg-white/10 text-indigo-400 shadow-sm'
                          : 'text-slate-500 dark:text-zinc-400'
                          }`}
                      >
                        <Code className="w-3 h-3" />
                        <span>Raw SRT</span>
                      </button>
                    </div>

                    {selectedItem.status === 'processing' && (
                      <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] font-bold">
                        <div className="w-2.5 h-2.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        AI Transcribing ({selectedItem.progress || 5}%)...
                      </span>
                    )}
                  </div>

                  {/* Actions: Send to Movie Recap, Copy, Download */}
                  {selectedItem.status === 'completed' && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => sendToMovieRecap(selectedItem)}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-[10px] font-bold shadow-md shadow-emerald-600/20 transition-all active:scale-95"
                        title="Send this SRT directly to Movie Recap"
                      >
                        <Send className="w-3 h-3" />
                        <span>Send to Movie Recap</span>
                      </button>
                      <button
                        onClick={() => copySrt(selectedItem)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 text-slate-600 dark:text-zinc-300 text-[10px] font-bold border border-gray-200 dark:border-white/10 transition-all"
                      >
                        {copiedId === selectedItem.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedId === selectedItem.id ? 'Copied!' : 'Copy'}</span>
                      </button>
                      <button
                        onClick={() => downloadSRT(selectedItem)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold shadow-sm shadow-indigo-600/20 transition-all active:scale-95"
                      >
                        <Download className="w-3 h-3" />
                        <span>Download SRT</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Editor Content Area */}
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                  {selectedItem.status === 'processing' ? (
                    <div className="flex flex-col items-center justify-center h-full gap-5 py-12 px-6">
                      <div className="relative">
                        <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-indigo-500/20 via-purple-500/20 to-teal-500/20 border border-indigo-500/30 flex items-center justify-center shadow-lg shadow-indigo-500/10">
                          <Sparkles className="w-9 h-9 text-indigo-400 animate-pulse" />
                        </div>
                        <div className="absolute inset-0 rounded-3xl border-2 border-indigo-500/30 animate-ping opacity-60" />
                      </div>

                      <div className="text-center space-y-2 max-w-md w-full">
                        <div className="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-zinc-200 px-1">
                          <span className="flex items-center gap-1.5 truncate max-w-[300px]">
                            <span className="w-2 h-2 rounded-full bg-indigo-500 animate-ping inline-block shrink-0" />
                            {selectedItem.statusText || 'Gemini AI Subtitle Transcribing...'}
                          </span>
                          <span className="font-mono text-indigo-500 dark:text-indigo-400 text-sm font-black shrink-0 ml-2">
                            {selectedItem.progress || 5}%
                          </span>
                        </div>

                        {/* Large Sleek Progress Bar */}
                        <div className="w-full bg-gray-100 dark:bg-white/10 h-3 rounded-full overflow-hidden p-0.5 border border-gray-200 dark:border-white/10 shadow-inner">
                          <div
                            className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-teal-400 rounded-full transition-all duration-300 ease-out"
                            style={{ width: `${Math.max(5, selectedItem.progress || 5)}%` }}
                          />
                        </div>

                        <p className="text-[11px] text-slate-400 dark:text-zinc-500 pt-0.5">
                          အသံဖိုင်မှ စကားလုံးများနှင့် Timeline များကို AI ဖြင့် တိကျစွာ ခွဲထုတ်ရေးသားနေပါသည်
                        </p>

                        <div className="pt-2 flex items-center justify-center gap-2">
                          <button
                            onClick={() => {
                              setQueue(prev => prev.map(i => i.id === selectedItem.id ? { ...i, status: 'pending' as const, progress: 0, statusText: 'Pending' } : i));
                              setIsProcessingAll(false);
                              toast('လုပ်ဆောင်ချက်ကို ရပ်တန့်လိုက်ပါသည်');
                            }}
                            className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-white/10 hover:bg-rose-500/20 text-slate-600 dark:text-zinc-300 hover:text-rose-400 text-[11px] font-bold transition-all flex items-center gap-1"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Cancel (ရပ်တန့်မည်)</span>
                          </button>
                        </div>
                      </div>

                      {/* Live Cues Preview if already streaming in */}
                      {cues.length > 0 && (
                        <div className="w-full max-w-lg mt-3 p-4 rounded-2xl bg-gray-50 dark:bg-white/[0.03] border border-gray-200 dark:border-white/10 space-y-2">
                          <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 dark:text-zinc-300 pb-1.5 border-b border-gray-200 dark:border-white/5">
                            <span className="flex items-center gap-1.5 text-emerald-500">
                              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                              Live Generated Cues ({cues.length})
                            </span>
                            <span className="text-[10px] text-zinc-400 font-mono">Stream တိုက်ရိုက် ရေးသားနေပါသည်</span>
                          </div>
                          <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                            {cues.slice(-5).map((c, i) => (
                              <div key={i} className="text-xs p-2 rounded-lg bg-white dark:bg-white/5 border border-gray-200 dark:border-white/5 flex items-start gap-2">
                                <span className="font-mono text-[9px] text-indigo-400 shrink-0 font-bold mt-0.5">{c.start}</span>
                                <span className="text-slate-800 dark:text-zinc-200 line-clamp-1">{c.text}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : selectedItem.status === 'failed' ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3 py-16 text-center">
                      <div className="w-14 h-14 rounded-2xl bg-rose-500/10 flex items-center justify-center text-rose-400">
                        <AlertCircle className="w-7 h-7" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-rose-400 mb-1">Transcription မအောင်မြင်ပါ</p>
                        <p className="text-xs text-slate-400">{selectedItem.error}</p>
                      </div>
                      <button
                        onClick={() => handleProcess(selectedItem)}
                        className="px-4 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-bold border border-rose-500/20 transition-all"
                      >
                        ပြန်လည်ကြိုးစားရန် (Retry)
                      </button>
                    </div>
                  ) : activeTab === 'raw' ? (
                    <div className="h-full flex flex-col">
                      <textarea
                        value={rawSrtText}
                        onChange={e => handleRawSrtChange(e.target.value)}
                        placeholder="SRT syntax will appear here..."
                        className="w-full h-full min-h-[460px] bg-gray-50 dark:bg-white/[0.02] border border-gray-200 dark:border-white/10 rounded-xl p-4 text-xs font-mono text-slate-900 dark:text-zinc-100 outline-none focus:border-indigo-400 resize-none leading-relaxed"
                        spellCheck={false}
                      />
                    </div>
                  ) : cues.length > 0 ? (
                    <div className="space-y-2.5">
                      {cues.map((cue, idx) => {
                        const isActive = audioTime > 0 && srtToSeconds(cue.start) <= audioTime && srtToSeconds(cue.end) >= audioTime;
                        const isEditing = editingCueIdx === idx;
                        return (
                          <motion.div
                            key={idx}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className={`rounded-xl border transition-all ${isActive
                              ? 'border-indigo-500/60 bg-indigo-500/[0.09] ring-1 ring-indigo-500/20'
                              : isEditing
                                ? 'border-violet-500/40 bg-violet-500/5'
                                : 'border-gray-200 dark:border-white/[0.08] bg-gray-50 dark:bg-white/[0.02] hover:border-gray-300 dark:hover:border-white/15'
                              }`}
                          >
                            <div className="flex items-center gap-3 px-3.5 py-2.5 cursor-pointer" onClick={() => setEditingCueIdx(isEditing ? null : idx)}>
                              <span className={`text-[9px] font-mono font-bold w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${isActive ? 'bg-indigo-600 text-white' : 'bg-gray-200 dark:bg-white/10 text-slate-500 dark:text-zinc-400'}`}>
                                {cue.index}
                              </span>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="text-[10px] font-mono text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded font-bold">{cue.start}</span>
                                <span className="text-[10px] text-zinc-500">→</span>
                                <span className="text-[10px] font-mono text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded font-bold">{cue.end}</span>
                              </div>
                              <p className="flex-1 text-xs text-slate-800 dark:text-zinc-100 truncate" style={{ fontFamily: language === 'BURMESE' ? 'Akkhayar21, sans-serif' : 'inherit' }}>
                                {cue.text}
                              </p>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  onClick={e => { e.stopPropagation(); seekToCue(cue); }}
                                  className="p-1.5 rounded-lg hover:bg-indigo-500/10 text-slate-400 hover:text-indigo-400 transition-colors"
                                  title="Play audio from this cue"
                                >
                                  <Clock className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={e => { e.stopPropagation(); deleteCue(idx); }}
                                  className="p-1.5 rounded-lg hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 transition-colors"
                                  title="Delete cue"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                            <AnimatePresence>
                              {isEditing && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  className="border-t border-violet-500/20 px-3.5 py-3 space-y-2.5"
                                >
                                  <div className="flex gap-3">
                                    <div className="flex-1">
                                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Start Time</label>
                                      <input
                                        value={cue.start}
                                        onChange={e => updateCue(idx, 'start', e.target.value)}
                                        className="w-full bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg px-2.5 py-1.5 text-[10px] font-mono text-slate-800 dark:text-zinc-100 outline-none focus:border-indigo-400 transition-colors"
                                      />
                                    </div>
                                    <div className="flex-1">
                                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">End Time</label>
                                      <input
                                        value={cue.end}
                                        onChange={e => updateCue(idx, 'end', e.target.value)}
                                        className="w-full bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg px-2.5 py-1.5 text-[10px] font-mono text-slate-800 dark:text-zinc-100 outline-none focus:border-violet-400 transition-colors"
                                      />
                                    </div>
                                  </div>
                                  <div>
                                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Subtitle Text (စာသား)</label>
                                    <textarea
                                      value={cue.text}
                                      onChange={e => updateCue(idx, 'text', e.target.value)}
                                      rows={2}
                                      className="w-full bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs text-slate-800 dark:text-zinc-100 outline-none focus:border-violet-400 resize-none transition-colors"
                                      style={{ fontFamily: language === 'BURMESE' ? 'Akkhayar21, sans-serif' : 'inherit' }}
                                    />
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </motion.div>
                        );
                      })}

                      {/* Add Cue Button */}
                      <button
                        onClick={addCue}
                        className="w-full py-2.5 rounded-xl border border-dashed border-gray-300 dark:border-white/10 hover:border-indigo-400 hover:bg-indigo-500/5 text-slate-500 dark:text-zinc-400 text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Subtitle Cue</span>
                      </button>
                    </div>
                  ) : selectedItem.status === 'pending' ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3 py-20 text-center">
                      <div className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-white/5 flex items-center justify-center">
                        <Mic className="w-6 h-6 text-slate-300 dark:text-zinc-600" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-600 dark:text-zinc-300 mb-1">ထုတ်ယူရန် အဆင်သင့်ဖြစ်ပါသည်</p>
                        <p className="text-xs text-slate-400 dark:text-zinc-500">
                          "Transcribe This File" နှိပ်ပြီး Burma SRT ထုတ်ယူပါ
                        </p>
                      </div>
                      <button
                        onClick={() => handleProcess(selectedItem)}
                        disabled={isProcessingAll}
                        className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-bold shadow-md shadow-indigo-600/20 disabled:opacity-40 transition-all flex items-center gap-2"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        Transcribe This File
                      </button>
                    </div>
                  ) : null}
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
