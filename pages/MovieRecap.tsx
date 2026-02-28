
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { CREDIT_COSTS, ContentType } from '../types';

interface MovieRecapProps {
  onSpendCredits: (amount: number) => boolean;
}

const MovieRecap: React.FC<MovieRecapProps> = ({ onSpendCredits }) => {
  // --- State: Media ---
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState<number>(0);
  
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioDuration, setAudioDuration] = useState<number>(0);

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoImage, setLogoImage] = useState<HTMLImageElement | null>(null);

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
  
  // Freeze Frame Settings
  const [freezeEnabled, setFreezeEnabled] = useState(true);
  const [freezeInterval, setFreezeInterval] = useState(5); 
  const [freezeDuration, setFreezeDuration] = useState(2); 

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
  const isMounted = useRef(true);
  
  const videoInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // --- Helpers ---
  const formatDurationFull = (seconds: number) => {
    if (!Number.isFinite(seconds) || seconds <= 0) return '00:00:00.000';
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
      setError(null);
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
      setError(null);
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
            audioRef.current.playbackRate = audioSpeed;
            audioRef.current.play().catch(() => {});
        }
        videoRef.current.playbackRate = videoSpeed;
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
      if (video && audioRef.current && isPlaying && audioFile) {
        const expectedAudioTime = (video.currentTime / videoSpeed) * audioSpeed;
        if (Math.abs(audioRef.current.currentTime - expectedAudioTime) > 0.3) {
           audioRef.current.currentTime = expectedAudioTime;
        }
      }
    };
    video?.addEventListener('ended', onEnded);
    video?.addEventListener('timeupdate', onTimeUpdate);
    return () => {
      video?.removeEventListener('ended', onEnded);
      video?.removeEventListener('timeupdate', onTimeUpdate);
    };
  }, [isPlaying, videoSpeed, audioSpeed, audioFile]);

  const renderFrame = useCallback((
    ctx: CanvasRenderingContext2D,
    video: HTMLVideoElement,
    width: number,
    height: number,
    timeMs: number
  ) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);

    const timeSec = timeMs / 1000;
    let scale = 1.0;
    let isFreezeActive = false;

    if (freezeEnabled) {
      const cycleTime = timeSec % Math.max(0.1, freezeInterval);
      if (cycleTime < freezeDuration) {
        isFreezeActive = true;
        const zoomProgress = cycleTime / freezeDuration;
        scale = 1.0 + (zoomProgress * 0.05); 
      }
    }

    if (video.videoWidth === 0 || video.videoHeight === 0) return;
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

    ctx.save();
    ctx.translate(width/2, height/2);
    ctx.scale(scale, scale);
    ctx.translate(-width/2, -height/2);
    ctx.drawImage(video, offsetX, offsetY, drawW, drawH);
    ctx.restore();

    // Visual indicator for freeze frame in preview
    if (isFreezeActive && !isProcessing) {
      ctx.save();
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.8)';
      ctx.lineWidth = 12;
      ctx.strokeRect(0, 0, width, height);
      
      // Badge
      ctx.fillStyle = 'rgba(99, 102, 241, 0.9)';
      const badgeW = 80;
      const badgeH = 24;
      ctx.beginPath();
      ctx.roundRect(width - badgeW - 15, 15, badgeW, badgeH, 6);
      ctx.fill();
      
      ctx.fillStyle = 'white';
      ctx.font = '900 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('FREEZE ACTIVE', width - badgeW/2 - 15, 15 + badgeH/2);
      ctx.restore();
    }

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

  }, [blurEnabled, blurPosition, blurThickness, blurIntensity, freezeEnabled, freezeInterval, freezeDuration, logoImage, logoPosition, isProcessing]);

  useEffect(() => {
    const loop = () => {
      if (previewCanvasRef.current && videoRef.current && videoRef.current.readyState >= 2) {
        const cvs = previewCanvasRef.current;
        const ctx = cvs.getContext('2d');
        const container = cvs.parentElement;
        if (!container) return;

        let w = 854, h = 480;
        if (aspectRatio === "9:16") { w = 480; h = 854; }
        else if (aspectRatio === "1:1") { w = 480; h = 480; }
        else if (aspectRatio === "4:5") { w = 480; h = 600; }
        
        const containerW = container.clientWidth;
        const containerH = container.clientHeight;
        const scale = Math.min(containerW / w, containerH / h);
        
        const finalW = Math.floor(w * scale);
        const finalH = Math.floor(h * scale);

        if (cvs.width !== w || cvs.height !== h) {
          cvs.width = w;
          cvs.height = h;
        }
        cvs.style.width = `${finalW}px`;
        cvs.style.height = `${finalH}px`;

        if (ctx) renderFrame(ctx, videoRef.current, w, h, videoRef.current.currentTime * 1000);
      }
      animationFrameRef.current = requestAnimationFrame(loop);
    };
    loop();
    return () => { if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current); }
  }, [aspectRatio, renderFrame]);

  // Cleanup object URLs to prevent memory leaks
  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      if (logoUrl) URL.revokeObjectURL(logoUrl);
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    };
  }, [videoUrl, audioUrl, logoUrl, resultUrl]);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const handleGenerate = async () => {
    if (!videoUrl || !videoRef.current) return;
    
    if (videoFile && videoFile.size > 50 * 1024 * 1024) {
      setError("Video is too large (Max 50MB). Please use a smaller file to prevent mobile browser crashes.");
      return;
    }

    if (!onSpendCredits(CREDIT_COSTS[ContentType.MOVIE_RECAP])) { setError("Insufficient credits!"); return; }

    setIsProcessing(true);
    setProgress(1); 
    setError(null);
    setIsPlaying(false);
    videoRef.current.pause();
    if (audioRef.current) audioRef.current.pause();

    let audioCtx: AudioContext | null = null;
    let videoEl: HTMLVideoElement | null = null;
    try {
        const canvas = document.createElement('canvas');
        // Reduced resolution to 480p to prevent mobile OOM crashes
        let w = 854, h = 480;
        if (aspectRatio === "9:16") { w = 480; h = 854; }
        else if (aspectRatio === "1:1") { w = 480; h = 480; }
        else if (aspectRatio === "4:5") { w = 480; h = 600; }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) throw new Error("Canvas context failed");

        audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 44100 });
        if (audioCtx.state === 'suspended') await audioCtx.resume();
        
        const destNode = audioCtx.createMediaStreamDestination();
        let audioEl: HTMLAudioElement | null = null;

        if (audioUrl) {
           audioEl = new Audio(audioUrl);
           audioEl.crossOrigin = "anonymous";
           audioEl.playbackRate = audioSpeed; 
           await new Promise(r => { 
             audioEl!.oncanplaythrough = r; 
             audioEl!.src = audioUrl; 
             audioEl!.load();
           });
           const source = audioCtx.createMediaElementSource(audioEl);
           source.connect(destNode);
        }

        const stream = canvas.captureStream(30);
        if (audioUrl) {
            const audioTrack = destNode.stream.getAudioTracks()[0];
            if (audioTrack) stream.addTrack(audioTrack);
        }
        
        const chunks: Blob[] = [];
        const supportedTypes = [
            'video/mp4;codecs=avc1',
            'video/mp4',
            'video/webm;codecs=vp9',
            'video/webm;codecs=h264',
            'video/webm',
            'video/quicktime'
        ];
        let mimeType = '';
        for (const type of supportedTypes) {
            if (MediaRecorder.isTypeSupported(type)) {
                mimeType = type;
                break;
            }
        }
        if (!mimeType) mimeType = 'video/webm'; // Fallback
        setOutputMimeType(mimeType);

        const recorder = new MediaRecorder(stream, { mimeType });
        recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
        recorder.onstop = () => {
            if (!isMounted.current) return;
             if (chunks.length === 0) {
                if (isMounted.current) {
                   setError("Generation Stalled: No data recorded. Your browser might be blocking the recording process.");
                   setIsProcessing(false);
                }
               return;
             }
             const blob = new Blob(chunks, { type: mimeType });
             const url = URL.createObjectURL(blob);
             if (isMounted.current) {
                setResultUrl(url);
                setIsProcessing(false);
             }
             if (audioCtx) audioCtx.close();
        };

        videoEl = document.createElement('video');
        videoEl.muted = true;
        videoEl.playsInline = true;
        videoEl.preload = 'auto';
        videoEl.crossOrigin = 'anonymous';
        videoEl.src = videoUrl;
        
        videoEl.style.position = 'fixed';
        videoEl.style.bottom = '0';
        videoEl.style.right = '0';
        videoEl.style.width = '100px';
        videoEl.style.height = '100px';
        videoEl.style.opacity = '0.01';
        videoEl.style.pointerEvents = 'none';
        videoEl.style.zIndex = '1';
        document.body.appendChild(videoEl); 
        
        await new Promise((resolve) => {
            const onMeta = () => {
                videoEl.removeEventListener('loadedmetadata', onMeta);
                resolve(null);
            };
            videoEl.addEventListener('loadedmetadata', onMeta);
            if (videoEl.readyState >= 1) onMeta();
            setTimeout(onMeta, 3000); // Max wait 3s
        });

        try {
            await videoEl.play();
        } catch (playErr) {
            console.warn("Autoplay blocked, trying again after interaction", playErr);
            // On some mobiles, we might need to wait or it might just work if triggered by click
        }

        videoEl.playbackRate = videoSpeed;
        if (audioEl) {
            try { await audioEl.play(); } catch(e) { console.warn("Audio play blocked", e); }
        }
        
        try {
            recorder.start(200); 
        } catch (recErr) {
            console.error("Recorder start failed", recErr);
            recorder.start(); // Try without timeslice
        }

        const totalDur = videoEl.duration && !isNaN(videoEl.duration) ? videoEl.duration : (videoDuration || 1); 

        let lastTime = -1;
        let stuckFrames = 0;

        const processLoop = () => {
            if (!isProcessing || !isMounted.current) {
               if (document.body.contains(videoEl)) document.body.removeChild(videoEl);
               return;
            }

            // Aggressively ensure video is playing if it's paused and not ended
            if (videoEl.paused && !videoEl.ended && videoEl.readyState >= 2) {
                videoEl.play().catch(() => {});
            }

            // Stuck check: if time hasn't advanced
            if (Math.abs(videoEl.currentTime - lastTime) < 0.001 && !videoEl.ended) {
                stuckFrames++;
                // If stuck for > 1 second (approx 60 frames), try to nudge
                if (stuckFrames > 60) { 
                    console.log("Video stuck, attempting to resume...");
                    videoEl.play().catch(() => {});
                    // Small nudge to get it moving if it's a buffering issue
                    if (videoEl.readyState >= 2) {
                        videoEl.currentTime = Math.min(videoEl.currentTime + 0.1, totalDur);
                    }
                    stuckFrames = 0;
                }
            } else {
                stuckFrames = 0;
            }
            lastTime = videoEl.currentTime;

            if (videoEl.ended || videoEl.currentTime >= totalDur) { 
              setTimeout(() => {
                if (recorder.state === 'recording') recorder.stop(); 
                if (document.body.contains(videoEl)) document.body.removeChild(videoEl);
                if (audioEl) audioEl.pause();
              }, 500); 
              return; 
            }
            
            renderFrame(ctx, videoEl, w, h, videoEl.currentTime * 1000);
            
            const currentProgress = totalDur > 0 
                ? Math.min(100, Math.floor((videoEl.currentTime / totalDur) * 100))
                : 1;
            setProgress(currentProgress > 0 ? currentProgress : 1);
            
            requestAnimationFrame(processLoop);
        };
        processLoop();

    } catch (err: any) {
        console.error("Gen Error:", err);
        if (isMounted.current) {
            setError("Generation Failed: " + err.message);
            setIsProcessing(false);
        }
    } finally {
        if (audioCtx && audioCtx.state !== 'closed') {
            audioCtx.close();
        }
        if (videoEl && document.body.contains(videoEl)) {
            document.body.removeChild(videoEl);
        }
    }
  };

  const videoOutputDur = videoDuration > 0 ? videoDuration / videoSpeed : 0;
  const audioOutputDur = audioDuration > 0 ? audioDuration / audioSpeed : 0;

  const handleAutoSyncVideo = () => {
    if (videoDuration && audioDuration) {
        const targetSpeed = videoDuration / (audioDuration / audioSpeed);
        setVideoSpeed(Number(targetSpeed.toFixed(4)));
    }
  };

  const handleAutoSyncAudio = () => {
    if (videoDuration && audioDuration) {
        const targetSpeed = audioDuration / (videoDuration / videoSpeed);
        setAudioSpeed(Number(targetSpeed.toFixed(4)));
    }
  };

  return (
    <div className="max-w-4xl mx-auto pb-6">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-600/20">
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 21h16a1 1 0 001-1V4a1 1 0 00-1-1H4a1 1 0 00-1 1v16a1 1 0 001 1z" />
          </svg>
        </div>
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white uppercase tracking-tighter">Recap Studio</h1>
          <p className="text-slate-500 dark:text-zinc-400 text-[9px] font-black tracking-widest uppercase">PRO SYNC • {CREDIT_COSTS[ContentType.MOVIE_RECAP]} CREDITS</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div className="order-2 md:order-1 space-y-2">
            <div className="glass p-2.5 rounded-lg border border-white/5 space-y-2">
                <h3 className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-zinc-500">Assets</h3>
                <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => videoInputRef.current?.click()} className={`p-1.5 rounded-lg border border-dashed flex flex-col items-center gap-1 transition-all ${videoFile ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10' : 'border-slate-300 dark:border-white/20 hover:border-slate-400 dark:hover:border-white/40'}`}>
                        <svg className={`w-3.5 h-3.5 ${videoFile ? 'text-indigo-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                        <span className={`text-[7px] font-bold uppercase truncate max-w-full ${videoFile ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500'}`}>{videoFile ? 'Video Ready' : 'Add Video'}</span>
                    </button>
                    <button onClick={() => audioInputRef.current?.click()} className={`p-1.5 rounded-lg border border-dashed flex flex-col items-center gap-1 transition-all ${audioFile ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10' : 'border-slate-300 dark:border-white/20 hover:border-slate-400 dark:hover:border-white/40'}`}>
                        <svg className={`w-3.5 h-3.5 ${audioFile ? 'text-emerald-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" /></svg>
                        <span className={`text-[7px] font-bold uppercase truncate max-w-full ${audioFile ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'}`}>{audioFile ? 'Audio Ready' : 'Add Audio'}</span>
                    </button>
                </div>
                <div className="pt-0.5">
                     <div className="flex gap-2">
                         <button onClick={() => logoInputRef.current?.click()} className="flex-1 py-1.5 border border-dashed border-slate-300 dark:border-white/20 rounded-lg text-[7px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-white/5 transition-all">
                            {logoFile ? 'Change Logo' : 'Overlay Branding'}
                         </button>
                         {logoFile && <button onClick={() => {setLogoFile(null); setLogoImage(null); setLogoUrl(null);}} className="px-2 rounded-lg bg-slate-100 dark:bg-white/5 hover:bg-rose-500 hover:text-white text-slate-500 transition-all"><svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>}
                     </div>
                </div>
                <input type="file" ref={videoInputRef} accept="video/*,.mp4,.mov,.mkv" onChange={handleVideoUpload} className="hidden" />
                <input type="file" ref={audioInputRef} accept="audio/*,.mp3,.wav,.m4a" onChange={handleAudioUpload} className="hidden" />
                <input type="file" ref={logoInputRef} accept="image/*,.png,.jpg,.jpeg" onChange={handleLogoUpload} className="hidden" />
            </div>

            <div className="glass p-2.5 rounded-lg border border-white/5 space-y-2">
                <div className="flex justify-between items-center">
                    <h3 className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-zinc-500">Canvas</h3>
                    <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)} className="bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-md text-[7px] font-black uppercase tracking-widest px-1.5 py-0.5 outline-none text-slate-700 dark:text-white cursor-pointer">
                        <option value="16:9">YouTube (16:9)</option>
                        <option value="9:16">TikTok (9:16)</option>
                        <option value="1:1">Square (1:1)</option>
                        <option value="4:5">Portrait (4:5)</option>
                    </select>
                </div>
                
                <div className="py-1 border-b border-slate-200 dark:border-white/5">
                     <div className="flex items-center justify-between mb-1">
                         <span className="text-[8px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400">Freeze Effect</span>
                         <input type="checkbox" checked={freezeEnabled} onChange={e => setFreezeEnabled(e.target.checked)} className="accent-indigo-500 w-3 h-3" />
                     </div>
                     {freezeEnabled && (
                        <div className="grid grid-cols-2 gap-2 pl-2 mt-1 pb-1 border-l-2 border-indigo-500/30">
                            <div>
                                <div className="flex justify-between text-[6px] text-slate-500 mb-0.5 font-black uppercase tracking-widest"><span>Interval</span><span>{freezeInterval}s</span></div>
                                <input type="range" min="1" max="15" step="1" value={freezeInterval} onChange={(e) => setFreezeInterval(Number(e.target.value))} className="w-full h-1 bg-slate-200 dark:bg-white/10 rounded-full appearance-none cursor-pointer accent-indigo-500" />
                            </div>
                            <div>
                                <div className="flex justify-between text-[6px] text-slate-500 mb-0.5 font-black uppercase tracking-widest"><span>Duration</span><span>{freezeDuration}s</span></div>
                                <input type="range" min="0.5" max="5" step="0.5" value={freezeDuration} onChange={(e) => setFreezeDuration(Number(e.target.value))} className="w-full h-1 bg-slate-200 dark:bg-white/10 rounded-full appearance-none cursor-pointer accent-indigo-500" />
                            </div>
                        </div>
                     )}
                </div>

                <div className="py-0.5">
                     <div className="flex items-center gap-1.5">
                         <div className="w-1 h-1 bg-indigo-500 rounded-full animate-pulse"></div>
                         <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Branding Position</span>
                     </div>
                     <div className="grid grid-cols-2 gap-1 mt-1">
                        {['Top Right', 'Bottom Right', 'Top Left', 'Bottom Left'].map(pos => (
                            <button key={pos} onClick={() => setLogoPosition(pos)} className={`py-0.5 rounded-md border text-[6px] font-black uppercase tracking-widest transition-all ${logoPosition === pos ? 'bg-indigo-600 border-indigo-500 text-white shadow-sm' : 'bg-transparent border-slate-200 dark:border-white/10 text-slate-500'}`}>{pos}</button>
                        ))}
                     </div>
                </div>
            </div>

            {/* Precision Sync Section */}
            <div className="glass p-2.5 rounded-lg border border-white/5 space-y-2">
                <div className="flex justify-between items-center">
                    <h3 className="text-[8px] font-black uppercase tracking-widest text-slate-900 dark:text-white">Timing Sync</h3>
                </div>
                <div className="grid grid-cols-1 gap-2">
                    <div className="space-y-1 p-1.5 bg-slate-50 dark:bg-black/20 rounded-lg border border-slate-200 dark:border-white/5">
                        <div className="flex justify-between items-center mb-0.5">
                            <label className="text-[7px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-widest">Video</label>
                            <span className="text-[6px] font-black text-slate-400 uppercase">{formatDurationFull(videoDuration)}</span>
                        </div>
                        <input type="number" step="0.0001" value={videoSpeed} onChange={e => setVideoSpeed(Number(e.target.value))} className="w-full bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-md py-1 px-1.5 text-[9px] font-black text-indigo-600 dark:text-indigo-400 text-center outline-none focus:ring-1 focus:ring-indigo-500" />
                        <div className="flex flex-col items-center pt-0.5">
                             <span className="text-[6px] font-black text-slate-400 uppercase tracking-tighter">Output</span>
                             <span className="text-[8px] font-mono font-black text-indigo-500 tabular-nums">{formatDurationFull(videoOutputDur)}</span>
                        </div>
                        <button onClick={handleAutoSyncVideo} className="w-full mt-1 py-1 rounded-md bg-indigo-600 text-white text-[7px] font-black uppercase tracking-widest hover:bg-indigo-500 shadow-sm transition-all active:scale-95">Sync to Audio</button>
                    </div>
                    
                    <div className="space-y-1 p-1.5 bg-slate-50 dark:bg-black/20 rounded-lg border border-slate-200 dark:border-white/5">
                        <div className="flex justify-between items-center mb-0.5">
                             <label className="text-[7px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-widest">Audio</label>
                             <span className="text-[6px] font-black text-slate-400 uppercase">{formatDurationFull(audioDuration)}</span>
                        </div>
                         <input type="number" step="0.0001" value={audioSpeed} onChange={e => setAudioSpeed(Number(e.target.value))} className="w-full bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-md py-1 px-1.5 text-[9px] font-black text-rose-500 dark:text-rose-400 text-center outline-none focus:ring-1 focus:ring-rose-500" />
                         <div className="flex flex-col items-center pt-0.5">
                             <span className="text-[6px] font-black text-slate-400 uppercase tracking-tighter">Output</span>
                             <span className="text-[8px] font-mono font-black text-rose-500 tabular-nums">{formatDurationFull(audioOutputDur)}</span>
                        </div>
                        <button onClick={handleAutoSyncAudio} className="w-full mt-1 py-1 rounded-md bg-rose-600 text-white text-[7px] font-black uppercase tracking-widest hover:bg-rose-500 shadow-sm transition-all active:scale-95">Sync to Video</button>
                    </div>
                </div>
            </div>

            <button onClick={handleGenerate} disabled={isProcessing || !videoUrl} className={`w-full py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all shadow-lg active:scale-95 ${isProcessing || !videoUrl ? 'bg-slate-200 dark:bg-white/5 text-slate-400 dark:text-zinc-600 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/10'}`}>
                {isProcessing ? `SYNTHESIZING... ${progress}%` : 'Execute Synthesis'}
            </button>
        </div>

        {/* Preview Frame Section - COMPACTED SIZE: max-w-[220px] */}
        <div className="order-1 md:order-2 space-y-3">
            <div className="w-full flex flex-col items-center transition-all duration-300">
                <div 
                  className="relative w-full bg-black rounded-xl overflow-hidden shadow-xl border border-slate-200 dark:border-white/10 group flex items-center justify-center transition-all duration-500 bg-midnight"
                  style={{ aspectRatio: aspectRatio.replace(':', '/') }}
                >
                    {videoUrl ? (
                         <>
                            <canvas ref={previewCanvasRef} className="absolute inset-0 m-auto pointer-events-none" />
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <button onClick={togglePlayback} className={`pointer-events-auto w-7 h-7 rounded-full bg-black/50 backdrop-blur-xl flex items-center justify-center border border-white/20 hover:scale-110 transition-all cursor-pointer ${isPlaying ? 'opacity-0 group-hover:opacity-100' : 'opacity-100 shadow-xl'}`}>
                                    {isPlaying ? <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg> : <svg className="w-3 h-3 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>}
                                </button>
                            </div>
                            <div className="absolute bottom-0 left-0 right-0 p-1 bg-gradient-to-t from-black/90 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                                <div className="flex items-center gap-1">
                                    <span className="text-[6px] font-mono font-bold text-white tabular-nums">{formatTimeSimple(currentTime)}</span>
                                    <input type="range" min="0" max={videoDuration} value={currentTime} onChange={handleSeek} className="flex-1 h-0.5 bg-white/20 rounded-full appearance-none cursor-pointer accent-white hover:h-1 transition-all" />
                                    <span className="text-[6px] font-mono font-bold text-gray-400 tabular-nums">{formatTimeSimple(videoDuration)}</span>
                                </div>
                            </div>
                         </>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full p-2 text-center">
                             <div className="w-6 h-6 bg-white/5 rounded-lg flex items-center justify-center mb-1 shadow-inner"><svg className="w-3 h-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg></div>
                             <p className="text-gray-500 text-[6px] font-black uppercase tracking-[0.3em]">Load Asset</p>
                        </div>
                    )}
                </div>

                {/* Blur Strip Controls - COMPACTED */}
                <div className="w-full glass p-2.5 rounded-lg border border-white/5 mt-2 space-y-2">
                    <div className="flex items-center justify-between mb-0.5">
                         <div className="flex items-center gap-1">
                             <div className="w-2.5 h-2.5 bg-indigo-600 rounded flex items-center justify-center">
                                 <svg className="w-1.5 h-1.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4 6h16M4 12h16M4 18h16" /></svg>
                             </div>
                             <span className="text-[7px] font-black uppercase tracking-widest text-slate-800 dark:text-white">Blur Overlay Strip</span>
                         </div>
                         <input type="checkbox" checked={blurEnabled} onChange={e => setBlurEnabled(e.target.checked)} className="accent-indigo-500 w-2.5 h-2.5" />
                    </div>
                    {blurEnabled && (
                        <div className="space-y-2 pt-0.5">
                            <div>
                                <div className="flex justify-between text-[6px] text-slate-400 mb-0.5 font-black uppercase tracking-widest"><span>Vertical Pos</span><span>{blurPosition}%</span></div>
                                <input type="range" min="0" max="100" value={blurPosition} onChange={(e) => setBlurPosition(Number(e.target.value))} className="w-full h-1 bg-slate-200 dark:bg-white/10 rounded-full appearance-none cursor-pointer accent-indigo-500" />
                            </div>
                            <div>
                                <div className="flex justify-between text-[6px] text-slate-400 mb-0.5 font-black uppercase tracking-widest"><span>Thickness</span><span>{blurThickness}%</span></div>
                                <input type="range" min="5" max="50" value={blurThickness} onChange={(e) => setBlurThickness(Number(e.target.value))} className="w-full h-1 bg-slate-200 dark:bg-white/10 rounded-full appearance-none cursor-pointer accent-indigo-500" />
                            </div>
                            <div>
                                <div className="flex justify-between text-[6px] text-slate-400 mb-0.5 font-black uppercase tracking-widest"><span>Intensity</span><span>{blurIntensity}px</span></div>
                                <input type="range" min="0" max="80" value={blurIntensity} onChange={(e) => setBlurIntensity(Number(e.target.value))} className="w-full h-1 bg-slate-200 dark:bg-white/10 rounded-full appearance-none cursor-pointer accent-indigo-500" />
                            </div>
                        </div>
                    )}
                </div>
            </div>
            
            <video ref={videoRef} src={videoUrl || null} className="hidden" playsInline muted={true} onLoadedMetadata={onVideoLoaded} />
            <audio ref={audioRef} src={audioUrl || null} className="hidden" onLoadedMetadata={onAudioLoaded} />
            
            {resultUrl && (
                <div className="glass p-4 rounded-xl border border-emerald-500/30 animate-in slide-in-from-bottom-4 max-w-md mx-auto shadow-2xl bg-emerald-500/5">
                    <div className="flex justify-between items-center mb-3">
                        <div className="flex items-center gap-2">
                           <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                           <h3 className="text-[10px] font-black uppercase text-slate-900 dark:text-white tracking-widest">Generation Complete</h3>
                        </div>
                        <div className="flex gap-2">
                            <a href={resultUrl} download={`recap_final.${outputMimeType.includes('mp4') ? 'mp4' : 'webm'}`} className="px-3 py-1 rounded-lg bg-emerald-600 text-white text-[9px] font-black uppercase tracking-widest hover:bg-emerald-500 transition-all active:scale-95 shadow-lg shadow-emerald-600/20">Download Video</a>
                        </div>
                    </div>
                    <video src={resultUrl} controls className="w-full rounded-xl bg-black shadow-2xl border border-white/5" />
                    <button onClick={() => setResultUrl(null)} className="w-full mt-3 text-[8px] font-black text-slate-400 hover:text-rose-500 uppercase tracking-widest transition-colors">Discard & Create New</button>
                </div>
            )}
            
            {error && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500 text-[8px] font-black text-center uppercase tracking-widest animate-in shake duration-500">
                {error}
              </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default MovieRecap;
