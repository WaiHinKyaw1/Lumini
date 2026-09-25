import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";
import { CREDIT_COSTS, ContentType, JsonValue, JsonRecord } from '../types';
import { auth } from '../services/firebase';
import { logGeneration } from '../services/supabase';
import {
  createSyncJob,
  isMediaWorkerAvailable,
  isMediaWorkerConfigured,
  getOutputUrl,
  uploadMedia,
  waitForSyncJob,
} from '../services/mediaWorkerApi';
import {
  Upload,
  Video,
  Music,
  Image as ImageIcon,
  Sliders,
  Sparkles,
  Check,
  CheckCircle2,
  Play,
  Pause,
  Download,
  Trash2,
  RefreshCw,
  AlertCircle,
  ExternalLink,
  Layers,
  Server,
  X,
  Volume2,
  VolumeX,
  FileText,
  Gauge,
  Zap,
  RotateCcw,
  Clock,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface MovieRecapProps {
  onSpendCredits: (amount: number) => boolean;
}

const MovieRecap: React.FC<MovieRecapProps> = ({ onSpendCredits }) => {
  // --- State: Media ---
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoSourceUrl, setVideoSourceUrl] = useState('');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState<number>(0);

  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioDuration, setAudioDuration] = useState<number>(0);
  const [isAudioPreviewPlaying, setIsAudioPreviewPlaying] = useState(false);

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoImage, setLogoImage] = useState<HTMLImageElement | null>(null);
  const [logoPosition, setLogoPosition] = useState<'Top Right' | 'Top Left' | 'Bottom Right' | 'Bottom Left'>('Top Right');

  // --- State: AI Generation (Optional Veo prompt fallback) ---
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const [showAIPrompt, setShowAIPrompt] = useState(false);

  // --- State: Settings ---
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16' | '1:1' | '4:5'>('16:9');
  const [videoSpeed, setVideoSpeed] = useState(1.0);
  const [audioSpeed, setAudioSpeed] = useState(1.0);

  // Effects & Subtitle
  const [subtitleEnabled, setSubtitleEnabled] = useState(false);
  const [subtitleText, setSubtitleText] = useState('');
  const [srtFileName, setSrtFileName] = useState('');
  const [subtitleStyle, setSubtitleStyle] = useState('akkhayar-yellow');
  const [blurEnabled, setBlurEnabled] = useState(true);
  const [blurPosition, setBlurPosition] = useState(82);
  const [blurThickness, setBlurThickness] = useState(18);
  const [blurIntensity, setBlurIntensity] = useState(35);

  // Zoom Settings
  const [zoomEnabled, setZoomEnabled] = useState(false);
  const [zoomInterval, setZoomInterval] = useState(5);
  const [zoomDuration, setZoomDuration] = useState(3);

  // --- State: Playback & Processing ---
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [processingStage, setProcessingStage] = useState<'upload' | 'sync' | 'finalize' | 'complete'>('upload');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [outputMimeType, setOutputMimeType] = useState<string>('video/mp4');
  const [error, setError] = useState<string | null>(null);

  // Server availability status
  const [workerOnline, setWorkerOnline] = useState<boolean | null>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  // --- Refs ---
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const helperCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const videoInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const srtFileInputRef = useRef<HTMLInputElement>(null);

  // Check server health on mount
  useEffect(() => {
    let mounted = true;
    const checkServer = async () => {
      if (!isMediaWorkerConfigured()) {
        if (mounted) setWorkerOnline(false);
        return;
      }
      try {
        const available = await isMediaWorkerAvailable();
        if (mounted) setWorkerOnline(available);
      } catch {
        if (mounted) setWorkerOnline(false);
      }
    };
    checkServer();
    return () => { mounted = false; };
  }, []);

  // Cleanup object URLs
  useEffect(() => () => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    if (logoUrl) URL.revokeObjectURL(logoUrl);
    if (resultUrl && resultUrl.startsWith('blob:')) URL.revokeObjectURL(resultUrl);
  }, [videoUrl, audioUrl, logoUrl, resultUrl]);

  // Format helpers
  const formatTimeSimple = (seconds: number) => {
    if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatSrtTimestamp = (totalSeconds: number): string => {
    const safe = Math.max(0, totalSeconds);
    const hrs = Math.floor(safe / 3600);
    const mins = Math.floor((safe % 3600) / 60);
    const secs = Math.floor(safe % 60);
    const ms = Math.floor((safe % 1) * 1000);
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
  };

  const getActiveSubtitleCue = (srtText: string, timeSec: number): string => {
    if (!srtText || !srtText.includes('-->')) return srtText.trim();
    const blocks = srtText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split(/\n\s*\n/);
    const toSec = (t: string) => {
      const parts = t.trim().replace(',', '.').split(':');
      if (parts.length === 3) {
        return (parseFloat(parts[0]) || 0) * 3600 + (parseFloat(parts[1]) || 0) * 60 + (parseFloat(parts[2]) || 0);
      }
      return 0;
    };

    for (const block of blocks) {
      const lines = block.trim().split('\n').map((l) => l.trim()).filter(Boolean);
      const timeLine = lines.find((l) => l.includes('-->'));
      if (!timeLine) continue;
      const [startStr, endStr] = timeLine.split('-->');
      const start = toSec(startStr);
      const end = toSec(endStr);
      if (timeSec >= start && timeSec <= end) {
        const timeIdx = lines.indexOf(timeLine);
        return lines.slice(timeIdx + 1).join(' ').replace(/<[^>]*>/g, '').trim();
      }
    }
    return '';
  };

  const getFirstSubtitleCue = (srtText: string): string => {
    if (!srtText || !srtText.includes('-->')) return srtText.trim();
    const blocks = srtText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split(/\n\s*\n/);
    for (const block of blocks) {
      const lines = block.trim().split('\n').map((l) => l.trim()).filter(Boolean);
      const timeLine = lines.find((l) => l.includes('-->'));
      if (!timeLine) continue;
      const timeIdx = lines.indexOf(timeLine);
      const text = lines.slice(timeIdx + 1).join(' ').replace(/<[^>]*>/g, '').trim();
      if (text) return text;
    }
    return '';
  };

  const getSrtCuesCount = (srtText: string): number => {
    const matches = srtText.match(/-->/g);
    return matches ? matches.length : 0;
  };

  const handleSrtFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSrtFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setSubtitleText(content.trim());
        setSubtitleEnabled(true);
        toast.success(`Burma SRT ဖိုင် (${file.name}) တင်သွင်းပြီးပါပြီ!`);
      }
    };
    reader.readAsText(file, 'utf-8');
    if (srtFileInputRef.current) srtFileInputRef.current.value = '';
  };

  const handleRemoveSrt = () => {
    setSubtitleText('');
    setSrtFileName('');
    if (srtFileInputRef.current) srtFileInputRef.current.value = '';
    toast.success('SRT စာတန်းထိုးဖိုင်ကို ဖယ်ရှားလိုက်ပါသည်');
  };

  const handleDownloadSrt = () => {
    const text = subtitleText.trim();
    if (!text) {
      toast.error('ဒေါင်းလုဒ်လုပ်ရန် SRT ဖိုင် မရှိသေးပါ');
      return;
    }
    const duration = videoDuration > 0 ? videoDuration : 60;
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

    let srtContent = '';
    if (text.includes('-->')) {
      srtContent = text;
    } else if (lines.length <= 1) {
      srtContent = `1\n00:00:00,000 --> ${formatSrtTimestamp(duration)}\n${text}\n`;
    } else {
      const segmentDuration = duration / lines.length;
      lines.forEach((line, idx) => {
        const start = idx * segmentDuration;
        const end = (idx + 1) * segmentDuration;
        srtContent += `${idx + 1}\n${formatSrtTimestamp(start)} --> ${formatSrtTimestamp(end)}\n${line}\n\n`;
      });
    }

    // Include UTF-8 BOM (\uFEFF) so all video editing software & Windows automatically recognize Burmese Unicode
    const blob = new Blob(['\uFEFF' + srtContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = srtFileName || `burma_recap_${Date.now()}.srt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Burma SRT စာတန်းထိုးဖိုင် ဒေါင်းလုဒ်လုပ်ပြီးပါပြီ!');
  };

  // Auto-load SRT if redirected from Subtitle Studio
  useEffect(() => {
    try {
      const savedSrt = localStorage.getItem('lumini_active_srt');
      const savedName = localStorage.getItem('lumini_active_srt_name') || 'burma_subtitles.srt';
      if (savedSrt && savedSrt.trim()) {
        setSubtitleText(savedSrt.trim());
        setSrtFileName(savedName);
        setSubtitleEnabled(true);
        toast.success(`Subtitle Studio မှ SRT (${savedName}) ချိတ်ဆက်ပြီးပါပြီ!`);
        localStorage.removeItem('lumini_active_srt');
        localStorage.removeItem('lumini_active_srt_name');
      }
    } catch { }
  }, []);

  // --- Media Handlers ---
  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('video/')) {
        setError('ကျေးဇူးပြု၍ ဗီဒီယိုဖိုင် (.mp4, .webm, .mov) ရွေးပေးပါ။');
        return;
      }
      if (file.size > 200 * 1024 * 1024) {
        setError('ဗီဒီယို ဖိုင်ဆိုဒ် ကြီးလွန်းပါသည် (အများဆုံး 200MB)။');
        return;
      }
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      if (resultUrl && resultUrl.startsWith('blob:')) URL.revokeObjectURL(resultUrl);
      setResultUrl(null);
      setError(null);
      const url = URL.createObjectURL(file);
      setVideoFile(file);
      setVideoUrl(url);
      setVideoSpeed(1.0);
    }
  };

  const handleVideoUrl = async () => {
    const source = videoSourceUrl.trim();
    if (!source) return;
    try {
      setError(null);
      const response = await fetch(source);
      if (!response.ok) throw new Error('ဗီဒီယို URL ကို ရယူ၍ မရပါ။ Public direct video link ဖြစ်ပါစေ။');
      const blob = await response.blob();
      if (!blob.type.startsWith('video/')) throw new Error('ထည့်သွင်းထားသော URL သည် ဗီဒီယိုဖိုင် မဟုတ်ပါ။');
      const file = new File([blob], 'recap-source.mp4', { type: blob.type || 'video/mp4' });
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      setVideoFile(file);
      setVideoUrl(URL.createObjectURL(file));
      setResultUrl(null);
      setVideoSpeed(1.0);
    } catch (err: unknown) {
      setError((err as { message?: string })?.message || 'ဗီဒီယို URL ရယူခြင်း မအောင်မြင်ပါ။');
    }
  };

  const handleRemoveVideo = () => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoFile(null);
    setVideoUrl(null);
    setVideoDuration(0);
    setResultUrl(null);
    if (videoInputRef.current) videoInputRef.current.value = '';
  };

  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('audio/')) {
        setError('ကျေးဇူးပြု၍ အသံဖိုင် (.mp3, .wav, .m4a) ရွေးပေးပါ။');
        return;
      }
      if (file.size > 50 * 1024 * 1024) {
        setError('အသံ ဖိုင်ဆိုဒ် ကြီးလွန်းပါသည် (အများဆုံး 50MB)။');
        return;
      }
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      const url = URL.createObjectURL(file);
      setAudioFile(file);
      setAudioUrl(url);
      setAudioSpeed(1.0);
      setError(null);
    }
  };

  const handleRemoveAudio = () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioFile(null);
    setAudioUrl(null);
    setAudioDuration(0);
    setIsAudioPreviewPlaying(false);
    if (audioInputRef.current) audioInputRef.current.value = '';
  };

  const toggleAudioPreview = () => {
    if (!audioRef.current) return;
    if (isAudioPreviewPlaying) {
      audioRef.current.pause();
      setIsAudioPreviewPlaying(false);
    } else {
      audioRef.current.currentTime = 0;
      audioRef.current.play().then(() => setIsAudioPreviewPlaying(true)).catch(() => { });
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (logoUrl) URL.revokeObjectURL(logoUrl);
      const url = URL.createObjectURL(file);
      setLogoFile(file);
      setLogoUrl(url);
      const img = new Image();
      img.src = url;
      img.onload = () => setLogoImage(img);
    }
  };

  const handleRemoveLogo = () => {
    if (logoUrl) URL.revokeObjectURL(logoUrl);
    setLogoFile(null);
    setLogoUrl(null);
    setLogoImage(null);
    if (logoInputRef.current) logoInputRef.current.value = '';
  };

  const onVideoLoaded = () => {
    if (videoRef.current) {
      setVideoDuration(videoRef.current.duration);
    }
  };

  const onAudioLoaded = () => {
    if (audioRef.current) {
      setAudioDuration(audioRef.current.duration);
    }
  };

  // --- Speed & Timeline Synchronization Helpers ---
  const effectiveVideoDuration = videoDuration > 0 ? videoDuration / videoSpeed : 0;
  const effectiveAudioDuration = audioDuration > 0 ? audioDuration / audioSpeed : 0;
  const durationDiff = effectiveVideoDuration - effectiveAudioDuration;
  const isTimelineSynced = audioFile ? Math.abs(durationDiff) <= 0.4 : true;

  // Auto-Match Video Speed to Voiceover Duration
  const handleAutoMatchVideoToAudio = () => {
    if (!videoDuration || !audioDuration) {
      toast.error('ဗီဒီယိုနှင့် အသံဖိုင် နှစ်ခုစလုံး လိုအပ်ပါသည်');
      return;
    }
    const effectiveAudioDur = audioDuration / audioSpeed;
    const targetVideoSpeed = videoDuration / effectiveAudioDur;
    const clamped = Math.min(3.0, Math.max(0.25, Number(targetVideoSpeed.toFixed(2))));
    setVideoSpeed(clamped);
    toast.success(`ဗီဒီယို Speed ကို ${clamped}x သို့ ညှိပြီး Voiceover ကြာချိန် (${formatTimeSimple(effectiveAudioDur)}) နှင့် အချိန်ကိုက် ညှိပြီးပါပြီ!`);
  };

  // Auto-Match Voiceover Speed to Video Duration
  const handleAutoMatchAudioToVideo = () => {
    if (!videoDuration || !audioDuration) {
      toast.error('ဗီဒီယိုနှင့် အသံဖိုင် နှစ်ခုစလုံး လိုအပ်ပါသည်');
      return;
    }
    const effectiveVideoDur = videoDuration / videoSpeed;
    const targetAudioSpeed = audioDuration / effectiveVideoDur;
    const clamped = Math.min(3.0, Math.max(0.25, Number(targetAudioSpeed.toFixed(2))));
    setAudioSpeed(clamped);
    toast.success(`Voiceover Speed ကို ${clamped}x သို့ ညှိပြီး ဗီဒီယို ကြာချိန် (${formatTimeSimple(effectiveVideoDur)}) နှင့် အချိန်ကိုက် ညှိပြီးပါပြီ!`);
  };

  // Reset Speeds
  const handleResetSpeeds = () => {
    setVideoSpeed(1.0);
    setAudioSpeed(1.0);
    toast.success('Speed များကို မူရင်း 1.0x သို့ ပြန်လည်သတ်မှတ်ပြီးပါပြီ');
  };

  // --- Playback Controls ---
  const togglePlayback = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
        if (audioRef.current) audioRef.current.pause();
      } else {
        if (audioRef.current) {
          const syncedAudioTime = (videoRef.current.currentTime / videoSpeed) * audioSpeed;
          if (Number.isFinite(syncedAudioTime)) {
            audioRef.current.currentTime = Math.max(0, Math.min(audioDuration, syncedAudioTime));
          }
          audioRef.current.play().catch(() => { });
        }
        videoRef.current.play().catch(() => { });
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = Number(e.target.value);
    setCurrentTime(time);
    if (videoRef.current) videoRef.current.currentTime = time;
    if (audioRef.current) {
      const syncedAudioTime = (time / videoSpeed) * audioSpeed;
      audioRef.current.currentTime = Math.max(0, Math.min(audioDuration, syncedAudioTime));
    }
  };

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = videoSpeed;
    if (audioRef.current) audioRef.current.playbackRate = audioSpeed;
  }, [videoSpeed, audioSpeed]);

  useEffect(() => {
    const video = videoRef.current;
    const onEnded = () => {
      setIsPlaying(false);
      if (audioRef.current) audioRef.current.pause();
    };
    const onTimeUpdate = () => {
      if (video) setCurrentTime(video.currentTime);
    };
    video?.addEventListener('ended', onEnded);
    video?.addEventListener('timeupdate', onTimeUpdate);
    return () => {
      video?.removeEventListener('ended', onEnded);
      video?.removeEventListener('timeupdate', onTimeUpdate);
    };
  }, [isPlaying]);

  // --- Live Canvas Renderer ---
  const renderFrame = useCallback((
    ctx: CanvasRenderingContext2D,
    video: HTMLVideoElement,
    width: number,
    height: number,
    timeMs: number
  ) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);

    const vRatio = video.videoWidth / video.videoHeight;
    const cRatio = width / height;
    let drawW, drawH, offsetX, offsetY;

    if (vRatio > cRatio) {
      drawW = width;
      drawH = width / vRatio;
      offsetX = 0;
      offsetY = (height - drawH) / 2;
    } else {
      drawH = height;
      drawW = height * vRatio;
      offsetX = (width - drawW) / 2;
      offsetY = 0;
    }

    let scale = 1.0;
    if (zoomEnabled) {
      const timeSec = timeMs / 1000;
      const safeInterval = Math.max(1, zoomInterval);
      const safeDuration = Math.min(zoomDuration, safeInterval);
      const timeInInterval = timeSec % safeInterval;
      if (timeInInterval < safeDuration) {
        const p = timeInInterval / safeDuration;
        scale = 1.0 + (Math.sin(p * Math.PI) * 0.15);
      }
    }

    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.scale(scale, scale);
    ctx.translate(-width / 2, -height / 2);
    ctx.drawImage(video, offsetX, offsetY, drawW, drawH);
    ctx.restore();

    // Blur Strip (True Frosted Glass Blur - natural video blur without opaque black block)
    if (blurEnabled) {
      const bY = (blurPosition / 100) * height;
      const bH = (blurThickness / 100) * height;
      if (!helperCanvasRef.current) helperCanvasRef.current = document.createElement('canvas');
      const helper = helperCanvasRef.current;

      if (helper) {
        const scaleFactor = 0.2;
        const smallW = Math.max(1, Math.floor(width * scaleFactor));
        const smallH = Math.max(1, Math.floor(height * scaleFactor));
        if (helper.width !== smallW || helper.height !== smallH) {
          helper.width = smallW;
          helper.height = smallH;
        }
        const hCtx = helper.getContext('2d', { alpha: false });
        if (hCtx) {
          hCtx.fillStyle = '#000';
          hCtx.fillRect(0, 0, smallW, smallH);
          const blurPx = Math.max(6, Math.round(blurIntensity * scaleFactor * 1.5));
          hCtx.filter = `blur(${blurPx}px)`;
          hCtx.drawImage(video, offsetX * scaleFactor, offsetY * scaleFactor, drawW * scaleFactor, drawH * scaleFactor);
          hCtx.filter = 'none';

          ctx.save();
          ctx.beginPath();
          ctx.rect(0, bY - bH / 2, width, bH);
          ctx.clip();
          // Draw the true blurred video frame
          ctx.drawImage(helper, 0, 0, smallW, smallH, 0, 0, width, height);
          
          // Subtle soft glass tint so underlying movie colors remain vibrant and visible while text is thoroughly obscured
          ctx.fillStyle = 'rgba(0,0,0,0.12)';
          ctx.fillRect(0, bY - bH / 2, width, bH);

          // Subtle elegant glass edge borders
          ctx.strokeStyle = 'rgba(255,255,255,0.22)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, bY - bH / 2);
          ctx.lineTo(width, bY - bH / 2);
          ctx.moveTo(0, bY + bH / 2);
          ctx.lineTo(width, bY + bH / 2);
          ctx.stroke();
          ctx.restore();
        }
      }
    }

    // Subtitle Style Preview Text (only if subtitleEnabled is on and subtitleText is present)
    if (subtitleEnabled && subtitleText.trim()) {
      ctx.save();
      let subText = '';
      if (subtitleText.includes('-->')) {
        const currentAudioTime = audioFile ? (video.currentTime / videoSpeed) * audioSpeed : video.currentTime;
        const active = getActiveSubtitleCue(subtitleText, currentAudioTime || 0);
        subText = active || (video.paused ? getFirstSubtitleCue(subtitleText) : '');
      } else {
        subText = subtitleText.trim();
      }

      if (subText) {
        // Base font size: 5.5% of height, then auto-scale down to fit 90% of strip width
        let fontSize = Math.max(14, Math.floor(height * 0.055));
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Strictly wrap into at most 2 lines (never 3 lines)
        const maxLineWidth = width * 0.88;
        const wrapTextToMax2Lines = (text: string, maxW: number): string[] => {
          const clean = text.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
          ctx.font = `bold ${fontSize}px Akkhayar21, sans-serif`;
          if (ctx.measureText(clean).width <= maxW) return [clean];

          const words = clean.split(' ');
          if (words.length > 1) {
            let bestSplit = 1;
            let minDiff = Infinity;
            for (let i = 1; i < words.length; i++) {
              const l1 = words.slice(0, i).join(' ');
              const l2 = words.slice(i).join(' ');
              const w1 = ctx.measureText(l1).width;
              const w2 = ctx.measureText(l2).width;
              const diff = Math.abs(w1 - w2);
              if (diff < minDiff) {
                minDiff = diff;
                bestSplit = i;
              }
            }
            return [words.slice(0, bestSplit).join(' ').trim(), words.slice(bestSplit).join(' ').trim()];
          }

          const punctMatch = clean.search(/[၊။]/);
          if (punctMatch !== -1 && punctMatch > 6 && punctMatch < clean.length - 6) {
            return [clean.slice(0, punctMatch + 1).trim(), clean.slice(punctMatch + 1).trim()];
          }

          const mid = Math.floor(clean.length / 2);
          return [clean.slice(0, mid).trim(), clean.slice(mid).trim()];
        };

        // Auto-scale font so both lines fit cleanly within maxLineWidth
        let lines = wrapTextToMax2Lines(subText, maxLineWidth);
        ctx.font = `bold ${fontSize}px Akkhayar21, sans-serif`;
        const maxMeasured = Math.max(...lines.map(l => ctx.measureText(l).width));
        if (maxMeasured > maxLineWidth) {
          fontSize = Math.max(10, Math.floor(fontSize * maxLineWidth / maxMeasured));
          ctx.font = `bold ${fontSize}px Akkhayar21, sans-serif`;
          lines = wrapTextToMax2Lines(subText, maxLineWidth);
        }

        const lineHeight = fontSize * 1.35;
        const subX = width / 2;
        // Center within the blur strip band
        const stripCenterY = blurEnabled ? (blurPosition / 100) * height : height - Math.max(26, Math.floor(height * 0.09));
        const totalTextH = lines.length * lineHeight;
        const startY = stripCenterY - (totalTextH / 2) + lineHeight / 2;

        lines.forEach((line, idx) => {
          const lineY = startY + idx * lineHeight;
          if (subtitleStyle === 'akkhayar-box') {
            const metrics = ctx.measureText(line);
            const padX = 14, padY = 5;
            ctx.fillStyle = 'rgba(0, 0, 0, 0.82)';
            ctx.fillRect(subX - metrics.width / 2 - padX, lineY - fontSize / 2 - padY, metrics.width + padX * 2, fontSize + padY * 2);
            ctx.fillStyle = '#FFFFFF';
            ctx.fillText(line, subX, lineY);
          } else if (subtitleStyle === 'akkhayar-yellow') {
            ctx.lineWidth = Math.max(2, Math.floor(height * 0.006));
            ctx.strokeStyle = '#000000';
            ctx.strokeText(line, subX, lineY);
            ctx.fillStyle = '#FACC15';
            ctx.fillText(line, subX, lineY);
          } else if (subtitleStyle === 'akkhayar-outline') {
            ctx.lineWidth = Math.max(3, Math.floor(height * 0.008));
            ctx.strokeStyle = '#000000';
            ctx.strokeText(line, subX, lineY);
            ctx.fillStyle = '#FFFFFF';
            ctx.fillText(line, subX, lineY);
          } else {
            ctx.shadowColor = 'rgba(0,0,0,0.85)';
            ctx.shadowBlur = 5;
            ctx.fillStyle = '#FFFFFF';
            ctx.fillText(line, subX, lineY);
          }
        });
      }
      ctx.restore();
    }

    // Logo Watermark
    if (logoImage) {
      const lSize = Math.min(width, height) * 0.16;
      const pad = 16;
      let lx = pad, ly = pad;
      if (logoPosition.includes('Right')) lx = width - lSize - pad;
      if (logoPosition.includes('Bottom')) ly = height - lSize - pad;
      ctx.globalAlpha = 0.9;
      ctx.drawImage(logoImage, lx, ly, lSize, lSize);
      ctx.globalAlpha = 1.0;
    }
  }, [blurEnabled, blurPosition, blurThickness, blurIntensity, zoomEnabled, zoomInterval, zoomDuration, logoImage, logoPosition, subtitleStyle, subtitleText, audioFile, videoSpeed, audioSpeed]);

  // Preview render loop
  useEffect(() => {
    const loop = () => {
      if (previewCanvasRef.current && videoRef.current && videoRef.current.readyState >= 2) {
        const cvs = previewCanvasRef.current;
        const ctx = cvs.getContext('2d');
        let w = 480;
        let h = 270;
        if (aspectRatio === "9:16") { w = 270; h = 480; }
        else if (aspectRatio === "1:1") { w = 360; h = 360; }
        else if (aspectRatio === "4:5") { w = 320; h = 400; }
        cvs.width = w;
        cvs.height = h;
        if (ctx) renderFrame(ctx, videoRef.current, w, h, videoRef.current.currentTime * 1000);
      }
      animationFrameRef.current = requestAnimationFrame(loop);
    };
    loop();
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [aspectRatio, renderFrame]);

  // Cancel generator handler
  const handleCancelGeneration = () => {
    if (abortController) {
      abortController.abort();
    }
    setIsProcessing(false);
    setProgress(0);
    setStatusMessage('');
    toast.error('လုပ်ဆောင်ချက်ကို ရပ်တန့်လိုက်ပါသည် (Cancelled)');
  };

  // --- GENERATE RECAP VIDEO (AWS Server Sync + Accurate Progress) ---
  const handleGenerate = async () => {
    if (!videoUrl || !videoRef.current) return;
    if (!Number.isFinite(videoDuration) || videoDuration <= 0) {
      setError('ဗီဒီယို ဖိုင်ကို အပြည့်အစုံ မဖတ်နိုင်သေးပါ။ ခေတ္တစောင့်ဆိုင်းပြီး ပြန်လည်ကြိုးစားပါ။');
      return;
    }
    if (subtitleEnabled && !subtitleText.trim()) {
      setError('ကျေးဇူးပြု၍ Burma SRT စာတန်းထိုးဖိုင် (.srt) တင်သွင်းပါ (သို့မဟုတ် Subtitle ခလုတ်ကို ပိတ်ပါ)။');
      return;
    }
    if (!onSpendCredits(CREDIT_COSTS[ContentType.MOVIE_RECAP])) {
      setError("လုံလောက်သော Credit မရှိပါ။");
      return;
    }

    setIsProcessing(true);
    setProgress(1);
    setProcessingStage('upload');
    setStatusMessage('စတင် ပြင်ဆင်နေပါသည်... (Initializing)');
    setError(null);
    setIsPlaying(false);
    videoRef.current.pause();
    if (audioRef.current) audioRef.current.pause();

    const controller = new AbortController();
    setAbortController(controller);

    try {
      if (!videoFile) throw new Error('ကျေးဇူးပြု၍ ဗီဒီယို ဖိုင်ကို အရင် ရွေးချယ်ပေးပါ။');

      const workerConfigured = isMediaWorkerConfigured();
      let isAvailable = false;
      if (workerConfigured) {
        try {
          isAvailable = await isMediaWorkerAvailable();
        } catch {
          isAvailable = false;
        }
      }

      if (!isAvailable) {
        throw new Error('AWS Cloud Media Worker ချိတ်ဆက်ထားခြင်း မရှိသေးပါ။ Local စက်တွင် ဝန်မပိစေရန် ဗီဒီယို processing ကို AWS Cloud Server ပေါ်တွင်သာ အပြည့်အဝ လုပ်ဆောင်ပါမည်။ ကျေးဇူးပြု၍ AWS Server ကို စတင်ပေးပါ။');
      }

      // ==========================================
      // 100% AWS CLOUD MEDIA WORKER SYNC
      // All heavy FFmpeg encoding runs on the cloud
      // Zero heavy CPU/GPU burden on local machine
      // ==========================================
      setProcessingStage('upload');
      const hasAudio = !!audioFile;
      const videoRatioWeight = hasAudio ? 0.35 : 0.45;

      setStatusMessage('ဗီဒီယို ဖိုင်ကို AWS ဆာဗာသို့ တင်နေပါသည်... (Uploading video)');
      const uploadedVideo = await uploadMedia(
        videoFile,
        (val) => {
          const current = Math.min(Math.round(val * videoRatioWeight), Math.round(videoRatioWeight * 100));
          setProgress(Math.max(1, current));
          setStatusMessage(`ဗီဒီယို ဖိုင် တင်နေပါသည်... (${val}%)`);
        },
        controller.signal
      );

      let uploadedAudio;
      if (audioFile) {
        setStatusMessage('အသံ ဖိုင်ကို AWS ဆာဗာသို့ တင်နေပါသည်... (Uploading voiceover)');
        uploadedAudio = await uploadMedia(
          audioFile,
          (val) => {
            const current = Math.min(35 + Math.round(val * 0.15), 50);
            setProgress(current);
            setStatusMessage(`အသံဖိုင် တင်နေပါသည်... (${val}%)`);
          },
          controller.signal
        );
      }

      setProcessingStage('sync');
      setProgress(52);
      setStatusMessage('ဆာဗာတွင် Recap အလုပ် စတင်နေပါသည်... (Starting sync job)');

      const job = await createSyncJob(
        uploadedVideo.fileId,
        {
          videoSpeed,
          audioSpeed,
          aspectRatio,
          blurEnabled,
          blurPosition,
          blurThickness,
          blurIntensity,
          subtitleEnabled,
          subtitleText: subtitleEnabled ? subtitleText.trim() : '',
          subtitleStyle,
        },
        uploadedAudio?.fileId
      );

      setStatusMessage('AWS Cloud ဆာဗာတွင် FFmpeg ဖြင့် ဗီဒီယို ပေါင်းစပ်နေပါသည်... (Processing on AWS)');

      const completed = await waitForSyncJob(
        job.jobId,
        (serverProgress) => {
          const mapped = Math.min(98, Math.max(54, Math.round(52 + (serverProgress / 100) * 45)));
          setProgress(mapped);
          setStatusMessage(`AWS ဆာဗာတွင် ဗီဒီယို ပေါင်းစပ်နေပါသည်... (${mapped}%)`);
        },
        controller.signal
      );

      if (!completed.outputFileId) throw new Error('ဆာဗာမှ ဗီဒီယို output file ထွက်မလာပါ။');

      setProcessingStage('finalize');
      setProgress(99);
      setStatusMessage('ဗီဒီယို အချောသတ် ပြင်ဆင်နေပါသည်... (Finalizing recap video)');

      if (resultUrl && resultUrl.startsWith('blob:')) URL.revokeObjectURL(resultUrl);
      const downloadUrl = getOutputUrl(completed.outputFileId);
      setResultUrl(downloadUrl);
      setOutputMimeType('video/mp4');
      setProgress(100);
      setProcessingStage('complete');
      setStatusMessage('မြန်မာ Recap ဗီဒီယို အောင်မြင်စွာ ဖန်တီးပြီးပါပြီ! (100%)');

      const currentUser = auth.currentUser;
      if (currentUser) {
        logGeneration(
          currentUser.uid,
          currentUser.email || '',
          'movierecap',
          { aspectRatio, subtitleStyle, blurEnabled, withAudio: !!audioFile },
          { outputFileId: completed.outputFileId }
        ).catch(() => { });
      }

      setTimeout(() => {
        setIsProcessing(false);
        toast.success('Burmese Recap ဗီဒီယို အောင်မြင်စွာ ရရှိပါပြီ!');
      }, 600);
      return;

    } catch (err: unknown) {
      if ((err as { name?: string })?.name !== 'AbortError') {
        setError("Generation Failed: " + ((err as { message?: string })?.message || String(err)));
        toast.error((err as { message?: string })?.message || 'လုပ်ဆောင်မှု မအောင်မြင်ပါ။');
      }
      setIsProcessing(false);
      setProgress(0);
    }
  };

  return (
    <div className="module-page max-w-6xl mx-auto pb-12">
      {/* PROCESSING HUD / ACCURATE PERCENTAGE MODAL */}
      <AnimatePresence>
        {isProcessing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4"
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              className="w-full max-w-md bg-zinc-950 border border-white/10 rounded-3xl p-6 shadow-2xl relative overflow-hidden"
            >
              {/* Top ambient glow */}
              <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-56 h-56 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />

              <div className="relative z-10 text-center space-y-5">
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <div className="flex items-center gap-1.5 font-medium">
                    <Sparkles className="w-4 h-4 text-indigo-400 animate-spin" style={{ animationDuration: '4s' }} />
                    <span>Burmese Movie Recap Studio</span>
                  </div>
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[10px]">
                    <Server className="w-3 h-3 text-emerald-400" />
                    {workerOnline ? 'AWS Server Sync' : 'Local Engine'}
                  </span>
                </div>

                {/* Big Percentage Display */}
                <div className="py-3">
                  <div className="text-6xl font-black tracking-tight text-white font-mono flex items-baseline justify-center gap-1">
                    <span>{progress}</span>
                    <span className="text-2xl text-indigo-400 font-bold">%</span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-2 font-medium">
                    {statusMessage || 'လုပ်ဆောင်နေပါသည်...'}
                  </p>
                </div>

                {/* Smooth Progress Bar */}
                <div className="w-full bg-zinc-900 border border-white/10 h-3 rounded-full overflow-hidden p-0.5">
                  <motion.div
                    className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-400 rounded-full transition-all duration-300 shadow-lg shadow-indigo-500/30"
                    style={{ width: `${Math.max(2, progress)}%` }}
                  />
                </div>

                {/* 3 Step Breakdown */}
                <div className="grid grid-cols-3 gap-2 pt-2 text-left">
                  <div className={`p-2.5 rounded-xl border text-[10px] ${progress >= 50
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                    : progress > 0
                      ? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-200'
                      : 'border-white/5 bg-white/5 text-zinc-500'
                    }`}>
                    <div className="font-bold mb-0.5 flex items-center gap-1">
                      {progress >= 50 ? <Check className="w-3 h-3 text-emerald-400" /> : <span>1.</span>}
                      <span>Upload</span>
                    </div>
                    <span className="text-[9px] opacity-80">ဗီဒီယို/အသံတင်</span>
                  </div>

                  <div className={`p-2.5 rounded-xl border text-[10px] ${progress >= 98
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                    : progress >= 50
                      ? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-200'
                      : 'border-white/5 bg-white/5 text-zinc-500'
                    }`}>
                    <div className="font-bold mb-0.5 flex items-center gap-1">
                      {progress >= 98 ? <Check className="w-3 h-3 text-emerald-400" /> : <span>2.</span>}
                      <span>Sync & Blur</span>
                    </div>
                    <span className="text-[9px] opacity-80">ဆာဗာပေါင်းစပ်</span>
                  </div>

                  <div className={`p-2.5 rounded-xl border text-[10px] ${progress >= 100
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                    : progress >= 98
                      ? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-200'
                      : 'border-white/5 bg-white/5 text-zinc-500'
                    }`}>
                    <div className="font-bold mb-0.5 flex items-center gap-1">
                      {progress >= 100 ? <Check className="w-3 h-3 text-emerald-400" /> : <span>3.</span>}
                      <span>Output</span>
                    </div>
                    <span className="text-[9px] opacity-80">Recap အဆင်သင့်</span>
                  </div>
                </div>

                {/* Cancel button */}
                <button
                  onClick={handleCancelGeneration}
                  className="w-full py-2.5 rounded-xl bg-white/5 hover:bg-rose-500/10 border border-white/10 hover:border-rose-500/30 text-zinc-400 hover:text-rose-400 text-xs font-semibold transition-all"
                >
                  Cancel (ရပ်မည်)
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* HEADER */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <span>Movie Recap Studio</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-medium">
              Burmese Recap Flow
            </span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
            ဗီဒီယိုတင် → အချိုးအစားရွေး → စာတန်းထိုးပုံစံရွေး → အသံထည့် → လိုဂိုထည့် → Blur ချိန်ပြီး Burmese Recap ဗီဒီယို ထုတ်လုပ်ပါ
          </p>
        </div>

        {/* Server Status Badge */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-semibold ${workerOnline
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
            : 'bg-zinc-800/60 border-zinc-700/60 text-zinc-400'
            }`}>
            <span className={`w-2 h-2 rounded-full ${workerOnline ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'}`} />
            <span>{workerOnline ? 'AWS Media Worker Connected' : 'Local Engine Ready'}</span>
          </div>
        </div>
      </div>

      {/* MAIN TWO-COLUMN WORKFLOW */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_1fr] gap-6 items-start">
        {/* LEFT COLUMN: 6 SEQUENTIAL STEP SECTIONS */}
        <div className="space-y-4">
          {/* SECTION 1: VIDEO SOURCE */}
          <section className="rounded-2xl bg-white dark:bg-[#0c0c0e] border border-gray-200 dark:border-white/10 p-5 space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">1</span>
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-200">
                  Video Upload (ဗီဒီယို ဖိုင်တင်ရန်)
                </h2>
              </div>
              {videoFile && (
                <span className="text-[11px] text-emerald-500 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Ready ({formatTimeSimple(videoDuration)})
                </span>
              )}
            </div>

            {!videoFile ? (
              <div
                onClick={() => videoInputRef.current?.click()}
                className="group cursor-pointer rounded-2xl border-2 border-dashed border-gray-300 dark:border-white/15 hover:border-indigo-500 dark:hover:border-indigo-400 hover:bg-indigo-500/5 p-6 text-center transition-all"
              >
                <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
                  <Video className="w-6 h-6" />
                </div>
                <div className="text-xs font-bold text-slate-800 dark:text-zinc-200 mb-1">
                  ဗီဒီယိုဖိုင် ရွေးချယ်တင်သွင်းပါ (Click or Drag & Drop)
                </div>
                <div className="text-[10px] text-slate-400 dark:text-zinc-500">
                  MP4, WebM, MOV, MKV (အများဆုံး 200MB)
                </div>
              </div>
            ) : (
              <div className="rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 p-3 flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-indigo-600/15 text-indigo-400 flex items-center justify-center shrink-0">
                    <Video className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{videoFile.name}</p>
                    <p className="text-[10px] text-slate-400 dark:text-zinc-400">
                      {formatFileSize(videoFile.size)} • ကြာချိန်: {formatTimeSimple(videoDuration)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleRemoveVideo}
                  className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-all shrink-0"
                  title="Remove video"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <input
                value={videoSourceUrl}
                onChange={(e) => setVideoSourceUrl(e.target.value)}
                placeholder="သို့မဟုတ် Public Direct Video URL ထည့်ပါ"
                className="min-w-0 flex-1 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 px-3 py-2 text-xs outline-none focus:border-indigo-400 text-slate-900 dark:text-white"
              />
              <button
                onClick={handleVideoUrl}
                disabled={!videoSourceUrl.trim()}
                className="px-3.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-black text-xs font-bold disabled:opacity-40 hover:opacity-90 transition-opacity"
              >
                Load
              </button>
            </div>
            <input type="file" ref={videoInputRef} accept="video/*" onChange={handleVideoUpload} className="hidden" />
          </section>

          {/* SECTION 2: ASPECT RATIO */}
          <section className="rounded-2xl bg-white dark:bg-[#0c0c0e] border border-gray-200 dark:border-white/10 p-5 space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">2</span>
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-200">
                  Aspect Ratio (ဗီဒီယို အချိုးအစား ရွေးချယ်ရန်)
                </h2>
              </div>
              <span className="text-[11px] text-indigo-400 font-semibold">{aspectRatio}</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {[
                { id: '16:9', label: '16:9', desc: 'YouTube / Movie', iconW: 'w-6 h-3.5' },
                { id: '9:16', label: '9:16', desc: 'TikTok / Shorts', iconW: 'w-3.5 h-6' },
                { id: '1:1', label: '1:1', desc: 'Instagram / Square', iconW: 'w-5 h-5' },
                { id: '4:5', label: '4:5', desc: 'Facebook Feed', iconW: 'w-4 h-5' },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setAspectRatio(item.id as typeof aspectRatio)}
                  className={`rounded-xl border p-3 text-center transition-all flex flex-col items-center justify-center gap-1.5 ${aspectRatio === item.id
                    ? 'border-indigo-500 bg-indigo-500/10 text-indigo-400 font-bold shadow-sm ring-1 ring-indigo-500/30'
                    : 'border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-slate-600 dark:text-zinc-400 hover:border-indigo-400'
                    }`}
                >
                  <div className={`border-2 rounded border-current ${item.iconW}`} />
                  <span className="text-xs font-bold text-slate-900 dark:text-white">{item.label}</span>
                  <span className="text-[9px] opacity-75">{item.desc}</span>
                </button>
              ))}
            </div>
          </section>

          {/* SECTION 3: SUBTITLE SELECTION (WITH OR WITHOUT SUBTITLES) */}
          <section className="rounded-2xl bg-white dark:bg-[#0c0c0e] border border-gray-200 dark:border-white/10 p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">3</span>
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-200">
                  Subtitle Option (စာတန်းထိုး ပါ/မပါ ရွေးချယ်မှု)
                </h2>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${subtitleEnabled ? 'bg-indigo-500/20 text-indigo-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                {subtitleEnabled ? 'စာတန်းထိုးပါ (With Subtitles)' : 'စာတန်းမပါ (Clean Video)'}
              </span>
            </div>

            {/* TWO MAIN OPTIONS: NO SUBTITLE (CLEAN VIDEO) vs BURN-IN SUBTITLE */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setSubtitleEnabled(false)}
                className={`p-3.5 rounded-xl border text-left transition-all relative flex flex-col justify-between ${!subtitleEnabled
                  ? 'border-indigo-500 bg-indigo-500/10 shadow-sm ring-2 ring-indigo-500/30'
                  : 'border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 hover:border-indigo-300'
                  }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${!subtitleEnabled ? 'bg-indigo-600 text-white' : 'bg-gray-200 dark:bg-white/10 text-slate-500 dark:text-zinc-400'}`}>
                      <Video className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      စာတန်းထိုး မပါ (No Subtitles)
                    </span>
                  </div>
                  {!subtitleEnabled && <Check className="w-4 h-4 text-indigo-500 font-bold" />}
                </div>
                <p className="text-[10px] text-slate-500 dark:text-zinc-400 leading-relaxed">
                  Clean Video သန့်သန့် ထုတ်မည်။ (Blur Strip နှင့် Voiceover သာ ပါဝင်ပြီး ဗီဒီယိုထဲ စာတန်းမထိုးပါ)
                </p>
              </button>

              <button
                type="button"
                onClick={() => setSubtitleEnabled(true)}
                className={`p-3.5 rounded-xl border text-left transition-all relative flex flex-col justify-between ${subtitleEnabled
                  ? 'border-indigo-500 bg-indigo-500/10 shadow-sm ring-2 ring-indigo-500/30'
                  : 'border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 hover:border-indigo-300'
                  }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${subtitleEnabled ? 'bg-indigo-600 text-white' : 'bg-gray-200 dark:bg-white/10 text-slate-500 dark:text-zinc-400'}`}>
                      <FileText className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      စာတန်းထိုး ထိုးမည် (With Subtitles)
                    </span>
                  </div>
                  {subtitleEnabled && <Check className="w-4 h-4 text-indigo-500 font-bold" />}
                </div>
                <p className="text-[10px] text-slate-500 dark:text-zinc-400 leading-relaxed">
                  Blur Strip ပေါ်တွင် Akkhayar 21 မြန်မာဖောင့်ဖြင့် အချိန်ကိုက် စာတန်းထိုးပါမည်။
                </p>
              </button>
            </div>

            {!subtitleEnabled && subtitleText.includes('-->') && (
              <div className="p-3 rounded-xl bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-[11px] text-slate-700 dark:text-zinc-300 font-medium">
                    ဗီဒီယိုထဲ စာတန်းမထိုးသော်လည်း သီးသန့် SRT ဖိုင် ရှိနေပါသည် ({srtFileName || 'SRT Active'})
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadSrt}
                  className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold flex items-center gap-1 transition-all"
                >
                  <Download className="w-3 h-3" />
                  <span>Download SRT</span>
                </button>
              </div>
            )}

            {subtitleEnabled && (
              <>
                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  {[
                    { id: 'akkhayar-yellow', title: 'Yellow Highlight', desc: 'ဝါရောင် Highlight Recap (အကြံပြု)', preview: 'မြန်မာစာ', textColor: 'text-amber-400' },
                    { id: 'akkhayar-outline', title: 'White + Outline', desc: 'အဖြူရောင် + အနက်လိုင်း', preview: 'မြန်မာစာ', textColor: 'text-white' },
                    { id: 'akkhayar-box', title: 'Dark Subtitle Box', desc: 'အနက်ရောင် Box ခံစနစ်', preview: 'မြန်မာစာ', textColor: 'text-white bg-black/60 px-2 py-0.5 rounded' },
                    { id: 'akkhayar-clean', title: 'Clean Minimal', desc: 'ရိုးရှင်းသော အဖြူရောင်', preview: 'မြန်မာစာ', textColor: 'text-white' },
                  ].map((style) => (
                    <button
                      key={style.id}
                      onClick={() => setSubtitleStyle(style.id)}
                      className={`rounded-xl border p-3 text-left transition-all relative ${subtitleStyle === style.id
                        ? 'border-indigo-500 bg-indigo-500/10 shadow-sm ring-1 ring-indigo-500/30'
                        : 'border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 hover:border-indigo-400'
                        }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[11px] font-bold text-slate-900 dark:text-white">{style.title}</span>
                        {subtitleStyle === style.id && <Check className="w-3.5 h-3.5 text-indigo-400" />}
                      </div>
                      <div className="py-2 text-center bg-black/40 rounded-lg border border-white/5">
                        <span className={`text-base font-bold ${style.textColor}`} style={{ fontFamily: 'Akkhayar21, sans-serif' }}>
                          {style.preview}
                        </span>
                      </div>
                      <span className="block mt-1.5 text-[9px] text-slate-500 dark:text-zinc-400">{style.desc}</span>
                    </button>
                  ))}
                </div>

                {/* DEDICATED SRT UPLOAD ZONE */}
                <div className="pt-2">
                  {subtitleText.includes('-->') ? (
                    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3.5 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-mono font-bold text-xs">
                            SRT
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-slate-900 dark:text-white">
                                {srtFileName || 'burma_subtitles.srt'}
                              </span>
                              {/* <span className="px-2 py-0.5 rounded-full text-center bg-emerald-500/20 text-emerald-400 text-[10px] font-bold">
                                {getSrtCuesCount(subtitleText)} Cues Active
                              </span> */}
                            </div>
                            <p className="text-[10px] text-slate-400 dark:text-zinc-400 mt-0.5">
                              Blur Strip ပေါ်တွင် အချိန်ကိုက် မြန်မာစာတန်း အလိုအလျောက် ထိုးပေးပါမည်
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => srtFileInputRef.current?.click()}
                            className="px-2.5 py-1.5 rounded-lg bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/15 text-slate-700 dark:text-zinc-200 text-[10px] font-bold transition-all"
                            title="Replace SRT"
                          >
                            Replace
                          </button>
                          <button
                            type="button"
                            onClick={handleDownloadSrt}
                            className="p-1.5 rounded-lg bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/15 text-slate-700 dark:text-zinc-200 transition-all"
                            title="Download SRT"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={handleRemoveSrt}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
                            title="Remove SRT"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Live Cue Sample */}
                      <div className="px-3 py-2 rounded-lg bg-black/40 border border-white/5 text-[11px] font-mono text-zinc-300 flex items-center justify-between">
                        <span className="truncate max-w-[85%] text-amber-300" style={{ fontFamily: 'Akkhayar21, sans-serif' }}>
                          💬 {getFirstSubtitleCue(subtitleText)}
                        </span>
                        <span className="text-[9px] text-zinc-500 shrink-0">First Cue</span>
                      </div>
                    </div>
                  ) : (
                    <div
                      onClick={() => srtFileInputRef.current?.click()}
                      className="group cursor-pointer rounded-xl border-2 border-dashed border-gray-300 dark:border-white/15 hover:border-indigo-500 dark:hover:border-indigo-400 hover:bg-indigo-500/5 p-5 text-center transition-all"
                    >
                      <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mx-auto mb-2 group-hover:scale-110 transition-transform">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div className="text-xs font-bold text-slate-800 dark:text-zinc-200 mb-0.5">
                        Burma SRT (.srt) စာတန်းထိုးဖိုင် တင်သွင်းပါ
                      </div>
                      <div className="text-[10px] text-slate-400 dark:text-zinc-500">
                        Subtitle Studio မှ ထုတ်ယူထားသော .srt ဖိုင် သို့မဟုတ် Timeline SRT ဖိုင် တင်သွင်းပါ
                      </div>
                    </div>
                  )}

                  <input
                    ref={srtFileInputRef}
                    type="file"
                    accept=".srt"
                    className="hidden"
                    onChange={handleSrtFileUpload}
                  />
                </div>
              </>
            )}
          </section>

          {/* SECTION 4: VOICEOVER AUDIO */}
          <section className="rounded-2xl bg-white dark:bg-[#0c0c0e] border border-gray-200 dark:border-white/10 p-5 space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">4</span>
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-200">
                  Voiceover Audio (နောက်ခံ အသံဖိုင် ရွေးရန်)
                </h2>
              </div>
              {audioFile && (
                <span className="text-[11px] text-emerald-500 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Added ({formatTimeSimple(audioDuration)})
                </span>
              )}
            </div>

            {!audioFile ? (
              <div
                onClick={() => audioInputRef.current?.click()}
                className="group cursor-pointer rounded-2xl border-2 border-dashed border-gray-300 dark:border-white/15 hover:border-indigo-500 dark:hover:border-indigo-400 hover:bg-indigo-500/5 p-5 text-center transition-all"
              >
                <div className="w-10 h-10 rounded-2xl bg-purple-500/10 text-purple-400 flex items-center justify-center mx-auto mb-2 group-hover:scale-110 transition-transform">
                  <Music className="w-5 h-5" />
                </div>
                <div className="text-xs font-bold text-slate-800 dark:text-zinc-200 mb-0.5">
                  Burmese Voiceover အသံဖိုင် တင်ရန် (.mp3, .wav, .m4a)
                </div>
                <div className="text-[10px] text-slate-400 dark:text-zinc-500">
                  အသံဖိုင် မထည့်လျှင် မူရင်း ဗီဒီယိုအသံကို အသုံးပြုပါမည်
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <button
                      onClick={toggleAudioPreview}
                      className="w-10 h-10 rounded-xl bg-purple-600 text-white flex items-center justify-center shrink-0 hover:bg-purple-500 transition-colors shadow-md"
                      title={isAudioPreviewPlaying ? "Pause audio" : "Play audio preview"}
                    >
                      {isAudioPreviewPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                    </button>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{audioFile.name}</p>
                      <p className="text-[10px] text-slate-400 dark:text-zinc-400">
                        {formatFileSize(audioFile.size)} • ကြာချိန်: {formatTimeSimple(audioDuration)}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleRemoveAudio}
                    className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-all shrink-0"
                    title="Remove audio"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Duration sync comparison note */}
                <div className="px-3 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-[10px] text-indigo-300 flex items-center justify-between">
                  <span>ဗီဒီယို: {formatTimeSimple(videoDuration)} | အသံ: {formatTimeSimple(audioDuration)}</span>
                  <span className={`font-semibold ${isTimelineSynced ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {isTimelineSynced ? '✓ In-Sync (အချိန်ကိုက်)' : '⚠️ Speed ချိန်ညှိရန် လိုအပ်သည်'}
                  </span>
                </div>
              </div>
            )}
            <input type="file" ref={audioInputRef} accept="audio/*" onChange={handleAudioUpload} className="hidden" />
          </section>

          {/* SECTION 5: SPEED & AUDIO-VIDEO TIMELINE SYNCHRONIZATION */}
          <section className="rounded-2xl bg-white dark:bg-[#0c0c0e] border border-gray-200 dark:border-white/10 p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">5</span>
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-200 flex items-center gap-1.5">
                  <Gauge className="w-4 h-4 text-indigo-400" />
                  Speed & Timeline Sync (အသံနှင့် ဗီဒီယို အချိန်ကိုက် ညှိရန်)
                </h2>
              </div>
              {audioFile && (
                <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1 ${
                  isTimelineSynced 
                    ? 'bg-emerald-500/20 text-emerald-400' 
                    : durationDiff < 0 
                      ? 'bg-amber-500/20 text-amber-400' 
                      : 'bg-indigo-500/20 text-indigo-400'
                }`}>
                  {isTimelineSynced ? (
                    <>
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      <span>In-Sync (အချိန်ကိုက်)</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-3 h-3" />
                      <span>{durationDiff < 0 ? 'အသံက ပိုရှည်နေသည်' : 'ဗီဒီယိုက ပိုရှည်နေသည်'}</span>
                    </>
                  )}
                </span>
              )}
            </div>

            {/* Smart Timeline Comparison Banner */}
            <div className="rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 p-3.5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {/* Video Duration Card */}
                <div className="p-3 rounded-lg bg-white dark:bg-black/40 border border-gray-200 dark:border-white/10 space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-zinc-400">
                    <span className="flex items-center gap-1 font-semibold text-slate-700 dark:text-zinc-200">
                      <Video className="w-3.5 h-3.5 text-indigo-400" /> Video
                    </span>
                    <span className="font-mono text-indigo-400 font-bold">{videoSpeed.toFixed(2)}x</span>
                  </div>
                  <div className="text-sm font-black font-mono text-slate-900 dark:text-white">
                    {formatTimeSimple(effectiveVideoDuration)}
                  </div>
                  <p className="text-[9px] text-slate-400 dark:text-zinc-500">
                    မူရင်းကြာချိန်: {formatTimeSimple(videoDuration)}
                  </p>
                </div>

                {/* Voiceover Duration Card */}
                <div className="p-3 rounded-lg bg-white dark:bg-black/40 border border-gray-200 dark:border-white/10 space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-zinc-400">
                    <span className="flex items-center gap-1 font-semibold text-slate-700 dark:text-zinc-200">
                      <Music className="w-3.5 h-3.5 text-purple-400" /> Voiceover
                    </span>
                    <span className="font-mono text-purple-400 font-bold">{audioSpeed.toFixed(2)}x</span>
                  </div>
                  <div className="text-sm font-black font-mono text-slate-900 dark:text-white">
                    {audioFile ? formatTimeSimple(effectiveAudioDuration) : 'No Audio'}
                  </div>
                  <p className="text-[9px] text-slate-400 dark:text-zinc-500">
                    {audioFile ? `မူရင်းကြာချိန်: ${formatTimeSimple(audioDuration)}` : 'မူရင်း ဗီဒီယိုအသံ'}
                  </p>
                </div>
              </div>

              {/* Status & Auto-Sync Action Banner */}
              {audioFile && videoDuration > 0 && audioDuration > 0 && (
                <div className="pt-1">
                  {!isTimelineSynced ? (
                    <div className="space-y-2">
                      <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/25 text-[11px] text-amber-300 flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-semibold">
                            {durationDiff < 0 
                              ? `အသံက ဗီဒီယိုထက် ${Math.abs(durationDiff).toFixed(1)}s ပိုရှည်နေပါသည် (အသံမပြီးခင် ဗီဒီယို အရင်ဆုံးသွားပါမည်)` 
                              : `ဗီဒီယိုက အသံထက် ${durationDiff.toFixed(1)}s ပိုရှည်နေပါသည် (အသံ အရင်ဆုံးပြီးသွားပါမည်)`}
                          </p>
                          <p className="text-[10px] opacity-80 mt-0.5">
                            အသံနှင့် ဗီဒီယို တစ်ပြိုင်နက် အဆုံးသတ်စေရန် အောက်ပါ Auto Sync ခလုတ်ကို နှိပ်ပါ:
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={handleAutoMatchVideoToAudio}
                          className="px-3 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold flex items-center justify-center gap-1.5 shadow-sm transition-all active:scale-95"
                          title="ဗီဒီယို speed ကို ညှိပြီး အသံကြာချိန်နှင့် အလိုအလျောက် ညီစေပါမည်"
                        >
                          <Zap className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
                          <span>Video ကို အသံနှင့် ညှိမည် ({((videoDuration * audioSpeed) / audioDuration).toFixed(2)}x)</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleAutoMatchAudioToVideo}
                          className="px-3 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-[11px] font-bold flex items-center justify-center gap-1.5 shadow-sm transition-all active:scale-95"
                          title="အသံ speed ကို ညှိပြီး ဗီဒီယိုကြာချိန်နှင့် အလိုအလျောက် ညီစေပါမည်"
                        >
                          <Zap className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
                          <span>အသံကို Video နှင့် ညှိမည် ({((audioDuration * videoSpeed) / videoDuration).toFixed(2)}x)</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-[11px] text-emerald-300 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span className="font-medium">ဗီဒီယိုနှင့် အသံကြာချိန် အတိအကျ အချိန်ကိုက် ညီညွတ်နေပါသည်</span>
                      </div>
                      <button
                        type="button"
                        onClick={handleResetSpeeds}
                        className="px-2 py-1 rounded-md bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 text-[10px] font-bold flex items-center gap-1 transition-all"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Reset (1.0x)</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Video Speed Controls */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-slate-700 dark:text-zinc-300 flex items-center gap-1.5">
                  <Video className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Video Speed (ဗီဒီယို အမြန်နှုန်း ချိန်ညှိရန်)</span>
                </label>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-mono font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-md border border-indigo-500/20">
                    {videoSpeed.toFixed(2)}x
                  </span>
                  <span className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono">
                    ({formatTimeSimple(effectiveVideoDuration)})
                  </span>
                </div>
              </div>

              {/* Sliders and Steppers */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setVideoSpeed((prev) => Math.max(0.25, Number((prev - 0.05).toFixed(2))))}
                  className="w-7 h-7 rounded-lg bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/15 text-slate-700 dark:text-zinc-200 font-bold text-xs flex items-center justify-center transition-all"
                >
                  -
                </button>
                <input
                  type="range"
                  min="0.25"
                  max="2.50"
                  step="0.05"
                  value={videoSpeed}
                  onChange={(e) => setVideoSpeed(Number(Number(e.target.value).toFixed(2)))}
                  className="flex-1 accent-indigo-500 cursor-pointer"
                />
                <button
                  type="button"
                  onClick={() => setVideoSpeed((prev) => Math.min(3.0, Number((prev + 0.05).toFixed(2))))}
                  className="w-7 h-7 rounded-lg bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/15 text-slate-700 dark:text-zinc-200 font-bold text-xs flex items-center justify-center transition-all"
                >
                  +
                </button>
              </div>

              {/* Preset Chips */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {[0.5, 0.75, 0.85, 0.9, 1.0, 1.15, 1.25, 1.5, 2.0].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setVideoSpeed(s)}
                    className={`px-2 py-1 rounded-lg text-[10px] font-mono font-bold border transition-all ${
                      Math.abs(videoSpeed - s) < 0.02
                        ? 'border-indigo-500 bg-indigo-500/15 text-indigo-400 shadow-sm ring-1 ring-indigo-500/30'
                        : 'border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-slate-600 dark:text-zinc-400 hover:border-indigo-400'
                    }`}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            </div>

            {/* Voiceover Speed Controls (only if audio file present) */}
            {audioFile && (
              <div className="space-y-2 pt-2 border-t border-gray-100 dark:border-white/5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-700 dark:text-zinc-300 flex items-center gap-1.5">
                    <Music className="w-3.5 h-3.5 text-purple-400" />
                    <span>Voiceover Speed (အသံဖိုင် အမြန်နှုန်း ချိန်ညှိရန်)</span>
                  </label>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-mono font-bold text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-md border border-purple-500/20">
                      {audioSpeed.toFixed(2)}x
                    </span>
                    <span className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono">
                      ({formatTimeSimple(effectiveAudioDuration)})
                    </span>
                  </div>
                </div>

                {/* Sliders and Steppers */}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setAudioSpeed((prev) => Math.max(0.5, Number((prev - 0.05).toFixed(2))))}
                    className="w-7 h-7 rounded-lg bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/15 text-slate-700 dark:text-zinc-200 font-bold text-xs flex items-center justify-center transition-all"
                  >
                    -
                  </button>
                  <input
                    type="range"
                    min="0.5"
                    max="2.0"
                    step="0.05"
                    value={audioSpeed}
                    onChange={(e) => setAudioSpeed(Number(Number(e.target.value).toFixed(2)))}
                    className="flex-1 accent-purple-500 cursor-pointer"
                  />
                  <button
                    type="button"
                    onClick={() => setAudioSpeed((prev) => Math.min(2.5, Number((prev + 0.05).toFixed(2))))}
                    className="w-7 h-7 rounded-lg bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/15 text-slate-700 dark:text-zinc-200 font-bold text-xs flex items-center justify-center transition-all"
                  >
                    +
                  </button>
                </div>

                {/* Preset Chips */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {[0.75, 0.85, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setAudioSpeed(s)}
                      className={`px-2 py-1 rounded-lg text-[10px] font-mono font-bold border transition-all ${
                        Math.abs(audioSpeed - s) < 0.02
                          ? 'border-purple-500 bg-purple-500/15 text-purple-400 shadow-sm ring-1 ring-purple-500/30'
                          : 'border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-slate-600 dark:text-zinc-400 hover:border-purple-400'
                      }`}
                    >
                      {s}x
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* SECTION 6: LOGO WATERMARK */}
          <section className="rounded-2xl bg-white dark:bg-[#0c0c0e] border border-gray-200 dark:border-white/10 p-5 space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">6</span>
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-200">
                  Logo Watermark (လိုဂို / ရေစာ ထည့်ရန်)
                </h2>
              </div>
              {logoFile && (
                <span className="text-[11px] text-emerald-500 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Added
                </span>
              )}
            </div>

            {!logoFile ? (
              <div
                onClick={() => logoInputRef.current?.click()}
                className="group cursor-pointer rounded-2xl border-2 border-dashed border-gray-300 dark:border-white/15 hover:border-indigo-500 dark:hover:border-indigo-400 hover:bg-indigo-500/5 p-5 text-center transition-all"
              >
                <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto mb-2 group-hover:scale-110 transition-transform">
                  <ImageIcon className="w-5 h-5" />
                </div>
                <div className="text-xs font-bold text-slate-800 dark:text-zinc-200 mb-0.5">
                  လိုဂိုပုံ ရွေးချယ်တင်သွင်းပါ (PNG / JPG)
                </div>
                <div className="text-[10px] text-slate-400 dark:text-zinc-500">
                  Transparent PNG လိုဂို ထည့်သွင်းခြင်း ပိုမိုကောင်းမွန်ပါသည်
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <img src={logoUrl || ''} alt="Logo" className="w-10 h-10 object-contain rounded-lg bg-black/40 p-1 border border-white/10" />
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white">{logoFile.name}</p>
                      <p className="text-[10px] text-slate-400 dark:text-zinc-400">{formatFileSize(logoFile.size)}</p>
                    </div>
                  </div>
                  <button
                    onClick={handleRemoveLogo}
                    className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
                    title="Remove logo"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Logo Position Selector */}
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 block mb-1.5">
                    Logo Position (နေရာသတ်မှတ်ရန်)
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {(['Top Left', 'Top Right', 'Bottom Left', 'Bottom Right'] as const).map((pos) => (
                      <button
                        key={pos}
                        onClick={() => setLogoPosition(pos)}
                        className={`rounded-lg py-2 text-[10px] font-bold border transition-all ${logoPosition === pos
                          ? 'border-indigo-500 bg-indigo-500/10 text-indigo-400'
                          : 'border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-slate-600 dark:text-zinc-400 hover:border-indigo-300'
                          }`}
                      >
                        {pos}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            <input type="file" ref={logoInputRef} accept="image/*" onChange={handleLogoUpload} className="hidden" />
          </section>

          {/* SECTION 7: BLUR STRIP ADJUSTMENT */}
          <section className="rounded-2xl bg-white dark:bg-[#0c0c0e] border border-gray-200 dark:border-white/10 p-5 space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">7</span>
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-200">
                  Frosted Blur Strip (စာတန်းဟောင်း ဖုံးအုပ်ရန် သဘာဝ Blur အလွှာ)
                </h2>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={blurEnabled}
                  onChange={(e) => setBlurEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-gray-300 peer-focus:outline-none rounded-full peer dark:bg-zinc-800 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600" />
              </label>
            </div>

            <p className="text-[10px] text-slate-500 dark:text-zinc-400">
              အမဲရောင် အကွက်အတုံးကြီး မဟုတ်ဘဲ ဗီဒီယိုအရောင်ကို ဆက်လက်ထိန်းသိမ်းပေးထားသော သဘာဝ Frosted Glass Blur ဖြင့် မူရင်းစာတန်းကို 100% ဖုံးအုပ်ပေးပါသည်
            </p>

            {blurEnabled && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div className="p-3 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10">
                  <div className="flex justify-between text-[10px] font-bold text-slate-600 dark:text-zinc-300 mb-1.5">
                    <span>Position (နေရာ)</span>
                    <span className="text-indigo-400 font-mono">{blurPosition}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={blurPosition}
                    onChange={(e) => setBlurPosition(Number(e.target.value))}
                    className="w-full accent-indigo-500"
                  />
                </div>

                <div className="p-3 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10">
                  <div className="flex justify-between text-[10px] font-bold text-slate-600 dark:text-zinc-300 mb-1.5">
                    <span>Thickness (အထူ)</span>
                    <span className="text-indigo-400 font-mono">{blurThickness}%</span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="45"
                    value={blurThickness}
                    onChange={(e) => setBlurThickness(Number(e.target.value))}
                    className="w-full accent-indigo-500"
                  />
                </div>

                <div className="p-3 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10">
                  <div className="flex justify-between text-[10px] font-bold text-slate-600 dark:text-zinc-300 mb-1.5">
                    <span>Strength (ပြင်းအား)</span>
                    <span className="text-indigo-400 font-mono">{blurIntensity}</span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="50"
                    value={blurIntensity}
                    onChange={(e) => setBlurIntensity(Number(e.target.value))}
                    className="w-full accent-indigo-500"
                  />
                </div>
              </div>
            )}
          </section>
        </div>

        {/* RIGHT COLUMN: INTERACTIVE PREVIEW & ACTION */}
        <div className="space-y-4 lg:sticky lg:top-4">
          {/* VIDEO CANVAS PREVIEW CARD */}
          <div className="rounded-2xl bg-white dark:bg-[#0c0c0e] border border-gray-200 dark:border-white/10 p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-indigo-400" />
                Live Canvas Preview
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-gray-100 dark:bg-white/10 text-slate-600 dark:text-zinc-300">
                {formatTimeSimple(currentTime)} / {formatTimeSimple(videoDuration)}
              </span>
            </div>

            {/* Video Canvas Container */}
            <div className="relative w-full min-h-[260px] max-h-[380px] bg-black rounded-2xl overflow-hidden shadow-inner flex items-center justify-center border border-black/40">
              {videoUrl ? (
                <>
                  <canvas ref={previewCanvasRef} className="max-w-full max-h-[380px] object-contain mx-auto" />
                  <button
                    onClick={togglePlayback}
                    className="absolute inset-0 m-auto w-12 h-12 rounded-full bg-indigo-600/90 hover:bg-indigo-500 text-white flex items-center justify-center shadow-2xl backdrop-blur-sm transition-transform hover:scale-110 active:scale-95"
                  >
                    {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                  </button>
                </>
              ) : (
                <div className="text-center p-6 space-y-2 text-zinc-500">
                  <Video className="w-10 h-10 mx-auto text-zinc-600 animate-pulse" />
                  <p className="text-xs font-medium">ဗီဒီယိုဖိုင် တင်သွင်းပြီးပါက Preview ပေါ်လာပါမည်</p>
                </div>
              )}
            </div>

            {/* Live Timeline & Sync Status in Preview */}
            {videoUrl && (
              <div className="p-3 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 flex items-center justify-between text-xs">
                <div className="flex items-center gap-3 text-[11px] font-mono">
                  <span className="text-indigo-400 font-semibold">🎬 {formatTimeSimple(effectiveVideoDuration)} ({videoSpeed.toFixed(2)}x)</span>
                  {audioFile && (
                    <span className="text-purple-400 font-semibold">🎙️ {formatTimeSimple(effectiveAudioDuration)} ({audioSpeed.toFixed(2)}x)</span>
                  )}
                </div>
                {audioFile && !isTimelineSynced && (
                  <button
                    type="button"
                    onClick={handleAutoMatchVideoToAudio}
                    className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold flex items-center gap-1 shadow-sm transition-all active:scale-95"
                    title="ဗီဒီယိုနှင့် အသံကြာချိန် အလိုအလျောက် ညှိမည်"
                  >
                    <Zap className="w-3 h-3 text-amber-300" />
                    <span>Auto Sync</span>
                  </button>
                )}
              </div>
            )}

            {/* Time Seeker */}
            {videoUrl && videoDuration > 0 && (
              <div className="space-y-1">
                <input
                  type="range"
                  min="0"
                  max={videoDuration}
                  step="0.05"
                  value={currentTime}
                  onChange={handleSeek}
                  className="w-full accent-indigo-500 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-zinc-400 font-mono">
                  <span>{formatTimeSimple(currentTime)}</span>
                  <span>{formatTimeSimple(videoDuration)}</span>
                </div>
              </div>
            )}

            {/* GENERATE RECAP BUTTON */}
            <button
              onClick={handleGenerate}
              disabled={isProcessing || !videoUrl}
              className="w-full py-4 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold tracking-wide shadow-lg shadow-indigo-600/25 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 group"
            >
              <Sparkles className="w-4 h-4 text-indigo-200 group-hover:rotate-12 transition-transform" />
              <span>{isProcessing ? `Processing ${progress}%...` : 'Generate Burmese Recap Video'}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/20 text-white font-medium ml-1">
                {CREDIT_COSTS[ContentType.MOVIE_RECAP]} Credits
              </span>
            </button>

            {/* Error banner */}
            {error && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-medium flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span className="min-w-0">{error}</span>
              </div>
            )}
          </div>

          {/* GENERATED RESULT VIDEO CARD */}
          {resultUrl && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5 space-y-3 shadow-lg"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs shrink-0">
                    ✓
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-bold text-slate-900 dark:text-white">Recap Video Ready</h3>
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${subtitleEnabled
                        ? 'bg-indigo-500/20 text-indigo-400'
                        : 'bg-emerald-500/20 text-emerald-400'
                        }`}>
                        {subtitleEnabled ? 'စာတန်းထိုး ပါဝင်သည်' : 'စာတန်းထိုး မပါ (Clean Video)'}
                      </span>
                    </div>
                    {/* <p className="text-[10px] text-emerald-500 mt-0.5">
                      {subtitleEnabled
                        ? 'မြန်မာစာတန်းထိုး ပါဝင်သော Recap ဗီဒီယို အောင်မြင်စွာ ဖန်တီးပြီးပါပြီ'
                        : 'စာတန်းထိုး မပါဝင်သော Clean Recap ဗီဒီယို အောင်မြင်စွာ ဖန်တီးပြီးပါပြီ'}
                    </p> */}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                  <button
                    onClick={handleDownloadSrt}
                    className="rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 text-xs font-bold flex items-center gap-1.5 shadow-md shadow-indigo-600/20 transition-colors"
                    title="Burma Subtitle SRT ဖိုင် ဒေါင်းလုဒ်လုပ်ရန်"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Download Burma SRT</span>
                  </button>
                  <a
                    href={resultUrl}
                    download={`burmese_recap_${Date.now()}.mp4`}
                    className="rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-2 text-xs font-bold flex items-center gap-1.5 shadow-md shadow-emerald-600/20 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download MP4</span>
                  </a>
                </div>
              </div>

              <div className="rounded-xl overflow-hidden bg-black aspect-video border border-white/10 shadow-inner">
                <video src={resultUrl} controls className="w-full h-full object-contain" />
              </div>
            </motion.div>
          )}

          {/* Off-screen active media elements */}
          <video
            ref={videoRef}
            src={videoUrl || ''}
            style={{ position: 'fixed', top: -9999, left: -9999, width: 4, height: 4, opacity: 0, pointerEvents: 'none' }}
            playsInline
            muted
            onLoadedMetadata={onVideoLoaded}
          />
          <audio
            ref={audioRef}
            src={audioUrl || ''}
            style={{ position: 'fixed', top: -9999, left: -9999, width: 4, height: 4, opacity: 0, pointerEvents: 'none' }}
            onLoadedMetadata={onAudioLoaded}
            onEnded={() => setIsAudioPreviewPlaying(false)}
          />
        </div>
      </div>
    </div>
  );
};

export default MovieRecap;
