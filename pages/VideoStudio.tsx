import React, { useState, useRef } from 'react';
import { generateSubtitles, generateText, generateSpeech } from '../services/geminiService';
import { CREDIT_COSTS, ContentType, JsonValue, JsonRecord } from '../types';
import { Toaster, toast } from 'react-hot-toast';
import { auth } from '../services/firebase';
import { logGeneration } from '../services/supabase';
import { ModuleLogHistory } from '../components/ModuleLogHistory';
import { RecentHistory } from '../components/RecentHistory';
import { merger, measureAudioDuration, estimateSyncSpeed } from '../services/videoMerger';
import { loadBatchQueue, saveBatchQueue, removeFromBatch, addToBatch, BatchItem, BatchStatus } from '../services/batchQueue';
import { getRefuelState } from '../services/refuelEngine';


interface VideoStudioProps {
  onSpendCredits: (amount: number) => boolean;
}

type Step = 'SOURCE' | 'TRANSCRIPTION' | 'TRANSLATION' | 'VOICEOVER';

const VideoStudio: React.FC<VideoStudioProps> = ({ onSpendCredits }) => {
  // Navigation & UI State
  const [currentStep, setCurrentStep] = useState<Step>('SOURCE');
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [inputMode, setInputMode] = useState<'UPLOAD' | 'PASTE'>('UPLOAD');
  const [file, setFile] = useState<File | null>(null);
  const [pastedTranscript, setPastedTranscript] = useState<string>('');
  const [duration, setDuration] = useState<number>(0); // in seconds

  // Pipeline Data State
  const [transcript, setTranscript] = useState<string>('');
  const [translation, setTranslation] = useState<string>('');
  const [audioUrl, setAudioUrl] = useState<string>('');
  // One-click final render states (auto sync voice with video)
  const [mergedVideoUrl, setMergedVideoUrl] = useState<string>('');
  const [isMerging, setIsMerging] = useState<boolean>(false);
  const [mergeProgress, setMergeProgress] = useState<string>('');
  const [mergeError, setMergeError] = useState<string>('');
  const [autoMerge, setAutoMerge] = useState<boolean>(true);
  // Loading & Progress States
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [progress, setProgress] = useState<number>(0);

  // Configuration Settings
  const [tone, setTone] = useState<string>('thrilling');
  const [voice, setVoice] = useState<string>('Kore');
  const [speed, setSpeed] = useState<number>(1.0); // virtual rate control for prompt context

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Batch Queue State
  const [batchItems, setBatchItems] = useState<BatchItem[]>(() => loadBatchQueue());
  const [isBatchRunning, setIsBatchRunning] = useState<boolean>(false);
  const [batchLog, setBatchLog] = useState<string>('');

  const refreshBatch = () => setBatchItems(loadBatchQueue());

  const syncBatchItem = (id: string, patch: Partial<BatchItem>) => {
    const updated = loadBatchQueue().map(i => (i.id === id ? { ...i, ...patch } : i));
    saveBatchQueue(updated);
    setBatchItems(updated);
  };

  // Add the currently configured job to the batch queue (without running it)
  const handleAddToBatch = () => {
    if (!file && inputMode === 'UPLOAD') {
      toast.error('Batch ထည့်ဖို့ ဗီဒီယို file ရွေးပေးပါ');
      return;
    }
    addToBatch({
      name: file?.name || 'Pasted transcript',
      fileName: file?.name || 'pasted.txt',
      language: translation ? 'my' : 'en',
      voice,
    });
    refreshBatch();
    toast.success('Batch queue ထဲ ထည့်ပြီးပါပြီ!');
  };

  const handleRemoveBatchItem = (id: string) => {
    removeFromBatch(id);
    refreshBatch();
  };

  const handleClearDoneBatchItems = () => {
    const updated = loadBatchQueue().filter(i => i.status !== 'done');
    saveBatchQueue(updated);
    setBatchItems(updated);
    toast.success('ပြီးဆုံး items ဖျက်ပြီးပါပြီ');
  };

  /**
   * Process the batch queue sequentially.
   * Runs the full pipeline (transcribe → translate → voiceover → merge) for each
   * queued item. Because video files cannot be re-read from localStorage,
   * the current session's file is used only for demonstration when present;
   * items whose file is unavailable are marked failed with a clear message.
   */
  const handleProcessBatch = async () => {
    const queue = loadBatchQueue().filter(i => i.status === 'queued');
    if (queue.length === 0) {
      toast.error('Batch queue ထဲ queued item မရှိပါ');
      return;
    }
    if (!onSpendCredits(CREDIT_COSTS[ContentType.VOICEOVER] * queue.length)) {
      toast.error('Batch အတွက် credit လုံလောက်မှု မရှိပါ');
      return;
    }
    setIsBatchRunning(true);
    setBatchLog('Batch processing စတင်ပါပြီ...\n');
    for (const item of queue) {
      syncBatchItem(item.id, { status: 'processing', startedAt: Date.now() });
      setBatchLog(prev => `${prev}→ ${item.name} စတင်နေပါတယ်...\n`);
      try {
        // Files cannot be re-read from localStorage across sessions. The batch
        // run uses the file currently selected in this session when names match.
        if (!file || item.fileName !== file.name) {
          throw new Error('ဤ browser session ထဲမှာ video file ပြန်မရပါ။ ဗီဒီယိုကို ပြန်တင်ပြီး "Process Batch" ကို ထပ်နှိပ်ပါ။');
        }
        // Step 1: Transcription — replicate the page pipeline (base64 + mime)
        setStatusMessage(`Transcribing ${item.name}...`);
        setProgress(15);
        const reader = new FileReader();
        const base64: string = await new Promise((resolve, reject) => {
          reader.onload = () => resolve((reader.result as string).split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        let mimeType = file.type;
        if (!mimeType) {
          const ext = file.name.split('.').pop()?.toLowerCase();
          mimeType = ext === 'mov' ? 'video/quicktime' : ext === 'mkv' ? 'video/x-matroska' : ext === 'mp3' ? 'audio/mp3' : ext === 'wav' ? 'audio/wav' : 'video/mp4';
        }
        const transText = await generateSubtitles(base64, mimeType);
        setBatchLog(prev => `${prev}  ✓ transcription ပြီး\n`);
        // Step 2: Translate — replicate the cinematic recap prompt
        setStatusMessage(`Translating ${item.name}...`);
        setProgress(40);
        const lengthInstruction = duration > 0
          ? `The original track lasted exactly ${duration} seconds. Ensure the translated Burmese script can realistically be spoken in EXACTLY ${duration} seconds (about ${Math.floor(duration * 2.5)} Burmese words).`
          : 'Create a highly compact, pacing-friendly translation.';
        const systemPrompt = `You are an elite, professional translator and narrator specializing in Burmese Movie Recap channels. Deliver ONLY the pure Burmese spoken narration script. No scene descriptions, no speaker tags, no metadata. Use authentic Burmese YouTube recap slang that excites audiences. ${lengthInstruction}`;
        const transText2 = await generateText(
          `Translate the following script into Burmese:\n---\n${transText}\n---\nEmotional tone: ${tone.toUpperCase()}`,
          systemPrompt,
        );
        setBatchLog(prev => `${prev}  ✓ translation ပြီး\n`);
        // Step 3: Voiceover — returns a playable object URL
        setStatusMessage(`Voiceover ${item.name}...`);
        setProgress(70);
        const audioUrl = await generateSpeech(transText2, item.voice, speed);
        const audioBlob = await fetch(audioUrl).then(r => r.blob());
        setBatchLog(prev => `${prev}  ✓ voiceover ပြီး\n`);
        // Step 4: Merge with video timeline sync
        setStatusMessage(`Syncing ${item.name}...`);
        setProgress(90);
        const voiceDur = await measureAudioDuration(audioBlob);
        const videoSpeed = estimateSyncSpeed(duration, voiceDur);
        const mergedBlob = await merger.merge(file, audioBlob, { videoSpeed });
        const finalUrl = URL.createObjectURL(mergedBlob);
        const a = document.createElement('a');
        a.href = finalUrl;
        a.download = `batch-${item.id}.mp4`;
        a.click();
        setBatchLog(prev => `${prev}  ✓ final video download စတင်${videoSpeed > 1.05 ? ` (${videoSpeed.toFixed(2)}x auto speed-match)` : ''}\n`);
        syncBatchItem(item.id, { status: 'done', finishedAt: Date.now() });
        setBatchLog(prev => `${prev}→ ${item.name} ပြီးဆုံး\n`);
      } catch (err: unknown) {
        syncBatchItem(item.id, { status: 'failed', error: (err as { message?: string })?.message || 'Unknown error', finishedAt: Date.now() });
        setBatchLog(prev => `${prev}  ✗ error: ${(err as { message?: string })?.message || 'failed'}\n`);
      }
    }
    setProgress(100);
    setStatusMessage('Batch processing ပြီးဆုံး');
    setIsBatchRunning(false);
    refreshBatch();
    toast.success('Batch processing ပြီးဆုံးပါပြီ');
  };

  const batchStatusStyle = (status: BatchStatus): string =>
    ({
      queued: 'bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400',
      processing: 'bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-300 animate-pulse',
      done: 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-300',
      failed: 'bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-300',
    } as Record<BatchStatus, string>)[status] || '';

  // Recent-task restore: re-apply pipeline settings from a previous task
  const handleRestoreVideoStudio = (input: JsonValue) => {
    if (!input || typeof input !== 'object') return;
    if (typeof (input as JsonRecord).tone === 'string') setTone((input as JsonRecord).tone as string);
    if (typeof (input as JsonRecord).voice === 'string') setVoice((input as JsonRecord).voice as string);
    if (typeof (input as JsonRecord).speed === 'number') setSpeed((input as JsonRecord).speed as number);
  };

  // Parse media duration
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setAudioUrl('');

      const isVideo = selectedFile.type.startsWith('video');
      const media = document.createElement(isVideo ? 'video' : 'audio');
      media.preload = 'metadata';
      media.onloadedmetadata = () => {
        window.URL.revokeObjectURL(media.src);
        setDuration(Math.floor((media as HTMLVideoElement).duration || 0));
      };
      media.src = URL.createObjectURL(selectedFile);
    }
  };

  // STEP 1 -> STEP 2: Handle Transcription or Input Confirmation
  const startTranscription = async () => {
    if (inputMode === 'PASTE') {
      if (!pastedTranscript.trim()) {
        toast.error('Please enter or paste your transcript.');
        return;
      }
      setTranscript(pastedTranscript);
      setCurrentStep('TRANSLATION');
      return;
    }

    if (!file) {
      toast.error('Please choose a video or audio file first.');
      return;
    }

    if (!onSpendCredits(10)) {
      toast.error('Insufficient credits! (Need 10 credits for transcription)');
      return;
    }

    setIsProcessing(true);
    setProgress(20);
    setStatusMessage('Reading file stream...');
    setCurrentStep('TRANSCRIPTION');

    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const base64 = await base64Promise;

      // Safe MIME detection with reliable extensions fallback
      let mimeType = file.type;
      if (!mimeType) {
        const ext = file.name.split('.').pop()?.toLowerCase();
        if (ext === 'mp4') mimeType = 'video/mp4';
        else if (ext === 'mov') mimeType = 'video/quicktime';
        else if (ext === 'mkv') mimeType = 'video/x-matroska';
        else if (ext === 'mp3') mimeType = 'audio/mp3';
        else if (ext === 'wav') mimeType = 'audio/wav';
        else mimeType = 'video/mp4'; // fallback
      }

      setStatusMessage('Transcribing original media with Gemini-3.5...');
      setProgress(50);

      const scriptText = await generateSubtitles(base64, mimeType);
      setTranscript(scriptText);
      setProgress(100);
      toast.success('Transcription complete!');

      const currentUser = auth.currentUser;
      if (currentUser) {
        await logGeneration(
          currentUser.uid,
          currentUser.email || '',
          'videostudio_transcribe',
          { fileName: file?.name || 'pasted', mimeType },
          { resultLength: scriptText.length, preview: scriptText.substring(0, 150) + "..." }
        );
        window.dispatchEvent(
          new CustomEvent('lumini:taskLogged', {
            detail: { module: 'videostudio_transcribe', input: { fileName: file?.name || 'pasted' } },
          })
        );
        setRefreshTrigger(prev => prev + 1);
      }
    } catch (err: unknown) {
      console.error(err);
      toast.error((err as { message?: string })?.message || 'Transcription failed.');
      setCurrentStep('SOURCE');
    } finally {
      setIsProcessing(false);
    }
  };

  // STEP 2 -> STEP 3: Handle translation to thrilling movie recap burmese style
  const startTranslation = async () => {
    if (!transcript.trim()) {
      toast.error('Transcript is empty. Please enter some text.');
      return;
    }

    if (!onSpendCredits(5)) {
      toast.error('Insufficient credits! (Need 5 credits for translation)');
      return;
    }

    setIsProcessing(true);
    setCurrentStep('TRANSLATION');
    setStatusMessage('Translating script into cinematic Burmese recaps...');
    setProgress(40);

    const lengthInstruction = duration > 0
      ? `The original timing/voice track lasted exactly ${duration} seconds. Ensure the translated Burmese script can be realistically spoken in EXACTLY ${duration} seconds. Typically, Burmese speech contains around 2.5 words per second, so targets about ${Math.floor(duration * 2.5)} Burmese unicode words in total. Keep it punchy and clear without stretching.`
      : 'Create a highly compact, pacing-friendly translation.';

    const systemPrompt = `You are an elite, professional translator and narrator specializing in Burmese Movie Recap channels.
Your goal is to translate English/generic scripts into natural, incredibly thrilling, fast-paced, and culturally resonant Burmese dialog.

STRICT RULES:
1. Deliver ONLY the pure Burmese spoken narration script. Do NOT include scene descriptions, speaker tags (like NARRATOR:), bracketed metadata, or parenthetical cues.
2. Use authentic Burmese YouTube recap slang that excites audiences.
3. ${lengthInstruction}`;

    const promptText = `Translate the following original media script into Burmese:
---
${transcript}
---
Ensure the emotional tone is: ${tone.toUpperCase()}. Must strictly target the original duration constraint!`;

    try {
      const translatedText = await generateText(promptText, systemPrompt);
      setTranslation(translatedText);
      setProgress(100);
      toast.success('Translation completed!');

      const currentUser = auth.currentUser;
      if (currentUser) {
        await logGeneration(
          currentUser.uid,
          currentUser.email || '',
          'videostudio_translate',
          { originalScriptLength: transcript.length, duration, tone },
          { resultLength: translatedText.length, preview: translatedText.substring(0, 150) + "..." }
        );
        window.dispatchEvent(
          new CustomEvent('lumini:taskLogged', {
            detail: { module: 'videostudio_translate', input: { duration, tone } },
          })
        );
        setRefreshTrigger(prev => prev + 1);
      }
    } catch (err: unknown) {
      console.error(err);
      toast.error((err as { message?: string })?.message || 'Translation failed.');
    } finally {
      setIsProcessing(false);
    }
  };

  // STEP 3 -> STEP 4: Synthesize high-quality Burmese voiceover matching timing
  const startVoiceover = async () => {
    if (!translation.trim()) {
      toast.error('Translated script is empty.');
      return;
    }

    if (!onSpendCredits(10)) {
      toast.error('Insufficient credits! (Need 10 credits for Voiceover generation)');
      return;
    }

    setIsProcessing(true);
    setCurrentStep('VOICEOVER');
    setStatusMessage('Generating authentic Burmese voiceover...');
    setProgress(50);

    try {
      // Call the latest Gemini TTS model with dynamic chunking and speed pace matching
      const synthesizedUrl = await generateSpeech(translation, voice, speed);
      setAudioUrl(synthesizedUrl);
      setProgress(100);
      toast.success('Burmese voiceover generated successfully!');

      const currentUser = auth.currentUser;

      // One-Click: auto-sync voiceover with original video timeline (free, client-side)
      if (file && autoMerge && file.type.startsWith('video')) {
        setIsMerging(true);
        setMergeProgress('Syncing voiceover with video timeline...');
        setMergeError('');
        try {
          const voiceRes = await fetch(synthesizedUrl);
          const voiceBlob = await voiceRes.blob();
          const voiceDur = await measureAudioDuration(voiceBlob);
          const videoSpeed = estimateSyncSpeed(duration, voiceDur);
          const speedInfo = videoSpeed > 1.05
            ? ` (auto speed-matched ${videoSpeed.toFixed(2)}x to fit ${duration}s video)`
            : '';
          setMergeProgress(`Mixing audio & video${speedInfo}...`);
          const mergedBlob = await merger.merge(file, voiceBlob, { videoSpeed });
          const mergedURL = URL.createObjectURL(mergedBlob);
          setMergedVideoUrl(mergedURL);
          setMergeProgress('');
          toast.success(`Video synced${speedInfo} — download your final MP4!`);
          if (currentUser) {
            await logGeneration(
              currentUser.uid,
              currentUser.email || '',
              'videostudio_mixed',
              { videoDuration: duration, voiceDuration: voiceDur, videoSpeed, autoMerge },
              { status: 'success', info: 'Merged MP4 with synced Burmese voiceover' }
            );
          }
        } catch (mergeErr: unknown) {
          console.error('Merge failed', mergeErr);
          setMergeError((mergeErr as { message?: string })?.message || 'Merging failed.');
          setMergeProgress('');
        } finally {
          setIsMerging(false);
        }
      }

      if (currentUser) {
        await logGeneration(
          currentUser.uid,
          currentUser.email || '',
          'videostudio_voiceover',
          { voice, speed, translationLength: translation.length },
          { status: 'success', info: 'Voiceover audio generated successfully' }
        );
        window.dispatchEvent(
          new CustomEvent('lumini:taskLogged', {
            detail: { module: 'videostudio_voiceover', input: { voice, speed } },
          })
        );
        setRefreshTrigger(prev => prev + 1);
      }
    } catch (err: unknown) {
      console.error(err);
      let userMsg = (err as { message?: string })?.message || 'Voiceover generation failed.';
      try {
        const msg = (err as { message?: string })?.message || "";
        const openBrace = msg.indexOf('{');
        const closeBrace = msg.lastIndexOf('}');
        if (openBrace !== -1 && closeBrace !== -1 && openBrace < closeBrace) {
          const jsonStr = msg.substring(openBrace, closeBrace + 1);
          if (jsonStr.includes('isQuotaError')) {
            const parsed = JSON.parse(jsonStr);
            userMsg = `${parsed.mmMessage} (Please wait 30-45s and try again)`;
          }
        }
      } catch (_) {}
      toast.error(userMsg, { duration: 10000 });
    } finally {
      setIsProcessing(false);
    }
  };

  // Reset module to upload state
  const handleReset = () => {
    setFile(null);
    setPastedTranscript('');
    setTranscript('');
    setTranslation('');
    setAudioUrl('');
    setMergedVideoUrl('');
    setIsMerging(false);
    setMergeProgress('');
    setMergeError('');
    setDuration(0);
    setCurrentStep('SOURCE');
    setProgress(0);
  };

  return (
    <div className="module-page max-w-3xl mx-auto pb-12 px-4 transition-all duration-300">


      {/* Page Title */}
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2.5 rounded-xl bg-accent/10 flex items-center justify-center">
          <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white !mb-0">Video Recap Studio</h1>
          <p className="text-xs text-slate-500 dark:text-zinc-300 mt-1">Pipeline transcription • translation • Myanmar Voiceover</p>
        </div>
      </div>

      {/* Stepper Display ("ဘယ်အဆင့် ရောက်နေပီလဲ ပြရမယ်") */}
      <div className="rounded-2xl bg-white dark:bg-[#0c0c0e] border border-gray-200 dark:border-white/10 p-4 mb-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">

          {/* Step 1 */}
          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-mono text-sm font-bold transition-colors ${
              currentStep === 'SOURCE'
                ? 'bg-accent text-white'
                : 'bg-gray-100 dark:bg-white/5 text-slate-400 dark:text-zinc-400'
            }`}>
              1
            </div>
            <div className="text-left">
              <p className="text-[10px] uppercase tracking-wide !mb-0 text-slate-400 dark:text-zinc-400">Phase 01</p>
              <h3 className={`text-xs font-bold uppercase tracking-wide ${currentStep === 'SOURCE' ? 'text-accent' : 'text-slate-400 dark:text-zinc-400'}`}>SOURCE INPUT</h3>
            </div>
          </div>

          <div className="hidden md:block h-px flex-1 bg-gray-200 dark:bg-white/10 mx-4"></div>

          {/* Step 2 */}
          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-mono text-sm font-bold transition-colors ${
              currentStep === 'TRANSCRIPTION'
                ? 'bg-accent text-white animate-pulse'
                : transcript
                ? 'bg-emerald-500/20 text-emerald-500 border border-emerald-500/30'
                : 'bg-gray-100 dark:bg-white/5 text-slate-400 dark:text-zinc-400'
            }`}>
              2
            </div>
            <div className="text-left">
              <p className="text-[10px] uppercase tracking-wide !mb-0 text-slate-400 dark:text-zinc-400">Phase 02</p>
              <h3 className={`text-xs font-bold uppercase tracking-wide ${currentStep === 'TRANSCRIPTION' ? 'text-accent' : transcript ? 'text-emerald-500' : 'text-slate-400 dark:text-zinc-400'}`}>TRANSCRIPTION</h3>
            </div>
          </div>

          <div className="hidden md:block h-px flex-1 bg-gray-200 dark:bg-white/10 mx-4"></div>

          {/* Step 3 */}
          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-mono text-sm font-bold transition-colors ${
              currentStep === 'TRANSLATION'
                ? 'bg-accent text-white animate-pulse'
                : translation
                ? 'bg-emerald-500/20 text-emerald-500 border border-emerald-500/30'
                : 'bg-gray-100 dark:bg-white/5 text-slate-400 dark:text-zinc-400'
            }`}>
              3
            </div>
            <div className="text-left">
              <p className="text-[10px] uppercase tracking-wide !mb-0 text-slate-400 dark:text-zinc-400">Phase 03</p>
              <h3 className={`text-xs font-bold uppercase tracking-wide ${currentStep === 'TRANSLATION' ? 'text-accent' : translation ? 'text-emerald-500' : 'text-slate-400 dark:text-zinc-400'}`}>RECAP TRANSLATION</h3>
            </div>
          </div>

          <div className="hidden md:block h-px flex-1 bg-gray-200 dark:bg-white/10 mx-4"></div>

          {/* Step 4 */}
          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-mono text-sm font-bold transition-colors ${
              currentStep === 'VOICEOVER'
                ? 'bg-accent text-white'
                : audioUrl
                ? 'bg-emerald-500 text-white font-bold'
                : 'bg-gray-100 dark:bg-white/5 text-slate-400 dark:text-zinc-400'
            }`}>
              4
            </div>
            <div className="text-left">
              <p className="text-[10px] uppercase tracking-wide !mb-0 text-slate-400 dark:text-zinc-400">Phase 04</p>
              <h3 className={`text-xs font-bold uppercase tracking-wide ${currentStep === 'VOICEOVER' ? 'text-accent' : audioUrl ? 'text-emerald-500' : 'text-slate-400 dark:text-zinc-400'}`}>MYANMAR VOICE</h3>
            </div>
          </div>

        </div>
      </div>

      {/* Main Form container */}
      <div className="rounded-2xl bg-white dark:bg-[#0c0c0e] border border-gray-200 dark:border-white/10 p-4 sm:p-5 relative">

        {/* Loading Overlay */}
        {isProcessing && (
          <div className="absolute inset-0 bg-white/90 dark:bg-black/80 backdrop-blur-sm z-50 rounded-2xl flex flex-col items-center justify-center p-8 transition-opacity duration-300">
            <div className="w-14 h-14 border-4 border-accent border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className="text-xs font-bold text-accent uppercase tracking-wide mb-2 animate-pulse">{statusMessage}</p>
            <div className="w-64 bg-gray-200 dark:bg-white/10 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-accent h-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-[10px] text-slate-500 dark:text-zinc-400 mt-2">{progress}% completed</p>
          </div>
        )}

        {/* STEP 1 UI: SOURCE INPUT */}
        {currentStep === 'SOURCE' && (
          <div className="space-y-6 animate-in fade-in duration-300">

            {/* Input Mode Selector */}
            <div className="flex bg-gray-100 dark:bg-white/5 p-1 rounded-lg border border-gray-200 dark:border-white/10">
              <button
                type="button"
                onClick={() => setInputMode('UPLOAD')}
                className={`flex-1 py-2 rounded-md text-xs font-bold uppercase tracking-wide transition-all ${
                  inputMode === 'UPLOAD' ? 'bg-accent text-white' : 'text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-200'
                }`}
              >
                Upload Video/Audio
              </button>
              <button
                type="button"
                onClick={() => setInputMode('PASTE')}
                className={`flex-1 py-2 rounded-md text-xs font-bold uppercase tracking-wide transition-all ${
                  inputMode === 'PASTE' ? 'bg-accent text-white' : 'text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-200'
                }`}
              >
                Or Paste Transcript
              </button>
            </div>

            {inputMode === 'UPLOAD' ? (
              <div className="space-y-4">
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-6 sm:p-8 text-center cursor-pointer transition-all ${
                    file ? 'border-accent bg-accent/5' : 'border-gray-300 dark:border-white/10 hover:border-accent/50 hover:bg-gray-50 dark:hover:bg-white/5'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/*,audio/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  {file ? (
                    <div className="space-y-2">
                      <div className="w-12 h-12 bg-accent/10 rounded-xl flex items-center justify-center mx-auto text-accent">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <p className="text-sm font-bold text-slate-900 dark:text-white truncate max-w-sm mx-auto !mb-0">{file.name}</p>
                      <p className="text-[10px] text-slate-500 dark:text-zinc-400 font-mono !mb-0">
                        Estimated duration: <span className="text-slate-900 dark:text-white font-bold">{duration || 'Calculating...'}s</span>
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="w-12 h-12 bg-gray-100 dark:bg-white/5 rounded-xl flex items-center justify-center mx-auto text-slate-400 dark:text-zinc-400">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                      </div>
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-zinc-400 !mb-0">Select Video/Audio file</p>
                      <p className="text-[10px] text-slate-400 dark:text-zinc-500 uppercase tracking-wide !mb-0">supports MP4, MOV, MKV, MP3, WAV</p>
                    </div>
                  )}
                </div>

              </div>
            ) : (
              <div className="space-y-3">
                <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-zinc-400">Paste Script / Subtitles</label>
                <textarea
                  value={pastedTranscript}
                  onChange={(e) => setPastedTranscript(e.target.value)}
                  placeholder="Paste your original source translation text or dialogue here..."
                  className="w-full bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg p-3 text-xs text-slate-900 dark:text-zinc-100 focus:ring-2 focus:ring-accent outline-none h-44 font-mono leading-relaxed"
                />

                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-zinc-400 block">Original Timestamps Duration (Optional)</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min="0"
                      value={duration}
                      onChange={(e) => setDuration(Math.max(0, parseInt(e.target.value) || 0))}
                      className="bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-zinc-100 uppercase focus:ring-2 focus:ring-accent outline-none w-28"
                    />
                    <span className="text-[10px] text-slate-500 dark:text-zinc-400 uppercase tracking-wide !mb-0">Seconds total (needed to sync Myanmar speech timing)</span>
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={startTranscription}
 aria-label="ဗီဒီယို transcription စတင်ရန်"              className="w-full py-2 px-4 bg-accent hover:bg-accent-hover text-white rounded-lg font-bold uppercase tracking-wide shadow-accent/20 transition-all text-xs"
            >
              Analyze & Extract Script
            </button>
          </div>
        )}

        {/* STEP 2 UI: EXTRACED TRANSCRIPTION */}
        {currentStep === 'TRANSCRIPTION' && !isProcessing && (
          <div className="space-y-4 animate-in fade-in duration-300">
            <div>
              <span className="text-[10px] font-bold text-accent uppercase tracking-wide !mb-0">Pipeline Output - 01</span>
              <h3 className="text-base font-bold text-slate-900 dark:text-white uppercase tracking-wide mt-1">Transcription Script</h3>
            </div>

            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              className="w-full bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg p-3 text-xs text-slate-900 dark:text-zinc-100 focus:ring-2 focus:ring-accent outline-none h-56 font-mono leading-relaxed"
            />

            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-zinc-400">Narration Recap tone</label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {['thrilling', 'sarcastic', 'emotional', 'mystery'].map((t) => (
                  <button
                    key={t}
                    onClick={() => setTone(t)}
                    type="button"
                    className={`py-2 px-2 rounded-lg text-[10px] uppercase tracking-wide border transition-all font-bold ${
                      tone === t
                        ? 'bg-accent border-accent text-white'
                        : 'bg-transparent border-gray-200 dark:border-white/10 text-slate-500 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-white/5'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setCurrentStep('SOURCE')}
                className="flex-1 py-2 px-3 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 border border-gray-200 dark:border-white/10 text-slate-600 dark:text-zinc-300 rounded-lg uppercase tracking-wide transition-all text-xs font-bold"
              >
                Back To Source
              </button>
              <button
                onClick={startTranslation}
 aria-label="မြန်မာဘာသာသို့ ဘာသာပြန်ရန်"                className="flex-[2] py-2 px-4 bg-accent hover:bg-accent-hover text-white rounded-lg uppercase tracking-wide transition-all text-xs font-bold"
              >
                Translate to Burmese (5 CR)
              </button>
            </div>
          </div>
        )}

        {/* STEP 3 UI: RECAP TRANSLATION */}
        {currentStep === 'TRANSLATION' && !isProcessing && (
          <div className="space-y-4 animate-in fade-in duration-300">
            <div>
              <span className="text-[10px] font-bold text-accent uppercase tracking-wide !mb-0">Pipeline Output - 02</span>
              <h3 className="text-base font-bold text-slate-900 dark:text-white uppercase tracking-wide mt-1">Burmese Recap script (Burmese Unicode)</h3>
            </div>

            <textarea
              value={translation}
              onChange={(e) => setTranslation(e.target.value)}
              className="w-full bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg p-3 text-xs text-slate-900 dark:text-zinc-100 focus:ring-2 focus:ring-accent outline-none h-56 font-sans leading-relaxed"
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 dark:bg-white/5 p-4 border border-gray-200 dark:border-white/10 rounded-xl">
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-zinc-400">Burmese Speaker Voice</label>
                <select
                  value={voice}
                  onChange={(e) => setVoice(e.target.value)}
                  className="w-full bg-white dark:bg-[#0c0c0e] border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-zinc-100 uppercase tracking-wide outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value="Kore">Kore (Energetic Recapper)</option>
                  <option value="Fenrir">Fenrir (Mysterious Narrator)</option>
                  <option value="Zephyr">Zephyr (Cheerful Vibe)</option>
                  <option value="Puck">Puck (Fast Paced)</option>
                  <option value="Charon">Charon (Deep Storyteller)</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-zinc-400 flex justify-between">
                  <span>Speech Rate Adaptor</span>
                  <span className="text-slate-900 dark:text-white font-mono">{speed}x</span>
                </label>
                <input
                  type="range"
                  min="0.75"
                  max="1.5"
                  step="0.05"
                  value={speed}
                  onChange={(e) => setSpeed(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-gray-200 dark:bg-white/10 rounded-full appearance-none cursor-pointer accent-accent"
                />
                <p className="text-[10px] text-slate-500 dark:text-zinc-400 uppercase tracking-wide">Matches Burma vocal pacing exactly to the original {duration}s.</p>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => {
                  if (inputMode === 'PASTE') {
                    setCurrentStep('SOURCE');
                  } else {
                    setCurrentStep('TRANSCRIPTION');
                  }
                }}
                className="flex-1 py-2 px-3 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 border border-gray-200 dark:border-white/10 text-slate-600 dark:text-zinc-300 rounded-lg uppercase tracking-wide transition-all text-xs font-bold"
              >
                Back To Script
              </button>
              <button
                onClick={startVoiceover}
 aria-label="အသံထွက်ပြီး ဗီဒီယို sync လုပ်ရန်"                className="flex-[2] py-2 px-4 bg-accent hover:bg-accent-hover text-white rounded-lg uppercase tracking-wide transition-all text-xs font-bold"
              >
                Synthesize Voice (10 CR)
              </button>
            </div>

            {/* One-click auto-sync option: free client-side merge of voice + video */}
            {inputMode === 'UPLOAD' && file?.type.startsWith('video') && (
              <label className="flex items-center gap-3 px-4 py-3 rounded-lg border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoMerge}
                  onChange={(e) => setAutoMerge(e.target.checked)}
                  className="w-4 h-4 accent-emerald-500"
                />
                <div className="text-left">
                  <p className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wide">One-Click Sync: အသံ + ရုပ်ပုံ Timeline အတိအကျပိုက်ညှိ</p>
                  <p className="text-[10px] text-slate-500 dark:text-zinc-400">Voiceover ပြီးရင့် အသံကို ဗီဒီယို timeline နဲ့ အလိုအလျှောက် ချိန်ညှိပြီး final .MP4 ချက်ချင်း ထုတ်ပေးမယ် (free, ffmpeg.wasm)။</p>
                </div>
              </label>
            )}
          </div>
        )}

        {/* STEP 4 UI: MYANMAR VOICE */}
        {currentStep === 'VOICEOVER' && !isProcessing && (
          <div className="space-y-4 animate-in fade-in duration-300">
            <div>
              <span className="text-[10px] font-bold text-accent uppercase tracking-wide !mb-0">Pipeline Completed</span>
              <h3 className="text-base font-bold text-slate-900 dark:text-white uppercase tracking-wide mt-1">Myanmar voice-over output</h3>
            </div>

            {audioUrl ? (
              <div className="p-4 bg-emerald-50 dark:bg-emerald-500/5 border border-emerald-200 dark:border-emerald-500/20 rounded-xl space-y-4">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-emerald-500 text-white rounded-lg">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
                    </svg>
                  </div>
                  <div className="text-left">
                    <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide !mb-0">STEREOPHONIC WAVE DEPLOYED</p>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">Gemini 3.1-TTS Voiceover Output</h4>
                  </div>
                </div>

                <audio src={audioUrl} controls className="w-full accent-emerald-500" />

                <div className="flex gap-3">
                  <a
                    href={audioUrl}
                    download="myanmar_recap_voiceover.wav"
                    className="flex-1 py-2 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-center text-xs font-bold uppercase tracking-wide transition-all"
                  >
                    Download Audio (.WAV)
                  </a>
                </div>

                {/* One-click merged video: synced voice + original footage */}
                {isMerging ? (
                  <div className="p-4 rounded-xl border border-orange-200 dark:border-orange-500/20 space-y-4 bg-orange-50 dark:bg-orange-500/5 animate-pulse">
                    <h4 className="text-sm font-bold text-orange-500 uppercase tracking-wide">Syncing Audio & Video Timeline...</h4>
                    <div className="w-full bg-gray-200 dark:bg-white/10 rounded-full h-2 overflow-hidden">
                      <div className="h-2 bg-accent rounded-full w-2/3 animate-pulse" />
                    </div>
                    <p className="text-xs text-slate-600 dark:text-zinc-300">{mergeProgress || 'Preparing ffmpeg...'}</p>
                    <p className="text-[10px] text-slate-500 dark:text-zinc-400">ပထမအကြိမ် ffmpeg core download လုပ်ရသဖြင့် နှေးနိုင်သည် (တစ်ကြိမ်သာ)။ Browser ထဲမှာပဲ run သည် — free, open-source။</p>
                  </div>
                ) : mergedVideoUrl ? (
                  <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-500/20 space-y-4 bg-emerald-50 dark:bg-emerald-500/5">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-emerald-500 text-white rounded-lg">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 18.996 6 18.375m-3.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-1.5A1.125 1.125 0 0118 18.375M20.625 4.5H3.375m17.25 0c.621 0 1.125.504 1.125 1.125M20.625 4.5h-1.5C18.504 4.5 18 5.004 18 5.625m3.75 0v1.5c0 .621-.504 1.125-1.125 1.125M3.375 4.5c-.621 0-1.125.504-1.125 1.125M3.375 4.5h1.5C5.496 4.5 6 5.004 6 5.625m-3.75 0v1.5c0 .621.504 1.125 1.125 1.125m0 0h1.5m-1.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m1.5-3.75C5.496 8.25 6 7.746 6 7.125v-1.5M4.875 8.25C5.496 8.25 6 8.754 6 9.375v1.5m0-5.25v5.25m0-5.25C6 5.004 6.504 4.5 7.125 4.5h9.75c.621 0 1.125.504 1.125 1.125m1.125 2.625h1.5m-1.5 0A1.125 1.125 0 0118 7.125v-1.5m1.125 2.625c-.621 0-1.125.504-1.125 1.125v1.5m2.625-2.625c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125M18 5.625v5.25M7.125 12h9.75m-9.75 0A1.125 1.125 0 016 10.875M7.125 12C6.504 12 6 12.504 6 13.125m0-2.25C6 11.496 5.496 12 4.875 12M18 10.875c0 .621-.504 1.125-1.125 1.125M18 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m-12 5.25v-5.25m0 5.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125m-12 0v-1.5c0-.621-.504-1.125-1.125-1.125M18 18.375v-5.25m0 5.25v-1.5c0-.621.504-1.125 1.125-1.125M18 13.125v1.5c0 .621.504 1.125 1.125 1.125M18 13.125c0-.621.504-1.125 1.125-1.125M6 13.125v1.5c0 .621-.504 1.125-1.125 1.125M6 13.125C6 12.504 5.496 12 4.875 12m-1.5 0h1.5m-1.5 0c-.621 0-1.125-.504-1.125-1.125v-1.5c0-.621.504-1.125 1.125-1.125m1.5 3.75c-.621 0-1.125-.504-1.125-1.125v-1.5c0-.621.504-1.125 1.125-1.125" />
                        </svg>
                      </div>
                      <div className="text-left">
                        <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide !mb-0">SYNCED FINAL VIDEO</p>
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white">Burmese Voice + Original Footage (Timeline Synced)</h4>
                      </div>
                    </div>
                    <video src={mergedVideoUrl} controls className="w-full rounded-lg border border-gray-200 dark:border-white/10" />
                    <div className="flex gap-3">
                      <a
                        href={mergedVideoUrl}
                        download="myanmar_recap_final.mp4"
                        className="flex-1 py-2 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-center text-xs font-bold uppercase tracking-wide transition-all"
                      >
                        Download Final Video (.MP4)
                      </a>
                    </div>
                    <p className="text-[10px] text-slate-500 dark:text-zinc-400">မူရင်းအသံ ဖယ်ချားပြီး မြန်မာ voiceover ချိန်ညှိထည့်ထားသည်။ ရှည်နေလျှင် voiceover ကို speed-pitch preserve ဖြင့် ဗီဒီယို timeline နဲ့ auto ကိုက်ညှိထားသည်။</p>
                  </div>
                ) : mergeError ? (
                  <div className="p-3 rounded-lg border border-rose-200 dark:border-rose-500/20 bg-rose-50 dark:bg-rose-500/10">
                    <p className="text-xs text-rose-500">{mergeError}</p>
                    <p className="text-[10px] text-slate-500 dark:text-zinc-400 mt-1">Audio (.WAV) ကို download ရယူပြီး CapCut/Filmora တွင် manual sync လုပ်နိုင်သည်။</p>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="p-4 text-center text-slate-500 dark:text-zinc-400">
                No voice generated yet. Click below to begin voice production.
              </div>
            )}

            <div className="bg-gray-50 dark:bg-white/5 p-3 border border-gray-200 dark:border-white/10 rounded-xl space-y-1">
              <h4 className="text-[10px] font-bold text-slate-400 dark:text-zinc-400 uppercase tracking-wide !mb-0">Translation Reference</h4>
              <p className="text-xs text-slate-600 dark:text-zinc-300 line-clamp-3 leading-relaxed font-sans">{translation}</p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setCurrentStep('TRANSLATION')}
                className="flex-1 py-2 px-3 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 border border-gray-200 dark:border-white/10 text-slate-600 dark:text-zinc-300 rounded-lg uppercase tracking-wide transition-all text-xs font-bold"
              >
                Back To Translation
              </button>
              <button
                onClick={handleReset}
                className="flex-1 py-2 px-3 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 border border-gray-200 dark:border-white/10 text-slate-600 dark:text-zinc-300 rounded-lg uppercase tracking-wide transition-all text-xs font-bold"
              >
                Reset Pipeline
              </button>
            </div>
          </div>
        )}

        {/* ===================== BATCH PROCESSING ===================== */}
        <div className="mt-4 p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#0c0c0e] border border-gray-200 dark:border-white/10">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-zinc-100 flex items-center gap-2">
              <svg className="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
              Batch Queue — ဗီဒီယိုအများကြီး တစ်ခါတည့်
            </h3>
            {batchItems.filter(i => i.status === 'done').length > 0 && (
              <button onClick={handleClearDoneBatchItems} className="text-[10px] font-bold text-slate-500 hover:text-accent uppercase tracking-wide">Clear done</button>
            )}
          </div>
          <div className="flex flex-col sm:flex-row gap-2 mb-3">
            <button
              onClick={handleAddToBatch}
              disabled={isBatchRunning}
              className="flex-1 py-2 px-3 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 border border-gray-200 dark:border-white/10 text-slate-600 dark:text-zinc-200 rounded-lg text-xs font-bold uppercase tracking-wide transition-all disabled:opacity-40"
            >
              + Queue ထဲ ထည့်မယ့် (ယခု config ဖြင့်)
            </button>
            <button
              onClick={handleProcessBatch}
              disabled={isBatchRunning || batchItems.filter(i => i.status === 'queued').length === 0}
              className="flex-1 py-2 px-3 bg-accent hover:bg-accent-hover text-white rounded-lg text-xs font-bold uppercase tracking-wide transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isBatchRunning ? `Processing... (${batchItems.filter(i => i.status === 'processing').length}/${batchItems.length})` : `Process ${batchItems.filter(i => i.status === 'queued').length} Items`}
            </button>
          </div>
          {batchItems.length > 0 ? (
            <div className="space-y-2 max-h-52 overflow-y-auto">
              {batchItems.map(item => (
                <div key={item.id} className="flex items-center gap-3 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    item.status === 'done' ? 'bg-emerald-500' : item.status === 'processing' ? 'bg-accent animate-pulse' : item.status === 'failed' ? 'bg-rose-500' : 'bg-gray-400'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-800 dark:text-zinc-100 truncate">{item.name}</p>
                    <p className="text-[10px] text-slate-500 dark:text-zinc-400">Voice: {item.voice} • {item.status === 'failed' && item.error ? `error: ${item.error}` : item.status}</p>
                  </div>
                  {!isBatchRunning && item.status === 'queued' && (
                    <button onClick={() => handleRemoveBatchItem(item.id)} className="text-[10px] text-slate-500 hover:text-rose-500 font-bold uppercase">Remove</button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500 dark:text-zinc-400 text-center py-2">Queue ထဲ item မရှိသေးပါ — ဗီဒီယိုတင်ပြီး config ချိန်ပြီး "Queue ထဲ ထည့်မယ့်" နှိပ်ပါ။</p>
          )}
          {batchLog && (
            <pre className="mt-3 text-[10px] text-slate-600 dark:text-zinc-300 bg-gray-100 dark:bg-white/5 rounded-lg p-3 max-h-36 overflow-y-auto font-mono whitespace-pre-wrap">{batchLog}</pre>
          )}
          <p className="text-[10px] text-slate-500 dark:text-zinc-400 mt-2 leading-relaxed">
            Batch က ဗီဒီယိုတိုင်းကို transcription → translate → voiceover → timeline sync အပြည့် ဖြတ်ပေးပါတယ်။ Queue က browser ထဲ local သာသိမ်းပြီး server cost လုံးဝမကုန်ပါ။ Video file တွေက session ထဲမှာသာရတဲ့အတွက် ဗီဒီယိုတင်ပြီးမှ Process ခေါ်ပါ။
          </p>
        </div>
        <RecentHistory
          moduleName={['videostudio_transcribe', 'videostudio_translate', 'videostudio_voiceover']}
          onRestore={handleRestoreVideoStudio}
        />
        <div className="mt-4" />
        <ModuleLogHistory
          moduleName={['videostudio_transcribe', 'videostudio_translate', 'videostudio_voiceover']}
          refreshTrigger={refreshTrigger}
        />
      </div>
    </div>
  );
};

export default VideoStudio;
