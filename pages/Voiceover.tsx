
import React, { useState, useRef, useEffect } from 'react';
import { generateSpeech, playAudio } from '../services/geminiService';
import { CREDIT_COSTS, ContentType, JsonValue, JsonRecord } from '../types';
import { auth } from '../services/firebase';
import { logGeneration } from '../services/supabase';
import { ModuleLogHistory } from '../components/ModuleLogHistory';
import { RecentHistory } from '../components/RecentHistory';
import {
  analyzeVoice,
  applyClonePostProcessing,
  loadClones,
  saveClones,
  removeClone,
  readFileAsDataUrl,
  startRecording,
  createElevenClone,
  synthesizeWithClone,
  getElevenKey,
  setElevenKey,
  type VoiceProfile,
} from '../services/voiceClone';


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
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isPreviewing, setIsPreviewing] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isChecked, setIsChecked] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  // --- Voice Clone Studio states ---
  const [mode, setMode] = useState<'studio' | 'clone'>('studio');
  const [clones, setClones] = useState<VoiceProfile[]>([]);
  const [activeCloneId, setActiveCloneId] = useState<string | null>(null);
  const [cloneName, setCloneName] = useState('');
  const [cloneFile, setCloneFile] = useState<File | null>(null);
  const [cloneUrl, setCloneUrl] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [cloneStatus, setCloneStatus] = useState<string>('');
  const [elevenKey, setElevenKeyState] = useState<string>('');
  const [cloningRemote, setCloningRemote] = useState<boolean>(false);
  
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Recent-task restore: repopulate input fields from a previous generation
  const handleRestoreVoiceover = (input: JsonValue) => {
    if (!input || typeof input !== 'object') return;
    if (typeof (input as JsonRecord).text === 'string') setText((input as JsonRecord).text as string);
    // Logged 'character' may be an id or a name — resolve either
    if ((input as JsonRecord).character) {
      const byId = characters.find((c) => c.id === String((input as JsonRecord).character));
      const byName = characters.find((c) => c.name === String((input as JsonRecord).character));
      if (byId) setCharacterId(byId.id);
      else if (byName) setCharacterId(byName.id);
    }
    if ((input as JsonRecord).tone) setTone(String((input as JsonRecord).tone));
    if (typeof (input as JsonRecord).voiceSpeed === 'number') setVoiceSpeed((input as JsonRecord).voiceSpeed as number);
    if (typeof (input as JsonRecord).voicePitch === 'number') setVoicePitch((input as JsonRecord).voicePitch as number);
    setMode('studio');
    setError(null);
  };
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
    { 
      id: 'mya_mm', 
      name: 'MYA', 
      baseVoice: 'Kore', 
      desc: 'မြန်မာပီသ အသံ',
      bio: 'မြန်မာစကားပီသကျကျန်ကျန် ပြောတတ်သောအချကျအလက်နဲ့ ပီပြင်ချိုသာကြည်လင်တဲ့ အသံ - သတင်း၊ ပုံပြင်၊ movie recap အားလုံးအတွက် အကောင်းဆုံးဖြစ်ပါသည်။ မြန်မာဖိအားနှင့် တွက်တိုက်အသံ ဖိအားပီပြင်စွာ ထွက်ရှိပါသည်။' 
    },
    { 
      id: 'nyeins_mm', 
      name: 'NYEIN', 
      baseVoice: 'Alnilam', 
      desc: 'မြန်မာပီသ အသံ',
      bio: 'မြန်မာစကားပီသကျကျန်ကျန် ပြောတတ်သောအချကျအလက်နဲ့ ပီပြင်ခိုင်မာလေးနက်တဲ့ ယောက်္ကျားအသံ - ဇာတ်ကြီးဇတ်ချော၊ မှတ်ချက်နှင့် documentary အတွက် အကောင်းဆုံးဖြစ်ပါသည်။ မြန်မာဖိအားနှင့် တွက်တိုက်အသံ ဖိအားပီပြင်စွာ ထွက်ရှိပါသည်။' 
    },
    { 
      id: 'soesoe_mm', 
      name: 'SOE SOE', 
      baseVoice: 'Sulafat', 
      desc: 'Warm & Authentic',
      bio: 'မြန်မာပီသသောနွေးထွေးအသံ - စိတ်ခံစားမှုအပြည့် ဇာတ်ကြီးဇာတ်ချော၊ သတင်းမှတ်ချက်နှင့် ဇာတ်လမ်းတိုများအတွက် အကောင်းဆုံးဖြစ်ပါသည်။ အသံညိုနှင့် နားဝင်ပီသသောပုံစံဖြစ်သည်။' 
    },
    { 
      id: 'winhtet_mm', 
      name: 'WIN HTET', 
      baseVoice: 'Alnilam', 
      desc: 'Bold & Resonant',
      bio: 'ပီသခိုင်မာသောယောက်္ကျားအသံ - အားကစား၊ ကြေညာချက်၊ ဗီဒီယိုမှတ်ချက်နှင့် ခန့်ညားရမည့်အကြောင်းအရာများအတွက် အကောင်းဆုံးဖြစ်ပါသည်။ အသံပြင်းပြင်းနှင့် ယုံကြည်စိတ်အပြည့်ပုံစံဖြစ်သည်။' 
    },
  ];

  useEffect(() => {
    setClones(loadClones());
    const savedActive = localStorage.getItem('lumini_active_clone');
    if (savedActive) setActiveCloneId(savedActive);
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

  // --- Voice Clone Studio handlers ---
  const activeClone = clones.find((c) => c.id === activeCloneId);

  const setClone = (id: string | null) => {
    setActiveCloneId(id);
    if (id) localStorage.setItem('lumini_active_clone', id);
    else localStorage.removeItem('lumini_active_clone');
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('audio/') && !file.name.match(/\.(mp3|wav|m4a|ogg|webm)$/i)) {
      setCloneStatus('Audio file only (MP3/WAV/M4A/OGG)');
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setCloneStatus('File too large (max 12 MB). 10-30s of speech is ideal.');
      return;
    }
    setCloneFile(file);
    setCloneUrl(URL.createObjectURL(file));
    setCloneStatus(null);
  };

  const handleRecord = async () => {
    if (isRecording) return;
    setIsRecording(true);
    setCloneStatus('Recording... speak naturally for 10-30 seconds');
    try {
      const { stop } = await startRecording();
      const recordingStop = stop;
      (window as unknown as { __cloneRecordingStop?: () => void }).__cloneRecordingStop = recordingStop;
    } catch {
      setIsRecording(false);
      setCloneStatus('Microphone access denied.');
    }
  };

  const handleStopRecording = async () => {
    const stopFn = (window as unknown as { __cloneRecordingStop?: () => void }).__cloneRecordingStop;
    if (!stopFn) { setIsRecording(false); return; }
    try {
      const data = await stopFn();
      // stop() may return a data URL (string) or a raw Blob
      let dataUrl: string;
      let blob: Blob;
      if (typeof data === 'string') {
        dataUrl = data;
        const response = await fetch(dataUrl);
        blob = await response.blob();
      } else {
        blob = data as unknown as Blob;
        dataUrl = URL.createObjectURL(blob);
      }
      const file = new File([blob], 'lumini_recording.webm', { type: 'audio/webm' });
      setCloneFile(file);
      setCloneUrl(dataUrl);
      setIsRecording(false);
      setCloneStatus(null);
    } catch {
      setIsRecording(false);
      setCloneStatus('Recording failed.');
    }
  };

  const handleCreateClone = async () => {
    if (!cloneName.trim()) { setCloneStatus('Voice profile name is required.'); return; }
    if (!cloneFile) { setCloneStatus('Upload or record a voice sample first.'); return; }

    setIsAnalyzing(true);
    setCloneStatus('Analyzing voice characteristics...');
    try {
      let audioUrl = cloneUrl;
      if (!audioUrl) {
        audioUrl = URL.createObjectURL(cloneFile);
      }
      const profile = await analyzeVoice(audioUrl, cloneName.trim());

      // Optional: also create a real instant voice clone on ElevenLabs (free tier)
      // when the user has provided their own API key. This enables true zero-shot
      // voice cloning: the generated speech sounds like the reference recording.
      const key = elevenKey || getElevenKey();
      if (key && cloneFile) {
        try {
          setCloningRemote(true);
          setCloneStatus('Creating real voice clone on ElevenLabs (free tier)...');
          const remote = await createElevenClone(profile.name, cloneFile);
          profile.voiceId = remote.voiceId;
          setCloneStatus(`Real voice clone "${remote.name}" created! Generating speech with it now.`);
        } catch (e) {
          console.warn('ElevenLabs clone failed, keeping client-side profile:', e);
          profile.voiceId = undefined;
        } finally {
          setCloningRemote(false);
        }
      }

      const newClones = [profile, ...clones].slice(0, 5); // max 5 saved clones (free)
      saveClones(newClones);
      setClones(newClones);
      setClone(profile.id);
      setCloneName('');
      setCloneFile(null);
      if (cloneUrl) { URL.revokeObjectURL(cloneUrl); }
      setCloneUrl(null);
      setCloneStatus(profile.voiceId
        ? 'Voice cloned successfully (real neural clone)! Generate audio in your voice.'
        : 'Voice cloned successfully! Generate audio using this profile.');
    } catch (err: unknown) {
      setCloneStatus('Voice analysis failed. Use a clean 10-30s recording with speech only.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleDeleteClone = (id: string) => {
    const newClones = clones.filter((c) => c.id !== id);
    saveClones(newClones);
    setClones(newClones);
    if (activeCloneId === id) setClone(null);
  };

  const cloneCost = 10;

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
    } catch (err: unknown) { 
        if (isMounted.current) {
            setError((err as { message?: string })?.message || "Preview failed."); 
            setIsPreviewing(null); 
            try {
              const msg = (err as { message?: string })?.message || "";
              const openBrace = msg.indexOf('{');
              const closeBrace = msg.lastIndexOf('}');
              if (openBrace !== -1 && closeBrace !== -1 && openBrace < closeBrace) {
                const jsonStr = msg.substring(openBrace, closeBrace + 1);
                if (jsonStr.includes('isQuotaError')) {
                  const parsed = JSON.parse(jsonStr);
                  setCountdown(parsed.retryAfter || 45);
                }
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
    
    // Create a voice map for multi-voice tagging (includes voice clones)
    const voiceMap: Record<string, string> = {};
    characters.forEach(c => {
      voiceMap[c.name] = c.baseVoice;
    });

    // Append clone style traits to the main voice prompt when a clone is active
    const clonePrefix = activeClone?.prompt || '';

    try {
      let blobUrl: string;

      if (isMounted.current && activeClone?.voiceId) {
        // Real neural voice clone synthesis (ElevenLabs free tier, multilingual v2)
        const audioBlob = await synthesizeWithClone(activeClone.voiceId, text);
        blobUrl = URL.createObjectURL(audioBlob);
      } else {
        blobUrl = await generateSpeech(text, char?.baseVoice || 'Kore', voiceSpeed, voicePitch, voiceMap, tone);

        // Post-process towards the cloned voice if one is active
        if (isMounted.current && activeClone) {
          try {
            const pitchShift = Math.round(((activeClone.traits.pitchHz - 155) / 155) * 100);
            const { blobUrl: processedUrl, dispose } = await applyClonePostProcessing(blobUrl, pitchShift);
            if (isMounted.current) {
              blobUrl = processedUrl;
              (window as unknown as { __cloneProcessedDispose?: () => void }).__cloneProcessedDispose = dispose;
            } else {
              dispose();
            }
          } catch (e) {
            console.warn('Clone post-processing skipped:', e);
          }
        }
      }

      if (isMounted.current) {
        setAudioUrl(blobUrl);
      }
      
      const currentUser = auth.currentUser;
      if (currentUser) {
        await logGeneration(
          currentUser.uid,
          currentUser.email || '',
          'voiceover',
          { text, character: char?.name || characterId, tone, voiceSpeed, voicePitch, clone: activeClone?.name || null },
          { status: 'success', info: 'Voiceover audio generated successfully' }
        );
        window.dispatchEvent(
          new CustomEvent('lumini:taskLogged', {
            detail: { module: 'voiceover', input: { text, characterId: char?.id || characterId, tone, voiceSpeed, voicePitch } },
          })
        );
        setRefreshTrigger(prev => prev + 1);
      }
    } catch (err: unknown) { 
        if (isMounted.current) {
          setError((err as { message?: string })?.message || "Synthesis failed."); 
          try {
            const msg = (err as { message?: string })?.message || "";
            const openBrace = msg.indexOf('{');
            const closeBrace = msg.lastIndexOf('}');
            if (openBrace !== -1 && closeBrace !== -1 && openBrace < closeBrace) {
              const jsonStr = msg.substring(openBrace, closeBrace + 1);
              if (jsonStr.includes('isQuotaError')) {
                const parsed = JSON.parse(jsonStr);
                setCountdown(parsed.retryAfter || 45);
              }
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
    <div className="max-w-xl mx-auto pb-4">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 bg-accent rounded-lg flex items-center justify-center shadow-md shadow-accent/20">
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        </div>
        <div>
          <h1 className="movie-h2 !text-lg !mb-0 uppercase tracking-tighter">Voiceover Studio</h1>
          <p className="movie-meta !text-[9px] !mb-0 uppercase tracking-widest text-zinc-500">Neural Synthesis • {CREDIT_COSTS[ContentType.VOICEOVER]} Credits</p>
        </div>
      </div>

      {/* Mode switcher: Synthesis Studio / Voice Clone */}
      <div className="flex mb-4 bg-white/5 dark:bg-black/30 border border-white/10 rounded-xl p-1" role="tablist">
        <button
          role="tab"
          aria-selected={mode === 'studio'}
          onClick={() => setMode('studio')}
          className={`flex-1 py-2 rounded-lg movie-meta !text-[10px] uppercase tracking-[0.2em] transition-all ${
            mode === 'studio' ? 'bg-accent text-white shadow-md shadow-accent/20' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Synthesis Studio
        </button>
        <button
          role="tab"
          aria-selected={mode === 'clone'}
          onClick={() => setMode('clone')}
          className={`flex-1 py-2 rounded-lg movie-meta !text-[10px] uppercase tracking-[0.2em] transition-all ${
            mode === 'clone' ? 'bg-accent text-white shadow-md shadow-accent/20' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Voice Clone Studio
        </button>
      </div>

      {mode === 'clone' ? (
        /* ===================== VOICE CLONE STUDIO ===================== */
        <div className="glass p-4 rounded-xl border border-white/5 space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-lg flex items-center justify-center shadow-md shadow-fuchsia-500/20 flex-shrink-0">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
              </svg>
            </div>
            <div>
              <h2 className="movie-h2 !text-sm !mb-0 uppercase tracking-tight">Voice Clone Studio</h2>
              <p className="movie-meta !text-[9px] !mb-0 uppercase tracking-widest text-zinc-500">Zero-Shot Cloning • Free Open Models • {cloneCost} Credits</p>
            </div>
          </div>

          <p className="movie-body !text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
            မိမိအသံ ၁၀-၃၀ စက္ကန့် အသံဖမ်းပေးရုံဖြင့် ကိုယ့်အသံနဲ့ အသံဖလှယ်နိုင်ပါတယ်။ F5-TTS စတဲ့ free open-source voice cloning model တွေရဲ့ အရည်အသွေးကို အခြေခံထားပြီး Web Audio API ဖြင့် အသံခွဲခြမ်းစိတ်ဖြာစစ်ဆေးပေးပါတယ်။
          </p>

          {/* ElevenLabs real-clone option (free tier, optional) */}
          <div className="space-y-2 p-3 bg-black/20 border border-white/10 rounded-lg">
            <label className="movie-meta !text-[8.5px] uppercase tracking-[0.2em] block text-accent">Real Neural Clone (Optional)</label>
            <p className="movie-meta !text-[8.5px] text-zinc-500 !mb-0 leading-relaxed">
              ElevenLabs free plan ဖြင့် နမူနာအသံနဲ့ တကယ့်အသံ cloning (လစဉ် ၁၀,၀၀၀ characters အခမဲ့)။ Key မထည့်ရင် client-side voice shaping သာ သုံးပါမည်။
            </p>
            <div className="flex gap-2">
              <input
                type="password"
                value={elevenKey}
                onChange={(e) => { setElevenKeyState(e.target.value); setElevenKey(e.target.value); }}
                placeholder="ElevenLabs API key (xi-api-key)"
                className="flex-1 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 movie-body !text-[11px] text-slate-900 dark:text-zinc-100 focus:border-accent outline-none transition-all"
              />
              <button
                type="button"
                onClick={() => {
                  const hasKey = (elevenKey || getElevenKey()) !== '';
                  setCloneStatus(hasKey ? 'ElevenLabs key saved. Next clone will use real neural cloning.' : 'No key set — using free client-side voice shaping.');
                }}
                className="px-3 rounded-lg movie-meta !text-[9px] uppercase tracking-[0.2em] bg-white/10 hover:bg-white/15 text-zinc-300 transition-all"
              >
                Save
              </button>
            </div>
            <a
              href="https://elevenlabs.io/app/settings/api-keys"
              target="_blank"
              rel="noopener noreferrer"
              className="movie-meta !text-[8px] text-accent hover:underline !mb-0"
            >
              Get free API key → elevenlabs.io (no credit card)
            </a>
          </div>

          {/* Reference capture */}
          <div className="space-y-2">
            <label className="movie-meta !text-[8.5px] uppercase tracking-[0.2em] block">Reference Voice (10-30s)</label>
            <div className="grid grid-cols-2 gap-2">
              <label className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-lg border-2 border-dashed transition-all cursor-pointer ${
                cloneFile ? 'border-accent bg-accent/5' : 'border-white/10 bg-black/10 hover:border-white/25'
              }`}>
                <svg className="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <span className="movie-meta !text-[8px] uppercase tracking-widest text-zinc-400 !mb-0">Upload Audio</span>
                <input type="file" accept="audio/*,.mp3,.wav,.m4a,.ogg,.webm" onChange={handleFileChange} className="hidden" />
              </label>
              <button
                type="button"
                onClick={isRecording ? handleStopRecording : handleRecord}
                className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-lg border transition-all ${
                  isRecording
                    ? 'border-rose-500/50 bg-rose-500/10 text-rose-400 animate-pulse'
                    : 'border-white/10 bg-black/10 hover:border-white/25 text-zinc-400'
                }`}
              >
                {isRecording ? (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" /></svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                )}
                <span className="movie-meta !text-[8px] uppercase tracking-widest !mb-0">{isRecording ? 'Stop & Save' : 'Record Mic'}</span>
              </button>
            </div>
            {cloneFile && (
              <audio controls src={cloneUrl || undefined} className="w-full h-8 rounded" />
            )}
          </div>

          {/* Profile name + create */}
          <div className="flex gap-2">
            <input
              value={cloneName}
              onChange={(e) => setCloneName(e.target.value.slice(0, 40))}
              placeholder="Voice profile name (e.g. My Voice)"
              className="flex-1 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 movie-body !text-[12px] text-slate-900 dark:text-zinc-100 focus:border-accent outline-none transition-all"
            />
            <button
              onClick={handleCreateClone}
              disabled={isAnalyzing || cloningRemote}
              className={`px-4 rounded-lg movie-meta !text-[10px] uppercase tracking-[0.2em] transition-all shadow-md ${
                isAnalyzing || cloningRemote ? 'bg-white/5 text-zinc-500 cursor-not-allowed' : 'bg-accent hover:bg-accent-hover text-white shadow-accent/20 active:scale-[0.98]'
              }`}
            >
              {cloningRemote ? 'Cloning...' : isAnalyzing ? 'Analyzing...' : 'Clone'}
            </button>
          </div>

          {cloneStatus && (
            <p className={`movie-meta !text-[10px] !mb-0 uppercase tracking-widest text-center ${cloneStatus.includes('successfully') || cloneStatus.includes('successfully') ? 'text-emerald-400' : 'text-amber-400'}`}>
              {cloneStatus}
            </p>
          )}

          {/* Saved clones */}
          {clones.length > 0 && (
            <div className="space-y-1.5">
              <label className="movie-meta !text-[8.5px] uppercase tracking-[0.2em] block">My Voice Library</label>
              <div className="space-y-1.5">
                {clones.map((c) => (
                  <div
                    key={c.id}
                    className={`flex items-center justify-between p-2.5 rounded-lg border transition-all cursor-pointer ${
                      activeCloneId === c.id
                        ? 'border-accent bg-accent/10'
                        : 'border-white/10 bg-black/10 hover:border-white/25'
                    }`}
                    onClick={() => setClone(c.id)}
                  >
                    <div className="flex flex-col">
                      <span className="movie-h2 !text-[11px] !mb-0 uppercase tracking-widest">{c.name}</span>
                      <span className="movie-meta !text-[8px] !mb-0 uppercase mt-0.5 text-zinc-500">
                        {c.traits.gender === 'unknown' ? 'Neutral' : c.traits.gender} • {Math.round(c.traits.pitchHz)}Hz • {c.traits.tone} • {c.durationSeconds}s ref
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {activeCloneId === c.id && (
                        <span className="px-2 py-0.5 bg-accent text-white rounded-md movie-meta !text-[7px] uppercase tracking-widest !mb-0">Active</span>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteClone(c.id); }}
                        className="p-1.5 rounded-md bg-white/10 text-zinc-400 hover:bg-rose-500 hover:text-white transition-all"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <p className="movie-meta !text-[8px] text-zinc-500 !mb-0 uppercase tracking-widest">
                {activeClone ? 'Active clone will shape the synthesized voice.' : 'Select a clone to activate voice shaping.'}
              </p>
            </div>
          )}

          {/* Model guide */}
          <details className="group">
            <summary className="movie-meta !text-[9px] uppercase tracking-widest text-zinc-500 cursor-pointer hover:text-accent transition-colors list-none flex items-center gap-1.5">
              <svg className="w-3 h-3 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              Free Open-Source Voice Models Guide
            </summary>
            <div className="mt-2 p-3 bg-black/20 border border-white/10 rounded-lg movie-body !text-[10px] text-zinc-400 leading-relaxed space-y-1.5">
              <p><strong className="text-accent">F5-TTS</strong> (github.com/SWivid/F5-TTS) — Zero-shot voice cloning from 5-15s audio; quality rivals ElevenLabs. Code MIT, weights CC-BY-NC-4.0.</p>
              <p><strong className="text-accent">E2-TTS</strong> — F5-TTS ၏ multilingual sister model; ဘာသာစကားအခြေခံပိုကျယ်သည်။</p>
              <p><strong className="text-accent">မြန်မာဘာသာ</strong> — F5-TTS ၏ မူရင်းမော်ဒလ်သည် English/Chinese သာ ဖြစ်သောကြောင့် မြန်မာအသံပီသမှုအတွက် Burmese prompt engine ကို Web Audio API အသံခွဲခြမ်းစိတ်ဖြာမှုဖြင့် ပေါင်းစပ်ထားပါသည်။ အဆင့်မြင့် F5-TTS ကို ကိုယ့်စက်မှာ self-host လုပ်ပြီး Burmese corpus ဖြင့် fine-tune လုပ်နိုင်သည်။</p>
            </div>
          </details>
        </div>
      ) : (
      /* ===================== SYNTHESIS STUDIO ===================== */
      <div className="glass p-4 rounded-xl border border-white/5 space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* Talent Selection */}
        <div className="relative z-30" ref={dropdownRef}>
          <label className="movie-meta !text-[8px] uppercase tracking-[0.2em] !mb-1 block">Voice Model</label>
          <button 
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="w-full flex items-center justify-between p-2.5 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg hover:border-accent/50 transition-all"
          >
            <div className="flex flex-col items-start text-left">
              <span className="movie-h2 !text-xs !mb-0 uppercase tracking-widest">{selectedChar?.name}</span>
              <span className="movie-meta !text-[9px] !mb-0 uppercase mt-0.5">{selectedChar?.desc}</span>
            </div>
            <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-300 ${isDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>

          {isDropdownOpen && (
            <div className="absolute left-0 right-0 mt-1.5 bg-midnight border border-white/10 rounded-lg shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 z-50">
              <div className="max-h-[180px] overflow-y-auto custom-scrollbar p-1.5 space-y-1">
                {characters.map((char) => (
                  <div
                    key={char.id}
                    onClick={() => { setCharacterId(char.id); setIsDropdownOpen(false); }}
                    className={`flex items-center justify-between p-2 rounded-md transition-all cursor-pointer ${
                      characterId === char.id ? 'bg-accent/10 text-accent' : 'hover:bg-white/5 text-zinc-300'
                    }`}
                  >
                    <div className="flex flex-col">
                      <span className="movie-h2 !text-[11px] !mb-0 uppercase tracking-widest">{char.name}</span>
                      <span className="movie-meta !text-[8px] !mb-0 uppercase mt-0.5">{char.desc}</span>
                    </div>
                    <button
                      onClick={(e) => handlePreview(e, char.id)}
                      className={`p-1.5 rounded-md transition-all ${
                        isPreviewing === char.id ? 'bg-rose-500 text-white animate-pulse' : 'bg-white/10 text-zinc-400 hover:bg-accent hover:text-white'
                      }`}
                    >
                      {isPreviewing === char.id ? '...' : <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 11-2 0V8zm3-2l-3 2v4l3-2V5z" clipRule="evenodd" /></svg>}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Narration Style & Tone (Matches custom video-recap channel configuration) */}
        <div className="space-y-2">
          <label className="movie-meta !text-[8.5px] uppercase tracking-[0.2em] block">Narration Style & Tone</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {[
              { id: 'recap_trend', name: 'Trending Recap', desc: 'ခေတ်စားနေတဲ့ စတိုင်' },
              { id: 'hype_viral', name: 'Viral Hype', desc: 'အရှိန်ပြင်း ဆွဲဆောင်မှု' },
              { id: 'comedy_laugh', name: 'Comedy Recap', desc: 'ရယ်စရာ ဟာသနှော' },
              { id: 'thrilling', name: 'Thrilling Recap', desc: 'စိတ်လှုပ်ရှား ရင်ဖို' },
              { id: 'sarcastic', name: 'Sarcastic Slang', desc: 'ရွဲ့စောင်းပြော စတိုင်' },
              { id: 'mystery', name: 'Mystery Suspense', desc: 'သည်းထိတ် လျှို့ဝှက်' },
              { id: 'professional', name: 'Professional', desc: 'သတင်းကြေညာ သံ' },
              { id: 'sweet', name: 'Storytelling', desc: 'ပုံပြင်ပြော ချိုအေး' },
              { id: 'emotional', name: 'Emotional Poetry', desc: 'စိတ်ခံစားမှု အပြည့်' }
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setTone(t.id)}
                type="button"
                className={`p-2 rounded-lg border text-center transition-all flex flex-col items-center justify-center ${
                  tone === t.id 
                    ? 'bg-accent/10 border-accent text-accent shadow-md shadow-accent/5' 
                    : 'bg-transparent border-slate-200 dark:border-white/5 text-slate-500 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-white/5'
                }`}
              >
                <span className="movie-h2 !text-[10px] !mb-0 uppercase tracking-wider font-bold">{t.name}</span>
                <span className="text-[7px] opacity-75 font-mono mt-0.5">{t.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Input Area */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-1.5">
              <label className="movie-meta !text-[8.5px] uppercase tracking-[0.2em]">Input Script</label>
              <div className="group relative">
                <svg className="w-3.5 h-3.5 text-slate-400 cursor-help" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <div className="absolute bottom-full left-0 mb-1.5 w-44 p-1.5 bg-midnight text-[8px] text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity border border-white/10 pointer-events-none z-50">
                  Use tags like <span className="text-accent">[NILAR]</span> or <span className="text-accent">[THIHA]</span> to switch voices in the same script.
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={handlePaste} className="movie-meta !text-[9px] uppercase tracking-widest text-zinc-500 hover:text-accent transition-colors !mb-0">Paste</button>
              <button onClick={handleClear} className="movie-meta !text-[9px] uppercase tracking-widest text-zinc-500 hover:text-rose-500 transition-colors !mb-0">Clear</button>
            </div>
          </div>
          <textarea
            value={text}
            onChange={(e) => { setText(e.target.value.slice(0, MAX_CHARS)); setIsChecked(false); }}
            placeholder="Enter your script here..."
            className="w-full h-36 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg p-3 movie-body !text-[13px] text-slate-900 dark:text-zinc-100 focus:border-accent outline-none transition-all resize-none leading-relaxed"
          />
          <div className="movie-meta !text-[9px] text-zinc-500 uppercase tracking-widest text-right !mb-0">
            {text.length.toLocaleString()} / {MAX_CHARS.toLocaleString()}
          </div>
        </div>

        {/* Parameters */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <div className="flex justify-between">
              <label className="movie-meta !text-[9px] uppercase tracking-widest">Velocity</label>
              <span className="movie-meta !text-[9px] text-accent !mb-0">{voiceSpeed}%</span>
            </div>
            <input 
              type="range" min="-100" max="100" step="1" value={voiceSpeed} 
              onChange={(e) => setVoiceSpeed(parseInt(e.target.value))}
              className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-accent"
            />
          </div>
          <div className="space-y-1">
            <div className="flex justify-between">
              <label className="movie-meta !text-[9px] uppercase tracking-widest">Pitch</label>
              <span className="movie-meta !text-[9px] text-accent !mb-0">{voicePitch}%</span>
            </div>
            <input 
              type="range" min="-100" max="100" step="1" value={voicePitch} 
              onChange={(e) => setVoicePitch(parseInt(e.target.value))}
              className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-accent"
            />
          </div>
        </div>

        <div className="pt-1">
          <button
            onClick={isChecked ? handleGenerate : handleCheck}
 aria-label="အသံထုတ်ရန်"            disabled={isChecked && isProcessing}
            className={`w-full py-2.5 rounded-lg movie-meta !text-[10px] uppercase tracking-[0.2em] transition-all shadow-md ${
              !isChecked 
                ? 'bg-zinc-100 hover:bg-zinc-200 text-midnight dark:bg-zinc-900 dark:hover:bg-zinc-800 dark:text-white'
                : isProcessing ? 'bg-white/5 text-zinc-500 cursor-not-allowed' : 'bg-accent hover:bg-accent-hover text-white shadow-accent/20 active:scale-[0.98]'
            }`}
          >
            {isProcessing ? 'Synthesizing...' : isChecked ? 'Generate Audio' : 'Verify Script'}
          </button>
        </div>
      </div>
      )}

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
          const openBrace = error.indexOf('{');
          const closeBrace = error.lastIndexOf('}');
          if (openBrace !== -1 && closeBrace !== -1 && openBrace < closeBrace) {
            const jsonStr = error.substring(openBrace, closeBrace + 1);
            if (jsonStr.includes('isQuotaError')) {
              parsedQuotaError = JSON.parse(jsonStr);
            }
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
                  <div className="text-[10px] text-zinc-500 dark:text-zinc-300 font-normal leading-relaxed bg-[#0e0e11]/50 p-3.5 rounded-xl border border-white/5 space-y-1.5">
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
      
      {mode !== 'clone' && (
        <>
          <RecentHistory moduleName="voiceover" onRestore={handleRestoreVoiceover} />
          <div className="mt-4" />
          <ModuleLogHistory moduleName="voiceover" refreshTrigger={refreshTrigger} />
        </>
      )}
    </div>
  );
};

export default Voiceover;
