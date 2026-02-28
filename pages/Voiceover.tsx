
import React, { useState, useRef, useEffect } from 'react';
import { generateSpeech, playAudio } from '../services/geminiService';
import { CREDIT_COSTS, ContentType } from '../types';

interface VoiceoverProps {
  onSpendCredits: (amount: number) => boolean;
}

const Voiceover: React.FC<VoiceoverProps> = ({ onSpendCredits }) => {
  const [text, setText] = useState('');
  const [characterId, setCharacterId] = useState('thiha_mm');
  
  // Advanced Controls: -100% to 100%
  const [voiceSpeed, setVoiceSpeed] = useState(0); 
  const [voicePitch, setVoicePitch] = useState(0); 

  const [isProcessing, setIsProcessing] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isChecked, setIsChecked] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  
  const audioCtxRef = useRef<AudioContext | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const isMounted = useRef(true);

  const MAX_CHARS = 4500;

  const characters = [
    { 
      id: 'thiha_mm', 
      name: 'THIHA (သီဟ)', 
      baseVoice: 'Fenrir', 
      desc: 'Powerful & Commanding',
      bio: 'ဩဇာရှိသောအသံ - သတင်း၊ ကြေညာချက်များနှင့် အစီအစဉ်များအတွက် အကောင်းဆုံးဖြစ်ပါသည်။ စကားပြောပြတ်သားပြီး ခန့်ညားသောပုံစံဖြစ်သည်။' 
    },
    { 
      id: 'nilar_mm', 
      name: 'NILAR (နီလာ)', 
      baseVoice: 'Kore', 
      desc: 'Sweet & Natural',
      bio: 'ချိုသာကြည်လင်သောအသံ - Vlog၊ ပုံပြင်များနှင့် နေ့စဉ်စကားပြောများအတွက် အကောင်းဆုံးဖြစ်ပါသည်။ နားထောင်ရသူကို စိတ်အေးချမ်းစေသည့်ပုံစံဖြစ်သည်။'
    },
    { 
      id: 'minkhant_mm', 
      name: 'MIN KHANT (မင်းခန့်)', 
      baseVoice: 'Puck', 
      desc: 'Energetic & Youthful',
      bio: 'တက်ကြွသောအသံ - Review၊ နည်းပညာအကြောင်းအရာများနှင့် လူငယ်အကြိုက် ဗီဒီယိုများအတွက် အကောင်းဆုံးဖြစ်ပါသည်။ မြန်ဆန်ပြီး လန်းဆန်းသောပုံစံဖြစ်သည်။'
    },
    { 
      id: 'maythu_mm', 
      name: 'MAY THU (မေသူ)', 
      baseVoice: 'Zephyr', 
      desc: 'Soft & Poetic',
      bio: 'နူးညံ့သိမ်မွေ့သောအသံ - ကဗျာ၊ စာပေနှင့် စိတ်ခံစားမှုအသားပေး အကြောင်းအရာများအတွက် အကောင်းဆုံးဖြစ်ပါသည်။ အပြောညင်သာပြီး ထိရှလွယ်သောပုံစံဖြစ်သည်။'
    },
    { id: 'charon_main', name: 'CHARON (Global)', baseVoice: 'Charon', desc: 'Deep & Formal', bio: 'High-fidelity deep male voice for global content.' },
  ];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      isMounted.current = false;
      document.removeEventListener('mousedown', handleClickOutside);
      if (audioCtxRef.current) audioCtxRef.current.close();
    };
  }, []);

  const handlePaste = async () => {
    try {
      const clipboardText = await navigator.clipboard.readText();
      setText(clipboardText.slice(0, MAX_CHARS));
      setIsChecked(false);
    } catch (err) {
      setError("Clipboard access denied.");
    }
  };

  const handleClear = () => {
    setText('');
    setAudioUrl(null);
    setIsChecked(false);
    stopAudio();
  };

  const handleCheck = () => {
    if (!text.trim()) { setError("Script is empty."); return; }
    setIsChecked(true);
    setError(null);
  };

  const stopAudio = () => {
    if (audioCtxRef.current) { audioCtxRef.current.close(); audioCtxRef.current = null; }
    setIsPlaying(false);
    setIsPreviewing(null);
  };

  const togglePlayback = async () => {
    if (isPlaying) stopAudio();
    else if (audioUrl) {
      try {
        setIsPlaying(true);
        const { ctx } = await playAudio(audioUrl, () => { setIsPlaying(false); audioCtxRef.current = null; });
        audioCtxRef.current = ctx;
      } catch (err) { setError("Playback error."); setIsPlaying(false); }
    }
  };

  const handlePreview = async (e: React.MouseEvent, charId: string) => {
    e.stopPropagation();
    if (isPreviewing) {
        if (isPreviewing === charId) {
            stopAudio();
            return;
        }
        stopAudio();
    }
    
    setIsPreviewing(charId);
    const char = characters.find(c => c.id === charId);
    if (!char) return;

    try {
      const sampleText = char.name.includes('THIHA') || char.name.includes('NILAR') || char.name.includes('MIN KHANT') || char.name.includes('MAY THU')
        ? `မင်္ဂလာပါ။ ကျွန်တော့်အမည်က ${char.name.split(' ')[0]} ဖြစ်ပြီး၊ လုမီနာ အေအိုင်ရဲ့ အဆင့်မြင့် အသံပိုင်ရှင်ဖြစ်ပါတယ်။` 
        : `Hello! This is ${char.name}. How can I help you today?`;
      
      const blobUrl = await generateSpeech(sampleText, char.baseVoice, 0, 0);
      if (isMounted.current) {
        const { ctx } = await playAudio(blobUrl, () => { 
            if (isMounted.current) {
                setIsPreviewing(null); 
                audioCtxRef.current = null; 
            }
            URL.revokeObjectURL(blobUrl); 
        });
        audioCtxRef.current = ctx;
      }
    } catch (err: any) { 
        if (isMounted.current) {
            setError("Preview failed."); 
            setIsPreviewing(null); 
        }
    }
  };

  const handleGenerate = async () => {
    if (!text.trim() || !isChecked) return;
    setError(null);
    stopAudio();
    if (!onSpendCredits(CREDIT_COSTS[ContentType.VOICEOVER])) { setError("Not enough credits."); return; }

    setIsProcessing(true);
    const char = characters.find(c => c.id === characterId);
    
    try {
      const blobUrl = await generateSpeech(text, char?.baseVoice || 'Kore', voiceSpeed, voicePitch);
      if (isMounted.current) {
        setAudioUrl(blobUrl);
      }
    } catch (err: any) { 
        if (isMounted.current) setError(err.message || "Synthesis failed."); 
    } 
    finally { 
        if (isMounted.current) setIsProcessing(false); 
    }
  };

  const selectedChar = characters.find(c => c.id === characterId);

  return (
    <div className="max-w-xl mx-auto pb-6">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-600/20">
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        </div>
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">Voiceover Studio</h1>
          <p className="text-slate-500 dark:text-zinc-400 text-[9px] font-bold uppercase tracking-widest">Neural Synthesis • {CREDIT_COSTS[ContentType.VOICEOVER]} Credits</p>
        </div>
      </div>

      <div className="glass p-3 rounded-xl border border-white/5 space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* Talent Selection */}
        <div className="relative z-30" ref={dropdownRef}>
          <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-zinc-600 mb-1 block">Voice Model</label>
          <button 
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="w-full flex items-center justify-between p-2.5 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl hover:border-indigo-500/50 transition-all"
          >
            <div className="flex flex-col items-start text-left">
              <span className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest">{selectedChar?.name}</span>
              <span className="text-[8px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-widest mt-0.5">{selectedChar?.desc}</span>
            </div>
            <svg className={`w-3 h-3 text-slate-400 transition-transform duration-300 ${isDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>

          {isDropdownOpen && (
            <div className="absolute left-0 right-0 mt-1 bg-white dark:bg-[#1a1b1e] border border-slate-200 dark:border-white/10 rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 z-50">
              <div className="max-h-[200px] overflow-y-auto custom-scrollbar p-1.5 space-y-1">
                {characters.map((char) => (
                  <div
                    key={char.id}
                    onClick={() => { setCharacterId(char.id); setIsDropdownOpen(false); }}
                    className={`flex items-center justify-between p-2 rounded-lg transition-all cursor-pointer ${
                      characterId === char.id ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300' : 'hover:bg-slate-50 dark:hover:bg-white/5 text-slate-700 dark:text-zinc-300'
                    }`}
                  >
                    <div className="flex flex-col">
                      <span className="text-[9px] font-black uppercase tracking-widest">{char.name}</span>
                      <span className="text-[7px] font-bold uppercase text-slate-500 dark:text-zinc-500 tracking-widest mt-0.5">{char.desc}</span>
                    </div>
                    <button
                      onClick={(e) => handlePreview(e, char.id)}
                      className={`p-1.5 rounded-md transition-all ${
                        isPreviewing === char.id ? 'bg-rose-500 text-white animate-pulse' : 'bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-zinc-400 hover:bg-indigo-500 hover:text-white dark:hover:bg-indigo-500'
                      }`}
                    >
                      {isPreviewing === char.id ? '...' : <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 11-2 0V8zm3-2l-3 2v4l3-2V5z" clipRule="evenodd" /></svg>}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-zinc-600">Input Script</label>
            <div className="flex gap-2">
              <button onClick={handlePaste} className="text-[8px] font-black text-slate-400 hover:text-indigo-500 uppercase tracking-widest transition-colors">Paste</button>
              <button onClick={handleClear} className="text-[8px] font-black text-slate-400 hover:text-rose-500 uppercase tracking-widest transition-colors">Clear</button>
            </div>
          </div>
          <textarea
            value={text}
            onChange={(e) => { setText(e.target.value.slice(0, MAX_CHARS)); setIsChecked(false); }}
            placeholder="Enter your script here..."
            className="w-full h-40 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl p-3 text-[13px] text-slate-900 dark:text-zinc-100 focus:border-indigo-500 outline-none transition-all resize-none leading-relaxed"
          />
          <div className="text-[8px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-widest text-right">
            {text.length.toLocaleString()} / {MAX_CHARS.toLocaleString()}
          </div>
        </div>

        {/* Parameters */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <div className="flex justify-between">
              <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-zinc-600">Velocity</label>
              <span className="text-[9px] font-black text-indigo-500">{voiceSpeed}%</span>
            </div>
            <input 
              type="range" min="-100" max="100" step="1" value={voiceSpeed} 
              onChange={(e) => setVoiceSpeed(parseInt(e.target.value))}
              className="w-full h-1 bg-slate-200 dark:bg-white/10 rounded-full appearance-none cursor-pointer accent-indigo-600"
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between">
              <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-zinc-600">Pitch</label>
              <span className="text-[9px] font-black text-indigo-500">{voicePitch}%</span>
            </div>
            <input 
              type="range" min="-100" max="100" step="1" value={voicePitch} 
              onChange={(e) => setVoicePitch(parseInt(e.target.value))}
              className="w-full h-1 bg-slate-200 dark:bg-white/10 rounded-full appearance-none cursor-pointer accent-indigo-600"
            />
          </div>
        </div>

        <div className="pt-1">
          <button
            onClick={isChecked ? handleGenerate : handleCheck}
            disabled={isChecked && isProcessing}
            className={`w-full py-3 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all shadow-lg ${
              !isChecked 
                ? 'bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-slate-900'
                : isProcessing ? 'bg-slate-100 dark:bg-white/5 text-slate-400 dark:text-zinc-500 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/20 active:scale-95'
            }`}
          >
            {isProcessing ? 'Synthesizing...' : isChecked ? 'Generate Audio' : 'Verify Script'}
          </button>
        </div>
      </div>

      {audioUrl && !isProcessing && (
        <div className="mt-4 animate-in slide-in-from-bottom-4 duration-500">
          <div className="glass p-3 rounded-xl border border-emerald-500/30 flex items-center gap-4">
            <button 
              onClick={togglePlayback} 
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${isPlaying ? 'bg-rose-500 text-white animate-pulse' : 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'}`}
            >
              {isPlaying ? (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5 0a1 1 0 012 0v4a1 1 0 11-2 0V8z" clipRule="evenodd" /></svg>
              ) : (
                <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" /></svg>
              )}
            </button>
            <div className="flex-1">
              <h4 className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-tight">Output.wav</h4>
              <p className="text-[8px] font-bold text-slate-500 dark:text-zinc-500 uppercase tracking-widest">{voiceSpeed}% Vel • {voicePitch}% Ptch</p>
            </div>
            <div className="flex gap-2">
              <a href={audioUrl} download="lumina_voiceover.wav" className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-indigo-500 transition-all">Export</a>
              <button onClick={() => setAudioUrl(null)} className="text-[8px] font-black text-slate-400 hover:text-rose-500 uppercase tracking-widest transition-colors">Discard</button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-3 p-2 bg-rose-500/10 border border-rose-500/20 rounded-xl text-center">
          <p className="text-rose-500 dark:text-rose-400 text-[10px] font-bold uppercase tracking-widest">{error}</p>
        </div>
      )}
    </div>
  );
};

export default Voiceover;
