import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { LoadingSpinner } from '../components/LoadingSpinner';
import {
  checkOneClickHealth,
  getBaseUrl,
  startOneClickJob,
  getOneClickJobStatus,
  getOneClickDownloadUrl,
  getOneClickStreamUrl,
  getOneClickSrtDownloadUrl,
  getOneClickTranscript,
  fetchOneClickUrlVideo,
  extractCleanUrl,
  type OneClickJobStatus,
  type OneClickHealthResponse,
  type OneClickTranscript,
} from '../services/oneclickApi';
import {
  Upload,
  Video,
  Play,
  Pause,
  Trash2,
  Sliders,
  Zap,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Download,
  RotateCcw,
  RefreshCw,
  FileText,
  Volume2,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Clapperboard,
  Eye,
  SlidersHorizontal,
  Copy,
  Check,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface DramaDubbingProps {
  onSpendCredits: (amount: number) => boolean;
  onNavigate?: (path: string) => void;
}

type DubbingMode = 'drama_dialogue' | 'drama_recap';

interface CharacterVoice {
  id: string;
  name: string;
  tag: string;
  role: string;
  gender: 'Male' | 'Female';
  description: string;
}

const DRAMA_VOICES: CharacterVoice[] = [
  {
    id: 'my-MM-KingBurma',
    name: 'King Burma (မင်းမြန်မာ)',
    tag: '👑 သခင်လေး / CEO / Male Lead',
    role: 'Young Master / CEO',
    gender: 'Male',
    description: 'Studio 99 & TikTok နာမည်ကြီး အသံနက် — ဆွဲဆောင်မှုအပြည့် ဇာတ်ဆောင်မင်းသားစတိုင်',
  },
  {
    id: 'my-MM-ZawNeural',
    name: 'Zaw (ဇော်)',
    tag: '🏛️ သူဌေးကြီး / စစ်ဗိုလ်ချုပ် / Master',
    role: 'Elder Boss / General',
    gender: 'Male',
    description: 'တည်ငြိမ်ရင့်ကျက် ဩဇာပြည့် — အာဏာပိုင်၊ ဘိုးဘိုးကြီး၊ လူကြီးဇာတ်ကောင်',
  },
  {
    id: 'my-MM-ThihaNeural',
    name: 'Thiha (သီဟ)',
    tag: '⚡ လူငယ်ဇာတ်ကောင် / Action Hero',
    role: 'Energetic Lead',
    gender: 'Male',
    description: 'ခန့်ညားပြတ်သား — သွက်လက်သော အက်ရှင်နှင့် လူငယ်ဇာတ်ဆောင်',
  },
  {
    id: 'my-MM-NilarNeural',
    name: 'Nilar (နီလာ)',
    tag: '🌸 မင်းသမီး / Female Lead / Young Lady',
    role: 'Female Lead',
    gender: 'Female',
    description: 'သဘာဝကျ ချိုသာကြည်လင် — ဒရမ်မာမင်းသမီးနှင့် အမျိုးသမီးဇာတ်ကောင်စစ်စစ်',
  },
  {
    id: 'fenrir',
    name: 'Gemini Fenrir (နက်ရှိုင်းအသံ)',
    tag: '🎙️ Cinematic Masterpiece',
    role: 'Dramatic Storyteller',
    gender: 'Male',
    description: 'Deep cinematic resonance — Team Alpha recap နှင့် ဇာတ်ရှိန်မြှင့်ဇာတ်လမ်းများအတွက်',
  },
];

const STEP_LABELS: Record<string, string> = {
  upload: 'Uploading Video ဖိုင်တင်နေသည်...',
  download: 'URL မှ တရုတ်ဒရမ်မာ ဒေါင်းလုဒ်လုပ်နေသည်...',
  init: 'AI Studio Engine စတင်ပြင်ဆင်နေသည်...',
  audio_extract: 'မူရင်းအသံနှင့် BGM သီးခြားခွဲထုတ်နေသည်...',
  transcription: 'Whisper AI တရုတ်စကားပြော ဖမ်းယူနေသည် (Putonghua ASR)...',
  segmentation: 'ဇာတ်ကောင် စကားပြော Timeline အညီ စီစဉ်နေသည်...',
  translation: 'Gemini AI ဒရမ်မာ အသံသရုပ်ဆောင် မြန်မာဘာသာပြန်နေသည်...',
  voice_synthesis: 'Studio 99 / Team Alpha စတိုင် အသံသွင်းနေသည်...',
  rendering: 'မူရင်း BGM + SFX + Akkhayar စာတန်းထိုး ပေါင်းစပ်နေသည်...',
};

const DramaDubbing: React.FC<DramaDubbingProps> = ({ onSpendCredits, onNavigate }) => {
  const [serverStatus, setServerStatus] = useState<OneClickHealthResponse | null>(null);
  const [isCheckingServer, setIsCheckingServer] = useState(true);

  // Input state
  const [inputMode, setInputMode] = useState<'upload' | 'url'>('upload');
  const [videoUrl, setVideoUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isFetchingUrl, setIsFetchingUrl] = useState(false);
  const [tempId, setTempId] = useState<string | null>(null);

  // Drama dubbing options
  const [dubbingMode, setDubbingMode] = useState<DubbingMode>('drama_dialogue');
  const [selectedVoice, setSelectedVoice] = useState('my-MM-KingBurma');
  const [selectedSpeed, setSelectedSpeed] = useState('+0%');
  const [selectedRatio, setSelectedRatio] = useState('9:16');
  const [bgmVolume, setBgmVolume] = useState(18); // 18% original sound preservation

  // Subtitle & Chinese Masking
  const [enableSubtitles, setEnableSubtitles] = useState(true);
  const [enableBlur, setEnableBlur] = useState(true);
  const [blurPosition, setBlurPosition] = useState(82); // Y %
  const [blurThickness, setBlurThickness] = useState(13); // Height %
  const [blurWidth, setBlurWidth] = useState(88); // Width %
  const [blurIntensity, setBlurIntensity] = useState(35);
  const [subtitleY, setSubtitleY] = useState(82);

  // Advanced toggles
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [watermarkText, setWatermarkText] = useState('');

  // Preview video player
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const [previewDuration, setPreviewDuration] = useState(0);
  const [previewCurrentTime, setPreviewCurrentTime] = useState(0);
  const [previewIsPlaying, setPreviewIsPlaying] = useState(false);

  // Pipeline job state
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<OneClickJobStatus | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [transcript, setTranscript] = useState<OneClickTranscript | null>(null);
  const [isCopiedScript, setIsCopiedScript] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Server health check
  const checkHealth = useCallback(async () => {
    setIsCheckingServer(true);
    try {
      const res = await checkOneClickHealth();
      setServerStatus(res);
    } catch {
      setServerStatus(null);
    } finally {
      setIsCheckingServer(false);
    }
  }, []);

  useEffect(() => {
    checkHealth();
  }, [checkHealth]);

  // Clean preview blob URLs
  useEffect(() => {
    return () => {
      if (filePreviewUrl && filePreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(filePreviewUrl);
      }
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [filePreviewUrl]);

  // Drag and drop handlers
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.type.startsWith('video/')) {
      if (droppedFile.size > 500 * 1024 * 1024) {
        toast.error('ဗီဒီယိုဖိုင်အရွယ်အစား 500MB ထက် မကျော်ရပါ');
        return;
      }
      setFile(droppedFile);
      setTempId(null);
      if (filePreviewUrl && filePreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(filePreviewUrl);
      }
      setFilePreviewUrl(URL.createObjectURL(droppedFile));
      toast.success(`${droppedFile.name} ရွေးချယ်ပြီးပါပြီ`);
    } else {
      toast.error('ဗီဒီယိုဖိုင် (MP4 / MOV) သာ ထည့်သွင်းပေးပါ');
    }
  }, [filePreviewUrl]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      if (selected.size > 500 * 1024 * 1024) {
        toast.error('ဗီဒီယိုဖိုင်အရွယ်အစား 500MB ထက် မကျော်ရပါ');
        return;
      }
      setFile(selected);
      setTempId(null);
      if (filePreviewUrl && filePreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(filePreviewUrl);
      }
      setFilePreviewUrl(URL.createObjectURL(selected));
      toast.success(`${selected.name} ရွေးချယ်ပြီးပါပြီ`);
    }
  };

  // URL Fetch pre-download
  const handleFetchUrl = async () => {
    const clean = extractCleanUrl(videoUrl);
    if (!clean) {
      toast.error('တရုတ်ဒရမ်မာ ဗီဒီယို Link ထည့်သွင်းပေးပါ');
      return;
    }
    setIsFetchingUrl(true);
    try {
      toast.loading('ဗီဒီယို ရယူနေသည်...', { id: 'fetch-drama' });
      const res = await fetchOneClickUrlVideo(clean);
      setTempId(res.temp_id);
      setFile(null);
      setFilePreviewUrl(res.preview_url);
      toast.success(`ဗီဒီယို ရယူပြီးပါပြီ (${Math.round(res.duration)}s)`, { id: 'fetch-drama' });
    } catch (err: any) {
      toast.error(err.message || 'ဗီဒီယို ဒေါင်းလုဒ် ရယူ၍ မရပါ', { id: 'fetch-drama' });
    } finally {
      setIsFetchingUrl(false);
    }
  };

  // Video playback controls
  const togglePlay = () => {
    if (!previewVideoRef.current) return;
    if (previewVideoRef.current.paused) {
      previewVideoRef.current.play().then(() => setPreviewIsPlaying(true)).catch(() => {});
    } else {
      previewVideoRef.current.pause();
      setPreviewIsPlaying(false);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = Number(e.target.value);
    setPreviewCurrentTime(time);
    if (previewVideoRef.current) {
      previewVideoRef.current.currentTime = time;
    }
  };

  // Poll Job Status
  const pollStatus = useCallback((id: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const s = await getOneClickJobStatus(id);
        setJobStatus(s);
        if (s.status === 'completed') {
          if (pollRef.current) clearInterval(pollRef.current);
          toast.success('🎉 တရုတ်ကား Dubbing အောင်မြင်စွာ ပြုလုပ်ပြီးပါပြီ!');
          try {
            const t = await getOneClickTranscript(id);
            setTranscript(t);
          } catch {}
        } else if (s.status === 'failed') {
          if (pollRef.current) clearInterval(pollRef.current);
          toast.error(`လုပ်ဆောင်ချက် မအောင်မြင်ပါ: ${s.message || s.error || 'Unknown error'}`);
        }
      } catch {
        // network retry
      }
    }, 2000);
  }, []);

  // Start Dubbing Pipeline
  const handleStartDubbing = async () => {
    if (!file && !tempId && !videoUrl.trim()) {
      toast.error('ဗီဒီယိုဖိုင် သို့မဟုတ် ဗီဒီယို Link တစ်ခုခု ထည့်သွင်းပေးပါ');
      return;
    }
    if (!onSpendCredits(20)) {
      return;
    }

    setIsStarting(true);
    setUploadProgress(0);
    setJobStatus(null);
    setTranscript(null);

    try {
      const resp = await startOneClickJob(
        {
          file: file || undefined,
          tempId: tempId || undefined,
          videoUrl: (!file && !tempId && videoUrl.trim()) ? extractCleanUrl(videoUrl) : undefined,
        },
        {
          voice: selectedVoice,
          speed: selectedSpeed,
          ratio: selectedRatio,
          enableSubtitles,
          enableBlur,
          blurPosition,
          blurThickness,
          blurWidth,
          blurIntensity,
          subtitleY,
          subtitleStyle: 'font-akkhayar',
          watermarkText: watermarkText.trim(),
          includeOriginalAudio: true, // preserve dramatic SFX & BGM
          bgmVolume: Number((bgmVolume / 100).toFixed(2)),
          sourceLang: 'zh', // Chinese Douyin/TikTok
          dubbingMode,
        },
        (pct) => setUploadProgress(pct)
      );

      setJobId(resp.job_id);
      toast.success('🎬 တရုတ်ဒရမ်မာ Dubbing စတင်နေပါပြီ...');
      pollStatus(resp.job_id);
    } catch (err: any) {
      toast.error(err.message || 'စတင်၍ မရပါ');
    } finally {
      setIsStarting(false);
    }
  };

  const copyScriptToClipboard = () => {
    if (!transcript?.myanmar_segments) return;
    const text = transcript.myanmar_segments.map((s, i) => `[${i + 1}] ${s.narration}`).join('\n');
    navigator.clipboard.writeText(text);
    setIsCopiedScript(true);
    toast.success('မြန်မာ စကားပြော ဒိုင်ယာလော့ဂ် စာသား ကူးယူပြီးပါပြီ');
    setTimeout(() => setIsCopiedScript(false), 2500);
  };

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-6 py-6 sm:py-8 space-y-6">
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-zinc-900 via-zinc-900 to-amber-950/40 border border-amber-500/20 p-5 sm:p-7 shadow-2xl">
        <div className="absolute top-0 right-0 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase bg-amber-500/10 text-amber-400 border border-amber-500/30">
              <Sparkles className="w-3.5 h-3.5" />
              Studio 99 & Team Alpha Model
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-2.5">
              <span>တရုတ်ဒရမ်မာ AI Dubbing Studio</span>
            </h1>
            <p className="text-xs sm:text-sm text-zinc-400 max-w-2xl leading-relaxed">
              Douyin, TikTok နှင့် Shorts မှ တရုတ်ဇာတ်လမ်းတိုများကို Studio 99 & Team Alpha စတိုင် စိတ်ခံစားမှုပြည့်ဝသော <strong className="text-amber-400">ဇာတ်ကောင် စကားပြော ဒိုင်ယာလော့ဂ်</strong> သို့မဟုတ် <strong className="text-amber-400">သွက်လက်သော Dramatic Recap</strong> အဖြစ် မူရင်းအသံဖျက်၊ Akkhayar 21 စာတန်းထိုးနှင့် အသံတီးလုံး (BGM/SFX) ထိန်းသိမ်းကာ တစ်ချက်နှိပ်ရုံဖြင့် အလိုအလျောက် အသံသွင်းပေးမည်။
            </p>
          </div>

          <div className="flex items-center gap-2 self-start md:self-center">
            <div className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-2 border ${
              serverStatus?.online
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
            }`}>
              <span className={`w-2 h-2 rounded-full ${serverStatus?.online ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
              <span>{serverStatus?.online ? 'GPU Engine Online' : 'Connecting Engine...'}</span>
            </div>
            <button
              onClick={checkHealth}
              disabled={isCheckingServer}
              className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
              title="Refresh status"
            >
              <RefreshCw className={`w-4 h-4 ${isCheckingServer ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid: Input & Studio Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Video Input & Live Preview (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          {/* Input Selector Card */}
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-white/5 rounded-2xl p-4 sm:p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/5 pb-3">
              <h2 className="text-sm sm:text-base font-bold text-slate-800 dark:text-zinc-200 flex items-center gap-2">
                <Video className="w-4 h-4 text-amber-500" />
                တရုတ်ကား ရွေးချယ်ရန် (Video Source)
              </h2>
              <div className="flex bg-slate-100 dark:bg-zinc-800 p-0.5 rounded-lg text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setInputMode('upload')}
                  className={`px-3 py-1 rounded-md transition-all ${
                    inputMode === 'upload'
                      ? 'bg-white dark:bg-zinc-900 text-slate-900 dark:text-white shadow-sm font-semibold'
                      : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-white'
                  }`}
                >
                  Upload Video
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode('url')}
                  className={`px-3 py-1 rounded-md transition-all ${
                    inputMode === 'url'
                      ? 'bg-white dark:bg-zinc-900 text-slate-900 dark:text-white shadow-sm font-semibold'
                      : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-white'
                  }`}
                >
                  Douyin / TikTok Link
                </button>
              </div>
            </div>

            {inputMode === 'upload' ? (
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={`relative border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer ${
                  isDragging
                    ? 'border-amber-500 bg-amber-500/5'
                    : 'border-slate-200 dark:border-zinc-700 hover:border-amber-500/50 bg-slate-50/50 dark:bg-zinc-950/40'
                }`}
              >
                <input
                  type="file"
                  accept="video/mp4,video/quicktime,video/webm"
                  onChange={handleFileChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <div className="flex flex-col items-center justify-center space-y-2 pointer-events-none">
                  <div className="w-12 h-12 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
                    <Upload className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-zinc-200">
                      {file ? file.name : 'တရုတ်ကား ဗီဒီယိုဖိုင် ဆွဲတင်ပါ သို့မဟုတ် နှိပ်၍ရွေးပါ'}
                    </p>
                    <p className="text-xs text-slate-400 dark:text-zinc-500 mt-1">
                      MP4, MOV (Douyin, TikTok, Reels အထောက်အပံ့ပြုသည် — Max 500MB)
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    placeholder="Douyin, TikTok, YouTube Shorts သို့မဟုတ် Kuaishou Link ထည့်ပါ..."
                    className="flex-1 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-zinc-600 focus:outline-none focus:border-amber-500"
                  />
                  <button
                    type="button"
                    onClick={handleFetchUrl}
                    disabled={isFetchingUrl || !videoUrl.trim()}
                    className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-bold text-xs sm:text-sm rounded-xl transition-all shadow-md shadow-amber-500/20 whitespace-nowrap"
                  >
                    {isFetchingUrl ? 'ရယူနေသည်...' : 'Fetch Video'}
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 dark:text-zinc-500">
                  💡 TikTok, Douyin နှင့် Rednote Video link များကို တိုက်ရိုက် auto-download ပြုလုပ်ပေးပြီး Preview ပြသပေးမည်။
                </p>
              </div>
            )}
          </div>

          {/* Interactive Live Video Canvas & Calibration Box */}
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-white/5 rounded-2xl p-4 sm:p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/5 pb-3">
              <h2 className="text-sm sm:text-base font-bold text-slate-800 dark:text-zinc-200 flex items-center gap-2">
                <Eye className="w-4 h-4 text-amber-500" />
                Live Video Preview & ချိန်ညှိချက်
              </h2>
              <span className="text-[11px] font-mono text-slate-500 dark:text-zinc-400">
                {previewDuration > 0
                  ? `${Math.floor(previewCurrentTime / 60)}:${String(Math.floor(previewCurrentTime % 60)).padStart(2, '0')} / ${Math.floor(previewDuration / 60)}:${String(Math.floor(previewDuration % 60)).padStart(2, '0')}`
                  : '0:00 / 0:00'}
              </span>
            </div>

            <div className="relative aspect-[9/16] max-h-[460px] mx-auto bg-black rounded-xl overflow-hidden shadow-inner flex items-center justify-center">
              {filePreviewUrl ? (
                <>
                  <video
                    ref={previewVideoRef}
                    src={filePreviewUrl}
                    preload="metadata"
                    onTimeUpdate={() => {
                      if (previewVideoRef.current) {
                        setPreviewCurrentTime(previewVideoRef.current.currentTime);
                      }
                    }}
                    onLoadedMetadata={() => {
                      if (previewVideoRef.current) {
                        setPreviewDuration(previewVideoRef.current.duration || 0);
                      }
                    }}
                    onPlay={() => setPreviewIsPlaying(true)}
                    onPause={() => setPreviewIsPlaying(false)}
                    className="w-full h-full object-contain pointer-events-none"
                    playsInline
                  />

                  {/* Chinese Subtitle Mask Blur Box Overlay */}
                  {enableBlur && (
                    <div
                      style={{
                        position: 'absolute',
                        top: `${Math.max(0, Math.min(100 - blurThickness, blurPosition - blurThickness / 2))}%`,
                        height: `${blurThickness}%`,
                        left: blurWidth >= 100 ? '0%' : `${Math.max(0, Math.min(100 - blurWidth, (100 - blurWidth) / 2))}%`,
                        width: `${Math.min(100, Math.max(25, blurWidth))}%`,
                      }}
                      className="border border-dashed border-amber-400/80 bg-black/60 backdrop-blur-md flex items-center justify-center transition-all pointer-events-none z-10"
                    >
                      <span className="text-[10px] text-amber-300 font-bold bg-black/70 px-2 py-0.5 rounded shadow">
                        🇨🇳 တရုတ်စာတန်း ဖျက်မည့်နေရာ ({blurPosition}%)
                      </span>
                    </div>
                  )}

                  {/* Akkhayar 21 Burmese Subtitle Preview Overlay */}
                  {enableSubtitles && (
                    <div
                      style={{
                        position: 'absolute',
                        top: `${subtitleY}%`,
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        width: '88%',
                      }}
                      className="text-center pointer-events-none z-20"
                    >
                      <span
                        style={{
                          fontFamily: 'Akkhayar21, Pyidaungsu, sans-serif',
                          color: '#FFE600',
                          textShadow: '0 0 4px #000, 0 0 4px #000, 1px 1px 2px #000, -1px -1px 2px #000, 1px -1px 2px #000, -1px 1px 2px #000',
                          fontSize: '17px',
                          fontWeight: 'bold',
                        }}
                        className="inline-block px-3 py-1 bg-black/40 rounded"
                      >
                        {dubbingMode === 'drama_dialogue' ? 'သခင်လေး... ကျမ တောင်းပန်ပါတယ်!' : 'ဒီတစ်ခါမှာတော့ သခင်မကြီး ရောက်လာတဲ့အခါ...'}
                      </span>
                    </div>
                  )}

                  {/* Play / Pause button overlay */}
                  <button
                    onClick={togglePlay}
                    className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/30 transition-all z-30 group"
                  >
                    <div className="w-14 h-14 rounded-full bg-black/70 text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                      {previewIsPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
                    </div>
                  </button>
                </>
              ) : (
                <div className="text-center p-6 text-zinc-500 space-y-2">
                  <Clapperboard className="w-12 h-12 mx-auto text-zinc-600" />
                  <p className="text-xs sm:text-sm font-medium">ဗီဒီယိုဖိုင် တင်ပြီးပါက ဤနေရာတွင် Preview ပေါ်လာပါမည်</p>
                  <p className="text-[11px] text-zinc-600">တရုတ်စာတန်းထိုး ဖျက်မည့် Blur bar နှင့် မြန်မာစာတန်းထိုး နေရာကို တိုက်ရိုက် ကြည့်ရှုချိန်ညှိနိုင်သည်</p>
                </div>
              )}
            </div>

            {/* Scrubber */}
            {filePreviewUrl && previewDuration > 0 && (
              <div className="space-y-1">
                <input
                  type="range"
                  min={0}
                  max={previewDuration}
                  step={0.1}
                  value={previewCurrentTime}
                  onChange={handleSeek}
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Studio 99 & Team Alpha Configuration (5 cols) */}
        <div className="lg:col-span-5 space-y-5">
          {/* Dubbing Mode Selection (Cards) */}
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-white/5 rounded-2xl p-4 sm:p-5 shadow-sm space-y-4">
            <h2 className="text-sm sm:text-base font-bold text-slate-800 dark:text-zinc-200 flex items-center gap-2 border-b border-slate-100 dark:border-white/5 pb-3">
              <Clapperboard className="w-4 h-4 text-amber-500" />
              Dubbing စတိုင် ရွေးချယ်ပါ (Dubbing Mode)
            </h2>

            <div className="grid grid-cols-1 gap-3">
              {/* Card 1: Drama Dialogue Acting */}
              <button
                type="button"
                onClick={() => setDubbingMode('drama_dialogue')}
                className={`p-3.5 rounded-xl border text-left transition-all relative ${
                  dubbingMode === 'drama_dialogue'
                    ? 'border-amber-500 bg-amber-500/10 shadow-sm ring-1 ring-amber-500/30'
                    : 'border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700 bg-slate-50/50 dark:bg-zinc-950/40'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-xs font-bold text-amber-500 uppercase tracking-wide">Studio 99 Style</span>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                      🎭 ဇာတ်ကောင် စကားပြော Dubbing
                    </h3>
                  </div>
                  {dubbingMode === 'drama_dialogue' && (
                    <CheckCircle2 className="w-5 h-5 text-amber-500" />
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1.5 leading-relaxed">
                  သခင်လေး၊ သူဌေးကြီး၊ မင်းသမီးတို့ ကိုယ်တိုင်ပြောသလို စိတ်ခံစားမှုပြည့်ဝသော <strong>မြန်မာစကားပြော ဒိုင်ယာလော့ဂ်</strong> စစ်စစ် အသံသွင်းပေးမည်။
                </p>
              </button>

              {/* Card 2: Team Alpha Recap */}
              <button
                type="button"
                onClick={() => setDubbingMode('drama_recap')}
                className={`p-3.5 rounded-xl border text-left transition-all relative ${
                  dubbingMode === 'drama_recap'
                    ? 'border-amber-500 bg-amber-500/10 shadow-sm ring-1 ring-amber-500/30'
                    : 'border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700 bg-slate-50/50 dark:bg-zinc-950/40'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-xs font-bold text-amber-500 uppercase tracking-wide">Team Alpha Style</span>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                      ⚡ Team Alpha Dramatic Recap
                    </h3>
                  </div>
                  {dubbingMode === 'drama_recap' && (
                    <CheckCircle2 className="w-5 h-5 text-amber-500" />
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1.5 leading-relaxed">
                  "ဒီတစ်ခါမှာတော့...", "သခင်မကြီး ရောက်လာတဲ့အခါ..." စသည့် ပရိသတ်ကို စက္ကန့်မလပ် ဆွဲဆောင်မည့် အလွန်သွက်လက်သော <strong>Cliffhanger Recap</strong> ဇာတ်လမ်းပြောဟန်။
                </p>
              </button>
            </div>
          </div>

          {/* Character Voice Persona Card */}
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-white/5 rounded-2xl p-4 sm:p-5 shadow-sm space-y-4">
            <h2 className="text-sm sm:text-base font-bold text-slate-800 dark:text-zinc-200 flex items-center gap-2 border-b border-slate-100 dark:border-white/5 pb-3">
              <Volume2 className="w-4 h-4 text-amber-500" />
              ဇာတ်ကောင် အသံ ရွေးချယ်ပါ (Voice Persona)
            </h2>

            <div className="space-y-2">
              {DRAMA_VOICES.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setSelectedVoice(v.id)}
                  className={`w-full p-2.5 rounded-xl border text-left transition-all ${
                    selectedVoice === v.id
                      ? 'border-amber-500 bg-amber-500/10 shadow-sm'
                      : 'border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700 bg-slate-50/40 dark:bg-zinc-950/30'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 dark:text-white">{v.tag}</span>
                    <span className="text-[10px] text-zinc-400 font-mono">{v.name}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">{v.description}</p>
                </button>
              ))}
            </div>

            {/* Speaking Speed */}
            <div className="pt-2 border-t border-slate-100 dark:border-white/5">
              <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300 block mb-1.5">
                အသံပြောနှုန်း (Speech Speed)
              </label>
              <div className="grid grid-cols-4 gap-1.5 text-xs font-medium">
                {[
                  { val: '-25%', label: '0.75x' },
                  { val: '+0%', label: '1.0x (မူရင်း)' },
                  { val: '+15%', label: '1.15x (သွက်)' },
                  { val: '+25%', label: '1.25x' },
                ].map((s) => (
                  <button
                    key={s.val}
                    type="button"
                    onClick={() => setSelectedSpeed(s.val)}
                    className={`py-1.5 rounded-lg border text-center transition-all ${
                      selectedSpeed === s.val
                        ? 'border-amber-500 bg-amber-500 text-white font-bold'
                        : 'border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-400 bg-slate-50 dark:bg-zinc-800'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Audio Ducking & BGM SFX Balance */}
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-white/5 rounded-2xl p-4 sm:p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/5 pb-3">
              <h2 className="text-sm sm:text-base font-bold text-slate-800 dark:text-zinc-200 flex items-center gap-2">
                <Sliders className="w-4 h-4 text-amber-500" />
                မူရင်း BGM & SFX အသံထိန်းသိမ်းမှု (Audio Ducking)
              </h2>
              <span className="text-xs font-bold text-amber-500 font-mono">{bgmVolume}%</span>
            </div>

            <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">
              တရုတ်ဒရမ်မာကား၏ ရိုက်သံ၊ ထိုးသံ၊ ပြေးသံ၊ ဒရမ်မာ တီးလုံးသံများကို နောက်ခံအဖြစ် မပျောက်ပျက်စေရန် အလိုအလျောက် Ducking ပြုလုပ်ပေးထားပါသည်။
            </p>

            <input
              type="range"
              min={5}
              max={40}
              step={1}
              value={bgmVolume}
              onChange={(e) => setBgmVolume(Number(e.target.value))}
              className="w-full accent-amber-500 cursor-pointer"
            />

            <div className="flex items-center justify-between text-[11px] text-zinc-400 font-mono">
              <span>တီးလုံး တိုးတိုး (5%)</span>
              <span className="text-amber-500 font-bold">Studio 99 စံနှုန်း (18%)</span>
              <span>တီးလုံး ကျယ်ကျယ် (40%)</span>
            </div>
          </div>

          {/* Chinese Subtitle Mask Blur Bar & Akkhayar Subtitles */}
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-white/5 rounded-2xl p-4 sm:p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/5 pb-3">
              <h2 className="text-sm sm:text-base font-bold text-slate-800 dark:text-zinc-200 flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-amber-500" />
                တရုတ်စာတန်း ဖျက်ခြင်း & Akkhayar 21
              </h2>
            </div>

            <div className="space-y-3">
              {/* Chinese Mask Toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-800 dark:text-zinc-200">တရုတ်စာတန်းထိုး ဖျက်ရန် Blur Bar</span>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400">မူရင်း တရုတ်စာတန်းပေါ်သို့ မှန်ဝါးဘား အုပ်ပေးမည်</p>
                </div>
                <input
                  type="checkbox"
                  checked={enableBlur}
                  onChange={(e) => setEnableBlur(e.target.checked)}
                  className="w-4 h-4 accent-amber-500 cursor-pointer"
                />
              </div>

              {enableBlur && (
                <div className="p-3 bg-slate-50 dark:bg-zinc-950/60 rounded-xl space-y-2.5 border border-slate-200 dark:border-zinc-800 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 dark:text-zinc-400 font-medium">Blur နေရာ (Position Y)</span>
                    <span className="font-mono text-amber-500 font-bold">{blurPosition}%</span>
                  </div>
                  <input
                    type="range"
                    min={65}
                    max={95}
                    value={blurPosition}
                    onChange={(e) => setBlurPosition(Number(e.target.value))}
                    className="w-full accent-amber-500 cursor-pointer"
                  />

                  {/* Quick Preset Buttons */}
                  <div className="grid grid-cols-3 gap-1.5 pt-1 text-[11px]">
                    {[
                      { pos: 82, label: 'Standard Douyin (82%)' },
                      { pos: 78, label: 'Mid-Bottom (78%)' },
                      { pos: 86, label: 'Low Bar (86%)' },
                    ].map((p) => (
                      <button
                        key={p.pos}
                        type="button"
                        onClick={() => setBlurPosition(p.pos)}
                        className={`py-1 px-1 rounded border text-center transition-all ${
                          blurPosition === p.pos
                            ? 'border-amber-500 bg-amber-500 text-white font-bold'
                            : 'border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-400 bg-white dark:bg-zinc-900'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Subtitle Toggle */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-white/5">
                <div>
                  <span className="text-xs font-bold text-slate-800 dark:text-zinc-200">Akkhayar 21 စာတန်းထိုး (1-Line)</span>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400">Team Alpha ရွှေဝါရောင် အနက်ဘောင် စာတန်းထိုး</p>
                </div>
                <input
                  type="checkbox"
                  checked={enableSubtitles}
                  onChange={(e) => setEnableSubtitles(e.target.checked)}
                  className="w-4 h-4 accent-amber-500 cursor-pointer"
                />
              </div>

              {enableSubtitles && (
                <div className="p-3 bg-slate-50 dark:bg-zinc-950/60 rounded-xl space-y-2 border border-slate-200 dark:border-zinc-800 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 dark:text-zinc-400 font-medium">စာတန်းထိုး နေရာ (Y-axis)</span>
                    <span className="font-mono text-amber-500 font-bold">{subtitleY}%</span>
                  </div>
                  <input
                    type="range"
                    min={65}
                    max={95}
                    value={subtitleY}
                    onChange={(e) => setSubtitleY(Number(e.target.value))}
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                  <p className="text-[10px] text-zinc-500">
                    ✨ Team Alpha စံနှုန်းအတိုင်း ၁ ကြောင်းတည်း တိုရှင်း လိုရင်း ဖော်ပြပေးမည်။
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Action Trigger Button */}
          <button
            type="button"
            onClick={handleStartDubbing}
            disabled={isStarting || (!file && !tempId && !videoUrl.trim())}
            className="w-full py-4 bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 hover:from-amber-600 hover:to-amber-800 disabled:opacity-50 text-white font-extrabold text-base rounded-2xl shadow-xl shadow-amber-500/30 transition-all flex items-center justify-center gap-2.5 tracking-wide"
          >
            {isStarting ? (
              <>
                <LoadingSpinner size="sm" showLabel={false} />
                <span>Upload လုပ်နေသည် ({uploadProgress}%)...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                <span>တရုတ်ကား Dubbing စတင်ဖန်တီးမည် (20 Credits)</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Real-time Pipeline Progress Tracker */}
      {jobStatus && (
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-white/10 rounded-2xl p-5 sm:p-6 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-white/5 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className={`w-3 h-3 rounded-full ${
                  jobStatus.status === 'completed'
                    ? 'bg-emerald-400'
                    : jobStatus.status === 'failed'
                    ? 'bg-rose-400'
                    : 'bg-amber-400 animate-ping'
                }`} />
                <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                  {jobStatus.status === 'completed'
                    ? '🎉 Dubbing ပြီးစီးပါပြီ!'
                    : jobStatus.status === 'failed'
                    ? '❌ လုပ်ဆောင်ချက် မအောင်မြင်ပါ'
                    : '🎬 တရုတ်ဒရမ်မာ AI Dubbing ပြုလုပ်နေသည်...'}
                </h3>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400 mt-1 font-mono">
                {STEP_LABELS[jobStatus.step] || jobStatus.message}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-2xl font-black text-amber-500 font-mono">
                {Math.max(0, jobStatus.progress)}%
              </span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-slate-100 dark:bg-zinc-800 h-3 rounded-full overflow-hidden p-0.5 shadow-inner">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                jobStatus.status === 'completed'
                  ? 'bg-emerald-500 shadow-lg shadow-emerald-500/50'
                  : jobStatus.status === 'failed'
                  ? 'bg-rose-500'
                  : 'bg-gradient-to-r from-amber-500 via-amber-400 to-amber-600 animate-pulse shadow-lg shadow-amber-500/50'
              }`}
              style={{ width: `${Math.max(3, jobStatus.progress)}%` }}
            />
          </div>

          {/* Output Action Panel when completed */}
          {jobStatus.status === 'completed' && jobId && (
            <div className="mt-6 pt-5 border-t border-slate-100 dark:border-white/5 space-y-5">
              {/* Output Video Player */}
              <div className="max-w-md mx-auto aspect-[9/16] max-h-[520px] bg-black rounded-xl overflow-hidden shadow-2xl">
                <video
                  src={getOneClickStreamUrl(jobId)}
                  controls
                  autoPlay
                  playsInline
                  className="w-full h-full object-contain"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-center gap-3">
                <a
                  href={getOneClickDownloadUrl(jobId)}
                  download={`drama_dubbing_${jobId}.mp4`}
                  className="px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl transition-all shadow-lg shadow-emerald-600/20 flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Download 1080p MP4
                </a>

                <a
                  href={getOneClickSrtDownloadUrl(jobId)}
                  download={`subtitles_${jobId}.srt`}
                  className="px-4 py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold text-sm rounded-xl transition-all flex items-center gap-2"
                >
                  <FileText className="w-4 h-4" />
                  Download .SRT
                </a>

                {transcript?.myanmar_segments && (
                  <button
                    type="button"
                    onClick={copyScriptToClipboard}
                    className="px-4 py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold text-sm rounded-xl transition-all flex items-center gap-2"
                  >
                    {isCopiedScript ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    <span>{isCopiedScript ? 'Copied Script!' : 'Copy Script'}</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DramaDubbing;