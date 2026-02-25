
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
    <div className="max-w-6xl mx-auto pb-6 font-sans">
      <div className="flex items-center justify-between mb-6 border-b border-zinc-200 dark:border-zinc-800 pb-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl flex items-center justify-center shadow-sm dark:shadow-lg">
            <svg className="w-6 h-6 text-zinc-600 dark:text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Vocal Synthesizer</h1>
            <p className="text-zinc-500 font-mono text-[10px] uppercase tracking-widest mt-1">Module: Voiceover Pro • Cost: {CREDIT_COSTS[ContentType.VOICEOVER]} CR</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full ${isProcessing ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`}></div>
            <span className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">{isProcessing ? 'Processing' : 'System Ready'}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Main Interface */}
        <div className="lg:col-span-8 space-y-4">
          <div className="bg-white dark:bg-[#151619] border border-zinc-200 dark:border-zinc-800/50 rounded-2xl p-4 shadow-sm dark:shadow-2xl">
            <div className="flex justify-between items-center mb-3">
              <label className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" /></svg>
                Input Script
              </label>
              <div className="flex gap-3">
                <button onClick={handlePaste} className="font-mono text-[10px] text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors uppercase tracking-widest flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                  Paste
                </button>
                <button onClick={handleClear} className="font-mono text-[10px] text-rose-600/70 dark:text-rose-500/70 hover:text-rose-600 dark:hover:text-rose-400 transition-colors uppercase tracking-widest flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  Clear
                </button>
              </div>
            </div>
            <textarea
              value={text}
              onChange={(e) => { setText(e.target.value.slice(0, MAX_CHARS)); setIsChecked(false); }}
              placeholder="Enter your script here..."
              className="w-full h-48 bg-zinc-50 dark:bg-[#0a0a0c] border border-zinc-200 dark:border-zinc-800/80 rounded-xl p-4 text-sm text-zinc-900 dark:text-zinc-300 focus:border-zinc-400 dark:focus:border-zinc-600 focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-600 outline-none transition-all resize-none leading-relaxed font-sans"
            />
            <div className="mt-2 flex justify-between items-center">
              <div className="font-mono text-[10px] text-zinc-500 dark:text-zinc-600 uppercase tracking-widest">
                  {text.length.toLocaleString()} / {MAX_CHARS.toLocaleString()} Chars
              </div>
            </div>
          </div>

          {/* Precision Controls */}
          <div className="bg-white dark:bg-[#151619] border border-zinc-200 dark:border-zinc-800/50 rounded-2xl p-4 shadow-sm dark:shadow-2xl">
             <h3 className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
                Audio Parameters
             </h3>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                    <div className="flex justify-between items-center">
                        <label className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">Velocity</label>
                        <span className="font-mono text-[10px] text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 px-2 py-1 rounded">
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
                          className="w-full h-1 bg-zinc-200 dark:bg-zinc-800 rounded-full appearance-none cursor-pointer accent-zinc-500 dark:accent-zinc-400"
                      />
                      <div className="absolute left-1/2 -top-1 w-[1px] h-4 bg-zinc-300 dark:bg-zinc-600 pointer-events-none"></div>
                    </div>
                </div>

                <div className="space-y-3">
                    <div className="flex justify-between items-center">
                        <label className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">Pitch</label>
                        <span className="font-mono text-[10px] text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 px-2 py-1 rounded">
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
                          className="w-full h-1 bg-zinc-200 dark:bg-zinc-800 rounded-full appearance-none cursor-pointer accent-zinc-500 dark:accent-zinc-400"
                      />
                      <div className="absolute left-1/2 -top-1 w-[1px] h-4 bg-zinc-300 dark:bg-zinc-600 pointer-events-none"></div>
                    </div>
                </div>
            </div>
            
            <div className="mt-6 pt-4 border-t border-zinc-200 dark:border-zinc-800/50">
                <button
                  onClick={isChecked ? handleGenerate : handleCheck}
                  disabled={isChecked && isProcessing}
                  className={`w-full py-3 rounded-xl font-mono text-[11px] uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3 ${
                    !isChecked 
                        ? 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-300'
                        : isProcessing ? 'bg-zinc-100 text-zinc-400 dark:bg-zinc-900 dark:text-zinc-600 cursor-not-allowed border border-zinc-200 dark:border-zinc-800' : 'bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-200 dark:hover:bg-white dark:text-zinc-900'
                  }`}
                >
                  {isProcessing ? (
                    <>
                        <div className="w-4 h-4 border-2 border-zinc-300 dark:border-zinc-600 border-t-zinc-500 dark:border-t-zinc-400 rounded-full animate-spin"></div>
                        Processing...
                    </>
                  ) : isChecked ? (
                    <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        Generate Audio
                    </>
                  ) : (
                    <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        Verify Script
                    </>
                  )}
                </button>
            </div>
          </div>

          {audioUrl && !isProcessing && (
            <div className="bg-white dark:bg-[#151619] border border-zinc-200 dark:border-zinc-700 rounded-2xl p-4 animate-in slide-in-from-bottom-4 duration-500 shadow-sm dark:shadow-2xl relative overflow-hidden">
               <div className="absolute top-0 left-0 w-1 h-full bg-zinc-400"></div>
               <div className="flex items-center gap-4 pl-2">
                  <button 
                    onClick={togglePlayback} 
                    className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${isPlaying ? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100 border border-zinc-300 dark:border-zinc-600' : 'bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-200 dark:text-zinc-900 dark:hover:bg-white'}`}
                  >
                    {isPlaying ? (
                        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5 0a1 1 0 012 0v4a1 1 0 11-2 0V8z" clipRule="evenodd" /></svg>
                    ) : (
                        <svg className="w-7 h-7 ml-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" /></svg>
                    )}
                  </button>
                  <div className="flex-1">
                     <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight mb-1">Output.wav</h4>
                     <p className="font-mono text-[10px] text-zinc-500 mb-3 uppercase tracking-widest">
                         {voiceSpeed}% Vel • {voicePitch}% Ptch • {selectedChar?.id}
                     </p>
                     <div className="flex gap-3">
                        <a 
                            href={audioUrl} 
                            download="lumina_output.wav" 
                            className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-200 rounded-lg font-mono text-[10px] uppercase tracking-widest transition-colors flex items-center gap-2 border border-zinc-200 dark:border-zinc-700"
                        >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                            Export
                        </a>
                        <button onClick={() => setAudioUrl(null)} className="px-4 py-2 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 font-mono text-[10px] uppercase tracking-widest transition-colors">Discard</button>
                     </div>
                  </div>
               </div>
            </div>
          )}
        </div>

        {/* Talent Selection & Bio */}
        <div className="lg:col-span-4 space-y-4">
          {/* Manual Talent Selection */}
          <div className="bg-white dark:bg-[#151619] border border-zinc-200 dark:border-zinc-800/50 rounded-2xl p-4 shadow-sm dark:shadow-2xl relative z-30" ref={dropdownRef}>
            <h3 className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                Voice Model
            </h3>
            
            <button 
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="w-full flex items-center justify-between p-3 bg-zinc-50 dark:bg-[#0a0a0c] border border-zinc-200 dark:border-zinc-800 rounded-xl hover:border-zinc-300 dark:hover:border-zinc-600 transition-all"
            >
              <div className="flex flex-col items-start text-left">
                <span className="font-mono text-[11px] text-zinc-900 dark:text-zinc-200 uppercase tracking-widest">{selectedChar?.name}</span>
                <span className="font-mono text-[9px] text-zinc-500 uppercase tracking-widest mt-1">{selectedChar?.desc}</span>
              </div>
              <svg className={`w-4 h-4 text-zinc-500 transition-transform duration-300 ${isDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>

            {isDropdownOpen && (
              <div className="absolute left-6 right-6 mt-2 bg-white dark:bg-[#0a0a0c] border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-lg dark:shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 z-50">
                <div className="max-h-[300px] overflow-y-auto custom-scrollbar p-2 space-y-1">
                  {characters.map((char) => (
                    <div
                      key={char.id}
                      onClick={() => { setCharacterId(char.id); setIsDropdownOpen(false); }}
                      className={`flex items-center justify-between p-3 rounded-lg transition-all cursor-pointer ${
                        characterId === char.id ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100' : 'hover:bg-zinc-50 dark:hover:bg-zinc-900 text-zinc-600 dark:text-zinc-400'
                      }`}
                    >
                      <div className="flex flex-col">
                        <span className="font-mono text-[10px] uppercase tracking-widest">{char.name}</span>
                        <span className="font-mono text-[8px] uppercase text-zinc-500 dark:text-zinc-600 tracking-widest mt-0.5">{char.desc}</span>
                      </div>
                      <button
                        onClick={(e) => handlePreview(e, char.id)}
                        className={`p-2 rounded-md transition-all ${
                          isPreviewing === char.id ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 animate-pulse' : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700 hover:text-zinc-700 dark:hover:text-zinc-200'
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

          {/* Character Bio Card */}
          <div className="bg-white dark:bg-[#151619] border border-zinc-200 dark:border-zinc-800/50 rounded-2xl p-4 shadow-sm dark:shadow-2xl">
            <h3 className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                Model Details
            </h3>
            <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-zinc-100 dark:bg-zinc-800 rounded-lg flex items-center justify-center text-zinc-700 dark:text-zinc-300 font-mono text-lg border border-zinc-200 dark:border-zinc-700">
                    {selectedChar?.name.charAt(0)}
                </div>
                <div>
                    <h4 className="font-mono text-[11px] text-zinc-900 dark:text-zinc-200 uppercase tracking-widest">{selectedChar?.name}</h4>
                    <p className="font-mono text-[9px] text-zinc-500 uppercase tracking-widest mt-1">Base: {selectedChar?.baseVoice}</p>
                </div>
            </div>
            <div className="bg-zinc-50 dark:bg-[#0a0a0c] p-3 rounded-xl border border-zinc-200 dark:border-zinc-800/80">
                <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed font-sans">
                    {selectedChar?.bio}
                </p>
            </div>
          </div>
        </div>
      </div>
      
      {error && (
        <div className="mt-4 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 p-3 rounded-xl text-rose-600 dark:text-rose-400 font-mono text-[10px] uppercase tracking-widest text-center flex items-center justify-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          {error}
        </div>
      )}
    </div>
  );
};

export default Voiceover;
