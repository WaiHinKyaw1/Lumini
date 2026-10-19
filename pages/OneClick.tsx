import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { LoadingSpinner } from '../components/LoadingSpinner';
import {
  checkOneClickHealth,
  getOneClickVoices,
  startOneClickJob,
  getOneClickJobStatus,
  getOneClickDownloadUrl,
  getOneClickSrtDownloadUrl,
  getOneClickTranscript,
  fetchOneClickUrlVideo,
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
  FileText,
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
  const [selectedRatio, setSelectedRatio] = useState<string>('original');
  const [enableSubtitles, setEnableSubtitles] = useState(true);
  const [subtitleStyle, setSubtitleStyle] = useState('font-akkhayar');

  // Frosted Glass Blur Settings
  const [enableBlur, setEnableBlur] = useState(true);
  const [blurPosition, setBlurPosition] = useState<number>(82);
  const [blurThickness, setBlurThickness] = useState<number>(14);
  const [blurIntensity, setBlurIntensity] = useState<number>(35);

  // URL mode auto blur setting & Video aspect ratio detection
  const [urlBlurMode, setUrlBlurMode] = useState<'auto' | 'manual'>('auto');
  const [naturalAspect, setNaturalAspect] = useState<number | null>(null);

  // Direct Drag Calibrator State on Video Canvas
  const previewBoxRef = useRef<HTMLDivElement>(null);
  const [activeDrag, setActiveDrag] = useState<'blur-move' | 'blur-resize-top' | 'blur-resize-bottom' | 'logo-move' | 'logo-resize' | null>(null);
  const dragStartXRef = useRef<number>(0);
  const dragStartYRef = useRef<number>(0);
  const dragStartValRef = useRef<{ pos: number; thick: number; logoX: number; logoY: number; logoScale: number }>({
    pos: 82,
    thick: 14,
    logoX: 80,
    logoY: 6,
    logoScale: 14,
  });

  // Detect YouTube Video ID for instant live preview
  const youtubeId = useMemo(() => {
    if (inputMode !== 'url' || !videoUrl.trim()) return null;
    const match = videoUrl.trim().match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/i);
    return match ? match[1] : null;
  }, [inputMode, videoUrl]);

  // Detect TikTok Video ID or URL for live TikTok preview
  const tiktokId = useMemo(() => {
    if (inputMode !== 'url' || !videoUrl.trim()) return null;
    const match = videoUrl.trim().match(/(?:video\/|v\/)(\d{15,22})/i);
    return match ? match[1] : null;
  }, [inputMode, videoUrl]);

  const isTikTokUrl = useMemo(() => {
    if (inputMode !== 'url' || !videoUrl.trim()) return false;
    return /tiktok\.com/i.test(videoUrl.trim());
  }, [inputMode, videoUrl]);

  const isYouTubeShort = useMemo(() => {
    return Boolean(videoUrl && /youtube\.com\/shorts\//i.test(videoUrl));
  }, [videoUrl]);

  // ElevenLabs Pro Key (Optional)
  const [elevenApiKey, setElevenApiKey] = useState<string>(() => {
    try {
      return localStorage.getItem('lumini_elevenlabs_key') || 'sk_219a1341d802e55ab02509adffa20bbdc8c1489070b1dfa4';
    } catch {
      return 'sk_219a1341d802e55ab02509adffa20bbdc8c1489070b1dfa4';
    }
  });
  const [showKeyInput, setShowKeyInput] = useState(false);

  // Logo / Watermark Settings (Movie Recap style)
  const [enableLogo, setEnableLogo] = useState(true);
  const [watermarkText, setWatermarkText] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoX, setLogoX] = useState<number>(80);
  const [logoY, setLogoY] = useState<number>(6);
  const [logoAlign, setLogoAlign] = useState<'left' | 'center' | 'right'>('right');
  const [logoScale, setLogoScale] = useState<number>(14);
  const [logoOpacity, setLogoOpacity] = useState<number>(100);

  // URL Pre-Download States
  const [isDownloadingUrl, setIsDownloadingUrl] = useState(false);
  const [downloadedTempId, setDownloadedTempId] = useState<string | null>(null);
  const [urlVideoMeta, setUrlVideoMeta] = useState<{ duration?: number; width?: number; height?: number } | null>(null);

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
  const hasVideo = (inputMode === 'url' && (Boolean(downloadedTempId) || Boolean(videoUrl.trim()))) || (inputMode === 'upload' && Boolean(file));

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
    setNaturalAspect(null);
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
      previewVideoRef.current.play().then(() => setPreviewIsPlaying(true)).catch(() => { });
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

  // Canvas Direct Drag Calibration Handlers (Mouse & Touch for live adjustment on video)
  const handlePointerDown = (
    type: 'blur-move' | 'blur-resize-top' | 'blur-resize-bottom' | 'logo-move' | 'logo-resize',
    e: React.PointerEvent
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveDrag(type);
    dragStartXRef.current = e.clientX;
    dragStartYRef.current = e.clientY;
    dragStartValRef.current = {
      pos: blurPosition,
      thick: blurThickness,
      logoX,
      logoY,
      logoScale,
    };
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch { }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!activeDrag || !previewBoxRef.current) return;
    const rect = previewBoxRef.current.getBoundingClientRect();
    if (rect.height <= 0 || rect.width <= 0) return;

    const deltaX = e.clientX - dragStartXRef.current;
    const deltaY = e.clientY - dragStartYRef.current;
    const deltaXPercent = (deltaX / rect.width) * 100;
    const deltaYPercent = (deltaY / rect.height) * 100;

    if (activeDrag === 'blur-move') {
      const newPos = Math.round(Math.max(30, Math.min(95, dragStartValRef.current.pos + deltaYPercent)));
      setBlurPosition(newPos);
    } else if (activeDrag === 'blur-resize-top') {
      const newThick = Math.round(Math.max(6, Math.min(36, dragStartValRef.current.thick - deltaYPercent * 2)));
      setBlurThickness(newThick);
    } else if (activeDrag === 'blur-resize-bottom') {
      const newThick = Math.round(Math.max(6, Math.min(36, dragStartValRef.current.thick + deltaYPercent * 2)));
      setBlurThickness(newThick);
    } else if (activeDrag === 'logo-move') {
      const newLogoX = Math.round(Math.max(0, Math.min(100 - logoScale, dragStartValRef.current.logoX + deltaXPercent)));
      const newLogoY = Math.round(Math.max(0, Math.min(92, dragStartValRef.current.logoY + deltaYPercent)));
      setLogoX(newLogoX);
      setLogoY(newLogoY);
    } else if (activeDrag === 'logo-resize') {
      const newScale = Math.round(Math.max(5, Math.min(45, dragStartValRef.current.logoScale + deltaXPercent)));
      setLogoScale(newScale);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (activeDrag) {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch { }
      setActiveDrag(null);
    }
  };

  const handleFetchUrlVideo = async () => {
    if (!videoUrl.trim()) {
      setError('YouTube သို့မဟုတ် TikTok Link ထည့်သွင်းပေးပါ');
      return;
    }
    setError(null);
    setIsDownloadingUrl(true);
    try {
      const res = await fetchOneClickUrlVideo(videoUrl.trim());
      setDownloadedTempId(res.temp_id);
      setUrlVideoMeta({ duration: res.duration, width: res.width, height: res.height });
      if (res.duration) setPreviewDuration(res.duration);
      if (res.width && res.height) {
        setNaturalAspect(res.width / res.height);
      }
      setFilePreviewUrl(res.preview_url);
      setPreviewCurrentTime(0);
      setPreviewIsPlaying(false);
      toast.success('Video ဒေါင်းလုဒ်ပြီးပါပြီ! Preview တွင် စိတ်ကြိုက် ချိန်ညှိနိုင်ပါပြီ။');
    } catch (err: unknown) {
      const msg = (err as { message?: string }).message || 'Video ဒေါင်းလုဒ် မအောင်မြင်ပါ';
      toast.error(msg);
      setError(msg);
    } finally {
      setIsDownloadingUrl(false);
    }
  };

  const handleStart = async () => {
    if (inputMode === 'upload' && !file) {
      setError('ဗီဒီယိုဖိုင် ရွေးချယ်ပေးပါ');
      return;
    }
    if (inputMode === 'url' && !videoUrl.trim() && !downloadedTempId) {
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
          tempId: downloadedTempId || undefined,
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
          logoFile: enableLogo ? logoFile : null,
          logoX,
          logoY,
          logoAlign,
          logoScale,
          logoOpacity: logoOpacity / 100,
          includeOriginalAudio,
          voiceSample: voiceMode === 'custom-sample' ? voiceSampleFile : null,
          elevenlabsApiKey: voiceMode === 'custom-sample' ? elevenApiKey.trim() : undefined,
          enableIntroHook: false,
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
    if (filePreviewUrl && !filePreviewUrl.startsWith('http') && !filePreviewUrl.startsWith('/api')) {
      try {
        URL.revokeObjectURL(filePreviewUrl);
      } catch { }
    }
    setFilePreviewUrl(null);
    setVideoUrl('');
    setDownloadedTempId(null);
    setUrlVideoMeta(null);
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
              className={`py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${inputMode === 'upload'
                ? 'bg-white dark:bg-zinc-700 text-slate-900 dark:text-white shadow-sm ring-1 ring-black/5 dark:ring-white/10'
                : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200'
                }`}
            >
              <Upload className="w-4 h-4 text-indigo-500" />
              <span> Video Upload</span>
            </button>
            <button
              type="button"
              onClick={() => setInputMode('url')}
              className={`py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${inputMode === 'url'
                ? 'bg-white dark:bg-zinc-700 text-slate-900 dark:text-white shadow-sm ring-1 ring-black/5 dark:ring-white/10'
                : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200'
                }`}
            >
              <Zap className="w-4 h-4 text-purple-500" />
              <span>🔗 Link / URL</span>
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

            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={handleReset}
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-800 text-xs font-bold text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" /> အသစ်ပြန်လုပ်မည်
              </button>
              {jobId && (
                <>
                  <a
                    href={getOneClickDownloadUrl(jobId)}
                    download
                    className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-500/20 flex items-center gap-1.5 transition-all"
                  >
                    <Download className="w-3.5 h-3.5" /> Video (.mp4)
                  </a>
                  <a
                    href={getOneClickSrtDownloadUrl(jobId)}
                    download
                    className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-500/20 flex items-center gap-1.5 transition-all"
                  >
                    <FileText className="w-3.5 h-3.5" /> စာတန်းထိုး (.srt)
                  </a>
                </>
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
              {/* Header with Copy Button */}
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 dark:border-zinc-800">
                <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                  📝 Myanmar Script & Subtitles
                </span>

                {transcript && (
                  <button
                    onClick={handleCopyScript}
                    className="text-[11px] font-semibold text-indigo-500 hover:underline px-2 py-0.5 rounded-md hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-all"
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
                    className={`rounded-2xl border-2 border-dashed p-8 text-center cursor-pointer transition-all ${isDragging
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

                  {/* Clean URL Download Action */}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleFetchUrlVideo}
                      disabled={!videoUrl.trim() || isDownloadingUrl || isProcessing}
                      className={`flex-1 py-3 px-4 rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-sm ${!videoUrl.trim() || isDownloadingUrl || isProcessing
                        ? 'bg-slate-100 dark:bg-zinc-800 text-slate-400 dark:text-zinc-600 cursor-not-allowed'
                        : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/20 active:scale-[0.99]'
                        }`}
                    >
                      {isDownloadingUrl ? (
                        <>
                          <LoadingSpinner size="sm" showLabel={false} />
                          <span>Video ကို ဆာဗာမှ ရယူနေပါသည်...</span>
                        </>
                      ) : downloadedTempId ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                          <span>Video ဒေါင်းလုဒ်ပြီးပါပြီ</span>
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4" />
                          <span>📥 Video အရင်ရယူမည် (Download Video to Preview)</span>
                        </>
                      )}
                    </button>
                  </div>

                  {downloadedTempId && (
                    <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <div>
                          <p className="font-bold">Video ရယူပြီးပါပြီ — Preview တွင် စိတ်ကြိုက် ချိန်ညှိနိုင်ပါပြီ</p>
                          <p className="text-[11px] opacity-80">
                            {previewDuration ? `ကြာချိန်: ${formatTimeSimple(previewDuration)}` : ''}
                            {urlVideoMeta?.width && urlVideoMeta?.height ? ` • ${urlVideoMeta.width}x${urlVideoMeta.height}` : ''}
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] font-mono font-bold bg-emerald-500/20 px-2 py-0.5 rounded-lg">
                        Ready
                      </span>
                    </div>
                  )}
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

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {[
                  { id: 'original', label: 'Original ✨', desc: 'မူရင်းအတိုင်း' },
                  { id: '16:9', label: '16:9', desc: 'YouTube / PC' },
                  { id: '9:16', label: '9:16', desc: 'TikTok / Shorts' },
                  { id: '1:1', label: '1:1', desc: 'Square / IG' },
                  { id: '4:5', label: '4:5', desc: 'FB Feed' },
                ].map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelectedRatio(r.id)}
                    className={`p-3 rounded-2xl border text-left transition-all ${selectedRatio === r.id
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
                        className={`py-2 px-3 rounded-xl border text-center transition-all ${subtitleStyle === f.id
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

              {/* Precision Presets without Cluttered Slider Bars */}
              {enableBlur && (
                <div className="p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-500/5 border border-indigo-200 dark:border-indigo-500/20 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-700 dark:text-zinc-300">⚡ နေရာ အမြန်ရွေးချယ်မှု (Presets)</span>
                    <span className="text-[11px] font-mono text-indigo-600 dark:text-indigo-400 font-bold bg-white dark:bg-zinc-800 px-2 py-0.5 rounded-lg border border-indigo-200 dark:border-indigo-800">
                      Y: {blurPosition}% • H: {blurThickness}%
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { label: 'Drama (66%) ✨', pos: 66, thick: 15 },
                      { label: 'TikTok (76%)', pos: 76, thick: 16 },
                      { label: 'YouTube (83%)', pos: 83, thick: 14 },
                      { label: 'Bottom (88%)', pos: 88, thick: 15 },
                    ].map((p, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setBlurPosition(p.pos);
                          setBlurThickness(p.thick);
                        }}
                        className={`p-2.5 rounded-xl border text-center transition-all ${blurPosition === p.pos
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm font-bold'
                          : 'bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 border-slate-200 dark:border-zinc-700 hover:border-indigo-300'
                          }`}
                      >
                        <span className="block text-xs font-bold">{p.label}</span>
                      </button>
                    ))}
                  </div>

                  {/* Blur Intensity Slider Bar */}
                  <div className="space-y-1.5 pt-2 border-t border-indigo-100 dark:border-indigo-900/30">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-700 dark:text-zinc-300">
                        Blur Intensity (ဝေဝါးမှု အတိုးအလျော့)
                      </span>
                      <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400 text-xs bg-white dark:bg-zinc-800 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-800">
                        {blurIntensity}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={10}
                      max={100}
                      step={1}
                      value={blurIntensity}
                      onChange={(e) => setBlurIntensity(Number(e.target.value))}
                      className="w-full accent-indigo-600 cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-slate-400 dark:text-zinc-500 font-medium">
                      <span>ပါးပါး (10%)</span>
                      <span>စံနှုန်း (35%)</span>
                      <span>ထူထူဝေဝါး (100%)</span>
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
                <div className="flex items-center gap-2">
                  {enableLogo && logoFile && (
                    <span className="text-[11px] text-emerald-500 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Logo Loaded
                    </span>
                  )}
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enableLogo}
                      onChange={(e) => setEnableLogo(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-gray-300 peer-focus:outline-none rounded-full peer dark:bg-zinc-800 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600" />
                  </label>
                </div>
              </div>

              {enableLogo ? (
                <>
                  {/* Logo File Selector */}
                  {logoUrl ? (
                    <div className="p-3 rounded-2xl bg-slate-50 dark:bg-zinc-800/60 border border-slate-200 dark:border-zinc-700 flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <img src={logoUrl} alt="Logo preview" className="w-10 h-10 object-contain rounded-lg border border-slate-200 dark:border-zinc-700 bg-black/10" />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{logoFile?.name || 'Watermark Logo'}</p>
                          <p className="text-[10px] text-slate-400 dark:text-zinc-400">Position Y: {logoY}% • Alignment: {logoAlign}</p>
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
                        Channel Logo Image တင်သွင်းပါ
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

                  {/* Logo Alignment, Size & 2D Live Video Calibration */}
                  {logoUrl && (
                    <div className="p-4 rounded-2xl bg-indigo-50/40 dark:bg-indigo-500/5 border border-indigo-200 dark:border-indigo-500/20 space-y-3">
                      {/* Logo Size Slider Bar */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-700 dark:text-zinc-300">
                            Logo Size (လိုဂိုဆိုဒ် အကြီးအသေး)
                          </span>
                          <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400 text-xs bg-white dark:bg-zinc-800 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-800">
                            {logoScale}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min={5}
                          max={40}
                          step={1}
                          value={logoScale}
                          onChange={(e) => setLogoScale(Number(e.target.value))}
                          className="w-full accent-indigo-600 cursor-pointer"
                        />
                        <div className="flex justify-between text-[10px] text-slate-400 dark:text-zinc-500 font-medium">
                          <span>သေးငယ် (5%)</span>
                          <span>စံနှုန်း (14%)</span>
                          <span>အကြီး (40%)</span>
                        </div>
                      </div>

                      {/* Logo Quick Position Presets */}
                      <div className="space-y-1.5 pt-2 border-t border-indigo-100 dark:border-indigo-900/30">
                        <div className="flex items-center justify-between text-xs font-bold">
                          <span className="text-slate-700 dark:text-zinc-300">Logo နေရာ အမြန်ရွေးချယ်မှု</span>
                          <span className="text-[10px] font-mono text-indigo-600 dark:text-indigo-400 bg-white dark:bg-zinc-800 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-800">
                            X: {logoX}% • Y: {logoY}%
                          </span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                          {[
                            { label: 'ညာဘက်အပေါ်', x: 80, y: 6 },
                            { label: 'ဘယ်ဘက်အပေါ်', x: 6, y: 6 },
                            { label: 'ညာဘက်အောက်', x: 80, y: 82 },
                            { label: 'ဘယ်ဘက်အောက်', x: 6, y: 82 },
                          ].map((pos, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => {
                                setLogoX(pos.x);
                                setLogoY(pos.y);
                              }}
                              className={`p-2 rounded-xl border text-center transition-all ${logoX === pos.x && logoY === pos.y
                                ? 'bg-indigo-600 text-white font-bold shadow-sm'
                                : 'bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 border-slate-200 dark:border-zinc-700 text-xs hover:border-indigo-300'
                                }`}
                            >
                              <span className="block text-xs font-semibold">{pos.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-white/80 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 text-[11px] text-slate-600 dark:text-zinc-300 flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <span>💡</span>
                          <span>Logo ကို <strong>Preview ဗီဒီယိုပေါ်တွင် ဘယ်/ညာ/အပေါ်/အောက် ကြိုက်ရာသို့ ဆွဲရွှေ့နိုင်ပြီး ထောင့်စွန်း (⤡) မှ ဆွဲ၍လည်း ဆိုဒ်ချိန်နိုင်ပါသည်</strong></span>
                        </span>
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
                </>
              ) : (
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-zinc-800/40 border border-slate-100 dark:border-zinc-800/60 text-center text-xs text-slate-400 dark:text-zinc-500">
                  Logo / Watermark ကို ပိတ်ထားပါသည် (ဖွင့်လိုပါက အပေါ်မှ Toggle ခလုပ်ကို ဖွင့်ပါ)
                </div>
              )}
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
                    <span> Voice Clone</span>
                  </button>
                </div>
              </div>

              {/* Preset Voices */}
              {voiceMode === 'preset' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {[
                    { id: 'my-MM-NilarNeural', name: 'Nilar (နီလာ)', gender: 'Female', description: '' },
                    { id: 'my-MM-ThihaNeural', name: 'Thiha (သီဟ)', gender: 'Male', description: '' },
                  ].map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setSelectedVoice(v.id)}
                      disabled={isProcessing || isUploading}
                      className={`p-3 rounded-2xl border text-left transition-all ${selectedVoice === v.id
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
                    <div className="space-y-3">
                      <div className="p-3 rounded-xl bg-white dark:bg-zinc-900 border border-purple-300/40 flex items-center justify-between">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-800 dark:text-zinc-200 truncate">🎵 {voiceSampleFile.name}</p>
                          <p className="text-[10px] text-purple-600 dark:text-purple-400 font-semibold">✓ Smart Acoustic Voice Cloning Activated</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setVoiceSampleFile(null);
                            if (voiceSampleUrl) URL.revokeObjectURL(voiceSampleUrl);
                            setVoiceSampleUrl(null);
                          }}
                          className="text-xs font-bold text-rose-500 hover:underline shrink-0 ml-2"
                        >
                          ဖျက်မည်
                        </button>
                      </div>

                      {/* Voice sample player */}
                      {voiceSampleUrl && (
                        <div className="p-2.5 rounded-xl bg-white/70 dark:bg-zinc-900/70 border border-purple-200 dark:border-purple-900/30">
                          <p className="text-[10px] text-slate-500 dark:text-zinc-400 mb-1 font-semibold">နမူနာ အသံဖိုင် စစ်ဆေးရန် (Preview):</p>
                          <audio src={voiceSampleUrl} controls className="w-full h-8" />
                        </div>
                      )}

                      {/* Engine status & optional ElevenLabs Key */}
                      <div className="p-3 rounded-xl bg-indigo-50/60 dark:bg-zinc-800/60 border border-indigo-100 dark:border-zinc-700/60 text-[11px] space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-800 dark:text-zinc-200">
                            ⚡ Clone နည်းပညာ: <span className="text-purple-600 dark:text-purple-400">Smart Acoustic + Pitch Morphing</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => setShowKeyInput(!showKeyInput)}
                            className="text-[10px] text-indigo-600 dark:text-indigo-400 underline font-medium"
                          >
                            {showKeyInput ? 'ElevenLabs ပိတ်မည်' : '+ ElevenLabs Pro API Key'}
                          </button>
                        </div>
                        <p className="text-[10px] text-slate-500 dark:text-zinc-400 leading-snug">
                          သင်ထည့်သွင်းလိုက်သော အသံနမူနာ၏ Pitch, Tone နှင့် Warmth ကို တိုက်ရိုက် မော်ဒယ်လ်လုပ်ပြီး မြန်မာအသံထွက် ဇာတ်လမ်းပြောပေးပါမည် (အခမဲ့နှင့် ချက်ချင်းရရှိ)။
                        </p>

                        {showKeyInput && (
                          <div className="pt-1.5 space-y-1">
                            <input
                              type="password"
                              value={elevenApiKey}
                              onChange={(e) => {
                                const val = e.target.value;
                                setElevenApiKey(val);
                                try {
                                  localStorage.setItem('lumini_elevenlabs_key', val);
                                } catch { }
                              }}
                              placeholder="ElevenLabs API Key ထည့်သွင်းပါ (sk_...)"
                              className="w-full px-3 py-2 rounded-lg bg-white dark:bg-zinc-900 border border-purple-300 dark:border-purple-700 text-xs font-mono"
                            />
                            <p className="text-[9px] text-purple-600 dark:text-purple-400">
                              ElevenLabs Key ထည့်သွင်းပါက Instant Multilingual v2 Neural Clone ဖြင့် ဆောင်ရွက်ပါမည်။
                            </p>
                          </div>
                        )}
                      </div>
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
                        ၅ စက္ကန့်မှ ၁ မိနစ်အတွင်း ကြည်လင်သော အသံဖိုင် (Acoustic & Neural Clone)
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
                      className={`p-2 rounded-xl border text-center transition-all ${selectedSpeed === s.value
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

              {/* Video Screen Container - Responsive Aspect Ratio with Direct Canvas Calibrator */}
              <div
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                className="relative w-full min-h-[260px] max-h-[440px] bg-black rounded-2xl overflow-hidden shadow-inner flex items-center justify-center border border-black/40 touch-none select-none"
              >
                {(filePreviewUrl || (inputMode === 'url' && videoUrl.trim())) ? (
                  <div
                    ref={previewBoxRef}
                    className={`relative w-full h-full mx-auto flex items-center justify-center overflow-hidden max-h-[440px] transition-all duration-300 ${selectedRatio === '9:16'
                      ? 'aspect-[9/16] h-[410px]'
                      : selectedRatio === '1:1'
                        ? 'aspect-square h-[350px]'
                        : selectedRatio === '4:5'
                          ? 'aspect-[4/5] h-[380px]'
                          : selectedRatio === '16:9'
                            ? 'aspect-video w-full'
                            : naturalAspect
                              ? naturalAspect < 0.85
                                ? 'aspect-[9/16] h-[410px]'
                                : naturalAspect < 1.15
                                  ? 'aspect-square h-[350px]'
                                  : naturalAspect < 1.4
                                    ? 'aspect-[4/5] h-[380px]'
                                    : 'aspect-video w-full'
                              : (isTikTokUrl || isYouTubeShort)
                                ? 'aspect-[9/16] h-[410px]'
                                : 'aspect-video w-full'
                      }`}
                  >
                    {/* Source Player: Upload File, YouTube Embed, TikTok Embed, or Direct Video URL */}
                    {filePreviewUrl ? (
                      <video
                        ref={previewVideoRef}
                        src={filePreviewUrl}
                        onTimeUpdate={handleTimeUpdate}
                        onLoadedMetadata={() => {
                          const v = previewVideoRef.current;
                          if (v) {
                            setPreviewDuration(v.duration || 0);
                            if (v.videoWidth && v.videoHeight) {
                              setNaturalAspect(v.videoWidth / v.videoHeight);
                            }
                          }
                        }}
                        onEnded={() => setPreviewIsPlaying(false)}
                        onPause={() => {
                          setPreviewIsPlaying(false);
                          if (previewVideoRef.current) setPreviewCurrentTime(previewVideoRef.current.currentTime);
                        }}
                        onPlay={() => setPreviewIsPlaying(true)}
                        className="w-full h-full object-contain"
                        playsInline
                      />
                    ) : youtubeId ? (
                      <iframe
                        src={`https://www.youtube.com/embed/${youtubeId}?autoplay=0&controls=1&modestbranding=1&rel=0`}
                        title="YouTube Preview"
                        className="w-full h-full object-contain border-0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    ) : tiktokId ? (
                      <iframe
                        src={`https://www.tiktok.com/player/v1/${tiktokId}?autoplay=0&music_info=0&description=0`}
                        title="TikTok Preview"
                        className="w-full h-full object-contain border-0"
                        allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    ) : isTikTokUrl ? (
                      <iframe
                        src={`https://www.tiktok.com/embed/v2/?url=${encodeURIComponent(videoUrl.trim())}`}
                        title="TikTok Preview"
                        className="w-full h-full object-contain border-0"
                        allowFullScreen
                      />
                    ) : (
                      <video
                        ref={previewVideoRef}
                        src={videoUrl.trim()}
                        controls
                        playsInline
                        className="w-full h-full object-contain"
                      />
                    )}

                    {/* Calibrator Guide Note */}
                    <div className="absolute top-2 left-2 right-2 z-20 pointer-events-none flex items-center justify-between">
                      <span className="px-2 py-0.5 rounded-lg bg-black/60 text-amber-300 text-[9px] font-bold backdrop-blur-md border border-amber-400/30 flex items-center gap-1">
                        <span>🎯</span> Drag & Calibrate Live
                      </span>
                      <span className="px-2 py-0.5 rounded-lg bg-black/60 text-white text-[9px] font-mono backdrop-blur-md border border-white/10">
                        Y: {blurPosition}%
                      </span>
                    </div>

                    {/* LIVE INTERACTIVE FROSTED GLASS BLUR BAND (Direct Drag & Resize on Video) */}
                    {enableBlur && (
                      <div
                        style={{
                          top: `${Math.max(0, Math.min(100 - blurThickness, blurPosition - blurThickness / 2))}%`,
                          height: `${blurThickness}%`,
                        }}
                        onPointerDown={(e) => handlePointerDown('blur-move', e)}
                        className={`absolute left-0 right-0 z-10 flex flex-col items-center justify-center overflow-visible border-y-2 border-amber-400/80 shadow-2xl transition-shadow ${activeDrag === 'blur-move' ? 'cursor-grabbing ring-2 ring-amber-400' : 'cursor-grab hover:border-amber-300'
                          }`}
                        title="Click & drag up/down to reposition blur band on video"
                      >
                        {/* Top Edge Resize Handle */}
                        <div
                          onPointerDown={(e) => handlePointerDown('blur-resize-top', e)}
                          className="absolute -top-3 left-0 right-0 h-6 cursor-ns-resize flex items-center justify-center z-30 group"
                          title="Drag up/down to resize thickness"
                        >
                          <div className="w-14 h-1.5 rounded-full bg-amber-400 shadow-md group-hover:scale-125 transition-transform" />
                        </div>

                        {/* Frosted Glass Background */}
                        <div
                          style={{
                            backdropFilter: `blur(${Math.max(6, Math.round(blurIntensity * 0.35))}px)`,
                            WebkitBackdropFilter: `blur(${Math.max(6, Math.round(blurIntensity * 0.35))}px)`,
                            backgroundColor: `rgba(0, 0, 0, ${Math.min(0.78, Math.max(0.40, (blurIntensity / 100) * 0.85))})`,
                          }}
                          className="absolute inset-0 pointer-events-none"
                        />

                        {/* Centered Subtitle inside Blur Band */}
                        {enableSubtitles && (
                          <div className="relative z-10 px-4 text-center max-w-[88%] pointer-events-none">
                            <p
                              style={{
                                color: subtitleStyle === 'font-padauk' ? '#FFFFFF' : '#FFD700',
                                textShadow: '0 2px 4px rgba(0,0,0,0.9), 0 0 2px #000, 1px 1px 0 #000, -1px -1px 0 #000',
                              }}
                              className="text-xs sm:text-sm font-bold leading-tight"
                            >
                              Blur here
                            </p>
                          </div>
                        )}

                        {/* Floating Drag Indicator Badge */}
                        <div className="absolute top-1 right-2 z-10 text-[9px] font-mono px-1.5 py-0.5 rounded bg-black/80 text-amber-300 font-bold border border-amber-400/50 flex items-center gap-1 shadow-lg pointer-events-none">
                          <span>↕ Drag Y: {blurPosition}%</span>
                          <span className="opacity-70">• H: {blurThickness}%</span>
                        </div>

                        {/* Bottom Edge Resize Handle */}
                        <div
                          onPointerDown={(e) => handlePointerDown('blur-resize-bottom', e)}
                          className="absolute -bottom-3 left-0 right-0 h-6 cursor-ns-resize flex items-center justify-center z-30 group"
                          title="Drag up/down to resize thickness"
                        >
                          <div className="w-14 h-1.5 rounded-full bg-amber-400 shadow-md group-hover:scale-125 transition-transform" />
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

                    {/* DRAGGABLE & RESIZABLE LOGO WATERMARK OVERLAY */}
                    {enableLogo && logoUrl && (
                      <div
                        style={{
                          position: 'absolute',
                          top: `${logoY}%`,
                          left: `${logoX}%`,
                          width: `${logoScale}%`,
                        }}
                        onPointerDown={(e) => handlePointerDown('logo-move', e)}
                        className={`z-20 cursor-move max-h-[35%] group select-none ${activeDrag === 'logo-move' ? 'ring-2 ring-indigo-400 rounded-lg' : ''
                          }`}
                        title="Click & drag logo freely anywhere on video"
                      >
                        <img
                          src={logoUrl}
                          alt="Watermark"
                          style={{ opacity: logoOpacity / 100 }}
                          className="w-full h-auto object-contain pointer-events-none select-none rounded drop-shadow-md"
                        />

                        {/* Corner Resize Handle */}
                        <div
                          onPointerDown={(e) => handlePointerDown('logo-resize', e)}
                          className="absolute -bottom-2 -right-2 w-5 h-5 bg-indigo-600 border-2 border-white rounded-full cursor-nwse-resize flex items-center justify-center shadow-lg hover:scale-125 transition-transform z-30"
                          title="Drag corner to resize Logo"
                        >
                          <span className="text-[8px] text-white font-bold leading-none select-none">⤡</span>
                        </div>

                        {/* Coordinate Badge on Hover / Drag */}
                        <div className="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/90 text-white text-[9px] font-mono px-1.5 py-0.5 rounded shadow whitespace-nowrap pointer-events-none z-30 flex items-center gap-1.5">
                          <span>X: {logoX}%</span>
                          <span>Y: {logoY}%</span>
                          <span>Size: {logoScale}%</span>
                        </div>
                      </div>
                    )}

                    {/* Play/Pause Button Overlay (For file video) */}
                    {filePreviewUrl && (
                      <button
                        type="button"
                        onClick={togglePreviewPlay}
                        className="absolute inset-0 m-auto w-12 h-12 rounded-full bg-indigo-600/90 hover:bg-indigo-500 text-white flex items-center justify-center shadow-2xl backdrop-blur-sm transition-transform hover:scale-110 active:scale-95 z-20 pointer-events-auto"
                      >
                        {previewIsPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                      </button>
                    )}
                  </div>
                ) : (
                  /* No Video Placeholder */
                  <div className="text-center p-6 space-y-2 text-zinc-500">
                    <Video className="w-8 h-8 mx-auto text-zinc-600 animate-pulse" />
                    <p className="text-xs font-medium">
                      {inputMode === 'url'
                        ? 'YouTube Shorts သို့မဟုတ် Video Link ထည့်သွင်းပြီးပါက Live Video Preview ပေါ်လာပါမည်'
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
                className={`w-full py-4 rounded-2xl text-xs font-bold uppercase tracking-wider transition-all duration-200 shadow-xl ${!hasVideo || isProcessing || isUploading || !serverStatus?.online
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
