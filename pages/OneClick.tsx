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
  const [selectedVoice, setSelectedVoice] = useState('my-MM-ThihaNeural');
  const [selectedSpeed, setSelectedSpeed] = useState('+15%');
  const [selectedRatio, setSelectedRatio] = useState('original');
  const [enableSubtitles, setEnableSubtitles] = useState(true);
  const [enableBlur, setEnableBlur] = useState(true);
  const [blurPosition, setBlurPosition] = useState<'lower' | 'center' | 'bottom'>('lower');
  const [watermarkText, setWatermarkText] = useState('');
  const [includeOriginalAudio, setIncludeOriginalAudio] = useState(false);

  // Job & Progress
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<OneClickJobStatus | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Script & Output
  const [transcript, setTranscript] = useState<OneClickTranscript | null>(null);
  const [copiedScript, setCopiedScript] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoPlayerRef = useRef<HTMLVideoElement>(null);
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
    };
  }, [filePreviewUrl]);

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
    setError(null);
    setJobId(null);
    setJobStatus(null);
    setTranscript(null);
  }, [filePreviewUrl]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) handleFileSelect(e.target.files[0]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.[0]) handleFileSelect(e.dataTransfer.files[0]);
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
          watermarkText: watermarkText.trim(),
          includeOriginalAudio,
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

            {/* If video is selected, show summary preview card */}
            {hasVideo && !isProcessing && !isUploading ? (
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
                      <span>✓</span> Video Ready for Settings
                    </p>
                  </div>
                </div>

                <span className="px-3 py-1 rounded-xl bg-emerald-500/10 text-emerald-500 text-xs font-bold whitespace-nowrap">
                  Ready
                </span>
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

          {/* Step 2: Settings Card (Always visible or highlighted when video is ready) */}
          <div className={`rounded-3xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 p-6 shadow-sm transition-all space-y-6 ${!hasVideo ? 'opacity-60 pointer-events-none' : ''}`}>
            <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100 dark:border-zinc-800/80">
              <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold">
                2
              </span>
              <h2 className="text-sm font-bold text-slate-800 dark:text-zinc-100">
                Step 2: Recap Settings ချိန်ညှိပါ
              </h2>
            </div>

            {/* 1. Voice & Speed */}
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block mb-2">
                  🎙️ အသံရွေးချယ်မှု (Voice Model)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {[
                    { id: 'my-MM-ThihaNeural', name: 'Thiha (သီဟ)', gender: 'Male', description: 'ရုပ်ရှင်ဇာတ်လမ်းပြော တည်ငြိမ်သော ယောက်ျားသံ (Movie Recap)' },
                    { id: 'my-MM-NilarNeural', name: 'Nilar (နီလာ)', gender: 'Female', description: 'ဇာတ်လမ်းပြော ချိုသာကြည်လင်သော မိန်းမသံ (Soft Story)' },
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

            {/* 2. Subtitles & Blur Position */}
            <div className="pt-4 border-t border-slate-100 dark:border-zinc-800/80 space-y-4">
              <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block">
                ✨ စာတန်းထိုးနှင့် Blur ဆက်တင်များ
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

              {/* Blur Position Selector (When Blur is Enabled) */}
              {enableBlur && (
                <div className="p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-500/5 border border-indigo-200 dark:border-indigo-500/20 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
                      <span>🎯</span> Blur အုပ်မည့် စာသားနေရာ (Subtitle Position)
                    </span>
                    <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold">
                      TikTok မူရင်းစာတန်း မလွဲစေရန်
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'lower', label: 'TikTok အောက်ပိုင်း (70%-85%)', tip: 'TikTok Auto-Captions အများစုအတွက် (Default)' },
                      { id: 'center', label: 'ဖန်သားပြင် အလယ် (50%-70%)', tip: 'အလယ်ဗဟို စာတန်းများအတွက်' },
                      { id: 'bottom', label: 'အောက်ခြေစွန်း (80%-95%)', tip: 'Landscape ရုပ်ရှင် စာတန်းများအတွက်' },
                    ].map((bp) => (
                      <button
                        key={bp.id}
                        type="button"
                        onClick={() => setBlurPosition(bp.id as any)}
                        className={`p-2.5 rounded-xl border text-center transition-all
                          ${blurPosition === bp.id
                            ? 'border-indigo-500 bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 font-bold shadow-sm'
                            : 'border-transparent hover:border-slate-200 dark:hover:border-zinc-700 text-slate-600 dark:text-zinc-400 text-xs'
                          }`}>
                        <span className="block text-xs">{bp.label}</span>
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
