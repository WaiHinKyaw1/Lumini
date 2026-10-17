import React, { useState, useEffect, useRef, useCallback } from 'react';
import { LoadingSpinner } from '../components/LoadingSpinner';
import {
  checkOneClickHealth,
  getOneClickVoices,
  startOneClickJob,
  getOneClickJobStatus,
  getOneClickDownloadUrl,
  getOneClickTranscript,
  type OneClickVoice,
  type OneClickSpeed,
  type OneClickRatio,
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
  Sparkles,
  Zap,
  Layers,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Download,
  RotateCcw,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface OneClickProps {
  onSpendCredits: (amount: number) => boolean;
}

const STEP_LABELS: Record<string, string> = {
  upload: 'Uploading Video...',
  download: 'Downloading Video from URL...',
  init: 'Preparing Pipeline...',
  audio_extract: 'Extracting Audio...',
  transcription: 'Whisper Transcription...',
  segmentation: 'Smart Segmentation...',
  translation: 'Gemini Burmese Translation...',
  voice_synthesis: 'Edge TTS Voice Synthesis...',
  rendering: 'Timeline Sync Video Rendering...',
};

const OneClick: React.FC<OneClickProps> = ({ onSpendCredits }) => {
  const [serverStatus, setServerStatus] = useState<OneClickHealthResponse | null>(null);
  const [isCheckingServer, setIsCheckingServer] = useState(true);

  // Mode: Upload file or URL
  const [inputMode, setInputMode] = useState<'upload' | 'url'>('upload');
  const [videoUrl, setVideoUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Settings
  const [selectedVoice, setSelectedVoice] = useState('my-MM-NilarNeural');
  const [voiceMode, setVoiceMode] = useState<'preset' | 'custom-sample'>('preset');
  const [voiceSampleFile, setVoiceSampleFile] = useState<File | null>(null);
  const [voiceSampleUrl, setVoiceSampleUrl] = useState<string | null>(null);
  const [selectedSpeed, setSelectedSpeed] = useState('+35%');
  const [selectedRatio, setSelectedRatio] = useState<string>('16:9');
  const [enableSubtitles, setEnableSubtitles] = useState(true);
  const [subtitleStyle, setSubtitleStyle] = useState('font-akkhayar');

  // Frosted Glass Blur Settings
  const [enableBlur, setEnableBlur] = useState(true);
  const [blurPosition, setBlurPosition] = useState<number>(78);
  const [blurThickness, setBlurThickness] = useState<number>(14);
  const [blurIntensity, setBlurIntensity] = useState<number>(30);

  // Logo / Watermark Settings (Movie Recap style)
  const [watermarkText, setWatermarkText] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoY, setLogoY] = useState<number>(8);
  const [logoAlign, setLogoAlign] = useState<'left' | 'center' | 'right'>('right');
  const [logoScale, setLogoScale] = useState<number>(12);
  const [logoOpacity, setLogoOpacity] = useState<number>(100);

  const [includeOriginalAudio, setIncludeOriginalAudio] = useState(false);

  // Video Preview State (Throttled for zero playback lag)
  const [previewCurrentTime, setPreviewCurrentTime] = useState(0);
  const [previewDuration, setPreviewDuration] = useState(0);
  const [previewIsPlaying, setPreviewIsPlaying] = useState(false);

  // Job & Progress
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<OneClickJobStatus | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Script & Output
  const [transcript, setTranscript] = useState<OneClickTranscript | null>(null);
  const [copiedScript, setCopiedScript] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const videoPlayerRef = useRef<HTMLVideoElement>(null);
  const voiceSampleInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTimeRef = useRef<number>(0);

  // Determine if video source has been provided
  const hasVideo = (inputMode === 'url' && Boolean(videoUrl.trim())) || (inputMode === 'upload' && Boolean(file));

  // Load server status
  useEffect(() => {
    const init = async () => {
      setIsCheckingServer(true);
      try {
        const [health] = await Promise.all([
          checkOneClickHealth().catch(() => null),
          getOneClickVoices().catch(() => null),
        ]);
        setServerStatus(health);
      } catch {
        setServerStatus(null);
      }
      setIsCheckingServer(false);
    };
    init();
  }, []);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
      if (voiceSampleUrl) URL.revokeObjectURL(voiceSampleUrl);
      if (logoUrl) URL.revokeObjectURL(logoUrl);
    };
  }, [filePreviewUrl, voiceSampleUrl, logoUrl]);

  const handleFileSelect = useCallback((selectedFile: File) => {
    const validExts = /\.(mp4|webm|avi|mov|mkv)$/i;
    if (!validExts.test(selectedFile.name) && !selectedFile.type.startsWith('video/')) {
      setError('MP4, WebM, MOV, MKV ဗီဒီယိုဖိုင်သာ ထည့်သွင်းပေးပါ');
      return;
    }
    if (selectedFile.size > 500 * 1024 * 1024) {
      setError('ဗီဒီယိုဖိုင်ဆိုဒ် 500MB ထက်မကျော်ရပါ');
      return;
    }

    if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);

    setFile(selectedFile);
    setFilePreviewUrl(URL.createObjectURL(selectedFile));
    setPreviewCurrentTime(0);
    setPreviewIsPlaying(false);
    setError(null);
    setJobId(null);
    setJobStatus(null);
    setTranscript(null);
  }, [filePreviewUrl]);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      if (!f.type.startsWith('image/')) {
        setError('Logo အတွက် Image ဖိုင် (.png, .jpg, .webp) ရွေးပေးပါ');
        return;
      }
      if (logoUrl) URL.revokeObjectURL(logoUrl);
      setLogoFile(f);
      setLogoUrl(URL.createObjectURL(f));
      if (logoInputRef.current) logoInputRef.current.value = '';
      toast.success('Channel Logo ရုပ်ပုံ တင်သွင်းပြီးပါပြီ');
    }
  };

  const handleRemoveLogo = () => {
    if (logoUrl) URL.revokeObjectURL(logoUrl);
    setLogoFile(null);
    setLogoUrl(null);
    if (logoInputRef.current) logoInputRef.current.value = '';
    toast.success('Logo ရုပ်ပုံကို ဖယ်ရှားလိုက်ပါသည်');
  };

  const handleVoiceSampleSelect = (audioFile: File) => {
    if (!audioFile.type.startsWith('audio/') && !/\.(mp3|wav|m4a|webm|ogg)$/i.test(audioFile.name)) {
      setError('MP3, WAV, M4A, WebM အသံဖိုင်သာ ထည့်သွင်းပေးပါ');
      return;
    }
    if (voiceSampleUrl) URL.revokeObjectURL(voiceSampleUrl);
    setVoiceSampleFile(audioFile);
    setVoiceSampleUrl(URL.createObjectURL(audioFile));
    setError(null);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) handleFileSelect(e.target.files[0]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.[0]) handleFileSelect(e.dataTransfer.files[0]);
  };

  // High performance throttled time update to eliminate mobile & PC playback lag
  const handleTimeUpdate = () => {
    const v = previewVideoRef.current;
    if (!v) return;
    const now = performance.now();
    if (now - lastTimeRef.current >= 160) {
      lastTimeRef.current = now;
      setPreviewCurrentTime(v.currentTime);
    }
  };

  const togglePreviewPlay = () => {
    if (!previewVideoRef.current) return;
    if (previewVideoRef.current.paused) {
      previewVideoRef.current.play().then(() => setPreviewIsPlaying(true)).catch(() => {});
    } else {
      previewVideoRef.current.pause();
      setPreviewIsPlaying(false);
      setPreviewCurrentTime(previewVideoRef.current.currentTime);
    }
  };

  const handlePreviewSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setPreviewCurrentTime(val);
    if (previewVideoRef.current) {
      previewVideoRef.current.currentTime = val;
    }
  };

  const formatTimeSimple = (sec: number): string => {
    if (!Number.isFinite(sec) || sec < 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleStart = async () => {
    if (inputMode === 'upload' && !file) {
      setError('ဗီဒီယိုဖိုင် ရွေးချယ်ပေးပါ');
      return;
    }
    if (inputMode === 'url' && !videoUrl.trim()) {
      setError('YouTube သို့မဟုတ် TikTok Link ထည့်သွင်းပေးပါ');
      return;
    }
    if (!onSpendCredits(15)) return;

    setError(null);
    setIsUploading(true);
    setJobStatus(null);
    setTranscript(null);

    try {
      const resp = await startOneClickJob(
        {
          file: inputMode === 'upload' ? file : null,
          videoUrl: inputMode === 'url' ? videoUrl.trim() : undefined,
        },
        {
          voice: selectedVoice,
          speed: selectedSpeed,
          ratio: selectedRatio,
          enableSubtitles,
          enableBlur,
          blurPosition,
          blurThickness,
          blurIntensity,
          subtitleStyle,
          watermarkText: watermarkText.trim(),
          logoFile: inputMode === 'upload' ? logoFile : null,
          logoY,
          logoAlign,
          logoScale,
          logoOpacity: logoOpacity / 100,
          includeOriginalAudio,
          voiceSample: voiceMode === 'custom-sample' ? voiceSampleFile : null,
        }
      );

      setJobId(resp.job_id);
      setIsUploading(false);

      // Start polling
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const status = await getOneClickJobStatus(resp.job_id);
          setJobStatus(status);

          if (status.status === 'completed' || status.status === 'failed') {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;

            if (status.status === 'completed') {
              getOneClickTranscript(resp.job_id)
                .then(setTranscript)
                .catch(() => null);
            }
          }
        } catch (err: unknown) {
          console.error('Polling error:', err);
        }
      }, 2000);
    } catch (err: unknown) {
      setIsUploading(false);
      setError((err as { message?: string }).message || 'Failed to start recap pipeline.');
    }
  };

  const handleReset = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
    setJobId(null);
    setJobStatus(null);
    setTranscript(null);
    setError(null);
    setFile(null);
    if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    setFilePreviewUrl(null);
    setVideoUrl('');
    setPreviewCurrentTime(0);
    setPreviewIsPlaying(false);
  };

  const handleCopyScript = () => {
    if (!transcript) return;
    const lines = (transcript.myanmar_segments || transcript.english_segments || [])
      .map((s: { narration?: string; text?: string }) => s.narration || s.text)
      .filter(Boolean);
    navigator.clipboard.writeText(lines.join('\n\n'));
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2000);
  };

  const isCompleted = jobStatus?.status === 'completed';
  const isFailed = jobStatus?.status === 'failed';
  const isProcessing = jobStatus?.status === 'processing' || jobStatus?.status === 'queued';

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in pb-16 px-2 sm:px-4">
      {/* Top Header Card */}
      <div className="rounded-3xl border border-slate-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/60 backdrop-blur-xl p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-sm">
                1-Click Auto
              </span>
              <span className="text-xs font-mono text-zinc-400">EN → MM Movie Recap Engine</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white mt-1">
              One Click English-to-Myanmar Recap
            </h1>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 max-w-2xl leading-relaxed">
              English ဗီဒီယိုတင်ရုံဖြင့် အင်္ဂလိပ်စာတန်းကို Frosted Blur ဖျောက်ပြီး မြန်မာအသံ၊ စာတန်းထိုးနှင့် Logo ကို 1-Click အလိုအလျောက် ပေါင်းစပ်ထုတ်လုပ်ပေးပါသည်။
            </p>
          </div>

          {/* Server Status Pill */}
          <div className="flex items-center gap-2 self-start sm:self-auto px-3 py-1.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-800/60">
            <span className={`w-2 h-2 rounded-full ${serverStatus?.online ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
            <span className="text-[11px] font-bold text-slate-700 dark:text-zinc-300">
              {isCheckingServer ? 'Checking Server...' : serverStatus?.online ? 'AWS EC2 Python Worker Online' : 'Worker Offline'}
            </span>
          </div>
        </div>

        {/* MODE SELECTOR TABS: Upload UI (Movie Recap Style) vs URL Mode */}
        {!isProcessing && !isUploading && !isCompleted && (
          <div className="grid grid-cols-2 gap-2 mt-5 p-1.5 rounded-2xl bg-slate-100 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700/60 max-w-xl">
            <button
              type="button"
              onClick={() => setInputMode('upload')}
              className={`py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                inputMode === 'upload'
                  ? 'bg-white dark:bg-zinc-700 text-slate-900 dark:text-white shadow-sm ring-1 ring-black/5 dark:ring-white/10'
                  : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200'
              }`}
            >
              <Upload className="w-4 h-4 text-indigo-500" />
              <span>📁 Video Upload (စိတ်ကြိုက် Settings & Live Preview)</span>
            </button>
            <button
              type="button"
              onClick={() => setInputMode('url')}
              className={`py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                inputMode === 'url'
                  ? 'bg-white dark:bg-zinc-700 text-slate-900 dark:text-white shadow-sm ring-1 ring-black/5 dark:ring-white/10'
                  : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200'
              }`}
            >
              <Zap className="w-4 h-4 text-purple-500" />
              <span>🔗 Link / URL (စာသား တည်နေရာ Blur အုပ်မည်)</span>
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs font-semibold flex items-center gap-2 animate-shake">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* COMPLETED SUCCESS SCREEN */}
      {isCompleted && (
        <div className="rounded-3xl border border-emerald-500/30 bg-emerald-500/5 p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-emerald-500/20">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xl">
                ✓
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  One Click Recap ဗီဒီယို အောင်မြင်စွာ ထုတ်လုပ်ပြီးပါပြီ!
                </h2>
                <p className="text-xs text-slate-500 dark:text-zinc-400">
                  {jobStatus?.output_duration ? `ကြာချိန်: ${jobStatus.output_duration.toFixed(1)}s` : ''}
                  {jobStatus?.output_size_mb ? ` • ဖိုင်ဆိုဒ်: ${jobStatus.output_size_mb} MB` : ''}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleReset}
                className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-zinc-800 text-xs font-bold text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" /> နောက်တစ်ခု ထပ်လုပ်မည်
              </button>
              {jobId && (
                <a
                  href={getOneClickDownloadUrl(jobId)}
                  download
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-500/20 flex items-center gap-1.5 transition-all"
                >
                  <Download className="w-3.5 h-3.5" /> ဗီဒီယို ဒေါင်းလုဒ်ရယူရန်
                </a>
              )}
            </div>
          </div>

          {/* Result Player & Script Viewer */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-2xl overflow-hidden bg-black aspect-video border border-zinc-800 shadow-inner flex items-center justify-center">
              {jobId ? (
                <video
                  ref={videoPlayerRef}
                  controls
                  playsInline
                  src={getOneClickDownloadUrl(jobId)}
                  className="w-full h-full object-contain"
                />
              ) : null}
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white/60 dark:bg-zinc-900/40 p-4 flex flex-col h-[320px]">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 dark:border-zinc-800">
                <span className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                  ဇာတ်လမ်းပြော မြန်မာဘာသာပြန် စာသားများ (Script)
                </span>
                {transcript && (
                  <button
                    onClick={handleCopyScript}
                    className="text-[11px] font-semibold text-indigo-500 hover:underline"
                  >
                    {copiedScript ? '✓ Copied' : 'Copy All'}
                  </button>
                )}
              </div>
              <div className="overflow-y-auto space-y-2 pr-1 flex-1 text-xs">
                {transcript ? (
                  (transcript.myanmar_segments || transcript.english_segments || []).map((seg: { start?: number; end?: number; narration?: string; text?: string }, i: number) => (
                    <div key={i} className="p-2.5 rounded-xl bg-slate-50 dark:bg-zinc-950/60 border border-slate-100 dark:border-zinc-800/50">
                      <span className="text-[10px] font-mono text-zinc-400">
                        {seg.start ? `${seg.start.toFixed(1)}s` : ''} - {seg.end ? `${seg.end.toFixed(1)}s` : ''}
                      </span>
                      <p className="text-slate-800 dark:text-zinc-200 font-medium leading-relaxed mt-0.5">
                        {seg.narration || seg.text}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="py-12 text-center text-zinc-400 text-xs">Script loading...</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* WORKFLOW VIEW */}
      {!isCompleted && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT COLUMN: MAIN CONFIGURATION */}
          <div className="lg:col-span-7 space-y-5">
            {/* SECTION 1: VIDEO SOURCE INPUT */}
            <div className="rounded-3xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-5 sm:p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">1</span>
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-200">
                    {inputMode === 'upload' ? 'Video File Upload' : 'Video URL / Direct Link'}
                  </h2>
                </div>
                {hasVideo && (
                  <span className="text-[11px] text-emerald-500 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Video Ready
                  </span>
                )}
              </div>

              {inputMode === 'upload' ? (
                /* Upload Drag & Drop Area */
                file ? (
                  <div className="rounded-2xl bg-indigo-50/50 dark:bg-indigo-500/5 border border-indigo-200 dark:border-indigo-500/20 p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                        <Video className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{file.name}</p>
                        <p className="text-[10px] text-slate-400 dark:text-zinc-400">
                          {(file.size / (1024 * 1024)).toFixed(1)} MB • {formatTimeSimple(previewDuration)}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleReset}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-all shrink-0"
                      title="Remove video"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`rounded-2xl border-2 border-dashed p-8 text-center cursor-pointer transition-all ${
                      isDragging
                        ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-500/10 scale-[1.01]'
                        : 'border-slate-200 dark:border-zinc-700/80 hover:border-indigo-400 hover:bg-slate-50 dark:hover:bg-zinc-800/40'
                    }`}
                  >
                    <div className="w-12 h-12 mx-auto rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-500 flex items-center justify-center text-2xl mb-2.5">
                      🎬
                    </div>
                    <p className="text-xs font-bold text-slate-800 dark:text-zinc-200">
                      Recap ပြုလုပ်မည့် English ဗီဒီယိုဖိုင် ရွေးချယ်ပါ သို့မဟုတ် ဆွဲထည့်ပါ
                    </p>
                    <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-1">
                      MP4, MOV, WebM, MKV (အများဆုံး 500MB)
                    </p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="video/*,.mp4,.mov,.mkv,.webm"
                      onChange={handleInputChange}
                      className="hidden"
                    />
                  </div>
                )
              ) : (
                /* URL Input Mode with Smart Blur Guidance */
                <div className="space-y-3">
                  <div className="relative">
                    <input
                      type="url"
                      value={videoUrl}
                      onChange={(e) => setVideoUrl(e.target.value)}
                      placeholder="Paste TikTok, YouTube Shorts သို့မဟုတ် Video Direct Link (https://...)"
                      disabled={isProcessing || isUploading}
                      className="w-full px-4 py-3.5 pr-10 rounded-2xl bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                    />
                    {videoUrl && (
                      <button
                        type="button"
                        onClick={() => setVideoUrl('')}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* URL Subtitle Blur Positioning Guide & Presets */}
                  <div className="p-3.5 rounded-2xl bg-indigo-50/60 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 space-y-2.5">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-zinc-200">
                      <span>🎯</span>
                      <span>ဗီဒီယို၏ မူရင်းစာသား တည်နေရာပေါ် Blur အုပ်မည်</span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-snug">
                      ဗီဒီယို Download ရရှိပြီးပါက အောက်ပါ Position အတိုင်း မူရင်း English စာသားကို Frosted Glass Blur အုပ်ပြီး မြန်မာစာတန်း အစားထိုးပါမည်။
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                      {[
                        { label: 'Auto (ပုံမှန် စာတန်း)', pos: 78, tip: 'အသုံးအများဆုံး' },
                        { label: 'အောက်ခြေစွန်း (84%)', pos: 84, tip: 'ရုပ်ရှင်စာတန်း' },
                        { label: 'TikTok အောက်ပိုင်း (76%)', pos: 76, tip: 'TikTok Captions' },
                        { label: 'ဗီဒီယိုအလယ် (60%)', pos: 60, tip: 'Center Captions' },
                      ].map((item, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setBlurPosition(item.pos)}
                          className={`p-2 rounded-xl border text-center transition-all ${
                            blurPosition === item.pos
                              ? 'border-indigo-500 bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 font-bold shadow-sm'
                              : 'border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 text-xs hover:border-slate-300'
                          }`}
                        >
                          <span className="block text-[11px] font-bold">{item.label}</span>
                          <span className="block text-[9px] opacity-75">{item.pos}% Y</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* SECTION 2: ASPECT RATIO (Movie Recap Style) */}
            <div className="rounded-3xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-5 sm:p-6 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">2</span>
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-200">
                    Aspect Ratio (ဗီဒီယိုအရွယ်အစား)
                  </h2>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: '16:9', label: '16:9 (Landscape)', desc: 'YouTube / PC' },
                  { id: '9:16', label: '9:16 (Portrait)', desc: 'TikTok / Shorts / Reels' },
                  { id: '1:1', label: '1:1 (Square)', desc: 'Facebook / IG' },
                  { id: '4:5', label: '4:5 (Portrait Feed)', desc: 'Facebook Feed' },
                ].map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelectedRatio(r.id)}
                    className={`p-3 rounded-2xl border text-left transition-all ${
                      selectedRatio === r.id
                        ? 'border-indigo-500 bg-indigo-50/60 dark:bg-indigo-500/10 ring-2 ring-indigo-500/20 shadow-sm'
                        : 'border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700'
                    }`}
                  >
                    <span className="font-bold text-xs text-slate-900 dark:text-white block">{r.label}</span>
                    <span className="text-[10px] text-slate-500 dark:text-zinc-400 mt-0.5 block">{r.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* SECTION 3: BURMESE SUBTITLES & FROSTED GLASS BLUR (Movie Recap Calibrator) */}
            <div className="rounded-3xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-5 sm:p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">3</span>
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-200">
                    Subtitles & Frosted Glass Blur (မူရင်းစာတန်း ဖျောက်မှု)
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enableBlur}
                      onChange={(e) => setEnableBlur(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-gray-300 peer-focus:outline-none rounded-full peer dark:bg-zinc-800 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600" />
                  </label>
                </div>
              </div>

              {/* Switches */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-zinc-800/50 border border-slate-100 dark:border-zinc-800 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-slate-800 dark:text-zinc-200">မြန်မာစာတန်းထိုးမည်</p>
                    <p className="text-[10px] text-slate-400 dark:text-zinc-500 mt-0.5">Akkhayar21 အဝါရောင် ရုပ်ရှင်စံနှုန်း</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEnableSubtitles(!enableSubtitles)}
                    className={`w-9 h-5 rounded-full transition-colors relative ${enableSubtitles ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-zinc-700'}`}
                  >
                    <span className={`block w-3.5 h-3.5 rounded-full bg-white transition-transform ${enableSubtitles ? 'translate-x-4' : 'translate-x-1'}`} />
                  </button>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-zinc-800/50 border border-slate-100 dark:border-zinc-800 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-slate-800 dark:text-zinc-200">မူရင်းအသံ ပိတ်မည် (Clean Audio)</p>
                    <p className="text-[10px] text-slate-400 dark:text-zinc-500 mt-0.5">အင်္ဂလိပ်စကားသံ လုံးဝမပါစေရန်</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIncludeOriginalAudio(!includeOriginalAudio)}
                    className={`w-9 h-5 rounded-full transition-colors relative ${!includeOriginalAudio ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-zinc-700'}`}
                  >
                    <span className={`block w-3.5 h-3.5 rounded-full bg-white transition-transform ${!includeOriginalAudio ? 'translate-x-4' : 'translate-x-1'}`} />
                  </button>
                </div>
              </div>

              {/* Subtitle Font Pickers */}
              {enableSubtitles && (
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-700 dark:text-zinc-300">
                    Burmese Font Style (မြန်မာဖောင့်)
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { id: 'font-akkhayar', label: 'Akkhayar 21 ✨' },
                      { id: 'font-kunheing', label: 'AJ Kunheing' },
                      { id: 'font-jojar', label: 'Myanmar Jojar' },
                      { id: 'font-padauk', label: 'Padauk White' },
                    ].map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setSubtitleStyle(f.id)}
                        className={`py-2 px-3 rounded-xl border text-center transition-all ${
                          subtitleStyle === f.id
                            ? 'border-indigo-500 bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 font-bold shadow-sm'
                            : 'border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 text-xs'
                        }`}
                      >
                        <span className="block text-xs font-semibold">{f.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Precision Calibrator Sliders */}
              {enableBlur && (
                <div className="p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-500/5 border border-indigo-200 dark:border-indigo-500/20 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-3 rounded-xl bg-white dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700/80 space-y-1.5">
                      <div className="flex justify-between text-xs font-bold text-slate-700 dark:text-zinc-300">
                        <span>Position Y</span>
                        <span className="text-indigo-500 font-mono">{blurPosition}%</span>
                      </div>
                      <input
                        type="range"
                        min="40"
                        max="95"
                        value={blurPosition}
                        onChange={(e) => setBlurPosition(Number(e.target.value))}
                        className="w-full accent-indigo-600 cursor-pointer"
                      />
                    </div>

                    <div className="p-3 rounded-xl bg-white dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700/80 space-y-1.5">
                      <div className="flex justify-between text-xs font-bold text-slate-700 dark:text-zinc-300">
                        <span>Thickness</span>
                        <span className="text-indigo-500 font-mono">{blurThickness}%</span>
                      </div>
                      <input
                        type="range"
                        min="6"
                        max="35"
                        value={blurThickness}
                        onChange={(e) => setBlurThickness(Number(e.target.value))}
                        className="w-full accent-indigo-600 cursor-pointer"
                      />
                    </div>

                    <div className="p-3 rounded-xl bg-white dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700/80 space-y-1.5">
                      <div className="flex justify-between text-xs font-bold text-slate-700 dark:text-zinc-300">
                        <span>Intensity</span>
                        <span className="text-indigo-500 font-mono">{blurIntensity}</span>
                      </div>
                      <input
                        type="range"
                        min="10"
                        max="50"
                        value={blurIntensity}
                        onChange={(e) => setBlurIntensity(Number(e.target.value))}
                        className="w-full accent-indigo-600 cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* SECTION 4: LOGO & CHANNEL WATERMARK (Movie Recap Style) */}
            <div className="rounded-3xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-5 sm:p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">4</span>
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-200">
                    Channel Logo / Watermark (လိုဂိုတံဆိပ်)
                  </h2>
                </div>
                {logoFile && (
                  <span className="text-[11px] text-emerald-500 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Logo Loaded
                  </span>
                )}
              </div>

              {/* Logo File Selector */}
              {logoUrl ? (
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-zinc-800/60 border border-slate-200 dark:border-zinc-700 flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <img src={logoUrl} alt="Logo preview" className="w-10 h-10 object-contain rounded-lg border border-slate-200 dark:border-zinc-700 bg-black/10" />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{logoFile?.name || 'Watermark Logo'}</p>
                      <p className="text-[10px] text-slate-400 dark:text-zinc-400">Scale: {logoScale}% • Y: {logoY}%</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleRemoveLogo}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-all shrink-0"
                    title="Remove logo"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div
                  onClick={() => logoInputRef.current?.click()}
                  className="rounded-2xl border-2 border-dashed border-slate-200 dark:border-zinc-700/80 hover:border-indigo-400 hover:bg-slate-50 dark:hover:bg-zinc-800/40 p-4 text-center cursor-pointer transition-all"
                >
                  <ImageIcon className="w-6 h-6 text-indigo-400 mx-auto mb-1.5" />
                  <p className="text-xs font-bold text-slate-800 dark:text-zinc-200">
                    Channel Logo Image တင်သွင်းပါ (PNG Transparent အကောင်းဆုံး)
                  </p>
                  <p className="text-[10px] text-slate-400 dark:text-zinc-500 mt-0.5">
                    ရုပ်ပုံ မထည့်လိုပါက အောက်တွင် စာသား Watermark ရိုက်ထည့်နိုင်ပါသည်
                  </p>
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleLogoUpload}
                    className="hidden"
                  />
                </div>
              )}

              {/* Logo Position & Calibration Sliders */}
              {logoUrl && (
                <div className="p-4 rounded-2xl bg-indigo-50/40 dark:bg-indigo-500/5 border border-indigo-200 dark:border-indigo-500/20 space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-slate-700 dark:text-zinc-300">Logo Alignment (ဘယ်/လယ်/ညာ)</span>
                    <div className="flex items-center gap-1">
                      {(['left', 'center', 'right'] as const).map((align) => (
                        <button
                          key={align}
                          type="button"
                          onClick={() => setLogoAlign(align)}
                          className={`px-3 py-1 rounded-lg text-[11px] font-bold uppercase transition-all ${
                            logoAlign === align
                              ? 'bg-indigo-600 text-white shadow-sm'
                              : 'bg-white dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 border border-slate-200 dark:border-zinc-700'
                          }`}
                        >
                          {align}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                    <div className="p-2.5 rounded-xl bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700">
                      <div className="flex justify-between text-[11px] font-bold text-slate-700 dark:text-zinc-300 mb-1">
                        <span>Position Y</span>
                        <span className="text-indigo-500 font-mono">{logoY}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={logoY}
                        onChange={(e) => setLogoY(Number(e.target.value))}
                        className="w-full accent-indigo-600 cursor-pointer"
                      />
                    </div>

                    <div className="p-2.5 rounded-xl bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700">
                      <div className="flex justify-between text-[11px] font-bold text-slate-700 dark:text-zinc-300 mb-1">
                        <span>Scale</span>
                        <span className="text-indigo-500 font-mono">{logoScale}%</span>
                      </div>
                      <input
                        type="range"
                        min="5"
                        max="35"
                        value={logoScale}
                        onChange={(e) => setLogoScale(Number(e.target.value))}
                        className="w-full accent-indigo-600 cursor-pointer"
                      />
                    </div>

                    <div className="p-2.5 rounded-xl bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700">
                      <div className="flex justify-between text-[11px] font-bold text-slate-700 dark:text-zinc-300 mb-1">
                        <span>Opacity</span>
                        <span className="text-indigo-500 font-mono">{logoOpacity}%</span>
                      </div>
                      <input
                        type="range"
                        min="20"
                        max="100"
                        value={logoOpacity}
                        onChange={(e) => setLogoOpacity(Number(e.target.value))}
                        className="w-full accent-indigo-600 cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Watermark Text Input */}
              <input
                type="text"
                value={watermarkText}
                onChange={(e) => setWatermarkText(e.target.value)}
                placeholder="သို့မဟုတ် Channel နာမည် စာသား Watermark ထည့်သွင်းပါ (ဥပမာ - Movie Mania MM)"
                disabled={isProcessing || isUploading}
                className="w-full px-4 py-3 rounded-2xl bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* SECTION 5: AI NARRATOR VOICE & SPEED */}
            <div className="rounded-3xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-5 sm:p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">5</span>
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-200">
                    AI Narrator Voice & Speed (အသံနှင့် အမြန်နှုန်း)
                  </h2>
                </div>
                <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-100 dark:bg-zinc-800 text-[10px] font-bold">
                  <button
                    type="button"
                    onClick={() => setVoiceMode('preset')}
                    className={`px-2.5 py-1 rounded-md transition-all ${voiceMode === 'preset' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 dark:text-zinc-400'}`}
                  >
                    AI အသံများ
                  </button>
                  <button
                    type="button"
                    onClick={() => setVoiceMode('custom-sample')}
                    className={`px-2.5 py-1 rounded-md transition-all flex items-center gap-1 ${voiceMode === 'custom-sample' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-500 dark:text-zinc-400'}`}
                  >
                    <span>✨ Voice Clone</span>
                  </button>
                </div>
              </div>

              {/* Preset Voices */}
              {voiceMode === 'preset' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {[
                    { id: 'my-MM-NilarNeural', name: 'Nilar (နီလာ) ✨ Recommended', gender: 'Female', description: 'ဇာတ်လမ်းပြော ချိုသာကြည်လင်သော မိန်းမသံ' },
                    { id: 'my-MM-ThihaNeural', name: 'Thiha (သီဟ)', gender: 'Male', description: 'ရုပ်ရှင်ဇာတ်လမ်းပြော တည်ငြိမ်သော ယောက်ျားသံ' },
                  ].map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setSelectedVoice(v.id)}
                      disabled={isProcessing || isUploading}
                      className={`p-3 rounded-2xl border text-left transition-all ${
                        selectedVoice === v.id
                          ? 'border-indigo-500 bg-indigo-50/60 dark:bg-indigo-500/10 ring-2 ring-indigo-500/20 shadow-sm'
                          : 'border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-slate-900 dark:text-white">{v.name}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 font-semibold">
                          {v.gender}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-1 leading-snug">{v.description}</p>
                    </button>
                  ))}
                </div>
              ) : (
                /* Custom Sample Voice Clone */
                <div className="rounded-2xl border border-purple-500/30 bg-purple-50/30 dark:bg-purple-950/20 p-4 space-y-3">
                  {voiceSampleFile ? (
                    <div className="p-3 rounded-xl bg-white dark:bg-zinc-900 border border-purple-300/40 flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-800 dark:text-zinc-200 truncate">🎵 {voiceSampleFile.name}</p>
                        <p className="text-[10px] text-purple-600 dark:text-purple-400">✓ Ready for Instant Voice Cloning</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setVoiceSampleFile(null);
                          if (voiceSampleUrl) URL.revokeObjectURL(voiceSampleUrl);
                          setVoiceSampleUrl(null);
                        }}
                        className="text-xs font-bold text-rose-500 hover:underline"
                      >
                        ဖျက်မည်
                      </button>
                    </div>
                  ) : (
                    <div
                      onClick={() => voiceSampleInputRef.current?.click()}
                      className="border-2 border-dashed border-purple-300 dark:border-purple-800 rounded-xl p-5 text-center cursor-pointer hover:bg-purple-100/50 dark:hover:bg-purple-900/20 transition-all"
                    >
                      <p className="text-xs font-bold text-purple-900 dark:text-purple-200">
                        🎧 ဇာတ်လမ်းပြောသူ၏ အသံဖိုင် (Voice Sample MP3/WAV) တင်သွင်းပါ
                      </p>
                      <p className="text-[11px] text-purple-600 dark:text-purple-400 mt-0.5">
                        ၅ စက္ကန့်မှ ၁ မိနစ်အတွင်း ကြည်လင်သော အသံဖိုင်
                      </p>
                      <input
                        ref={voiceSampleInputRef}
                        type="file"
                        accept="audio/*,.mp3,.wav,.m4a,.ogg"
                        onChange={(e) => {
                          if (e.target.files?.[0]) handleVoiceSampleSelect(e.target.files[0]);
                        }}
                        className="hidden"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Speed Presets & Precision Slider */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-700 dark:text-zinc-300">
                    ⚡ စကားပြော အမြန်နှုန်း (Voiceover Pacing)
                  </span>
                  <span className="font-mono font-bold text-indigo-500">
                    {selectedSpeed === '+0%'
                      ? '1.0x Normal'
                      : selectedSpeed === '+15%'
                        ? '1.15x'
                        : selectedSpeed === '+25%'
                          ? '1.25x'
                          : selectedSpeed === '+35%'
                            ? '1.35x Recap Pro ✨'
                            : selectedSpeed === '+45%'
                              ? '1.45x Fast'
                              : selectedSpeed === '+55%'
                                ? '1.55x TikTok 🔥'
                                : selectedSpeed === '+70%'
                                  ? '1.70x Hyper 🚀'
                                  : selectedSpeed}
                  </span>
                </div>

                {/* Preset Speed Buttons */}
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                  {[
                    { value: '+0%', label: '1.0x', desc: 'Normal' },
                    { value: '+15%', label: '1.15x', desc: 'Standard' },
                    { value: '+25%', label: '1.25x', desc: 'Swift' },
                    { value: '+35%', label: '1.35x ✨', desc: 'Recap Pro' },
                    { value: '+45%', label: '1.45x', desc: 'Fast' },
                    { value: '+55%', label: '1.55x 🔥', desc: 'TikTok' },
                  ].map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => setSelectedSpeed(s.value)}
                      disabled={isProcessing || isUploading}
                      className={`p-2 rounded-xl border text-center transition-all ${
                        selectedSpeed === s.value
                          ? 'border-indigo-500 bg-indigo-600 text-white shadow-md font-bold'
                          : 'border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-800/60 text-slate-700 dark:text-zinc-300 hover:border-slate-300'
                      }`}
                    >
                      <span className="block text-xs font-bold">{s.label}</span>
                      <span className={`block text-[9px] mt-0.5 ${selectedSpeed === s.value ? 'text-indigo-100' : 'text-slate-400 dark:text-zinc-500'}`}>
                        {s.desc}
                      </span>
                    </button>
                  ))}
                </div>

                <div className="p-2.5 rounded-xl bg-indigo-50/50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 text-[11px] text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 flex-shrink-0 text-amber-500" />
                  <span>
                    💡 <strong>1.35x မှ 1.55x</strong> သည် Movie Recap အသံသွက်လက်ရန် အကောင်းဆုံး စံနှုန်းဖြစ်ပြီး ကြားဖြတ် Silence များကို အလိုအလျောက် ဖြတ်ထုတ်ပေးထားပါသည်။
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: INTERACTIVE PREVIEW & GENERATE (Sticky like Movie Recap) */}
          <div className="lg:col-span-5 space-y-4 lg:sticky lg:top-4">
            <div className="rounded-3xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-5 shadow-sm space-y-3.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-indigo-400" />
                  Live Canvas Preview & Calibrator
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300">
                  {formatTimeSimple(previewCurrentTime)} / {formatTimeSimple(previewDuration)}
                </span>
              </div>

              {/* Video Screen Container - Responsive Aspect Ratio Matching Selection with Zero Playback Lag */}
              <div className="relative w-full min-h-[260px] max-h-[420px] bg-black rounded-2xl overflow-hidden shadow-inner flex items-center justify-center border border-black/40">
                {filePreviewUrl ? (
                  <div
                    className={`relative mx-auto flex items-center justify-center overflow-hidden max-h-[420px] ${
                      selectedRatio === '9:16'
                        ? 'aspect-[9/16] h-[380px]'
                        : selectedRatio === '1:1'
                          ? 'aspect-square h-[340px]'
                          : selectedRatio === '4:5'
                            ? 'aspect-[4/5] h-[360px]'
                            : 'aspect-video w-full'
                    }`}
                  >
                    <video
                      ref={previewVideoRef}
                      src={filePreviewUrl}
                      onTimeUpdate={handleTimeUpdate}
                      onLoadedMetadata={() => setPreviewDuration(previewVideoRef.current?.duration || 0)}
                      onEnded={() => setPreviewIsPlaying(false)}
                      onPause={() => {
                        setPreviewIsPlaying(false);
                        if (previewVideoRef.current) setPreviewCurrentTime(previewVideoRef.current.currentTime);
                      }}
                      onPlay={() => setPreviewIsPlaying(true)}
                      className="w-full h-full object-contain"
                      playsInline
                    />

                    {/* Live Frosted Glass Blur Band Overlay (Ultra-smooth 60fps on mobile & PC) */}
                    {enableBlur && (
                      <div
                        style={{
                          top: `${Math.max(0, Math.min(100 - blurThickness, blurPosition - blurThickness / 2))}%`,
                          height: `${blurThickness}%`,
                        }}
                        className="absolute left-0 right-0 pointer-events-none transition-all duration-75 flex flex-col items-center justify-center overflow-hidden border-y border-amber-400/60 shadow-lg"
                      >
                        <div
                          style={{
                            backdropFilter: previewIsPlaying ? undefined : `blur(${Math.max(6, Math.round(blurIntensity * 0.35))}px)`,
                            WebkitBackdropFilter: previewIsPlaying ? undefined : `blur(${Math.max(6, Math.round(blurIntensity * 0.35))}px)`,
                            backgroundColor: `rgba(0, 0, 0, ${Math.min(0.78, Math.max(0.35, (blurIntensity / 100) * 0.85))})`,
                          }}
                          className="absolute inset-0"
                        />

                        {/* Centered Subtitle inside Blur Band */}
                        {enableSubtitles && (
                          <div className="relative z-10 px-4 text-center max-w-[88%]">
                            <p
                              style={{
                                color: subtitleStyle === 'font-padauk' ? '#FFFFFF' : '#FFD700',
                                textShadow: '0 2px 4px rgba(0,0,0,0.9), 0 0 2px #000, 1px 1px 0 #000, -1px -1px 0 #000',
                              }}
                              className="text-xs sm:text-sm font-bold leading-tight"
                            >
                              မွေးစားဖခင်ဖြစ်သူကလည်း အမြဲတမ်း နောက်ပြောင်ပြီး ညည်းတွားတတ်ပါတယ်။
                            </p>
                          </div>
                        )}

                        {/* Coordinate tag */}
                        <div className="absolute top-1 right-2 z-10 text-[9px] font-mono px-1.5 py-0.5 rounded bg-black/70 text-amber-300 font-semibold border border-amber-400/40">
                          Y: {blurPosition}% • H: {blurThickness}%
                        </div>
                      </div>
                    )}

                    {/* Subtitle when blur is disabled */}
                    {enableSubtitles && !enableBlur && (
                      <div className="absolute bottom-6 left-0 right-0 pointer-events-none z-10 px-4 text-center">
                        <p
                          style={{
                            color: subtitleStyle === 'font-padauk' ? '#FFFFFF' : '#FFD700',
                            textShadow: '0 2px 4px rgba(0,0,0,0.9), 0 0 2px #000, 1px 1px 0 #000, -1px -1px 0 #000',
                          }}
                          className="text-xs sm:text-sm font-bold leading-tight"
                        >
                          မွေးစားဖခင်ဖြစ်သူကလည်း အမြဲတမ်း နောက်ပြောင်ပြီး ညည်းတွားတတ်ပါတယ်။
                        </p>
                      </div>
                    )}

                    {/* Logo Watermark Overlay - 100% Calibrated with Server FFmpeg Coordinates */}
                    {logoUrl && (
                      <img
                        src={logoUrl}
                        alt="Watermark"
                        style={{
                          position: 'absolute',
                          top: `${logoY}%`,
                          left: logoAlign === 'left' ? '5%' : logoAlign === 'center' ? '50%' : undefined,
                          right: logoAlign === 'right' ? '5%' : undefined,
                          transform: `translate(${logoAlign === 'center' ? '-50%' : '0%'}, -${logoY}%)`,
                          width: `${logoScale}%`,
                          opacity: logoOpacity / 100,
                          pointerEvents: 'none',
                        }}
                        className="max-h-[30%] object-contain"
                      />
                    )}

                    {/* Play/Pause Button Overlay */}
                    <button
                      type="button"
                      onClick={togglePreviewPlay}
                      className="absolute inset-0 m-auto w-12 h-12 rounded-full bg-indigo-600/90 hover:bg-indigo-500 text-white flex items-center justify-center shadow-2xl backdrop-blur-sm transition-transform hover:scale-110 active:scale-95 z-20"
                    >
                      {previewIsPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                    </button>
                  </div>
                ) : (
                  /* URL Mode or No Video Preview Box */
                  <div className="text-center p-6 space-y-2 text-zinc-500">
                    <Video className="w-8 h-8 mx-auto text-zinc-600 animate-pulse" />
                    <p className="text-xs font-medium">
                      {inputMode === 'url'
                        ? 'URL Mode တွင် Video ဒေါင်းလုဒ်ဆွဲပြီးသည်နှင့် Subtitles ပေါ် Blur အလိုအလျောက် အုပ်ပါမည်'
                        : 'ဗီဒီယိုဖိုင် တင်သွင်းပြီးပါက Live Preview ပေါ်လာပါမည်'}
                    </p>
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
                    step={0.05}
                    value={previewCurrentTime}
                    onChange={handlePreviewSeek}
                    className="w-full accent-indigo-500 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-zinc-500 font-mono">
                    <span>{formatTimeSimple(previewCurrentTime)}</span>
                    <span>{formatTimeSimple(previewDuration)}</span>
                  </div>
                </div>
              )}

              {/* In-Progress Card */}
              {(isUploading || isProcessing || isFailed) && (
                <div className="p-4 rounded-2xl border border-indigo-500/20 bg-slate-50 dark:bg-zinc-800/80 shadow-md space-y-2.5">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-slate-800 dark:text-zinc-200 flex items-center gap-2">
                      {isUploading ? (
                        <>
                          <LoadingSpinner size="sm" showLabel={false} />
                          ဆာဗာသို့ တင်ပို့နေပါသည်...
                        </>
                      ) : isProcessing ? (
                        <>
                          <LoadingSpinner size="sm" showLabel={false} />
                          {STEP_LABELS[jobStatus?.step || ''] || jobStatus?.message || 'Processing on AWS...'}
                        </>
                      ) : (
                        <span className="text-red-500">လုပ်ဆောင်မှု မအောင်မြင်ပါ</span>
                      )}
                    </span>
                    <span className="text-indigo-600 dark:text-indigo-400 font-mono font-bold">
                      {jobStatus?.progress ? `${Math.max(0, jobStatus.progress)}%` : isUploading ? '...' : ''}
                    </span>
                  </div>

                  <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-zinc-700 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 transition-all duration-300"
                      style={{ width: `${Math.max(5, Math.min(100, jobStatus?.progress || (isUploading ? 12 : 0)))}%` }}
                    />
                  </div>
                </div>
              )}

              {/* ACTION GENERATE BUTTON */}
              <button
                type="button"
                onClick={handleStart}
                disabled={!hasVideo || isProcessing || isUploading || !serverStatus?.online}
                className={`w-full py-4 rounded-2xl text-xs font-bold uppercase tracking-wider transition-all duration-200 shadow-xl ${
                  !hasVideo || isProcessing || isUploading || !serverStatus?.online
                    ? 'bg-slate-200 dark:bg-zinc-800 text-slate-400 dark:text-zinc-600 cursor-not-allowed shadow-none'
                    : 'bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-indigo-500/30 active:scale-[0.99]'
                }`}
              >
                {isUploading ? (
                  <span className="flex items-center justify-center gap-2">
                    <LoadingSpinner size="sm" showLabel={false} />
                    Starting Pipeline...
                  </span>
                ) : isProcessing ? (
                  <span className="flex items-center justify-center gap-2">
                    <LoadingSpinner size="sm" showLabel={false} />
                    Generating Recap Video...
                  </span>
                ) : (
                  'Generate One Click Recap (15 CR)'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OneClick;
