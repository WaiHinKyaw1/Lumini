
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";
import { CREDIT_COSTS, ContentType } from '../types';
import { auth } from '../services/firebase';
import { logGeneration } from '../services/supabase';
import { ModuleLogHistory } from '../components/ModuleLogHistory';
import { RecentHistory } from '../components/RecentHistory';

interface MovieRecapProps {
  onSpendCredits: (amount: number) => boolean;
}

const MovieRecap: React.FC<MovieRecapProps> = ({ onSpendCredits }) => {
  // --- State: Media ---
  const [videoFile, setVideoFile] = useState<File | null>(null);
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
  
  // Zoom Settings
  const [zoomEnabled, setZoomEnabled] = useState(true);
  const [zoomInterval, setZoomInterval] = useState(5); 
  const [zoomDuration, setZoomDuration] = useState(3); 

  // Recent-task restore: re-apply the recap prompt and aspect ratio from a previous task
  const handleRestoreRecap = (input: any) => {
    if (!input || typeof input !== 'object') return;
    if (typeof input.prompt === 'string') setAiPrompt(input.prompt);
    if (typeof input.aspectRatio === 'string') setAspectRatio(input.aspectRatio);
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
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      const url = URL.createObjectURL(file);
      setVideoFile(file);
      setVideoUrl(url);
      setResultUrl(null);
      setVideoSpeed(1.0);
    }
  };

  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
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

  // --- AI Video Generation ---
  useEffect(() => {
    const checkApiKey = async () => {
      const selected = await (window as any).aistudio?.hasSelectedApiKey?.();
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
    if ((window as any).aistudio?.openSelectKey) {
      await (window as any).aistudio?.openSelectKey();
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
    } catch (err: any) {
      setError(err.message || "Video generation failed");
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
    if (!onSpendCredits(CREDIT_COSTS[ContentType.MOVIE_RECAP])) { setError("Insufficient credits!"); return; }

    setIsProcessing(true);
    setProgress(0);
    setError(null);
    setIsPlaying(false);
    videoRef.current.pause();
    if (audioRef.current) audioRef.current.pause();

    try {
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
           await new Promise(r => { 
             audioEl!.oncanplaythrough = r; 
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
        await videoEl.play();
        videoEl.playbackRate = videoSpeed;

        const totalDur = videoEl.duration / videoSpeed;
        const startTime = Date.now();

        const processLoop = () => {
            if (videoEl.ended) { recorder.stop(); return; }
            renderFrame(ctx, videoEl, w, h, videoEl.currentTime * 1000);
            const elapsed = (Date.now() - startTime) / 1000;
            setProgress(Math.min(100, Math.floor((elapsed / totalDur) * 100)));
            requestAnimationFrame(processLoop);
        };
        processLoop();

    } catch (err: any) {
        setError("Generation Failed: " + err.message);
        setIsProcessing(false);
    }
  };

  const videoOutputDur = videoDuration > 0 ? videoDuration / videoSpeed : 0;
  const audioOutputDur = audioDuration > 0 ? audioDuration / audioSpeed : 0;

  return (
    <div className="max-w-4xl mx-auto pb-20">
      <AnimatePresence>
        {isProcessing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 backdrop-blur-xl"
          >
            <div className="w-full max-w-md px-6 text-center space-y-8">
              <div className="relative mx-auto w-32 h-32">
                <motion.div 
                  className="absolute inset-0 border-4 border-indigo-500/20 rounded-full"
                  animate={{ scale: [1, 1.1, 1], opacity: [0.2, 0.5, 0.2] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
                <motion.div 
                   className="absolute inset-0 border-t-4 border-indigo-500 rounded-full shadow-[0_0_20px_rgba(79,70,229,0.5)]"
                   animate={{ rotate: 360 }}
                   transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-2xl font-black text-white">{progress}%</span>
                </div>
              </div>

              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-white tracking-tight">Synthesizing Recap</h2>
                <p className="text-zinc-400 text-sm">Our AI is processing cinematic effects and synchronizing audio channels.</p>
              </div>

              <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden border border-white/5 p-0.5">
                <motion.div 
                  className="h-full bg-indigo-500 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                />
              </div>

              <div className="flex justify-center gap-4 pt-4">
                 {['Analyzing Frames', 'Applying Motion', 'Finalizing Render'].map((step, i) => (
                   <motion.div 
                    key={step}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: progress > (i * 30) ? 1 : 0.4, y: 0 }}
                    className="text-[8px] font-black uppercase tracking-widest text-indigo-400"
                   >
                     {step}
                   </motion.div>
                 ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-600/20">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 21h16a1 1 0 001-1V4a1 1 0 00-1-1H4a1 1 0 00-1 1v16a1 1 0 001 1z" />
          </svg>
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Movie Recap Studio</h1>
          <p className="text-slate-500 dark:text-zinc-300 text-xs font-medium">Professional Sync & Effects • {CREDIT_COSTS[ContentType.MOVIE_RECAP]} Credits</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-6">
            <div className="glass p-4 rounded-2xl border border-white/5 space-y-4">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-zinc-400">Source Selection</h3>
                <div className="grid grid-cols-2 gap-4">
                    <button onClick={() => videoInputRef.current?.click()} className={`p-4 rounded-2xl border border-dashed flex flex-col items-center gap-2 transition-all ${videoFile ? 'border-indigo-500 bg-indigo-500/5' : 'border-slate-300 dark:border-white/10 hover:border-indigo-400 hover:bg-indigo-500/5'}`}>
                        <svg className={`w-6 h-6 ${videoFile ? 'text-indigo-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                        <span className={`text-[10px] font-bold uppercase truncate max-w-full ${videoFile ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500'}`}>{videoFile ? 'Video Loaded' : 'Add Video'}</span>
                    </button>
                    <button onClick={() => audioInputRef.current?.click()} className={`p-4 rounded-2xl border border-dashed flex flex-col items-center gap-2 transition-all ${audioFile ? 'border-emerald-500 bg-emerald-500/5' : 'border-slate-300 dark:border-white/10 hover:border-emerald-400 hover:bg-emerald-500/5'}`}>
                        <svg className={`w-6 h-6 ${audioFile ? 'text-emerald-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" /></svg>
                        <span className={`text-[10px] font-bold uppercase truncate max-w-full ${audioFile ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'}`}>{audioFile ? 'Audio Loaded' : 'Add Audio'}</span>
                    </button>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                    <button 
                      onClick={() => setShowAIPrompt(!showAIPrompt)} 
                      className="flex items-center justify-center gap-2 py-2 rounded-xl border border-indigo-500/20 bg-indigo-500/5 hover:bg-indigo-500/10 text-indigo-400 text-[10px] font-bold uppercase transition-all"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                      {showAIPrompt ? 'Close AI' : 'Generate with AI'}
                    </button>
                    <div className="flex gap-2">
                         <button onClick={() => logoInputRef.current?.click()} className="flex-1 py-2 border border-dashed border-slate-300 dark:border-white/10 rounded-xl text-[10px] font-bold text-slate-500 hover:bg-white/5 transition-all">
                            {logoFile ? 'Change Logo' : 'Add Overlay'}
                         </button>
                         {logoFile && <button onClick={() => {setLogoFile(null); setLogoImage(null); setLogoUrl(null);}} className="px-3 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-rose-500 hover:text-white text-slate-500 transition-all"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>}
                    </div>
                </div>

                <AnimatePresence>
                  {showAIPrompt && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden space-y-4"
                    >
                      {!hasKey ? (
                        <div className="p-4 rounded-xl bg-orange-500/5 border border-orange-500/20 text-center space-y-3">
                          <p className="text-[10px] font-bold text-orange-400 uppercase tracking-widest">API Key required for Veo generation</p>
                          <button onClick={handleOpenKey} className="px-4 py-2 bg-orange-500 text-white rounded-lg text-[10px] font-black uppercase hover:bg-orange-600 transition-all">Select API Key</button>
                        </div>
                      ) : (
                        <>
                          <textarea 
                            value={aiPrompt}
                            onChange={(e) => setAiPrompt(e.target.value)}
                            placeholder="Describe your scene... (e.g., A cinematic wide shot of a futuristic neon city at night, heavy rain)"
                            className="w-full h-24 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl p-3 text-xs outline-none focus:ring-1 focus:ring-indigo-500 resize-none text-slate-700 dark:text-zinc-200"
                          />
                          <button 
                            onClick={generateAIVideo}
                            disabled={isGeneratingVideo || !aiPrompt.trim()}
                            className={`w-full py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${isGeneratingVideo || !aiPrompt.trim() ? 'bg-slate-200 dark:bg-white/5 text-slate-400' : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20'}`}
                          >
                            {isGeneratingVideo ? 'Consulting Veo Model...' : 'Synthesis with AI'}
                          </button>
                        </>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                <input type="file" ref={videoInputRef} accept="video/*" onChange={handleVideoUpload} className="hidden" />
                <input type="file" ref={audioInputRef} accept="audio/*" onChange={handleAudioUpload} className="hidden" />
                <input type="file" ref={logoInputRef} accept="image/*" onChange={handleLogoUpload} className="hidden" />
            </div>

            <div className="glass p-4 rounded-2xl border border-white/5 space-y-4">
                <div className="flex justify-between items-center">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-zinc-400">Visual Controls</h3>
                    <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)} className="bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg text-[9px] font-bold px-2 py-1 text-slate-700 dark:text-white outline-none">
                        <option value="16:9">YouTube (16:9)</option>
                        <option value="9:16">TikTok (9:16)</option>
                        <option value="1:1">Square (1:1)</option>
                        <option value="4:5">Portrait (4:5)</option>
                    </select>
                </div>
                
                {/* Zoom Effect */}
                <div className="space-y-3">
                     <div className="flex items-center justify-between">
                         <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Cinematic Zoom</span>
                         <input type="checkbox" checked={zoomEnabled} onChange={e => setZoomEnabled(e.target.checked)} className="accent-indigo-500" />
                     </div>
                     {zoomEnabled && (
                        <div className="grid grid-cols-2 gap-4 pl-4 border-l-2 border-indigo-500/20 py-1">
                            <div>
                                <div className="flex justify-between text-[9px] font-bold text-slate-400 mb-2 uppercase"><span>Rate</span><span>{zoomInterval}s</span></div>
                                <input type="range" min="1" max="10" step="1" value={zoomInterval} onChange={(e) => setZoomInterval(Number(e.target.value))} className="w-full h-1 bg-slate-200 dark:bg-white/10 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
                            </div>
                            <div>
                                <div className="flex justify-between text-[9px] font-bold text-slate-400 mb-2 uppercase"><span>Size</span><span>{zoomDuration}s</span></div>
                                <input type="range" min="1" max="10" step="1" value={zoomDuration} onChange={(e) => setZoomDuration(Number(e.target.value))} className="w-full h-1 bg-slate-200 dark:bg-white/10 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
                            </div>
                        </div>
                     )}
                </div>

                {/* Blur Strip */}
                <div className="space-y-3 pt-2 border-t border-white/5">
                     <div className="flex items-center justify-between">
                         <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Sub-Text Blur Strip</span>
                         <input type="checkbox" checked={blurEnabled} onChange={e => setBlurEnabled(e.target.checked)} className="accent-indigo-500" />
                     </div>
                     {blurEnabled && (
                        <div className="grid grid-cols-3 gap-3 pl-4 border-l-2 border-indigo-500/20 py-1">
                            <div>
                                <div className="flex justify-between text-[9px] font-bold text-slate-400 mb-2 uppercase"><span>Pos</span><span>{blurPosition}%</span></div>
                                <input type="range" min="0" max="100" value={blurPosition} onChange={(e) => setBlurPosition(Number(e.target.value))} className="w-full h-1 bg-slate-200 dark:bg-white/10 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
                            </div>
                            <div>
                                <div className="flex justify-between text-[9px] font-bold text-slate-400 mb-2 uppercase"><span>H</span><span>{blurThickness}%</span></div>
                                <input type="range" min="5" max="50" value={blurThickness} onChange={(e) => setBlurThickness(Number(e.target.value))} className="w-full h-1 bg-slate-200 dark:bg-white/10 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
                            </div>
                            <div>
                                <div className="flex justify-between text-[9px] font-bold text-slate-400 mb-2 uppercase"><span>Strength</span><span>{blurIntensity}px</span></div>
                                <input type="range" min="0" max="50" value={blurIntensity} onChange={(e) => setBlurIntensity(Number(e.target.value))} className="w-full h-1 bg-slate-200 dark:bg-white/10 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
                            </div>
                        </div>
                     )}
                </div>
            </div>

            <div className="glass p-4 rounded-2xl border border-white/5 space-y-4">
                <div className="flex justify-between items-center">
                    <h3 className="text-[10px] font-black uppercase text-slate-400 dark:text-zinc-400 tracking-[0.2em]">Sync Tuning</h3>
                    {audioDuration > 0 && <span className="text-[9px] font-black text-indigo-400 font-mono tracking-widest uppercase">Target: {formatDurationFull(audioOutputDur)}</span>}
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-4 p-4 bg-slate-50 dark:bg-black/20 rounded-xl border border-indigo-500/10">
                        <div className="text-[9px] font-black text-slate-400 uppercase text-center tracking-widest">Video Warp</div>
                        <input type="number" step="0.001" value={videoSpeed} onChange={e => setVideoSpeed(Number(e.target.value))} className="w-full bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl py-2 px-3 text-sm font-black text-indigo-600 dark:text-indigo-400 text-center outline-none" />
                        <div className="text-center">
                            <div className="text-[10px] font-black text-indigo-500 font-mono tabular-nums">{formatDurationFull(videoOutputDur)}</div>
                        </div>
                        <button onClick={() => {if (videoDuration && audioDuration) setVideoSpeed(Number((videoDuration / (audioDuration / audioSpeed)).toFixed(4)))}} className="w-full py-2 rounded-lg bg-indigo-600 text-white text-[9px] font-black uppercase tracking-widest hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-600/20 active:scale-95">Match to Audio</button>
                    </div>
                    <div className="space-y-4 p-4 bg-slate-50 dark:bg-black/20 rounded-xl border border-rose-500/10">
                        <div className="text-[9px] font-black text-slate-400 uppercase text-center tracking-widest">Audio Warp</div>
                        <input type="number" step="0.001" value={audioSpeed} onChange={e => setAudioSpeed(Number(e.target.value))} className="w-full bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl py-2 px-3 text-sm font-black text-rose-500 dark:text-rose-400 text-center outline-none" />
                        <div className="text-center">
                            <div className="text-[10px] font-black text-rose-500 font-mono tabular-nums">{formatDurationFull(audioOutputDur)}</div>
                        </div>
                        <button onClick={() => {if (videoDuration && audioDuration) setAudioSpeed(Number((audioDuration / (videoDuration / videoSpeed)).toFixed(4)))}} className="w-full py-2 rounded-lg bg-rose-600 text-white text-[9px] font-black uppercase tracking-widest hover:bg-rose-500 transition-all shadow-lg shadow-rose-600/20 active:scale-95">Match to Video</button>
                    </div>
                </div>
            </div>
        </div>

        <div className="space-y-6">
            <div className="relative w-full aspect-video bg-black rounded-3xl overflow-hidden shadow-2xl border border-white/5 group">
                {videoUrl ? (
                     <>
                        <canvas ref={previewCanvasRef} className="max-w-full max-h-full object-contain mx-auto" />
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none group-hover:bg-black/20 transition-all">
                            <button onClick={togglePlayback} className={`pointer-events-auto w-12 h-12 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-2xl shadow-indigo-600/50 hover:scale-110 active:scale-95 transition-all cursor-pointer ${isPlaying ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'}`}>
                                {isPlaying ? <svg className="w-5 h-5 transition-all" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg> : <svg className="w-5 h-5 ml-1 transition-all" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>}
                            </button>
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="flex items-center gap-3">
                                <span className="text-[10px] font-mono font-bold text-white tabular-nums">{formatTimeSimple(currentTime)}</span>
                                <div className="flex-1 relative h-1 flex items-center">
                                  <div className="absolute inset-0 bg-white/20 rounded-full" />
                                  <div className="absolute inset-y-0 left-0 bg-indigo-500 rounded-full" style={{ width: `${(currentTime / videoDuration) * 100}%` }} />
                                  <input type="range" min="0" max={videoDuration} step="0.001" value={currentTime} onChange={handleSeek} className="absolute inset-0 w-full opacity-0 cursor-pointer" />
                                </div>
                                <span className="text-[10px] font-mono font-bold text-zinc-400 tabular-nums">{formatTimeSimple(videoDuration)}</span>
                            </div>
                        </div>
                     </>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full">
                         <motion.div 
                          initial={{ scale: 0.9, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          className="w-16 h-16 bg-white/5 rounded-3xl flex items-center justify-center mb-4 border border-white/5"
                         >
                           <svg className="w-8 h-8 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                         </motion.div>
                         <p className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.4em]">Cinematic Preview</p>
                    </div>
                )}
            </div>

            <button onClick={handleGenerate} aria-label="Movie Recap ထုတ်လုပ်ရန်" disabled={isProcessing || !videoUrl} className={`w-full py-4 rounded-2xl text-[11px] font-black uppercase tracking-[0.3em] transition-all relative overflow-hidden shadow-2xl ${isProcessing || !videoUrl ? 'bg-slate-200 dark:bg-white/5 text-slate-400 cursor-not-allowed shadow-none' : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/30'}`}>
                {isProcessing ? `Rendering Synthesis ${progress}%` : 'Execute Master Render'}
                {!isProcessing && videoUrl && (
                   <motion.div 
                    className="absolute inset-0 bg-white/10" 
                    animate={{ x: ['-100%', '100%'] }} 
                    transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                   />
                )}
            </button>

            <video ref={videoRef} src={videoUrl || ""} className="hidden" playsInline muted={true} onLoadedMetadata={onVideoLoaded} />
            <audio ref={audioRef} src={audioUrl || ""} className="hidden" onLoadedMetadata={onAudioLoaded} />
            
            <AnimatePresence>
              {resultUrl && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="glass p-6 rounded-3xl border border-indigo-500/20 bg-indigo-500/5 shadow-2xl"
                >
                    <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-2">
                           <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                           <h3 className="text-xs font-black uppercase text-slate-900 dark:text-white tracking-widest">Synthesis Complete</h3>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => setResultUrl(null)} className="px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-white/5 text-slate-500 hover:text-rose-500 text-[10px] font-black uppercase transition-all">Discard</button>
                            <a href={resultUrl} download={`recap_${Date.now()}.${outputMimeType.includes('mp4') ? 'mp4' : 'webm'}`} className="px-4 py-1.5 rounded-lg bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 shadow-lg shadow-indigo-600/20 transition-all">Download</a>
                        </div>
                    </div>
                    <video src={resultUrl} controls className="w-full rounded-2xl bg-black aspect-video shadow-2xl border border-white/5" />
                </motion.div>
              )}
            </AnimatePresence>

            {error && (
              <motion.div 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-[10px] font-bold text-center uppercase tracking-widest"
              >
                {error}
              </motion.div>
            )}
        </div>
      </div>
      
      <RecentHistory moduleName="movierecap" onRestore={handleRestoreRecap} />
      <div className="mt-4" />
      <ModuleLogHistory moduleName="movierecap" refreshTrigger={refreshTrigger} />
    </div>
  );
};

export default MovieRecap;
