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

  // Step state
  const [inputMode, setInputMode] = useState<'url' | 'upload'>('url');
  const [videoUrl, setVideoUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Settings
  const [selectedVoice, setSelectedVoice] = useState('my-MM-NilarNeural');
  const [voiceMode, setVoiceMode] = useState<'preset' | 'custom-sample'>('preset');
  const [voiceSampleFile, setVoiceSampleFile] = useState<File | null>(null);
  const [voiceSampleUrl, setVoiceSampleUrl] = useState<string | null>(null);
  const [selectedSpeed, setSelectedSpeed] = useState('+15%');
  const [selectedRatio, setSelectedRatio] = useState('original');
  const [enableSubtitles, setEnableSubtitles] = useState(true);
  const [subtitleStyle, setSubtitleStyle] = useState('font-akkhayar');
  const [enableBlur, setEnableBlur] = useState(true);
  const [blurPosition, setBlurPosition] = useState<number>(78);
  const [blurThickness, setBlurThickness] = useState<number>(14);
  const [blurIntensity, setBlurIntensity] = useState<number>(30);
  const [watermarkText, setWatermarkText] = useState('');
  const [includeOriginalAudio, setIncludeOriginalAudio] = useState(false);

  // Video Preview State
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
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const videoPlayerRef = useRef<HTMLVideoElement>(null);
  const voiceSampleInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  // Cleanup
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
      if (voiceSampleUrl) URL.revokeObjectURL(voiceSampleUrl);
    };
  }, [filePreviewUrl, voiceSampleUrl]);

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

  const togglePreviewPlay = () => {
    if (!previewVideoRef.current) return;
    if (previewVideoRef.current.paused) {
      previewVideoRef.current.play();
      setPreviewIsPlaying(true);
    } else {
      previewVideoRef.current.pause();
      setPreviewIsPlaying(false);
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
        } catch (err: any) {
          console.warn('Status poll error:', err);
        }
      }, 2000);
    } catch (err: any) {
      setIsUploading(false);
      setError(err.message || 'စတင်လုပ်ဆောင်မှု မအောင်မြင်ပါ');
    }
  };

  const handleDownload = () => {
    if (!jobStatus?.job_id) return;
    const url = getOneClickDownloadUrl(jobStatus.job_id);
    const link = document.createElement('a');
    link.href = url;
    link.download = `myanmar_recap_${Date.now()}.mp4`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyScript = () => {
    if (!transcript) return;
    const text = (transcript.myanmar_segments || transcript.english_segments || [])
      .map((s: any) => s.narration || s.text)
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2000);
  };

  const handleReset = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
    if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    setFile(null);
    setFilePreviewUrl(null);
    setVideoUrl('');
    setJobId(null);
    setJobStatus(null);
    setTranscript(null);
    setError(null);
  };

  const isProcessing = jobStatus?.status === 'processing';
  const isCompleted = jobStatus?.status === 'completed';
  const isFailed = jobStatus?.status === 'failed';

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-200 dark:border-zinc-800">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
            <span className="p-1.5 rounded-xl bg-indigo-500/10 text-indigo-500 text-lg">⚡</span>
            One Click Movie Recap
          </h1>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
            Video link သို့မဟုတ် ဖိုင်ထည့်လိုက်ရုံဖြင့် ရုပ်နှင့်အသံ ထပ်တူကျသော မြန်မာစကားပြော Recap ဗီဒီယို ရရှိပါမည်
          </p>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700/60 text-[11px] font-semibold text-slate-600 dark:text-zinc-300">
          {isCheckingServer ? (
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          ) : serverStatus?.online ? (
            <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" />
          ) : (
            <span className="w-2 h-2 rounded-full bg-red-500" />
          )}
          <span>{isCheckingServer ? 'Checking...' : serverStatus?.online ? 'Engine Ready' : 'Engine Offline'}</span>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="mb-6 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs font-semibold flex items-center justify-between gap-3 shadow-sm">
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 font-bold text-sm">✕</button>
        </div>
      )}

      {/* COMPLETED STATE: Video Player & Script */}
      {isCompleted && jobStatus?.job_id && (
        <div className="mb-8 rounded-3xl border border-emerald-500/30 bg-zinc-950 p-5 sm:p-7 shadow-2xl shadow-emerald-500/10 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-4">
            <div className="flex items-center gap-2.5">
              <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-emerald-400">
                Myanmar Recap Complete
              </h2>
            </div>
            <div className="flex items-center gap-3 text-xs text-zinc-400">
              {jobStatus.output_duration && <span className="font-mono bg-zinc-900 px-2.5 py-1 rounded-lg border border-zinc-800">{jobStatus.output_duration.toFixed(1)}s</span>}
              {jobStatus.output_size_mb && <span className="font-mono bg-zinc-900 px-2.5 py-1 rounded-lg border border-zinc-800">{jobStatus.output_size_mb} MB</span>}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left: Video Player */}
            <div className="lg:col-span-7 flex flex-col items-center">
              <div className="w-full max-h-[560px] rounded-2xl bg-black border border-zinc-800 shadow-inner flex items-center justify-center overflow-hidden">
                <video
                  ref={videoPlayerRef}
                  key={jobStatus.job_id}
                  src={getOneClickDownloadUrl(jobStatus.job_id)}
                  controls
                  autoPlay
                  playsInline
                  className="max-h-[560px] w-auto max-w-full rounded-xl object-contain"
                />
              </div>

              {/* Action Buttons */}
              <div className="w-full mt-4 flex items-center justify-between gap-3">
                <button
                  onClick={handleDownload}
                  className="flex-1 flex items-center justify-center gap-2 py-3 px-5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold text-xs uppercase tracking-wider hover:opacity-95 shadow-lg shadow-emerald-500/25 transition-all">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download Video
                </button>

                <button
                  onClick={handleReset}
                  className="px-5 py-3 rounded-xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 font-semibold text-xs transition-colors">
                  New Video
                </button>
              </div>
            </div>

            {/* Right: Burmese Storyline Script */}
            <div className="lg:col-span-5 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 p-4 flex flex-col h-full max-h-[620px]">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800 mb-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
                  <span>📜</span> Storyline Script
                </h3>
                {transcript && (
                  <button
                    onClick={handleCopyScript}
                    className="text-[11px] font-semibold text-indigo-400 hover:text-indigo-300">
                    {copiedScript ? '✓ Copied' : 'Copy All'}
                  </button>
                )}
              </div>

              <div className="overflow-y-auto space-y-2.5 pr-1 flex-1 custom-scrollbar text-xs">
                {transcript ? (
                  (transcript.myanmar_segments || transcript.english_segments || []).map((seg: any, i: number) => (
                    <div key={i} className="p-2.5 rounded-xl bg-zinc-950/60 border border-zinc-800/50 space-y-1">
                      <span className="text-[10px] font-mono text-zinc-500">
                        {seg.start ? `${seg.start.toFixed(1)}s` : ''} - {seg.end ? `${seg.end.toFixed(1)}s` : ''}
                      </span>
                      <p className="text-zinc-200 font-medium leading-relaxed">
                        {seg.narration || seg.text}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="py-12 text-center text-zinc-500 text-xs">
                    Script loading...
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STEP-BY-STEP RECAP WORKFLOW */}
      {!isCompleted && (
        <div className="space-y-6">
          {/* Step 1: Input Video Card */}
          <div className="rounded-3xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 p-6 shadow-sm transition-all">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-zinc-800/80">
              <div className="flex items-center gap-2.5">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${hasVideo ? 'bg-emerald-500 text-white' : 'bg-indigo-600 text-white'}`}>
                  {hasVideo ? '✓' : '1'}
                </span>
                <h2 className="text-sm font-bold text-slate-800 dark:text-zinc-100">
                  Step 1: Video ထည့်သွင်းပါ
                </h2>
              </div>

              {hasVideo && !isProcessing && !isUploading && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="text-xs font-semibold text-slate-400 hover:text-red-500 transition-colors">
                  Change Video
                </button>
              )}
            </div>

            {/* If video is selected, show summary preview card & Interactive Blur Calibrator */}
            {hasVideo && !isProcessing && !isUploading ? (
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-500/5 border border-indigo-200 dark:border-indigo-500/20 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center text-lg flex-shrink-0">
                      {inputMode === 'url' ? '🔗' : '🎬'}
                    </div>
                    <div className="overflow-hidden">
                      <p className="text-xs font-bold text-slate-800 dark:text-zinc-200 truncate">
                        {inputMode === 'url' ? videoUrl : file?.name}
                      </p>
                      <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5 flex items-center gap-1">
                        <span>✓</span> Video Ready for Calibration
                      </p>
                    </div>
                  </div>

                  <span className="px-3 py-1 rounded-xl bg-emerald-500/10 text-emerald-500 text-xs font-bold whitespace-nowrap">
                    Ready
                  </span>
                </div>

                {/* Interactive Video Preview Box (When video file is uploaded) */}
                {filePreviewUrl && (
                  <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-950 p-3.5 space-y-3 shadow-inner">
                    <div className="flex items-center justify-between text-xs font-bold text-zinc-300">
                      <span className="flex items-center gap-2">
                        <span>👁️ Live Preview & Blur Calibrator</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                          Interactive
                        </span>
                      </span>
                      <span className="text-[11px] font-mono text-zinc-400">
                        {formatTimeSimple(previewCurrentTime)} / {formatTimeSimple(previewDuration)}
                      </span>
                    </div>

                    {/* Video Screen with Live Blur Overlay */}
                    <div className="relative mx-auto rounded-xl overflow-hidden bg-black flex items-center justify-center max-h-[360px] aspect-video border border-zinc-800">
                      <video
                        ref={previewVideoRef}
                        src={filePreviewUrl}
                        onTimeUpdate={() => setPreviewCurrentTime(previewVideoRef.current?.currentTime || 0)}
                        onLoadedMetadata={() => setPreviewDuration(previewVideoRef.current?.duration || 0)}
                        onEnded={() => setPreviewIsPlaying(false)}
                        className="w-full h-full object-contain"
                        playsInline
                      />

                      {/* Live Frosted Glass Blur Band Overlay */}
                      {enableBlur && (
                        <div
                          style={{
                            top: `${Math.max(0, Math.min(100 - blurThickness, blurPosition - blurThickness / 2))}%`,
                            height: `${blurThickness}%`,
                          }}
                          className="absolute left-0 right-0 pointer-events-none transition-all duration-150 flex flex-col items-center justify-center overflow-hidden border-y border-amber-400/60 shadow-lg"
                        >
                          {/* Frosted Glass Effect */}
                          <div
                            style={{
                              backdropFilter: `blur(${Math.max(6, Math.round(blurIntensity * 0.35))}px)`,
                              backgroundColor: `rgba(0, 0, 0, ${Math.min(0.72, Math.max(0.25, (blurIntensity / 100) * 0.85))})`,
                            }}
                            className="absolute inset-0"
                          />

                          {/* Dynamic Subtitle Text Display inside blur box */}
                          <div className="relative z-10 px-4 text-center max-w-[85%]">
                            <p
                              style={{
                                color: subtitleStyle === 'font-padauk' ? '#FFFFFF' : '#FFD700',
                                textShadow: '0 2px 4px rgba(0,0,0,0.9), 0 0 2px #000, 1px 1px 0 #000, -1px -1px 0 #000',
                              }}
                              className="text-[13px] sm:text-[15px] font-bold leading-tight font-sans tracking-wide">
                              မွေးစားဖခင်ဖြစ်သူကလည်း အမြဲတမ်း နောက်ပြောင်ပြီး ညည်းတွားတတ်ပါတယ်။
                            </p>
                          </div>

                          {/* Height & Position Tag */}
                          <div className="absolute top-1 right-2 z-10 text-[9px] font-mono px-1.5 py-0.5 rounded bg-black/70 text-amber-300 font-semibold border border-amber-400/40">
                            Height: {blurThickness}% · Y: {blurPosition}%
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Video Scrubber & Play Controls */}
                    <div className="flex items-center gap-3 pt-1">
                      <button
                        type="button"
                        onClick={togglePreviewPlay}
                        className="w-8 h-8 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center text-xs font-bold transition-all flex-shrink-0">
                        {previewIsPlaying ? '⏸' : '▶'}
                      </button>

                      <input
                        type="range"
                        min={0}
                        max={previewDuration || 100}
                        step={0.1}
                        value={previewCurrentTime}
                        onChange={handlePreviewSeek}
                        className="flex-1 accent-indigo-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                      />

                      <span className="text-[11px] font-mono text-zinc-400 flex-shrink-0">
                        {formatTimeSimple(previewCurrentTime)}
                      </span>
                    </div>

                    <p className="text-[11px] text-zinc-400">
                      💡 ဗီဒီယိုကို ရွှေ့ကြည့်ပြီး မူရင်း English စာတန်းထိုးပေါ် Blur အုပ်မှု အံကိုက်ဖြစ်စေရန် အောက်ရှိ Slider များဖြင့် ချိန်ညှိပါ
                    </p>
                  </div>
                )}
              </div>
            ) : (
              /* Input Selector Tabs & Boxes */
              <div className="space-y-4">
                <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-slate-100 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700/60 max-w-md">
                  <button
                    type="button"
                    onClick={() => setInputMode('url')}
                    disabled={isProcessing || isUploading}
                    className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2
                      ${inputMode === 'url'
                        ? 'bg-white dark:bg-zinc-700 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200'
                      }`}>
                    <span>🔗 TikTok / YouTube Link</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setInputMode('upload')}
                    disabled={isProcessing || isUploading}
                    className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2
                      ${inputMode === 'upload'
                        ? 'bg-white dark:bg-zinc-700 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200'
                      }`}>
                    <span>📁 Upload File</span>
                  </button>
                </div>

                {inputMode === 'url' ? (
                  <div className="space-y-2">
                    <div className="relative">
                      <input
                        type="url"
                        value={videoUrl}
                        onChange={(e) => setVideoUrl(e.target.value)}
                        placeholder="Paste TikTok, YouTube Shorts သို့မဟုတ် Video URL (https://...)"
                        disabled={isProcessing || isUploading}
                        className="w-full px-4 py-3.5 pr-10 rounded-2xl bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono transition-all"
                      />
                      {videoUrl && (
                        <button
                          type="button"
                          onClick={() => setVideoUrl('')}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold">
                          ✕
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-slate-400 dark:text-zinc-500 px-1">
                      <span>ထောက်ပံ့မှု:</span>
                      <span className="font-semibold text-slate-600 dark:text-zinc-400">TikTok Shorts</span> ·
                      <span className="font-semibold text-slate-600 dark:text-zinc-400">YouTube</span> ·
                      <span className="font-semibold text-slate-600 dark:text-zinc-400">Facebook</span>
                    </div>
                  </div>
                ) : (
                  <div
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`rounded-2xl border-2 border-dashed p-8 text-center cursor-pointer transition-all
                      ${isDragging ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-500/10' : 'border-slate-200 dark:border-zinc-700 hover:border-slate-300 dark:hover:border-zinc-600'}`}>
                    <div className="w-10 h-10 mx-auto rounded-xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-500 flex items-center justify-center text-xl mb-2">
                      📥
                    </div>
                    <p className="text-xs font-bold text-slate-800 dark:text-zinc-200">
                      ဗီဒီယိုဖိုင် ရွေးချယ်ပါ သို့မဟုတ် ဖိုင်ဆွဲထည့်ပါ
                    </p>
                    <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-0.5">
                      MP4, MOV, MKV (500MB အထိ)
                    </p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="video/*,.mp4,.mov,.mkv,.webm"
                      onChange={handleInputChange}
                      className="hidden"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Step 2: Settings Card */}
          <div className={`rounded-3xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 p-6 shadow-sm transition-all space-y-6 ${!hasVideo ? 'opacity-60 pointer-events-none' : ''}`}>
            <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100 dark:border-zinc-800/80">
              <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold">
                2
              </span>
              <h2 className="text-sm font-bold text-slate-800 dark:text-zinc-100">
                Step 2: Recap Settings & Voice Customization
              </h2>
            </div>

            {/* 1. Voice & Cloning */}
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                    🎙️ အသံရွေးချယ်မှု သို့မဟုတ် နမူနာအသံတုပခြင်း (Voice / Cloning)
                  </label>
                  <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-100 dark:bg-zinc-800 text-[10px] font-bold">
                    <button
                      type="button"
                      onClick={() => setVoiceMode('preset')}
                      className={`px-2.5 py-1 rounded-md transition-all ${voiceMode === 'preset' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 dark:text-zinc-400'}`}>
                      မြန်မာ AI အသံများ
                    </button>
                    <button
                      type="button"
                      onClick={() => setVoiceMode('custom-sample')}
                      className={`px-2.5 py-1 rounded-md transition-all flex items-center gap-1 ${voiceMode === 'custom-sample' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-500 dark:text-zinc-400'}`}>
                      <span>✨ အသံဖိုင်တုပမည်</span>
                      <span className="text-[9px] bg-purple-500/30 px-1 rounded">Clone</span>
                    </button>
                  </div>
                </div>

                {/* Preset Voices */}
                {voiceMode === 'preset' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {[
                      { id: 'my-MM-NilarNeural', name: 'Nilar (နီလာ) ✨ Recommended', gender: 'Female', description: 'ဇာတ်လမ်းပြော ချိုသာကြည်လင်သော မိန်းမသံ (သဘာဝကျပြီး စက်ရုပ်သံမပေါက်ပါ)' },
                      { id: 'my-MM-ThihaNeural', name: 'Thiha (သီဟ)', gender: 'Male', description: 'ရုပ်ရှင်ဇာတ်လမ်းပြော တည်ငြိမ်သော ယောက်ျားသံ (Deep Male Narrator)' },
                    ].map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => setSelectedVoice(v.id)}
                        disabled={isProcessing || isUploading}
                        className={`p-3 rounded-2xl border text-left transition-all
                          ${selectedVoice === v.id
                            ? 'border-indigo-500 bg-indigo-50/60 dark:bg-indigo-500/10 ring-2 ring-indigo-500/20 shadow-sm'
                            : 'border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700'
                          }`}>
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
                  /* Custom Sample Upload for Voice Cloning */
                  <div className="rounded-2xl border border-purple-500/30 bg-purple-50/30 dark:bg-purple-950/20 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-purple-900 dark:text-purple-300 flex items-center gap-1.5">
                        <span>🎙️</span> Narrator Voice Cloning (ElevenLabs Instant Voice Clone)
                      </span>
                      {voiceSampleFile && (
                        <button
                          type="button"
                          onClick={() => {
                            setVoiceSampleFile(null);
                            if (voiceSampleUrl) URL.revokeObjectURL(voiceSampleUrl);
                            setVoiceSampleUrl(null);
                          }}
                          className="text-[11px] font-bold text-red-500 hover:underline">
                          ဖျက်မည်
                        </button>
                      )}
                    </div>

                    {voiceSampleFile ? (
                      <div className="space-y-2 p-3 rounded-xl bg-white dark:bg-zinc-900 border border-purple-300/40">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-800 dark:text-zinc-200 truncate">
                            🎵 {voiceSampleFile.name}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 font-bold">
                            ✓ Ready to Clone
                          </span>
                        </div>
                        {voiceSampleUrl && (
                          <audio controls src={voiceSampleUrl} className="w-full h-8" />
                        )}
                        <p className="text-[10px] text-purple-600 dark:text-purple-400">
                          ✨ ဤအသံနမူနာ၏ အသံနေအထားအတိုင်း ElevenLabs Multilingual AI ဖြင့် တူညီစွာ ဇာတ်လမ်းပြောပါမည်။
                        </p>
                      </div>
                    ) : (
                      <div
                        onClick={() => voiceSampleInputRef.current?.click()}
                        className="border-2 border-dashed border-purple-300 dark:border-purple-800 rounded-xl p-5 text-center cursor-pointer hover:bg-purple-100/50 dark:hover:bg-purple-900/20 transition-all">
                        <div className="text-2xl mb-1">🎧</div>
                        <p className="text-xs font-bold text-purple-900 dark:text-purple-200">
                          ကြိုက်နှစ်သက်သော ဇာတ်လမ်းပြောသူ၏ အသံဖိုင် (Voice Sample) တင်ပေးပါ
                        </p>
                        <p className="text-[11px] text-purple-600 dark:text-purple-400 mt-0.5">
                          ၅ စက္ကန့်မှ ၁ မိနစ်အတွင်း MP3, WAV, M4A အသံဖိုင် (ဆူညံသံမပါသော အသံကြည်လင်မှု အကောင်းဆုံးဖြစ်သည်)
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
              </div>

              {/* Speed Presets */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                    ⚡ စကားပြော အမြန်နှုန်း (Voice Speed)
                  </label>
                  <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                    ✓ အသံမြန်သလောက် ရုပ်ပါ အလိုအလျောက် လိုက်မြန်ပြီး ထပ်တူကျမည်
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: '+0%', label: '1.0x Normal', desc: 'သဘာဝပုံမှန်' },
                    { value: '+15%', label: '1.15x Recap ✨', desc: 'နားထောင်ကောင်း အသွက် (Recommended)' },
                    { value: '+25%', label: '1.25x Fast', desc: 'TikTok အမြန်' },
                  ].map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => setSelectedSpeed(s.value)}
                      disabled={isProcessing || isUploading}
                      className={`p-2.5 rounded-xl border text-center transition-all
                        ${selectedSpeed === s.value
                          ? 'border-indigo-500 bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
                          : 'border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-800/60 text-slate-700 dark:text-zinc-300 hover:border-slate-300'
                        }`}>
                      <span className="block text-xs font-bold">{s.label}</span>
                      <span className={`block text-[10px] mt-0.5 ${selectedSpeed === s.value ? 'text-indigo-100' : 'text-slate-400 dark:text-zinc-500'}`}>
                        {s.desc}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 2. Subtitles & Blur Position Precision Controls */}
            <div className="pt-4 border-t border-slate-100 dark:border-zinc-800/80 space-y-4">
              <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block">
                ✨ စာတန်းထိုးနှင့် Blur နေရာ / အထူ အတိအကျချိန်ညှိမှု (Precision Calibrator)
              </label>

              {/* Switches */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Subtitle Switch */}
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-zinc-800/50 border border-slate-100 dark:border-zinc-800 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-slate-800 dark:text-zinc-200">မြန်မာစာတန်းထိုးမည်</p>
                    <p className="text-[10px] text-slate-400 dark:text-zinc-500 mt-0.5">Akkhayar21 အဝါရောင် စာတန်း</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEnableSubtitles(!enableSubtitles)}
                    className={`w-10 h-5 rounded-full transition-colors relative ${enableSubtitles ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-zinc-700'}`}>
                    <span className={`block w-3.5 h-3.5 rounded-full bg-white transition-transform ${enableSubtitles ? 'translate-x-5' : 'translate-x-1'}`} />
                  </button>
                </div>

                {/* Blur Switch */}
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-zinc-800/50 border border-slate-100 dark:border-zinc-800 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-slate-800 dark:text-zinc-200">မူရင်းစာတန်း ဖျောက်မည် (Blur)</p>
                    <p className="text-[10px] text-slate-400 dark:text-zinc-500 mt-0.5">မူရင်း English စာသားကို Blur အုပ်မည်</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEnableBlur(!enableBlur)}
                    className={`w-10 h-5 rounded-full transition-colors relative ${enableBlur ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-zinc-700'}`}>
                    <span className={`block w-3.5 h-3.5 rounded-full bg-white transition-transform ${enableBlur ? 'translate-x-5' : 'translate-x-1'}`} />
                  </button>
                </div>
              </div>

              {/* Blur Sliders & Presets (When Blur is Enabled) */}
              {enableBlur && (
                <div className="p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-500/5 border border-indigo-200 dark:border-indigo-500/20 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
                      <span>🎯</span> Blur Quick Presets (အမြန်ရွေးချယ်ရန်)
                    </span>
                    <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold">
                      အပေါ် ဗီဒီယိုပေါ်တွင် တိုက်ရိုက် ကြည့်နိုင်ပါသည်
                    </span>
                  </div>

                  {/* Preset Buttons */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { label: 'TikTok ပုံမှန်', pos: 78, thick: 13, tip: 'TikTok Captions' },
                      { label: 'အောက်ခြေစွန်း', pos: 86, thick: 12, tip: 'Bottom Subtitles' },
                      { label: 'ဖန်သားပြင် အလယ်', pos: 62, thick: 14, tip: 'Center Captions' },
                      { label: 'အပါးဆုံး Strip', pos: 80, thick: 9, tip: 'Thin 9% Strip' },
                    ].map((p, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setBlurPosition(p.pos);
                          setBlurThickness(p.thick);
                        }}
                        className={`p-2 rounded-xl border text-center transition-all ${
                          blurPosition === p.pos && blurThickness === p.thick
                            ? 'border-indigo-500 bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 font-bold shadow-sm'
                            : 'border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700 text-slate-600 dark:text-zinc-400 text-xs'
                        }`}>
                        <span className="block text-xs font-semibold">{p.label}</span>
                        <span className="block text-[10px] opacity-75">{p.thick}% / {p.pos}%</span>
                      </button>
                    ))}
                  </div>

                  {/* Precision Sliders */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-indigo-100 dark:border-indigo-900/40">
                    {/* Blur Position Slider */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-700 dark:text-zinc-300">
                          ↕️ Blur အမြင့်နေရာ (Position Y)
                        </span>
                        <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                          {blurPosition}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={45}
                        max={92}
                        value={blurPosition}
                        onChange={(e) => setBlurPosition(Number(e.target.value))}
                        className="w-full accent-indigo-600 h-2 bg-slate-200 dark:bg-zinc-700 rounded-lg cursor-pointer"
                      />
                      <div className="flex justify-between text-[10px] text-slate-400">
                        <span>အပေါ်ပိုင်း (45%)</span>
                        <span>အောက်ခြေစွန်း (92%)</span>
                      </div>
                    </div>

                    {/* Blur Height / Thickness Slider */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-700 dark:text-zinc-300">
                          📏 Blur အထူ / အကျယ် (Height)
                        </span>
                        <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                          {blurThickness}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={7}
                        max={26}
                        value={blurThickness}
                        onChange={(e) => setBlurThickness(Number(e.target.value))}
                        className="w-full accent-indigo-600 h-2 bg-slate-200 dark:bg-zinc-700 rounded-lg cursor-pointer"
                      />
                      <div className="flex justify-between text-[10px] text-slate-400">
                        <span>ပါးပါးလေး (7%)</span>
                        <span>ထူထူ (26%)</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Subtitle Font Style */}
              {enableSubtitles && (
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-zinc-800/50 border border-slate-100 dark:border-zinc-800 space-y-2">
                  <span className="text-xs font-bold text-slate-700 dark:text-zinc-300 block">
                    🎨 စာတန်းထိုး ဒီဇိုင်းပုံစံ (Subtitle Style)
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'font-akkhayar', label: 'Akkhayar (ရွှေဝါရောင် + Black Stroke)', desc: 'Movie Recap စံနှုန်း' },
                      { id: 'font-padauk', label: 'Padauk (အဖြူရောင် + Black Stroke)', desc: 'သန့်ရှင်းသော ခေတ်မီပုံစံ' },
                    ].map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => setSubtitleStyle(st.id)}
                        className={`p-2 rounded-xl border text-left transition-all ${
                          subtitleStyle === st.id
                            ? 'border-indigo-500 bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 font-bold shadow-sm'
                            : 'border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 text-xs'
                        }`}>
                        <span className="block text-xs">{st.label}</span>
                        <span className="block text-[10px] text-slate-400 mt-0.5">{st.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Clean Audio & Watermark */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-zinc-800/50 border border-slate-100 dark:border-zinc-800 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-slate-800 dark:text-zinc-200">မူရင်းအသံ ပိတ်မည် (Clean Audio)</p>
                    <p className="text-[10px] text-slate-400 dark:text-zinc-500 mt-0.5">အင်္ဂလိပ်စကားသံ လုံးဝမပါစေရန်</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIncludeOriginalAudio(!includeOriginalAudio)}
                    className={`w-10 h-5 rounded-full transition-colors relative ${!includeOriginalAudio ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-zinc-700'}`}>
                    <span className={`block w-3.5 h-3.5 rounded-full bg-white transition-transform ${!includeOriginalAudio ? 'translate-x-5' : 'translate-x-1'}`} />
                  </button>
                </div>

                <div>
                  <input
                    type="text"
                    value={watermarkText}
                    onChange={(e) => setWatermarkText(e.target.value)}
                    placeholder="Logo / Channel အမည် Watermark (စိတ်ကြိုက်)"
                    disabled={isProcessing || isUploading}
                    className="w-full px-3.5 py-3 rounded-2xl bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* In-Progress Progress Bar Card */}
          {(isUploading || isProcessing || isFailed) && (
            <div className="p-5 rounded-3xl border border-indigo-500/20 bg-white dark:bg-zinc-900 shadow-xl space-y-3">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-slate-800 dark:text-zinc-200 flex items-center gap-2">
                  {isUploading ? (
                    <>
                      <LoadingSpinner size="sm" showLabel={false} />
                      AWS Cloud သို့ တင်ပို့နေပါသည်...
                    </>
                  ) : isProcessing ? (
                    <>
                      <LoadingSpinner size="sm" showLabel={false} />
                      {STEP_LABELS[jobStatus?.step || ''] || jobStatus?.message || 'Processing...'}
                    </>
                  ) : (
                    <span className="text-red-500">လုပ်ဆောင်မှု မအောင်မြင်ပါ</span>
                  )}
                </span>
                <span className="text-indigo-600 dark:text-indigo-400 font-mono text-sm font-black">
                  {jobStatus?.progress ? `${Math.max(0, jobStatus.progress)}%` : isUploading ? '...' : ''}
                </span>
              </div>

              <div className="h-2.5 w-full rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 transition-all duration-500 ease-out"
                  style={{ width: `${Math.max(5, Math.min(100, jobStatus?.progress || (isUploading ? 10 : 0)))}%` }}
                />
              </div>

              {isFailed && (
                <p className="text-xs text-red-500 mt-1">{jobStatus?.error || 'Error occurred during generation'}</p>
              )}
            </div>
          )}

          {/* Step 3: Action Button */}
          <div>
            <button
              onClick={handleStart}
              disabled={!hasVideo || isProcessing || isUploading || !serverStatus?.online}
              className={`w-full py-4 rounded-2xl text-xs font-bold uppercase tracking-wider transition-all duration-200 shadow-xl
                ${!hasVideo || isProcessing || isUploading || !serverStatus?.online
                  ? 'bg-slate-200 dark:bg-zinc-800 text-slate-400 dark:text-zinc-600 cursor-not-allowed shadow-none'
                  : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-indigo-500/30 active:scale-[0.99]'
                }`}>
              {isUploading ? (
                <span className="flex items-center justify-center gap-2">
                  <LoadingSpinner size="sm" showLabel={false} />
                  Starting Pipeline...
                </span>
              ) : isProcessing ? (
                <span className="flex items-center justify-center gap-2">
                  <LoadingSpinner size="sm" showLabel={false} />
                  Generating Recap...
                </span>
              ) : (
                'Generate One Click Recap (15 CR)'
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default OneClick;
