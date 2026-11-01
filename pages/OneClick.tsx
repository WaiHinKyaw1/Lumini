import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { LoadingSpinner } from '../components/LoadingSpinner';
import {
  checkOneClickHealth,
  getOneClickVoices,
  getBaseUrl,
  startOneClickJob,
  getOneClickJobStatus,
  getOneClickDownloadUrl,
  getOneClickStreamUrl,
  getOneClickSrtDownloadUrl,
  getOneClickTranscript,
  fetchOneClickUrlVideo,
  getOneClickVoiceSampleUrl,
  extractCleanUrl,
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
  RefreshCw,
  FileText,
  Volume2,
  ChevronDown,
  ChevronUp,
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
  const [selectedVoice, setSelectedVoice] = useState('my-MM-KingBurma');
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

  const applyPreset = (preset: 'alpha' | 'tiktok' | 'youtube') => {
    if (preset === 'alpha') {
      setSelectedRatio('9:16');
      setEnableBlur(true);
      setBlurWidth(85);
      setBlurThickness(15);
      setBlurPosition(82);
      setSubtitleStyle('font-akkhayar');
      toast.success('Team Alpha Style (9:16 + Blur + Akkhayar) သတ်မှတ်ပြီးပါပြီ');
    } else if (preset === 'tiktok') {
      setSelectedRatio('9:16');
      setEnableBlur(false);
      setSubtitleStyle('font-akkhayar');
      toast.success('TikTok / Shorts Style (9:16) သတ်မှတ်ပြီးပါပြီ');
    } else if (preset === 'youtube') {
      setSelectedRatio('original');
      setEnableBlur(false);
      toast.success('Original / YouTube Style သတ်မှတ်ပြီးပါပြီ');
    }
  };
  const [voiceMode, setVoiceMode] = useState<'preset' | 'custom-sample'>('preset');
  const [voiceSampleFile, setVoiceSampleFile] = useState<File | null>(null);
  const [voiceSampleUrl, setVoiceSampleUrl] = useState<string | null>(null);
  const [selectedSpeed, setSelectedSpeed] = useState('+35%');
  const [selectedRatio, setSelectedRatio] = useState<string>('original');
  const [enableSubtitles, setEnableSubtitles] = useState(true);
  const [subtitleStyle, setSubtitleStyle] = useState('font-akkhayar');

  // Frosted Glass Blur Settings (Team Alpha Style 2D Box)
  const [enableBlur, setEnableBlur] = useState(true);
  const [blurPosition, setBlurPosition] = useState<number>(82);
  const [blurThickness, setBlurThickness] = useState<number>(14);
  const [blurWidth, setBlurWidth] = useState<number>(100);
  const [blurIntensity, setBlurIntensity] = useState<number>(35);

  // URL mode auto blur setting & Video aspect ratio detection
  const [urlBlurMode, setUrlBlurMode] = useState<'auto' | 'manual'>('auto');
  const [naturalAspect, setNaturalAspect] = useState<number | null>(null);

  // Direct Drag Calibrator State on Video Canvas
  const previewBoxRef = useRef<HTMLDivElement>(null);
  const [activeDrag, setActiveDrag] = useState<'blur-move' | 'blur-resize-top' | 'blur-resize-bottom' | 'blur-resize-left' | 'blur-resize-right' | 'logo-move' | 'logo-resize' | null>(null);
  const dragStartXRef = useRef<number>(0);
  const dragStartYRef = useRef<number>(0);
  const dragStartValRef = useRef<{ pos: number; thick: number; width: number; logoX: number; logoY: number; logoScale: number }>({
    pos: 82,
    thick: 14,
    width: 100,
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

  const isRednoteUrl = useMemo(() => {
    if (inputMode !== 'url' || !videoUrl.trim()) return false;
    return /xhslink\.com|xiaohongshu\.com|rednote/i.test(videoUrl.trim());
  }, [inputMode, videoUrl]);

  const isYouTubeShort = useMemo(() => {
    return Boolean(videoUrl && /youtube\.com\/shorts\//i.test(videoUrl));
  }, [videoUrl]);

  // Target aspect ratio for canvas preview - 100% matches backend rendering canvas dimensions
  const targetRatioValue = useMemo<number>(() => {
    if (selectedRatio === '16:9') return 16 / 9;
    if (selectedRatio === '9:16') return 9 / 16;
    if (selectedRatio === '1:1') return 1.0;
    if (selectedRatio === '4:5') return 4 / 5;
    if (naturalAspect && Number.isFinite(naturalAspect) && naturalAspect > 0) {
      return naturalAspect;
    }
    return (isTikTokUrl || isYouTubeShort || isRednoteUrl) ? 9 / 16 : 16 / 9;
  }, [selectedRatio, naturalAspect, isTikTokUrl, isYouTubeShort, isRednoteUrl]);

  // Intelligent blur positioning that accounts for canvas padding when video aspect ratio != canvas ratio
  const getSmartBlurForRatio = useCallback((ratioId: string, vidAspect: number | null): { pos: number; thick: number } => {
    const vAspect = vidAspect && vidAspect > 0 ? vidAspect : 16 / 9;
    let cAspect = 16 / 9;
    if (ratioId === '9:16') cAspect = 9 / 16;
    else if (ratioId === '1:1') cAspect = 1.0;
    else if (ratioId === '4:5') cAspect = 4 / 5;
    else if (ratioId === '16:9') cAspect = 16 / 9;
    else cAspect = vAspect;

    // If video is letterboxed vertically (black bars top & bottom in output canvas):
    if (vAspect > cAspect) {
      const vHeightPct = cAspect / vAspect;
      const topPadPct = (1.0 - vHeightPct) / 2.0;
      // Position blur directly over subtitles at bottom of video
      const subPosPct = topPadPct + 0.82 * vHeightPct;
      const thickPct = Math.max(8, Math.min(22, Math.round(14 * vHeightPct)));
      return { pos: Math.round(subPosPct * 100), thick: thickPct };
    }
    return { pos: 82, thick: 14 };
  }, []);

  const handleRatioSelect = (ratioId: string) => {
    setSelectedRatio(ratioId);
    const smart = getSmartBlurForRatio(ratioId, naturalAspect);
    setBlurPosition(smart.pos);
    setBlurThickness(smart.thick);
  };

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

  // Load and monitor server status
  const checkServer = useCallback(async (silent = false) => {
    if (!silent) setIsCheckingServer(true);
    try {
      const [health] = await Promise.all([
        checkOneClickHealth().catch(() => null),
        getOneClickVoices().catch(() => null),
      ]);
      setServerStatus(health);
      if (!silent && health?.online) {
        toast.success('AWS EC2 Worker Online!');
      }
    } catch {
      setServerStatus(null);
    } finally {
      if (!silent) setIsCheckingServer(false);
    }
  }, []);

  useEffect(() => {
    checkServer();
    // Auto-poll every 8 seconds if worker is offline or restarting
    const interval = setInterval(() => {
      checkServer(true);
    }, 8000);
    return () => clearInterval(interval);
  }, [checkServer]);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
      if (voiceSampleUrl) URL.revokeObjectURL(voiceSampleUrl);
      if (logoUrl) URL.revokeObjectURL(logoUrl);
      if (sampleAudioRef.current) {
        sampleAudioRef.current.pause();
        sampleAudioRef.current = null;
      }
    };
  }, [filePreviewUrl, voiceSampleUrl, logoUrl]);

  // Sample voice audio player
  const [sampleAudioLoading, setSampleAudioLoading] = useState<string | null>(null);
  const [sampleAudioPlaying, setSampleAudioPlaying] = useState<string | null>(null);
  const sampleAudioRef = useRef<HTMLAudioElement | null>(null);

  const handlePlayVoiceSample = (e: React.MouseEvent, voiceId: string) => {
    e.preventDefault();
    e.stopPropagation();

    if (sampleAudioPlaying === voiceId) {
      if (sampleAudioRef.current) {
        sampleAudioRef.current.pause();
      }
      setSampleAudioPlaying(null);
      return;
    }

    if (sampleAudioRef.current) {
      sampleAudioRef.current.pause();
      sampleAudioRef.current = null;
    }

    setSampleAudioLoading(voiceId);
    try {
      const audio = new Audio(getOneClickVoiceSampleUrl(voiceId));
      sampleAudioRef.current = audio;

      audio.onplay = () => {
        setSampleAudioLoading(null);
        setSampleAudioPlaying(voiceId);
      };

      audio.onended = () => {
        setSampleAudioPlaying(null);
      };

      audio.onerror = () => {
        setSampleAudioLoading(null);
        setSampleAudioPlaying(null);
        toast.error('အသံနမူနာ ဖွင့်မရသေးပါ — ခေတ္တစောင့်ပြီး ပြန်လည်စမ်းသပ်ပေးပါ');
      };

      audio.play().catch(() => {
        setSampleAudioLoading(null);
        setSampleAudioPlaying(null);
      });
    } catch {
      setSampleAudioLoading(null);
      setSampleAudioPlaying(null);
    }
  };

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

  const seekRafRef = useRef<number | null>(null);

  const handlePreviewSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setPreviewCurrentTime(val);
    if (seekRafRef.current) cancelAnimationFrame(seekRafRef.current);
    seekRafRef.current = requestAnimationFrame(() => {
      const v = previewVideoRef.current;
      if (v) {
        if ('fastSeek' in v && typeof (v as any).fastSeek === 'function') {
          (v as any).fastSeek(val);
        } else {
          v.currentTime = val;
        }
      }
    });
  };

  const formatTimeSimple = (sec: number): string => {
    if (!Number.isFinite(sec) || sec < 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Canvas Direct Drag Calibration Handlers (Mouse & Touch for live adjustment on video)
  const handlePointerDown = (
    type: 'blur-move' | 'blur-resize-top' | 'blur-resize-bottom' | 'blur-resize-left' | 'blur-resize-right' | 'logo-move' | 'logo-resize',
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
      width: blurWidth,
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
      const newPos = Math.round(Math.max(8, Math.min(96, dragStartValRef.current.pos + deltaYPercent)));
      setBlurPosition(newPos);
    } else if (activeDrag === 'blur-resize-top') {
      const newThick = Math.round(Math.max(4, Math.min(40, dragStartValRef.current.thick - deltaYPercent * 2)));
      setBlurThickness(newThick);
    } else if (activeDrag === 'blur-resize-bottom') {
      const newThick = Math.round(Math.max(4, Math.min(40, dragStartValRef.current.thick + deltaYPercent * 2)));
      setBlurThickness(newThick);
    } else if (activeDrag === 'blur-resize-left') {
      const newWidth = Math.round(Math.max(30, Math.min(100, dragStartValRef.current.width - deltaXPercent * 2)));
      setBlurWidth(newWidth);
    } else if (activeDrag === 'blur-resize-right') {
      const newWidth = Math.round(Math.max(30, Math.min(100, dragStartValRef.current.width + deltaXPercent * 2)));
      setBlurWidth(newWidth);
    } else if (activeDrag === 'logo-move') {
      const newLogoX = Math.round(Math.max(0, Math.min(100 - logoScale, dragStartValRef.current.logoX + deltaXPercent)));
      const newLogoY = Math.round(Math.max(0, Math.min(96, dragStartValRef.current.logoY + deltaYPercent)));
      setLogoX(newLogoX);
      setLogoY(newLogoY);
    } else if (activeDrag === 'logo-resize') {
      const newScale = Math.round(Math.max(4, Math.min(50, dragStartValRef.current.logoScale + deltaXPercent)));
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
    const cleanUrl = extractCleanUrl(videoUrl);
    if (!cleanUrl) {
      setError('YouTube, TikTok သို့မဟုတ် Rednote (Xiaohongshu) Link ထည့်သွင်းပေးပါ');
      return;
    }
    setError(null);
    setIsDownloadingUrl(true);
    try {
      const res = await fetchOneClickUrlVideo(cleanUrl);
      setDownloadedTempId(res.temp_id);
      setUrlVideoMeta({ duration: res.duration, width: res.width, height: res.height });
      if (res.duration) setPreviewDuration(res.duration);
      if (res.width && res.height) {
        const aspect = res.width / res.height;
        setNaturalAspect(aspect);
        const smart = getSmartBlurForRatio(selectedRatio, aspect);
        setBlurPosition(smart.pos);
        setBlurThickness(smart.thick);
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
    if (inputMode === 'upload') {
      if (!file) {
        setError('ဗီဒီယိုဖိုင် ရွေးချယ်ပေးပါ');
        return;
      }
      const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
      const activeUrl = getBaseUrl();
      const hasDirectHttps = activeUrl.startsWith('https://') || (import.meta.env.VITE_ONECLICK_URL || '').startsWith('https://');
      if (isHttps && !hasDirectHttps && file.size > 4.5 * 1024 * 1024) {
        const mb = (file.size / (1024 * 1024)).toFixed(1);
        const limitMsg = `Vercel serverless proxy ကန့်သတ်ချက် (4.5MB) ကြောင့် ${mb}MB ရှိသောဖိုင်ကို တိုက်ရိုက် Upload မတင်နိုင်ပါ။ အပေါ်ရှိ "YouTube / TikTok / Rednote Link" Mode ကို အသုံးပြုပါ (သို့မဟုတ်) local တွင် run ပေးပါ။`;
        setError(limitMsg);
        toast.error('Vercel 4.5MB Limit: YouTube/TikTok/Rednote Link mode ကို အသုံးပြုပေးပါ');
        return;
      }
    }
    const cleanUrl = extractCleanUrl(videoUrl);
    if (inputMode === 'url' && !cleanUrl && !downloadedTempId) {
      setError('YouTube, TikTok သို့မဟုတ် Rednote (Xiaohongshu) Link ထည့်သွင်းပေးပါ');
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
          blurWidth,
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
          voiceSamplePreset: selectedVoice === 'preset-kingburma-reference' ? 'kingburma-reference' : undefined,
          elevenlabsApiKey: voiceMode === 'custom-sample' ? elevenApiKey.trim() : undefined,
          enableIntroHook: false,
        }
      );

      setJobId(resp.job_id);
      setIsUploading(false);

      // Start polling
      if (pollRef.current) clearInterval(pollRef.current);
      let consecutivePollErrors = 0;
      pollRef.current = setInterval(async () => {
        try {
          const status = await getOneClickJobStatus(resp.job_id);
          consecutivePollErrors = 0;
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
          consecutivePollErrors++;
          if (consecutivePollErrors >= 6) {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            setError('ဗီဒီယို ပြုလုပ်ခြင်း ရပ်တန့်သွားပါသည် (Connection lost). ကျေးဇူးပြု၍ ဗီဒီယိုဖိုင် အသစ်ဖြင့် ပြန်လည် စတင်ပေးပါ။');
          }
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
          </div>

          {/* Server Status Pill (Click to re-check) */}
          <button
            type="button"
            onClick={() => checkServer(false)}
            title="Click to re-check worker status"
            className="flex items-center gap-2 self-start sm:self-auto px-3 py-1.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-800/60 hover:bg-slate-100 dark:hover:bg-zinc-800/90 transition-colors cursor-pointer group"
          >
            <span className={`w-2 h-2 rounded-full ${serverStatus?.online ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
            <span className="text-[11px] font-bold text-slate-700 dark:text-zinc-300">
              {isCheckingServer ? 'Checking Server...' : serverStatus?.online ? 'AWS EC2 Python Worker Online' : 'Worker Offline'}
            </span>
            <RefreshCw className={`w-3 h-3 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-zinc-200 transition-transform ${isCheckingServer ? 'animate-spin' : ''}`} />
          </button>
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
                  preload="metadata"
                  src={getOneClickStreamUrl(jobId)}
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
          {/* LEFT COLUMN: STREAMLINED & CLEAN CONFIGURATION */}
          <div className="lg:col-span-7 space-y-4">

            {/* STEP 1: VIDEO SOURCE */}
            <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-4 sm:p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">1</span>
                  <h2 className="text-xs font-bold text-slate-800 dark:text-zinc-200">
                    {inputMode === 'upload' ? 'ဗီဒီယို ဖိုင်တင်ရန်' : 'ဗီဒီယို Link ထည့်ရန်'}
                  </h2>
                </div>
                {hasVideo && (
                  <span className="text-[11px] text-emerald-500 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> အဆင်သင့်ဖြစ်ပါပြီ
                  </span>
                )}
              </div>

              {inputMode === 'upload' ? (
                file ? (
                  <div className="rounded-xl bg-indigo-50/50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 p-3 flex items-center justify-between">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0">
                        <Video className="w-4 h-4" />
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
                      title="ဖျက်မည်"
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
                    className={`rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-all ${isDragging
                      ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-500/10'
                      : 'border-slate-200 dark:border-zinc-700/80 hover:border-indigo-400 hover:bg-slate-50 dark:hover:bg-zinc-800/40'
                      }`}
                  >
                    <Upload className="w-6 h-6 mx-auto text-indigo-500 mb-2" />
                    <p className="text-xs font-bold text-slate-800 dark:text-zinc-200">
                      English ဗီဒီယိုဖိုင် ရွေးချယ်ပါ သို့မဟုတ် ဆွဲထည့်ပါ
                    </p>
                    <p className="text-[10px] text-slate-400 dark:text-zinc-500 mt-0.5">
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
                <div className="space-y-2">
                  <div className="relative">
                    <input
                      type="url"
                      value={videoUrl}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const cleaned = extractCleanUrl(raw);
                        setVideoUrl(cleaned || raw);
                      }}
                      placeholder="YouTube, TikTok သို့မဟုတ် Rednote Link ထည့်ပါ (https://...)"
                      disabled={isProcessing || isUploading}
                      className="w-full px-3.5 py-2.5 pr-8 rounded-xl bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    {videoUrl && (
                      <button
                        type="button"
                        onClick={() => setVideoUrl('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  {videoUrl.trim() && !downloadedTempId && (
                    <button
                      type="button"
                      onClick={handleFetchUrlVideo}
                      disabled={isDownloadingUrl}
                      className="w-full py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      {isDownloadingUrl ? (
                        <>
                          <LoadingSpinner size="sm" showLabel={false} />
                          ဗီဒီယို ရယူနေပါသည်...
                        </>
                      ) : (
                        'ဗီဒီယို ဆွဲယူမည် (Fetch Video)'
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* STEP 2: NARRATOR VOICE & PACING */}
            <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-4 sm:p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">2</span>
                  <h2 className="text-xs font-bold text-slate-800 dark:text-zinc-200">
                    ဇာတ်လမ်းပြော အသံနှင့် အမြန်နှုန်း
                  </h2>
                </div>
                <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-100 dark:bg-zinc-800 text-[10px] font-bold">
                  <button
                    type="button"
                    onClick={() => setVoiceMode('preset')}
                    className={`px-2 py-0.5 rounded-md transition-all ${voiceMode === 'preset' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 dark:text-zinc-400'}`}
                  >
                    AI အသံများ
                  </button>
                  <button
                    type="button"
                    onClick={() => setVoiceMode('custom-sample')}
                    className={`px-2 py-0.5 rounded-md transition-all ${voiceMode === 'custom-sample' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-500 dark:text-zinc-400'}`}
                  >
                    Voice Clone
                  </button>
                </div>
              </div>

              {/* Voice Cards */}
              {voiceMode === 'preset' ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    { id: 'my-MM-KingBurma', name: 'King Burma', mmName: 'မင်းမြန်မာ', icon: '👑', tag: 'TikTok Pro' },
                    { id: 'my-MM-ThihaNeural', name: 'Thiha', mmName: 'သီဟ', icon: '🎙️', tag: 'Classic Narrator' },
                    { id: 'my-MM-ZawNeural', name: 'Zaw', mmName: 'ဇော်', icon: '🎬', tag: 'Team Alpha Baritone' },
                    { id: 'my-MM-WunnaNeural', name: 'Min Khant', mmName: 'မင်းခန့်', icon: '⚡', tag: 'Energetic Youth' },
                    { id: 'my-MM-NilarNeural', name: 'Nilar', mmName: 'နီလာ', icon: '🌸', tag: 'Sweet Storyteller' },
                    { id: 'my-MM-SuSuNeural', name: 'Mya / Su Su', mmName: 'ဆုဆု', icon: '🎭', tag: 'Drama Emotional' },
                    { id: 'my-MM-MayNeural', name: 'May Thu', mmName: 'မေသူ', icon: '🌺', tag: 'Bright Upbeat' },
                  ].map((v) => (
                    <div
                      key={v.id}
                      onClick={() => !isProcessing && !isUploading && setSelectedVoice(v.id)}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer relative ${selectedVoice === v.id
                        ? 'border-indigo-500 bg-indigo-50/70 dark:bg-indigo-500/10 ring-2 ring-indigo-500/20 shadow-sm'
                        : 'border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700 bg-slate-50/40 dark:bg-zinc-800/20'
                        }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-slate-900 dark:text-white truncate">
                          {v.icon} {v.mmName}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => handlePlayVoiceSample(e, v.id)}
                          className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold flex items-center gap-0.5 transition-all ${sampleAudioPlaying === v.id
                            ? 'bg-indigo-600 text-white animate-pulse'
                            : 'bg-slate-200 dark:bg-zinc-700 text-slate-700 dark:text-zinc-300 hover:bg-indigo-600 hover:text-white'
                            }`}
                          title="နမူနာအသံ နားထောင်မည်"
                        >
                          <Volume2 className="w-2.5 h-2.5" />
                          <span>{sampleAudioPlaying === v.id ? 'ရပ်မည်' : sampleAudioLoading === v.id ? '...' : 'နားထောင်'}</span>
                        </button>
                      </div>
                      <p className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold mt-1 truncate">{v.tag}</p>
                    </div>
                  ))}
                </div>
              ) : (
                /* Custom Sample Upload */
                <div className="p-3.5 rounded-xl border border-purple-500/30 bg-purple-50/30 dark:bg-purple-950/20 space-y-2.5">
                  {voiceSampleFile ? (
                    <div className="flex items-center justify-between p-2.5 rounded-lg bg-white dark:bg-zinc-900 border border-purple-200 dark:border-purple-800">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-800 dark:text-zinc-200 truncate">🎵 {voiceSampleFile.name}</p>
                        <p className="text-[10px] text-purple-600 dark:text-purple-400">✓ Voice Sample Activated</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setVoiceSampleFile(null);
                          if (voiceSampleUrl) URL.revokeObjectURL(voiceSampleUrl);
                          setVoiceSampleUrl(null);
                        }}
                        className="text-xs font-bold text-rose-500 hover:underline ml-2"
                      >
                        ဖျက်မည်
                      </button>
                    </div>
                  ) : (
                    <div
                      onClick={() => voiceSampleInputRef.current?.click()}
                      className="border border-dashed border-purple-300 dark:border-purple-800 rounded-xl p-4 text-center cursor-pointer hover:bg-purple-100/40 dark:hover:bg-purple-900/20 transition-all"
                    >
                      <p className="text-xs font-bold text-purple-900 dark:text-purple-200">
                        🎧 နမူနာ အသံဖိုင် (MP3/WAV) ထည့်သွင်းပါ
                      </p>
                      <p className="text-[10px] text-purple-600 dark:text-purple-400 mt-0.5">
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

              {/* Speed Pills */}
              <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-zinc-800 text-xs">
                <span className="font-bold text-slate-600 dark:text-zinc-400 text-[11px]">အမြန်နှုန်း:</span>
                <div className="flex items-center gap-1">
                  {[
                    { value: '+0%', label: '1.0x ပုံမှန်' },
                    { value: '+25%', label: '1.25x သွက်သွက်' },
                    { value: '+35%', label: '1.35x Recap ✨' },
                    { value: '+55%', label: '1.55x TikTok 🔥' },
                  ].map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => setSelectedSpeed(s.value)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${selectedSpeed === s.value
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 hover:bg-slate-200'
                        }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* STEP 3: STYLE & SUBTITLES */}
            <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-4 sm:p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">3</span>
                  <h2 className="text-xs font-bold text-slate-800 dark:text-zinc-200">
                    ဗီဒီယို စတိုင်နှင့် စာတန်းထိုး
                  </h2>
                </div>
              </div>

              {/* 3 Quick Presets */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'alpha', label: '🎬 Team Alpha', desc: '9:16 + Blur Box ✨' },
                  { id: 'tiktok', label: '📱 TikTok Reels', desc: '9:16 ဒေါင်လိုက်' },
                  { id: 'youtube', label: '💻 Original / YT', desc: 'မူရင်းအတိုင်း' },
                ].map((p) => {
                  const isActive = (p.id === 'alpha' && selectedRatio === '9:16' && enableBlur) ||
                                   (p.id === 'tiktok' && selectedRatio === '9:16' && !enableBlur) ||
                                   (p.id === 'youtube' && selectedRatio === 'original' && !enableBlur);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => applyPreset(p.id as any)}
                      className={`p-2.5 rounded-xl border text-center transition-all ${isActive
                        ? 'border-indigo-500 bg-indigo-50/70 dark:bg-indigo-500/10 ring-2 ring-indigo-500/20 font-bold'
                        : 'border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700 bg-slate-50/40 dark:bg-zinc-800/20'
                        }`}
                    >
                      <span className="block text-xs font-bold text-slate-900 dark:text-white truncate">{p.label}</span>
                      <span className="block text-[10px] text-slate-500 dark:text-zinc-400 mt-0.5 truncate">{p.desc}</span>
                    </button>
                  );
                })}
              </div>

              {/* Clean Subtitle & Audio Toggles */}
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100 dark:border-zinc-800">
                <div
                  onClick={() => setEnableSubtitles(!enableSubtitles)}
                  className="p-2.5 rounded-xl bg-slate-50 dark:bg-zinc-800/40 border border-slate-100 dark:border-zinc-800 flex items-center justify-between cursor-pointer"
                >
                  <span className="text-xs font-bold text-slate-800 dark:text-zinc-200">မြန်မာစာတန်းထိုးမည်</span>
                  <div className={`w-8 h-4 rounded-full transition-colors relative ${enableSubtitles ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-zinc-700'}`}>
                    <span className={`block w-3 h-3 rounded-full bg-white transition-transform ${enableSubtitles ? 'translate-x-4' : 'translate-x-0.5'} mt-0.5`} />
                  </div>
                </div>

                <div
                  onClick={() => setIncludeOriginalAudio(!includeOriginalAudio)}
                  className="p-2.5 rounded-xl bg-slate-50 dark:bg-zinc-800/40 border border-slate-100 dark:border-zinc-800 flex items-center justify-between cursor-pointer"
                >
                  <span className="text-xs font-bold text-slate-800 dark:text-zinc-200">မူရင်းအသံဖျောက်မည်</span>
                  <div className={`w-8 h-4 rounded-full transition-colors relative ${!includeOriginalAudio ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-zinc-700'}`}>
                    <span className={`block w-3 h-3 rounded-full bg-white transition-transform ${!includeOriginalAudio ? 'translate-x-4' : 'translate-x-0.5'} mt-0.5`} />
                  </div>
                </div>
              </div>
            </div>

            {/* COLLAPSIBLE: ADVANCED CUSTOMIZATION ACCORDION */}
            <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 shadow-sm overflow-hidden">
              <button
                type="button"
                onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
                className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-50 dark:hover:bg-zinc-800/40 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-indigo-500" />
                  <span className="text-xs font-bold text-slate-800 dark:text-zinc-200">
                    စိတ်ကြိုက် အသေးစိတ် ပြင်ဆင်ရန် (Advanced Settings)
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <span>{isAdvancedOpen ? 'ပိတ်မည်' : 'ဖွင့်မည်'}</span>
                  {isAdvancedOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </button>

              {isAdvancedOpen && (
                <div className="p-4 pt-0 space-y-4 border-t border-slate-100 dark:border-zinc-800">
                  {/* Manual Aspect Ratio */}
                  <div className="space-y-1.5 pt-3">
                    <label className="text-[11px] font-bold text-slate-700 dark:text-zinc-300">
                      ဗီဒီယို အရွယ်အစား (Aspect Ratio)
                    </label>
                    <div className="grid grid-cols-5 gap-1.5">
                      {[
                        { id: 'original', label: 'Original' },
                        { id: '16:9', label: '16:9' },
                        { id: '9:16', label: '9:16' },
                        { id: '1:1', label: '1:1' },
                        { id: '4:5', label: '4:5' },
                      ].map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => handleRatioSelect(r.id)}
                          className={`py-1.5 rounded-lg border text-xs font-bold transition-all ${selectedRatio === r.id
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                            : 'border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 hover:border-slate-300'
                            }`}
                        >
                          {r.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Burmese Font Picker */}
                  {enableSubtitles && (
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-slate-700 dark:text-zinc-300">
                        မြန်မာစာလုံး ဖောင့် (Font Style)
                      </label>
                      <div className="grid grid-cols-4 gap-1.5">
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
                            className={`py-1.5 px-2 rounded-lg border text-center transition-all ${subtitleStyle === f.id
                              ? 'border-indigo-500 bg-indigo-50 dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 font-bold'
                              : 'border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 text-[11px]'
                              }`}
                          >
                            <span className="block truncate">{f.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Blur Sliders */}
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-800/40 border border-slate-100 dark:border-zinc-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 dark:text-zinc-200">Frosted Blur Bar (မူရင်းစာတန်း ဖျောက်မှု)</span>
                      <button
                        type="button"
                        onClick={() => setEnableBlur(!enableBlur)}
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${enableBlur ? 'bg-indigo-600 text-white' : 'bg-slate-200 dark:bg-zinc-700 text-slate-600'}`}
                      >
                        {enableBlur ? 'ဖွင့်ထားသည်' : 'ပိတ်ထားသည်'}
                      </button>
                    </div>

                    {enableBlur && (
                      <div className="space-y-2.5 pt-1 text-[11px]">
                        <div>
                          <div className="flex justify-between font-bold text-slate-600 dark:text-zinc-300 mb-1">
                            <span>Blur Width (အကျယ်):</span>
                            <span>{blurWidth}%</span>
                          </div>
                          <input
                            type="range"
                            min={30}
                            max={100}
                            value={blurWidth}
                            onChange={(e) => setBlurWidth(Number(e.target.value))}
                            className="w-full accent-indigo-600"
                          />
                        </div>
                        <div>
                          <div className="flex justify-between font-bold text-slate-600 dark:text-zinc-300 mb-1">
                            <span>Blur Height (အမြင့်):</span>
                            <span>{blurThickness}%</span>
                          </div>
                          <input
                            type="range"
                            min={6}
                            max={35}
                            value={blurThickness}
                            onChange={(e) => setBlurThickness(Number(e.target.value))}
                            className="w-full accent-indigo-600"
                          />
                        </div>
                        <div>
                          <div className="flex justify-between font-bold text-slate-600 dark:text-zinc-300 mb-1">
                            <span>Blur Intensity (ဝေဝါးမှု):</span>
                            <span>{blurIntensity}%</span>
                          </div>
                          <input
                            type="range"
                            min={10}
                            max={100}
                            value={blurIntensity}
                            onChange={(e) => setBlurIntensity(Number(e.target.value))}
                            className="w-full accent-indigo-600"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Channel Logo / Watermark */}
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-800/40 border border-slate-100 dark:border-zinc-800 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 dark:text-zinc-200">Channel Logo / Watermark</span>
                      <button
                        type="button"
                        onClick={() => setEnableLogo(!enableLogo)}
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${enableLogo ? 'bg-indigo-600 text-white' : 'bg-slate-200 dark:bg-zinc-700 text-slate-600'}`}
                      >
                        {enableLogo ? 'ဖွင့်ထားသည်' : 'ပိတ်ထားသည်'}
                      </button>
                    </div>

                    {enableLogo && (
                      <div className="space-y-2 pt-1">
                        {logoUrl ? (
                          <div className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700">
                            <div className="flex items-center gap-2">
                              <img src={logoUrl} alt="Logo" className="w-8 h-8 object-contain rounded" />
                              <span className="text-xs font-bold truncate max-w-[150px]">{logoFile?.name || 'Logo'}</span>
                            </div>
                            <button
                              type="button"
                              onClick={handleRemoveLogo}
                              className="text-xs font-bold text-rose-500 hover:underline"
                            >
                              ဖယ်ရှားမည်
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => logoInputRef.current?.click()}
                            className="w-full py-2.5 border border-dashed border-slate-300 dark:border-zinc-700 rounded-lg text-xs font-bold text-slate-600 dark:text-zinc-300 hover:bg-white dark:hover:bg-zinc-800"
                          >
                            + Logo ရုပ်ပုံ တင်ရန် (.png / .jpg)
                          </button>
                        )}
                        <input
                          ref={logoInputRef}
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          onChange={handleLogoUpload}
                          className="hidden"
                        />
                        <input
                          type="text"
                          value={watermarkText}
                          onChange={(e) => setWatermarkText(e.target.value)}
                          placeholder="သို့မဟုတ် Channel နာမည် စာသားထည့်ပါ (ဥပမာ- Movie Channel)"
                          className="w-full px-3 py-2 rounded-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-xs"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
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
                className="relative w-full h-[390px] sm:h-[430px] bg-zinc-950/90 rounded-2xl overflow-hidden shadow-inner flex items-center justify-center border border-slate-200 dark:border-zinc-800 p-2 touch-none select-none"
              >
                {(filePreviewUrl || (inputMode === 'url' && videoUrl.trim())) ? (
                  <div
                    ref={previewBoxRef}
                    style={{
                      aspectRatio: `${targetRatioValue}`,
                      maxHeight: '100%',
                      maxWidth: '100%',
                      height: targetRatioValue <= 1 ? '100%' : 'auto',
                      width: targetRatioValue > 1 ? '100%' : 'auto',
                    }}
                    className="relative mx-auto flex items-center justify-center overflow-hidden bg-black rounded-xl border border-indigo-500/40 shadow-2xl transition-all duration-200 select-none"
                  >
                    {/* Source Player: Upload File, YouTube Embed, TikTok Embed, or Direct Video URL */}
                    {filePreviewUrl ? (
                      <video
                        ref={previewVideoRef}
                        src={filePreviewUrl}
                        preload="metadata"
                        onTimeUpdate={handleTimeUpdate}
                        onLoadedMetadata={() => {
                          const v = previewVideoRef.current;
                          if (v) {
                            setPreviewDuration(v.duration || 0);
                            if (v.videoWidth && v.videoHeight) {
                              const aspect = v.videoWidth / v.videoHeight;
                              setNaturalAspect(aspect);
                              const smart = getSmartBlurForRatio(selectedRatio, aspect);
                              setBlurPosition(smart.pos);
                              setBlurThickness(smart.thick);
                            }
                          }
                        }}
                        onEnded={() => setPreviewIsPlaying(false)}
                        onPause={() => {
                          setPreviewIsPlaying(false);
                          if (previewVideoRef.current) setPreviewCurrentTime(previewVideoRef.current.currentTime);
                        }}
                        onPlay={() => setPreviewIsPlaying(true)}
                        className="w-full h-full object-contain pointer-events-none"
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
                        preload="metadata"
                        controls
                        playsInline
                        className="w-full h-full object-contain"
                      />
                    )}



                    {/* LIVE INTERACTIVE FROSTED GLASS BLUR BOX (Team Alpha Style - Direct Drag & 2D Resize on Video) */}
                    {enableBlur && (
                      <div
                        style={{
                          top: `${Math.max(0, Math.min(100 - blurThickness, blurPosition - blurThickness / 2))}%`,
                          height: `${blurThickness}%`,
                          left: blurWidth >= 100 ? '0%' : `${Math.max(0, Math.min(100 - blurWidth, (100 - blurWidth) / 2))}%`,
                          width: `${Math.min(100, Math.max(25, blurWidth))}%`,
                          transform: 'translateZ(0)',
                        }}
                        onPointerDown={(e) => handlePointerDown('blur-move', e)}
                        className={`absolute z-10 flex flex-col items-center justify-center overflow-visible shadow-2xl transition-shadow ${blurWidth >= 98
                          ? 'border-y-2 border-amber-400/80'
                          : 'border-2 border-amber-400/90 shadow-amber-500/10'
                          } ${activeDrag === 'blur-move' ? 'cursor-grabbing ring-2 ring-amber-400' : 'cursor-grab hover:border-amber-300'}`}
                        title="Click & drag to reposition blur box on video"
                      >


                        {/* Frosted Glass Background */}
                        <div
                          style={{
                            backdropFilter: `blur(${Math.max(6, Math.round(blurIntensity * 0.35))}px)`,
                            WebkitBackdropFilter: `blur(${Math.max(6, Math.round(blurIntensity * 0.35))}px)`,
                            backgroundColor: `rgba(0, 0, 0, ${Math.min(0.78, Math.max(0.40, (blurIntensity / 100) * 0.85))})`,
                            // borderRadius: blurWidth < 98 ? '14px' : '0px',
                            transform: 'translateZ(0)',
                            willChange: 'transform',
                          }}
                          className="absolute inset-0 pointer-events-none"
                        />


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
                          {STEP_LABELS[jobStatus?.step || ''] || jobStatus?.message || 'Processing on AWS...'}
                        </>
                      ) : (
                        <span className="text-red-500 flex items-center gap-1.5 font-bold">
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          လုပ်ဆောင်မှု မအောင်မြင်ပါ
                        </span>
                      )}
                    </span>
                    <span className="text-indigo-600 dark:text-indigo-400 font-mono font-bold">
                      {isFailed ? 'Error' : jobStatus?.progress ? `${Math.max(0, jobStatus.progress)}%` : isUploading ? '...' : ''}
                    </span>
                  </div>

                  {isFailed && (jobStatus?.message || jobStatus?.error || error) && (
                    <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-[11px] leading-relaxed break-words font-medium">
                      {jobStatus?.message || jobStatus?.error || error}
                    </div>
                  )}

                  <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-zinc-700 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${isFailed
                        ? 'bg-red-500 w-full'
                        : 'bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500'
                        }`}
                      style={{ width: isFailed ? '100%' : `${Math.max(5, Math.min(100, jobStatus?.progress || (isUploading ? 12 : 0)))}%` }}
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
