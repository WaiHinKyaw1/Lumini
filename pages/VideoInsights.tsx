
import React, { useState, useRef, useEffect } from 'react';
import { analyzeDocumentStream } from '../services/geminiService';
import { CREDIT_COSTS, ContentType } from '../types';

interface VideoInsightsProps {
  onSpendCredits: (amount: number) => boolean;
}

type Perspective = '1ST PERSON' | '3RD PERSON';
type Tone = 'PROFESSIONAL' | 'EXTREME' | 'SARCASTIC' | 'EMOTIONAL' | 'MYSTERY' | 'COMEDY';
type RecapType = 'DEFAULT' | 'DOCUMENTARY' | 'MOVIE RECAP' | 'CRAFTING';

interface RecapTypeOption {
  id: RecapType;
  title: string;
}

const VideoInsights: React.FC<VideoInsightsProps> = ({ onSpendCredits }) => {
  const [file, setFile] = useState<File | null>(null);
  const [duration, setDuration] = useState<string>('00:00:00');
  const [targetLang, setTargetLang] = useState('BURMESE');
  const [perspective, setPerspective] = useState<Perspective>('3RD PERSON');
  const [tone, setTone] = useState<Tone>('PROFESSIONAL');
  const [recapType, setRecapType] = useState<RecapType>('DEFAULT');
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const recapOptions: RecapTypeOption[] = [
    { id: 'DEFAULT', title: 'DEFAULT' },
    { id: 'DOCUMENTARY', title: 'DOCUMENTARY' },
    { id: 'MOVIE RECAP', title: 'MOVIE RECAP' },
    { id: 'CRAFTING', title: 'CRAFTING' },
  ];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setResult(null);
      setError(null);
      
      const isVideo = selectedFile.type.startsWith('video');
      const media = document.createElement(isVideo ? 'video' : 'audio');
      media.preload = 'metadata';
      media.onloadedmetadata = () => {
        window.URL.revokeObjectURL(media.src);
        const secs = Math.floor((media as any).duration);
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        const s = secs % 60;
        setDuration(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
      };
      media.src = URL.createObjectURL(selectedFile);
    }
  };

  const handleProcess = async () => {
    if (!file) return;
    setError(null);
    setResult(null);

    // Prevent mobile OOM crashes from huge base64 strings
    if (file.size > 50 * 1024 * 1024) {
      setError("File is too large (Max 50MB). Please use a smaller file to prevent mobile browser crashes.");
      return;
    }

    if (!onSpendCredits(CREDIT_COSTS[ContentType.VIDEO_INSIGHTS])) {
      setError("Insufficient credits!");
      return;
    }

    setIsProcessing(true);
    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const base64 = await base64Promise;

      const mediaType = file.type.startsWith('video') ? 'video' : 'audio clip';
      const systemInstruction = `You are a world-class AI Content Strategist and Viral Script Writer. Your goal is to analyze a ${mediaType} and write an engaging recap script. You MUST speak naturally in the target language. Focus on storytelling and viral hooks.`;

      const prompt = `Task: Generate a high-retention RECAP SCRIPT for this ${mediaType}.
Specifications:
- Content Type: ${recapType}
- Language: ${targetLang}
- Point of View: ${perspective}
- Tone: ${tone}

Instructions:
1. Summarize the main hook or exciting moment first.
2. Narrative the key events based on the Content Type: ${recapType}. 
   - If DOCUMENTARY, be educational and grand.
   - If MOVIE RECAP, focus on character motivations and plot twists.
   - If CRAFTING, focus on methodology and progress.
   - If DEFAULT, provide a standard social media recap.
3. Use engaging and culturally relevant phrasing for ${targetLang}.
4. Provide the result in a clean script format.`;

      let fullRecap = "";
      setProgress(10);
      await analyzeDocumentStream(base64, file.type, prompt, systemInstruction, (chunk) => {
        fullRecap += chunk;
        setProgress(prev => Math.min(prev + 5, 95));
        if (isMounted.current) {
          setResult(fullRecap);
        }
      });
      setProgress(100);

    } catch (err: any) {
      if (isMounted.current) {
        setError(err.message || "Recap generation failed. Please try a smaller file.");
      }
    } finally {
      if (isMounted.current) {
        setIsProcessing(false);
      }
    }
  };

  const reset = () => {
    setFile(null);
    setResult(null);
    setError(null);
    setPerspective('3RD PERSON');
    setTone('PROFESSIONAL');
    setTargetLang('BURMESE');
    setRecapType('DEFAULT');
  };

  const tones: Tone[] = ['PROFESSIONAL', 'EXTREME', 'SARCASTIC', 'EMOTIONAL', 'MYSTERY', 'COMEDY'];

  return (
    <div className="max-w-xl mx-auto pb-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-accent rounded-xl flex items-center justify-center shadow-lg shadow-accent/20">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
          </svg>
        </div>
        <div>
          <h1 className="movie-h2 !text-xl !mb-0 uppercase tracking-tighter">AI Recapper</h1>
          <p className="movie-meta !text-[10px] !mb-0 uppercase tracking-widest text-zinc-500">Viral Scripts • {CREDIT_COSTS[ContentType.VIDEO_INSIGHTS]} Credits</p>
        </div>
      </div>

      <div className="glass p-6 rounded-2xl border border-white/5 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 shadow-2xl">
        <div 
          onClick={() => fileInputRef.current?.click()}
          className={`relative group border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
            file 
              ? 'border-accent bg-accent/5' 
              : 'border-white/10 hover:border-accent/40 hover:bg-white/5'
          }`}
        >
          {file ? (
            <div className="flex items-center justify-center gap-4">
              <div className="w-12 h-12 bg-accent shadow-[0_0_15px_rgba(225,29,72,0.3)] rounded-xl flex items-center justify-center text-white">
                {file.type.startsWith('video') ? (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                ) : (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" /></svg>
                )}
              </div>
              <div className="text-left overflow-hidden">
                <p className="movie-meta !text-[10px] uppercase tracking-[0.2em] text-accent animate-pulse !mb-0">{file.type.startsWith('video') ? 'Video' : 'Audio'} Analysis Active</p>
                <h3 className="movie-body !text-[14px] font-bold text-white truncate max-w-[200px] !mb-0">{file.name}</h3>
                <span className="movie-meta !text-[10px] text-zinc-500 font-mono !mb-0">{duration}</span>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center mx-auto text-zinc-600 group-hover:text-accent group-hover:scale-110 transition-all shadow-inner">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
              </div>
              <p className="movie-meta !text-[11px] uppercase tracking-[0.25em] text-zinc-500 !mb-0 px-2">Inject Media Stream</p>
              <p className="movie-meta !text-[9px] text-zinc-700 uppercase tracking-widest !mb-0">RAW MATRIX DATA • MP4, WAV, MOV</p>
            </div>
          )}
          <input ref={fileInputRef} type="file" accept="video/*,audio/*,.mp4,.mov,.mkv,.mp3,.wav,.m4a" onChange={handleFileChange} className="hidden" />
        </div>

        <div className="space-y-3">
          <label className="movie-meta !text-[10px] uppercase tracking-[0.3em] text-zinc-600 px-1 !mb-0">Content Archetype</label>
          <div className="grid grid-cols-2 gap-2">
            {recapOptions.map((option) => (
              <button
                key={option.id}
                onClick={() => setRecapType(option.id)}
                className={`py-3 rounded-xl border movie-meta !text-[10px] uppercase tracking-widest transition-all shadow-lg !mb-0 ${
                  recapType === option.id 
                    ? 'bg-accent border-accent text-white shadow-accent/20' 
                    : 'bg-transparent border-white/5 text-zinc-500 hover:bg-white/5'
                }`}
              >
                {option.title}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="movie-meta !text-[10px] uppercase tracking-[0.3em] text-zinc-600 px-1 !mb-0">Linguistic Output</label>
            <select
              value={targetLang}
              onChange={(e) => setTargetLang(e.target.value)}
              className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 movie-body !text-[14px] text-white uppercase tracking-widest outline-none focus:ring-2 focus:ring-accent transition-all cursor-pointer shadow-inner"
            >
              <option value="BURMESE">BURMESE UNICODE</option>
              <option value="ENGLISH">ENGLISH (GLOBAL)</option>
              <option value="THAI">THAI AUTO</option>
              <option value="CHINESE">CHINESE (NON-TRAD)</option>
              <option value="JAPANESE">JAPANESE (JP)</option>
              <option value="KOREAN">KOREAN (KR)</option>
              <option value="SPANISH">SPANISH (LATIN)</option>
              <option value="FRENCH">FRENCH (EU)</option>
            </select>
          </div>

          <div className="space-y-2">
             <label className="movie-meta !text-[10px] uppercase tracking-[0.3em] text-zinc-600 px-1 !mb-0">Perspective Shift</label>
             <div className="grid grid-cols-2 gap-2">
               {(['1ST PERSON', '3RD PERSON'] as Perspective[]).map((p) => (
                 <button
                   key={p}
                   onClick={() => setPerspective(p)}
                   className={`py-3 rounded-xl movie-meta !text-[10px] uppercase tracking-wide border transition-all !mb-0 ${
                     perspective === p 
                       ? 'bg-accent border-accent text-white shadow-accent/20 shadow-lg' 
                       : 'bg-transparent border-white/5 text-zinc-500 hover:bg-white/5'
                   }`}
                 >
                   {p}
                 </button>
               ))}
             </div>
          </div>
        </div>

        <div className="space-y-3">
          <label className="movie-meta !text-[10px] uppercase tracking-[0.3em] text-zinc-600 px-1 !mb-0">Emotional Spectrum</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {tones.map((t) => (
              <button
                key={t}
                onClick={() => setTone(t)}
                className={`py-3 rounded-xl movie-meta !text-[10px] uppercase tracking-wider border transition-all !mb-0 ${
                  tone === t 
                    ? 'bg-accent border-accent text-white shadow-accent/20 shadow-lg' 
                    : 'bg-transparent border-white/5 text-zinc-500 hover:bg-white/5'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="pt-2">
          <button
            onClick={handleProcess}
            disabled={!file || isProcessing}
            className={`w-full py-4 rounded-xl movie-meta !text-[13px] uppercase tracking-[0.25em] transition-all shadow-2xl ${
              isProcessing 
                ? 'bg-white/5 text-zinc-600 cursor-not-allowed' 
                : !file 
                ? 'bg-white/5 text-zinc-800 cursor-not-allowed border border-white/5' 
                : 'bg-accent hover:bg-accent-hover text-white shadow-accent/20 active:scale-95'
            }`}
          >
            {isProcessing ? (
              <div className="space-y-3">
                <div className="animate-pulse">DECODING STREAM... {progress}%</div>
                <div className="w-full bg-white/5 rounded-full h-1 shadow-inner overflow-hidden">
                  <div className="bg-accent h-full shadow-[0_0_8px_rgba(225,29,72,0.6)] transition-all duration-300" style={{ width: `${progress}%` }}></div>
                </div>
              </div>
            ) : !file ? 'Awaiting Data Module' : 'Execute Script Synthesis'}
          </button>
          
          {file && (
             <button onClick={reset} className="w-full mt-4 movie-meta !text-[10px] text-zinc-700 hover:text-accent uppercase tracking-[0.3em] transition-colors !mb-0">
               RESET MODULE
             </button>
          )}
        </div>
      </div>

      {result && !isProcessing && (
        <div className="mt-8 animate-in slide-in-from-bottom-6 duration-700">
          <div className="glass p-8 rounded-2xl border border-white/10 shadow-2xl">
            <div className="flex justify-between items-center mb-6 pb-6 border-b border-white/5">
               <div className="space-y-1">
                  <h3 className="movie-meta !text-[10px] text-accent uppercase tracking-[0.3em] !mb-0">Synthesis Result</h3>
                  <h2 className="movie-h2 !text-lg uppercase tracking-tight !mb-0">{recapType} Master Script</h2>
               </div>
               <button 
                onClick={() => navigator.clipboard.writeText(result)}
                className="flex items-center gap-2 px-5 py-3 bg-accent/10 text-accent hover:bg-accent hover:text-white rounded-xl movie-meta !text-[10px] uppercase tracking-widest transition-all shadow-lg !mb-0 border border-accent/20"
               >
                 <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                 COPY STREAM
               </button>
            </div>
            <div className="prose prose-sm dark:prose-invert max-w-none text-zinc-300 movie-body !text-[14px] leading-[1.8] max-h-[500px] overflow-y-auto pr-4 custom-scrollbar">
              {result.split('\n').map((line, i) => (
                <p key={i} className="mb-4 whitespace-pre-wrap">{line}</p>
              ))}
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-center shadow-lg animate-in fade-in">
          <p className="movie-meta !text-[11px] text-rose-500 uppercase tracking-widest !mb-0">{error}</p>
        </div>
      )}
    </div>
  );
};

export default VideoInsights;
