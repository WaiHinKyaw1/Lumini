import React, { useState, useRef, useEffect } from 'react';
import toast from 'react-hot-toast';
import { generateSpeech, playAudio, convertAudioBlobToWav } from '../services/geminiService';
import { CREDIT_COSTS, ContentType } from '../types';
import { auth } from '../services/firebase';
import { logGeneration } from '../services/supabase';
import { analyzeVoice, startRecording, type VoiceProfile } from '../services/voiceClone';
import { 
  getVoxCPMStatus, 
  createVoxCPMVoiceClone, 
  synthesizeVoxCPMSpeech,
  getActiveVoxCPMUrl,
  setCustomVoxCPMUrl
} from '../services/voiceCloneApi';
import { 
  Sparkles, 
  Mic, 
  Upload, 
  Play, 
  Square, 
  Download, 
  Trash2, 
  CheckCircle2, 
  Volume2, 
  RefreshCw,
  Server,
  ExternalLink,
  X,
  Settings2,
  HelpCircle,
  AlertCircle
} from 'lucide-react';

interface VoiceoverProps {
  onSpendCredits: (amount: number) => boolean;
}

const Voiceover: React.FC<VoiceoverProps> = ({ onSpendCredits }) => {
  const [text, setText] = useState('');
  const [characterId, setCharacterId] = useState('thiha_mm');
  const [tone, setTone] = useState('recap_trend');
  const [selectedEngine, setSelectedEngine] = useState<'auto' | 'voxcpm' | 'gemini'>('auto');
  const [failedVoxcpmError, setFailedVoxcpmError] = useState<string | null>(null);
  
  // Advanced Controls: -100% to 100%
  const [voiceSpeed, setVoiceSpeed] = useState(0); 
  const [voicePitch, setVoicePitch] = useState(0); 

  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStage, setProcessingStage] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [lastUsedEngine, setLastUsedEngine] = useState<string>('Gemini 3.1 Flash Speech');
  const [error, setError] = useState<string | null>(null);
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
  const [isVoxcpmModalOpen, setIsVoxcpmModalOpen] = useState<boolean>(false);
  const [inputVoxcpmUrl, setInputVoxcpmUrl] = useState<string>('');
  const [isCheckingVoxcpm, setIsCheckingVoxcpm] = useState<boolean>(false);
  const [voxcpmCheckMsg, setVoxcpmCheckMsg] = useState<{ text: string; ok: boolean } | null>(null);

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

  const handleSaveAndTestVoxCPM = async (urlToTest?: string) => {
    const targetUrl = (urlToTest !== undefined ? urlToTest : inputVoxcpmUrl).trim();
    setIsCheckingVoxcpm(true);
    setVoxcpmCheckMsg(null);
    setCustomVoxCPMUrl(targetUrl);
    try {
      const status = await getVoxCPMStatus();
      if (status?.online) {
        setVoxcpmOnline(true);
        setVoxcpmCheckMsg({ text: `ချိတ်ဆက်မှု အောင်မြင်ပါသည်! (${status.engine} • ${status.device || 'GPU'})`, ok: true });
      } else {
        setVoxcpmOnline(false);
        setVoxcpmCheckMsg({ text: 'မချိတ်ဆက်နိုင်သေးပါ။ URL မှန်ကန်မှုနှင့် Colab Notebook Run နေခြင်းရှိမရှိ စစ်ဆေးပေးပါ။', ok: false });
      }
    } catch {
      setVoxcpmOnline(false);
      setVoxcpmCheckMsg({ text: 'မချိတ်ဆက်နိုင်သေးပါ။ URL မှန်ကန်မှုနှင့် Colab Notebook Run နေခြင်းရှိမရှိ စစ်ဆေးပေးပါ။', ok: false });
    } finally {
      setIsCheckingVoxcpm(false);
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
      let wavBlob = blob;
      try {
        wavBlob = await convertAudioBlobToWav(blob);
      } catch (wavErr) {
        console.warn('Could not convert mic recording to WAV:', wavErr);
      }
      const file = new File([wavBlob], 'my_voice_sample.wav', { type: 'audio/wav' });
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
    } catch {
      setError("Clipboard access denied.");
    }
  };

  const handleClear = () => {
    setText('');
    setAudioUrl(null);
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
    if (!text.trim()) {
      setError("ကျေးဇူးပြု၍ စာသားအရင် ရိုက်ထည့်ပါ");
      return;
    }
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

      // Engine Resolution:
      const voxcpmUrl = getActiveVoxCPMUrl();

      if (selectedEngine === 'voxcpm') {
        // User explicitly chose VoxCPM: must run on VoxCPM only
        if (!voxcpmOnline || !voxcpmUrl) {
          setInputVoxcpmUrl(getActiveVoxCPMUrl());
          setVoxcpmCheckMsg({
            text: 'VoxCPM Colab GPU Server ချိတ်ဆက်မထားပါ (Offline)။ ကျေးဇူးပြု၍ Colab Notebook တွင် ပေါ်လာသော trycloudflare.com URL အသစ်ကို ထည့်သွင်းပေးပါ။',
            ok: false
          });
          setIsVoxcpmModalOpen(true);
          throw new Error('VoxCPM Colab GPU Server ချိတ်ဆက်မထားပါ (Offline)။ ကျေးဇူးပြု၍ Colab URL အသစ်ကို ထည့်သွင်းပေးပါ။');
        }

        setProcessingStage('VoxCPM2 Free GPU ဖြင့် 48kHz စတူဒီယို အသံဖန်တီးနေပါသည်...');
        let voiceIdToUse: string | null = null;
        if (sampleFile) {
          setProcessingStage('VoxCPM2 သို့ နမူနာအသံ ပုံတူကူးယူနေပါသည်...');
          let cleanWavFile = sampleFile;
          try {
            const wavBlob = await convertAudioBlobToWav(sampleFile);
            cleanWavFile = new File([wavBlob], 'sample_voice.wav', { type: 'audio/wav' });
          } catch (convErr) {
            console.warn('Sample WAV conversion skipped:', convErr);
          }

          const registered = await createVoxCPMVoiceClone(
            cleanWavFile.name,
            cleanWavFile,
            `Speak in an energetic movie recap narration style. ${NARRATION_TONES.find(t => t.id === tone)?.name || ''}`
          );
          voiceIdToUse = registered.voiceId;
        }

        setProcessingStage('VoxCPM2 Neural Diffusion ဖြင့် အသံဖန်တီးနေပါသည် (48kHz)...');
        const requestedSpeed = Math.max(0.5, Math.min(2.0, 1.0 + (voiceSpeed / 100)));
        const audioBlob = await synthesizeVoxCPMSpeech(
          voiceIdToUse,
          text,
          `Energetic movie recap narration. ${NARRATION_TONES.find(t => t.id === tone)?.name || ''}`,
          requestedSpeed
        );
        blobUrl = URL.createObjectURL(audioBlob);
        usedEngine = sampleFile ? 'VoxCPM2 48kHz Neural Clone' : 'VoxCPM2 48kHz Studio';

      } else if (selectedEngine === 'auto' && voxcpmOnline && voxcpmUrl && !!sampleFile) {
        // Smart Auto: Use VoxCPM if online with sample voice, otherwise Gemini
        setProcessingStage('VoxCPM2 Free GPU ဖြင့် 48kHz စတူဒီယို အသံဖန်တီးနေပါသည်...');
        try {
          let cleanWavFile = sampleFile;
          try {
            const wavBlob = await convertAudioBlobToWav(sampleFile);
            cleanWavFile = new File([wavBlob], 'sample_voice.wav', { type: 'audio/wav' });
          } catch (convErr) {
            console.warn('Sample WAV conversion skipped:', convErr);
          }

          const registered = await createVoxCPMVoiceClone(
            cleanWavFile.name,
            cleanWavFile,
            `Speak in an energetic movie recap narration style. ${NARRATION_TONES.find(t => t.id === tone)?.name || ''}`
          );

          setProcessingStage('VoxCPM2 Neural Diffusion ဖြင့် အသံဖန်တီးနေပါသည် (48kHz)...');
          const requestedSpeed = Math.max(0.5, Math.min(2.0, 1.0 + (voiceSpeed / 100)));
          const audioBlob = await synthesizeVoxCPMSpeech(
            registered.voiceId,
            text,
            `Energetic movie recap narration. ${NARRATION_TONES.find(t => t.id === tone)?.name || ''}`,
            requestedSpeed
          );
          blobUrl = URL.createObjectURL(audioBlob);
          usedEngine = 'VoxCPM2 48kHz Neural Clone';
        } catch (voxErr) {
          console.warn('Auto mode VoxCPM failed, falling back to Gemini:', voxErr);
          setProcessingStage('Gemini 3.1 AI Speech ဖြင့် အစားထိုး ထုတ်ယူနေပါသည်...');
          blobUrl = await generateSpeech(
            text, 
            char?.baseVoice || 'Kore', 
            voiceSpeed, 
            voicePitch, 
            voiceMap, 
            tone, 
            styleInstruction
          );
          usedEngine = 'Gemini 3.1 Style-Cloned AI Speech';
        }

      } else {
        // Gemini 3.1 AI Speech
        setProcessingStage(sampleFile 
          ? 'Gemini 3.1 AI Speech (Style Cloned) ဖြင့် အသံကြည်လင်စွာ ထုတ်ယူနေပါသည်...' 
          : 'Gemini 3.1 AI Speech ဖြင့် အသံကြည်လင်စွာ ထုတ်ယူနေပါသည်...');
        blobUrl = await generateSpeech(
          text, 
          char?.baseVoice || 'Kore', 
          voiceSpeed, 
          voicePitch, 
          voiceMap, 
          tone, 
          styleInstruction
        );
        usedEngine = sampleFile ? 'Gemini 3.1 Style-Cloned AI Speech' : 'Gemini 3.1 AI Speech';
      }

      if (isMounted.current) {
        setAudioUrl(blobUrl);
        setLastUsedEngine(usedEngine);
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

  const handleFallbackToGemini = async () => {
    if (!text.trim()) return;
    setError(null);
    setFailedVoxcpmError(null);
    setIsProcessing(true);
    setProcessingStage('Gemini 3.1 AI Speech ဖြင့် အသံဖန်တီးနေပါသည်...');
    const char = characters.find(c => c.id === characterId);
    const voiceMap: Record<string, string> = {};
    characters.forEach(c => { voiceMap[c.name] = c.baseVoice; });
    const styleInstruction = analyzedProfile
      ? `${analyzedProfile.prompt} Match the natural human timbre, fast movie recap rhythm, and vocal expressions of the uploaded sample.`
      : '';
    try {
      const blobUrl = await generateSpeech(
        text, 
        char?.baseVoice || 'Kore', 
        voiceSpeed, 
        voicePitch, 
        voiceMap, 
        tone, 
        styleInstruction
      );
      if (isMounted.current) {
        setAudioUrl(blobUrl);
        setLastUsedEngine(sampleFile ? 'Gemini 3.1 Speech (Style Matched)' : 'Gemini 3.1 Flash Speech');
      }
    } catch (err: unknown) {
      if (isMounted.current) {
        setError((err as { message?: string })?.message || "Gemini speech generation failed.");
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
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-sm flex-shrink-0">
            <Volume2 className="w-4 h-4" />
          </div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">
            Voiceover Studio
          </h1>
        </div>

        {/* Colab GPU Settings Pill */}
        <button
          type="button"
          onClick={() => {
            setInputVoxcpmUrl(getActiveVoxCPMUrl());
            setVoxcpmCheckMsg(null);
            setIsVoxcpmModalOpen(true);
          }}
          className={`text-xs font-medium px-3 py-1.5 rounded-full border flex items-center gap-1.5 transition-all ${
            voxcpmOnline
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
              : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-zinc-400 border-slate-200 dark:border-white/10 hover:border-indigo-400'
          }`}
          title="VoxCPM Colab GPU Server Settings"
        >
          <span className={`w-2 h-2 rounded-full ${voxcpmOnline ? 'bg-emerald-500' : 'bg-amber-400'}`} />
          <span>{voxcpmOnline ? 'VoxCPM (Online)' : 'VoxCPM GPU'}</span>
          <Settings2 className="w-3 h-3 opacity-60" />
        </button>
      </div>

      <div className="glass p-5 rounded-2xl border border-slate-200 dark:border-white/10 space-y-4 shadow-xl">
        
        {/* Script Input */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <label className="text-xs font-bold text-slate-700 dark:text-zinc-300">
              ဇာတ်ညွှန်း (Script)
            </label>
            <div className="flex items-center gap-1.5">
              <button 
                type="button"
                onClick={handlePaste} 
                className="px-2 py-0.5 rounded border border-slate-200 dark:border-white/10 text-[11px] text-slate-600 dark:text-zinc-400 hover:text-indigo-500 hover:border-indigo-500 transition-colors"
              >
                Paste
              </button>
              <button 
                type="button"
                onClick={handleClear} 
                className="px-2 py-0.5 rounded border border-slate-200 dark:border-white/10 text-[11px] text-slate-600 dark:text-zinc-400 hover:text-rose-500 hover:border-rose-400 transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
            placeholder="ဖတ်ကြားလိုသော Movie Recap သို့မဟုတ် Video Script စာသားများကို ရိုက်ထည့်ပါ..."
            className="w-full h-32 bg-slate-50 dark:bg-black/30 border border-slate-200 dark:border-white/10 rounded-xl p-3 text-sm text-slate-900 dark:text-zinc-100 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all resize-none leading-relaxed"
          />
          <div className="flex justify-end text-[11px] text-slate-400 font-mono">
            <span>{text.length.toLocaleString()} / {MAX_CHARS.toLocaleString()}</span>
          </div>
        </div>

        {/* Engine Segment Bar */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10">
          <button
            type="button"
            onClick={() => { setSelectedEngine('auto'); setError(null); }}
            className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all text-center ${
              selectedEngine === 'auto'
                ? 'bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            ⚡ Auto
          </button>
          <button
            type="button"
            onClick={() => { 
              setSelectedEngine('voxcpm'); 
              setError(null);
              if (!voxcpmOnline) {
                setInputVoxcpmUrl(getActiveVoxCPMUrl());
                setVoxcpmCheckMsg(null);
                setIsVoxcpmModalOpen(true);
              }
            }}
            className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all text-center flex items-center justify-center gap-1.5 ${
              selectedEngine === 'voxcpm'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${voxcpmOnline ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
            VoxCPM (GPU)
          </button>
          <button
            type="button"
            onClick={() => { setSelectedEngine('gemini'); setError(null); }}
            className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all text-center ${
              selectedEngine === 'gemini'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            🤖 Gemini 3.1
          </button>
        </div>

        {/* Voice Model Selection */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block">
            အသံ (Voice)
          </label>
          <div className="relative z-30" ref={dropdownRef}>
            <button 
              type="button"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="w-full flex items-center justify-between p-2.5 bg-slate-50 dark:bg-black/30 border border-slate-200 dark:border-white/10 rounded-xl hover:border-indigo-500 transition-all text-left"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-900 dark:text-white">
                  {selectedChar?.name}
                </span>
                <span className="text-[11px] text-slate-500 dark:text-zinc-400">
                  • {selectedChar?.desc}
                </span>
              </div>
              <button
                type="button"
                onClick={(e) => selectedChar && handlePreviewVoice(e, selectedChar.id)}
                className="px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-500 hover:bg-indigo-500 hover:text-white transition-all text-xs font-semibold flex items-center gap-1"
              >
                {isPreviewing === selectedChar?.id ? <Square className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current" />}
                <span>နမူနာနားဆင်</span>
              </button>
            </button>

            {isDropdownOpen && (
              <div className="absolute left-0 right-0 mt-1.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-white/15 rounded-xl shadow-2xl overflow-hidden z-50 p-1.5 space-y-1 max-h-60 overflow-y-auto">
                {characters.map((char) => (
                  <div
                    key={char.id}
                    onClick={() => { setCharacterId(char.id); setIsDropdownOpen(false); }}
                    className={`flex items-center justify-between p-2 rounded-lg transition-all cursor-pointer ${
                      characterId === char.id ? 'bg-indigo-500/10 border border-indigo-500/30' : 'hover:bg-slate-100 dark:hover:bg-white/5'
                    }`}
                  >
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-slate-900 dark:text-white">{char.name} • {char.desc}</span>
                      <span className="text-[10px] text-slate-500 dark:text-zinc-400">{char.bio}</span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => handlePreviewVoice(e, char.id)}
                      className="p-1 rounded-md border border-slate-200 dark:border-white/10 text-slate-600 dark:text-zinc-400 hover:bg-indigo-500 hover:text-white transition-all"
                    >
                      {isPreviewing === char.id ? <Square className="w-3 h-3 fill-current text-rose-500" /> : <Play className="w-3 h-3 fill-current" />}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Narration Tone */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block">
            စတိုင် (Tone)
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {NARRATION_TONES.map((t) => (
              <button
                key={t.id}
                onClick={() => setTone(t.id)}
                type="button"
                className={`py-2 px-2.5 rounded-xl border text-center transition-all text-xs font-medium ${
                  tone === t.id 
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm font-bold' 
                    : 'border-slate-200 dark:border-white/10 text-slate-700 dark:text-zinc-300 hover:border-indigo-400 bg-slate-50 dark:bg-black/20'
                }`}
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>

        {/* Sample Voice Clone (Optional) */}
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
              <span>Voice Clone / Sample (Optional)</span>
            </label>
            {analyzedProfile && (
              <button 
                type="button"
                onClick={handleClearSample} 
                className="text-[11px] text-rose-500 hover:underline flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" />
                <span>နမူနာအသံ ဖြုတ်မည်</span>
              </button>
            )}
          </div>

          {!analyzedProfile ? (
            <div className="grid grid-cols-2 gap-2">
              <label className="flex items-center justify-center gap-2 py-2 px-3 rounded-xl border border-slate-200 dark:border-white/10 hover:border-indigo-500 bg-slate-50 dark:bg-black/20 cursor-pointer transition-all">
                <Upload className="w-3.5 h-3.5 text-indigo-500" />
                <span className="text-xs font-medium text-slate-700 dark:text-zinc-300">အသံဖိုင် တင်မည်</span>
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
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl border transition-all ${
                  isRecording 
                    ? 'border-rose-500 bg-rose-500/10 text-rose-500 animate-pulse' 
                    : 'border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/20 hover:border-indigo-500 text-slate-700 dark:text-zinc-300'
                }`}
              >
                <Mic className={`w-3.5 h-3.5 ${isRecording ? 'text-rose-500' : 'text-indigo-500'}`} />
                <span className="text-xs font-medium">{isRecording ? 'အသံသွင်း ရပ်မည်' : 'မိုက်ဖြင့် အသံသွင်းမည်'}</span>
              </button>
            </div>
          ) : (
            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 truncate max-w-[200px]">
                  {sampleFile?.name || 'Voice Sample'}
                </span>
              </div>
              {sampleAudioUrl && (
                <audio controls src={sampleAudioUrl} className="h-6 w-28 opacity-80" />
              )}
            </div>
          )}

          {sampleStatus && (
            <p className="text-[11px] text-indigo-500 dark:text-indigo-400 text-center font-medium">
              {sampleStatus}
            </p>
          )}
        </div>

        {/* Speed & Pitch */}
        <div className="grid grid-cols-2 gap-4 pt-1">
          <div className="space-y-1">
            <div className="flex justify-between text-xs font-semibold text-slate-700 dark:text-zinc-300">
              <span>Speed</span>
              <span className="text-indigo-500 font-mono">{voiceSpeed > 0 ? `+${voiceSpeed}%` : `${voiceSpeed}%`}</span>
            </div>
            <input 
              type="range" min="-50" max="50" step="5" value={voiceSpeed} 
              onChange={(e) => setVoiceSpeed(parseInt(e.target.value))}
              className="w-full h-1.5 bg-slate-200 dark:bg-white/10 rounded-full appearance-none cursor-pointer accent-indigo-500"
            />
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-xs font-semibold text-slate-700 dark:text-zinc-300">
              <span>Pitch</span>
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
            <div className="flex items-center gap-2 text-xs font-semibold text-indigo-500">
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
            type="button"
            onClick={handleGenerate}
            disabled={isProcessing}
            className={`w-full py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-md flex items-center justify-center gap-2 ${
              isProcessing 
                ? 'bg-slate-300 dark:bg-zinc-800 text-slate-500 cursor-not-allowed' 
                : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-500/25 active:scale-[0.99]'
            }`}
          >
            {isProcessing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>အသံဖန်တီးနေပါသည်...</span>
              </>
            ) : (
              <>
                <Volume2 className="w-4 h-4" />
                <span>Generate Voiceover ({CREDIT_COSTS[ContentType.VOICEOVER]} Credits)</span>
              </>
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
              <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>အသံဖိုင် အောင်မြင်စွာ ရရှိပါပြီ</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                  {lastUsedEngine}
                </span>
              </h4>
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
        <div className="mt-4 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl space-y-2.5 text-center shadow-sm">
          <div className="flex items-center justify-center gap-1.5 text-rose-500 font-bold text-xs">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>အသံဖန်တီးမှု သတိပေးချက်</span>
          </div>
          <p className="text-rose-600 dark:text-rose-400 text-xs font-medium leading-relaxed max-w-xl mx-auto">
            {error.includes('Failed to fetch') 
              ? `VoxCPM Colab GPU သို့ ချိတ်ဆက်၍မရပါ (Failed to fetch)။ URL အဟောင်း ဖြစ်နေနိုင်ပါသည်။ အောက်ပါ Colab GPU URL စစ်ဆေးမည် ကို နှိပ်ပြီး URL အသစ် ထည့်သွင်းပေးပါ။`
              : error}
          </p>
          
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleFallbackToGemini}
              disabled={isProcessing}
              className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Gemini 3.1 Speech ဖြင့် ချက်ချင်း ဖန်တီးမည် (Fallback)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setInputVoxcpmUrl(getActiveVoxCPMUrl());
                setVoxcpmCheckMsg(null);
                setIsVoxcpmModalOpen(true);
              }}
              className="px-3.5 py-2 bg-slate-200 dark:bg-white/10 hover:bg-slate-300 dark:hover:bg-white/20 text-slate-700 dark:text-zinc-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1"
            >
              <Server className="w-3.5 h-3.5" />
              <span>Colab GPU URL စစ်ဆေးမည်</span>
            </button>
          </div>
        </div>
      )}

      {/* VoxCPM Colab GPU Connection Modal */}
      {isVoxcpmModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="relative w-full max-w-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-500">
                  <Server className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    VoxCPM2 Free GPU ချိတ်ဆက်မှု
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">OpenBMB 48kHz High-Fidelity Studio Voice Cloner</p>
                </div>
              </div>
              <button
                onClick={() => setIsVoxcpmModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Server Status Banner */}
            <div className={`p-3 rounded-xl border flex items-center justify-between ${
              voxcpmOnline 
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400' 
                : 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400'
            }`}>
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${voxcpmOnline ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                <span className="text-xs font-bold">
                  {voxcpmOnline ? 'GPU Server အဆင်သင့်ဖြစ်နေပါသည် (Online)' : 'GPU Server ချိတ်ဆက်မထားပါ (Offline)'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleSaveAndTestVoxCPM(inputVoxcpmUrl)}
                disabled={isCheckingVoxcpm}
                className="px-2.5 py-1 text-[11px] font-bold rounded-lg border border-current hover:bg-current/10 transition-all flex items-center gap-1"
              >
                <RefreshCw className={`w-3 h-3 ${isCheckingVoxcpm ? 'animate-spin' : ''}`} />
                <span>စစ်ဆေးရန်</span>
              </button>
            </div>

            {/* URL Input */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                  Cloudflare Public URL (Colab မှ ရရှိသော URL)
                </label>
                {import.meta.env.VITE_VOXCPM_URL && (
                  <button
                    type="button"
                    onClick={() => {
                      const freshEnv = String(import.meta.env.VITE_VOXCPM_URL).trim();
                      setInputVoxcpmUrl(freshEnv);
                      handleSaveAndTestVoxCPM(freshEnv);
                    }}
                    className="text-[10px] text-indigo-500 hover:underline font-bold"
                  >
                    ⚡ Use .env URL
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inputVoxcpmUrl}
                  onChange={(e) => setInputVoxcpmUrl(e.target.value)}
                  placeholder="https://xxxx-xxxx.trycloudflare.com"
                  className="flex-1 px-3 py-2 text-xs bg-slate-50 dark:bg-black/30 border border-slate-200 dark:border-white/10 rounded-xl outline-none focus:border-indigo-500 text-slate-900 dark:text-zinc-100 font-mono"
                />
                <button
                  type="button"
                  disabled={isCheckingVoxcpm}
                  onClick={() => handleSaveAndTestVoxCPM(inputVoxcpmUrl)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50"
                >
                  {isCheckingVoxcpm ? 'စစ်ဆေးနေ...' : 'Save & Connect'}
                </button>
              </div>
              {voxcpmCheckMsg && (
                <p className={`text-xs mt-1 ${voxcpmCheckMsg.ok ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {voxcpmCheckMsg.text}
                </p>
              )}
            </div>

            {/* Colab Quick Guide */}
            <div className="p-3.5 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/5 rounded-xl space-y-2 text-xs text-slate-600 dark:text-zinc-300">
              <div className="font-bold flex items-center gap-1.5 text-indigo-500">
                <HelpCircle className="w-4 h-4" />
                <span>Google Colab (Free T4 GPU) ဖြင့် Run နည်း:</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                Google Colab သည် Cloud ပေါ်ရှိ အခမဲ့ GPU ဖြစ်သဖြင့် အမြဲတမ်း Auto မ Run နိုင်ပါ။ Session ပိတ်သွားပါက အောက်ပါအတိုင်း ပြန် Run ပေးရပါသည်:
              </p>
              <ol className="list-decimal list-inside space-y-1 text-[11px] leading-relaxed">
                <li><a href="https://colab.research.google.com" target="_blank" rel="noreferrer" className="text-indigo-500 underline inline-flex items-center gap-0.5">Google Colab <ExternalLink className="w-3 h-3 inline" /></a> သို့ သွားပြီး <code className="bg-slate-200 dark:bg-white/10 px-1 rounded">server/VoxCPM_Colab_Free_GPU.ipynb</code> ကို တင်ပါ</li>
                <li><strong>Runtime &rarr; Change runtime type &rarr; T4 GPU</strong> ရွေးပြီး <strong>Run all</strong> ကို နှိပ်ပါ</li>
                <li>အောက်ဆုံးတွင် ထွက်လာသော <code className="bg-slate-200 dark:bg-white/10 px-1 rounded">https://xxxx.trycloudflare.com</code> URL ကို ကူးယူပြီး အပေါ်တွင် Paste လုပ်ပါ</li>
              </ol>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setIsVoxcpmModalOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl transition-all"
              >
                ပိတ်မည် (Close)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Voiceover;
