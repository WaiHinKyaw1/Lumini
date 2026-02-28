
import React, { useState } from 'react';
import { analyzeDocument } from '../services/geminiService';
import { CREDIT_COSTS, ContentType } from '../types';

interface TranscriptionProps {
  onSpendCredits: (amount: number) => boolean;
}

const Transcription: React.FC<TranscriptionProps> = ({ onSpendCredits }) => {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isMounted = React.useRef(true);

  React.useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

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

    // Prevent mobile OOM crashes from huge base64 strings
    if (file.size > 50 * 1024 * 1024) {
      setError("File is too large (Max 50MB). Please use a smaller file to prevent mobile browser crashes.");
      return;
    }

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
      if (isMounted.current) {
        setResult(textResult);
      }

    } catch (err: any) {
      if (isMounted.current) {
        setError(err.message || "Transcription failed");
      }
    } finally {
      if (isMounted.current) {
        setIsProcessing(false);
      }
    }
  };

  return (
    <div className="max-w-xl mx-auto pb-6">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-600/20">
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        </div>
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">Transcript Master</h1>
          <p className="text-slate-500 dark:text-zinc-400 text-[9px] font-bold uppercase tracking-widest">Media to Text • {CREDIT_COSTS[ContentType.TRANSCRIPTION]} Credits</p>
        </div>
      </div>

      <div className="glass p-3 rounded-xl border border-white/5 space-y-3">
        {!result && !isProcessing ? (
          <div className="text-center">
            <input type="file" onChange={handleFileChange} accept="video/*,audio/*,.mp4,.mov,.mkv,.mp3,.wav,.m4a" className="hidden" id="trans-upload" />
            <label
              htmlFor="trans-upload"
              className={`flex flex-col items-center justify-center gap-1.5 p-4 border border-dashed rounded-lg transition-all cursor-pointer ${
                file 
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10' 
                  : 'border-slate-300 dark:border-white/10 hover:border-indigo-400 hover:bg-slate-50 dark:hover:bg-white/5'
              }`}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${file ? 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600' : 'bg-slate-100 dark:bg-white/5 text-slate-400'}`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <div className="space-y-0.5">
                <h3 className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-tight">{file ? 'File Locked' : 'Drop Media'}</h3>
                <p className="text-[8px] text-slate-500 dark:text-zinc-500 font-bold uppercase tracking-widest truncate max-w-[200px]">{file ? file.name : 'MP3, MP4, WAV'}</p>
              </div>
            </label>

            <button
              onClick={handleProcess}
              disabled={!file}
              className={`w-full mt-3 py-3 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all shadow-lg ${
                file 
                  ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/20 active:scale-95' 
                  : 'bg-slate-200 dark:bg-white/5 text-slate-400 dark:text-zinc-600 cursor-not-allowed'
              }`}
            >
              Execute Transcription
            </button>
          </div>
        ) : isProcessing ? (
          <div className="py-6 text-center space-y-2">
            <div className="w-7 h-7 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mx-auto"></div>
            <p className="text-[9px] text-slate-500 dark:text-zinc-500 font-black uppercase tracking-widest">Decoding Audio...</p>
          </div>
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div className="flex justify-between items-center mb-3 pb-2 border-b border-slate-100 dark:border-white/5">
              <div className="flex items-center gap-1.5">
                 <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                 <h3 className="text-[9px] font-black text-slate-900 dark:text-white uppercase tracking-widest">Transcript Output</h3>
              </div>
              <div className="flex gap-2">
                <button onClick={() => {setResult(null); setFile(null);}} className="text-[8px] font-black text-slate-400 hover:text-rose-500 uppercase tracking-widest transition-colors">Discard</button>
                <button onClick={() => navigator.clipboard.writeText(result || '')} className="px-3 py-1 bg-indigo-600 text-white rounded-lg text-[9px] font-black uppercase tracking-widest">Copy Result</button>
              </div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 max-h-[350px] overflow-y-auto text-[13px] leading-[1.6] text-slate-600 dark:text-zinc-300 font-medium custom-scrollbar">
              {result?.split('\n').map((line, i) => (
                <p key={i} className="mb-2 last:mb-0">{line}</p>
              ))}
            </div>
          </div>
        )}
      </div>
      {error && <div className="mt-3 p-2 bg-rose-500/10 border border-rose-500/20 rounded-xl text-center text-[10px] font-bold text-rose-500 uppercase tracking-widest">{error}</div>}
    </div>
  );
};

export default Transcription;
