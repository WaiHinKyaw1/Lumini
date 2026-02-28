
import React, { useState, useRef, useEffect } from 'react';
import { generateSubtitles } from '../services/geminiService';
import { CREDIT_COSTS, ContentType } from '../types';

interface SubtitleStudioProps {
  onSpendCredits: (amount: number) => boolean;
}

interface FileItem {
  id: string;
  file: File;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result?: string;
  error?: string;
}

const SubtitleStudio: React.FC<SubtitleStudioProps> = ({ onSpendCredits }) => {
  const [queue, setQueue] = useState<FileItem[]>([]);
  const [language, setLanguage] = useState('BURMESE');
  const [isProcessingAll, setIsProcessingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);

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
      if (queue.length === 0 && newItems.length > 0) {
        setSelectedItemId(newItems[0].id);
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (id: string) => {
    setQueue((prev) => prev.filter((item) => item.id !== id));
    if (selectedItemId === id) setSelectedItemId(null);
  };

  const clearQueue = () => {
    setQueue([]);
    setError(null);
    setSelectedItemId(null);
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.readAsDataURL(file);
    });
  };

  const processFile = async (item: FileItem) => {
    if (item.file.size > 50 * 1024 * 1024) {
      throw new Error("File is too large (Max 50MB).");
    }

    if (!onSpendCredits(CREDIT_COSTS[ContentType.SUBTITLE])) {
      throw new Error("Insufficient credits");
    }

    setQueue((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, status: 'processing' } : i))
    );

    try {
      const base64 = await fileToBase64(item.file);
      const result = await generateSubtitles(base64, item.file.type, language);
      
      if (!isMounted.current) return;

      setQueue((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, status: 'completed', result } : i))
      );
    } catch (err: any) {
      if (isMounted.current) {
        setQueue((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, status: 'failed', error: err.message } : i))
        );
        throw err;
      }
    }
  };

  const handleBatchProcess = async () => {
    const pendingItems = queue.filter((item) => item.status === 'pending');
    if (pendingItems.length === 0) {
      setError("No pending files to process.");
      return;
    }

    setIsProcessingAll(true);
    setError(null);

    const processPromises = pendingItems.map(async (item) => {
      if (!isMounted.current) return;
      try {
        await processFile(item);
      } catch (err: any) {
        if (err.message === "Insufficient credits") {
          setError("Some files could not be processed due to insufficient credits.");
        }
      }
    });

    await Promise.all(processPromises);
    if (isMounted.current) setIsProcessingAll(false);
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

  const handleResultChange = (id: string, newResult: string) => {
    setQueue(prev => prev.map(item => item.id === id ? { ...item, result: newResult } : item));
  };

  const selectedItem = queue.find(i => i.id === selectedItemId);

  return (
    <div className="max-w-6xl mx-auto pb-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 border-b border-slate-200 dark:border-white/10 pb-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-cyan-600 text-white rounded-xl flex items-center justify-center shadow-lg shadow-cyan-600/20">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Subtitle Studio</h1>
            <p className="text-slate-500 dark:text-zinc-400 text-[9px] font-bold uppercase tracking-widest mt-1">AI Transcription & SRT Generator • {CREDIT_COSTS[ContentType.SUBTITLE]} Credits</p>
          </div>
        </div>
        
        <div className="hidden md:flex items-center gap-3 bg-white dark:bg-white/5 px-4 py-2 rounded-lg border border-slate-200 dark:border-white/10 shadow-sm">
            <div className={`w-2 h-2 rounded-full ${isProcessingAll ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`}></div>
            <span className="text-[10px] font-bold text-slate-600 dark:text-zinc-400 uppercase tracking-widest">{isProcessingAll ? 'Processing' : 'System Ready'}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Panel: Upload & Queue */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-6 shadow-xl">
            <h3 className="text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-widest mb-4 flex items-center gap-2">
              <svg className="w-4 h-4 text-cyan-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-8l-4-4m0 0l-4-4m4 4V4" /></svg>
              Upload Media
            </h3>
            
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="w-full h-32 border-2 border-dashed border-slate-200 dark:border-white/10 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-cyan-500 hover:bg-cyan-500/5 transition-all group"
            >
              <svg className="w-8 h-8 mb-2 text-slate-400 group-hover:text-cyan-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <span className="text-[10px] font-bold uppercase text-slate-500 tracking-widest">Drop video or audio here</span>
              <input type="file" ref={fileInputRef} accept="video/*,audio/*" onChange={handleFileUpload} multiple className="hidden" />
            </div>

            <div className="mt-6">
              <label className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-2 block">Target Language</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-cyan-500 transition-all appearance-none cursor-pointer"
              >
                <option value="BURMESE">Burmese (မြန်မာ)</option>
                <option value="ENGLISH">English</option>
                <option value="THAI">Thai (ไทย)</option>
                <option value="CHINESE">Chinese (中文)</option>
                <option value="JAPANESE">Japanese (日本語)</option>
                <option value="KOREAN">Korean (한국어)</option>
              </select>
            </div>

            <button
              onClick={handleBatchProcess}
              disabled={isProcessingAll || queue.filter(i => i.status === 'pending').length === 0}
              className={`w-full mt-6 py-4 rounded-xl text-xs font-bold uppercase tracking-[0.2em] transition-all shadow-lg ${
                isProcessingAll || queue.filter(i => i.status === 'pending').length === 0
                  ? 'bg-slate-100 dark:bg-white/5 text-slate-400 cursor-not-allowed'
                  : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-cyan-600/20'
              }`}
            >
              {isProcessingAll ? 'Processing Queue...' : 'Start Transcription'}
            </button>
          </div>

          {/* Queue List */}
          <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-6 shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-widest">Queue ({queue.length})</h3>
              {queue.length > 0 && (
                <button onClick={clearQueue} className="text-[10px] font-bold text-rose-500 hover:text-rose-400 uppercase tracking-widest transition-colors">Clear</button>
              )}
            </div>
            
            <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
              {queue.length === 0 ? (
                <div className="text-center py-10">
                  <p className="text-[10px] font-bold text-slate-400 dark:text-zinc-600 uppercase tracking-widest">No files in queue</p>
                </div>
              ) : (
                queue.map((item) => (
                  <div 
                    key={item.id}
                    onClick={() => setSelectedItemId(item.id)}
                    className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center gap-3 ${
                      selectedItemId === item.id 
                        ? 'bg-cyan-50 dark:bg-cyan-500/10 border-cyan-500/50' 
                        : 'bg-slate-50 dark:bg-black/20 border-slate-200 dark:border-white/5 hover:border-slate-300 dark:hover:border-white/10'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      item.status === 'completed' ? 'bg-emerald-500/10 text-emerald-500' : 
                      item.status === 'failed' ? 'bg-rose-500/10 text-rose-500' :
                      item.status === 'processing' ? 'bg-cyan-500/10 text-cyan-500' : 'bg-slate-200 dark:bg-white/5 text-slate-400'
                    }`}>
                      {item.status === 'processing' ? (
                        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-bold text-slate-900 dark:text-white truncate uppercase tracking-tight">{item.file.name}</p>
                      <p className="text-[8px] font-bold text-slate-500 dark:text-zinc-500 uppercase tracking-widest mt-0.5">{item.status}</p>
                    </div>
                    <button 
                      onClick={(e) => { e.stopPropagation(); removeFile(item.id); }}
                      className="p-1 text-slate-400 hover:text-rose-500 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Panel: Preview & Edit */}
        <div className="lg:col-span-8">
          <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-6 shadow-xl h-full flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-widest flex items-center gap-2">
                <svg className="w-4 h-4 text-cyan-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                SRT Preview & Editor
              </h3>
              {selectedItem?.status === 'completed' && (
                <button 
                  onClick={() => downloadSRT(selectedItem)}
                  className="px-4 py-2 bg-slate-900 dark:bg-white hover:bg-slate-800 dark:hover:bg-zinc-200 text-white dark:text-slate-900 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all flex items-center gap-2 shadow-md"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  Download SRT
                </button>
              )}
            </div>

            {!selectedItem ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center opacity-50">
                <svg className="w-16 h-16 mb-4 text-slate-200 dark:text-white/5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-xs font-bold text-slate-400 dark:text-zinc-600 uppercase tracking-widest">Select a file from the queue to view subtitles</p>
              </div>
            ) : selectedItem.status === 'processing' ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-widest animate-pulse">Transcribing media content...</p>
                <p className="text-[10px] text-slate-400 dark:text-zinc-500 mt-2 uppercase tracking-widest">This may take a minute for larger files</p>
              </div>
            ) : selectedItem.status === 'failed' ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center text-rose-500">
                <svg className="w-12 h-12 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <p className="text-xs font-bold uppercase tracking-widest">Transcription Failed</p>
                <p className="text-[10px] mt-2 opacity-70 uppercase tracking-widest">{selectedItem.error}</p>
              </div>
            ) : selectedItem.result ? (
              <div className="flex-1 flex flex-col">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-500 dark:text-zinc-500 uppercase tracking-widest">Editing: {selectedItem.file.name}</span>
                  <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">SRT Generated Successfully</span>
                </div>
                <textarea
                  value={selectedItem.result}
                  onChange={(e) => handleResultChange(selectedItem.id, e.target.value)}
                  className="flex-1 w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl p-5 text-sm font-mono text-slate-900 dark:text-zinc-100 focus:ring-2 focus:ring-cyan-500 outline-none transition-all resize-none leading-relaxed"
                  spellCheck={false}
                />
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center opacity-50">
                <p className="text-xs font-bold text-slate-400 dark:text-zinc-600 uppercase tracking-widest">Ready to process transcription</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-6 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 p-4 rounded-xl text-rose-600 dark:text-rose-400 text-[10px] font-bold uppercase tracking-widest text-center flex items-center justify-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          {error}
        </div>
      )}
    </div>
  );
};

export default SubtitleStudio;

