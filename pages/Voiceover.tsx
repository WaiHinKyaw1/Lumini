
import React, { useState, useRef, useEffect } from 'react';
import { generateSpeech, playAudio } from '../services/geminiService';
import { CREDIT_COSTS, ContentType } from '../types';

interface VoiceoverProps {
  onSpendCredits: (amount: number) => boolean;
}

interface VoicePreset {
  id: string;
  name: string;
  charId: string;
  icon: string;
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

  const voicePresets: VoicePreset[] = [
    { id: 'thiha_broadcast', name: 'News Broadcast (Thiha)', charId: 'thiha_mm', icon: '🎙️' },
    { id: 'nilar_story', name: 'Sweet Story (Nilar)', charId: 'nilar_mm', icon: '🌸' },
    { id: 'minkhant_review', name: 'Tech Review (Min Khant)', charId: 'minkhant_mm', icon: '📱' },
    { id: 'maythu_poem', name: 'Poetic Reading (May Thu)', charId: 'maythu_mm', icon: '✍️' },
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

  const handleApplyPreset = (preset: VoicePreset) => {
    setCharacterId(preset.charId);
    setError(null);
    setVoiceSpeed(0);
    setVoicePitch(0);
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
    <div className="max-w-4xl mx-auto pb-10">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center shadow-lg shadow-emerald-600/20">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        </div>
        <div>
          <h1 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">Lumina Voiceover Pro</h1>
          <p className="text-slate-500 dark:text-zinc-400 text-xs font-bold uppercase tracking-wider">Myanmar Master Synthesis • {CREDIT_COSTS[ContentType.VOICEOVER]} Credits</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Main Interface */}
        <div className="lg:col-span-8 space-y-3">
          <div className="glass p-4 rounded-2xl border border-white/5 space-y-4 shadow-2xl relative overflow-hidden">
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none"></div>
            
            <div className="relative z-10">
              <div className="flex justify-between items-center mb-3">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-zinc-500">Script Mastering</label>
                <div className="flex gap-4">
                  <button onClick={handlePaste} className="text-[10px] font-black text-indigo-500 dark:text-indigo-400 uppercase tracking-widest hover:underline">Paste Script</button>
                  <button onClick={handleClear} className="text-[10px] font-black text-rose-500 uppercase tracking-widest hover:underline">Clear</button>
                </div>
              </div>
              <textarea
                value={text}
                onChange={(e) => { setText(e.target.value.slice(0, MAX_CHARS)); setIsChecked(false); }}
                placeholder="မင်္ဂလာပါ။ ဒီနေ့ရဲ့ ထူးခြားတဲ့သတင်းတွေကို အကောင်းဆုံး တင်ဆက်ပေးမှာဖြစ်ပါတယ်။ (Unicode text only)..."
                className="w-full h-72 bg-slate-50 dark:bg-black/30 border border-slate-200 dark:border-white/10 rounded-[2rem] p-6 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all resize-none font-medium leading-[2]"
              />
              <div className="mt-2 flex justify-between items-center px-2">
                <div className="text-[10px] font-black text-slate-400 dark:text-zinc-600 uppercase tracking-widest">
                    {text.length.toLocaleString()} / {MAX_CHARS.toLocaleString()} Tokens
                </div>
              </div>
            </div>

            {/* Precision Controls */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10 pt-6 border-t border-slate-200 dark:border-white/5">
                <div className="space-y-4">
                    <div className="flex justify-between items-center mb-1">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-zinc-500">Speech Velocity</label>
                        <span className={`text-[10px] font-black px-2 py-1 rounded-lg ${voiceSpeed === 0 ? 'bg-slate-500/10 text-slate-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                          {voiceSpeed > 0 ? '+' : ''}{voiceSpeed}%
                        </span>
                    </div>
                    <div className="relative pt-2">
                      <input 
                          type="range" 
                          min="-100" 
                          max="100" 
                          step="1" 
                          value={voiceSpeed} 
                          onChange={(e) => setVoiceSpeed(parseInt(e.target.value))}
                          className="w-full h-2 bg-slate-200 dark:bg-white/10 rounded-full appearance-none cursor-pointer accent-emerald-500"
                      />
                      <div className="absolute left-1/2 -top-0 w-[2px] h-6 bg-slate-300 dark:bg-zinc-700 pointer-events-none rounded-full"></div>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="flex justify-between items-center mb-1">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-zinc-500">Vocal Pitch</label>
                        <span className={`text-[10px] font-black px-2 py-1 rounded-lg ${voicePitch === 0 ? 'bg-slate-500/10 text-slate-500' : 'bg-cyan-500/10 text-cyan-500'}`}>
                          {voicePitch > 0 ? '+' : ''}{voicePitch}%
                        </span>
                    </div>
                    <div className="relative pt-2">
                      <input 
                          type="range" 
                          min="-100" 
                          max="100" 
                          step="1" 
                          value={voicePitch} 
                          onChange={(e) => setVoicePitch(parseInt(e.target.value))}
                          className="w-full h-2 bg-slate-200 dark:bg-white/10 rounded-full appearance-none cursor-pointer accent-cyan-500"
                      />
                      <div className="absolute left-1/2 -top-0 w-[2px] h-6 bg-slate-300 dark:bg-zinc-700 pointer-events-none rounded-full"></div>
                    </div>
                </div>
            </div>

            <button
              onClick={isChecked ? handleGenerate : handleCheck}
              disabled={isChecked && isProcessing}
              className={`w-full py-5 rounded-3xl text-xs font-black uppercase tracking-[0.25em] transition-all shadow-2xl active:scale-[0.98] ${
                !isChecked 
                    ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/20'
                    : isProcessing ? 'bg-slate-200 dark:bg-white/5 text-slate-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20'
              }`}
            >
              {isProcessing ? (
                <div className="flex items-center justify-center gap-4">
                    <div className="w-5 h-5 border-[3px] border-white/20 border-t-white rounded-full animate-spin"></div>
                    Processing Master Audio...
                </div>
              ) : isChecked ? 'Generate Master Studio Recording' : 'Verify & Lock Script'}
            </button>
          </div>

          {audioUrl && !isProcessing && (
            <div className="glass p-6 rounded-[2.5rem] border border-emerald-500/20 bg-emerald-500/5 animate-in slide-in-from-bottom-4 duration-500 shadow-xl">
               <div className="flex items-center gap-8">
                  <button 
                    onClick={togglePlayback} 
                    className={`w-16 h-16 rounded-full flex items-center justify-center transition-all shadow-2xl ${isPlaying ? 'bg-rose-500 text-white animate-pulse' : 'bg-emerald-600 text-white active:scale-90 hover:scale-105'}`}
                  >
                    {isPlaying ? (
                        <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5 0a1 1 0 012 0v4a1 1 0 11-2 0V8z" clipRule="evenodd" /></svg>
                    ) : (
                        <svg className="w-9 h-9 ml-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" /></svg>
                    )}
                  </button>
                  <div className="flex-1">
                     <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest mb-1">Master Rendering Complete</h4>
                     <p className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 mb-5 uppercase tracking-wide">
                         {voiceSpeed}% Rate • {voicePitch}% Pitch • Character: {selectedChar?.name}
                     </p>
                     <div className="flex gap-4">
                        <a 
                            href={audioUrl} 
                            download="lumina_master_recording.wav" 
                            className="px-6 py-2.5 bg-emerald-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.15em] hover:bg-emerald-500 transition-all flex items-center gap-2 shadow-lg shadow-emerald-600/20"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                            Export Master WAV
                        </a>
                        <button onClick={() => setAudioUrl(null)} className="text-[10px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-widest hover:text-rose-500 transition-colors">Discard Rendering</button>
                     </div>
                  </div>
               </div>
            </div>
          )}
        </div>

        {/* Talent Selection & Bio */}
        <div className="lg:col-span-4 space-y-4">
          {/* Character Bio Card */}
          <div className="glass p-5 rounded-[2rem] border border-indigo-500/20 bg-indigo-500/5 shadow-xl animate-in fade-in duration-500">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500 mb-3 px-2">Character Bio</h3>
            <div className="flex items-center gap-4 mb-4 px-2">
                <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white text-xl shadow-lg">
                    {selectedChar?.name.charAt(0)}
                </div>
                <div>
                    <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">{selectedChar?.name}</h4>
                    <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest">{selectedChar?.desc}</p>
                </div>
            </div>
            <p className="text-[11px] font-medium text-slate-600 dark:text-zinc-400 leading-relaxed px-2 bg-white/5 p-3 rounded-xl border border-white/5">
                {selectedChar?.bio}
            </p>
          </div>

           {/* Quick Presets */}
           <div className="glass p-5 rounded-[2rem] border border-white/5 shadow-xl">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-zinc-500 mb-4 px-2">Production Presets</h3>
            <div className="grid grid-cols-1 gap-2">
              {voicePresets.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => handleApplyPreset(preset)}
                  className={`flex items-center justify-between px-5 py-4 rounded-2xl border text-[11px] font-black uppercase tracking-widest transition-all ${
                    characterId === preset.charId
                      ? 'bg-indigo-600 border-indigo-500 text-white shadow-xl'
                      : 'bg-white/5 border-white/5 text-slate-500 dark:text-zinc-400 hover:border-indigo-500/40 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{preset.icon}</span>
                    <span>{preset.name}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Manual Talent Selection */}
          <div className="glass p-5 rounded-[2rem] border border-white/5 relative z-30 shadow-xl" ref={dropdownRef}>
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-zinc-500 mb-4 px-2">Talent Roster</h3>
            
            <button 
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="w-full flex items-center justify-between p-5 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl hover:border-emerald-500/50 transition-all"
            >
              <div className="flex flex-col items-start text-left">
                <span className="text-[11px] font-black uppercase text-slate-900 dark:text-white tracking-widest">{selectedChar?.name}</span>
                <span className="text-[9px] font-bold text-slate-500 dark:text-zinc-500 uppercase tracking-tighter">{selectedChar?.desc}</span>
              </div>
              <svg className={`w-5 h-5 text-slate-400 transition-transform duration-300 ${isDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>

            {isDropdownOpen && (
              <div className="absolute left-5 right-5 mt-4 bg-white dark:bg-[#0f1115] border border-slate-200 dark:border-white/10 rounded-[2.5rem] shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-4 duration-300 z-50">
                <div className="max-h-[400px] overflow-y-auto custom-scrollbar p-3 space-y-1">
                  {characters.map((char) => (
                    <div
                      key={char.id}
                      onClick={() => { setCharacterId(char.id); setIsDropdownOpen(false); }}
                      className={`flex items-center justify-between p-4 rounded-2xl transition-all cursor-pointer ${
                        characterId === char.id ? 'bg-indigo-600 text-white shadow-2xl' : 'hover:bg-slate-100 dark:hover:bg-white/5 text-slate-600 dark:text-zinc-400'
                      }`}
                    >
                      <div className="flex flex-col">
                        <span className="text-[11px] font-black uppercase tracking-widest">{char.name}</span>
                        <span className={`text-[9px] font-bold uppercase opacity-60 tracking-tighter`}>{char.desc}</span>
                      </div>
                      <button
                        onClick={(e) => handlePreview(e, char.id)}
                        className={`p-3 rounded-xl text-[10px] font-black uppercase transition-all shadow-sm ${
                          isPreviewing === char.id ? 'bg-rose-500 text-white animate-pulse' : 'bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-zinc-400 hover:bg-emerald-600 hover:text-white'
                        }`}
                      >
                        {isPreviewing === char.id ? '...' : <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 11-2 0V8zm3-2l-3 2v4l3-2V5z" clipRule="evenodd" /></svg>}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {error && (
        <div className="mt-8 bg-rose-500/10 border border-rose-500/20 p-6 rounded-[2rem] text-rose-500 text-xs font-black text-center animate-in shake duration-500 uppercase tracking-widest">
          {error}
        </div>
      )}
    </div>
  );
};

export default Voiceover;
