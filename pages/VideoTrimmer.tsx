
import React, { useState, useRef } from 'react';
import { analyzeDocument } from '../services/geminiService';
import { CREDIT_COSTS, ContentType } from '../types';

interface VideoTrimmerProps {
  onSpendCredits: (amount: number) => boolean;
}

interface Highlight {
  start: number;
  end: number;
  reason: string;
}

const VideoTrimmer: React.FC<VideoTrimmerProps> = ({ onSpendCredits }) => {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [isTrimming, setIsTrimming] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setVideoFile(e.target.files[0]);
      setResultUrl(null);
      setHighlights([]);
    }
  };

  const analyzeVideo = async () => {
    if (!videoFile) return;

    if (!onSpendCredits(CREDIT_COSTS[ContentType.VIDEO_TRIMMER])) {
      setError("Insufficient credits!");
      return;
    }

    setIsAnalyzing(true);
    setError(null);

    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(videoFile);
      });
      const base64 = await base64Promise;

      const prompt = `Analyze this video and identify 3 potential viral highlights or interesting moments.
      Return the results as a JSON array of objects with 'start' (seconds), 'end' (seconds), and 'reason' (short description).
      Example: [{"start": 10, "end": 25, "reason": "Exciting action sequence"}]`;

      const result = await analyzeDocument(base64, videoFile.type, prompt, "You are a viral video editor.");
      
      // Extract JSON from response
      const jsonMatch = result.match(/\[.*\]/s);
      if (jsonMatch) {
        setHighlights(JSON.parse(jsonMatch[0]));
      } else {
        throw new Error("Could not parse AI suggestions. Please try again.");
      }
    } catch (err: any) {
      setError(err.message || "AI Analysis failed");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const trimHighlight = async (highlight: Highlight) => {
    if (!videoFile || !videoRef.current || !canvasRef.current) return;

    setIsTrimming(true);
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
    const chunks: Blob[] = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      setResultUrl(URL.createObjectURL(blob));
      setIsTrimming(false);
    };

    video.currentTime = highlight.start;
    await video.play();
    recorder.start();

    const renderFrame = () => {
      if (video.currentTime >= highlight.end || video.paused || video.ended) {
        video.pause();
        recorder.stop();
        return;
      }

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      requestAnimationFrame(renderFrame);
    };

    renderFrame();
  };

  return (
    <div className="max-w-4xl mx-auto pb-10">
      <div className="flex items-center gap-2 mb-6">
        <div className="w-8 h-8 bg-orange-600 rounded-lg flex items-center justify-center shadow-lg">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758L5 19m0-14l4.121 4.121" />
          </svg>
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Smart Video Trimmer</h1>
          <p className="text-slate-500 dark:text-zinc-400 text-[10px] font-bold uppercase tracking-widest">AI Highlight Extraction • {CREDIT_COSTS[ContentType.VIDEO_TRIMMER]} Credits</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="glass p-6 rounded-2xl border border-white/5 space-y-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 dark:text-zinc-500">Video Source</h3>
            <input type="file" accept="video/*" onChange={handleVideoUpload} className="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-[10px] file:font-black file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100" />
            
            <button 
              onClick={analyzeVideo}
              disabled={isAnalyzing || !videoFile}
              className={`w-full py-4 rounded-xl font-black text-xs uppercase tracking-[0.2em] transition-all shadow-xl ${
                isAnalyzing || !videoFile
                  ? 'bg-slate-100 dark:bg-white/5 text-slate-400 cursor-not-allowed'
                  : 'bg-orange-600 hover:bg-orange-500 text-white shadow-orange-600/20 active:scale-95'
              }`}
            >
              {isAnalyzing ? 'Analyzing Video Content...' : 'AI Suggest Highlights'}
            </button>
          </div>

          {highlights.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-zinc-500 px-2">AI Suggested Highlights</h3>
              {highlights.map((h, i) => (
                <div key={i} className="glass p-4 rounded-xl border border-white/5 flex justify-between items-center group hover:border-orange-500/50 transition-all">
                  <div>
                    <p className="text-xs font-bold text-slate-900 dark:text-white">{h.reason}</p>
                    <p className="text-[10px] text-slate-500 font-mono">{h.start}s - {h.end}s ({(h.end - h.start).toFixed(1)}s)</p>
                  </div>
                  <button 
                    onClick={() => trimHighlight(h)}
                    disabled={isTrimming}
                    className="px-3 py-1.5 bg-orange-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-orange-500 transition-all"
                  >
                    Trim
                  </button>
                </div>
              ))}
            </div>
          )}

          {error && <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-500 text-xs font-bold text-center uppercase tracking-widest">{error}</div>}
        </div>

        <div className="space-y-4">
          <div className="glass p-4 rounded-2xl border border-white/5 aspect-video flex items-center justify-center bg-black overflow-hidden relative">
            <video 
              ref={videoRef} 
              src={videoFile ? URL.createObjectURL(videoFile) : undefined} 
              className="w-full h-full object-contain" 
              controls 
            />
            <canvas ref={canvasRef} className="hidden" />
          </div>

          {isTrimming && (
            <div className="py-4 text-center space-y-2">
              <div className="w-8 h-8 border-4 border-orange-500/20 border-t-orange-500 rounded-full animate-spin mx-auto"></div>
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Trimming Highlight...</p>
            </div>
          )}

          {resultUrl && (
            <div className="glass p-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 animate-in zoom-in-95">
              <div className="flex justify-between items-center mb-4">
                <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Highlight Extracted</span>
                <a href={resultUrl} download="highlight.webm" className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500 transition-all">Download Clip</a>
              </div>
              <video src={resultUrl} controls className="w-full rounded-xl shadow-2xl" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VideoTrimmer;
