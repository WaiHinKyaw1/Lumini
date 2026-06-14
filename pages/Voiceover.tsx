
import React, { useState, useRef, useEffect } from 'react';
import { generateSpeech, playAudio } from '../services/geminiService';
import { CREDIT_COSTS, ContentType } from '../types';

interface VoiceoverProps {
  onSpendCredits: (amount: number) => boolean;
}

const Voiceover: React.FC<VoiceoverProps> = ({ onSpendCredits }) => {
  const [text, setText] = useState('');
  const [characterId, setCharacterId] = useState('thiha_mm');
  const [tone, setTone] = useState('thrilling');
  
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
  const [countdown, setCountdown] = useState<number | null>(null);
  
  const audioCtxRef = useRef<AudioContext | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      setCountdown(null);
      setError(null);
      return;
    }
    const timer = setTimeout(() => {
      setCountdown(prev => (prev !== null ? prev - 1 : null));
    }, 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const MAX_CHARS = 15000;

  const characters = [
    { 
      id: 'thiha_mm', 
      name: 'THIHA', 
      baseVoice: 'Fenrir', 
      desc: 'Powerful & Commanding',
      bio: 'ဩဇာရှိသောအသံ - သတင်း၊ ကြေညာချက်များနှင့် အစီအစဉ်များအတွက် အကောင်းဆုံးဖြစ်ပါသည်။ စကားပြောပြတ်သားပြီး ခန့်ညားသောပုံစံဖြစ်သည်။' 
    },
    { 
      id: 'nilar_mm', 
      name: 'NILAR', 
      baseVoice: 'Kore', 
      desc: 'Sweet & Natural',
      bio: 'ချိုသာကြည်လင်သောအသံ - Vlog၊ ပုံပြင်များနှင့် နေ့စဉ်စကားပြောများအတွက် အကောင်းဆုံးဖြစ်ပါသည်။ နားထောင်ရသူကို စိတ်အေးချမ်းစေသည့်ပုံစံဖြစ်သည်။'
    },
    { 
      id: 'minkhant_mm', 
      name: 'MIN KHANT', 
      baseVoice: 'Puck', 
      desc: 'Energetic & Youthful',
      bio: 'တက်ကြွသောအသံ - Review၊ နည်းပညာအကြောင်းအရာများနှင့် လူငယ်အကြိုက် ဗီဒီယိုများအတွက် အကောင်းဆုံးဖြစ်ပါသည်။ မြန်ဆန်ပြီး လန်းဆန်းသောပုံစံဖြစ်သည်။'
    },
    { 
      id: 'maythu_mm', 
      name: 'MAY THU', 
      baseVoice: 'Zephyr', 
      desc: 'Soft & Poetic',
      bio: 'နူးညံ့သိမ်မွေ့သောအသံ - ကဗျာ၊ စာပေနှင့် စိတ်ခံစားမှုအသားပေး အကြောင်းအရာများအတွက် အကောင်းဆုံးဖြစ်ပါသည်။ အပြောညင်သာပြီး ထိရှလွယ်သောပုံစံဖြစ်သည်။'
    },
    { id: 'charon_main', name: 'CHARON', baseVoice: 'Charon', desc: 'Deep & Formal', bio: 'High-fidelity deep male voice for global content.' },
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
            setError(err.message || "Preview failed."); 
            setIsPreviewing(null); 
            try {
              if (err.message && err.message.startsWith('{') && err.message.includes('isQuotaError')) {
                const parsed = JSON.parse(err.message);
                setCountdown(parsed.retryAfter || 45);
              }
            } catch (_) {}
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
    
    // Create a voice map for multi-voice tagging
    const voiceMap: Record<string, string> = {};
    characters.forEach(c => {
      voiceMap[c.name] = c.baseVoice;
    });

    try {
      const blobUrl = await generateSpeech(text, char?.baseVoice || 'Kore', voiceSpeed, voicePitch, voiceMap, tone);
      if (isMounted.current) {
        setAudioUrl(blobUrl);
      }
    } catch (err: any) { 
        if (isMounted.current) {
          setError(err.message || "Synthesis failed."); 
          try {
            if (err.message && err.message.startsWith('{') && err.message.includes('isQuotaError')) {
              const parsed = JSON.parse(err.message);
              setCountdown(parsed.retryAfter || 45);
            }
          } catch (_) {}
        }
    } 
    finally { 
        if (isMounted.current) setIsProcessing(false); 
    }
  };

  const selectedChar = characters.find(c => c.id === characterId);

  return (
    <div className="max-w-xl mx-auto pb-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-accent rounded-xl flex items-center justify-center shadow-lg shadow-accent/20">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        </div>
        <div>
          <h1 className="movie-h2 !text-xl !mb-0 uppercase tracking-tighter">Voiceover Studio</h1>
          <p className="movie-meta !text-[10px] !mb-0 uppercase tracking-widest text-zinc-500">Neural Synthesis • {CREDIT_COSTS[ContentType.VOICEOVER]} Credits</p>
        </div>
      </div>

      <div className="glass p-6 rounded-2xl border border-white/5 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* Talent Selection */}
        <div className="relative z-30" ref={dropdownRef}>
          <label className="movie-meta !text-[9px] uppercase tracking-[0.2em] !mb-2 block">Voice Model</label>
          <button 
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="w-full flex items-center justify-between p-4 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl hover:border-accent/50 transition-all"
          >
            <div className="flex flex-col items-start text-left">
              <span className="movie-h2 !text-sm !mb-0 uppercase tracking-widest">{selectedChar?.name}</span>
              <span className="movie-meta !text-[10px] !mb-0 uppercase mt-0.5">{selectedChar?.desc}</span>
            </div>
            <svg className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${isDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>

          {isDropdownOpen && (
            <div className="absolute left-0 right-0 mt-2 bg-midnight border border-white/10 rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 z-50">
              <div className="max-h-[200px] overflow-y-auto custom-scrollbar p-2 space-y-1">
                {characters.map((char) => (
                  <div
                    key={char.id}
                    onClick={() => { setCharacterId(char.id); setIsDropdownOpen(false); }}
                    className={`flex items-center justify-between p-3 rounded-lg transition-all cursor-pointer ${
                      characterId === char.id ? 'bg-accent/10 text-accent' : 'hover:bg-white/5 text-zinc-300'
                    }`}
                  >
                    <div className="flex flex-col">
                      <span className="movie-h2 !text-xs !mb-0 uppercase tracking-widest">{char.name}</span>
                      <span className="movie-meta !text-[9px] !mb-0 uppercase mt-0.5">{char.desc}</span>
                    </div>
                    <button
                      onClick={(e) => handlePreview(e, char.id)}
                      className={`p-2 rounded-md transition-all ${
                        isPreviewing === char.id ? 'bg-rose-500 text-white animate-pulse' : 'bg-white/10 text-zinc-400 hover:bg-accent hover:text-white'
                      }`}
                    >
                      {isPreviewing === char.id ? '...' : <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 11-2 0V8zm3-2l-3 2v4l3-2V5z" clipRule="evenodd" /></svg>}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Narration Style & Tone (Matches custom video-recap channel configuration) */}
        <div className="space-y-3">
          <label className="movie-meta !text-[9px] uppercase tracking-[0.2em] block">Narration Style & Tone</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {[
              { id: 'thrilling', name: 'Thrilling Recap', desc: 'Recap Slang' },
              { id: 'professional', name: 'Professional', desc: 'Commanding News' },
              { id: 'sweet', name: 'Storytelling', desc: 'Friendly Sweet' },
              { id: 'sarcastic', name: 'Sarcastic', desc: 'Witty Mockery' },
              { id: 'emotional', name: 'Emotional', desc: 'Poetic Poetry' },
              { id: 'mystery', name: 'Mystery', desc: 'Suspenseful' }
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setTone(t.id)}
                type="button"
                className={`p-3 rounded-xl border text-center transition-all flex flex-col items-center justify-center ${
                  tone === t.id 
                    ? 'bg-accent/10 border-accent text-accent shadow-lg shadow-accent/5' 
                    : 'bg-transparent border-slate-200 dark:border-white/5 text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-white/5'
                }`}
              >
                <span className="movie-h2 !text-[11px] !mb-0 uppercase tracking-wider font-bold">{t.name}</span>
                <span className="text-[8px] opacity-75 font-mono mt-0.5">{t.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Input Area */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <label className="movie-meta !text-[9px] uppercase tracking-[0.2em]">Input Script</label>
              <div className="group relative">
                <svg className="w-4 h-4 text-slate-400 cursor-help" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <div className="absolute bottom-full left-0 mb-2 w-48 p-2 bg-midnight text-[9px] text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity border border-white/10 pointer-events-none z-50">
                  Use tags like <span className="text-accent">[NILAR]</span> or <span className="text-accent">[THIHA]</span> to switch voices in the same script.
                </div>
              </div>
            </div>
            <div className="flex gap-4">
              <button onClick={handlePaste} className="movie-meta !text-[10px] uppercase tracking-widest text-zinc-500 hover:text-accent transition-colors !mb-0">Paste</button>
              <button onClick={handleClear} className="movie-meta !text-[10px] uppercase tracking-widest text-zinc-500 hover:text-rose-500 transition-colors !mb-0">Clear</button>
            </div>
          </div>
          <textarea
            value={text}
            onChange={(e) => { setText(e.target.value.slice(0, MAX_CHARS)); setIsChecked(false); }}
            placeholder="Enter your script here..."
            className="w-full h-48 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl p-4 movie-body !text-[14px] text-slate-900 dark:text-zinc-100 focus:border-accent outline-none transition-all resize-none leading-relaxed"
          />
          <div className="movie-meta !text-[10px] text-zinc-500 uppercase tracking-widest text-right !mb-0">
            {text.length.toLocaleString()} / {MAX_CHARS.toLocaleString()}
          </div>
        </div>

        {/* Parameters */}
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <div className="flex justify-between">
              <label className="movie-meta !text-[10px] uppercase tracking-widest">Velocity</label>
              <span className="movie-meta !text-[10px] text-accent !mb-0">{voiceSpeed}%</span>
            </div>
            <input 
              type="range" min="-100" max="100" step="1" value={voiceSpeed} 
              onChange={(e) => setVoiceSpeed(parseInt(e.target.value))}
              className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-accent"
            />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <label className="movie-meta !text-[10px] uppercase tracking-widest">Pitch</label>
              <span className="movie-meta !text-[10px] text-accent !mb-0">{voicePitch}%</span>
            </div>
            <input 
              type="range" min="-100" max="100" step="1" value={voicePitch} 
              onChange={(e) => setVoicePitch(parseInt(e.target.value))}
              className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-accent"
            />
          </div>
        </div>

        <div className="pt-2">
          <button
            onClick={isChecked ? handleGenerate : handleCheck}
            disabled={isChecked && isProcessing}
            className={`w-full py-4 rounded-xl movie-meta !text-[12px] uppercase tracking-[0.2em] transition-all shadow-xl ${
              !isChecked 
                ? 'bg-zinc-100 hover:bg-zinc-200 text-midnight dark:bg-zinc-900 dark:hover:bg-zinc-800 dark:text-white'
                : isProcessing ? 'bg-white/5 text-zinc-500 cursor-not-allowed' : 'bg-accent hover:bg-accent-hover text-white shadow-accent/20 active:scale-[0.98]'
            }`}
          >
            {isProcessing ? 'Synthesizing...' : isChecked ? 'Generate Audio' : 'Verify Script'}
          </button>
        </div>
      </div>

      {audioUrl && !isProcessing && (
        <div className="mt-6 animate-in slide-in-from-bottom-4 duration-500">
          <div className="glass p-4 rounded-2xl border border-emerald-500/30 flex items-center gap-6">
            <button 
              onClick={togglePlayback} 
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${isPlaying ? 'bg-rose-500 text-white animate-pulse' : 'bg-emerald-500/20 text-emerald-400 shadow-lg shadow-emerald-500/10'}`}
            >
              {isPlaying ? (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5 0a1 1 0 012 0v4a1 1 0 11-2 0V8z" clipRule="evenodd" /></svg>
              ) : (
                <svg className="w-6 h-6 ml-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" /></svg>
              )}
            </button>
            <div className="flex-1">
              <h4 className="movie-h2 !text-sm !mb-0 uppercase tracking-tight">Synthesis Output</h4>
              <p className="movie-meta !text-[10px] !mb-0 uppercase tracking-widest text-zinc-500">{voiceSpeed}% Vel • {voicePitch}% Ptch</p>
            </div>
            <div className="flex gap-4">
              <a href={audioUrl} download="lumina_voiceover.wav" className="px-5 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-xl movie-meta !text-[10px] uppercase tracking-widest shadow-lg shadow-accent/20 transition-all active:scale-95">Export</a>
              <button onClick={() => setAudioUrl(null)} className="movie-meta !text-[10px] uppercase tracking-widest text-zinc-500 hover:text-rose-500 transition-colors !mb-0">Discard</button>
            </div>
          </div>
        </div>
      )}

      {error && (() => {
        let parsedQuotaError = null;
        try {
          if (error.startsWith('{') && error.includes('isQuotaError')) {
            parsedQuotaError = JSON.parse(error);
          }
        } catch (_) {}

        return (
          <div className="mt-4">
            {parsedQuotaError ? (
              <div className="p-5 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-left space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2 text-amber-500 font-extrabold text-[11px] uppercase tracking-widest">
                    <svg className="w-4 h-4 animate-spin text-amber-500 flex-shrink-0" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Quota Limit Exceeded</span>
                  </div>
                  {countdown !== null && (
                    <span className="px-2.5 py-1 bg-amber-500 text-midnight dark:text-black rounded-lg text-[10px] font-black uppercase tracking-widest animate-pulse">
                      Please Wait: {countdown}s
                    </span>
                  )}
                </div>
                
                <div className="space-y-2">
                  <p className="text-xs text-amber-600 dark:text-amber-400 font-bold leading-relaxed">
                    {parsedQuotaError.mmMessage}
                  </p>
                  <div className="text-[10px] text-zinc-500 dark:text-zinc-400 font-normal leading-relaxed bg-[#0e0e11]/50 p-3.5 rounded-xl border border-white/5 space-y-1.5">
                    <span className="text-[10px] font-black uppercase text-zinc-400 tracking-wider block">💡 ဖြေရှင်းနည်းလမ်းညွှန်များ -</span>
                    <p>၁။ <strong>ခေတ္တခဏ စောင့်ဆိုင်းပေးပါ -</strong> အခမဲ့ဗားရှင်း (Free Tier) သည် တစ်မိနစ်လျှင် အသံဖန်တီးမှု ၃ ကြိမ်သာ ခွင့်ပြုသောကြောင့် စက္ကန့် ၃၀ ခန့် စောင့်ပြီးမှ ပြန်လည်လုပ်ဆောင်ပေးပါ။</p>
                    <p>၂။ <strong>ကိုယ်ပိုင် API Key သုံးပါ -</strong> Profile သို့မဟုတ် Settings စာမျက်နှာတွင် သင်၏ကိုယ်ပိုင် Gemini API Key အား ထည့်သွင်းပါက ကန့်သတ်ချက်မရှိ စိုက်ကြိုက်အသုံးပြုနိုင်ပါမည်။</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-center">
                <p className="text-rose-500 dark:text-rose-400 text-[10px] font-bold uppercase tracking-widest">{error}</p>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
};

export default Voiceover;
