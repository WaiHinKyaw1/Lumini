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
  Zap,
  Layers,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  Download,
  RotateCcw,
  RefreshCw,
  FileText,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Mic,
  SlidersHorizontal,
  Home,
  Sparkles,
  Type,
  Shield,
  ArrowRight,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface OneClickProps {
  onSpendCredits: (amount: number) => boolean;
  onNavigate?: (path: string) => void;
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

type DragType =
  | 'blur-move'
  | 'blur-resize-n'
  | 'blur-resize-s'
  | 'blur-resize-w'
  | 'blur-resize-e'
  | 'blur-resize-nw'
  | 'blur-resize-ne'
  | 'blur-resize-sw'
  | 'blur-resize-se'
  | 'subtitle-move'
  | 'subtitle-resize-n'
  | 'subtitle-resize-s'
  | 'subtitle-resize-w'
  | 'subtitle-resize-e'
  | 'subtitle-resize-nw'
  | 'subtitle-resize-ne'
  | 'subtitle-resize-sw'
  | 'subtitle-resize-se'
  | 'logo-move'
  | 'logo-resize-nw'
  | 'logo-resize-ne'
  | 'logo-resize-sw'
  | 'logo-resize-se';

const OneClick: React.FC<OneClickProps> = ({ onSpendCredits, onNavigate }) => {
  const [serverStatus, setServerStatus] = useState<OneClickHealthResponse | null>(null);
  const [isCheckingServer, setIsCheckingServer] = useState(true);

  // Active Tab: 'setup' | 'blur' | 'text' | 'logo'
  // When 'blur' is selected, preview + blur settings ONLY are shown (all other sections hidden)
  // When 'text' is selected, preview + text settings ONLY are shown
  // When 'logo' is selected, preview + logo settings ONLY are shown
  // When 'setup' is selected, preview + video upload & voice settings are shown
  const [activeTab, setActiveTab] = useState<'setup' | 'blur' | 'text' | 'logo'>('setup');

  // Input Mode: File Upload or Link
  const [inputMode, setInputMode] = useState<'upload' | 'url'>('upload');
  const [videoUrl, setVideoUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Voice & Narration Settings
  const [selectedVoice, setSelectedVoice] = useState('my-MM-KingBurma');
  const [voiceMode, setVoiceMode] = useState<'preset' | 'custom-sample'>('preset');
  const [voiceSampleFile, setVoiceSampleFile] = useState<File | null>(null);
  const [voiceSampleUrl, setVoiceSampleUrl] = useState<string | null>(null);
  const [selectedSpeed, setSelectedSpeed] = useState<string>('+35%');
  const [includeOriginalAudio, setIncludeOriginalAudio] = useState(false);

  // Output Aspect Ratio
  const [selectedRatio, setSelectedRatio] = useState<string>('original');
  const [naturalAspect, setNaturalAspect] = useState<number | null>(null);

  // 1. Frosted Glass Blur Settings (Shared State)
  const [enableBlur, setEnableBlur] = useState(true);
  const [blurPosition, setBlurPosition] = useState<number>(82);
  const [blurThickness, setBlurThickness] = useState<number>(14);
  const [blurWidth, setBlurWidth] = useState<number>(100);
  const [blurIntensity, setBlurIntensity] = useState<number>(35);

  // 2. Burmese Subtitles Settings (Shared State)
  const [enableSubtitles, setEnableSubtitles] = useState(true);
  const [subtitleX, setSubtitleX] = useState<number>(50);
  const [subtitleY, setSubtitleY] = useState<number>(82);
  const [subtitleWidth, setSubtitleWidth] = useState<number>(68);
  const [subtitleHeight, setSubtitleHeight] = useState<number>(14);
  const [subtitleStyle, setSubtitleStyle] = useState('font-akkhayar');
  const [previewSubtitleText, setPreviewSubtitleText] = useState('သူမရဲ့ ဘဝမှာ မထင်မှတ်ထားတဲ့ အဖြစ်အပျက်တစ်ခု ဖြစ်လာခဲ့ပါတယ်');

  // 3. Channel Logo / Watermark Settings (Shared State)
  const [enableLogo, setEnableLogo] = useState(true);
  const [watermarkText, setWatermarkText] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoX, setLogoX] = useState<number>(80);
  const [logoY, setLogoY] = useState<number>(6);
  const [logoAlign, setLogoAlign] = useState<'left' | 'center' | 'right'>('right');
  const [logoScale, setLogoScale] = useState<number>(14);
  const [logoOpacity, setLogoOpacity] = useState<number>(100);

  // ElevenLabs Key
  const [elevenApiKey, setElevenApiKey] = useState<string>(() => {
    try {
      return localStorage.getItem('lumini_elevenlabs_key') || 'sk_219a1341d802e55ab02509adffa20bbdc8c1489070b1dfa4';
    } catch {
      return 'sk_219a1341d802e55ab02509adffa20bbdc8c1489070b1dfa4';
    }
  });

  // URL Pre-Download States
  const [isDownloadingUrl, setIsDownloadingUrl] = useState(false);
  const [downloadedTempId, setDownloadedTempId] = useState<string | null>(null);
  const [urlVideoMeta, setUrlVideoMeta] = useState<{ duration?: number; width?: number; height?: number } | null>(null);

  // Video Preview State (Throttled for zero playback lag)
  const [previewCurrentTime, setPreviewCurrentTime] = useState(0);
  const [previewDuration, setPreviewDuration] = useState(0);
  const [previewIsPlaying, setPreviewIsPlaying] = useState(false);
  const [previewVolume, setPreviewVolume] = useState<number>(1);
  const [previewIsMuted, setPreviewIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Direct Canvas Calibrator Drag State
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const previewBoxRef = useRef<HTMLDivElement>(null);
  const [activeDrag, setActiveDrag] = useState<DragType | null>(null);
  const dragStartXRef = useRef<number>(0);
  const dragStartYRef = useRef<number>(0);
  const dragStartValRef = useRef<{
    pos: number;
    thick: number;
    width: number;
    subtitleX: number;
    subtitleY: number;
    subtitleWidth: number;
    subtitleHeight: number;
    logoX: number;
    logoY: number;
    logoScale: number;
  }>({
    pos: 82,
    thick: 14,
    width: 100,
    subtitleX: 50,
    subtitleY: 82,
    subtitleWidth: 68,
    subtitleHeight: 14,
    logoX: 80,
    logoY: 6,
    logoScale: 14,
  });

  // Job & Progress
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<OneClickJobStatus | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadBytes, setUploadBytes] = useState<{ loaded: number; total: number } | null>(null);

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

  // Detect YouTube Video ID
  const youtubeId = useMemo(() => {
    if (inputMode !== 'url' || !videoUrl.trim()) return null;
    const match = videoUrl.trim().match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/i);
    return match ? match[1] : null;
  }, [inputMode, videoUrl]);

  // Detect TikTok Video ID or URL
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

  // Target aspect ratio for canvas preview
  const targetRatioValue = useMemo<number>(() => {
    if (selectedRatio === '16:9') return 16 / 9;
    if (selectedRatio === '9:16') return 9 / 16;
    if (selectedRatio === '1:1') return 1.0;
    if (selectedRatio === '4:5') return 4 / 5;
    if (naturalAspect && Number.isFinite(naturalAspect) && naturalAspect > 0) {
      return naturalAspect;
    }
    return isTikTokUrl || isYouTubeShort || isRednoteUrl ? 9 / 16 : 16 / 9;
  }, [selectedRatio, naturalAspect, isTikTokUrl, isYouTubeShort, isRednoteUrl]);

  // Intelligent blur positioning based on aspect ratio
  const getSmartBlurForRatio = useCallback((ratioId: string, vidAspect: number | null): { pos: number; thick: number; width?: number } => {
    const vAspect = vidAspect && vidAspect > 0 ? vidAspect : 16 / 9;
    let cAspect = 16 / 9;
    if (ratioId === '9:16') cAspect = 9 / 16;
    else if (ratioId === '1:1') cAspect = 1.0;
    else if (ratioId === '4:5') cAspect = 4 / 5;
    else if (ratioId === '16:9') cAspect = 16 / 9;
    else cAspect = vAspect;

    if (vAspect > cAspect + 0.05) {
      const vHeightPct = cAspect / vAspect;
      const topPadPct = (1.0 - vHeightPct) / 2.0;
      const subPosPct = topPadPct + 0.82 * vHeightPct;
      const thickPct = Math.max(6, Math.min(22, Math.round(14 * vHeightPct)));
      return { pos: Math.round(subPosPct * 100), thick: thickPct, width: 100 };
    } else if (vAspect < cAspect - 0.05) {
      const vWidthPct = vAspect / cAspect;
      const wPct = Math.max(30, Math.min(100, Math.round(vWidthPct * 100)));
      return { pos: 82, thick: 14, width: wPct };
    }
    return { pos: 82, thick: 14, width: 100 };
  }, []);

  const handleRatioSelect = (ratioId: string) => {
    setSelectedRatio(ratioId);
    const smart = getSmartBlurForRatio(ratioId, naturalAspect);
    setBlurPosition(smart.pos);
    setBlurThickness(smart.thick);
    if (smart.width) setBlurWidth(smart.width);
  };

  // Preset Handlers
  const applyPreset = (preset: 'alpha' | 'tiktok' | 'youtube') => {
    if (preset === 'alpha') {
      setSelectedRatio('9:16');
      setEnableBlur(true);
      setBlurWidth(100);
      setBlurThickness(14);
      setBlurPosition(82);
      setSubtitleX(50);
      setSubtitleY(82);
      setSubtitleWidth(68);
      setSubtitleHeight(14);
      setSubtitleStyle('font-akkhayar');
      toast.success('Team Alpha Style (9:16 + Blur + Akkhayar) သတ်မှတ်ပြီးပါပြီ');
    } else if (preset === 'tiktok') {
      setSelectedRatio('9:16');
      setEnableBlur(false);
      setSubtitleX(50);
      setSubtitleY(84);
      setSubtitleStyle('font-akkhayar');
      toast.success('TikTok / Shorts Style (9:16) သတ်မှတ်ပြီးပါပြီ');
    } else if (preset === 'youtube') {
      setSelectedRatio('original');
      setEnableBlur(false);
      setSubtitleX(50);
      setSubtitleY(88);
      toast.success('Original / YouTube Style သတ်မှတ်ပြီးပါပြီ');
    }
  };

  // Reset Section Handlers
  const handleResetBlur = () => {
    setBlurPosition(82);
    setBlurThickness(14);
    setBlurWidth(100);
    setBlurIntensity(35);
    toast.success('Blur setting များကို မူလအတိုင်း ပြန်သတ်မှတ်လိုက်ပါသည်');
  };

  const handleResetSubtitle = () => {
    setSubtitleX(50);
    setSubtitleY(82);
    setSubtitleWidth(68);
    setSubtitleHeight(14);
    setSubtitleStyle('font-akkhayar');
    toast.success('စာတန်းထိုး setting များကို မူလအတိုင်း ပြန်သတ်မှတ်လိုက်ပါသည်');
  };

  const handleResetLogo = () => {
    setLogoX(80);
    setLogoY(6);
    setLogoScale(14);
    setLogoOpacity(100);
    toast.success('Logo setting များကို မူလအတိုင်း ပြန်သတ်မှတ်လိုက်ပါသည်');
  };

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
    const interval = setInterval(() => {
      checkServer(true);
    }, 8000);
    return () => clearInterval(interval);
  }, [checkServer]);

  // Fullscreen change listener
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

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

  const handleTimeUpdate = () => {
    const v = previewVideoRef.current;
    if (!v) return;
    const now = performance.now();
    if (now - lastTimeRef.current >= 150) {
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

  const handleToggleMute = () => {
    if (!previewVideoRef.current) return;
    const newMuted = !previewIsMuted;
    setPreviewIsMuted(newMuted);
    previewVideoRef.current.muted = newMuted;
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setPreviewVolume(val);
    if (previewVideoRef.current) {
      previewVideoRef.current.volume = val;
      if (val === 0) {
        setPreviewIsMuted(true);
        previewVideoRef.current.muted = true;
      } else if (previewIsMuted) {
        setPreviewIsMuted(false);
        previewVideoRef.current.muted = false;
      }
    }
  };

  const handleToggleFullscreen = () => {
    if (!previewContainerRef.current) return;
    if (!document.fullscreenElement) {
      previewContainerRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
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

  // Canvas Direct Pointer Down Handlers
  const handlePointerDown = (type: DragType, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveDrag(type);
    dragStartXRef.current = e.clientX;
    dragStartYRef.current = e.clientY;
    dragStartValRef.current = {
      pos: blurPosition,
      thick: blurThickness,
      width: blurWidth,
      subtitleX,
      subtitleY,
      subtitleWidth,
      subtitleHeight,
      logoX,
      logoY,
      logoScale,
    };
  };

  // Direct Drag and 2D Free Corner/Edge Resizing
  useEffect(() => {
    if (!activeDrag) return;

    const onPointerMove = (e: PointerEvent) => {
      if (!previewBoxRef.current) return;
      const rect = previewBoxRef.current.getBoundingClientRect();
      if (rect.height <= 0 || rect.width <= 0) return;

      const deltaX = e.clientX - dragStartXRef.current;
      const deltaY = e.clientY - dragStartYRef.current;
      const deltaXPercent = (deltaX / rect.width) * 100;
      const deltaYPercent = (deltaY / rect.height) * 100;

      // Blur Drag & Resizing
      if (activeDrag === 'blur-move') {
        const newPos = Math.round(Math.max(5, Math.min(95, dragStartValRef.current.pos + deltaYPercent)));
        setBlurPosition(newPos);
      } else if (activeDrag === 'blur-resize-n') {
        const newThick = Math.round(Math.max(2, Math.min(50, dragStartValRef.current.thick - deltaYPercent * 2)));
        setBlurThickness(newThick);
      } else if (activeDrag === 'blur-resize-s') {
        const newThick = Math.round(Math.max(2, Math.min(50, dragStartValRef.current.thick + deltaYPercent * 2)));
        setBlurThickness(newThick);
      } else if (activeDrag === 'blur-resize-w') {
        const newWidth = Math.round(Math.max(20, Math.min(100, dragStartValRef.current.width - deltaXPercent * 2)));
        setBlurWidth(newWidth);
      } else if (activeDrag === 'blur-resize-e') {
        const newWidth = Math.round(Math.max(20, Math.min(100, dragStartValRef.current.width + deltaXPercent * 2)));
        setBlurWidth(newWidth);
      } else if (activeDrag === 'blur-resize-nw') {
        const newThick = Math.round(Math.max(2, Math.min(50, dragStartValRef.current.thick - deltaYPercent * 2)));
        const newWidth = Math.round(Math.max(20, Math.min(100, dragStartValRef.current.width - deltaXPercent * 2)));
        setBlurThickness(newThick);
        setBlurWidth(newWidth);
      } else if (activeDrag === 'blur-resize-ne') {
        const newThick = Math.round(Math.max(2, Math.min(50, dragStartValRef.current.thick - deltaYPercent * 2)));
        const newWidth = Math.round(Math.max(20, Math.min(100, dragStartValRef.current.width + deltaXPercent * 2)));
        setBlurThickness(newThick);
        setBlurWidth(newWidth);
      } else if (activeDrag === 'blur-resize-sw') {
        const newThick = Math.round(Math.max(2, Math.min(50, dragStartValRef.current.thick - deltaYPercent * 2)));
        const newWidth = Math.round(Math.max(20, Math.min(100, dragStartValRef.current.width - deltaXPercent * 2)));
        setBlurThickness(newThick);
        setBlurWidth(newWidth);
      } else if (activeDrag === 'blur-resize-se') {
        const newThick = Math.round(Math.max(2, Math.min(50, dragStartValRef.current.thick + deltaYPercent * 2)));
        const newWidth = Math.round(Math.max(20, Math.min(100, dragStartValRef.current.width + deltaXPercent * 2)));
        setBlurThickness(newThick);
        setBlurWidth(newWidth);
      }
      // Subtitle Drag & Resizing
      else if (activeDrag === 'subtitle-move') {
        const newX = Math.round(Math.max(5, Math.min(95, dragStartValRef.current.subtitleX + deltaXPercent)));
        const newY = Math.round(Math.max(5, Math.min(95, dragStartValRef.current.subtitleY + deltaYPercent)));
        setSubtitleX(newX);
        setSubtitleY(newY);
      } else if (activeDrag === 'subtitle-resize-n') {
        const newH = Math.round(Math.max(4, Math.min(45, dragStartValRef.current.subtitleHeight - deltaYPercent * 2)));
        setSubtitleHeight(newH);
      } else if (activeDrag === 'subtitle-resize-s') {
        const newH = Math.round(Math.max(4, Math.min(45, dragStartValRef.current.subtitleHeight + deltaYPercent * 2)));
        setSubtitleHeight(newH);
      } else if (activeDrag === 'subtitle-resize-w') {
        const newW = Math.round(Math.max(15, Math.min(98, dragStartValRef.current.subtitleWidth - deltaXPercent * 2)));
        setSubtitleWidth(newW);
      } else if (activeDrag === 'subtitle-resize-e') {
        const newW = Math.round(Math.max(15, Math.min(98, dragStartValRef.current.subtitleWidth + deltaXPercent * 2)));
        setSubtitleWidth(newW);
      } else if (activeDrag === 'subtitle-resize-nw') {
        const newH = Math.round(Math.max(4, Math.min(45, dragStartValRef.current.subtitleHeight - deltaYPercent * 2)));
        const newW = Math.round(Math.max(15, Math.min(98, dragStartValRef.current.subtitleWidth - deltaXPercent * 2)));
        setSubtitleHeight(newH);
        setSubtitleWidth(newW);
      } else if (activeDrag === 'subtitle-resize-ne') {
        const newH = Math.round(Math.max(4, Math.min(45, dragStartValRef.current.subtitleHeight - deltaYPercent * 2)));
        const newW = Math.round(Math.max(15, Math.min(98, dragStartValRef.current.subtitleWidth + deltaXPercent * 2)));
        setSubtitleHeight(newH);
        setSubtitleWidth(newW);
      } else if (activeDrag === 'subtitle-resize-sw') {
        const newH = Math.round(Math.max(4, Math.min(45, dragStartValRef.current.subtitleHeight - deltaYPercent * 2)));
        const newW = Math.round(Math.max(15, Math.min(98, dragStartValRef.current.subtitleWidth - deltaXPercent * 2)));
        setSubtitleHeight(newH);
        setSubtitleWidth(newW);
      } else if (activeDrag === 'subtitle-resize-se') {
        const newH = Math.round(Math.max(4, Math.min(45, dragStartValRef.current.subtitleHeight - deltaYPercent * 2)));
        const newW = Math.round(Math.max(15, Math.min(98, dragStartValRef.current.subtitleWidth - deltaXPercent * 2)));
        setSubtitleHeight(newH);
        setSubtitleWidth(newW);
      }
      // Logo Drag & Resizing
      else if (activeDrag === 'logo-move') {
        const newX = Math.round(Math.max(0, Math.min(100 - dragStartValRef.current.logoScale, dragStartValRef.current.logoX + deltaXPercent)));
        const newY = Math.round(Math.max(0, Math.min(95, dragStartValRef.current.logoY + deltaYPercent)));
        setLogoX(newX);
        setLogoY(newY);
      } else if (activeDrag === 'logo-resize-se' || activeDrag === 'logo-resize-ne') {
        const newScale = Math.round(Math.max(4, Math.min(50, dragStartValRef.current.logoScale + deltaXPercent)));
        setLogoScale(newScale);
      } else if (activeDrag === 'logo-resize-sw' || activeDrag === 'logo-resize-nw') {
        const newScale = Math.round(Math.max(4, Math.min(50, dragStartValRef.current.logoScale - deltaXPercent)));
        setLogoScale(newScale);
      }
    };

    const onPointerUp = () => {
      setActiveDrag(null);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [activeDrag]);

  // URL Video Fetching
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

  // Start OneClick Pipeline Job
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
    setUploadProgress(0);
    setUploadBytes(null);
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
          subtitleX,
          subtitleY,
          subtitleWidth,
          subtitleHeight,
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
        },
        (pct, loaded, total) => {
          setUploadProgress(pct);
          setUploadBytes({ loaded, total });
        }
      );

      setJobId(resp.job_id);
      setIsUploading(false);

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
            setError('ဗီဒီယို ပြုလုပ်ခြင်း ရပ်တန့်သွားပါသည် (Connection lost). ကျေးဇူးပြု၍ ပြန်လည် စတင်ပေးပါ။');
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
      } catch {}
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

  // Subtitle Font Family Resolver
  const getSubtitleFontFamily = (styleId: string) => {
    switch (styleId) {
      case 'font-kunheing':
        return "'AJKunheing', 'Noto Sans Myanmar', sans-serif";
      case 'font-jojar':
        return "'MyanmarJojar', 'Noto Sans Myanmar', sans-serif";
      case 'font-myanmaros':
        return "'MyanmarOS', 'Noto Sans Myanmar', sans-serif";
      case 'font-padauk':
        return "'Noto Sans Myanmar', sans-serif";
      case 'font-akkhayar':
      default:
        return "'Akkhayar21', 'Noto Sans Myanmar', sans-serif";
    }
  };

  return (
    <div className="w-full max-w-full overflow-x-hidden max-w-4xl mx-auto space-y-3 animate-fade-in pb-28 lg:pb-16 px-2 sm:px-4">
      {/* Top Header Card */}
      <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/60 backdrop-blur-xl p-3.5 sm:p-5 shadow-sm">
        {onNavigate && (
          <button
            type="button"
            onClick={() => onNavigate('dashboard')}
            className="mb-2.5 inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-white transition-colors"
          >
            <span>←</span>
            <span>Dashboard သို့ ပြန်သွားမည်</span>
          </button>
        )}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-sm">
                Studio Editor
              </span>
              <span className="text-xs font-mono text-zinc-400">Movie Recap & Dubbing Suite</span>
            </div>
            <h1 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white mt-1">
              One Click English-to-Myanmar Recap
            </h1>
          </div>

          {/* Server Status Pill */}
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
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs font-semibold flex items-center gap-2 animate-shake">
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

      {/* MAIN UNIFIED STUDIO WORKFLOW */}
      {!isCompleted && (
        <div className="space-y-3">
          {/* 1. STICKY PREVIEW BOX AT THE TOP (Always pinned, seamless on Mobile & Desktop) */}
          <div className="sticky top-0 z-30 bg-white/95 dark:bg-[#0a0a0a]/95 backdrop-blur-md pt-1 pb-2">
            <div
              ref={previewContainerRef}
              className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/70 p-2 sm:p-3 shadow-sm space-y-2"
            >
              {/* Studio Canvas Title & Timecode */}
              <div className="flex items-center justify-between px-1">
                <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-indigo-400" />
                  Live Preview Studio
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300">
                  {formatTimeSimple(previewCurrentTime)} / {formatTimeSimple(previewDuration)}
                </span>
              </div>

              {/* Video Screen Container - Responsive Aspect Ratio */}
              <div
                className="relative w-full h-[200px] sm:h-[280px] lg:h-[350px] bg-zinc-950 rounded-xl overflow-hidden shadow-inner flex items-center justify-center border border-slate-200 dark:border-zinc-800 p-1 select-none"
              >
                {filePreviewUrl || (inputMode === 'url' && videoUrl.trim()) ? (
                  <div
                    ref={previewBoxRef}
                    style={{
                      aspectRatio: `${targetRatioValue}`,
                      maxHeight: '100%',
                      maxWidth: '100%',
                      height: targetRatioValue <= 1 ? '100%' : 'auto',
                      width: targetRatioValue > 1 ? '100%' : 'auto',
                    }}
                    className="relative mx-auto flex items-center justify-center overflow-hidden bg-black rounded-lg border border-indigo-500/30 shadow-2xl transition-all duration-200 select-none"
                  >
                    {/* Source Player: Upload File, YouTube Embed, TikTok Embed, or Direct Video */}
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
                              if (smart.width) setBlurWidth(smart.width);
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
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
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

                    {/* 1. LIVE FROSTED GLASS BLUR BOX (Pure Frosted Glass - No labels inside!) */}
                    {enableBlur && (
                      <div
                        style={{
                          top: `${Math.max(0, Math.min(100 - blurThickness, blurPosition - blurThickness / 2))}%`,
                          height: `${blurThickness}%`,
                          left: blurWidth >= 100 ? '0%' : `${Math.max(0, Math.min(100 - blurWidth, (100 - blurWidth) / 2))}%`,
                          width: `${Math.min(100, Math.max(20, blurWidth))}%`,
                          transform: 'translateZ(0)',
                        }}
                        onClick={() => setActiveTab('blur')}
                        onPointerDown={(e) => handlePointerDown('blur-move', e)}
                        className={`absolute flex items-center justify-center overflow-visible transition-shadow ${
                          activeTab === 'blur'
                            ? 'z-25 border-2 border-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.6)]'
                            : 'z-10 border border-transparent'
                        } ${activeDrag === 'blur-move' ? 'cursor-grabbing' : 'cursor-grab'}`}
                        title="Click to select Blur & drag to reposition"
                      >
                        {/* Pure Frosted Glass Background */}
                        <div
                          style={{
                            backdropFilter: `blur(${Math.max(2, Math.round(blurIntensity * 0.35))}px)`,
                            WebkitBackdropFilter: `blur(${Math.max(2, Math.round(blurIntensity * 0.35))}px)`,
                            backgroundColor: `rgba(0, 0, 0, ${Math.min(0.60, Math.max(0.12, (blurIntensity / 100) * 0.60))})`,
                            transform: 'translateZ(0)',
                            willChange: 'transform',
                          }}
                          className="absolute inset-0 pointer-events-none rounded-none"
                        />

                        {/* Handles visible ONLY when Blur tab is active and not playing */}
                        {activeTab === 'blur' && !previewIsPlaying && (
                          <>
                            {/* 4 Corner Handles for 2D independent resizing */}
                            <div
                              onPointerDown={(e) => handlePointerDown('blur-resize-nw', e)}
                              className="absolute -top-1.5 -left-1.5 w-3.5 h-3.5 rounded-full bg-white border-2 border-amber-500 shadow-md cursor-nwse-resize z-30 hover:scale-125 transition-transform"
                              title="Resize Top-Left"
                            />
                            <div
                              onPointerDown={(e) => handlePointerDown('blur-resize-ne', e)}
                              className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-white border-2 border-amber-500 shadow-md cursor-nesw-resize z-30 hover:scale-125 transition-transform"
                              title="Resize Top-Right"
                            />
                            <div
                              onPointerDown={(e) => handlePointerDown('blur-resize-sw', e)}
                              className="absolute -bottom-1.5 -left-1.5 w-3.5 h-3.5 rounded-full bg-white border-2 border-amber-500 shadow-md cursor-nesw-resize z-30 hover:scale-125 transition-transform"
                              title="Resize Bottom-Left"
                            />
                            <div
                              onPointerDown={(e) => handlePointerDown('blur-resize-se', e)}
                              className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-white border-2 border-amber-500 shadow-md cursor-nwse-resize z-30 hover:scale-125 transition-transform"
                              title="Resize Bottom-Right"
                            />

                            {/* 4 Edge Handles */}
                            <div
                              onPointerDown={(e) => handlePointerDown('blur-resize-n', e)}
                              className="absolute -top-1 left-1/2 -translate-x-1/2 w-6 h-2 rounded-full bg-white border border-amber-500 shadow cursor-ns-resize z-30 hover:scale-125 transition-transform"
                              title="Adjust Height"
                            />
                            <div
                              onPointerDown={(e) => handlePointerDown('blur-resize-s', e)}
                              className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-6 h-2 rounded-full bg-white border border-amber-500 shadow cursor-ns-resize z-30 hover:scale-125 transition-transform"
                              title="Adjust Height"
                            />
                            <div
                              onPointerDown={(e) => handlePointerDown('blur-resize-w', e)}
                              className="absolute -left-1 top-1/2 -translate-y-1/2 h-6 w-2 rounded-full bg-white border border-amber-500 shadow cursor-ew-resize z-30 hover:scale-125 transition-transform"
                              title="Adjust Width"
                            />
                            <div
                              onPointerDown={(e) => handlePointerDown('blur-resize-e', e)}
                              className="absolute -right-1 top-1/2 -translate-y-1/2 h-6 w-2 rounded-full bg-white border border-amber-500 shadow cursor-ew-resize z-30 hover:scale-125 transition-transform"
                              title="Adjust Width"
                            />
                          </>
                        )}
                      </div>
                    )}

                    {/* 2. BURMESE SUBTITLE BOX (Clean text content only - No editing badges inside) */}
                    {enableSubtitles && (
                      <div
                        style={{
                          top: `${Math.max(0, Math.min(100 - subtitleHeight, subtitleY - subtitleHeight / 2))}%`,
                          left: `${Math.max(0, Math.min(100 - subtitleWidth, subtitleX - subtitleWidth / 2))}%`,
                          width: `${subtitleWidth}%`,
                          height: `${subtitleHeight}%`,
                        }}
                        onClick={() => setActiveTab('text')}
                        onPointerDown={(e) => handlePointerDown('subtitle-move', e)}
                        className={`absolute flex items-center justify-center px-2 transition-shadow select-none ${
                          activeTab === 'text'
                            ? 'z-25 border-2 border-cyan-400 bg-black/30 rounded-xl shadow-[0_0_12px_rgba(34,211,238,0.6)] backdrop-blur-[1px]'
                            : 'z-20 border border-transparent'
                        } ${activeDrag === 'subtitle-move' ? 'cursor-grabbing' : 'cursor-grab'}`}
                        title="Click to select Text & drag to position"
                      >
                        <p
                          style={{
                            fontFamily: getSubtitleFontFamily(subtitleStyle),
                          }}
                          className="pointer-events-none text-center text-[clamp(10px,1.8vw,16px)] font-bold leading-snug text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)] max-w-full truncate px-1"
                        >
                          {previewSubtitleText}
                        </p>

                        {/* Handles visible ONLY when Text tab is active and not playing */}
                        {activeTab === 'text' && !previewIsPlaying && (
                          <>
                            {/* 4 Corner Handles for 2D independent resizing */}
                            <div
                              onPointerDown={(e) => handlePointerDown('subtitle-resize-nw', e)}
                              className="absolute -top-1.5 -left-1.5 w-3.5 h-3.5 rounded-full bg-white border-2 border-cyan-500 shadow-md cursor-nwse-resize z-30 hover:scale-125 transition-transform"
                              title="Resize Top-Left"
                            />
                            <div
                              onPointerDown={(e) => handlePointerDown('subtitle-resize-ne', e)}
                              className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-white border-2 border-cyan-500 shadow-md cursor-nesw-resize z-30 hover:scale-125 transition-transform"
                              title="Resize Top-Right"
                            />
                            <div
                              onPointerDown={(e) => handlePointerDown('subtitle-resize-sw', e)}
                              className="absolute -bottom-1.5 -left-1.5 w-3.5 h-3.5 rounded-full bg-white border-2 border-cyan-500 shadow-md cursor-nesw-resize z-30 hover:scale-125 transition-transform"
                              title="Resize Bottom-Left"
                            />
                            <div
                              onPointerDown={(e) => handlePointerDown('subtitle-resize-se', e)}
                              className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-white border-2 border-cyan-500 shadow-md cursor-nwse-resize z-30 hover:scale-125 transition-transform"
                              title="Resize Bottom-Right"
                            />

                            {/* 4 Edge Handles */}
                            <div
                              onPointerDown={(e) => handlePointerDown('subtitle-resize-n', e)}
                              className="absolute -top-1 left-1/2 -translate-x-1/2 w-6 h-2 rounded-full bg-white border border-cyan-500 shadow cursor-ns-resize z-30 hover:scale-125 transition-transform"
                              title="Adjust Height"
                            />
                            <div
                              onPointerDown={(e) => handlePointerDown('subtitle-resize-s', e)}
                              className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-6 h-2 rounded-full bg-white border border-cyan-500 shadow cursor-ns-resize z-30 hover:scale-125 transition-transform"
                              title="Adjust Height"
                            />
                            <div
                              onPointerDown={(e) => handlePointerDown('subtitle-resize-w', e)}
                              className="absolute -left-1 top-1/2 -translate-y-1/2 h-6 w-2 rounded-full bg-white border border-cyan-500 shadow cursor-ew-resize z-30 hover:scale-125 transition-transform"
                              title="Adjust Width"
                            />
                            <div
                              onPointerDown={(e) => handlePointerDown('subtitle-resize-e', e)}
                              className="absolute -right-1 top-1/2 -translate-y-1/2 h-6 w-2 rounded-full bg-white border border-cyan-500 shadow cursor-ew-resize z-30 hover:scale-125 transition-transform"
                              title="Adjust Width"
                            />
                          </>
                        )}
                      </div>
                    )}

                    {/* 3. CHANNEL LOGO / WATERMARK OVERLAY */}
                    {enableLogo && (logoUrl || watermarkText.trim()) && (
                      <div
                        style={{
                          position: 'absolute',
                          top: `${logoY}%`,
                          left: `${logoX}%`,
                          width: `${logoScale}%`,
                        }}
                        onClick={() => setActiveTab('logo')}
                        onPointerDown={(e) => handlePointerDown('logo-move', e)}
                        className={`max-h-[35%] transition-shadow select-none ${
                          activeTab === 'logo'
                            ? 'z-25 border-2 border-indigo-400 p-0.5 rounded-lg shadow-[0_0_12px_rgba(99,102,241,0.6)] cursor-grabbing'
                            : 'z-20 border border-transparent cursor-pointer'
                        }`}
                        title="Click to select Logo & drag"
                      >
                        {logoUrl ? (
                          <img
                            src={logoUrl}
                            alt="Watermark"
                            style={{ opacity: logoOpacity / 100 }}
                            className="w-full h-auto object-contain pointer-events-none select-none rounded drop-shadow-md"
                          />
                        ) : (
                          <span
                            style={{ opacity: logoOpacity / 100 }}
                            className="text-[10px] font-bold text-white bg-black/60 px-2 py-0.5 rounded whitespace-nowrap block drop-shadow"
                          >
                            {watermarkText}
                          </span>
                        )}

                        {/* Handles visible ONLY when Logo tab is active and not playing */}
                        {activeTab === 'logo' && !previewIsPlaying && (
                          <>
                            <div
                              onPointerDown={(e) => handlePointerDown('logo-resize-nw', e)}
                              className="absolute -top-1.5 -left-1.5 w-3.5 h-3.5 rounded-full bg-white border-2 border-indigo-600 shadow cursor-nwse-resize z-30 hover:scale-125 transition-transform"
                              title="Resize Corner"
                            />
                            <div
                              onPointerDown={(e) => handlePointerDown('logo-resize-ne', e)}
                              className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-white border-2 border-indigo-600 shadow cursor-nesw-resize z-30 hover:scale-125 transition-transform"
                              title="Resize Corner"
                            />
                            <div
                              onPointerDown={(e) => handlePointerDown('logo-resize-sw', e)}
                              className="absolute -bottom-1.5 -left-1.5 w-3.5 h-3.5 rounded-full bg-white border-2 border-indigo-600 shadow cursor-nesw-resize z-30 hover:scale-125 transition-transform"
                              title="Resize Corner"
                            />
                            <div
                              onPointerDown={(e) => handlePointerDown('logo-resize-se', e)}
                              className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-white border-2 border-indigo-600 shadow cursor-nwse-resize z-30 hover:scale-125 transition-transform"
                              title="Resize Corner"
                            />
                          </>
                        )}
                      </div>
                    )}

                    {/* Centered Big Play/Pause Toggle Overlay (when paused) */}
                    {filePreviewUrl && !previewIsPlaying && (
                      <button
                        type="button"
                        onClick={togglePreviewPlay}
                        className="absolute inset-0 m-auto w-12 h-12 rounded-full bg-indigo-600/90 hover:bg-indigo-500 text-white flex items-center justify-center shadow-2xl backdrop-blur-sm transition-transform hover:scale-110 active:scale-95 z-20 pointer-events-auto"
                        title="Play"
                      >
                        <Play className="w-5 h-5 ml-0.5" />
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="text-center p-5 space-y-2 text-zinc-500">
                    <Video className="w-7 h-7 mx-auto text-zinc-600 animate-pulse" />
                    <p className="text-xs font-medium">
                      {inputMode === 'url'
                        ? 'YouTube Shorts သို့မဟုတ် Video Link ထည့်သွင်းပြီးပါက Live Video Preview ပေါ်လာပါမည်'
                        : 'ဗီဒီယိုဖိုင် တင်သွင်းပြီးပါက Live Preview ပေါ်လာပါမည်'}
                    </p>
                  </div>
                )}
              </div>

              {/* Player Toolbar: Seek Scrubber, Volume, Fullscreen */}
              {filePreviewUrl && (
                <div className="space-y-1 pt-1">
                  {/* Timeline Scrubber */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={togglePreviewPlay}
                      className="p-1 rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 hover:bg-indigo-600 hover:text-white transition-colors"
                      title={previewIsPlaying ? 'Pause' : 'Play'}
                    >
                      {previewIsPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={previewDuration || 1}
                      step={0.05}
                      value={previewCurrentTime}
                      onChange={handlePreviewSeek}
                      className="flex-1 accent-indigo-500 cursor-pointer h-1.5 bg-slate-200 dark:bg-zinc-700 rounded-lg"
                    />
                    <span className="text-[10px] font-mono text-zinc-500 shrink-0">
                      {formatTimeSimple(previewCurrentTime)}
                    </span>
                  </div>

                  {/* Volume Control & Fullscreen Row */}
                  <div className="flex items-center justify-between text-xs pt-0.5">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleToggleMute}
                        className="text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                        title={previewIsMuted ? 'Unmute' : 'Mute'}
                      >
                        {previewIsMuted || previewVolume === 0 ? (
                          <VolumeX className="w-3.5 h-3.5 text-rose-500" />
                        ) : (
                          <Volume2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={previewIsMuted ? 0 : previewVolume}
                        onChange={handleVolumeChange}
                        className="w-16 sm:w-20 accent-indigo-500 h-1 bg-slate-200 dark:bg-zinc-700 rounded"
                        title="Volume"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={handleToggleFullscreen}
                      className="p-1 rounded text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                      title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                    >
                      {isFullscreen ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* UNIFIED 4 TABS DIRECTLY UNDER PREVIEW (Zero section clutter) */}
            <div className="grid grid-cols-4 gap-1 p-1 mt-2 rounded-2xl bg-slate-100 dark:bg-zinc-800/90 border border-slate-200 dark:border-zinc-700/60 shadow-sm">
              <button
                type="button"
                onClick={() => setActiveTab('setup')}
                className={`py-2 px-1 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  activeTab === 'setup'
                    ? 'bg-white dark:bg-zinc-700 text-indigo-600 dark:text-white shadow-sm ring-1 ring-black/5 dark:ring-white/10'
                    : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200'
                }`}
              >
                <Sliders className="w-3.5 h-3.5 text-indigo-500" />
                <span className="truncate">Setup</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('blur')}
                className={`py-2 px-1 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  activeTab === 'blur'
                    ? 'bg-amber-500 text-white shadow-sm ring-1 ring-amber-600/30'
                    : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span className="truncate">Blur</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('text')}
                className={`py-2 px-1 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  activeTab === 'text'
                    ? 'bg-cyan-500 text-white shadow-sm ring-1 ring-cyan-600/30'
                    : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200'
                }`}
              >
                <Type className="w-3.5 h-3.5" />
                <span className="truncate">Text</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('logo')}
                className={`py-2 px-1 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  activeTab === 'logo'
                    ? 'bg-indigo-600 text-white shadow-sm ring-1 ring-indigo-700/30'
                    : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200'
                }`}
              >
                <Shield className="w-3.5 h-3.5" />
                <span className="truncate">Logo</span>
              </button>
            </div>
          </div>

          {/* 2. THE SINGLE DEDICATED SETTINGS CARD (Everything else hidden based on activeTab) */}
          <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-4 sm:p-5 shadow-sm">
            {/* TAB 1: BLUR ONLY (When blur is clicked, preview + blur settings only, everything else hidden) */}
            {activeTab === 'blur' && (
              <div className="space-y-4 animate-fade-in">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-zinc-800">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center font-bold text-xs">
                      <SlidersHorizontal className="w-3.5 h-3.5" />
                    </span>
                    <h2 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                      Frosted Glass Blur Settings (Mask ချိန်ညှိမှု)
                    </h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleResetBlur}
                      title="Reset Blur to default"
                      className="px-2.5 py-1 rounded-lg text-[10px] font-bold text-slate-500 hover:text-amber-600 dark:text-zinc-400 dark:hover:text-amber-400 hover:bg-amber-100/50 dark:hover:bg-amber-900/30 transition-all flex items-center gap-1"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Reset Blur</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEnableBlur(!enableBlur)}
                      className={`text-xs font-bold px-3 py-1 rounded-lg transition-all ${
                        enableBlur
                          ? 'bg-amber-500 hover:bg-amber-400 text-white shadow-sm'
                          : 'bg-slate-200 dark:bg-zinc-700 text-slate-600 dark:text-zinc-300'
                      }`}
                    >
                      {enableBlur ? '✓ ON' : 'OFF'}
                    </button>
                  </div>
                </div>

                {enableBlur ? (
                  <div className="space-y-3.5">
                    {/* Quick Presets */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-slate-600 dark:text-zinc-400">
                        အသင့်သုံး Preset များ:
                      </label>
                      <div className="grid grid-cols-5 gap-1.5 text-[10px]">
                        {[
                          { label: 'Bottom', pos: 82, thick: 14, width: 100 },
                          { label: 'Movie', pos: 66, thick: 15, width: 100 },
                          { label: 'Center', pos: 60, thick: 16, width: 100 },
                          { label: 'Full', pos: 82, thick: 14, width: 100 },
                          { label: 'Narrow', pos: 80, thick: 14, width: 65 },
                        ].map((preset, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              setBlurPosition(preset.pos);
                              setBlurThickness(preset.thick);
                              setBlurWidth(preset.width);
                            }}
                            className={`py-1.5 px-1 rounded-lg border text-center transition-all ${
                              blurPosition === preset.pos && blurWidth === preset.width
                                ? 'border-amber-500 bg-amber-500 text-white font-bold shadow-sm'
                                : 'border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-400 hover:border-slate-300 bg-slate-50 dark:bg-zinc-800/40'
                            }`}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 4 Interactive Sliders */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 text-[11px]">
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-800/40 border border-slate-200 dark:border-zinc-700/60">
                        <div className="flex justify-between font-bold text-slate-700 dark:text-zinc-300 mb-1.5">
                          <span>နေရာ အမြင့် (Vertical Position Y):</span>
                          <span className="text-amber-500 font-mono font-bold">{blurPosition}%</span>
                        </div>
                        <input
                          type="range"
                          min={8}
                          max={96}
                          value={blurPosition}
                          onChange={(e) => setBlurPosition(Number(e.target.value))}
                          className="w-full accent-amber-500 cursor-pointer"
                        />
                      </div>

                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-800/40 border border-slate-200 dark:border-zinc-700/60">
                        <div className="flex justify-between font-bold text-slate-700 dark:text-zinc-300 mb-1.5">
                          <span>အထူ (Thickness / Height):</span>
                          <span className="text-amber-500 font-mono font-bold">{blurThickness}%</span>
                        </div>
                        <input
                          type="range"
                          min={2}
                          max={45}
                          value={blurThickness}
                          onChange={(e) => setBlurThickness(Number(e.target.value))}
                          className="w-full accent-amber-500 cursor-pointer"
                        />
                      </div>

                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-800/40 border border-slate-200 dark:border-zinc-700/60">
                        <div className="flex justify-between font-bold text-slate-700 dark:text-zinc-300 mb-1.5">
                          <span>အကျယ် (Width):</span>
                          <span className="text-amber-500 font-mono font-bold">{blurWidth}%</span>
                        </div>
                        <input
                          type="range"
                          min={20}
                          max={100}
                          value={blurWidth}
                          onChange={(e) => setBlurWidth(Number(e.target.value))}
                          className="w-full accent-amber-500 cursor-pointer"
                        />
                      </div>

                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-800/40 border border-slate-200 dark:border-zinc-700/60">
                        <div className="flex justify-between font-bold text-slate-700 dark:text-zinc-300 mb-1.5">
                          <span>ဝေဝါးမှုအား (Blur Intensity):</span>
                          <span className="text-amber-500 font-mono font-bold">{blurIntensity}%</span>
                        </div>
                        <input
                          type="range"
                          min={2}
                          max={100}
                          value={blurIntensity}
                          onChange={(e) => setBlurIntensity(Number(e.target.value))}
                          className="w-full accent-amber-500 cursor-pointer"
                        />
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/50 text-amber-700 dark:text-amber-300 text-[11px] flex items-center justify-between">
                      <span>💡 အပေါ်ရှိ Video Preview ပေါ်တွင်လည်း လက်ဖြင့်/Mouse ဖြင့် တိုက်ရိုက်ဆွဲရွှေ့/ချုံ့ချဲ့နိုင်ပါသည်။</span>
                    </div>
                  </div>
                ) : (
                  <div className="py-8 text-center text-xs text-slate-400 dark:text-zinc-500 bg-slate-50 dark:bg-zinc-800/20 rounded-xl border border-dashed border-slate-200 dark:border-zinc-800">
                    Frosted Blur ပိတ်ထားပါသည် (ဖွင့်ရန် အပေါ်ရှိ ON နှိပ်ပါ)
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: TEXT ONLY (When text is clicked, preview + text settings only, everything else hidden) */}
            {activeTab === 'text' && (
              <div className="space-y-4 animate-fade-in">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-zinc-800">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-cyan-500/10 text-cyan-500 flex items-center justify-center font-bold text-xs">
                      <Type className="w-3.5 h-3.5" />
                    </span>
                    <h2 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                      မြန်မာစာတန်းထိုး Settings (Subtitles & Font)
                    </h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleResetSubtitle}
                      title="Reset Subtitle to default"
                      className="px-2.5 py-1 rounded-lg text-[10px] font-bold text-slate-500 hover:text-cyan-600 dark:text-zinc-400 dark:hover:text-cyan-400 hover:bg-cyan-100/50 dark:hover:bg-cyan-900/30 transition-all flex items-center gap-1"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Reset Text</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEnableSubtitles(!enableSubtitles)}
                      className={`text-xs font-bold px-3 py-1 rounded-lg transition-all ${
                        enableSubtitles
                          ? 'bg-cyan-500 hover:bg-cyan-400 text-white shadow-sm'
                          : 'bg-slate-200 dark:bg-zinc-700 text-slate-600 dark:text-zinc-300'
                      }`}
                    >
                      {enableSubtitles ? '✓ ON' : 'OFF'}
                    </button>
                  </div>
                </div>

                {enableSubtitles ? (
                  <div className="space-y-3.5">
                    {/* Subtitle Preview Text Input */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-slate-600 dark:text-zinc-400">
                        နမူနာ စာတန်းထိုး စာသား (Preview Text):
                      </label>
                      <input
                        type="text"
                        value={previewSubtitleText}
                        onChange={(e) => setPreviewSubtitleText(e.target.value)}
                        placeholder="နမူနာ စာတန်းထိုး စာသား ရိုက်ထည့်ပါ..."
                        className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 text-xs text-slate-900 dark:text-white"
                      />
                    </div>

                    {/* Font Family Selector */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-slate-600 dark:text-zinc-400">
                        မြန်မာစာလုံး ဖောင့် (Font Style):
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
                            className={`py-2 px-1 rounded-lg border text-center transition-all ${
                              subtitleStyle === f.id
                                ? 'border-cyan-500 bg-cyan-500 text-white font-bold shadow-sm'
                                : 'border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 text-[11px] bg-slate-50 dark:bg-zinc-800/40'
                            }`}
                          >
                            <span className="block truncate">{f.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 4 Interactive Position & Size Sliders */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 text-[11px]">
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-800/40 border border-slate-200 dark:border-zinc-700/60">
                        <div className="flex justify-between font-bold text-slate-700 dark:text-zinc-300 mb-1.5">
                          <span>နေရာ အလျား (Position X):</span>
                          <span className="text-cyan-500 font-mono font-bold">{subtitleX}%</span>
                        </div>
                        <input
                          type="range"
                          min={10}
                          max={90}
                          value={subtitleX}
                          onChange={(e) => setSubtitleX(Number(e.target.value))}
                          className="w-full accent-cyan-500 cursor-pointer"
                        />
                      </div>

                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-800/40 border border-slate-200 dark:border-zinc-700/60">
                        <div className="flex justify-between font-bold text-slate-700 dark:text-zinc-300 mb-1.5">
                          <span>နေရာ အမြင့် (Position Y):</span>
                          <span className="text-cyan-500 font-mono font-bold">{subtitleY}%</span>
                        </div>
                        <input
                          type="range"
                          min={10}
                          max={95}
                          value={subtitleY}
                          onChange={(e) => setSubtitleY(Number(e.target.value))}
                          className="w-full accent-cyan-500 cursor-pointer"
                        />
                      </div>

                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-800/40 border border-slate-200 dark:border-zinc-700/60">
                        <div className="flex justify-between font-bold text-slate-700 dark:text-zinc-300 mb-1.5">
                          <span>စာတန်း အကျယ် (Width):</span>
                          <span className="text-cyan-500 font-mono font-bold">{subtitleWidth}%</span>
                        </div>
                        <input
                          type="range"
                          min={20}
                          max={95}
                          value={subtitleWidth}
                          onChange={(e) => setSubtitleWidth(Number(e.target.value))}
                          className="w-full accent-cyan-500 cursor-pointer"
                        />
                      </div>

                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-800/40 border border-slate-200 dark:border-zinc-700/60">
                        <div className="flex justify-between font-bold text-slate-700 dark:text-zinc-300 mb-1.5">
                          <span>စာတန်း အမြင့် (Height):</span>
                          <span className="text-cyan-500 font-mono font-bold">{subtitleHeight}%</span>
                        </div>
                        <input
                          type="range"
                          min={6}
                          max={35}
                          value={subtitleHeight}
                          onChange={(e) => setSubtitleHeight(Number(e.target.value))}
                          className="w-full accent-cyan-500 cursor-pointer"
                        />
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-cyan-50/50 dark:bg-cyan-950/20 border border-cyan-200/50 text-cyan-700 dark:text-cyan-300 text-[11px] flex items-center justify-between">
                      <span>💡 အပေါ်ရှိ Video Preview ပေါ်တွင်လည်း လက်ဖြင့်/Mouse ဖြင့် စာတန်းကို တိုက်ရိုက်ဆွဲရွှေ့/ချိန်နိုင်ပါသည်။</span>
                    </div>
                  </div>
                ) : (
                  <div className="py-8 text-center text-xs text-slate-400 dark:text-zinc-500 bg-slate-50 dark:bg-zinc-800/20 rounded-xl border border-dashed border-slate-200 dark:border-zinc-800">
                    မြန်မာစာတန်းထိုး ပိတ်ထားပါသည် (ဖွင့်ရန် အပေါ်ရှိ ON နှိပ်ပါ)
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: LOGO ONLY (When logo is clicked, preview + logo settings only, everything else hidden) */}
            {activeTab === 'logo' && (
              <div className="space-y-4 animate-fade-in">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-zinc-800">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center font-bold text-xs">
                      <Shield className="w-3.5 h-3.5" />
                    </span>
                    <h2 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                      Channel Logo / Watermark Settings
                    </h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleResetLogo}
                      title="Reset Logo to default"
                      className="px-2.5 py-1 rounded-lg text-[10px] font-bold text-slate-500 hover:text-indigo-600 dark:text-zinc-400 dark:hover:text-indigo-400 hover:bg-indigo-100/50 dark:hover:bg-indigo-900/30 transition-all flex items-center gap-1"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Reset Logo</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEnableLogo(!enableLogo)}
                      className={`text-xs font-bold px-3 py-1 rounded-lg transition-all ${
                        enableLogo
                          ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm'
                          : 'bg-slate-200 dark:bg-zinc-700 text-slate-600 dark:text-zinc-300'
                      }`}
                    >
                      {enableLogo ? '✓ ON' : 'OFF'}
                    </button>
                  </div>
                </div>

                {enableLogo ? (
                  <div className="space-y-3.5">
                    {/* Logo Image Upload / Preview */}
                    {logoUrl ? (
                      <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-zinc-800/60 border border-slate-200 dark:border-zinc-700">
                        <div className="flex items-center gap-3">
                          <img src={logoUrl} alt="Logo" className="w-10 h-10 object-contain rounded-lg bg-black/40 p-1 border border-zinc-700" />
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-900 dark:text-white truncate max-w-[200px]">{logoFile?.name || 'Uploaded Logo'}</p>
                            <p className="text-[10px] text-emerald-500 font-medium">✓ Active on Canvas</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleRemoveLogo}
                          className="text-xs font-bold text-rose-500 hover:underline px-2 py-1"
                        >
                          ဖယ်ရှားမည်
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => logoInputRef.current?.click()}
                        className="w-full py-3.5 border border-dashed border-slate-300 dark:border-zinc-700 rounded-xl text-xs font-bold text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800/60 transition-all flex items-center justify-center gap-2"
                      >
                        <ImageIcon className="w-4 h-4 text-indigo-500" />
                        <span>+ Channel Logo ပုံတင်ရန် (.png, .jpg, .webp)</span>
                      </button>
                    )}
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleLogoUpload}
                      className="hidden"
                    />

                    {/* Text Watermark alternative */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-slate-600 dark:text-zinc-400">
                        သို့မဟုတ် Channel နာမည် စာသား (Watermark Text):
                      </label>
                      <input
                        type="text"
                        value={watermarkText}
                        onChange={(e) => setWatermarkText(e.target.value)}
                        placeholder="ဥပမာ - Movie Recap / K Recap"
                        className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 text-xs text-slate-900 dark:text-white"
                      />
                    </div>

                    {/* 4 Interactive Logo Sliders */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 text-[11px]">
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-800/40 border border-slate-200 dark:border-zinc-700/60">
                        <div className="flex justify-between font-bold text-slate-700 dark:text-zinc-300 mb-1.5">
                          <span>နေရာ အလျား (Position X):</span>
                          <span className="text-indigo-500 font-mono font-bold">{logoX}%</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={90}
                          value={logoX}
                          onChange={(e) => setLogoX(Number(e.target.value))}
                          className="w-full accent-indigo-500 cursor-pointer"
                        />
                      </div>

                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-800/40 border border-slate-200 dark:border-zinc-700/60">
                        <div className="flex justify-between font-bold text-slate-700 dark:text-zinc-300 mb-1.5">
                          <span>နေရာ အမြင့် (Position Y):</span>
                          <span className="text-indigo-500 font-mono font-bold">{logoY}%</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={90}
                          value={logoY}
                          onChange={(e) => setLogoY(Number(e.target.value))}
                          className="w-full accent-indigo-500 cursor-pointer"
                        />
                      </div>

                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-800/40 border border-slate-200 dark:border-zinc-700/60">
                        <div className="flex justify-between font-bold text-slate-700 dark:text-zinc-300 mb-1.5">
                          <span>အရွယ်အစား (Scale):</span>
                          <span className="text-indigo-500 font-mono font-bold">{logoScale}%</span>
                        </div>
                        <input
                          type="range"
                          min={4}
                          max={40}
                          value={logoScale}
                          onChange={(e) => setLogoScale(Number(e.target.value))}
                          className="w-full accent-indigo-500 cursor-pointer"
                        />
                      </div>

                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-800/40 border border-slate-200 dark:border-zinc-700/60">
                        <div className="flex justify-between font-bold text-slate-700 dark:text-zinc-300 mb-1.5">
                          <span>ကြည်လင်မှု (Opacity):</span>
                          <span className="text-indigo-500 font-mono font-bold">{logoOpacity}%</span>
                        </div>
                        <input
                          type="range"
                          min={10}
                          max={100}
                          value={logoOpacity}
                          onChange={(e) => setLogoOpacity(Number(e.target.value))}
                          className="w-full accent-indigo-500 cursor-pointer"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="py-8 text-center text-xs text-slate-400 dark:text-zinc-500 bg-slate-50 dark:bg-zinc-800/20 rounded-xl border border-dashed border-slate-200 dark:border-zinc-800">
                    Channel Logo / Watermark ပိတ်ထားပါသည် (ဖွင့်ရန် အပေါ်ရှိ ON နှိပ်ပါ)
                  </div>
                )}
              </div>
            )}

            {/* TAB 4: SETUP (Video Source, Quick Presets, Voice & Ratio) */}
            {activeTab === 'setup' && (
              <div className="space-y-4 animate-fade-in">
                {/* 1. Video Source Input */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 dark:text-zinc-200">
                      ဗီဒီယို ဖိုင်တင်ရန် သို့မဟုတ် Link ထည့်ရန်:
                    </span>
                    {hasVideo && (
                      <span className="text-[11px] text-emerald-500 font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> ဗီဒီယို ရရှိပြီးပါပြီ
                      </span>
                    )}
                  </div>

                  {/* Mode Selector */}
                  <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-100 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700/60">
                    <button
                      type="button"
                      onClick={() => setInputMode('upload')}
                      className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                        inputMode === 'upload'
                          ? 'bg-white dark:bg-zinc-700 text-slate-900 dark:text-white shadow-sm'
                          : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200'
                      }`}
                    >
                      <Upload className="w-3.5 h-3.5 text-indigo-500" />
                      <span>Video File Upload</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setInputMode('url')}
                      className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                        inputMode === 'url'
                          ? 'bg-white dark:bg-zinc-700 text-slate-900 dark:text-white shadow-sm'
                          : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200'
                      }`}
                    >
                      <Zap className="w-3.5 h-3.5 text-purple-500" />
                      <span>Link / URL</span>
                    </button>
                  </div>

                  {inputMode === 'upload' ? (
                    file ? (
                      <div className="rounded-xl bg-indigo-50/50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 p-3 flex items-center justify-between">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0">
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
                        onDragOver={(e) => {
                          e.preventDefault();
                          setIsDragging(true);
                        }}
                        onDragLeave={() => setIsDragging(false)}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                        className={`rounded-xl border-2 border-dashed p-4 text-center cursor-pointer transition-all ${
                          isDragging
                            ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-500/10'
                            : 'border-slate-200 dark:border-zinc-700/80 hover:border-indigo-400 hover:bg-slate-50 dark:hover:bg-zinc-800/40'
                        }`}
                      >
                        <Upload className="w-5 h-5 mx-auto text-indigo-500 mb-1" />
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

                  {/* Quick Preset Buttons */}
                  <div className="pt-2 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-between gap-1.5 flex-wrap">
                    <span className="text-[11px] font-bold text-slate-500 dark:text-zinc-400">စတိုင် Presets:</span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => applyPreset('alpha')}
                        className="px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-[10px] font-bold transition-all"
                      >
                        ✨ Team Alpha (9:16)
                      </button>
                      <button
                        type="button"
                        onClick={() => applyPreset('tiktok')}
                        className="px-2.5 py-1 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30 text-[10px] font-bold transition-all"
                      >
                        📱 TikTok (9:16)
                      </button>
                      <button
                        type="button"
                        onClick={() => applyPreset('youtube')}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700 text-[10px] font-bold transition-all"
                      >
                        📺 YouTube (Original)
                      </button>
                    </div>
                  </div>
                </div>

                {/* Direct Shortcut to Advanced Canvas Settings */}
                <div
                  onClick={() => setActiveTab('blur')}
                  className="p-3 rounded-xl bg-gradient-to-r from-amber-500/10 via-cyan-500/10 to-indigo-500/10 border border-amber-500/30 hover:border-amber-500 cursor-pointer transition-all flex items-center justify-between group"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center font-bold text-sm shadow-sm">
                      🎨
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-amber-500 transition-colors">
                        Advanced Settings (Blur, စာတန်းထိုး နှင့် Logo ချိန်ရန်)
                      </p>
                      <p className="text-[10px] text-slate-400 dark:text-zinc-400">
                        Video ပေါ်တွင် တိုက်ရိုက်ဆွဲရွှေ့/ချိန်ညှိရန် ဤနေရာကို နှိပ်ပါ
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-amber-500 group-hover:translate-x-1 transition-transform" />
                </div>

                {/* 2. Voiceover & Speed Selection */}
                <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-zinc-800">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 dark:text-zinc-200">
                      ဇာတ်လမ်းပြော အသံနှင့် အမြန်နှုန်း:
                    </span>
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

                  {voiceMode === 'preset' ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {[
                        { id: 'my-MM-KingBurma', name: 'King Burma', mmName: 'မင်းမြန်မာ', tag: 'TikTok Pro' },
                        { id: 'my-MM-ThihaNeural', name: 'Thiha', mmName: 'သီဟ', tag: 'Classic Narrator' },
                        { id: 'my-MM-ZawNeural', name: 'Zaw', mmName: 'ဇော်', tag: 'Baritone' },
                        { id: 'my-MM-WunnaNeural', name: 'Min Khant', mmName: 'မင်းခန့်', tag: 'Youth' },
                        { id: 'gemini-charon', name: 'Charon', mmName: 'ရှာရွန်', tag: 'Gemini Cinematic' },
                        { id: 'gemini-puck', name: 'Puck', mmName: 'ပပ်ခ်', tag: 'Gemini Energy' },
                        { id: 'gemini-fenrir', name: 'Fenrir', mmName: 'ဖင်းရီယာ', tag: 'Gemini Deep' },
                        { id: 'gemini-orus', name: 'Orus', mmName: 'အိုးရပ်စ်', tag: 'Gemini Epic' },
                        { id: 'gemini-aoede', name: 'Aoede', mmName: 'အာအိုးဒီ', tag: 'Gemini Smooth' },
                      ].map((v) => (
                        <div
                          key={v.id}
                          onClick={() => !isProcessing && !isUploading && setSelectedVoice(v.id)}
                          className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer relative ${
                            selectedVoice === v.id
                              ? 'border-indigo-500 bg-indigo-50/70 dark:bg-indigo-500/10 ring-2 ring-indigo-500/20 shadow-sm'
                              : 'border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700 bg-slate-50/40 dark:bg-zinc-800/20'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-xs text-slate-900 dark:text-white truncate">
                              {v.mmName}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => handlePlayVoiceSample(e, v.id)}
                              className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold flex items-center gap-0.5 transition-all ${
                                sampleAudioPlaying === v.id
                                  ? 'bg-indigo-600 text-white animate-pulse'
                                  : 'bg-slate-200 dark:bg-zinc-700 text-slate-700 dark:text-zinc-300 hover:bg-indigo-600 hover:text-white'
                              }`}
                              title="နမူနာအသံ နားထောင်မည်"
                            >
                              <Volume2 className="w-2.5 h-2.5" />
                              <span>{sampleAudioPlaying === v.id ? 'Stop' : sampleAudioLoading === v.id ? '...' : 'Play'}</span>
                            </button>
                          </div>
                          <p className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold mt-1 truncate">{v.tag}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl border border-purple-500/30 bg-purple-50/30 dark:bg-purple-950/20 space-y-2">
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
                          className="border border-dashed border-purple-300 dark:border-purple-800 rounded-xl p-3.5 text-center cursor-pointer hover:bg-purple-100/40 dark:hover:bg-purple-900/20 transition-all"
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

                  {/* Speed Selector */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-zinc-800 text-xs">
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
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                            selectedSpeed === s.value
                              ? 'bg-indigo-600 text-white shadow-sm'
                              : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 hover:bg-slate-200'
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Aspect Ratio Selector */}
                  <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-zinc-800">
                    <label className="text-[11px] font-bold text-slate-600 dark:text-zinc-400">
                      ဗီဒီယို အရွယ်အစား (Aspect Ratio):
                    </label>
                    <div className="grid grid-cols-5 gap-1.5">
                      {[
                        { id: 'original', label: 'Original' },
                        { id: '16:9', label: '16:9 (YT)' },
                        { id: '9:16', label: '9:16 (TikTok)' },
                        { id: '1:1', label: '1:1 (Square)' },
                        { id: '4:5', label: '4:5 (Insta)' },
                      ].map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => handleRatioSelect(r.id)}
                          className={`py-1.5 px-1 rounded-xl border text-[11px] font-bold transition-all text-center truncate ${
                            selectedRatio === r.id
                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                              : 'border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 hover:border-slate-300 bg-slate-50 dark:bg-zinc-800/40'
                          }`}
                        >
                          {r.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Original Audio Mix Toggle */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-zinc-800 text-xs">
                    <div>
                      <span className="font-bold text-slate-700 dark:text-zinc-300 text-[11px]">မူရင်းဗီဒီယို Background အသံ ရောစပ်မည်:</span>
                      <p className="text-[10px] text-slate-400 dark:text-zinc-500">မူရင်းအသံကို 20% volume ဖြင့် အနောက်မှ ဖွင့်ထားမည်</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIncludeOriginalAudio(!includeOriginalAudio)}
                      className={`text-[10px] font-bold px-3 py-1 rounded-lg transition-all ${
                        includeOriginalAudio ? 'bg-indigo-600 text-white' : 'bg-slate-200 dark:bg-zinc-700 text-slate-600 dark:text-zinc-300'
                      }`}
                    >
                      {includeOriginalAudio ? '✓ ON' : 'OFF'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* In-Progress Notification & Progress Bar */}
          {(isUploading || isProcessing || isFailed) && (
            <div className="p-3.5 rounded-xl border border-indigo-500/20 bg-slate-50 dark:bg-zinc-800/80 shadow-md space-y-2">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-slate-800 dark:text-zinc-200">
                  {isUploading ? (
                    uploadProgress >= 100
                      ? 'Server သို့ ရောက်ရှိပြီး Pipeline စတင်နေပါပြီ...'
                      : 'ဗီဒီယို Cloud ပေါ်သို့ တင်ပို့နေပါသည်...'
                  ) : isProcessing ? (
                    STEP_LABELS[jobStatus?.step || ''] || jobStatus?.message || 'Processing on AWS...'
                  ) : (
                    <span className="text-red-500 flex items-center gap-1 font-bold">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      လုပ်ဆောင်မှု မအောင်မြင်ပါ
                    </span>
                  )}
                </span>
                <span className="text-indigo-600 dark:text-indigo-400 font-mono font-bold text-xs">
                  {isFailed
                    ? 'Error'
                    : isUploading
                    ? `${uploadProgress}%`
                    : `${Math.max(0, jobStatus?.progress || 0)}%`}
                </span>
              </div>

              {isFailed && (jobStatus?.message || jobStatus?.error || error) && (
                <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-[11px] leading-relaxed break-words font-medium">
                  {jobStatus?.message || jobStatus?.error || error}
                </div>
              )}

              <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-zinc-700 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    isFailed ? 'bg-red-500 w-full' : 'bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500'
                  }`}
                  style={{
                    width: isFailed
                      ? '100%'
                      : isUploading
                      ? `${Math.max(4, uploadProgress)}%`
                      : `${Math.max(5, Math.min(100, jobStatus?.progress || 0))}%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* ACTION GENERATE BUTTON (Desktop) */}
          <button
            type="button"
            onClick={handleStart}
            disabled={!hasVideo || isProcessing || isUploading || !serverStatus?.online}
            className={`hidden lg:block w-full py-3.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-200 shadow-xl ${
              !hasVideo || isProcessing || isUploading || !serverStatus?.online
                ? 'bg-slate-200 dark:bg-zinc-800 text-slate-400 dark:text-zinc-600 cursor-not-allowed shadow-none'
                : 'bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-indigo-500/30 active:scale-[0.99]'
            }`}
          >
            {isUploading ? (
              <span className="flex items-center justify-center gap-2">
                <LoadingSpinner size="sm" showLabel={false} />
                {uploadProgress >= 100 ? 'Starting Pipeline...' : `Uploading Video (${uploadProgress}%)...`}
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
      )}

      {/* Mobile Fixed Bottom Action Bar */}
      {!isCompleted && (
        <div className="fixed bottom-0 inset-x-0 p-3 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-xl border-t border-slate-200 dark:border-zinc-800 z-50 lg:hidden shadow-2xl flex items-center gap-2 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('dashboard')}
              aria-label="Dashboard"
              title="Dashboard သို့ ပြန်သွားမည်"
              className="p-3 rounded-xl bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 font-bold hover:bg-slate-200 dark:hover:bg-zinc-700 transition-colors flex-shrink-0"
            >
              <Home className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={handleStart}
            disabled={!hasVideo || isProcessing || isUploading || !serverStatus?.online}
            className={`flex-1 py-3.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-200 shadow-lg flex items-center justify-center gap-2 ${
              !hasVideo || isProcessing || isUploading || !serverStatus?.online
                ? 'bg-slate-200 dark:bg-zinc-800 text-slate-400 dark:text-zinc-600 cursor-not-allowed shadow-none'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/30 active:scale-[0.99]'
            }`}
          >
            {isUploading ? (
              <span className="flex items-center justify-center gap-2">
                <LoadingSpinner size="sm" showLabel={false} />
                {uploadProgress >= 100 ? 'Starting Pipeline...' : `Uploading (${uploadProgress}%)...`}
              </span>
            ) : isProcessing ? (
              <span className="flex items-center justify-center gap-2">
                <LoadingSpinner size="sm" showLabel={false} />
                {STEP_LABELS[jobStatus?.step || ''] || 'Generating Recap...'}
              </span>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>Generate Recap (15 CR)</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Fullscreen Transparent Drag Guard (prevents iframes or video player from stealing cursor events during drag) */}
      {activeDrag && (
        <div
          className="fixed inset-0 z-[9999] cursor-grabbing select-none"
          style={{ pointerEvents: 'auto' }}
        />
      )}
    </div>
  );
};

export default OneClick;
