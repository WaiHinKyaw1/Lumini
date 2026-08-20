
import React, { useState, useRef, useEffect } from 'react';
import { analyzeDocumentStream } from '../services/geminiService';
import { CREDIT_COSTS, ContentType, JsonValue, JsonRecord } from '../types';
import { auth } from '../services/firebase';
import { logGeneration } from '../services/supabase';
import { ModuleLogHistory } from '../components/ModuleLogHistory';
import { RecentHistory } from '../components/RecentHistory';


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
  const [refreshTrigger, setRefreshTrigger] = useState(0);
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

  // Recent-task restore: re-apply the recap configuration from a previous task
  const handleRestoreInsights = (input: JsonValue) => {
    if (!input || typeof input !== 'object') return;
    if (typeof (input as JsonRecord).targetLang === 'string') setTargetLang((input as JsonRecord).targetLang as string);
    if ((input as JsonRecord).perspective === '1ST PERSON' || (input as JsonRecord).perspective === '3RD PERSON') setPerspective((input as JsonRecord).perspective as '1ST PERSON' | '3RD PERSON');
    const tone = (input as JsonRecord).tone;
    if (['PROFESSIONAL', 'EXTREME', 'SARCASTIC', 'EMOTIONAL', 'MYSTERY', 'COMEDY'].includes(String(tone))) setTone(String(tone) as never);
    const recapType = (input as JsonRecord).recapType;
    if (['DEFAULT', 'DOCUMENTARY', 'MOVIE RECAP', 'CRAFTING'].includes(String(recapType))) setRecapType(String(recapType) as never);
    setResult(null);
    setError(null);
  };

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
        const secs = Math.floor((media as HTMLVideoElement).duration);
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

      const currentUser = auth.currentUser;
      if (currentUser) {
        await logGeneration(
          currentUser.uid,
          currentUser.email || '',
          'recap_insights',
          { fileName: file.name, fileSize: file.size, targetLang, perspective, tone, recapType },
          { resultLength: fullRecap.length, textPreview: fullRecap.substring(0, 150) + "..." }
        );
        window.dispatchEvent(
          new CustomEvent('lumini:taskLogged', {
            detail: { module: 'recap_insights', input: { fileName: file.name, targetLang, perspective, tone, recapType } },
          })
        );
        setRefreshTrigger(prev => prev + 1);
      }

    } catch (err: unknown) {
      if (isMounted.current) {
        setError((err as { message?: string })?.message || "Recap generation failed. Please try a smaller file.");
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
    <div className="module-page max-w-xl mx-auto pb-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2.5 rounded-xl bg-accent/10 flex items-center justify-center">
          <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
          </svg>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white !mb-0">AI Recapper</h1>
          <p className="text-xs text-slate-500 dark:text-zinc-300 mt-1">Viral Scripts • {CREDIT_COSTS[ContentType.VIDEO_INSIGHTS]} Credits</p>
        </div>
      </div>

      <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#0c0c0e] border border-gray-200 dark:border-white/10 space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div
          onClick={() => fileInputRef.current?.click()}
          className={`relative group border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
            file
              ? 'border-accent bg-accent/5'
              : 'border-gray-300 dark:border-white/10 hover:border-accent/40 hover:bg-gray-50 dark:hover:bg-white/5'
          }`}
        >
          {file ? (
            <div className="flex items-center justify-center gap-4">
              <div className="w-12 h-12 bg-accent rounded-xl flex items-center justify-center text-white">
                {file.type.startsWith('video') ? (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                ) : (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" /></svg>
                )}
              </div>
              <div className="text-left overflow-hidden">
                <p className="text-[10px] font-bold uppercase tracking-wide text-accent animate-pulse !mb-0">{file.type.startsWith('video') ? 'Video' : 'Audio'} Analysis Active</p>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate max-w-[200px] !mb-0">{file.name}</h3>
                <span className="text-[10px] text-slate-500 dark:text-zinc-400 font-mono !mb-0">{duration}</span>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="w-12 h-12 bg-gray-100 dark:bg-white/5 rounded-xl flex items-center justify-center mx-auto text-slate-400 dark:text-zinc-600 group-hover:text-accent group-hover:scale-110 transition-all">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
              </div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400 !mb-0 px-2">Inject Media Stream</p>
              <p className="text-[10px] font-semibold text-slate-400 dark:text-zinc-700 uppercase tracking-wide !mb-0">RAW MATRIX DATA • MP4, WAV, MOV</p>
            </div>
          )}
          <input ref={fileInputRef} type="file" accept="video/*,audio/*,.mp4,.mov,.mkv,.mp3,.wav,.m4a" onChange={handleFileChange} className="hidden" />
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-zinc-400 px-1 !mb-0">Content Archetype</label>
          <div className="grid grid-cols-2 gap-2">
            {recapOptions.map((option) => (
              <button
                key={option.id}
                onClick={() => setRecapType(option.id)}
                className={`py-2 px-2 rounded-lg border text-[10px] font-bold uppercase tracking-wide transition-all !mb-0 ${
                  recapType === option.id
                    ? 'bg-accent border-accent text-white'
                    : 'bg-transparent border-gray-200 dark:border-white/10 text-slate-500 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-white/5'
                }`}
              >
                {option.title}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-zinc-400 px-1 !mb-0">Linguistic Output</label>
            <select
              value={targetLang}
              onChange={(e) => setTargetLang(e.target.value)}
              className="w-full bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-zinc-100 uppercase tracking-wide outline-none focus:ring-2 focus:ring-accent transition-all cursor-pointer"
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
             <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-zinc-400 px-1 !mb-0">Perspective Shift</label>
             <div className="grid grid-cols-2 gap-2">
               {(['1ST PERSON', '3RD PERSON'] as Perspective[]).map((p) => (
                 <button
                   key={p}
                   onClick={() => setPerspective(p)}
                   className={`py-2 px-2 rounded-lg text-[10px] font-bold uppercase tracking-wide border transition-all !mb-0 ${
                     perspective === p
                       ? 'bg-accent border-accent text-white'
                       : 'bg-transparent border-gray-200 dark:border-white/10 text-slate-500 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-white/5'
                   }`}
                 >
                   {p}
                 </button>
               ))}
             </div>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-zinc-400 px-1 !mb-0">Emotional Spectrum</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {tones.map((t) => (
              <button
                key={t}
                onClick={() => setTone(t)}
                className={`py-2 px-2 rounded-lg text-[10px] font-bold uppercase tracking-wide border transition-all !mb-0 ${
                  tone === t
                    ? 'bg-accent border-accent text-white'
                    : 'bg-transparent border-gray-200 dark:border-white/10 text-slate-500 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-white/5'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="pt-1">
          <button
            onClick={handleProcess} aria-label="ဗီဒီယို Analysis စတင်ရန်"
            disabled={!file || isProcessing}
            className={`w-full py-2 px-4 rounded-lg text-xs font-bold uppercase tracking-wide transition-all ${
              isProcessing
                ? 'bg-gray-100 dark:bg-white/5 text-slate-400 cursor-not-allowed'
                : !file
                ? 'bg-gray-100 dark:bg-white/5 text-slate-400 cursor-not-allowed border border-gray-200 dark:border-white/10'
                : 'bg-accent hover:bg-accent-hover text-white active:scale-95'
            }`}
          >
            {isProcessing ? (
              <div className="space-y-3">
                <div className="animate-pulse">DECODING STREAM... {progress}%</div>
                <div className="w-full bg-gray-200 dark:bg-white/10 rounded-full h-1 overflow-hidden">
                  <div className="bg-accent h-full shadow-[0_0_8px_rgba(225,29,72,0.6)] transition-all duration-300" style={{ width: `${progress}%` }}></div>
                </div>
              </div>
            ) : !file ? 'Awaiting Data Module' : 'Execute Script Synthesis'}
          </button>

          {file && (
             <button onClick={reset} className="w-full mt-3 text-[10px] font-bold text-slate-500 dark:text-zinc-700 hover:text-accent uppercase tracking-wide transition-colors !mb-0">
               RESET MODULE
             </button>
          )}
        </div>
      </div>

      {result && !isProcessing && (
        <div className="mt-4 animate-in slide-in-from-bottom-6 duration-700">
          <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#0c0c0e] border border-gray-200 dark:border-white/10">
            <div className="flex justify-between items-center mb-4 pb-4 border-b border-gray-200 dark:border-white/10">
               <div className="space-y-1">
                  <h3 className="text-[10px] font-bold text-accent uppercase tracking-wide !mb-0">Synthesis Result</h3>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white uppercase tracking-tight !mb-0">{recapType} Master Script</h2>
               </div>
               <button
                onClick={() => navigator.clipboard.writeText(result)}
                className="flex items-center gap-2 px-4 py-2 bg-accent/10 text-accent hover:bg-accent hover:text-white rounded-lg text-[10px] font-bold uppercase tracking-wide transition-all !mb-0 border border-accent/20"
               >
                 <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                 COPY STREAM
               </button>
            </div>
            <div className="prose prose-sm dark:prose-invert max-w-none text-slate-700 dark:text-zinc-200 text-sm leading-[1.8] max-h-[500px] overflow-y-auto pr-4 custom-scrollbar">
              {result.split('\n').map((line, i) => (
                <p key={i} className="mb-4 whitespace-pre-wrap">{line}</p>
              ))}
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-3 p-3 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-xl text-center animate-in fade-in">
          <p className="text-xs font-bold text-rose-500 uppercase tracking-wide !mb-0">{error}</p>
        </div>
      )}

      <RecentHistory moduleName="recap_insights" onRestore={handleRestoreInsights} />
      <div className="mt-3" />
      <ModuleLogHistory moduleName="recap_insights" refreshTrigger={refreshTrigger} />
    </div>
  );
};

export default VideoInsights;
