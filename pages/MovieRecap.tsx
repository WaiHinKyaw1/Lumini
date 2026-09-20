
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";
import { CREDIT_COSTS, ContentType, JsonValue, JsonRecord } from '../types';
import { auth } from '../services/firebase';
import { logGeneration } from '../services/supabase';
import { ModuleLogHistory } from '../components/ModuleLogHistory';
import { RecentHistory } from '../components/RecentHistory';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { createSyncJob, isMediaWorkerAvailable, isMediaWorkerConfigured, getOutputUrl, uploadMedia, waitForSyncJob } from '../services/mediaWorkerApi';

interface MovieRecapProps {
  onSpendCredits: (amount: number) => boolean;
}

const MovieRecap: React.FC<MovieRecapProps> = ({ onSpendCredits }) => {
  // --- State: Media ---
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoSourceUrl, setVideoSourceUrl] = useState('');
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState<number>(0);

  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioDuration, setAudioDuration] = useState<number>(0);

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoImage, setLogoImage] = useState<HTMLImageElement | null>(null);

  // --- State: AI Generation ---
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const [showAIPrompt, setShowAIPrompt] = useState(false);

  // --- State: Settings ---
  const [aspectRatio, setAspectRatio] = useState<string>("16:9");
  const [videoSpeed, setVideoSpeed] = useState(1.0);
  const [audioSpeed, setAudioSpeed] = useState(1.0);

  // Effects
  const [blurEnabled, setBlurEnabled] = useState(true);
  const [blurPosition, setBlurPosition] = useState(80);
  const [blurThickness, setBlurThickness] = useState(15);
  const [blurIntensity, setBlurIntensity] = useState(20);

  const [logoPosition, setLogoPosition] = useState('Top Right');
  const [subtitleStyle, setSubtitleStyle] = useState('akkhayar-outline');

  // Zoom Settings
  const [zoomEnabled, setZoomEnabled] = useState(true);
  const [zoomInterval, setZoomInterval] = useState(5);
  const [zoomDuration, setZoomDuration] = useState(3);

  // Recent-task restore: re-apply the recap prompt and aspect ratio from a previous task
  const handleRestoreRecap = (input: JsonValue) => {
    if (!input || typeof input !== 'object') return;
    if (typeof (input as JsonRecord).prompt === 'string') setAiPrompt((input as JsonRecord).prompt as string);
    if (typeof (input as JsonRecord).aspectRatio === 'string') setAspectRatio((input as JsonRecord).aspectRatio as string);
    setShowAIPrompt(true);
    setError(null);
  };

  // --- State: Playback & Processing ---
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [outputMimeType, setOutputMimeType] = useState<string>('video/webm');
  const [error, setError] = useState<string | null>(null);

  // --- Refs ---
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const helperCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const videoInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // --- Helpers ---
  const formatDurationFull = (seconds: number) => {
    if (!Number.isFinite(seconds)) return '00:00:00.000';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
  };

  const formatTimeSimple = (seconds: number) => {
      const m = Math.floor(seconds / 60);
      const s = Math.floor(seconds % 60);
      return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // --- File Handling ---
  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('video/')) { setError('Please choose a supported video file.'); return; }
      if (file.size > 100 * 1024 * 1024) { setError('Video is too large (maximum 100MB).'); return; }
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      if (resultUrl) { URL.revokeObjectURL(resultUrl); setResultUrl(null); }
      const url = URL.createObjectURL(file);
      setVideoFile(file);
      setVideoUrl(url);
      setResultUrl(null);
      setVideoSpeed(1.0);
    }
  };

  const handleVideoUrl = async () => {
    const source = videoSourceUrl.trim();
    if (!source) return;
    try {
      setError(null);
      const response = await fetch(source);
      if (!response.ok) throw new Error('Could not load this video URL. Use a public direct video link.');
      const blob = await response.blob();
      if (!blob.type.startsWith('video/')) throw new Error('The URL did not return a video file.');
      const file = new File([blob], 'recap-source.mp4', { type: blob.type || 'video/mp4' });
      if (file.size > 100 * 1024 * 1024) throw new Error('Video is too large (maximum 100MB).');
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      setVideoFile(file);
      setVideoUrl(URL.createObjectURL(file));
      setResultUrl(null);
      setVideoSpeed(1.0);
    } catch (err: unknown) {
      setError((err as { message?: string })?.message || 'Could not load the video URL.');
    }
  };

  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('audio/')) { setError('Please choose a supported audio file.'); return; }
      if (file.size > 50 * 1024 * 1024) { setError('Audio is too large (maximum 50MB).'); return; }
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      const url = URL.createObjectURL(file);
      setAudioFile(file);
      setAudioUrl(url);
      setAudioSpeed(1.0);
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

  useEffect(() => () => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    if (logoUrl) URL.revokeObjectURL(logoUrl);
    if (resultUrl) URL.revokeObjectURL(resultUrl);
  }, [videoUrl, audioUrl, logoUrl, resultUrl]);

  // --- AI Video Generation ---
  useEffect(() => {
    const checkApiKey = async () => {
      const selected = await (window as unknown as { aistudio?: { hasSelectedApiKey?: () => boolean | Promise<boolean>; openSelectKey?: () => void | Promise<void> } }).aistudio?.hasSelectedApiKey?.();
      if (selected) {
        setHasKey(true);
      } else {
        let fallbackKey = '';
        try {
          fallbackKey = localStorage.getItem('VITE_GEMINI_API_KEY') || (import.meta.env.VITE_GEMINI_API_KEY as string);
        } catch (e) {}
        setHasKey(!!fallbackKey);
      }
    };
    checkApiKey();
  }, []);

  const handleOpenKey = async () => {
    if ((window as unknown as { aistudio?: { hasSelectedApiKey?: () => boolean | Promise<boolean>; openSelectKey?: () => void | Promise<void> } }).aistudio?.openSelectKey) {
      await (window as unknown as { aistudio?: { hasSelectedApiKey?: () => boolean | Promise<boolean>; openSelectKey?: () => void | Promise<void> } }).aistudio?.openSelectKey();
      setHasKey(true);
    } else {
      setHasKey(true);
    }
  };

  const generateAIVideo = async () => {
    if (!aiPrompt.trim()) return;
    setIsGeneratingVideo(true);
    setError(null);

    try {
      let key = '';
      try {
        key = localStorage.getItem('VITE_GEMINI_API_KEY') || (import.meta.env.VITE_GEMINI_API_KEY as string) || (typeof process !== 'undefined' ? (process.env.GEMINI_API_KEY || process.env.API_KEY) : '');
      } catch (e) {}

      if (!key) throw new Error("API Key is missing. Please select one.");

      const ai = new GoogleGenAI({ apiKey: key });
      const fullPrompt = `${aiPrompt}. Ensure high cinematic quality, slow camera movement, and natural motion dynamics.`;

      let operation = await ai.models.generateVideos({
        model: 'veo-3.1-lite-generate-preview',
        prompt: fullPrompt,
        config: {
          numberOfVideos: 1,
          resolution: '720p',
          aspectRatio: aspectRatio === '9:16' ? '9:16' : '16:9'
        }
      });

      while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        operation = await ai.operations.getVideosOperation({ operation: operation });
      }

      const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
      if (downloadLink) {
        const response = await fetch(`${downloadLink}&key=${key}`);
        if (!response.ok) throw new Error("Failed to download video");
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);

        if (videoUrl) URL.revokeObjectURL(videoUrl);
        setVideoFile(new File([blob], "ai_generated.mp4", { type: "video/mp4" }));
        setVideoUrl(url);
        setResultUrl(null);
        setVideoSpeed(1.0);
        setShowAIPrompt(false);

         const currentUser = auth.currentUser;
         if (currentUser) {
           await logGeneration(
             currentUser.uid,
             currentUser.email || '',
             'movierecap',
             { prompt: aiPrompt, aspectRatio },
             { downloadLink: downloadLink?.substring(0, 150) + "..." }
           );
           window.dispatchEvent(
             new CustomEvent('lumini:taskLogged', {
               detail: { module: 'movierecap', input: { prompt: aiPrompt, aspectRatio } },
             })
           );
           setRefreshTrigger(prev => prev + 1);
         }
      }
    } catch (err: unknown) {
      setError((err as { message?: string })?.message || "Video generation failed");
    } finally {
      setIsGeneratingVideo(false);
    }
  };

  // --- Playback Logic ---
  const togglePlayback = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
        if (audioRef.current) audioRef.current.pause();
      } else {
        if (audioRef.current) {
            const syncedAudioTime = (videoRef.current.currentTime / videoSpeed) * audioSpeed;
            if (Number.isFinite(syncedAudioTime)) {
               audioRef.current.currentTime = syncedAudioTime;
            }
            audioRef.current.play().catch(() => {});
        }
        videoRef.current.play().catch(() => {});
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
          audioRef.current.currentTime = syncedAudioTime;
      }
  };

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = videoSpeed;
    if (audioRef.current) audioRef.current.playbackRate = audioSpeed;
  }, [videoSpeed, audioSpeed]);

  useEffect(() => {
    const video = videoRef.current;
    const onEnded = () => setIsPlaying(false);
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
          const progress = timeInInterval / safeDuration;
          scale = 1.0 + (Math.sin(progress * Math.PI) * 0.15);
      }
    }

    ctx.save();
    ctx.translate(width/2, height/2);
    ctx.scale(scale, scale);
    ctx.translate(-width/2, -height/2);
    ctx.drawImage(video, offsetX, offsetY, drawW, drawH);
    ctx.restore();

    if (blurEnabled) {
      const bY = (blurPosition / 100) * height;
      const bH = (blurThickness / 100) * height;
      if (!helperCanvasRef.current) helperCanvasRef.current = document.createElement('canvas');
      const helper = helperCanvasRef.current;

      if (helper) {
        const scaleFactor = 0.1;
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
           hCtx.filter = `blur(${blurIntensity * scaleFactor}px)`;
           hCtx.drawImage(video, offsetX * scaleFactor, offsetY * scaleFactor, drawW * scaleFactor, drawH * scaleFactor);
           hCtx.filter = 'none';

           ctx.save();
           ctx.beginPath();
           ctx.rect(0, bY - bH/2, width, bH);
           ctx.clip();
           ctx.drawImage(helper, 0, 0, smallW, smallH, 0, 0, width, height);
           ctx.fillStyle = 'rgba(0,0,0,0.4)';
           ctx.fillRect(0, bY - bH/2, width, bH);
           ctx.strokeStyle = 'rgba(255,255,255,0.2)';
           ctx.lineWidth = 1;
           ctx.beginPath();
           ctx.moveTo(0, bY - bH/2);
           ctx.lineTo(width, bY - bH/2);
           ctx.moveTo(0, bY + bH/2);
           ctx.lineTo(width, bY + bH/2);
           ctx.stroke();
           ctx.restore();
        }
      }
    }

    if (logoImage) {
      const lSize = Math.min(width, height) * 0.15;
      const pad = 20;
      let lx = pad, ly = pad;
      if (logoPosition.includes('Right')) lx = width - lSize - pad;
      if (logoPosition.includes('Bottom')) ly = height - lSize - pad;
      ctx.globalAlpha = 0.9;
      ctx.drawImage(logoImage, lx, ly, lSize, lSize);
      ctx.globalAlpha = 1.0;
    }

  }, [blurEnabled, blurPosition, blurThickness, blurIntensity, zoomEnabled, zoomInterval, zoomDuration, logoImage, logoPosition]);

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
    return () => { if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current); }
  }, [aspectRatio, renderFrame]);

  const handleGenerate = async () => {
    if (!videoUrl || !videoRef.current) return;
    if (!Number.isFinite(videoDuration) || videoDuration <= 0) { setError('Video metadata is not ready yet. Please wait and try again.'); return; }
    if (!onSpendCredits(CREDIT_COSTS[ContentType.MOVIE_RECAP])) { setError("Insufficient credits!"); return; }

    setIsProcessing(true);
    setProgress(0);
    setError(null);
    setIsPlaying(false);
    videoRef.current.pause();
    if (audioRef.current) audioRef.current.pause();

    try {
        if (!videoFile) throw new Error('Please select a video file first.');
        setProgress(1);
        if (!isMediaWorkerConfigured()) {
          throw new Error('Server media worker is not configured. Set VITE_MEDIA_WORKER_URL and restart the app.');
        }
        if (!(await isMediaWorkerAvailable())) {
          throw new Error('Server media worker is unavailable. Please start the AWS worker and try again.');
        }
        {
          setProgress(3);
          setOutputMimeType('video/mp4');
          const uploadedVideo = await uploadMedia(videoFile, (value) => setProgress(Math.min(20, value * 0.2)));
          let uploadedAudio;
          if (audioFile) {
            uploadedAudio = await uploadMedia(audioFile, (value) => setProgress(20 + Math.min(15, value * 0.15)));
          }
          const job = await createSyncJob(uploadedVideo.fileId, {
            videoSpeed,
            audioSpeed,
            aspectRatio: aspectRatio as '16:9' | '9:16' | '1:1' | '4:5',
            blurEnabled,
            blurPosition,
            blurThickness,
            blurIntensity,
          }, uploadedAudio?.fileId);
          const completed = await waitForSyncJob(job.jobId, (value) => setProgress(35 + Math.round(value * 0.65)));
          if (!completed.outputFileId) throw new Error('Media worker returned no output file.');
          if (resultUrl) URL.revokeObjectURL(resultUrl);
          setResultUrl(getOutputUrl(completed.outputFileId));
          setIsProcessing(false);
          return;
        }
        setProgress(5);
        const canvas = document.createElement('canvas');
        let w = 1920, h = 1080;
        if (aspectRatio === "9:16") { w = 1080; h = 1920; }
        else if (aspectRatio === "1:1") { w = 1080; h = 1080; }
        else if (aspectRatio === "4:5") { w = 1080; h = 1350; }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) throw new Error("Context failed");

        const audioCtx = new AudioContext();
        const destNode = audioCtx.createMediaStreamDestination();

        let audioEl: HTMLAudioElement | null = null;
        if (audioUrl) {
           audioEl = new Audio(audioUrl);
           audioEl.crossOrigin = "anonymous";
           audioEl.playbackRate = audioSpeed;
           await new Promise<void>((resolve, reject) => {
             const timer = window.setTimeout(() => reject(new Error('Audio could not be loaded within 15 seconds.')), 15000);
             audioEl!.oncanplaythrough = () => { window.clearTimeout(timer); resolve(); };
             audioEl!.onerror = () => { window.clearTimeout(timer); reject(new Error('Could not decode the selected audio.')); };
             audioEl!.src = audioUrl;
           });
           const source = audioCtx.createMediaElementSource(audioEl);
           source.connect(destNode);
           audioEl.play();
        }

        const stream = canvas.captureStream(30);
        if (audioUrl) {
            const audioTrack = destNode.stream.getAudioTracks()[0];
            if (audioTrack) stream.addTrack(audioTrack);
        }

        const chunks: Blob[] = [];
        let mimeType = 'video/webm;codecs=vp9';
        if (MediaRecorder.isTypeSupported('video/mp4')) mimeType = 'video/mp4';
        else if (MediaRecorder.isTypeSupported('video/webm;codecs=h264')) mimeType = 'video/webm;codecs=h264';
        setOutputMimeType(mimeType);

        const recorder = new MediaRecorder(stream, { mimeType });
        recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
        recorder.onstop = () => {
             const blob = new Blob(chunks, { type: mimeType });
             stream.getTracks().forEach(track => track.stop());
             setResultUrl(URL.createObjectURL(blob));
             setIsProcessing(false);
             audioCtx.close();
             if (audioEl) {
               audioEl.pause();
               audioEl.src = "";
             }
        };
        recorder.start();

        const videoEl = document.createElement('video');
        videoEl.src = videoUrl;
        videoEl.muted = true;
        await new Promise<void>((resolve, reject) => {
          const timer = window.setTimeout(() => reject(new Error('Video could not be loaded within 15 seconds.')), 15000);
          videoEl.onloadedmetadata = () => { window.clearTimeout(timer); setProgress(10); resolve(); };
          videoEl.oncanplay = () => { setProgress(Math.max(10, progress)); };
          videoEl.onerror = () => reject(new Error('Could not decode the selected video.'));
        });
        await videoEl.play();
        setProgress(12);
        videoEl.playbackRate = videoSpeed;

        const totalDur = videoEl.duration / videoSpeed;
        const startTime = Date.now();

        const processLoop = () => {
            if (videoEl.ended || videoEl.currentTime >= videoEl.duration - 0.05) { recorder.stop(); return; }
            renderFrame(ctx, videoEl, w, h, videoEl.currentTime * 1000);
            const elapsed = (Date.now() - startTime) / 1000;
            setProgress(Math.min(99, Math.max(12, Math.floor(12 + (elapsed / totalDur) * 87))));
            requestAnimationFrame(processLoop);
        };
        processLoop();

    } catch (err: unknown) {
        setError("Generation Failed: " + (err as { message?: string })?.message);
        setIsProcessing(false);
    }
  };

  const videoOutputDur = videoDuration > 0 ? videoDuration / videoSpeed : 0;
  const audioOutputDur = audioDuration > 0 ? audioDuration / audioSpeed : 0;

  return (
    <div className="module-page max-w-4xl mx-auto pb-8">
      <AnimatePresence>{isProcessing && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-[#09090b]"><LoadingSpinner size="lg" showLabel={false} /></motion.div>}</AnimatePresence>
      <div className="mb-5"><h1 className="text-xl font-bold text-slate-900 dark:text-white !mb-1">Movie Studio</h1><p className="text-xs text-slate-500 dark:text-zinc-400">Upload a video, choose a subtitle style, then render your Burmese recap.</p></div>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.15fr] gap-4">
        <div className="space-y-3">
          <section className="rounded-2xl bg-white dark:bg-[#0c0c0e] border border-gray-200 dark:border-white/10 p-4 space-y-3"><div className="flex items-center justify-between"><h2 className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-zinc-300">1. Video source</h2>{videoFile && <span className="text-[10px] text-emerald-500 font-semibold">Ready</span>}</div><button onClick={() => videoInputRef.current?.click()} className="w-full py-3 rounded-xl border border-dashed border-gray-300 dark:border-white/15 hover:border-indigo-400 hover:bg-indigo-500/5 text-[11px] font-bold text-slate-500 transition-all">{videoFile ? videoFile.name : 'Upload video file'}</button><div className="flex gap-2"><input value={videoSourceUrl} onChange={(e) => setVideoSourceUrl(e.target.value)} placeholder="Or paste a public video URL" className="min-w-0 flex-1 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 px-3 py-2 text-xs outline-none focus:border-indigo-400" /><button onClick={handleVideoUrl} disabled={!videoSourceUrl.trim()} className="px-3 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-black text-[10px] font-bold disabled:opacity-40">Load</button></div><input type="file" ref={videoInputRef} accept="video/*" onChange={handleVideoUpload} className="hidden" /></section>
          <section className="rounded-2xl bg-white dark:bg-[#0c0c0e] border border-gray-200 dark:border-white/10 p-4 space-y-3"><div className="flex items-center justify-between"><h2 className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-zinc-300">2. Subtitle font</h2><span className="text-[10px] text-indigo-500 font-semibold">Akkhayar 21</span></div><div className="grid grid-cols-2 gap-2">{[['akkhayar-outline', 'White + outline'], ['akkhayar-yellow', 'Yellow highlight'], ['akkhayar-box', 'Dark subtitle box'], ['akkhayar-clean', 'Clean white']].map(([value, label]) => <button key={value} onClick={() => setSubtitleStyle(value)} className={`rounded-xl border px-3 py-3 text-left transition-all ${subtitleStyle === value ? 'border-indigo-500 bg-indigo-500/10' : 'border-gray-200 dark:border-white/10 hover:border-indigo-300'}`}><span className={`block text-base ${value === 'akkhayar-yellow' ? 'text-amber-400' : 'text-slate-900 dark:text-white'}`} style={{ fontFamily: 'Akkhayar21, sans-serif' }}>မြန်မာစာ</span><span className="block mt-1 text-[9px] text-slate-500 dark:text-zinc-400">{label}</span></button>)}</div></section>
          <section className="rounded-2xl bg-white dark:bg-[#0c0c0e] border border-gray-200 dark:border-white/10 p-4 space-y-3"><div className="flex items-center justify-between"><h2 className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-zinc-300">3. Blur strip</h2><input type="checkbox" checked={blurEnabled} onChange={(e) => setBlurEnabled(e.target.checked)} className="accent-indigo-500" /></div>{blurEnabled && <div className="grid grid-cols-3 gap-3"><label className="text-[9px] text-slate-500 dark:text-zinc-400"><span className="flex justify-between mb-1"><span>Position</span><span>{blurPosition}%</span></span><input type="range" min="0" max="100" value={blurPosition} onChange={(e) => setBlurPosition(Number(e.target.value))} className="w-full accent-indigo-500" /></label><label className="text-[9px] text-slate-500 dark:text-zinc-400"><span className="flex justify-between mb-1"><span>Height</span><span>{blurThickness}%</span></span><input type="range" min="5" max="50" value={blurThickness} onChange={(e) => setBlurThickness(Number(e.target.value))} className="w-full accent-indigo-500" /></label><label className="text-[9px] text-slate-500 dark:text-zinc-400"><span className="flex justify-between mb-1"><span>Strength</span><span>{blurIntensity}%</span></span><input type="range" min="0" max="50" value={blurIntensity} onChange={(e) => setBlurIntensity(Number(e.target.value))} className="w-full accent-indigo-500" /></label></div>}</section>
          <section className="rounded-2xl bg-white dark:bg-[#0c0c0e] border border-gray-200 dark:border-white/10 p-4 space-y-3"><h2 className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-zinc-300">4. Aspect ratio</h2><div className="grid grid-cols-4 gap-2">{['16:9', '9:16', '1:1', '4:5'].map((ratio) => <button key={ratio} onClick={() => setAspectRatio(ratio)} className={`rounded-lg py-2 text-[10px] font-bold ${aspectRatio === ratio ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-white/5 text-slate-500'}`}>{ratio}</button>)}</div></section>
        </div>
        <div className="space-y-3"><div className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden shadow-xl border border-gray-200 dark:border-white/10">{videoUrl ? <><canvas ref={previewCanvasRef} className="max-w-full max-h-full object-contain mx-auto" /><button onClick={togglePlayback} className="absolute inset-0 m-auto w-12 h-12 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-xl">{isPlaying ? 'Ⅱ' : '▶'}</button></> : <div className="flex items-center justify-center h-full text-[11px] text-zinc-500">Your video preview will appear here</div>}</div><button onClick={handleGenerate} disabled={isProcessing || !videoUrl} className="w-full rounded-xl py-3 bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold disabled:opacity-40 disabled:cursor-not-allowed">{isProcessing ? `Rendering ${progress}%` : 'Generate Burmese recap'}</button><video ref={videoRef} src={videoUrl || ''} className="hidden" playsInline muted onLoadedMetadata={onVideoLoaded} /><audio ref={audioRef} src={audioUrl || ''} className="hidden" onLoadedMetadata={onAudioLoaded} />{resultUrl && <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-3"><div className="flex items-center justify-between mb-2"><span className="text-[11px] font-bold text-emerald-500">Recap ready</span><a href={resultUrl} download={`recap_${Date.now()}.mp4`} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-[10px] font-bold text-white">Download</a></div><video src={resultUrl} controls className="w-full rounded-xl bg-black aspect-video" /></div>}{error && <div className="rounded-xl bg-rose-500/10 px-3 py-2 text-center text-[10px] font-bold text-rose-500">{error}</div>}</div>
      </div><RecentHistory moduleName="movierecap" onRestore={handleRestoreRecap} /><div className="mt-3" /><ModuleLogHistory moduleName="movierecap" refreshTrigger={refreshTrigger} />
    </div>
  );
};

export default MovieRecap;
