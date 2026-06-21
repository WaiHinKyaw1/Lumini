import React, { useState, useRef } from 'react';
import { generateSubtitles, generateText, generateSpeech } from '../services/geminiService';
import { CREDIT_COSTS, ContentType } from '../types';
import { Toaster, toast } from 'react-hot-toast';
import { auth } from '../services/firebase';
import { logGeneration } from '../services/supabase';
import { ModuleLogHistory } from '../components/ModuleLogHistory';


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
  
  // Loading & Progress States
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [progress, setProgress] = useState<number>(0);
  
  // Configuration Settings
  const [tone, setTone] = useState<string>('thrilling');
  const [voice, setVoice] = useState<string>('Kore');
  const [speed, setSpeed] = useState<number>(1.0); // virtual rate control for prompt context
  
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        setDuration(Math.floor((media as any).duration || 0));
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
        setRefreshTrigger(prev => prev + 1);
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Transcription failed.');
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
        setRefreshTrigger(prev => prev + 1);
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Translation failed.');
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
      if (currentUser) {
        await logGeneration(
          currentUser.uid,
          currentUser.email || '',
          'videostudio_voiceover',
          { voice, speed, translationLength: translation.length },
          { status: 'success', info: 'Voiceover audio generated successfully' }
        );
        setRefreshTrigger(prev => prev + 1);
      }
    } catch (err: any) {
      console.error(err);
      let userMsg = err.message || 'Voiceover generation failed.';
      try {
        const msg = err.message || "";
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
    setDuration(0);
    setCurrentStep('SOURCE');
    setProgress(0);
  };

  return (
    <div className="max-w-3xl mx-auto pb-12 px-4 transition-all duration-300">
      <Toaster position="top-right" />
      
      {/* Page Title */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-12 h-12 bg-orange-500 rounded-2xl flex items-center justify-center shadow-lg shadow-orange-500/20">
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </div>
        <div>
          <h1 className="movie-h2 !text-2xl !mb-0 uppercase tracking-tighter">Video Recap Studio</h1>
          <p className="movie-meta !text-[10px] !mb-0 uppercase tracking-widest text-zinc-500">Pipeline transcription • translation • Myanmar Voiceover</p>
        </div>
      </div>

      {/* Stepper Display ("ဘယ်အဆင့် ရောက်နေပီလဲ ပြရမယ်") */}
      <div className="glass p-5 rounded-2xl border border-white/5 mb-6 shadow-xl">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 md:gap-2">
          
          {/* Step 1 */}
          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-mono text-sm font-black transition-colors ${
              currentStep === 'SOURCE' 
                ? 'bg-orange-500 text-white' 
                : 'bg-white/10 text-zinc-400'
            }`}>
              1
            </div>
            <div className="text-left">
              <p className="movie-meta !text-[9px] uppercase tracking-widest !mb-0 text-zinc-500">Phase 01</p>
              <h3 className={`text-xs font-bold uppercase tracking-wider ${currentStep === 'SOURCE' ? 'text-orange-500' : 'text-zinc-400'}`}>SOURCE INPUT</h3>
            </div>
          </div>

          <div className="hidden md:block h-px flex-1 bg-white/10 mx-4"></div>

          {/* Step 2 */}
          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-mono text-sm font-black transition-colors ${
              currentStep === 'TRANSCRIPTION' 
                ? 'bg-orange-500 text-white animate-pulse' 
                : transcript 
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                : 'bg-white/10 text-zinc-400'
            }`}>
              2
            </div>
            <div className="text-left">
              <p className="movie-meta !text-[9px] uppercase tracking-widest !mb-0 text-zinc-500">Phase 02</p>
              <h3 className={`text-xs font-bold uppercase tracking-wider ${currentStep === 'TRANSCRIPTION' ? 'text-orange-500' : transcript ? 'text-emerald-400' : 'text-zinc-400'}`}>TRANSCRIPTION</h3>
            </div>
          </div>

          <div className="hidden md:block h-px flex-1 bg-white/10 mx-4"></div>

          {/* Step 3 */}
          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-mono text-sm font-black transition-colors ${
              currentStep === 'TRANSLATION' 
                ? 'bg-orange-500 text-white animate-pulse' 
                : translation 
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                : 'bg-white/10 text-zinc-400'
            }`}>
              3
            </div>
            <div className="text-left">
              <p className="movie-meta !text-[9px] uppercase tracking-widest !mb-0 text-zinc-500">Phase 03</p>
              <h3 className={`text-xs font-bold uppercase tracking-wider ${currentStep === 'TRANSLATION' ? 'text-orange-500' : translation ? 'text-emerald-400' : 'text-zinc-400'}`}>RECAP TRANSLATION</h3>
            </div>
          </div>

          <div className="hidden md:block h-px flex-1 bg-white/10 mx-4"></div>

          {/* Step 4 */}
          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-mono text-sm font-black transition-colors ${
              currentStep === 'VOICEOVER' 
                ? 'bg-orange-500 text-white' 
                : audioUrl 
                ? 'bg-emerald-500 text-white font-bold' 
                : 'bg-white/10 text-zinc-400'
            }`}>
              4
            </div>
            <div className="text-left">
              <p className="movie-meta !text-[9px] uppercase tracking-widest !mb-0 text-zinc-500">Phase 04</p>
              <h3 className={`text-xs font-bold uppercase tracking-wider ${currentStep === 'VOICEOVER' ? 'text-orange-500' : audioUrl ? 'text-emerald-400' : 'text-zinc-400'}`}>MYANMAR VOICE</h3>
            </div>
          </div>

        </div>
      </div>

      {/* Main Form container */}
      <div className="glass p-6 md:p-8 rounded-2xl border border-white/5 shadow-2xl relative">
        
        {/* Loading Overlay */}
        {isProcessing && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-50 rounded-2xl flex flex-col items-center justify-center p-8 transition-opacity duration-300">
            <div className="w-16 h-16 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-6"></div>
            <p className="movie-meta !text-[12px] text-orange-400 font-bold uppercase tracking-[0.2em] mb-3 animate-pulse">{statusMessage}</p>
            <div className="w-64 bg-white/10 h-1.5 rounded-full overflow-hidden">
              <div 
                className="bg-orange-500 h-full shadow-[0_0_8px_rgba(249,115,22,0.6)] transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="movie-meta !text-[10px] text-zinc-500 mt-2">{progress}% completed</p>
          </div>
        )}

        {/* STEP 1 UI: SOURCE INPUT */}
        {currentStep === 'SOURCE' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            
            {/* Input Mode Selector */}
            <div className="flex bg-black/40 p-1.5 rounded-xl border border-white/5">
              <button
                type="button"
                onClick={() => setInputMode('UPLOAD')}
                className={`flex-1 py-2.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${
                  inputMode === 'UPLOAD' ? 'bg-orange-500 text-white shadow' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Upload Video/Audio
              </button>
              <button
                type="button"
                onClick={() => setInputMode('PASTE')}
                className={`flex-1 py-2.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${
                  inputMode === 'PASTE' ? 'bg-orange-500 text-white shadow' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Or Paste Transcript
              </button>
            </div>

            {inputMode === 'UPLOAD' ? (
              <div className="space-y-4">
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                    file ? 'border-orange-500 bg-orange-500/5' : 'border-white/10 hover:border-orange-500/50 hover:bg-white/5'
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
                      <div className="w-12 h-12 bg-orange-500/20 rounded-xl flex items-center justify-center mx-auto text-orange-500">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <p className="movie-body !text-sm font-bold text-white truncate max-w-sm mx-auto !mb-0">{file.name}</p>
                      <p className="movie-meta !text-[10px] text-zinc-500 font-mono !mb-0">
                        Estimated duration: <span className="text-white font-bold">{duration || 'Calculating...'}s</span>
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center mx-auto text-zinc-400 group-hover:scale-110 transition-all">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                      </div>
                      <p className="movie-meta !text-[11px] uppercase tracking-[0.25em] text-zinc-400 !mb-0">Select Video/Audio file</p>
                      <p className="movie-meta !text-[9px] text-zinc-600 uppercase tracking-widest !mb-0">supports MP4, MOV, MKV, MP3, WAV</p>
                    </div>
                  )}
                </div>
                
                <p className="text-[10px] text-orange-500/80 bg-orange-500/5 border border-orange-500/10 p-3 rounded-lg leading-relaxed">
                  💡 <strong>Tip for Mobile/No OOM:</strong> For files larger than 40MB, try converting to audio format or pasting the script directly via the text tab for near-instant processing.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <label className="movie-meta !text-[10px] uppercase tracking-[0.3em] text-zinc-500">Paste Script / Subtitles</label>
                <textarea
                  value={pastedTranscript}
                  onChange={(e) => setPastedTranscript(e.target.value)}
                  placeholder="Paste your original source translation text or dialogue here..."
                  className="w-full bg-black/20 border border-white/10 rounded-xl p-4 text-sm text-white focus:ring-2 focus:ring-orange-500 outline-none h-44 font-mono leading-relaxed"
                />
                
                <div className="space-y-2">
                  <label className="movie-meta !text-[10px] uppercase tracking-[0.3em] text-zinc-500 block">Original Timestamps Duration (Optional)</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min="0"
                      value={duration}
                      onChange={(e) => setDuration(Math.max(0, parseInt(e.target.value) || 0))}
                      className="bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white uppercase focus:ring-2 focus:ring-orange-500 outline-none w-28"
                    />
                    <span className="movie-meta !text-[10px] text-zinc-500 uppercase tracking-widest !mb-0">Seconds total (needed to sync Myanmar speech timing)</span>
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={startTranscription}
              className="w-full py-4 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold uppercase tracking-widest shadow-lg shadow-orange-500/25 transition-all text-xs"
            >
              Analyze & Extract Script
            </button>
          </div>
        )}

        {/* STEP 2 UI: EXTRACED TRANSCRIPTION */}
        {currentStep === 'TRANSCRIPTION' && !isProcessing && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div>
              <span className="movie-meta !text-[10px] text-orange-500 uppercase tracking-[0.3em] !mb-0">Pipeline Output - 01</span>
              <h3 className="text-lg font-bold text-white uppercase tracking-tight">Transcription Script</h3>
            </div>

            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              className="w-full bg-black/20 border border-white/10 rounded-xl p-4 text-sm text-white focus:ring-2 focus:ring-orange-500 outline-none h-56 font-mono leading-relaxed"
            />

            <div className="space-y-3">
              <label className="movie-meta !text-[10px] uppercase tracking-[0.3em] text-zinc-500">Narration Recap tone</label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {['thrilling', 'sarcastic', 'emotional', 'mystery'].map((t) => (
                  <button
                    key={t}
                    onClick={() => setTone(t)}
                    type="button"
                    className={`py-2.5 rounded-xl text-[10px] uppercase tracking-widest border transition-all font-bold ${
                      tone === t 
                        ? 'bg-orange-500 border-orange-500 text-white shadow' 
                        : 'bg-transparent border-white/5 text-zinc-400 hover:bg-white/5'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-3">
              <button
                onClick={() => setCurrentStep('SOURCE')}
                className="flex-1 py-3 bg-white/5 hover:bg-white/10 border border-white/5 text-zinc-400 rounded-xl uppercase tracking-widest transition-all text-xs font-bold"
              >
                Back To Source
              </button>
              <button
                onClick={startTranslation}
                className="flex-[2] py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl uppercase tracking-widest transition-all text-xs font-bold shadow-lg shadow-orange-500/20"
              >
                Translate to Burmese (5 CR)
              </button>
            </div>
          </div>
        )}

        {/* STEP 3 UI: RECAP TRANSLATION */}
        {currentStep === 'TRANSLATION' && !isProcessing && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div>
              <span className="movie-meta !text-[10px] text-orange-500 uppercase tracking-[0.3em] !mb-0">Pipeline Output - 02</span>
              <h3 className="text-lg font-bold text-white uppercase tracking-tight">Burmese Recap script (Burmese Unicode)</h3>
            </div>

            <textarea
              value={translation}
              onChange={(e) => setTranslation(e.target.value)}
              className="w-full bg-black/20 border border-white/10 rounded-xl p-4 text-sm text-white focus:ring-2 focus:ring-orange-500 outline-none h-56 font-sans leading-relaxed"
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-black/40 p-4 border border-white/5 rounded-xl">
              <div className="space-y-2">
                <label className="movie-meta !text-[10px] uppercase tracking-[0.3em] text-zinc-500">Burmese Speaker Voice</label>
                <select
                  value={voice}
                  onChange={(e) => setVoice(e.target.value)}
                  className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white uppercase tracking-widest outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="Kore">Kore (Energetic Recapper)</option>
                  <option value="Fenrir">Fenrir (Mysterious Narrator)</option>
                  <option value="Zephyr">Zephyr (Cheerful Vibe)</option>
                  <option value="Puck">Puck (Fast Paced)</option>
                  <option value="Charon">Charon (Deep Storyteller)</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="movie-meta !text-[10px] uppercase tracking-[0.3em] text-zinc-500 flex justify-between">
                  <span>Speech Rate Adaptor</span>
                  <span className="text-white font-mono">{speed}x</span>
                </label>
                <input
                  type="range"
                  min="0.75"
                  max="1.5"
                  step="0.05"
                  value={speed}
                  onChange={(e) => setSpeed(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-orange-500"
                />
                <p className="text-[9px] text-zinc-500 uppercase tracking-wider">Matches Burma vocal pacing exactly to the original {duration}s.</p>
              </div>
            </div>

            <div className="flex gap-3 pt-3">
              <button
                onClick={() => {
                  if (inputMode === 'PASTE') {
                    setCurrentStep('SOURCE');
                  } else {
                    setCurrentStep('TRANSCRIPTION');
                  }
                }}
                className="flex-1 py-3 bg-white/5 hover:bg-white/10 border border-white/5 text-zinc-400 rounded-xl uppercase tracking-widest transition-all text-xs font-bold"
              >
                Back To Script
              </button>
              <button
                onClick={startVoiceover}
                className="flex-[2] py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl uppercase tracking-widest transition-all text-xs font-bold shadow-lg shadow-orange-500/20"
              >
                Synthesize Voice (10 CR)
              </button>
            </div>
          </div>
        )}

        {/* STEP 4 UI: MYANMAR VOICE */}
        {currentStep === 'VOICEOVER' && !isProcessing && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div>
              <span className="movie-meta !text-[10px] text-orange-500 uppercase tracking-[0.3em] !mb-0">Pipeline Completed</span>
              <h3 className="text-lg font-bold text-white uppercase tracking-tight">Myanmar voice-over output</h3>
            </div>

            {audioUrl ? (
              <div className="glass p-6 rounded-xl border border-emerald-500/10 space-y-4 bg-emerald-500/5 shadow-inner">
                <div className="flex items-center gap-4">
                  <div className="p-3.5 bg-emerald-500 text-white rounded-xl shadow-lg shadow-emerald-500/20">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
                    </svg>
                  </div>
                  <div className="text-left">
                    <p className="movie-meta !text-[10px] text-emerald-400 uppercase tracking-widest !mb-0 font-bold">STEREOPHONIC WAVE DEPLOYED</p>
                    <h4 className="text-sm font-bold text-white">Gemini 3.1-TTS Voiceover Output</h4>
                  </div>
                </div>

                <audio src={audioUrl} controls className="w-full accent-emerald-500" />
                
                <div className="flex gap-3">
                  <a
                    href={audioUrl}
                    download="myanmar_recap_voiceover.wav"
                    className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-center text-xs font-bold uppercase tracking-widest transition-all shadow-md shadow-emerald-600/10"
                  >
                    Download Audio (.WAV)
                  </a>
                </div>
              </div>
            ) : (
              <div className="p-6 text-center text-zinc-500">
                No voice generated yet. Click below to begin voice production.
              </div>
            )}

            <div className="bg-black/20 p-4 border border-white/5 rounded-xl space-y-2">
              <h4 className="movie-meta !text-[9px] text-zinc-500 uppercase tracking-widest !mb-0">Translation Reference</h4>
              <p className="text-xs text-zinc-300 line-clamp-3 leading-relaxed font-sans">{translation}</p>
            </div>

            <div className="flex gap-3 pt-3">
              <button
                onClick={() => setCurrentStep('TRANSLATION')}
                className="flex-1 py-3 bg-white/5 hover:bg-white/10 border border-white/5 text-zinc-400 rounded-xl uppercase tracking-widest transition-all text-xs font-bold"
              >
                Back To Translation
              </button>
              <button
                onClick={handleReset}
                className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl uppercase tracking-widest transition-all text-xs font-bold"
              >
                Reset Pipeline
              </button>
            </div>
          </div>
        )}

        <ModuleLogHistory 
          moduleName={['videostudio_transcribe', 'videostudio_translate', 'videostudio_voiceover']} 
          refreshTrigger={refreshTrigger} 
        />
      </div>
    </div>
  );
};

export default VideoStudio;
