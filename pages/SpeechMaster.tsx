
import React, { useState, useRef } from 'react';
import { generateSpeech, playAudio } from '../services/geminiService';
import { CREDIT_COSTS, ContentType } from '../types';

interface SpeechMasterProps {
  onSpendCredits: (amount: number) => boolean;
}

interface Voice {
  id: string;
  name: string;
  desc: string;
  icon: string;
}

const SpeechMaster: React.FC<SpeechMasterProps> = ({ onSpendCredits }) => {
  const [text, setText] = useState('');
  const [selectedVoice, setSelectedVoice] = useState('Kore');
  const [isProcessing, setIsProcessing] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const audioCtxRef = useRef<AudioContext | null>(null);

  const voices: Voice[] = [
    { id: 'Kore', name: 'Kore', desc: 'Professional & Clear', icon: '👩‍💼' },
    { id: 'Puck', name: 'Puck', desc: 'Youthful & Energetic', icon: '👦' },
    { id: 'Charon', name: 'Charon', desc: 'Deep & Authoritative', icon: '🧔' },
    { id: 'Fenrir', name: 'Fenrir', desc: 'Bold & Cinematic', icon: '🐺' },
    { id: 'Zephyr', name: 'Zephyr', desc: 'Soft & Narrative', icon: '🌬️' },
    { id: 'Thiha', name: 'Thiha', desc: 'Deep & Commanding (MM)', icon: '🇲🇲' },
    { id: 'Nilar', name: 'Nilar', desc: 'Sweet & Friendly (MM)', icon: '🌸' },
  ];

  const handleGenerate = async () => {
    if (!text.trim()) return;
    setError(null);
    setAudioUrl(null);

    if (!onSpendCredits(CREDIT_COSTS[ContentType.SPEECH])) {
      setError("Insufficient credits!");
      return;
    }

    setIsProcessing(true);
    try {
      // Map custom names to valid base voices
      let baseVoice = selectedVoice;
      if (selectedVoice === 'Thiha') baseVoice = 'Fenrir';
      if (selectedVoice === 'Nilar') baseVoice = 'Kore';

      // Default to 100% speed/pitch for master simple generation
      const blobUrl = await generateSpeech(text, baseVoice, 100, 100);
      setAudioUrl(blobUrl);

    } catch (err: any) {
      setError(err.message || "Failed to generate speech");
    } finally {
      setIsProcessing(false);
    }
  };

  const togglePlayback = async () => {
    if (isPlaying) {
      if (audioCtxRef.current) {
        audioCtxRef.current.close();
        audioCtxRef.current = null;
      }
      setIsPlaying(false);
    } else if (audioUrl) {
      setIsPlaying(true);
      try {
        const { ctx } = await playAudio(audioUrl, () => {
          setIsPlaying(false);
          audioCtxRef.current = null;
        });
        audioCtxRef.current = ctx;
      } catch (err) {
        setIsPlaying(false);
      }
    }
  };

  return (
    <div className="max-w-3xl mx-auto pb-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-600/20">
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
          </svg>
        </div>
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white uppercase tracking-tighter italic">Speech Master Synthesis</h1>
          <p className="text-slate-500 dark:text-zinc-400 text-[9px] font-black uppercase tracking-widest">Real-time Audio Database Engine</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        <div className="lg:col-span-8 space-y-2">
          <div className="glass p-3 rounded-xl border border-white/5 space-y-3 shadow-2xl relative overflow-hidden">
            <div className="absolute -top-10 -right-10 w-24 h-24 bg-indigo-500/10 rounded-full blur-3xl"></div>
            <div>
              <label className="block text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-zinc-500 mb-2">Input Neural Script</label>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Enter text for broadcast-quality synthesis..."
                className="w-full h-48 bg-slate-50 dark:bg-black/30 border border-slate-200 dark:border-white/10 rounded-2xl p-4 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all resize-none font-medium leading-[1.8]"
              />
              <div className="mt-2 flex justify-between items-center px-1">
                <span className="text-[9px] font-black text-slate-400 dark:text-zinc-600 uppercase tracking-widest">{text.length} Chars</span>
                <button onClick={() => setText('')} className="text-[9px] font-black text-rose-500 uppercase tracking-widest hover:underline transition-all">Format Reset</button>
              </div>
            </div>

            <button
              onClick={handleGenerate}
              disabled={isProcessing || !text.trim()}
              className={`w-full py-3 rounded-xl text-[10px] font-black uppercase tracking-[0.25em] transition-all shadow-2xl active:scale-[0.98] ${
                isProcessing || !text.trim()
                  ? 'bg-slate-100 dark:bg-white/5 text-slate-400 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/20'
              }`}
            >
              {isProcessing ? (
                <div className="flex items-center justify-center gap-3">
                   <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                   Synthesizing Master...
                </div>
              ) : 'Commit to Master Synthesis'}
            </button>
          </div>
        </div>

        <div className="lg:col-span-4 space-y-3">
          <div className="glass p-4 rounded-2xl border border-white/5 space-y-3 shadow-xl">
            <h3 className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-zinc-500 px-1">Talent Roster</h3>
            <div className="space-y-1 max-h-[350px] overflow-y-auto custom-scrollbar pr-1">
              {voices.map((voice) => (
                <button
                  key={voice.id}
                  onClick={() => setSelectedVoice(voice.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left group ${
                    selectedVoice === voice.id
                      ? 'bg-indigo-600 border-indigo-500 text-white shadow-xl'
                      : 'bg-slate-50 dark:bg-white/[0.03] border-slate-200 dark:border-white/5 text-slate-600 dark:text-zinc-400 hover:border-indigo-500/40'
                  }`}
                >
                  <span className="text-xl group-hover:scale-110 transition-transform">{voice.icon}</span>
                  <div>
                    <h4 className="text-[9px] font-black uppercase tracking-widest">{voice.name}</h4>
                    <p className={`text-[8px] font-bold mt-0.5 ${selectedVoice === voice.id ? 'text-indigo-100' : 'text-slate-400'}`}>{voice.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {audioUrl && (
            <div className="glass p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 animate-in zoom-in-95 duration-500 shadow-2xl">
              <div className="flex items-center gap-4">
                <button
                  onClick={togglePlayback}
                  className={`w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-2xl active:scale-90 ${
                    isPlaying ? 'bg-rose-500 text-white animate-pulse' : 'bg-emerald-600 text-white hover:scale-105'
                  }`}
                >
                  {isPlaying ? (
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5 0a1 1 0 012 0v4a1 1 0 11-2 0V8z" clipRule="evenodd" /></svg>
                  ) : (
                    <svg className="w-6 h-6 ml-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" /></svg>
                  )}
                </button>
                <div className="flex-1">
                  <h4 className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest mb-0.5 italic">✓ Master Locked</h4>
                  <a
                    href={audioUrl}
                    download="lumina_real_data_export.wav"
                    className="flex items-center gap-1.5 text-[9px] font-black text-indigo-500 dark:text-indigo-400 uppercase tracking-widest hover:underline"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    Export WAV
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-6 p-4 bg-rose-500/10 border border-rose-500/20 text-rose-500 text-[9px] font-black text-center rounded-2xl animate-in shake duration-500 uppercase tracking-widest">
          Error Synthesis: {error}
        </div>
      )}
    </div>
  );
};

export default SpeechMaster;
