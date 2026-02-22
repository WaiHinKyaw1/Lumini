
import React, { useState, useRef } from 'react';
import { analyzeDocument } from '../services/geminiService';
import { CREDIT_COSTS, ContentType, GenerationResult } from '../types';
import HistoryList from '../components/HistoryList';

interface SubtitleStudioProps {
  onSpendCredits: (amount: number) => boolean;
  onSaveResult: (result: Omit<GenerationResult, 'id' | 'timestamp'>) => void;
  history: GenerationResult[];
  onDelete: (id: string) => void;
}

interface FileItem {
  id: string;
  file: File;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result?: string;
  error?: string;
}

const SubtitleStudio: React.FC<SubtitleStudioProps> = ({ onSpendCredits, onSaveResult, history, onDelete }) => {
  // Queue State
  const [queue, setQueue] = useState<FileItem[]>([]);
  const [language, setLanguage] = useState('BURMESE');
  const [isProcessingAll, setIsProcessingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleHistorySelect = (item: GenerationResult) => {
    // We can't restore files fully but we can show the result in the queue visually as a completed item
    if (item.content) {
        const dummyFile = new File([""], item.metadata?.fileName || "restored_subtitle.srt", { type: "text/plain" });
        const restoredItem: FileItem = {
            id: item.id, // reuse id to avoid duplicates if possible, or new one
            file: dummyFile,
            status: 'completed',
            result: item.content
        };
        // Add to top of queue
        setQueue(prev => [restoredItem, ...prev]);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (selectedFiles) {
      const newItems: FileItem[] = Array.from(selectedFiles).map((file: File) => ({
        id: Math.random().toString(36).substr(2, 9),
        file,
        status: 'pending',
      }));
      setQueue((prev) => [...prev, ...newItems]);
      setError(null);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (id: string) => {
    setQueue((prev) => prev.filter((item) => item.id !== id));
  };

  const clearQueue = () => {
    setQueue([]);
    setError(null);
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.readAsDataURL(file);
    });
  };

  const processFile = async (item: FileItem) => {
    if (!onSpendCredits(CREDIT_COSTS[ContentType.SUBTITLE])) {
      throw new Error("Insufficient credits");
    }

    setQueue((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, status: 'processing' } : i))
    );

    const base64 = await fileToBase64(item.file);
    const systemInstruction = "You are a professional AI Subtitle Expert. You transcribe audio from media files and output high-quality SubRip (SRT) format files.";
    const prompt = `Perform full transcription and timing for this ${item.file.type.split('/')[0]}. 
    
    TARGET LANGUAGE: ${language}
    
    RULES:
    - Transcribe all speech accurately in the target language.
    - Format the output strictly as a valid SubRip (.srt) file.
    - Include index numbers, timestamps (00:00:00,000 --> 00:00:00,000), and the text.
    - Output ONLY the SRT content. No explanations or extra text.`;

    const result = await analyzeDocument(base64, item.file.type, prompt, systemInstruction);
    const cleanedSRT = result.replace(/```srt|```|```text/g, '').trim();

    setQueue((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, status: 'completed', result: cleanedSRT } : i))
    );

    // Save to History Database
    onSaveResult({
      type: ContentType.SUBTITLE,
      prompt: `Subtitle generation (${language}) for ${item.file.name}`,
      content: cleanedSRT,
      metadata: { fileName: item.file.name, language: language }
    });
  };

  const handleBatchProcess = async () => {
    const pendingItems = queue.filter((item) => item.status === 'pending');
    if (pendingItems.length === 0) {
      setError("No pending files to process.");
      return;
    }

    setIsProcessingAll(true);
    setError(null);

    for (const item of pendingItems) {
      try {
        await processFile(item);
      } catch (err: any) {
        setQueue((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, status: 'failed', error: err.message } : i))
        );
        if (err.message === "Insufficient credits") {
          setError("Stopped batch: Insufficient credits.");
          break;
        }
      }
    }
    setIsProcessingAll(false);
  };

  const downloadSRT = (item: FileItem) => {
    if (!item.result) return;
    const blob = new Blob([item.result], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${item.file.name.split('.')[0]}.srt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadAll = () => {
    queue.filter(i => i.status === 'completed').forEach(item => downloadSRT(item));
  };

  return (
    <div className="max-w-4xl mx-auto pb-20">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-cyan-600 rounded-xl flex items-center justify-center shadow-lg shadow-cyan-600/20">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
          </svg>
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">စာတန်းထိုးဖိုင်ထုတ်တဲ့ Tool (SRT)</h1>
          <p className="text-slate-500 dark:text-zinc-400 text-xs">Batch SRT Generation • {CREDIT_COSTS[ContentType.SUBTITLE]} Credits per file</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 space-y-4">
          <div className="glass p-5 rounded-2xl border border-white/5 space-y-5">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-zinc-500 mb-2">၁။ ဖိုင်များထည့်ပါ (Upload Multiple Files)</label>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-24 border-2 border-dashed border-slate-300 dark:border-white/10 rounded-xl flex flex-col items-center justify-center transition-all hover:border-cyan-400 hover:bg-cyan-500/5 group"
              >
                <svg className="w-6 h-6 mb-1 text-slate-400 group-hover:text-cyan-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" strokeWidth={2}/>
                </svg>
                <span className="text-[10px] font-bold uppercase text-slate-500">Add Video/Audio Files</span>
              </button>
              <input type="file" ref={fileInputRef} accept="video/*,audio/*" onChange={handleFileUpload} multiple className="hidden" />
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-zinc-500 mb-2">၂။ ဘာသာစကားရွေးပါ (Select Language)</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest outline-none focus:ring-2 focus:ring-cyan-500 cursor-pointer"
              >
                <option value="BURMESE">Burmese</option>
                <option value="ENGLISH">English</option>
                <option value="THAI">Thai</option>
                <option value="CHINESE">Chinese</option>
                <option value="JAPANESE">Japanese</option>
                <option value="KOREAN">Korean</option>
              </select>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleBatchProcess}
                disabled={isProcessingAll || queue.filter(i => i.status === 'pending').length === 0}
                className={`flex-1 py-4 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all shadow-lg ${
                  isProcessingAll || queue.filter(i => i.status === 'pending').length === 0
                    ? 'bg-slate-200 dark:bg-white/5 text-slate-400 cursor-not-allowed'
                    : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-cyan-600/20 active:scale-95'
                }`}
              >
                {isProcessingAll ? 'Batch Processing...' : 'Process Queue'}
              </button>
              {queue.length > 0 && !isProcessingAll && (
                <button
                  onClick={clearQueue}
                  className="px-4 bg-rose-500/10 text-rose-500 rounded-xl border border-rose-500/20 hover:bg-rose-500 hover:text-white transition-all"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          <div className="glass p-4 rounded-2xl border border-rose-500/20 bg-rose-500/5">
            <div className="flex gap-3">
              <div className="text-rose-500 mt-1 flex-shrink-0">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" strokeWidth={2}/></svg>
              </div>
              <div>
                <h4 className="text-[10px] font-black uppercase text-rose-500 tracking-widest">Batch Processing Info</h4>
                <p className="text-[11px] text-slate-600 dark:text-zinc-400 mt-1 font-medium italic">
                  Files are processed one by one. Credits will be deducted for each successfully started transcription.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-7 space-y-4">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-zinc-500">
              Processing Queue ({queue.length})
            </h3>
            {queue.some(i => i.status === 'completed') && (
              <button 
                onClick={downloadAll}
                className="text-[10px] font-black text-cyan-600 hover:text-cyan-500 uppercase tracking-widest flex items-center gap-1.5"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" strokeWidth={2.5}/></svg>
                Download All
              </button>
            )}
          </div>

          {queue.length === 0 ? (
            <div className="glass h-64 rounded-2xl border border-dashed border-slate-300 dark:border-white/10 flex flex-col items-center justify-center text-center p-8 bg-slate-50/50 dark:bg-white/[0.01]">
              <div className="w-12 h-12 bg-slate-100 dark:bg-white/5 rounded-2xl flex items-center justify-center mb-4 text-slate-400 dark:text-zinc-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Empty Queue</h3>
              <p className="text-slate-500 dark:text-zinc-500 text-xs mt-1 max-w-xs mx-auto">Upload media files to start generating subtitles in bulk.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[700px] overflow-y-auto pr-2 custom-scrollbar">
              {queue.map((item) => (
                <div 
                  key={item.id} 
                  className={`glass p-4 rounded-xl border flex items-center gap-4 transition-all ${
                    item.status === 'processing' ? 'border-cyan-500/50 bg-cyan-500/5 ring-1 ring-cyan-500/20' : 'border-white/5'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                    item.status === 'completed' ? 'bg-emerald-500/10 text-emerald-500' : 
                    item.status === 'failed' ? 'bg-rose-500/10 text-rose-500' :
                    item.status === 'processing' ? 'bg-cyan-500/10 text-cyan-500' : 'bg-slate-100 dark:bg-white/5 text-slate-400'
                  }`}>
                    {item.status === 'completed' ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    ) : item.status === 'failed' ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    ) : item.status === 'processing' ? (
                      <div className="w-4 h-4 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <h4 className="text-[11px] font-bold text-slate-900 dark:text-white truncate uppercase tracking-tight">{item.file.name}</h4>
                    <p className="text-[9px] font-bold text-slate-500 dark:text-zinc-500 uppercase tracking-widest mt-0.5">
                      {item.status === 'processing' ? 'Transcribing...' : item.status.toUpperCase()}
                      {item.error && ` - ${item.error}`}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {item.status === 'completed' && (
                      <button 
                        onClick={() => downloadSRT(item)}
                        className="p-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 transition-colors shadow-lg shadow-emerald-600/20"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" strokeWidth={2.5}/></svg>
                      </button>
                    )}
                    {item.status !== 'processing' && !isProcessingAll && (
                      <button 
                        onClick={() => removeFile(item.id)}
                        className="p-2 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-all"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-4 p-4 bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs font-bold text-center rounded-xl animate-in fade-in">
          {error}
        </div>
      )}
      <HistoryList history={history} onDelete={onDelete} onSelect={handleHistorySelect} />
    </div>
  );
};

export default SubtitleStudio;
