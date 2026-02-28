
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
      
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-600/20">
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.516a3.303 3.303 0 01-3.352-3.352c0-1.85 1.502-3.352 3.352-3.352s3.352 1.502 3.352 3.352-1.502 3.352-3.352 3.352z" />
          </svg>
        </div>
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white uppercase tracking-tighter">Localization Engine</h1>
          <p className="text-slate-500 dark:text-zinc-400 text-[9px] font-black uppercase tracking-widest">Global Master Synchronization • {CREDIT_COSTS[ContentType.TRANSLATION]} Credits</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        <div className="lg:col-span-7 space-y-2">
          <div className="glass p-3 rounded-xl border border-white/5 space-y-2 shadow-xl">
            <div className="flex justify-between items-center">
              <label className="block text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-zinc-500">Source Master Script</label>
              <div className="flex gap-4 px-1">
                <button onClick={handlePaste} className="text-[8px] font-black text-indigo-500 dark:text-indigo-400 uppercase tracking-[0.2em] hover:opacity-70 transition-opacity">Paste</button>
                <button onClick={handleClear} className="text-[8px] font-black text-rose-500 uppercase tracking-[0.2em] hover:opacity-70 transition-opacity">Clear</button>
              </div>
            </div>

            <textarea
              value={sourceText}
              onChange={(e) => {
                setSourceText(e.target.value.slice(0, MAX_CHARS));
                setIsChecked(false);
              }}
              placeholder="Paste master script for professional localization..."
              className="w-full h-48 bg-slate-50 dark:bg-black/30 border border-slate-200 dark:border-white/10 rounded-[1.5rem] p-4 text-[13px] text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all resize-none font-medium leading-[1.8]"
            />

            <div className="flex justify-between items-center px-2 pt-1">
              <span className="text-[9px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-widest">{sourceText.length.toLocaleString()} Chars Buffer</span>
              <div className="flex items-center gap-2">
                 <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse"></div>
                 <span className="text-[9px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-widest">System Ready</span>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-5 space-y-3">
          <div className="glass p-4 rounded-[1.5rem] border border-white/5 space-y-4 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none"></div>
            <div>
              <label className="block text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-zinc-500 mb-2 px-1">Target Localization</label>
              <select
                value={targetLang}
                onChange={(e) => setTargetLang(e.target.value)}
                className="w-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest outline-none focus:ring-2 focus:ring-indigo-500 transition-all cursor-pointer shadow-inner"
              >
                <option value="BURMESE">Burmese (Myanmar)</option>
                <option value="ENGLISH">English (US/UK)</option>
                <option value="THAI">Thai (Siam)</option>
                <option value="CHINESE">Chinese (Mandarin)</option>
                <option value="JAPANESE">Japanese (Nihongo)</option>
                <option value="KOREAN">Korean (K-Pop Style)</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="block text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-zinc-500 px-1 mb-0.5">Production Modules</label>
              <div className="flex items-center gap-3 p-2.5 rounded-xl border border-indigo-500/20 bg-indigo-500/5">
                <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-lg">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                </div>
                <div className="flex-1">
                  <h4 className="text-[10px] font-black uppercase text-slate-900 dark:text-white tracking-widest">Master Script</h4>
                  <p className="text-[8px] font-bold text-indigo-500 dark:text-indigo-400 uppercase tracking-tighter">Essential Localization</p>
                </div>
              </div>

              <button
                onClick={() => setIncludeDeepMeaning(!includeDeepMeaning)}
                className={`w-full flex items-center gap-3 p-2.5 rounded-xl border transition-all text-left group ${includeDeepMeaning ? 'bg-indigo-600 border-indigo-500 text-white shadow-xl' : 'bg-white/5 border-white/5 text-slate-500 dark:text-zinc-400 hover:border-indigo-500/40'}`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${includeDeepMeaning ? 'bg-white/10' : 'bg-slate-200 dark:bg-white/10 group-hover:scale-105'}`}>
                  {includeDeepMeaning ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg> : <div className="w-1.5 h-1.5 bg-slate-400 dark:bg-zinc-600 rounded-full"></div>}
                </div>
                <div className="flex-1">
                  <h4 className="text-[10px] font-black uppercase tracking-widest">Deep Meaning</h4>
                  <p className={`text-[8px] font-bold uppercase tracking-tighter ${includeDeepMeaning ? 'text-indigo-100' : 'text-slate-500 opacity-60'}`}>Neural Cultural Insights</p>
                </div>
              </button>

              <button
                onClick={() => setIncludeHooks(!includeHooks)}
                className={`w-full flex items-center gap-3 p-2.5 rounded-xl border transition-all text-left group ${includeHooks ? 'bg-indigo-600 border-indigo-500 text-white shadow-xl' : 'bg-white/5 border-white/5 text-slate-500 dark:text-zinc-400 hover:border-indigo-500/40'}`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${includeHooks ? 'bg-white/10' : 'bg-slate-200 dark:bg-white/10 group-hover:scale-105'}`}>
                  {includeHooks ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg> : <div className="w-1.5 h-1.5 bg-slate-400 dark:bg-zinc-600 rounded-full"></div>}
                </div>
                <div className="flex-1">
                  <h4 className="text-[10px] font-black uppercase tracking-widest">Viral Hooks</h4>
                  <p className={`text-[8px] font-bold uppercase tracking-tighter ${includeHooks ? 'text-indigo-100' : 'text-slate-500 opacity-60'}`}>CTR Optimized Titles</p>
                </div>
              </button>
            </div>

            {!isChecked ? (
              <button onClick={handleCheck} className="w-full py-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black uppercase tracking-[0.25em] shadow-2xl shadow-indigo-600/20 transition-all active:scale-[0.98]">Lock Synthesis Protocol</button>
            ) : (
              <button onClick={handleTranslate} disabled={isProcessing} className={`w-full py-4 rounded-xl text-[10px] font-black uppercase tracking-[0.25em] transition-all shadow-2xl ${isProcessing ? 'bg-slate-100 dark:bg-white/5 text-slate-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20'}`}>{isProcessing ? 'Decoding Neural Net...' : `Execute Studio Master`}</button>
            )}
          </div>
        </div>
      </div>

      {translatedText && !isProcessing && (
        <div className="mt-6 animate-in zoom-in-95 duration-500">
          <div className="glass rounded-[2rem] p-6 border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.3)] relative overflow-hidden">
            <div className="absolute top-0 right-0 p-6 flex gap-3">
                 <button onClick={handleCopy} className={`flex items-center gap-3 px-4 py-2 rounded-xl transition-all font-black text-[9px] uppercase tracking-widest shadow-xl ${copySuccess ? 'bg-emerald-600 text-white' : 'bg-indigo-600 text-white hover:bg-indigo-500 active:scale-95'}`}>
                    {copySuccess ? 'Copied Master' : 'Copy All Data'}
                 </button>
            </div>
            <div className="mb-6">
               <h3 className="text-lg font-black text-slate-900 dark:text-white mb-0.5">Synthesis Complete</h3>
               <p className="text-slate-400 dark:text-zinc-500 text-[9px] font-black uppercase tracking-[0.4em]">Broadcast Grade Output Verified</p>
            </div>
            <div className="space-y-3">
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
