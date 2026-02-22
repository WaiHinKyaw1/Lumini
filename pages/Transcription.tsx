
import React, { useState } from 'react';
import { analyzeDocument } from '../services/geminiService';
import { CREDIT_COSTS, ContentType, GenerationResult } from '../types';
import HistoryList from '../components/HistoryList';

interface TranscriptionProps {
  onSpendCredits: (amount: number) => boolean;
  onSaveResult: (result: Omit<GenerationResult, 'id' | 'timestamp'>) => void;
  history: GenerationResult[];
  onDelete: (id: string) => void;
}

const Transcription: React.FC<TranscriptionProps> = ({ onSpendCredits, onSaveResult, history, onDelete }) => {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleHistorySelect = (item: GenerationResult) => {
    if (item.content) {
        setResult(item.content);
        // Can't restore the original file object, but we can show the result
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setResult(null);
      setError(null);
    }
  };

  const handleProcess = async () => {
    if (!file) return;
    setError(null);

    if (!onSpendCredits(CREDIT_COSTS[ContentType.TRANSCRIPTION])) {
      setError("Insufficient credits!");
      return;
    }

    setIsProcessing(true);
    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(file);
      });
      const base64 = await base64Promise;
      
      const systemInstruction = "You are a professional Transcriber. Your goal is to convert audio/video speech into accurate text. Follow the user's formatting rules strictly.";
      const prompt = `Transcribe the audio content into PURE TRANSCRIPTION format.
Rules:
- Remove author names, speaker labels, titles, headings, and metadata.
- Keep ONLY spoken dialogue and narration sentences.
- One sentence per line.
- Output plain text only.`;

      const textResult = await analyzeDocument(base64, file.type, prompt, systemInstruction);
      setResult(textResult);

      // Save Real Data to Database
      onSaveResult({
        type: ContentType.TRANSCRIPTION,
        prompt: `Transcription of ${file.name}`,
        content: textResult,
        metadata: { fileName: file.name, fileSize: file.size }
      });

    } catch (err: any) {
      setError(err.message || "Transcription failed");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto pb-20">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-600/20">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white uppercase tracking-tighter">Transcript Master</h1>
          <p className="text-slate-500 dark:text-zinc-400 text-xs font-bold uppercase tracking-widest">Speech to Text Archive • {CREDIT_COSTS[ContentType.TRANSCRIPTION]} Credits</p>
        </div>
      </div>

      <div className="glass p-5 rounded-[2rem] border border-white/5 space-y-6 shadow-xl">
        {!result && !isProcessing ? (
          <div className="text-center">
            <input type="file" onChange={handleFileChange} accept="video/*,audio/*" className="hidden" id="trans-upload" />
            <label
              htmlFor="trans-upload"
              className={`flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed rounded-2xl transition-all cursor-pointer ${
                file 
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10' 
                  : 'border-slate-300 dark:border-white/10 hover:border-indigo-400 hover:bg-slate-50 dark:hover:bg-white/5'
              }`}
            >
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${file ? 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600' : 'bg-slate-100 dark:bg-white/5 text-slate-400'}`}>
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">{file ? 'File Locked' : 'Drop Master Media'}</h3>
                <p className="text-[10px] text-slate-500 dark:text-zinc-500 font-bold uppercase tracking-widest">{file ? file.name : 'MP3, MP4, WAV supported'}</p>
              </div>
            </label>

            <button
              onClick={handleProcess}
              disabled={!file}
              className={`w-full mt-5 py-4 rounded-xl text-xs font-black uppercase tracking-[0.2em] transition-all shadow-2xl ${
                file 
                  ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/20' 
                  : 'bg-slate-200 dark:bg-white/5 text-slate-400 dark:text-zinc-600 cursor-not-allowed'
              }`}
            >
              Execute Transcription
            </button>
          </div>
        ) : isProcessing ? (
          <div className="py-12 text-center space-y-4">
            <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mx-auto"></div>
            <div>
                <h2 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Decoding Neural Audio</h2>
                <p className="text-[10px] text-slate-500 dark:text-zinc-500 font-bold uppercase tracking-widest mt-1">Building Database Record...</p>
            </div>
          </div>
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                 <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                 <h3 className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-[0.2em]">Live Transcript</h3>
              </div>
              <div className="flex gap-3">
                <button onClick={() => {setResult(null); setFile(null);}} className="text-[10px] font-black text-slate-400 hover:text-indigo-500 uppercase tracking-widest transition-colors">Discard</button>
                <button onClick={() => navigator.clipboard.writeText(result || '')} className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest shadow-lg shadow-indigo-600/20">Copy All</button>
              </div>
            </div>
            <div className="p-5 rounded-2xl bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 max-h-[500px] overflow-y-auto text-sm leading-relaxed text-slate-700 dark:text-zinc-300 font-medium custom-scrollbar">
              {result?.split('\n').map((line, i) => (
                <p key={i} className="mb-3 last:mb-0 border-l-2 border-indigo-500/10 pl-4">{line}</p>
              ))}
            </div>
            <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest mt-4 text-center">✓ Data automatically saved to Archive Database</p>
          </div>
        )}
      </div>
      {error && <div className="mt-4 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-center text-[10px] font-black text-rose-500 uppercase tracking-widest animate-in shake duration-500">{error}</div>}
      <HistoryList history={history} onDelete={onDelete} onSelect={handleHistorySelect} />
    </div>
  );
};

export default Transcription;
