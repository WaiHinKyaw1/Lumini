import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { LoadingSpinner } from '../components/LoadingSpinner';
import {
  checkOneClickHealth,
  startOneClickJob,
  getOneClickJobStatus,
  getOneClickDownloadUrl,
  getOneClickStreamUrl,
  getOneClickSrtDownloadUrl,
  getOneClickTranscript,
  fetchOneClickUrlVideo,
  extractCleanUrl,
  type OneClickJobStatus,
  type OneClickHealthResponse,
  type OneClickTranscript,
} from '../services/oneclickApi';
import {
  Upload,
  Video,
  Play,
  Pause,
  Download,
  RefreshCw,
  FileText,
  Volume2,
  Sparkles,
  Clapperboard,
  SlidersHorizontal,
  Copy,
  Check,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface DramaDubbingProps {
  onSpendCredits: (amount: number) => boolean;
  onNavigate?: (path: string) => void;
}

type DubbingMode = 'drama_dialogue' | 'drama_recap';

const VOICES = [
  { id: 'my-MM-KingBurma', name: 'King Burma', tag: 'Male Lead / CEO' },
  { id: 'my-MM-ZawNeural', name: 'Zaw', tag: 'Boss / Authority' },
  { id: 'my-MM-ThihaNeural', name: 'Thiha', tag: 'Young Action' },
  { id: 'my-MM-NilarNeural', name: 'Nilar', tag: 'Female Lead' },
  { id: 'fenrir', name: 'Gemini Fenrir', tag: 'Cinematic Recap' },
];

const DramaDubbing: React.FC<DramaDubbingProps> = ({ onSpendCredits }) => {
  const [serverStatus, setServerStatus] = useState<OneClickHealthResponse | null>(null);
  const [isCheckingServer, setIsCheckingServer] = useState(true);

  // Input
  const [inputMode, setInputMode] = useState<'upload' | 'url'>('url');
  const [videoUrl, setVideoUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isFetchingUrl, setIsFetchingUrl] = useState(false);
  const [tempId, setTempId] = useState<string | null>(null);

  // Dubbing Settings
  const [dubbingMode, setDubbingMode] = useState<DubbingMode>('drama_dialogue');
  const [selectedVoice, setSelectedVoice] = useState('my-MM-KingBurma');
  const [selectedSpeed, setSelectedSpeed] = useState('+0%');
  const [bgmVolume, setBgmVolume] = useState(18);

  // Subtitles & Masking
  const [enableSubtitles, setEnableSubtitles] = useState(true);
  const [enableBlur, setEnableBlur] = useState(true);
  const [blurPosition, setBlurPosition] = useState(82);
  const [subtitleY, setSubtitleY] = useState(82);

  // Preview Player
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const [previewDuration, setPreviewDuration] = useState(0);
  const [previewCurrentTime, setPreviewCurrentTime] = useState(0);
  const [previewIsPlaying, setPreviewIsPlaying] = useState(false);

  // Job Execution
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<OneClickJobStatus | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [transcript, setTranscript] = useState<OneClickTranscript | null>(null);
  const [isCopiedScript, setIsCopiedScript] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Health
  const checkHealth = useCallback(async () => {
    setIsCheckingServer(true);
    try {
      const res = await checkOneClickHealth();
      setServerStatus(res);
    } catch {
      setServerStatus(null);
    } finally {
      setIsCheckingServer(false);
    }
  }, []);

  useEffect(() => {
    checkHealth();
  }, [checkHealth]);

  useEffect(() => {
    return () => {
      if (filePreviewUrl && filePreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(filePreviewUrl);
      }
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [filePreviewUrl]);

  // Check URL types
  const isTikTok = useMemo(() => /tiktok\.com|douyin\.com/i.test(videoUrl.trim()), [videoUrl]);
  const isYouTube = useMemo(() => /(?:youtu\.be\/|youtube\.com\/)/i.test(videoUrl.trim()), [videoUrl]);

  const youtubeEmbedUrl = useMemo(() => {
    const match = videoUrl.trim().match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/i);
    return match ? `https://www.youtube.com/embed/${match[1]}?autoplay=0` : null;
  }, [videoUrl]);

  // Drop
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f && f.type.startsWith('video/')) {
      if (f.size > 500 * 1024 * 1024) {
        toast.error('Max file size is 500MB');
        return;
      }
      setFile(f);
      setTempId(null);
      if (filePreviewUrl && filePreviewUrl.startsWith('blob:')) URL.revokeObjectURL(filePreviewUrl);
      setFilePreviewUrl(URL.createObjectURL(f));
      toast.success(f.name);
    }
  }, [filePreviewUrl]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      if (f.size > 500 * 1024 * 1024) {
        toast.error('Max file size is 500MB');
        return;
      }
      setFile(f);
      setTempId(null);
      if (filePreviewUrl && filePreviewUrl.startsWith('blob:')) URL.revokeObjectURL(filePreviewUrl);
      setFilePreviewUrl(URL.createObjectURL(f));
      toast.success(f.name);
    }
  };

  // Optional Fetch Preview
  const handleFetchUrl = async () => {
    const clean = extractCleanUrl(videoUrl);
    if (!clean) return;
    setIsFetchingUrl(true);
    try {
      const res = await fetchOneClickUrlVideo(clean);
      setTempId(res.temp_id);
      setFile(null);
      setFilePreviewUrl(res.preview_url);
      toast.success('Video loaded');
    } catch {
      // If server fetch fails, keep raw URL so backend downloads directly at start
      toast('Preview direct embed active');
    } finally {
      setIsFetchingUrl(false);
    }
  };

  // Player controls
  const togglePlay = () => {
    if (!previewVideoRef.current) return;
    if (previewVideoRef.current.paused) {
      previewVideoRef.current.play().then(() => setPreviewIsPlaying(true)).catch(() => {});
    } else {
      previewVideoRef.current.pause();
      setPreviewIsPlaying(false);
    }
  };

  // Poll
  const pollStatus = useCallback((id: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const s = await getOneClickJobStatus(id);
        setJobStatus(s);
        if (s.status === 'completed') {
          if (pollRef.current) clearInterval(pollRef.current);
          toast.success('Dubbing complete!');
          try {
            const t = await getOneClickTranscript(id);
            setTranscript(t);
          } catch {}
        } else if (s.status === 'failed') {
          if (pollRef.current) clearInterval(pollRef.current);
          toast.error(s.message || s.error || 'Failed');
        }
      } catch {}
    }, 2000);
  }, []);

  // Start Job
  const handleStartDubbing = async () => {
    const cleanUrl = extractCleanUrl(videoUrl);
    if (!file && !tempId && !cleanUrl) {
      toast.error('Please upload a video or enter a link');
      return;
    }
    if (!onSpendCredits(20)) return;

    setIsStarting(true);
    setUploadProgress(0);
    setJobStatus(null);
    setTranscript(null);

    try {
      const resp = await startOneClickJob(
        {
          file: file || undefined,
          tempId: tempId || undefined,
          videoUrl: (!file && !tempId && cleanUrl) ? cleanUrl : undefined,
        },
        {
          voice: selectedVoice,
          speed: selectedSpeed,
          ratio: '9:16',
          enableSubtitles,
          enableBlur,
          blurPosition,
          blurThickness: 12,
          blurWidth: 88,
          blurIntensity: 35,
          subtitleY,
          subtitleStyle: 'font-akkhayar',
          includeOriginalAudio: true,
          bgmVolume: Number((bgmVolume / 100).toFixed(2)),
          sourceLang: 'zh',
          dubbingMode,
        },
        (pct) => setUploadProgress(pct)
      );

      setJobId(resp.job_id);
      toast.success('Processing started');
      pollStatus(resp.job_id);
    } catch (err: any) {
      toast.error(err.message || 'Start failed');
    } finally {
      setIsStarting(false);
    }
  };

  const copyScript = () => {
    if (!transcript?.myanmar_segments) return;
    const text = transcript.myanmar_segments.map((s, i) => `[${i + 1}] ${s.narration}`).join('\n');
    navigator.clipboard.writeText(text);
    setIsCopiedScript(true);
    toast.success('Script copied');
    setTimeout(() => setIsCopiedScript(false), 2000);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <span>Chinese Drama Dubbing</span>
            <span className="text-xs px-2 py-0.5 rounded-md font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">
              Studio 99 & Team Alpha
            </span>
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <div className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 ${
            serverStatus?.online
              ? 'bg-emerald-500/10 text-emerald-500'
              : 'bg-rose-500/10 text-rose-500'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${serverStatus?.online ? 'bg-emerald-500' : 'bg-rose-500'}`} />
            <span>{serverStatus?.online ? 'Engine Ready' : 'Connecting'}</span>
          </div>
          <button
            onClick={checkHealth}
            disabled={isCheckingServer}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isCheckingServer ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Main Studio Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Input & Canvas Preview (6 cols) */}
        <div className="lg:col-span-6 space-y-4">
          {/* Source Tabs */}
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 dark:text-zinc-300">Video Source</span>
              <div className="flex bg-slate-100 dark:bg-zinc-800 p-0.5 rounded-lg text-xs">
                <button
                  type="button"
                  onClick={() => setInputMode('url')}
                  className={`px-3 py-1 rounded-md transition-all ${
                    inputMode === 'url' ? 'bg-white dark:bg-zinc-900 font-bold shadow-sm' : 'text-zinc-400'
                  }`}
                >
                  TikTok / Douyin Link
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode('upload')}
                  className={`px-3 py-1 rounded-md transition-all ${
                    inputMode === 'upload' ? 'bg-white dark:bg-zinc-900 font-bold shadow-sm' : 'text-zinc-400'
                  }`}
                >
                  Upload File
                </button>
              </div>
            </div>

            {inputMode === 'url' ? (
              <div className="flex gap-2">
                <input
                  type="url"
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  placeholder="Paste TikTok, Douyin or Shorts URL..."
                  className="flex-1 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                />
                <button
                  type="button"
                  onClick={handleFetchUrl}
                  disabled={isFetchingUrl || !videoUrl.trim()}
                  className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors whitespace-nowrap"
                >
                  {isFetchingUrl ? 'Loading...' : 'Preview'}
                </button>
              </div>
            ) : (
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={`relative border border-dashed rounded-lg p-5 text-center transition-all ${
                  isDragging ? 'border-amber-500 bg-amber-500/5' : 'border-zinc-700 hover:border-zinc-500'
                }`}
              >
                <input
                  type="file"
                  accept="video/mp4,video/quicktime,video/webm"
                  onChange={handleFileChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <div className="flex flex-col items-center justify-center space-y-1 pointer-events-none">
                  <Upload className="w-5 h-5 text-amber-500" />
                  <p className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                    {file ? file.name : 'Choose MP4 / MOV video'}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Live Preview Box */}
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-zinc-300">
              <span>9:16 Canvas Calibration</span>
              <span className="font-mono text-zinc-400 text-[11px]">
                {previewDuration > 0
                  ? `${Math.floor(previewCurrentTime / 60)}:${String(Math.floor(previewCurrentTime % 60)).padStart(2, '0')}`
                  : '9:16 Vertical'}
              </span>
            </div>

            <div className="relative aspect-[9/16] max-h-[440px] mx-auto bg-black rounded-lg overflow-hidden flex items-center justify-center">
              {filePreviewUrl ? (
                <>
                  <video
                    ref={previewVideoRef}
                    src={filePreviewUrl}
                    preload="metadata"
                    onTimeUpdate={() => {
                      if (previewVideoRef.current) setPreviewCurrentTime(previewVideoRef.current.currentTime);
                    }}
                    onLoadedMetadata={() => {
                      if (previewVideoRef.current) setPreviewDuration(previewVideoRef.current.duration || 0);
                    }}
                    onPlay={() => setPreviewIsPlaying(true)}
                    onPause={() => setPreviewIsPlaying(false)}
                    className="w-full h-full object-contain pointer-events-none"
                    playsInline
                  />

                  {/* Mask Overlay */}
                  {enableBlur && (
                    <div
                      style={{
                        position: 'absolute',
                        top: `${blurPosition - 6}%`,
                        height: '12%',
                        left: '6%',
                        width: '88%',
                      }}
                      className="border border-dashed border-amber-400/80 bg-black/60 backdrop-blur-md flex items-center justify-center pointer-events-none z-10"
                    >
                      <span className="text-[10px] text-amber-300 font-bold bg-black/70 px-1.5 py-0.5 rounded">
                        Chinese Subtitle Mask ({blurPosition}%)
                      </span>
                    </div>
                  )}

                  {/* Subtitle Overlay */}
                  {enableSubtitles && (
                    <div
                      style={{
                        position: 'absolute',
                        top: `${subtitleY}%`,
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        width: '88%',
                      }}
                      className="text-center pointer-events-none z-20"
                    >
                      <span
                        style={{
                          color: '#FFE600',
                          textShadow: '0 0 3px #000, 1px 1px 2px #000, -1px -1px 2px #000',
                          fontSize: '15px',
                          fontWeight: 'bold',
                        }}
                        className="inline-block px-2 py-0.5 bg-black/40 rounded"
                      >
                        {dubbingMode === 'drama_dialogue' ? 'သခင်လေး... ကျမ တောင်းပန်ပါတယ်' : 'ဒီတစ်ခါမှာတော့ သခင်မကြီး ရောက်လာတဲ့အခါ...'}
                      </span>
                    </div>
                  )}

                  <button
                    onClick={togglePlay}
                    className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/30 transition-all z-30 group"
                  >
                    <div className="w-12 h-12 rounded-full bg-black/70 text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                      {previewIsPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                    </div>
                  </button>
                </>
              ) : isTikTok && videoUrl.trim() ? (
                <iframe
                  src={`https://www.tiktok.com/embed/v2/?url=${encodeURIComponent(videoUrl.trim())}`}
                  title="TikTok Preview"
                  className="w-full h-full object-contain border-0"
                  allowFullScreen
                />
              ) : isYouTube && youtubeEmbedUrl ? (
                <iframe
                  src={youtubeEmbedUrl}
                  title="YouTube Preview"
                  className="w-full h-full object-contain border-0"
                  allowFullScreen
                />
              ) : (
                <div className="text-center p-6 text-zinc-500 space-y-1.5">
                  <Clapperboard className="w-10 h-10 mx-auto text-zinc-600" />
                  <p className="text-xs">Preview will appear here</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Controls & Execution (6 cols) */}
        <div className="lg:col-span-6 space-y-4">
          {/* Dubbing Mode */}
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-3.5 space-y-2.5">
            <span className="text-xs font-bold text-slate-700 dark:text-zinc-300">Dubbing Mode</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDubbingMode('drama_dialogue')}
                className={`p-3 rounded-lg border text-left transition-all ${
                  dubbingMode === 'drama_dialogue'
                    ? 'border-amber-500 bg-amber-500/10 text-white font-bold'
                    : 'border-zinc-800 text-zinc-400 hover:border-zinc-700'
                }`}
              >
                <div className="text-xs font-bold text-amber-500">Studio 99</div>
                <div className="text-xs mt-0.5 text-slate-900 dark:text-white">Dialogue Acting</div>
                <div className="text-[10px] text-zinc-400 mt-1">Authentic character voice</div>
              </button>

              <button
                type="button"
                onClick={() => setDubbingMode('drama_recap')}
                className={`p-3 rounded-lg border text-left transition-all ${
                  dubbingMode === 'drama_recap'
                    ? 'border-amber-500 bg-amber-500/10 text-white font-bold'
                    : 'border-zinc-800 text-zinc-400 hover:border-zinc-700'
                }`}
              >
                <div className="text-xs font-bold text-amber-500">Team Alpha</div>
                <div className="text-xs mt-0.5 text-slate-900 dark:text-white">Drama Recap</div>
                <div className="text-[10px] text-zinc-400 mt-1">Fast cliffhanger recap</div>
              </button>
            </div>
          </div>

          {/* Voice Selection */}
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 dark:text-zinc-300">Voice Character</span>
              <span className="text-xs text-amber-500 font-mono font-bold">{selectedVoice}</span>
            </div>

            <div className="grid grid-cols-1 gap-1.5">
              {VOICES.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setSelectedVoice(v.id)}
                  className={`px-3 py-2 rounded-lg border text-left flex items-center justify-between transition-all ${
                    selectedVoice === v.id
                      ? 'border-amber-500 bg-amber-500/10 text-white font-bold'
                      : 'border-zinc-800 text-zinc-400 hover:border-zinc-700'
                  }`}
                >
                  <span className="text-xs text-slate-900 dark:text-white">{v.name}</span>
                  <span className="text-[10px] text-zinc-400">{v.tag}</span>
                </button>
              ))}
            </div>

            {/* Speed */}
            <div className="pt-2 border-t border-zinc-800 flex items-center justify-between text-xs">
              <span className="text-zinc-400">Speed</span>
              <div className="flex gap-1">
                {[
                  { v: '+0%', l: '1.0x' },
                  { v: '+15%', l: '1.15x' },
                  { v: '+25%', l: '1.25x' },
                ].map((s) => (
                  <button
                    key={s.v}
                    type="button"
                    onClick={() => setSelectedSpeed(s.v)}
                    className={`px-2 py-1 rounded text-xs transition-all ${
                      selectedSpeed === s.v ? 'bg-amber-500 text-white font-bold' : 'bg-zinc-800 text-zinc-400'
                    }`}
                  >
                    {s.l}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Sliders: BGM, Blur, Subtitle */}
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-3.5 space-y-3 text-xs">
            {/* Original Sound */}
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-zinc-300 font-medium">Original BGM / SFX</span>
                <span className="font-mono text-amber-500 font-bold">{bgmVolume}%</span>
              </div>
              <input
                type="range"
                min={5}
                max={35}
                value={bgmVolume}
                onChange={(e) => setBgmVolume(Number(e.target.value))}
                className="w-full accent-amber-500 cursor-pointer"
              />
            </div>

            {/* Chinese Blur Bar */}
            <div className="space-y-1 pt-2 border-t border-zinc-800">
              <div className="flex justify-between items-center">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enableBlur}
                    onChange={(e) => setEnableBlur(e.target.checked)}
                    className="accent-amber-500 rounded"
                  />
                  <span className="text-zinc-300 font-medium">Chinese Mask (Blur)</span>
                </label>
                {enableBlur && <span className="font-mono text-amber-500">{blurPosition}% Y</span>}
              </div>
              {enableBlur && (
                <input
                  type="range"
                  min={70}
                  max={92}
                  value={blurPosition}
                  onChange={(e) => setBlurPosition(Number(e.target.value))}
                  className="w-full accent-amber-500 cursor-pointer"
                />
              )}
            </div>

            {/* Subtitles */}
            <div className="space-y-1 pt-2 border-t border-zinc-800">
              <div className="flex justify-between items-center">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enableSubtitles}
                    onChange={(e) => setEnableSubtitles(e.target.checked)}
                    className="accent-amber-500 rounded"
                  />
                  <span className="text-zinc-300 font-medium">Akkhayar 21 Subtitles</span>
                </label>
                {enableSubtitles && <span className="font-mono text-amber-500">{subtitleY}% Y</span>}
              </div>
              {enableSubtitles && (
                <input
                  type="range"
                  min={70}
                  max={92}
                  value={subtitleY}
                  onChange={(e) => setSubtitleY(Number(e.target.value))}
                  className="w-full accent-amber-500 cursor-pointer"
                />
              )}
            </div>
          </div>

          {/* Start Button */}
          <button
            type="button"
            onClick={handleStartDubbing}
            disabled={isStarting || (!file && !tempId && !videoUrl.trim())}
            className="w-full py-3.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-extrabold text-sm rounded-xl shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-2"
          >
            {isStarting ? (
              <>
                <LoadingSpinner size="sm" showLabel={false} />
                <span>Uploading ({uploadProgress}%)...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Start Chinese Dubbing (20 Credits)</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Progress & Output Sandbox */}
      {jobStatus && (
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between text-xs font-bold">
            <span className="text-slate-900 dark:text-white flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${
                jobStatus.status === 'completed'
                  ? 'bg-emerald-500'
                  : jobStatus.status === 'failed'
                  ? 'bg-rose-500'
                  : 'bg-amber-500 animate-ping'
              }`} />
              <span>{jobStatus.message || jobStatus.step}</span>
            </span>
            <span className="font-mono text-amber-500">{Math.max(0, jobStatus.progress)}%</span>
          </div>

          <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                jobStatus.status === 'completed'
                  ? 'bg-emerald-500'
                  : jobStatus.status === 'failed'
                  ? 'bg-rose-500'
                  : 'bg-amber-500'
              }`}
              style={{ width: `${Math.max(4, jobStatus.progress)}%` }}
            />
          </div>

          {jobStatus.status === 'completed' && jobId && (
            <div className="pt-3 border-t border-zinc-800 flex flex-col items-center gap-3">
              <div className="max-w-xs w-full aspect-[9/16] bg-black rounded-lg overflow-hidden shadow-lg">
                <video src={getOneClickStreamUrl(jobId)} controls autoPlay className="w-full h-full object-contain" />
              </div>
              <div className="flex gap-2">
                <a
                  href={getOneClickDownloadUrl(jobId)}
                  download={`drama_${jobId}.mp4`}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download Video
                </a>
                <a
                  href={getOneClickSrtDownloadUrl(jobId)}
                  download={`subs_${jobId}.srt`}
                  className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold text-xs rounded-lg flex items-center gap-1.5"
                >
                  <FileText className="w-3.5 h-3.5" />
                  SRT
                </a>
                {transcript?.myanmar_segments && (
                  <button
                    type="button"
                    onClick={copyScript}
                    className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold text-xs rounded-lg flex items-center gap-1.5"
                  >
                    {isCopiedScript ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{isCopiedScript ? 'Copied' : 'Script'}</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DramaDubbing;