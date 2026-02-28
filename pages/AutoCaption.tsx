
import React, { useState, useRef, useEffect } from 'react';
import { CREDIT_COSTS, ContentType } from '../types';

interface AutoCaptionProps {
  onSpendCredits: (amount: number) => boolean;
}

interface SubtitleLine {
  start: number;
  end: number;
  text: string;
}

const AutoCaption: React.FC<AutoCaptionProps> = ({ onSpendCredits }) => {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [srtContent, setSrtContent] = useState('');
  const [subtitles, setSubtitles] = useState<SubtitleLine[]>([]);
  const [isBurning, setIsBurning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const parseSRT = (content: string): SubtitleLine[] => {
    const lines = content.split('\n');
    const subs: SubtitleLine[] = [];
    let current: Partial<SubtitleLine> = {};

    const timeToSeconds = (timeStr: string) => {
      const [hms, ms] = timeStr.split(',');
      const [h, m, s] = hms.split(':').map(Number);
      return h * 3600 + m * 60 + s + Number(ms) / 1000;
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      if (line.includes(' --> ')) {
        const [start, end] = line.split(' --> ');
        current.start = timeToSeconds(start);
        current.end = timeToSeconds(end);
      } else if (isNaN(Number(line))) {
        current.text = (current.text ? current.text + '\n' : '') + line;
      }

      if (current.start !== undefined && current.end !== undefined && current.text && (i === lines.length - 1 || lines[i+1].trim() === '')) {
        subs.push(current as SubtitleLine);
        current = {};
      }
    }
    return subs;
  };

  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setVideoFile(e.target.files[0]);
      setResultUrl(null);
    }
  };

  const handleSrtUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const reader = new FileReader();
      reader.onload = () => {
        const content = reader.result as string;
        setSrtContent(content);
        setSubtitles(parseSRT(content));
      };
      reader.readAsText(e.target.files[0]);
    }
  };

  const startBurning = async () => {
    if (!videoFile || !subtitles.length || !canvasRef.current || !videoRef.current) return;

    if (!onSpendCredits(CREDIT_COSTS[ContentType.AUTO_CAPTION])) {
      setError("Insufficient credits!");
      return;
    }

    setIsBurning(true);
    setProgress(0);
    chunksRef.current = [];

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas dimensions to video dimensions
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      setResultUrl(URL.createObjectURL(blob));
      setIsBurning(false);
      setProgress(100);
    };

    video.currentTime = 0;
    await video.play();
    recorder.start();

    const renderFrame = () => {
      if (video.paused || video.ended) {
        recorder.stop();
        return;
      }

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Draw Subtitles
      const currentTime = video.currentTime;
      const currentSub = subtitles.find(s => currentTime >= s.start && currentTime <= s.end);

      if (currentSub) {
        ctx.font = `bold ${Math.floor(canvas.height * 0.05)}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        
        const lines = currentSub.text.split('\n');
        const padding = 20;
        const lineHeight = Math.floor(canvas.height * 0.06);
        
        lines.forEach((line, index) => {
          const y = canvas.height - 50 - (lines.length - 1 - index) * lineHeight;
          
          // Text Shadow/Outline
          ctx.strokeStyle = 'black';
          ctx.lineWidth = 6;
          ctx.strokeText(line, canvas.width / 2, y);
          
          ctx.fillStyle = 'yellow';
          ctx.fillText(line, canvas.width / 2, y);
        });
      }

      setProgress(Math.floor((video.currentTime / video.duration) * 100));
      requestAnimationFrame(renderFrame);
    };

    renderFrame();
  };

  return (
    <div className="max-w-4xl mx-auto pb-10">
      <div className="flex items-center gap-2 mb-6">
        <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center shadow-lg">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
          </svg>
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Auto-Caption Burner</h1>
          <p className="text-slate-500 dark:text-zinc-400 text-[10px] font-bold uppercase tracking-widest">Hardcode Subtitles • {CREDIT_COSTS[ContentType.AUTO_CAPTION]} Credits</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="glass p-6 rounded-2xl border border-white/5 space-y-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 dark:text-zinc-500">Source Assets</h3>
            
            <div className="space-y-2">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">Video File</label>
              <input type="file" accept="video/*" onChange={handleVideoUpload} className="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-[10px] file:font-black file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100" />
            </div>

            <div className="space-y-2">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">SRT Subtitle File</label>
              <input type="file" accept=".srt" onChange={handleSrtUpload} className="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-[10px] file:font-black file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100" />
            </div>

            <button 
              onClick={startBurning}
              disabled={isBurning || !videoFile || !subtitles.length}
              className={`w-full py-4 rounded-xl font-black text-xs uppercase tracking-[0.2em] transition-all shadow-xl ${
                isBurning || !videoFile || !subtitles.length
                  ? 'bg-slate-100 dark:bg-white/5 text-slate-400 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20 active:scale-95'
              }`}
            >
              {isBurning ? `Burning Subtitles (${progress}%)` : 'Start Burn Process'}
            </button>
          </div>

          {error && <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-500 text-xs font-bold text-center uppercase tracking-widest">{error}</div>}
        </div>

        <div className="space-y-4">
          <div className="glass p-4 rounded-2xl border border-white/5 aspect-video flex items-center justify-center bg-black overflow-hidden relative">
            <video 
              ref={videoRef} 
              src={videoFile ? URL.createObjectURL(videoFile) : undefined} 
              className="hidden" 
              muted 
              playsInline
            />
            <canvas ref={canvasRef} className="w-full h-full object-contain" />
            
            {!videoFile && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500">
                <svg className="w-12 h-12 mb-2 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                <span className="text-[10px] font-bold uppercase tracking-widest">Preview Monitor</span>
              </div>
            )}
          </div>

          {resultUrl && (
            <div className="glass p-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 animate-in zoom-in-95">
              <div className="flex justify-between items-center mb-4">
                <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Processing Complete</span>
                <a href={resultUrl} download="captioned_video.webm" className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500 transition-all">Download Video</a>
              </div>
              <video src={resultUrl} controls className="w-full rounded-xl shadow-2xl" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AutoCaption;
