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

// All voiceover formats we accept (audio + video containers whose audio track is used)
const VOICEOVER_EXTENSIONS = /\.(mp3|wav|wave|m4a|m4b|aac|flac|ogg|oga|opus|wma|amr|aif|aiff|aifc|caf|ac3|eac3|mka|weba|webm|3gp|3g2|mp4|m4v|mov|mkv|avi|wmv|flv|ts|mts|mpeg|mpg)$/i;
const VOICEOVER_ACCEPT = 'audio/*,video/*,.mp3,.wav,.wave,.m4a,.m4b,.aac,.flac,.ogg,.oga,.opus,.wma,.amr,.aif,.aiff,.aifc,.caf,.ac3,.eac3,.mka,.weba,.webm,.3gp,.3g2,.mp4,.m4v,.mov,.mkv,.avi,.wmv,.flv,.ts,.mts,.mpeg,.mpg';
// MIME types the media worker whitelists; anything else is re-labelled so upload isn't rejected (FFmpeg probes real content)
const WORKER_SAFE_AUDIO_MIME = new Set(['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/webm', 'audio/ogg']);
const normalizeVoiceoverFile = (file: File): File => {
  const type = (file.type || '').toLowerCase();
  if (WORKER_SAFE_AUDIO_MIME.has(type)) return file;
  return new File([file], file.name || 'voiceover.mp3', { type: 'audio/mpeg', lastModified: file.lastModified });
};

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
  const [logoY, setLogoY] = useState<number>(8); // Vertical Position (0% = Top, 100% = Bottom)
  const [logoAlign, setLogoAlign] = useState<'left' | 'center' | 'right'>('right');
  const [logoScale, setLogoScale] = useState<number>(14); // 4% to 35% width
  const [logoOpacity, setLogoOpacity] = useState<number>(100); // 20% to 100%

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
  const [subtitleStyle, setSubtitleStyle] = useState('font-akkhayar');
  const [subtitleOffset, setSubtitleOffset] = useState<number>(0);
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

  const getActiveSubtitleCue = (srtText: string, timeSec: number, offsetSec = 0): string => {
    if (!srtText || !srtText.includes('-->')) return srtText.trim();
    const blocks = srtText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split(/\n\s*\n/);
    const toSec = (t: string) => {
      const parts = t.trim().replace(',', '.').split(':');
      if (parts.length === 3) {
        return (parseFloat(parts[0]) || 0) * 3600 + (parseFloat(parts[1]) || 0) * 60 + (parseFloat(parts[2]) || 0);
      }
      return 0;
    };

    const adjustedTime = timeSec - offsetSec;

    for (const block of blocks) {
      const lines = block.trim().split('\n').map((l) => l.trim()).filter(Boolean);
      const timeLine = lines.find((l) => l.includes('-->'));
      if (!timeLine) continue;
      const [startStr, endStr] = timeLine.split('-->');
      const start = toSec(startStr);
      const end = toSec(endStr);
      if (adjustedTime >= start && adjustedTime <= end) {
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

  const getSrtDuration = (srtText: string): number => {
    if (!srtText || !srtText.includes('-->')) return 0;
    const blocks = srtText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split(/\n\s*\n/);
    const toSec = (t: string) => {
      const parts = t.trim().replace(',', '.').split(':');
      if (parts.length === 3) {
        return (parseFloat(parts[0]) || 0) * 3600 + (parseFloat(parts[1]) || 0) * 60 + (parseFloat(parts[2]) || 0);
      }
      return 0;
    };
    let maxEnd = 0;
    for (const block of blocks) {
      const lines = block.trim().split('\n').map((l) => l.trim()).filter(Boolean);
      const timeLine = lines.find((l) => l.includes('-->'));
      if (!timeLine) continue;
      const [, endStr] = timeLine.split('-->');
      const end = toSec(endStr);
      if (end > maxEnd) maxEnd = end;
    }
    return maxEnd;
  };

  const handleAutoFitSrtToAudio = () => {
    if (!audioDuration || !subtitleText.includes('-->')) {
      toast.error('Voiceover အသံဖိုင် သို့မဟုတ် SRT ဖိုင် လိုအပ်ပါသည်');
      return;
    }
    const srtDur = getSrtDuration(subtitleText);
    if (srtDur <= 0) {
      toast.error('SRT ဖိုင် timestamp ကို ရှာမတွေ့ပါ');
      return;
    }
    const targetAudioDur = audioFile && audioDuration > 0
      ? (audioDuration / audioSpeed)
      : (videoDuration > 0 ? (videoDuration / videoSpeed) : 0);
    if (targetAudioDur <= 0) {
      toast.error('ကြာချိန်ကို တွက်ချက်၍ မရသေးပါ');
      return;
    }
    const ratio = targetAudioDur / srtDur;
    const blocks = subtitleText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split(/\n\s*\n/);
    const toSec = (t: string) => {
      const parts = t.trim().replace(',', '.').split(':');
      if (parts.length === 3) {
        return (parseFloat(parts[0]) || 0) * 3600 + (parseFloat(parts[1]) || 0) * 60 + (parseFloat(parts[2]) || 0);
      }
      return 0;
    };

    const newBlocks: string[] = [];
    for (const block of blocks) {
      const lines = block.trim().split('\n').map((l) => l.trim()).filter(Boolean);
      const timeLineIdx = lines.findIndex((l) => l.includes('-->'));
      if (timeLineIdx === -1) continue;
      const [startStr, endStr] = lines[timeLineIdx].split('-->');
      const newStart = toSec(startStr) * ratio;
      const newEnd = toSec(endStr) * ratio;
      lines[timeLineIdx] = `${formatSrtTimestamp(newStart)} --> ${formatSrtTimestamp(newEnd)}`;
      newBlocks.push(lines.join('\n'));
    }
    setSubtitleText(newBlocks.join('\n\n'));
    setSubtitleOffset(0);
    toast.success(`SRT စာတန်းများကို အသံဖိုင်ကြာချိန် (${formatTimeSimple(targetAudioDur)}) နှင့် အပြည့်အဝ Fit လုပ်ပြီး ညှိပေးလိုက်ပါပြီ!`);
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
        setSubtitleOffset(0);
        toast.success(`Burma SRT ဖိုင် (${file.name}) တင်သွင်းပြီးပါပြီ!`);
      }
    };
    reader.readAsText(file, 'utf-8');
    if (srtFileInputRef.current) srtFileInputRef.current.value = '';
  };

  const handleRemoveSrt = () => {
    setSubtitleText('');
    setSrtFileName('');
    setSubtitleOffset(0);
    if (srtFileInputRef.current) srtFileInputRef.current.value = '';
    toast.success('SRT စာတန်းထိုးဖိုင်ကို ဖယ်ရှားလိုက်ပါသည်');
  };

  const handleDownloadSrt = () => {
    const text = subtitleText.trim();
    if (!text) {
      toast.error('ဒေါင်းလုဒ်လုပ်ရန် SRT ဖိုင် မရှိသေးပါ');
      return;
    }

    let srtContent = '';
    if (text.includes('-->')) {
      const speed = audioFile ? audioSpeed : videoSpeed;
      if (speed !== 1 || subtitleOffset !== 0) {
        const blocks = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split(/\n\s*\n/);
        const toSec = (t: string) => {
          const parts = t.trim().replace(',', '.').split(':');
          if (parts.length === 3) {
            return (parseFloat(parts[0]) || 0) * 3600 + (parseFloat(parts[1]) || 0) * 60 + (parseFloat(parts[2]) || 0);
          }
          return 0;
        };
        const adjustedBlocks: string[] = [];
        let cueCount = 1;
        for (const block of blocks) {
          const lines = block.trim().split('\n').map((l) => l.trim()).filter(Boolean);
          const timeLineIdx = lines.findIndex((l) => l.includes('-->'));
          if (timeLineIdx === -1) continue;
          const [startStr, endStr] = lines[timeLineIdx].split('-->');
          const start = Math.max(0, (toSec(startStr) / speed) + subtitleOffset);
          const end = Math.max(start + 0.25, (toSec(endStr) / speed) + subtitleOffset);
          const textLines = lines.slice(timeLineIdx + 1);
          adjustedBlocks.push(`${cueCount++}\n${formatSrtTimestamp(start)} --> ${formatSrtTimestamp(end)}\n${textLines.join('\n')}`);
        }
        srtContent = adjustedBlocks.join('\n\n');
      } else {
        srtContent = text;
      }
    } else {
      const duration = videoDuration > 0 ? (videoDuration / videoSpeed) : 60;
      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (lines.length <= 1) {
        srtContent = `1\n00:00:00,000 --> ${formatSrtTimestamp(duration)}\n${text}\n`;
      } else {
        const segmentDuration = duration / lines.length;
        lines.forEach((line, idx) => {
          const start = idx * segmentDuration;
          const end = (idx + 1) * segmentDuration;
          srtContent += `${idx + 1}\n${formatSrtTimestamp(start)} --> ${formatSrtTimestamp(end)}\n${line}\n\n`;
        });
      }
    }

    // Include UTF-8 BOM (\uFEFF) so all video editing software & Windows automatically recognize Burmese Unicode
    const blob = new Blob(['\uFEFF' + srtContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = srtFileName ? srtFileName.replace('.srt', '_synced.srt') : `burma_synced_${Date.now()}.srt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('အချိန်ကိုက် Burma SRT စာတန်းထိုးဖိုင် ဒေါင်းလုဒ်လုပ်ပြီးပါပြီ!');
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

      // Proactively detect duration
      const tempVideo = document.createElement('video');
      tempVideo.preload = 'metadata';
      tempVideo.src = url;
      tempVideo.onloadedmetadata = () => {
        if (Number.isFinite(tempVideo.duration) && tempVideo.duration > 0) {
          setVideoDuration(tempVideo.duration);
        }
      };
      if (videoInputRef.current) videoInputRef.current.value = '';
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
      const url = URL.createObjectURL(file);
      setVideoFile(file);
      setVideoUrl(url);
      setResultUrl(null);
      setVideoSpeed(1.0);

      const tempVideo = document.createElement('video');
      tempVideo.preload = 'metadata';
      tempVideo.src = url;
      tempVideo.onloadedmetadata = () => {
        if (Number.isFinite(tempVideo.duration) && tempVideo.duration > 0) {
          setVideoDuration(tempVideo.duration);
        }
      };
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
      // Accept every audio format + video containers (audio track is used) + files with empty/unknown MIME
      const type = (file.type || '').toLowerCase();
      const looksLikeMedia =
        type.startsWith('audio/') ||
        type.startsWith('video/') ||
        type === '' ||
        type === 'application/octet-stream' ||
        type === 'application/ogg' ||
        VOICEOVER_EXTENSIONS.test(file.name);
      if (!looksLikeMedia) {
        setError('ကျေးဇူးပြု၍ အသံ သို့မဟုတ် ဗီဒီယို ဖိုင် ရွေးပေးပါ။');
        return;
      }
      if (file.size > 1024 * 1024 * 1024) {
        setError('အသံ ဖိုင်ဆိုဒ် ကြီးလွန်းပါသည် (အများဆုံး 1GB)။');
        return;
      }
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      const url = URL.createObjectURL(file);
      setAudioFile(file);
      setAudioUrl(url);
      setAudioSpeed(1.0);
      setError(null);

      // Proactively detect audio duration
      const tempAudio = document.createElement('audio');
      tempAudio.preload = 'metadata';
      tempAudio.src = url;
      tempAudio.onloadedmetadata = () => {
        if (Number.isFinite(tempAudio.duration) && tempAudio.duration > 0) {
          setAudioDuration(tempAudio.duration);
        }
      };
      tempAudio.onerror = () => {
        // Browser can't preview this codec (e.g. WMA/AMR) — server FFmpeg will still process it
        toast('ဤအသံဖိုင်ကို Browser တွင် Preview မရပါ၊ သို့သော် Server တွင် ပုံမှန် ပေါင်းစပ်ပေးပါမည်။', { icon: 'ℹ️' });
      };
      if (audioInputRef.current) audioInputRef.current.value = '';
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
      if (logoInputRef.current) logoInputRef.current.value = '';
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
    if (videoRef.current && Number.isFinite(videoRef.current.duration) && videoRef.current.duration > 0) {
      setVideoDuration(videoRef.current.duration);
    }
  };

  const onAudioLoaded = () => {
    if (audioRef.current && Number.isFinite(audioRef.current.duration) && audioRef.current.duration > 0) {
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
        const active = getActiveSubtitleCue(subtitleText, currentAudioTime || 0, subtitleOffset);
        subText = active || (video.paused ? getFirstSubtitleCue(subtitleText) : '');
      } else {
        subText = subtitleText.trim();
      }

      if (subText) {
        // Base font size: 5.5% of height, then auto-scale down to fit 90% of strip width
        let fontSize = Math.max(14, Math.floor(height * 0.055));
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        let fontName = 'Akkhayar21';
        if (subtitleStyle === 'font-kunheing') fontName = 'AJKunheing';
        else if (subtitleStyle === 'font-jojar') fontName = 'MyanmarJojar';
        else if (subtitleStyle === 'font-myanmaros') fontName = 'MyanmarOS';
        else fontName = 'Akkhayar21';

        // Strictly wrap into at most 2 lines (never 3 lines)
        const maxLineWidth = width * 0.88;
        const wrapTextToMax2Lines = (text: string, maxW: number): string[] => {
          const clean = text.replace(/\\N/gi, ' ').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
          ctx.font = `bold ${fontSize}px ${fontName}, sans-serif`;
          if (ctx.measureText(clean).width <= maxW) return [clean];

          const mid = clean.length / 2;

          // 1. If spaces exist, split at space closest to midpoint
          const spaces: number[] = [];
          for (let i = 0; i < clean.length; i++) {
            if (clean[i] === ' ') spaces.push(i);
          }
          if (spaces.length > 0) {
            let best = spaces[0];
            let minDiff = Math.abs(best - mid);
            for (const sp of spaces) {
              const diff = Math.abs(sp - mid);
              if (diff < minDiff) {
                minDiff = diff;
                best = sp;
              }
            }
            return [clean.slice(0, best).trim(), clean.slice(best).trim()];
          }

          // 2. If Burmese punctuation marks exist (၊ or ။), split after punctuation closest to midpoint
          const puncts: number[] = [];
          for (let i = 0; i < clean.length; i++) {
            if (clean[i] === '၊' || clean[i] === '။') puncts.push(i + 1);
          }
          if (puncts.length > 0) {
            let best = puncts[0];
            let minDiff = Math.abs(best - mid);
            for (const p of puncts) {
              const diff = Math.abs(p - mid);
              if (diff < minDiff) {
                minDiff = diff;
                best = p;
              }
            }
            return [clean.slice(0, best).trim(), clean.slice(best).trim()];
          }

          // 3. Burmese syllable boundary: look for a consonant [\u1000-\u1021] NOT preceded by virama \u1039
          const syllableStarts: number[] = [];
          const minBound = Math.floor(clean.length * 0.25);
          const maxBound = Math.floor(clean.length * 0.75);
          for (let i = minBound; i <= maxBound; i++) {
            const code = clean.charCodeAt(i);
            if (code >= 0x1000 && code <= 0x1021) {
              const prev = i > 0 ? clean.charCodeAt(i - 1) : 0;
              if (prev !== 0x1039) syllableStarts.push(i);
            }
          }
          if (syllableStarts.length > 0) {
            let bestSyl = syllableStarts[0];
            let minDiff = Math.abs(bestSyl - mid);
            for (const s of syllableStarts) {
              const diff = Math.abs(s - mid);
              if (diff < minDiff) {
                minDiff = diff;
                bestSyl = s;
              }
            }
            return [clean.slice(0, bestSyl).trim(), clean.slice(bestSyl).trim()];
          }

          return [clean.slice(0, Math.floor(mid)).trim(), clean.slice(Math.floor(mid)).trim()];
        };

        // Auto-scale font so both lines fit cleanly within maxLineWidth
        let lines = wrapTextToMax2Lines(subText, maxLineWidth);
        ctx.font = `bold ${fontSize}px ${fontName}, sans-serif`;
        const maxMeasured = Math.max(...lines.map(l => ctx.measureText(l).width));
        if (maxMeasured > maxLineWidth) {
          fontSize = Math.max(10, Math.floor(fontSize * maxLineWidth / maxMeasured));
          ctx.font = `bold ${fontSize}px ${fontName}, sans-serif`;
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
          ctx.lineWidth = Math.max(2.5, Math.floor(height * 0.007));
          ctx.strokeStyle = '#000000';
          ctx.strokeText(line, subX, lineY);
          ctx.fillStyle = '#FACC15';
          ctx.fillText(line, subX, lineY);
        });
      }
      ctx.restore();
    }

    // Logo Watermark
    if (logoImage) {
      const lWidth = Math.max(32, width * (logoScale / 100));
      const aspect = (logoImage.naturalWidth && logoImage.naturalHeight)
        ? logoImage.naturalHeight / logoImage.naturalWidth
        : 1;
      const lHeight = lWidth * aspect;
      const pad = Math.max(8, width * 0.02);

      let lx = pad;
      if (logoAlign === 'center') {
        lx = (width - lWidth) / 2;
      } else if (logoAlign === 'right') {
        lx = width - lWidth - pad;
      }

      const availableH = Math.max(0, height - lHeight - (pad * 2));
      const ly = pad + (availableH * (logoY / 100));

      ctx.save();
      ctx.globalAlpha = Math.max(0.1, logoOpacity / 100);
      ctx.drawImage(logoImage, lx, ly, lWidth, lHeight);
      ctx.restore();
    }
  }, [blurEnabled, blurPosition, blurThickness, blurIntensity, zoomEnabled, zoomInterval, zoomDuration, logoImage, logoY, logoAlign, logoScale, logoOpacity, subtitleStyle, subtitleText, subtitleOffset, audioFile, videoSpeed, audioSpeed]);

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
          normalizeVoiceoverFile(audioFile),
          (val) => {
            const current = Math.min(35 + Math.round(val * 0.12), 48);
            setProgress(current);
            setStatusMessage(`အသံဖိုင် တင်နေပါသည်... (${val}%)`);
          },
          controller.signal
        );
      }

      let uploadedLogo;
      if (logoFile) {
        setStatusMessage('လိုဂို ပုံရိပ်ကို ဆာဗာသို့ တင်နေပါသည်... (Uploading logo)');
        uploadedLogo = await uploadMedia(
          logoFile,
          (val) => {
            const current = Math.min(48 + Math.round(val * 0.04), 52);
            setProgress(current);
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
          subtitleOffset,
          logoFileId: uploadedLogo?.fileId,
          logoY,
          logoAlign,
          logoScale,
          logoOpacity: logoOpacity / 100,
        },
        uploadedAudio?.fileId,
        uploadedLogo?.fileId
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
      <div className="mb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
            <span>Movie Recap Studio</span>
            <span className="text-[10px] sm:text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-semibold">
              Burmese Recap Flow
            </span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
            ဗီဒီယိုနှင့် အသံဖိုင်တင်သွင်းပြီး မြန်မာစာတန်းထိုး Recap ဗီဒီယို ထုတ်လုပ်ပါ
          </p>
        </div>

        {/* Server Status Badge */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-semibold ${workerOnline
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
            : 'bg-zinc-800/60 border-zinc-700/60 text-zinc-400'
            }`}>
            <span className={`w-2 h-2 rounded-full ${workerOnline ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'}`} />
            <span>{workerOnline ? 'AWS Server Connected' : 'Local Ready'}</span>
          </div>
        </div>
      </div>

      {/* MAIN TWO-COLUMN WORKFLOW */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_1fr] gap-5 items-start">
        {/* LEFT COLUMN: SEQUENTIAL STEP SECTIONS */}
        <div className="space-y-4">
          {/* SECTION 1: VIDEO SOURCE */}
          <section className="rounded-2xl bg-white dark:bg-[#0c0c0e] border border-gray-200 dark:border-white/10 p-4 sm:p-5 space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">1</span>
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-200">
                  Video Upload (ဗီဒီယိုဖိုင်)
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
                className="group cursor-pointer rounded-xl border-2 border-dashed border-gray-300 dark:border-white/15 hover:border-indigo-500 dark:hover:border-indigo-400 hover:bg-indigo-500/5 p-5 text-center transition-all"
              >
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center mx-auto mb-2 group-hover:scale-110 transition-transform">
                  <Video className="w-5 h-5" />
                </div>
                <div className="text-xs font-bold text-slate-800 dark:text-zinc-200">
                  ဗီဒီယိုဖိုင် တင်သွင်းပါ (Click or Drag & Drop)
                </div>
                <div className="text-[10px] text-slate-400 dark:text-zinc-500 mt-0.5">
                  MP4, WebM, MOV, MKV (အများဆုံး 200MB)
                </div>
              </div>
            ) : (
              <div className="rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 p-3 flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-indigo-600/15 text-indigo-400 flex items-center justify-center shrink-0">
                    <Video className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{videoFile.name}</p>
                    <p className="text-[10px] text-slate-400 dark:text-zinc-400">
                      {formatFileSize(videoFile.size)} • {formatTimeSimple(videoDuration)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleRemoveVideo}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-all shrink-0"
                  title="Remove video"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}

            <div className="flex gap-2">
              <input
                value={videoSourceUrl}
                onChange={(e) => setVideoSourceUrl(e.target.value)}
                placeholder="သို့မဟုတ် Direct Video URL ထည့်ပါ..."
                className="min-w-0 flex-1 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 px-3 py-1.5 text-xs outline-none focus:border-indigo-400 text-slate-900 dark:text-white"
              />
              <button
                onClick={handleVideoUrl}
                disabled={!videoSourceUrl.trim()}
                className="px-3 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-black text-xs font-bold disabled:opacity-40 hover:opacity-90 transition-opacity"
              >
                Load
              </button>
            </div>
            <input type="file" ref={videoInputRef} accept="video/*" onChange={handleVideoUpload} className="hidden" />
          </section>

          {/* SECTION 2: ASPECT RATIO */}
          <section className="rounded-2xl bg-white dark:bg-[#0c0c0e] border border-gray-200 dark:border-white/10 p-4 sm:p-5 space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">2</span>
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-200">
                  Aspect Ratio (အချိုးအစား)
                </h2>
              </div>
              <span className="text-[11px] text-indigo-400 font-bold">{aspectRatio}</span>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {[
                { id: '16:9', label: '16:9', desc: 'YouTube', iconW: 'w-5 h-3' },
                { id: '9:16', label: '9:16', desc: 'TikTok/Reels', iconW: 'w-3 h-5' },
                { id: '1:1', label: '1:1', desc: 'Square', iconW: 'w-4 h-4' },
                { id: '4:5', label: '4:5', desc: 'Facebook', iconW: 'w-3.5 h-4.5' },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setAspectRatio(item.id as typeof aspectRatio)}
                  className={`rounded-xl border p-2.5 text-center transition-all flex flex-col items-center justify-center gap-1 ${aspectRatio === item.id
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

          {/* SECTION 3: SUBTITLE SELECTION & 4 BURMESE FONTS */}
          <section className="rounded-2xl bg-white dark:bg-[#0c0c0e] border border-gray-200 dark:border-white/10 p-4 sm:p-5 space-y-3.5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">3</span>
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-200">
                  Subtitles (မြန်မာစာတန်းထိုး)
                </h2>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={subtitleEnabled}
                  onChange={(e) => setSubtitleEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-gray-300 peer-focus:outline-none rounded-full peer dark:bg-zinc-800 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600" />
              </label>
            </div>

            {!subtitleEnabled ? (
              <div className="rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 p-3 flex items-center justify-between text-xs text-slate-500 dark:text-zinc-400">
                <div className="flex items-center gap-2">
                  <Video className="w-4 h-4 text-slate-400 dark:text-zinc-500" />
                  <span>စာတန်းမပါ (Clean Video) ထုတ်လုပ်ပါမည်</span>
                </div>
                {subtitleText.includes('-->') && (
                  <button
                    type="button"
                    onClick={handleDownloadSrt}
                    className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold flex items-center gap-1 transition-all"
                  >
                    <Download className="w-3 h-3" />
                    <span>Download SRT</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {/* 4 BURMESE FONTS SELECTION (FROM public/fonts) */}
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-2">
                    Burmese Font Style (ဖောင့်ပုံစံ ရွေးချယ်ရန်)
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { id: 'font-akkhayar', title: 'Akkhayar 21', fontFamily: 'Akkhayar21, sans-serif' },
                      { id: 'font-kunheing', title: 'AJ Kunheing', fontFamily: 'AJKunheing, sans-serif' },
                      { id: 'font-jojar', title: 'Myanmar Jojar', fontFamily: 'MyanmarJojar, sans-serif' },
                      { id: 'font-myanmaros', title: 'Myanmar OS', fontFamily: 'MyanmarOS, sans-serif' },
                    ].map((font) => (
                      <button
                        key={font.id}
                        type="button"
                        onClick={() => setSubtitleStyle(font.id)}
                        className={`rounded-xl border p-2.5 text-center transition-all relative flex flex-col justify-between ${subtitleStyle === font.id
                          ? 'border-indigo-500 bg-indigo-500/10 shadow-sm ring-1 ring-indigo-500/30'
                          : 'border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 hover:border-indigo-400'
                          }`}
                      >
                        <div className="flex items-center justify-between w-full mb-1">
                          <span className="text-[11px] font-bold text-slate-900 dark:text-white truncate">
                            {font.title}
                          </span>
                          {subtitleStyle === font.id && <Check className="w-3.5 h-3.5 text-indigo-400 shrink-0" />}
                        </div>
                        <div className="py-2.5 px-1 bg-black/60 rounded-lg border border-white/5 w-full flex items-center justify-center">
                          <span
                            className="text-amber-400 font-bold text-sm tracking-wide"
                            style={{ fontFamily: font.fontFamily, textShadow: '0 0 2px #000, 1px 1px 0 #000, -1px -1px 0 #000' }}
                          >
                            မြန်မာစာတန်း
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* SRT FILE CONTROLS */}
                {subtitleText.includes('-->') ? (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-mono font-bold text-[11px] shrink-0">
                          SRT
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                            {srtFileName || 'burma_subtitles.srt'}
                          </p>
                          <p className="text-[10px] text-slate-400 dark:text-zinc-400 truncate mt-0.5" style={{ fontFamily: 'Akkhayar21, sans-serif' }}>
                            💬 {getFirstSubtitleCue(subtitleText)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => srtFileInputRef.current?.click()}
                          className="px-2 py-1 rounded-lg bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/15 text-slate-700 dark:text-zinc-200 text-[10px] font-bold transition-all"
                        >
                          Replace
                        </button>
                        <button
                          type="button"
                          onClick={handleDownloadSrt}
                          className="p-1 rounded-lg bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/15 text-slate-700 dark:text-zinc-200 transition-all"
                          title="Download Synced SRT"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={handleRemoveSrt}
                          className="p-1 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
                          title="Remove SRT"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* SUBTITLE TIMING OFFSET & AUTO-FIT */}
                    <div className="pt-2 border-t border-gray-200/60 dark:border-white/10 space-y-2">
                      <div className="flex items-center justify-between text-[11px]">
                        <label className="font-bold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
                          <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                          <span>Timing Nudge (စာတန်း အသံနှင့် ညှိရန်)</span>
                        </label>
                        <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md border ${
                          subtitleOffset === 0
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : subtitleOffset > 0
                              ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                              : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                        }`}>
                          {subtitleOffset === 0
                            ? '0.00s (Exact)'
                            : subtitleOffset > 0
                              ? `+${subtitleOffset.toFixed(2)}s (နောက်ဆုတ်)`
                              : `${subtitleOffset.toFixed(2)}s (ရှေ့တိုး)`}
                        </span>
                      </div>

                      {/* Slider & Precision Steppers */}
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSubtitleOffset((prev) => Math.max(-3.0, Number((prev - 0.05).toFixed(2))))}
                          className="w-7 h-7 rounded-lg bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/15 text-slate-700 dark:text-zinc-200 font-bold text-xs flex items-center justify-center transition-all"
                          title="-0.05s"
                        >
                          -0.05
                        </button>
                        <button
                          type="button"
                          onClick={() => setSubtitleOffset((prev) => Math.max(-3.0, Number((prev - 0.02).toFixed(2))))}
                          className="w-6 h-7 rounded-lg bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/15 text-slate-700 dark:text-zinc-200 font-bold text-[10px] flex items-center justify-center transition-all"
                          title="-0.02s micro step"
                        >
                          -
                        </button>
                        <input
                          type="range"
                          min="-3.0"
                          max="3.0"
                          step="0.02"
                          value={subtitleOffset}
                          onChange={(e) => setSubtitleOffset(Number(Number(e.target.value).toFixed(2)))}
                          className="flex-1 accent-indigo-500 cursor-pointer"
                        />
                        <button
                          type="button"
                          onClick={() => setSubtitleOffset((prev) => Math.min(3.0, Number((prev + 0.02).toFixed(2))))}
                          className="w-6 h-7 rounded-lg bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/15 text-slate-700 dark:text-zinc-200 font-bold text-[10px] flex items-center justify-center transition-all"
                          title="+0.02s micro step"
                        >
                          +
                        </button>
                        <button
                          type="button"
                          onClick={() => setSubtitleOffset((prev) => Math.min(3.0, Number((prev + 0.05).toFixed(2))))}
                          className="w-7 h-7 rounded-lg bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/15 text-slate-700 dark:text-zinc-200 font-bold text-xs flex items-center justify-center transition-all"
                          title="+0.05s"
                        >
                          +0.05
                        </button>
                      </div>

                      {/* Quick chips & Auto-Fit button */}
                      <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1">
                        <div className="flex flex-wrap items-center gap-1">
                          {[
                            { label: '-0.3s', val: -0.3 },
                            { label: '-0.15s', val: -0.15 },
                            { label: '-0.05s', val: -0.05 },
                            { label: '0.0s', val: 0 },
                            { label: '+0.05s', val: 0.05 },
                            { label: '+0.15s', val: 0.15 },
                            { label: '+0.3s', val: 0.3 },
                          ].map((chip) => (
                            <button
                              key={chip.label}
                              type="button"
                              onClick={() => setSubtitleOffset(chip.val)}
                              className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border transition-all ${
                                Math.abs(subtitleOffset - chip.val) < 0.01
                                  ? 'border-indigo-500 bg-indigo-500/15 text-indigo-400'
                                  : 'border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-slate-600 dark:text-zinc-400'
                              }`}
                            >
                              {chip.label}
                            </button>
                          ))}
                        </div>

                        {audioFile && audioDuration > 0 && (
                          <button
                            type="button"
                            onClick={handleAutoFitSrtToAudio}
                            className="py-1 px-2.5 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-200 text-[10px] font-bold flex items-center gap-1 shadow-sm transition-all active:scale-95"
                            title="Auto-Fit SRT to Voiceover length"
                          >
                            <Zap className="w-3 h-3 text-amber-300 animate-pulse" />
                            <span>Auto-Fit SRT to Audio</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={() => srtFileInputRef.current?.click()}
                    className="group cursor-pointer rounded-xl border-2 border-dashed border-gray-300 dark:border-white/15 hover:border-indigo-500 dark:hover:border-indigo-400 hover:bg-indigo-500/5 p-4 text-center transition-all"
                  >
                    <FileText className="w-5 h-5 text-indigo-400 mx-auto mb-1 group-hover:scale-110 transition-transform" />
                    <div className="text-xs font-bold text-slate-800 dark:text-zinc-200">
                      Burma SRT (.srt) စာတန်းထိုးဖိုင် တင်သွင်းပါ
                    </div>
                    <div className="text-[10px] text-slate-400 dark:text-zinc-500 mt-0.5">
                      Subtitle Studio မှ ထုတ်ယူထားသော .srt ဖိုင် တင်သွင်းနိုင်ပါသည်
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
            )}
          </section>

          {/* SECTION 4: VOICEOVER AUDIO */}
          <section className="rounded-2xl bg-white dark:bg-[#0c0c0e] border border-gray-200 dark:border-white/10 p-4 sm:p-5 space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">4</span>
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-200">
                  Voiceover Audio (နောက်ခံအသံ)
                </h2>
              </div>
              {audioFile && (
                <span className="text-[11px] text-emerald-500 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Ready ({formatTimeSimple(audioDuration)})
                </span>
              )}
            </div>

            {!audioFile ? (
              <div
                onClick={() => audioInputRef.current?.click()}
                className="group cursor-pointer rounded-xl border-2 border-dashed border-gray-300 dark:border-white/15 hover:border-indigo-500 dark:hover:border-indigo-400 hover:bg-indigo-500/5 p-4 text-center transition-all"
              >
                <Music className="w-5 h-5 text-purple-400 mx-auto mb-1 group-hover:scale-110 transition-transform" />
                <div className="text-xs font-bold text-slate-800 dark:text-zinc-200">
                  Voiceover အသံဖိုင် တင်သွင်းပါ (အသံ/ဗီဒီယို ဖိုင် အမျိုးအစားအားလုံး)
                </div>
                <div className="text-[10px] text-slate-400 dark:text-zinc-500 mt-0.5">
                  မထည့်သွင်းပါက မူရင်းဗီဒီယိုအသံကို သုံးပါမည်
                </div>
              </div>
            ) : (
              <div className="rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 p-3 flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    onClick={toggleAudioPreview}
                    className="w-9 h-9 rounded-xl bg-purple-600 text-white flex items-center justify-center shrink-0 hover:bg-purple-500 transition-colors shadow-md"
                    title={isAudioPreviewPlaying ? "Pause audio" : "Play audio preview"}
                  >
                    {isAudioPreviewPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                  </button>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{audioFile.name}</p>
                    <p className="text-[10px] text-slate-400 dark:text-zinc-400">
                      {formatFileSize(audioFile.size)} • {formatTimeSimple(audioDuration)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleRemoveAudio}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-all shrink-0"
                  title="Remove audio"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
            <input id="voiceover-file-input" type="file" ref={audioInputRef} accept={VOICEOVER_ACCEPT} onChange={handleAudioUpload} className="hidden" />
          </section>

          {/* SECTION 5: SPEED & TIMELINE SYNCHRONIZATION */}
          <section className="rounded-2xl bg-white dark:bg-[#0c0c0e] border border-gray-200 dark:border-white/10 p-4 sm:p-5 space-y-3.5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">5</span>
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-200 flex items-center gap-1.5">
                  <Gauge className="w-4 h-4 text-indigo-400" />
                  Speed & Timeline Sync (အချိန်ကိုက် ညှိရန်)
                </h2>
              </div>
              {audioFile && (
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                  isTimelineSynced ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                }`}>
                  {isTimelineSynced ? (
                    <>
                      <CheckCircle2 className="w-3 h-3" /> In-Sync
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-3 h-3" /> {durationDiff < 0 ? 'အသံ ပိုရှည်' : 'ဗီဒီယို ပိုရှည်'}
                    </>
                  )}
                </span>
              )}
            </div>

            {/* Duration Comparison Cards */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="p-2.5 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10">
                <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-zinc-400">
                  <span className="flex items-center gap-1 font-semibold text-slate-700 dark:text-zinc-300">
                    <Video className="w-3.5 h-3.5 text-indigo-400" /> Video
                  </span>
                  <span className="font-mono text-indigo-400 font-bold">{videoSpeed.toFixed(2)}x</span>
                </div>
                <div className="text-sm font-black font-mono text-slate-900 dark:text-white mt-1">
                  {formatTimeSimple(effectiveVideoDuration)}
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10">
                <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-zinc-400">
                  <span className="flex items-center gap-1 font-semibold text-slate-700 dark:text-zinc-300">
                    <Music className="w-3.5 h-3.5 text-purple-400" /> Audio
                  </span>
                  <span className="font-mono text-purple-400 font-bold">{audioSpeed.toFixed(2)}x</span>
                </div>
                <div className="text-sm font-black font-mono text-slate-900 dark:text-white mt-1">
                  {audioFile ? formatTimeSimple(effectiveAudioDuration) : 'Original'}
                </div>
              </div>
            </div>

            {/* Auto-Sync Quick Actions (when durations differ) */}
            {audioFile && videoDuration > 0 && audioDuration > 0 && !isTimelineSynced && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleAutoMatchVideoToAudio}
                  className="px-2.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold flex items-center justify-center gap-1 shadow-sm transition-all"
                >
                  <Zap className="w-3 h-3 text-amber-300" />
                  <span>Video ကို အသံနှင့် ညှိမည်</span>
                </button>
                <button
                  type="button"
                  onClick={handleAutoMatchAudioToVideo}
                  className="px-2.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-[10px] font-bold flex items-center justify-center gap-1 shadow-sm transition-all"
                >
                  <Zap className="w-3 h-3 text-amber-300" />
                  <span>အသံကို Video နှင့် ညှိမည်</span>
                </button>
              </div>
            )}

            {/* Video Speed Slider */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-[11px]">
                <label className="font-bold text-slate-700 dark:text-zinc-300">
                  Video Speed ({videoSpeed.toFixed(2)}x)
                </label>
                <div className="flex gap-1">
                  {[0.75, 1.0, 1.25, 1.5].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setVideoSpeed(s)}
                      className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border transition-all ${
                        Math.abs(videoSpeed - s) < 0.02
                          ? 'border-indigo-500 bg-indigo-500/15 text-indigo-400'
                          : 'border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-slate-600 dark:text-zinc-400'
                      }`}
                    >
                      {s}x
                    </button>
                  ))}
                </div>
              </div>
              <input
                type="range"
                min="0.25"
                max="2.50"
                step="0.05"
                value={videoSpeed}
                onChange={(e) => setVideoSpeed(Number(Number(e.target.value).toFixed(2)))}
                className="w-full accent-indigo-500 cursor-pointer"
              />
            </div>

            {/* Voiceover Speed Slider (only if audio file present) */}
            {audioFile && (
              <div className="space-y-1.5 pt-2 border-t border-gray-100 dark:border-white/5">
                <div className="flex items-center justify-between text-[11px]">
                  <label className="font-bold text-slate-700 dark:text-zinc-300">
                    Voiceover Speed ({audioSpeed.toFixed(2)}x)
                  </label>
                  <div className="flex gap-1">
                    {[0.85, 1.0, 1.15, 1.25].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setAudioSpeed(s)}
                        className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border transition-all ${
                          Math.abs(audioSpeed - s) < 0.02
                            ? 'border-purple-500 bg-purple-500/15 text-purple-400'
                            : 'border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-slate-600 dark:text-zinc-400'
                        }`}
                      >
                        {s}x
                      </button>
                    ))}
                  </div>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="2.0"
                  step="0.05"
                  value={audioSpeed}
                  onChange={(e) => setAudioSpeed(Number(Number(e.target.value).toFixed(2)))}
                  className="w-full accent-purple-500 cursor-pointer"
                />
              </div>
            )}
          </section>

          {/* SECTION 6: LOGO WATERMARK */}
          <section className="rounded-2xl bg-white dark:bg-[#0c0c0e] border border-gray-200 dark:border-white/10 p-4 sm:p-5 space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">6</span>
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-200">
                  Logo Watermark (လိုဂို)
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
                className="group cursor-pointer rounded-xl border-2 border-dashed border-gray-300 dark:border-white/15 hover:border-indigo-500 dark:hover:border-indigo-400 hover:bg-indigo-500/5 p-4 text-center transition-all"
              >
                <ImageIcon className="w-5 h-5 text-amber-400 mx-auto mb-1 group-hover:scale-110 transition-transform" />
                <div className="text-xs font-bold text-slate-800 dark:text-zinc-200">
                  လိုဂိုပုံ တင်သွင်းပါ (PNG / JPG / WebP)
                </div>
                <div className="text-[10px] text-slate-400 dark:text-zinc-500 mt-0.5">
                  Click to browse transparent logo or channel watermark
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {/* File Info Bar */}
                <div className="rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 p-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <img src={logoUrl || ''} alt="Logo" className="w-8 h-8 object-contain rounded-lg bg-black/40 p-1 border border-white/10" />
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{logoFile.name}</p>
                      <p className="text-[10px] text-slate-400 dark:text-zinc-400">{formatFileSize(logoFile.size)}</p>
                    </div>
                  </div>
                  <button
                    onClick={handleRemoveLogo}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
                    title="Remove Logo"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Vertical Position Adjust Bar (0% to 100%) */}
                <div className="p-3 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 dark:text-zinc-200">
                    <span>Vertical Position (အပေါ် / အောက် နေရာချထားမှု)</span>
                    <span className="text-indigo-400 font-mono font-semibold">
                      {logoY}% ({logoY <= 25 ? 'Top / အပေါ်' : logoY <= 70 ? 'Center / အလယ်' : 'Bottom / အောက်'})
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={logoY}
                    onChange={(e) => setLogoY(Number(e.target.value))}
                    className="w-full accent-indigo-500 cursor-pointer"
                  />
                  {/* Preset quick buttons */}
                  <div className="grid grid-cols-3 gap-1.5 pt-0.5">
                    {[
                      { label: 'အပေါ် (Top 8%)', val: 8 },
                      { label: 'အလယ် (Center 50%)', val: 50 },
                      { label: 'အောက် (Bottom 92%)', val: 92 },
                    ].map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => setLogoY(preset.val)}
                        className={`rounded-lg py-1 text-[10px] font-semibold border transition-all ${
                          logoY === preset.val
                            ? 'border-indigo-500 bg-indigo-500/15 text-indigo-400 font-bold'
                            : 'border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Horizontal Alignment */}
                <div className="p-3 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 space-y-1.5">
                  <div className="text-[11px] font-bold text-slate-700 dark:text-zinc-200">
                    Horizontal Align (ဘယ် / အလယ် / ညာ)
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { key: 'left', label: 'ဘယ် (Left)' },
                      { key: 'center', label: 'အလယ် (Center)' },
                      { key: 'right', label: 'ညာ (Right)' },
                    ].map((align) => (
                      <button
                        key={align.key}
                        type="button"
                        onClick={() => setLogoAlign(align.key as 'left' | 'center' | 'right')}
                        className={`rounded-lg py-1.5 text-[10px] font-semibold border transition-all ${
                          logoAlign === align.key
                            ? 'border-indigo-500 bg-indigo-500/15 text-indigo-400 font-bold'
                            : 'border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        {align.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Size & Opacity Controls */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="p-2.5 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10">
                    <div className="flex justify-between text-[10px] font-bold text-slate-600 dark:text-zinc-300 mb-1">
                      <span>Logo Size (ဆိုဒ်)</span>
                      <span className="text-indigo-400 font-mono">{logoScale}%</span>
                    </div>
                    <input
                      type="range"
                      min="6"
                      max="30"
                      step="1"
                      value={logoScale}
                      onChange={(e) => setLogoScale(Number(e.target.value))}
                      className="w-full accent-indigo-500 cursor-pointer"
                    />
                  </div>

                  <div className="p-2.5 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10">
                    <div className="flex justify-between text-[10px] font-bold text-slate-600 dark:text-zinc-300 mb-1">
                      <span>Opacity (ကြည်လင်မှု)</span>
                      <span className="text-indigo-400 font-mono">{logoOpacity}%</span>
                    </div>
                    <input
                      type="range"
                      min="20"
                      max="100"
                      step="5"
                      value={logoOpacity}
                      onChange={(e) => setLogoOpacity(Number(e.target.value))}
                      className="w-full accent-indigo-500 cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            )}
            <input type="file" ref={logoInputRef} accept="image/*" onChange={handleLogoUpload} className="hidden" />
          </section>

          {/* SECTION 7: FROSTED BLUR STRIP */}
          <section className="rounded-2xl bg-white dark:bg-[#0c0c0e] border border-gray-200 dark:border-white/10 p-4 sm:p-5 space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">7</span>
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-200">
                  Frosted Blur Strip (စာတန်းဟောင်း ဖုံးအုပ်ရန် Blur အလွှာ)
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

            {blurEnabled && (
              <div className="grid grid-cols-3 gap-2.5 pt-1">
                <div className="p-2.5 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10">
                  <div className="flex justify-between text-[10px] font-bold text-slate-600 dark:text-zinc-300 mb-1">
                    <span>Position</span>
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

                <div className="p-2.5 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10">
                  <div className="flex justify-between text-[10px] font-bold text-slate-600 dark:text-zinc-300 mb-1">
                    <span>Thickness</span>
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

                <div className="p-2.5 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10">
                  <div className="flex justify-between text-[10px] font-bold text-slate-600 dark:text-zinc-300 mb-1">
                    <span>Strength</span>
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
          <div className="rounded-2xl bg-white dark:bg-[#0c0c0e] border border-gray-200 dark:border-white/10 p-4 sm:p-5 space-y-3.5 shadow-sm">
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
                  <Video className="w-8 h-8 mx-auto text-zinc-600 animate-pulse" />
                  <p className="text-xs font-medium">ဗီဒီယိုဖိုင် တင်သွင်းပြီးပါက Preview ပေါ်လာပါမည်</p>
                </div>
              )}
            </div>

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
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold tracking-wide shadow-lg shadow-indigo-600/25 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 group"
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
              className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 sm:p-5 space-y-3 shadow-lg"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs shrink-0">
                    ✓
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 dark:text-white">Recap Video Ready</h3>
                    <span className="text-[9px] text-emerald-400 font-semibold">
                      {subtitleEnabled ? 'မြန်မာစာတန်းထိုး ပါဝင်သည်' : 'Clean Video (စာတန်းမပါ)'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleDownloadSrt}
                    className="rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 text-xs font-bold flex items-center gap-1.5 shadow-md shadow-indigo-600/20 transition-colors"
                    title="Download Burma SRT"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Download SRT</span>
                  </button>
                  <a
                    href={resultUrl}
                    download={`burmese_recap_${Date.now()}.mp4`}
                    className="rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 text-xs font-bold flex items-center gap-1.5 shadow-md shadow-emerald-600/20 transition-colors"
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
            onLoadedData={onVideoLoaded}
            onDurationChange={onVideoLoaded}
            onCanPlay={onVideoLoaded}
          />
          <audio
            ref={audioRef}
            src={audioUrl || ''}
            style={{ position: 'fixed', top: -9999, left: -9999, width: 4, height: 4, opacity: 0, pointerEvents: 'none' }}
            onLoadedMetadata={onAudioLoaded}
            onLoadedData={onAudioLoaded}
            onDurationChange={onAudioLoaded}
            onCanPlay={onAudioLoaded}
            onEnded={() => setIsAudioPreviewPlaying(false)}
          />
        </div>
      </div>
    </div>
  );
};

export default MovieRecap;
