
import React, { useState, useEffect } from 'react';
import { generateText } from '../services/geminiService';
import { CREDIT_COSTS, ContentType } from '../types';

interface TranslationProps {
  onSpendCredits: (amount: number) => boolean;
}

const Translation: React.FC<TranslationProps> = ({ onSpendCredits }) => {
  const [sourceText, setSourceText] = useState('');
  const [targetLang, setTargetLang] = useState('BURMESE');
  
  const [includeDeepMeaning, setIncludeDeepMeaning] = useState(false);
  const [includeHooks, setIncludeHooks] = useState(false);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isChecked, setIsChecked] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  const MAX_CHARS = 30000;

  useEffect(() => {
    if (copySuccess) {
      const timer = setTimeout(() => setCopySuccess(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [copySuccess]);

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setSourceText(text.slice(0, MAX_CHARS));
      setIsChecked(false);
      setTranslatedText(null);
    } catch (err) {
      setError("Clipboard access denied. Please paste manually.");
    }
  };

  const handleClear = () => {
    setSourceText('');
    setTranslatedText(null);
    setIsChecked(false);
    setError(null);
  };

  const handleCheck = () => {
    if (!sourceText.trim()) {
      setError("Please enter your content first.");
      return;
    }
    setIsChecked(true);
    setError(null);
  };

  const handleCopy = () => {
    if (translatedText) {
      navigator.clipboard.writeText(translatedText);
      setCopySuccess(true);
    }
  };

  const handleTranslate = async () => {
    if (!sourceText.trim()) {
      setError("Source text is missing.");
      return;
    }
    setError(null);

    if (!onSpendCredits(CREDIT_COSTS[ContentType.TRANSLATION])) {
      setError("Insufficient credits! Please top up.");
      return;
    }

    setIsProcessing(true);
    try {
      const features = ["PURE_TRANSLATION"];
      if (includeDeepMeaning) features.push("DEEP_INSIGHTS");
      if (includeHooks) features.push("THUMBNAIL_HOOKS");

      const systemInstruction = `You are a world-class linguist and localization expert for ${targetLang}.
      STRICT OUTPUT FORMAT:
      - ONLY respond using the requested section headers: [PURE TRANSLATION SCRIPT], [DEEP INSIGHTS], [THUMBNAIL HOOKS].
      - DO NOT include ANY preamble, introductions, or explanations before the first tag.
      - DO NOT use bolding like ### or ** for the headers, just the square brackets.
      - Always ensure the translation is natural and culturally appropriate.`;
      
      const prompt = `FEATURES:
1. PURE_TRANSLATION (always required)
2. DEEP_INSIGHTS (optional)
3. THUMBNAIL_HOOKS (optional)

INPUT FORMAT:
Selected_Features: [${features.join(', ')}]
Text: ${sourceText}

Translate the text into ${targetLang} following the order:
1. [PURE TRANSLATION SCRIPT]
2. [DEEP INSIGHTS] (only if selected)
3. [THUMBNAIL HOOKS] (only if selected)`;

      const result = await generateText(prompt, systemInstruction);
      setTranslatedText(result);

    } catch (err: any) {
      setError(err.message || "Something went wrong during translation.");
    } finally {
      setIsProcessing(false);
    }
  };

  const renderResult = () => {
    if (!translatedText) return null;

    const rawParts = translatedText.split(/(\[.*?\])/g).filter(p => p.trim());
    const firstTagIndex = rawParts.findIndex(p => p.startsWith('[') && p.endsWith(']'));
    
    if (firstTagIndex === -1) {
      return <div className="text-sm text-slate-700 dark:text-zinc-200 leading-relaxed whitespace-pre-wrap font-medium">{translatedText}</div>;
    }

    const parts = rawParts.slice(firstTagIndex);
    const renderedSections = [];
    
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].startsWith('[') && parts[i].endsWith(']')) {
        const title = parts[i].replace(/[\[\]]/g, '');
        const content = parts[i+1];
        if (content) {
          renderedSections.push(
            <div key={title} className="mb-8 last:mb-0 animate-in slide-in-from-bottom-2 duration-500">
              <div className="flex items-center gap-3 mb-3">
                <span className="px-2 py-1 bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 rounded-lg text-[9px] font-black uppercase tracking-[0.15em] border border-indigo-500/20">
                  {title}
                </span>
                <div className="h-px flex-1 bg-slate-200 dark:bg-white/5"></div>
              </div>
              <div className="text-sm text-slate-700 dark:text-gray-200 leading-[1.8] whitespace-pre-wrap font-bold pl-4 border-l-2 border-indigo-500/20">
                {content.trim()}
              </div>
            </div>
          );
        }
        i++;
      }
    }
    return renderedSections;
  };

  return (
    <div className="max-w-4xl mx-auto pb-6">
      
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-accent rounded-xl flex items-center justify-center shadow-lg shadow-accent/20">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.516a3.303 3.303 0 01-3.352-3.352c0-1.85 1.502-3.352 3.352-3.352s3.352 1.502 3.352 3.352-1.502 3.352-3.352 3.352z" />
          </svg>
        </div>
        <div>
          <h1 className="movie-h2 !text-xl !mb-0 uppercase tracking-tighter">Localization Engine</h1>
          <p className="movie-meta !text-[10px] !mb-0 uppercase tracking-widest text-zinc-500">Global Master Synchronization • {CREDIT_COSTS[ContentType.TRANSLATION]} Credits</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 space-y-4">
          <div className="glass p-6 rounded-2xl border border-white/5 space-y-4 shadow-xl">
            <div className="flex justify-between items-center">
              <label className="block movie-meta !text-[10px] uppercase tracking-[0.2em] !mb-0">Source Master Script</label>
              <div className="flex gap-4 px-1">
                <button onClick={handlePaste} className="movie-meta !text-[10px] uppercase tracking-widest text-accent hover:text-accent-hover transition-colors !mb-0">Paste</button>
                <button onClick={handleClear} className="movie-meta !text-[10px] uppercase tracking-widest text-rose-500 hover:text-rose-400 transition-colors !mb-0">Clear</button>
              </div>
            </div>

            <textarea
              value={sourceText}
              onChange={(e) => {
                setSourceText(e.target.value.slice(0, MAX_CHARS));
                setIsChecked(false);
              }}
              placeholder="Paste master script for professional localization..."
              className="w-full h-64 bg-slate-50 dark:bg-black/30 border border-slate-200 dark:border-white/10 rounded-2xl p-6 movie-body !text-[14px] text-slate-900 dark:text-white focus:ring-2 focus:ring-accent outline-none transition-all resize-none leading-relaxed"
            />

            <div className="flex justify-between items-center px-2 pt-2">
              <span className="movie-meta !text-[10px] uppercase tracking-widest text-zinc-500 !mb-0">{sourceText.length.toLocaleString()} Chars Buffer</span>
              <div className="flex items-center gap-2">
                 <div className="w-2 h-2 bg-accent rounded-full animate-pulse shadow-[0_0_8px_rgba(225,29,72,0.4)]"></div>
                 <span className="movie-meta !text-[10px] uppercase tracking-widest text-zinc-500 !mb-0">System Ready</span>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-5 space-y-4">
          <div className="glass p-6 rounded-2xl border border-white/5 space-y-6 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-accent/5 rounded-full blur-3xl pointer-events-none"></div>
            <div>
              <label className="block movie-meta !text-[10px] uppercase tracking-[0.2em] !mb-3 px-1">Target Localization</label>
              <select
                value={targetLang}
                onChange={(e) => setTargetLang(e.target.value)}
                className="w-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 movie-meta !text-[11px] uppercase tracking-widest outline-none focus:ring-2 focus:ring-accent transition-all cursor-pointer shadow-inner !mb-0"
              >
                <option value="BURMESE">Burmese (Myanmar)</option>
                <option value="ENGLISH">English (US/UK)</option>
                <option value="THAI">Thai (Siam)</option>
                <option value="CHINESE">Chinese (Mandarin)</option>
                <option value="JAPANESE">Japanese (Nihongo)</option>
                <option value="KOREAN">Korean (K-Pop Style)</option>
              </select>
            </div>

            <div className="space-y-3">
              <label className="block movie-meta !text-[10px] uppercase tracking-[0.2em] px-1 !mb-1">Production Modules</label>
              <div className="flex items-center gap-4 p-3 rounded-xl border border-accent/20 bg-accent/5">
                <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center text-white shadow-lg shadow-accent/20">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                </div>
                <div className="flex-1">
                  <h4 className="movie-h2 !text-xs !mb-0 uppercase tracking-widest">Master Script</h4>
                  <p className="movie-meta !text-[9px] text-accent uppercase tracking-widest !mb-0">Essential Localization</p>
                </div>
              </div>

              <button
                onClick={() => setIncludeDeepMeaning(!includeDeepMeaning)}
                className={`w-full flex items-center gap-4 p-3 rounded-xl border transition-all text-left group ${includeDeepMeaning ? 'bg-accent border-accent text-white shadow-xl shadow-accent/20' : 'bg-white/5 border-white/5 text-zinc-500 hover:border-accent/40'}`}
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${includeDeepMeaning ? 'bg-white/10' : 'bg-white/5 group-hover:scale-105'}`}>
                  {includeDeepMeaning ? <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg> : <div className="w-2 h-2 bg-white/10 rounded-full"></div>}
                </div>
                <div className="flex-1">
                  <h4 className="movie-h2 !text-xs !mb-0 uppercase tracking-widest">Deep Meaning</h4>
                  <p className={`movie-meta !text-[9px] uppercase tracking-widest !mb-0 ${includeDeepMeaning ? 'text-zinc-200' : 'text-zinc-600'}`}>Neural Cultural Insights</p>
                </div>
              </button>

              <button
                onClick={() => setIncludeHooks(!includeHooks)}
                className={`w-full flex items-center gap-4 p-3 rounded-xl border transition-all text-left group ${includeHooks ? 'bg-accent border-accent text-white shadow-xl shadow-accent/20' : 'bg-white/5 border-white/5 text-zinc-500 hover:border-accent/40'}`}
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${includeHooks ? 'bg-white/10' : 'bg-white/5 group-hover:scale-105'}`}>
                  {includeHooks ? <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg> : <div className="w-2 h-2 bg-white/10 rounded-full"></div>}
                </div>
                <div className="flex-1">
                  <h4 className="movie-h2 !text-xs !mb-0 uppercase tracking-widest">Viral Hooks</h4>
                  <p className={`movie-meta !text-[9px] uppercase tracking-widest !mb-0 ${includeHooks ? 'text-zinc-200' : 'text-zinc-600'}`}>CTR Optimized Titles</p>
                </div>
              </button>
            </div>

            {!isChecked ? (
              <button onClick={handleCheck} className="w-full py-4 rounded-xl bg-midnight text-white border border-white/10 hover:bg-zinc-800 movie-meta !text-[12px] uppercase tracking-[0.25em] shadow-2xl transition-all active:scale-[0.98]">Lock Synthesis Protocol</button>
            ) : (
              <button onClick={handleTranslate} disabled={isProcessing} className={`w-full py-4 rounded-xl movie-meta !text-[12px] uppercase tracking-[0.25em] transition-all shadow-2xl ${isProcessing ? 'bg-white/5 text-zinc-600' : 'bg-accent hover:bg-accent-hover text-white shadow-accent/20'}`}>{isProcessing ? 'Decoding Neural Net...' : `Execute Studio Master`}</button>
            )}
          </div>
        </div>
      </div>

      {translatedText && !isProcessing && (
        <div className="mt-8 animate-in zoom-in-95 duration-500">
          <div className="glass rounded-[2.5rem] p-8 border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)] relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 flex gap-4">
                 <button onClick={handleCopy} className={`flex items-center gap-3 px-6 py-2.5 rounded-xl transition-all movie-meta !text-[10px] uppercase tracking-widest shadow-xl !mb-0 ${copySuccess ? 'bg-emerald-600 text-white' : 'bg-accent text-white hover:bg-accent-hover active:scale-95'}`}>
                    {copySuccess ? 'Copied Master' : 'Copy All Data'}
                 </button>
            </div>
            <div className="mb-8">
               <h3 className="movie-h2 !text-xl !mb-1 uppercase tracking-tighter">Synthesis Complete</h3>
               <p className="movie-meta !text-[10px] uppercase tracking-[0.4em] text-zinc-500 !mb-0">Broadcast Grade Output Verified</p>
            </div>
            <div className="space-y-4">
              {renderResult()}
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-rose-600 text-white px-10 py-5 rounded-3xl font-black text-xs shadow-2xl z-50 animate-in slide-in-from-bottom-10 uppercase tracking-widest border border-white/20">
          Critical Synthesis Error: {error}
        </div>
      )}
    </div>
  );
};

export default Translation;
