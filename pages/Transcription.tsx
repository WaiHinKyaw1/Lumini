
import React, { useState } from 'react';
import { analyzeDocumentStream } from '../services/geminiService';
import { CREDIT_COSTS, ContentType } from '../types';

interface TranscriptionProps {
  onSpendCredits: (amount: number) => boolean;
}

const Transcription: React.FC<TranscriptionProps> = ({ onSpendCredits }) => {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [messageIndex, setMessageIndex] = useState(0);
  const isMounted = React.useRef(true);

  const MESSAGES = [
    "Decoding media...",
    "Analyzing speech patterns...",
    "Transcribing content...",
    "Refining text accuracy...",
    "Almost there..."
  ];

  React.useEffect(() => {
    if (isProcessing) {
      const interval = setInterval(() => {
        setMessageIndex((prev) => (prev + 1) % MESSAGES.length);
      }, 4000);
      return () => clearInterval(interval);
    } else {
      setMessageIndex(0);
    }
  }, [isProcessing]);

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
      let base64 = "";
      let mimeType = file.type;
      
      // If it's a video, extract audio to speed up upload drastically
      if (file.type.startsWith('video/')) {
        try {
          base64 = await extractAudioFromVideo(file);
          mimeType = 'audio/wav';
        } catch (e) {
          console.warn("Audio extraction failed, falling back to full file upload", e);
          const reader = new FileReader();
          const base64Promise = new Promise<string>((resolve) => {
            reader.onload = () => resolve((reader.result as string).split(',')[1]);
            reader.readAsDataURL(file);
          });
          base64 = await base64Promise;
        }
      } else {
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve) => {
          reader.onload = () => resolve((reader.result as string).split(',')[1]);
          reader.readAsDataURL(file);
        });
        base64 = await base64Promise;
      }
      
      const systemInstruction = "You are a professional Transcriber. Your goal is to convert audio/video speech into accurate text. Follow the user's formatting rules strictly.";
      const prompt = `Transcribe the audio content into PURE TRANSCRIPTION format.
Rules:
- Remove author names, speaker labels, titles, headings, and metadata.
- Keep ONLY spoken dialogue and narration sentences.
- One sentence per line.
- Output plain text only.`;

      let fullTranscription = "";
      setProgress(10);
      await analyzeDocumentStream(base64, mimeType, prompt, systemInstruction, (chunk) => {
        fullTranscription += chunk;
        setProgress(prev => Math.min(prev + 5, 95));
        if (isMounted.current) {
          setResult(fullTranscription);
        }
      });
      setProgress(100);

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
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-accent rounded-xl flex items-center justify-center shadow-lg shadow-accent/20">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        </div>
        <div>
          <h1 className="movie-h2 !text-xl !mb-0 uppercase tracking-tighter">Transcript Master</h1>
          <p className="movie-meta !text-[10px] !mb-0 uppercase tracking-widest text-zinc-500">Media to Text • {CREDIT_COSTS[ContentType.TRANSCRIPTION]} Credits</p>
        </div>
      </div>

      <div className="glass p-6 rounded-2xl border border-white/5 space-y-6">
        {!result && !isProcessing ? (
          <div className="text-center">
            <input type="file" onChange={handleFileChange} accept="video/*,audio/*,.mp4,.mov,.mkv,.mp3,.wav,.m4a" className="hidden" id="trans-upload" />
            <label
              htmlFor="trans-upload"
              className={`flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed rounded-2xl transition-all cursor-pointer ${
                file 
                  ? 'border-accent bg-accent/5' 
                  : 'border-white/10 hover:border-accent/40 hover:bg-white/5'
              }`}
            >
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${file ? 'bg-accent/20 text-accent' : 'bg-white/5 text-zinc-500'}`}>
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <div className="space-y-1">
                <h3 className="movie-h2 !text-sm !mb-0 uppercase tracking-tight">{file ? 'File Locked' : 'Drop Media'}</h3>
                <p className="movie-meta !text-[10px] !mb-0 uppercase tracking-widest text-zinc-500 truncate max-w-[200px]">{file ? file.name : 'MP3, MP4, WAV'}</p>
              </div>
            </label>

            <button
              onClick={handleProcess}
              disabled={!file}
              className={`w-full mt-6 py-4 rounded-xl movie-meta !text-[12px] uppercase tracking-[0.2em] transition-all shadow-xl ${
                file 
                  ? 'bg-accent hover:bg-accent-hover text-white shadow-accent/20 active:scale-[0.98]' 
                  : 'bg-white/5 text-zinc-600 cursor-not-allowed'
              }`}
            >
              Execute Transcription
            </button>
          </div>
        ) : isProcessing ? (
          <div className="py-12 text-center space-y-4">
            <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
              <div className="bg-accent h-full rounded-full transition-all duration-300 shadow-[0_0_10px_rgba(225,29,72,0.4)]" style={{ width: `${progress}%` }}></div>
            </div>
            <p className="movie-meta !text-[10px] uppercase tracking-widest text-zinc-500 animate-pulse">{MESSAGES[messageIndex]}</p>
          </div>
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div className="flex justify-between items-center mb-4 pb-4 border-b border-white/5">
              <div className="flex items-center gap-2">
                 <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.4)]"></div>
                 <h3 className="movie-h2 !text-xs !mb-0 uppercase tracking-widest">Transcript Output</h3>
              </div>
              <div className="flex gap-4">
                <button onClick={() => {setResult(null); setFile(null);}} className="movie-meta !text-[10px] uppercase tracking-widest text-zinc-500 hover:text-accent transition-colors !mb-0">Discard</button>
                <button onClick={() => navigator.clipboard.writeText(result || '')} className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg movie-meta !text-[10px] uppercase tracking-widest shadow-lg shadow-accent/20 transition-all active:scale-95 !mb-0">Copy Result</button>
              </div>
            </div>
            <div className="p-4 rounded-xl bg-black/40 border border-white/5 max-h-[400px] overflow-y-auto movie-body !text-[14px] leading-[1.8] text-zinc-300 custom-scrollbar">
              {result?.split('\n').map((line, i) => (
                <p key={i} className="mb-4 last:mb-0">{line}</p>
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
