import React, { useState, useRef, useEffect } from 'react';
import { generateSpeech, playAudio } from '../services/geminiService';
import { CREDIT_COSTS, ContentType } from '../types';
import { auth } from '../services/firebase';
import { logGeneration } from '../services/supabase';
import { analyzeVoice, startRecording, type VoiceProfile } from '../services/voiceClone';
import { getVoxCPMStatus, createVoxCPMVoiceClone, synthesizeVoxCPMSpeech } from '../services/voiceCloneApi';
import { Sparkles, Mic, Upload, Play, Square, Download, Trash2, CheckCircle2, Volume2, RefreshCw } from 'lucide-react';

interface VoiceoverProps {
  onSpendCredits: (amount: number) => boolean;
}

const Voiceover: React.FC<VoiceoverProps> = ({ onSpendCredits }) => {
  const [text, setText] = useState('');
  const [characterId, setCharacterId] = useState('thiha_mm');
  const [tone, setTone] = useState('recap_trend');
  
  // Advanced Controls: -100% to 100%
  const [voiceSpeed, setVoiceSpeed] = useState(0); 
  const [voicePitch, setVoicePitch] = useState(0); 

  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStage, setProcessingStage] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isChecked, setIsChecked] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  // --- Simplified Sample Voice & Narration Style State ---
  const [sampleFile, setSampleFile] = useState<File | null>(null);
  const [sampleAudioUrl, setSampleAudioUrl] = useState<string | null>(null);
  const [analyzedProfile, setAnalyzedProfile] = useState<VoiceProfile | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [sampleStatus, setSampleStatus] = useState<string | null>(null);
  const [voxcpmOnline, setVoxcpmOnline] = useState<boolean>(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const isMounted = useRef(true);

  // VoxCPM GPU Server Connection Check
  const checkVoxCPM = async () => {
    try {
      const status = await getVoxCPMStatus();
      if (isMounted.current) {
        setVoxcpmOnline(!!status?.online);
      }
    } catch {
      if (isMounted.current) setVoxcpmOnline(false);
    }
  };

  useEffect(() => {
    isMounted.current = true;
    checkVoxCPM();
    const interval = setInterval(checkVoxCPM, 15000);
    return () => {
      isMounted.current = false;
      clearInterval(interval);
    };
  }, []);

  const MAX_CHARS = 15000;

  const characters = [
    { 
      id: 'thiha_mm', 
      name: 'THIHA', 
      baseVoice: 'Fenrir', 
      desc: 'Powerful & Commanding',
      bio: 'သတင်း၊ ကြေညာချက်များနှင့် movie recap အတွက် ခန့်ညားဩဇာရှိသောအသံ' 
    },
    { 
      id: 'nilar_mm', 
      name: 'NILAR', 
      baseVoice: 'Kore', 
      desc: 'Sweet & Natural',
      bio: 'ချိုသာကြည်လင်အေးချမ်းသော အသံ'
    },
    { 
      id: 'minkhant_mm', 
      name: 'MIN KHANT', 
      baseVoice: 'Puck', 
      desc: 'Energetic & Youthful',
      bio: 'တက်ကြွမြူးကြွသော လူငယ် movie recap စတိုင်'
    },
    { 
      id: 'maythu_mm', 
      name: 'MAY THU', 
      baseVoice: 'Zephyr', 
      desc: 'Soft & Poetic',
      bio: 'နူးညံ့သိမ်မွေ့သော ပုံပြင်ပြော အသံ'
    },
    { 
      id: 'mya_mm', 
      name: 'MYA', 
      baseVoice: 'Kore', 
      desc: 'မြန်မာပီသ အသံ (Female)',
      bio: 'မြန်မာစကားပီသကျကျန်ကျန် ပြောတတ်သော အသံ' 
    },
    { 
      id: 'nyeins_mm', 
      name: 'NYEIN', 
      baseVoice: 'Alnilam', 
      desc: 'မြန်မာပီသ အသံ (Male)',
      bio: 'မြန်မာအချကျအလက်နဲ့ ပီပြင်ခိုင်မာလေးနက်တဲ့ ယောက်္ကျားအသံ' 
    },
    { 
      id: 'charon_main', 
      name: 'CHARON', 
      baseVoice: 'Charon', 
      desc: 'Deep & Cinematic', 
      bio: 'Cinematic deep male voice for global content' 
    },
  ];

  const NARRATION_TONES = [
    { id: 'recap_trend', name: 'Trending Movie Recap', desc: 'ခေတ်စားနေတဲ့ စတိုင်' },
    { id: 'hype_viral', name: 'Viral Hype', desc: 'အရှိန်ပြင်း ဆွဲဆောင်မှု' },
    { id: 'comedy_laugh', name: 'Comedy Recap', desc: 'ဟာသနှော စောင်းမြောင်း' },
    { id: 'thrilling', name: 'Action Thriller', desc: 'ရင်ဖို စိတ်လှုပ်ရှား' },
    { id: 'mystery', name: 'Mystery Suspense', desc: 'သည်းထိတ် လျှို့ဝှက်' },
    { id: 'professional', name: 'Formal News', desc: 'သတင်းကြေညာ သံ' },
  ];

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

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Handle sample voice upload and auto-analyze
  const handleSampleFileUpload = async (file: File) => {
    if (!file) return;
    if (!file.type.startsWith('audio/') && !file.name.match(/\.(mp3|wav|m4a|ogg|webm)$/i)) {
      setSampleStatus('အသံဖိုင် (MP3/WAV/M4A/OGG) သာ တင်သွင်းပါ');
      return;
    }
    if (sampleAudioUrl) URL.revokeObjectURL(sampleAudioUrl);
    
    const url = URL.createObjectURL(file);
    setSampleFile(file);
    setSampleAudioUrl(url);
    setIsAnalyzing(true);
    setSampleStatus('အသံလှိုင်းနှင့် Narration Style ကို စတင်စစ်ဆေးနေပါသည်...');
    setError(null);

    try {
      const profile = await analyzeVoice(url, file.name.replace(/\.[^/.]+$/, ''));
      setAnalyzedProfile(profile);

      // Auto-set voice pitch and speed offset based on sample acoustic traits
      if (profile.traits.energy === 'energetic') {
        setTone('recap_trend');
      } else if (profile.traits.pace === 'fast') {
        setTone('hype_viral');
      }
      
      setSampleStatus(`အသံစတိုင် ခွဲခြမ်းစိတ်ဖြာပြီးပါပြီ (${Math.round(profile.traits.pitchHz)}Hz • ${profile.traits.tone} tone • ${profile.traits.energy} energy)`);
    } catch (err: unknown) {
      console.warn('Sample voice analysis error:', err);
      setSampleStatus('Sample voice မှတ်တမ်းတင်ပြီးပါပြီ (စကားပြောဟန်ပန်ကို အလိုအလျောက် သုံးစွဲပါမည်)');
      setAnalyzedProfile({
        id: crypto.randomUUID(),
        name: file.name,
        createdAt: Date.now(),
        durationSeconds: 10,
        traits: { gender: 'unknown', pitchHz: 160, tone: 'warm', energy: 'energetic', pace: 'fast' },
        prompt: "Speak in the exact energetic movie recap narration style matched from the reference sample audio."
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleMicRecord = async () => {
    if (isRecording) return;
    setIsRecording(true);
    setSampleStatus('မိုက်ခရိုဖုန်းဖြင့် အသံသွင်းနေပါသည် (၅ မှ ၁၅ စက္ကန့် စကားပြောပါ)...');
    try {
      const { stop } = await startRecording();
      (window as unknown as { __sampleRecordingStop?: () => Promise<string | Blob> }).__sampleRecordingStop = stop;
    } catch {
      setIsRecording(false);
      setSampleStatus('မိုက်ခရိုဖုန်း အသုံးပြုခွင့် မရရှိပါ');
    }
  };

  const handleStopMicRecord = async () => {
    const stopFn = (window as unknown as { __sampleRecordingStop?: () => Promise<string | Blob> }).__sampleRecordingStop;
    if (!stopFn) { setIsRecording(false); return; }
    try {
      const data = await stopFn();
      let blob: Blob;
      if (typeof data === 'string') {
        const res = await fetch(data);
        blob = await res.blob();
      } else {
        blob = data as Blob;
      }
      const file = new File([blob], 'my_voice_sample.webm', { type: 'audio/webm' });
      setIsRecording(false);
      await handleSampleFileUpload(file);
    } catch {
      setIsRecording(false);
      setSampleStatus('အသံသွင်းယူမှု မအောင်မြင်ပါ');
    }
  };

  const handleClearSample = () => {
    if (sampleAudioUrl) URL.revokeObjectURL(sampleAudioUrl);
    setSampleFile(null);
    setSampleAudioUrl(null);
    setAnalyzedProfile(null);
    setSampleStatus(null);
  };

  const handlePaste = async () => {
    try {
      const clipboardText = await navigator.clipboard.readText();
      setText(clipboardText.slice(0, MAX_CHARS));
      setIsChecked(false);
    } catch {
      setError("Clipboard access denied.");
    }
  };

  const handleClear = () => {
    setText('');
    setAudioUrl(null);
    setIsChecked(false);
    stopAudio();
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
      } catch { setError("Playback error."); setIsPlaying(false); }
    }
  };

  const handlePreviewVoice = async (e: React.MouseEvent, charId: string) => {
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
        ? `မင်္ဂလာပါ။ ကျွန်တော်က ${char.name.split(' ')[0]} ဖြစ်ပြီး Movie Recap အသံသွင်းပေးမယ့် အသံပိုင်ရှင် ဖြစ်ပါတယ်။` 
        : `Hello! This is ${char.name}. Ready to record your video narration.`;
      
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
    } catch (err: unknown) { 
      if (isMounted.current) {
        setError((err as { message?: string })?.message || "Preview failed."); 
        setIsPreviewing(null); 
      }
    }
  };

  const handleGenerate = async () => {
    if (!text.trim() || !isChecked) return;
    setError(null);
    stopAudio();
    if (!onSpendCredits(CREDIT_COSTS[ContentType.VOICEOVER])) { 
      setError("လုံလောက်သော Credit မရှိပါ။"); 
      return; 
    }

    setIsProcessing(true);
    setProcessingStage('Movie Recap ဇာတ်ညွှန်းအသံ စတင်ဖန်တီးနေပါသည်...');
    const char = characters.find(c => c.id === characterId);
    
    const voiceMap: Record<string, string> = {};
    characters.forEach(c => { voiceMap[c.name] = c.baseVoice; });

    // Auto-inject analyzed sample voice style prompt
    const styleInstruction = analyzedProfile
      ? `${analyzedProfile.prompt} Match the natural human timbre, fast movie recap rhythm, and vocal expressions of the uploaded sample.`
      : '';

    try {
      let blobUrl = '';
      let usedEngine = 'Gemini 3.1 Flash Speech';

      // Smart Engine Routing: Use VoxCPM (Colab GPU) when sample voice is provided, Gemini Speech for built-in voices
      const voxcpmUrl = (import.meta.env.VITE_VOXCPM_URL || '').trim();
      if (sampleFile) {
        if (!voxcpmUrl) {
          throw new Error('VoxCPM GPU URL ကို .env တွင် ထည့်သွင်းထားခြင်း မရှိပါ။ Colab မှ URL ကို VITE_VOXCPM_URL တွင် ထည့်ပေးပါ။');
        }
        setProcessingStage('VoxCPM2 Free GPU ဖြင့် အသံနှင့် စတိုင် ပုံတူကူးယူနေပါသည် (48kHz)...');
        const registered = await createVoxCPMVoiceClone(
          sampleFile.name,
          sampleFile,
          `Speak in an energetic movie recap narration style. ${NARRATION_TONES.find(t => t.id === tone)?.name || ''}`
        );
        const requestedSpeed = Math.max(0.5, Math.min(2.0, 1.0 + (voiceSpeed / 100)));
        const audioBlob = await synthesizeVoxCPMSpeech(
          registered.voiceId,
          text,
          `Energetic movie recap narration. ${NARRATION_TONES.find(t => t.id === tone)?.name || ''}`,
          requestedSpeed
        );
        blobUrl = URL.createObjectURL(audioBlob);
        usedEngine = 'VoxCPM2 Neural 48kHz';
      } else {
        setProcessingStage('Gemini 3.1 AI Speech ဖြင့် အသံကြည်လင်စွာ ထုတ်ယူနေပါသည်...');
        blobUrl = await generateSpeech(
          text, 
          char?.baseVoice || 'Kore', 
          voiceSpeed, 
          voicePitch, 
          voiceMap, 
          tone, 
          styleInstruction
        );
      }

      if (isMounted.current) {
        setAudioUrl(blobUrl);
      }
      
      const currentUser = auth.currentUser;
      if (currentUser) {
        void logGeneration(
          currentUser.uid,
          currentUser.email || '',
          'voiceover',
          { text, character: char?.name || characterId, tone, voiceSpeed, voicePitch, engine: usedEngine, withSampleVoice: !!analyzedProfile },
          { status: 'success', info: `Voiceover audio generated successfully via ${usedEngine}` }
        ).catch(() => undefined);
      }
    } catch (err: unknown) { 
      if (isMounted.current) {
        setError((err as { message?: string })?.message || "Voiceover synthesis failed."); 
      }
    } finally { 
      if (isMounted.current) {
        setIsProcessing(false);
        setProcessingStage(null);
      }
    }
  };

  const selectedChar = characters.find(c => c.id === characterId);

  return (
    <div className="module-page max-w-2xl mx-auto pb-12">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/25">
            <Volume2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              Voiceover Studio
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
                AI Powered
              </span>
              {voxcpmOnline ? (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  VoxCPM2 GPU Online
                </span>
              ) : (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20">
                  Gemini 3.1 Speech
                </span>
              )}
            </h1>
            <p className="text-xs text-slate-500 dark:text-zinc-400">မြန်မာ Movie Recap နှင့် Video များအတွက် သဘာဝကျသော စကားပြောအသံဖန်တီးပါ</p>
          </div>
        </div>
      </div>

      <div className="glass p-5 rounded-2xl border border-slate-200 dark:border-white/10 space-y-5 shadow-xl">
        
        {/* Step 1: Script Input */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300 flex items-center gap-1.5">
              <span>၁။ စာသားဇာတ်ညွှန်း ထည့်သွင်းပါ</span>
            </label>
            <div className="flex gap-2">
              <button onClick={handlePaste} className="px-2.5 py-1 rounded-md border border-slate-200 dark:border-white/10 text-[11px] font-medium text-slate-600 dark:text-zinc-400 hover:border-indigo-500 hover:text-indigo-500 transition-colors">Paste</button>
              <button onClick={handleClear} className="px-2.5 py-1 rounded-md border border-slate-200 dark:border-white/10 text-[11px] font-medium text-slate-600 dark:text-zinc-400 hover:border-rose-400 hover:text-rose-500 transition-colors">Clear</button>
            </div>
          </div>
          <textarea
            value={text}
            onChange={(e) => { setText(e.target.value.slice(0, MAX_CHARS)); setIsChecked(false); }}
            placeholder="ဖတ်ကြားလိုသော Movie Recap သို့မဟုတ် Video Script စာသားများကို ဤနေရာတွင် ရိုက်ထည့်ပါ..."
            className="w-full h-36 bg-slate-50 dark:bg-black/30 border border-slate-200 dark:border-white/10 rounded-xl p-3.5 text-sm text-slate-900 dark:text-zinc-100 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all resize-none leading-relaxed"
          />
          <div className="flex justify-between items-center text-[11px] text-slate-400 font-mono">
            <span>မြန်မာ / English စာလုံးပေါင်းစပ် ထောက်ပံ့သည်</span>
            <span>{text.length.toLocaleString()} / {MAX_CHARS.toLocaleString()}</span>
          </div>
        </div>

        {/* Step 2: Voice Model Selection */}
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300 block">
            ၂။ အသံပိုင်ရှင် (Voice Model) ရွေးချယ်ပါ
          </label>
          <div className="relative z-30" ref={dropdownRef}>
            <button 
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="w-full flex items-center justify-between p-3 bg-slate-50 dark:bg-black/30 border border-slate-200 dark:border-white/10 rounded-xl hover:border-indigo-500 transition-all text-left"
            >
              <div className="flex flex-col">
                <span className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  {selectedChar?.name}
                  <span className="text-[10px] font-normal px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-500">
                    {selectedChar?.desc}
                  </span>
                </span>
                <span className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">{selectedChar?.bio}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => selectedChar && handlePreviewVoice(e, selectedChar.id)}
                  className="p-2 rounded-lg bg-indigo-500/10 text-indigo-500 hover:bg-indigo-500 hover:text-white transition-all text-xs font-bold flex items-center gap-1"
                >
                  {isPreviewing === selectedChar?.id ? <Square className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                  <span>နမူနာနားဆင်</span>
                </button>
              </div>
            </button>

            {isDropdownOpen && (
              <div className="absolute left-0 right-0 mt-1.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-white/15 rounded-xl shadow-2xl overflow-hidden z-50 p-2 space-y-1.5 max-h-64 overflow-y-auto">
                {characters.map((char) => (
                  <div
                    key={char.id}
                    onClick={() => { setCharacterId(char.id); setIsDropdownOpen(false); }}
                    className={`flex items-center justify-between p-2.5 rounded-lg transition-all cursor-pointer ${
                      characterId === char.id ? 'bg-indigo-500/10 border border-indigo-500/30' : 'hover:bg-slate-100 dark:hover:bg-white/5'
                    }`}
                  >
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-slate-900 dark:text-white">{char.name} • {char.desc}</span>
                      <span className="text-[11px] text-slate-500 dark:text-zinc-400">{char.bio}</span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => handlePreviewVoice(e, char.id)}
                      className="p-1.5 rounded-md border border-slate-200 dark:border-white/10 text-slate-600 dark:text-zinc-400 hover:bg-indigo-500 hover:text-white transition-all"
                    >
                      {isPreviewing === char.id ? <Square className="w-3 h-3 fill-current text-rose-500" /> : <Play className="w-3 h-3 fill-current" />}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Step 3: Sample Voice & Narration Style (Direct Upload & Auto-Analyze) */}
        <div className="space-y-2.5 p-3.5 rounded-xl border border-dashed border-indigo-500/30 bg-indigo-500/5 dark:bg-indigo-500/[0.02]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-indigo-500" />
              <label className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-zinc-100">
                ၃။ Sample Voice / Narration Style ထည့်သွင်းရန် (Optional)
              </label>
            </div>
            {analyzedProfile && (
              <button onClick={handleClearSample} className="text-[11px] font-medium text-rose-500 hover:underline flex items-center gap-1">
                <Trash2 className="w-3 h-3" />
                <span>နမူနာအသံ ဖြုတ်ရန်</span>
              </button>
            )}
          </div>

          <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-relaxed">
            မိမိအသံ သို့မဟုတ် နှစ်သက်ရာ Movie Recap ပြောထားသော ၅-၁၅ စက္ကန့် အသံဖိုင်ကို ထည့်သွင်းပါက AI မှ အသံအနေအထားနှင့် စကားပြောစတိုင်ကို အလိုအလျောက် သုံးစွဲပေးပါမည်။
          </p>

          {!analyzedProfile ? (
            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <label className="flex items-center justify-center gap-2 p-3 rounded-xl border border-dashed border-slate-300 dark:border-white/20 hover:border-indigo-500 bg-white/50 dark:bg-black/20 cursor-pointer transition-all">
                <Upload className="w-4 h-4 text-indigo-500" />
                <span className="text-xs font-bold text-slate-700 dark:text-zinc-300">အသံဖိုင် တင်သွင်းရန်</span>
                <input 
                  type="file" 
                  accept="audio/*,.mp3,.wav,.m4a,.ogg,.webm" 
                  onChange={(e) => e.target.files?.[0] && handleSampleFileUpload(e.target.files[0])} 
                  className="hidden" 
                />
              </label>

              <button
                type="button"
                onClick={isRecording ? handleStopMicRecord : handleMicRecord}
                className={`flex items-center justify-center gap-2 p-3 rounded-xl border transition-all ${
                  isRecording 
                    ? 'border-rose-500 bg-rose-500/10 text-rose-500 animate-pulse' 
                    : 'border-slate-300 dark:border-white/20 bg-white/50 dark:bg-black/20 hover:border-indigo-500 text-slate-700 dark:text-zinc-300'
                }`}
              >
                <Mic className={`w-4 h-4 ${isRecording ? 'text-rose-500' : 'text-indigo-500'}`} />
                <span className="text-xs font-bold">{isRecording ? 'အသံသွင်း ရပ်ရန်' : 'မိုက်ဖြင့် အသံသွင်းရန်'}</span>
              </button>
            </div>
          ) : (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    Sample Voice & Narration Style ချိတ်ဆက်ပြီးပါပြီ
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-zinc-400">
                    {sampleFile?.name || 'My Voice Sample'} ({Math.round(analyzedProfile.traits.pitchHz)}Hz • {analyzedProfile.traits.tone} tone • {analyzedProfile.traits.energy})
                  </span>
                </div>
              </div>
              {sampleAudioUrl && (
                <audio controls src={sampleAudioUrl} className="h-7 w-28 opacity-80" />
              )}
            </div>
          )}

          {sampleStatus && (
            <p className="text-[11px] text-indigo-500 dark:text-indigo-400 text-center font-medium">
              {sampleStatus}
            </p>
          )}
        </div>

        {/* Step 4: Narration Style & Tone Selection */}
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300 block">
            ၄။ Narration Style (အပြောစတိုင်) ရွေးချယ်ပါ
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {NARRATION_TONES.map((t) => (
              <button
                key={t.id}
                onClick={() => setTone(t.id)}
                type="button"
                className={`p-2.5 rounded-xl border text-left transition-all flex flex-col justify-center ${
                  tone === t.id 
                    ? 'bg-indigo-500/10 border-indigo-500 text-indigo-500 shadow-sm' 
                    : 'border-slate-200 dark:border-white/10 text-slate-600 dark:text-zinc-400 hover:border-indigo-500/50'
                }`}
              >
                <span className="text-xs font-bold">{t.name}</span>
                <span className="text-[10px] opacity-75">{t.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Step 5: Speed & Pitch Adjusters */}
        <div className="grid grid-cols-2 gap-4 pt-1">
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-bold text-slate-700 dark:text-zinc-300">
              <span>စကားပြောနှုန်း (Speed)</span>
              <span className="text-indigo-500 font-mono">{voiceSpeed > 0 ? `+${voiceSpeed}%` : `${voiceSpeed}%`}</span>
            </div>
            <input 
              type="range" min="-50" max="50" step="5" value={voiceSpeed} 
              onChange={(e) => setVoiceSpeed(parseInt(e.target.value))}
              className="w-full h-1.5 bg-slate-200 dark:bg-white/10 rounded-full appearance-none cursor-pointer accent-indigo-500"
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-bold text-slate-700 dark:text-zinc-300">
              <span>အသံအနိမ့်အမြင့် (Pitch)</span>
              <span className="text-indigo-500 font-mono">{voicePitch > 0 ? `+${voicePitch}%` : `${voicePitch}%`}</span>
            </div>
            <input 
              type="range" min="-50" max="50" step="5" value={voicePitch} 
              onChange={(e) => setVoicePitch(parseInt(e.target.value))}
              className="w-full h-1.5 bg-slate-200 dark:bg-white/10 rounded-full appearance-none cursor-pointer accent-indigo-500"
            />
          </div>
        </div>

        {/* Processing State */}
        {isProcessing && (
          <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-indigo-500">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>{processingStage || 'အသံဖိုင် ဖန်တီးနေပါသည်...'}</span>
            </div>
            <div className="h-1 bg-indigo-500/20 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-500 animate-pulse w-full" />
            </div>
          </div>
        )}

        {/* Generate Action Button */}
        <div className="pt-2">
          <button
            onClick={isChecked ? handleGenerate : () => {
              if (!text.trim()) { setError('ကျေးဇူးပြု၍ စာသားအရင် ရိုက်ထည့်ပါ'); return; }
              setIsChecked(true);
              setError(null);
            }}
            disabled={isChecked && isProcessing}
            className={`w-full py-3.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all shadow-lg flex items-center justify-center gap-2 ${
              !isChecked 
                ? 'bg-slate-900 dark:bg-white text-white dark:text-black hover:opacity-90'
                : isProcessing 
                  ? 'bg-slate-300 dark:bg-zinc-800 text-slate-500 cursor-not-allowed' 
                  : 'bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white shadow-indigo-500/25 active:scale-[0.99]'
            }`}
          >
            {isProcessing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>အသံဖန်တီးနေပါသည်...</span>
              </>
            ) : isChecked ? (
              <>
                <Volume2 className="w-4 h-4" />
                <span>Generate Voiceover ({CREDIT_COSTS[ContentType.VOICEOVER]} Credits)</span>
              </>
            ) : (
              <span>စာသားအတည်ပြုရန် (Verify Script)</span>
            )}
          </button>
        </div>
      </div>

      {/* Output Audio Result Card */}
      {audioUrl && !isProcessing && (
        <div className="mt-5 glass p-4 rounded-2xl border border-emerald-500/30 flex items-center justify-between gap-4 shadow-xl">
          <div className="flex items-center gap-3">
            <button 
              onClick={togglePlayback} 
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                isPlaying 
                  ? 'bg-rose-500 text-white animate-pulse' 
                  : 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 hover:scale-105'
              }`}
            >
              {isPlaying ? <Square className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
            </button>
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">အသံဖိုင် အောင်မြင်စွာ ရရှိပါပြီ</h4>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                {selectedChar?.name} • {NARRATION_TONES.find(t => t.id === tone)?.name}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a 
              href={audioUrl} 
              download="recap_voiceover.wav" 
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-emerald-500/20 transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download</span>
            </a>
            <button 
              onClick={() => setAudioUrl(null)} 
              className="p-2 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition-all"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Error / Quota Limit Display */}
      {error && (
        <div className="mt-4 p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-center">
          <p className="text-rose-500 dark:text-rose-400 text-xs font-bold">{error}</p>
        </div>
      )}
    </div>
  );
};

export default Voiceover;
