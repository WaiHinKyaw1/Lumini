
import React, { useState, useRef, useEffect } from 'react';
import { generateSubtitles } from '../services/geminiService';
import { CREDIT_COSTS, ContentType } from '../types';
import { getBrandKit, BrandKitData } from '../src/utils/brandKit';

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
  const [brandKit, setBrandKit] = useState<BrandKitData | null>(null);
  const [useBrandStyling, setUseBrandStyling] = useState(false);
  const isMounted = useRef(true);

  useEffect(() => {
    const kit = getBrandKit();
    if (kit) {
      setBrandKit(kit);
      setUseBrandStyling(true);
    }
  }, []);

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

  const extractAudioFromVideo = async (videoFile: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        try {
          const arrayBuffer = e.target?.result as ArrayBuffer;
          const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
          
          // Convert to WAV
          const numOfChan = audioBuffer.numberOfChannels;
          const length = audioBuffer.length * numOfChan * 2 + 44;
          const buffer = new ArrayBuffer(length);
          const view = new DataView(buffer);
          const channels = [];
          let sample;
          let offset = 0;
          let pos = 0;

          // write WAVE header
          const setUint16 = (data: number) => {
            view.setUint16(pos, data, true);
            pos += 2;
          };
          const setUint32 = (data: number) => {
            view.setUint32(pos, data, true);
            pos += 4;
          };
          const writeString = (str: string) => {
            for (let i = 0; i < str.length; i++) {
              view.setUint8(pos++, str.charCodeAt(i));
            }
          };

          writeString('RIFF');
          setUint32(length - 8);
          writeString('WAVE');
          writeString('fmt ');
          setUint32(16);
          setUint16(1);
          setUint16(numOfChan);
          setUint32(audioBuffer.sampleRate);
          setUint32(audioBuffer.sampleRate * 2 * numOfChan);
          setUint16(numOfChan * 2);
          setUint16(16);
          writeString('data');
          setUint32(length - pos - 4);

          // write interleaved data
          for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
            channels.push(audioBuffer.getChannelData(i));
          }

          while (offset < audioBuffer.length) {
            for (let i = 0; i < numOfChan; i++) {
              sample = Math.max(-1, Math.min(1, channels[i][offset]));
              sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
              view.setInt16(pos, sample, true);
              pos += 2;
            }
            offset++;
          }

          const blob = new Blob([buffer], { type: 'audio/wav' });
          const base64Reader = new FileReader();
          base64Reader.onload = () => resolve((base64Reader.result as string).split(',')[1]);
          base64Reader.onerror = reject;
          base64Reader.readAsDataURL(blob);
          
        } catch (err) {
          reject(err);
        } finally {
          if (audioCtx.state !== 'closed') audioCtx.close();
        }
      };
      
      reader.onerror = reject;
      reader.readAsArrayBuffer(videoFile);
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
      let base64 = "";
      let mimeType = item.file.type;
      
      if (item.file.type.startsWith('video/')) {
        try {
          base64 = await extractAudioFromVideo(item.file);
          mimeType = 'audio/wav';
        } catch (e) {
          console.warn("Audio extraction failed, falling back to full file upload", e);
          base64 = await fileToBase64(item.file);
        }
      } else {
        base64 = await fileToBase64(item.file);
      }
      
      const result = await generateSubtitles(base64, mimeType, language);
      
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
      <div className="flex items-center justify-between mb-8 border-b border-white/10 pb-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-accent text-white rounded-xl flex items-center justify-center shadow-lg shadow-accent/20">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
            </svg>
          </div>
          <div>
            <h1 className="movie-h1 !text-2xl !mb-0 uppercase tracking-tighter">Subtitle Studio</h1>
            <p className="movie-meta !text-[10px] !mb-0 uppercase tracking-widest text-zinc-500">AI Transcription & SRT Generator • {CREDIT_COSTS[ContentType.SUBTITLE]} Credits</p>
          </div>
        </div>
        
        <div className="hidden md:flex items-center gap-3 bg-white/5 px-4 py-2 rounded-lg border border-white/10 shadow-sm">
            <div className={`w-2 h-2 rounded-full ${isProcessingAll ? 'bg-amber-500 animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.4)]' : 'bg-emerald-500'}`}></div>
            <span className="movie-meta !text-[10px] uppercase tracking-widest text-zinc-400 !mb-0">{isProcessingAll ? 'Processing' : 'System Ready'}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Panel: Upload & Queue */}
        <div className="lg:col-span-4 space-y-6">
          <div className="glass p-6 rounded-2xl border border-white/5 space-y-4 shadow-xl">
            <h3 className="movie-meta !text-[10px] text-zinc-300 uppercase tracking-widest !mb-4 flex items-center gap-2">
              <svg className="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-8l-4-4m0 0l-4-4m4 4V4" /></svg>
              Upload Media
            </h3>
            
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="w-full h-32 border-2 border-dashed border-white/10 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-accent hover:bg-accent/5 transition-all group"
            >
              <svg className="w-8 h-8 mb-2 text-zinc-600 group-hover:text-accent transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <span className="movie-meta !text-[10px] uppercase text-zinc-500 tracking-widest !mb-0">Drop video or audio here</span>
              <input type="file" ref={fileInputRef} accept="video/*,audio/*" onChange={handleFileUpload} multiple className="hidden" />
            </div>

            <div className="mt-6">
              <label className="movie-meta !text-[10px] text-zinc-500 uppercase tracking-widest px-1 !mb-2 block">Target Language</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 movie-meta !text-[11px] uppercase tracking-widest outline-none focus:ring-2 focus:ring-accent transition-all appearance-none cursor-pointer !mb-0"
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
              className={`w-full mt-6 py-4 rounded-xl movie-meta !text-[12px] uppercase tracking-[0.2em] transition-all shadow-lg ${
                isProcessingAll || queue.filter(i => i.status === 'pending').length === 0
                  ? 'bg-white/5 text-zinc-600 cursor-not-allowed'
                  : 'bg-accent hover:bg-accent-hover text-white shadow-accent/20'
              }`}
            >
              {isProcessingAll ? 'Processing Queue...' : 'Start Transcription'}
            </button>

            {brandKit && (
              <div className="mt-4 p-3 bg-white/5 rounded-xl border border-white/10 text-zinc-500">
                <div className="flex items-center justify-between mb-2">
                  <span className="movie-meta !text-[9px] uppercase tracking-widest !mb-0">Brand Styling</span>
                  <button 
                    onClick={() => setUseBrandStyling(!useBrandStyling)}
                    className={`w-8 h-4 rounded-full transition-all relative ${useBrandStyling ? 'bg-accent' : 'bg-white/10'}`}
                  >
                    <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${useBrandStyling ? 'right-0.5' : 'left-0.5'}`}></div>
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: brandKit.primaryColor }}></div>
                  <span className="movie-meta !text-[8px] uppercase tracking-widest !mb-0">{brandKit.brandName} Kit Active</span>
                </div>
              </div>
            )}
          </div>

          {/* Queue List */}
          <div className="glass p-6 rounded-2xl border border-white/5 space-y-4 shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="movie-meta text-zinc-300 uppercase tracking-widest !mb-0">Queue ({queue.length})</h3>
              {queue.length > 0 && (
                <button onClick={clearQueue} className="movie-meta !text-[10px] text-rose-500 hover:text-rose-400 uppercase tracking-widest transition-colors !mb-0">Clear</button>
              )}
            </div>
            
            <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
              {queue.length === 0 ? (
                <div className="text-center py-10">
                  <p className="movie-meta !text-[10px] text-zinc-700 uppercase tracking-widest !mb-0">No files in queue</p>
                </div>
              ) : (
                queue.map((item) => (
                  <div 
                    key={item.id}
                    onClick={() => setSelectedItemId(item.id)}
                    className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center gap-3 ${
                      selectedItemId === item.id 
                        ? 'bg-accent/10 border-accent/50' 
                        : 'bg-black/20 border-white/5 hover:border-white/10'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      item.status === 'completed' ? 'bg-emerald-500/10 text-emerald-500' : 
                      item.status === 'failed' ? 'bg-rose-500/10 text-rose-500' :
                      item.status === 'processing' ? 'bg-accent/10 text-accent' : 'bg-white/5 text-zinc-600'
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
                      <p className="movie-meta !text-[10px] text-white truncate uppercase tracking-tight !mb-0">{item.file.name}</p>
                      <p className="movie-meta !text-[8px] text-zinc-500 uppercase tracking-widest mt-0.5 !mb-0">{item.status}</p>
                    </div>
                    <button 
                      onClick={(e) => { e.stopPropagation(); removeFile(item.id); }}
                      className="p-1 text-zinc-600 hover:text-rose-500 transition-colors"
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
          <div className="glass p-8 rounded-2xl border border-white/5 h-full flex flex-col shadow-xl">
            <div className="flex justify-between items-center mb-8">
              <h3 className="movie-meta text-zinc-300 uppercase tracking-widest flex items-center gap-2 !mb-0">
                <svg className="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                SRT Preview & Editor
              </h3>
              {selectedItem?.status === 'completed' && (
                <button 
                  onClick={() => downloadSRT(selectedItem)}
                  className="px-6 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-xl movie-meta !text-[11px] uppercase tracking-widest transition-all flex items-center gap-2 shadow-xl shadow-accent/20 !mb-0 active:scale-95"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  Download SRT
                </button>
              )}
            </div>

            {!selectedItem ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center opacity-50">
                <svg className="w-20 h-20 mb-6 text-zinc-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="movie-meta !text-[12px] text-zinc-600 uppercase tracking-widest !mb-0">Select a file from the queue to view subtitles</p>
              </div>
            ) : selectedItem.status === 'processing' ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <div className="w-16 h-16 border-4 border-accent border-t-transparent rounded-full animate-spin mb-6 shadow-[0_0_15px_rgba(225,29,72,0.3)]"></div>
                <p className="movie-meta !text-[12px] text-zinc-400 uppercase tracking-widest animate-pulse !mb-0">Transcribing media content...</p>
                <p className="movie-meta !text-[10px] text-zinc-600 mt-2 uppercase tracking-widest !mb-0">This may take a minute for larger files</p>
              </div>
            ) : selectedItem.status === 'failed' ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center text-rose-500">
                <svg className="w-16 h-16 mb-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <p className="movie-meta !text-[14px] uppercase tracking-widest !mb-0">Transcription Failed</p>
                <p className="movie-meta !text-[12px] mt-2 opacity-70 uppercase tracking-widest !mb-0">{selectedItem.error}</p>
              </div>
            ) : selectedItem.result ? (
              <div className="flex-1 flex flex-col">
                <div className="mb-3 flex items-center justify-between">
                  <span className="movie-meta !text-[10px] text-zinc-500 uppercase tracking-widest !mb-0">Editing: {selectedItem.file.name}</span>
                  <span className="movie-meta !text-[10px] text-emerald-500 uppercase tracking-widest !mb-0">SRT Generated Successfully</span>
                </div>
                
                {useBrandStyling && brandKit && (
                  <div className="mb-6 p-6 bg-black rounded-2xl border border-white/10 relative overflow-hidden group">
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent pointer-events-none"></div>
                    <div className="relative z-10 flex flex-col items-center justify-center h-28 text-center">
                      <p className="movie-meta !text-[10px] text-white/30 uppercase tracking-widest mb-4 !mb-4">Styled Preview</p>
                      <div 
                        className="px-6 py-3 rounded-xl shadow-2xl transform transition-transform group-hover:scale-105"
                        style={{ 
                          backgroundColor: `${brandKit.primaryColor}CC`, 
                          color: 'white',
                          fontFamily: brandKit.font,
                          border: `1px solid ${brandKit.secondaryColor}`
                        }}
                      >
                        <span className="movie-body !text-[16px] font-bold drop-shadow-md !leading-tight block">
                          {selectedItem.result.split('\n').find(line => line.trim() && !line.includes('-->') && !/^\d+$/.test(line)) || "Sample Subtitle Text"}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                <textarea
                  value={selectedItem.result}
                  onChange={(e) => handleResultChange(selectedItem.id, e.target.value)}
                  className="flex-1 w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-2xl p-6 movie-body !text-[14px] !font-mono text-slate-900 dark:text-zinc-100 focus:ring-2 focus:ring-accent outline-none transition-all resize-none leading-relaxed"
                  spellCheck={false}
                />
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center opacity-50">
                <p className="movie-meta !text-[12px] text-zinc-700 uppercase tracking-widest !mb-0">Ready to process transcription</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-8 bg-rose-500/10 border border-rose-500/20 p-5 rounded-2xl text-rose-500 movie-meta !text-[12px] uppercase tracking-widest text-center flex items-center justify-center gap-3 !mb-0">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          {error}
        </div>
      )}
    </div>
  );
};

export default SubtitleStudio;

