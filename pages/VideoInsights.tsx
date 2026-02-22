
import React, { useState, useRef } from 'react';
import { analyzeDocument } from '../services/geminiService';
import { CREDIT_COSTS, ContentType, GenerationResult } from '../types';
import HistoryList from '../components/HistoryList';

interface VideoInsightsProps {
  onSpendCredits: (amount: number) => boolean;
  onSaveResult: (result: Omit<GenerationResult, 'id' | 'timestamp'>) => void;
  history: GenerationResult[];
  onDelete: (id: string) => void;
}

type Perspective = '1ST PERSON' | '3RD PERSON';
type Tone = 'PROFESSIONAL' | 'EXTREME' | 'SARCASTIC' | 'EMOTIONAL' | 'MYSTERY' | 'COMEDY';
type RecapType = 'DEFAULT' | 'DOCUMENTARY' | 'MOVIE RECAP' | 'CRAFTING';

interface RecapTypeOption {
  id: RecapType;
  title: string;
}

const VideoInsights: React.FC<VideoInsightsProps> = ({ onSpendCredits, onSaveResult, history, onDelete }) => {
  const [file, setFile] = useState<File | null>(null);
  const [duration, setDuration] = useState<string>('00:00:00');
  const [targetLang, setTargetLang] = useState('BURMESE');
  const [perspective, setPerspective] = useState<Perspective>('3RD PERSON');
  const [tone, setTone] = useState<Tone>('PROFESSIONAL');
  const [recapType, setRecapType] = useState<RecapType>('DEFAULT');
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const recapOptions: RecapTypeOption[] = [
    { id: 'DEFAULT', title: 'DEFAULT' },
    { id: 'DOCUMENTARY', title: 'DOCUMENTARY' },
    { id: 'MOVIE RECAP', title: 'MOVIE RECAP' },
    { id: 'CRAFTING', title: 'CRAFTING' },
  ];

  const handleHistorySelect = (item: GenerationResult) => {
    if (item.content) setResult(item.content);
    if (item.metadata?.language) setTargetLang(item.metadata.language);
    if (item.metadata?.type) setRecapType(item.metadata.type);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

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

      const analysis = await analyzeDocument(base64, file.type, prompt, systemInstruction);
      setResult(analysis);

      // Save to History Database
      onSaveResult({
        type: ContentType.VIDEO_INSIGHTS,
        prompt: `Recap script generation for ${file.name} (Type: ${recapType}, Tone: ${tone})`,
        content: analysis,
        metadata: { fileName: file.name, type: recapType, language: targetLang }
      });

    } catch (err: any) {
      setError(err.message || "Recap generation failed. Please try a smaller file.");
    } finally {
      setIsProcessing(false);
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
    <div className="max-w-2xl mx-auto pb-12">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-600/20">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
          </svg>
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">AI Recapper</h1>
          <p className="text-slate-500 dark:text-zinc-400 text-xs">Viral Audio/Video Scripts • {CREDIT_COSTS[ContentType.VIDEO_INSIGHTS]} Credits</p>
        </div>
      </div>

      <div className="glass p-5 rounded-2xl border border-white/5 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div 
          onClick={() => fileInputRef.current?.click()}
          className={`relative group border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
            file 
              ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10' 
              : 'border-slate-300 dark:border-white/10 hover:border-indigo-400 hover:bg-slate-50 dark:hover:bg-white/5'
          }`}
        >
          {file ? (
            <div className="flex items-center justify-center gap-4">
              <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-500/20 rounded-xl flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                {file.type.startsWith('video') ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" /></svg>
                )}
              </div>
              <div className="text-left overflow-hidden">
                <p className="text-[9px] font-black uppercase tracking-widest text-indigo-500 dark:text-indigo-400">{file.type.startsWith('video') ? 'Video' : 'Audio'} Selected</p>
                <h3 className="text-sm font-bold text-slate-800 dark:text-white truncate max-w-[250px]">{file.name}</h3>
                <span className="text-[10px] text-slate-500 dark:text-zinc-500 font-mono">{duration}</span>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="w-10 h-10 bg-slate-100 dark:bg-white/10 rounded-full flex items-center justify-center mx-auto text-slate-400 dark:text-zinc-500 group-hover:text-indigo-500 group-hover:scale-110 transition-all">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-zinc-500">Click to Upload Video or Audio</p>
              <p className="text-[8px] font-bold text-slate-500 uppercase">MP4, MOV, MP3, WAV, etc.</p>
            </div>
          )}
          <input ref={fileInputRef} type="file" accept="video/*,audio/*" onChange={handleFileChange} className="hidden" />
        </div>

        <div className="space-y-3">
          <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-zinc-600 mb-1 block">Content Type</label>
          <div className="grid grid-cols-2 gap-2">
            {recapOptions.map((option) => (
              <button
                key={option.id}
                onClick={() => setRecapType(option.id)}
                className={`py-2.5 rounded-xl border text-[9px] font-black uppercase tracking-widest transition-all ${
                  recapType === option.id 
                    ? 'bg-indigo-600 border-indigo-500 text-white shadow-md' 
                    : 'bg-transparent border-slate-200 dark:border-white/10 text-slate-500 dark:text-zinc-400 hover:border-indigo-400'
                }`}
              >
                {option.title}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-zinc-600 mb-2 block">Target Language</label>
            <select
              value={targetLang}
              onChange={(e) => setTargetLang(e.target.value)}
              className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest outline-none focus:ring-2 focus:ring-indigo-500 transition-all cursor-pointer"
            >
              <option value="BURMESE">Burmese</option>
              <option value="ENGLISH">English</option>
              <option value="THAI">Thai</option>
              <option value="CHINESE">Chinese</option>
              <option value="JAPANESE">Japanese</option>
              <option value="KOREAN">Korean</option>
              <option value="SPANISH">Spanish</option>
              <option value="FRENCH">French</option>
            </select>
          </div>

          <div>
             <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-zinc-600 mb-2 block">Perspective</label>
             <div className="grid grid-cols-2 gap-2">
               {(['1ST PERSON', '3RD PERSON'] as Perspective[]).map((p) => (
                 <button
                   key={p}
                   onClick={() => setPerspective(p)}
                   className={`py-2 rounded-lg text-[9px] font-black uppercase tracking-wide border transition-all ${
                     perspective === p 
                       ? 'bg-indigo-600 border-indigo-500 text-white shadow-md' 
                       : 'bg-transparent border-slate-200 dark:border-white/10 text-slate-400 dark:text-zinc-500 hover:border-indigo-400 dark:hover:border-white/30'
                   }`}
                 >
                   {p}
                 </button>
               ))}
             </div>
          </div>
        </div>

        <div>
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-zinc-600 mb-2 block">Tone Style</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {tones.map((t) => (
              <button
                key={t}
                onClick={() => setTone(t)}
                className={`py-2 rounded-lg text-[9px] font-bold uppercase tracking-wider border transition-all ${
                  tone === t 
                    ? 'bg-indigo-600 border-indigo-500 text-white shadow-md' 
                    : 'bg-transparent border-slate-200 dark:border-white/10 text-slate-400 dark:text-zinc-500 hover:border-indigo-400 dark:hover:border-white/30'
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
            className={`w-full py-3.5 rounded-xl text-[11px] font-black uppercase tracking-[0.2em] transition-all shadow-lg ${
              isProcessing 
                ? 'bg-slate-100 dark:bg-white/5 text-slate-400 dark:text-zinc-600 cursor-not-allowed' 
                : !file 
                ? 'bg-slate-200 dark:bg-white/5 text-slate-400 dark:text-zinc-600 cursor-not-allowed' 
                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/20 active:scale-95'
            }`}
          >
            {isProcessing ? 'Analyzing Media...' : !file ? 'Select File First' : 'Generate Master Script'}
          </button>
          
          {file && (
             <button onClick={reset} className="w-full mt-3 text-[9px] font-black text-slate-400 dark:text-zinc-600 uppercase tracking-widest hover:text-rose-500 transition-colors">
               Reset Form
             </button>
          )}
        </div>
      </div>

      {result && !isProcessing && (
        <div className="mt-8 animate-in slide-in-from-bottom-6 duration-700">
          <div className="glass p-6 rounded-2xl border border-white/10 shadow-2xl">
            <div className="flex justify-between items-center mb-4 pb-4 border-b border-slate-100 dark:border-white/5">
               <div>
                  <h3 className="text-[10px] font-black text-indigo-500 dark:text-indigo-400 uppercase tracking-widest mb-1">Generated Result</h3>
                  <h2 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">{recapType} Master Script</h2>
               </div>
               <button 
                onClick={() => navigator.clipboard.writeText(result)}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600/10 text-indigo-600 dark:text-indigo-400 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all"
               >
                 <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                 Copy Master
               </button>
            </div>
            <div className="prose prose-sm dark:prose-invert max-w-none text-slate-600 dark:text-zinc-300 font-medium leading-[1.8] max-h-[500px] overflow-y-auto pr-3 custom-scrollbar text-sm">
              {result.split('\n').map((line, i) => (
                <p key={i} className="mb-3 whitespace-pre-wrap">{line}</p>
              ))}
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-center">
          <p className="text-rose-500 dark:text-rose-400 text-xs font-bold">{error}</p>
        </div>
      )}
      <HistoryList history={history} onDelete={onDelete} onSelect={handleHistorySelect} />
    </div>
  );
};

export default VideoInsights;
