
import React, { useState, useEffect } from 'react';
import { generateText } from '../services/geminiService';
import { CREDIT_COSTS, ContentType, JsonValue, JsonRecord } from '../types';
import { auth } from '../services/firebase';
import { logGeneration } from '../services/supabase';
import { ModuleLogHistory } from '../components/ModuleLogHistory';
import { RecentHistory } from '../components/RecentHistory';


interface TranslationProps {
  onSpendCredits: (amount: number) => boolean;
}

const Translation: React.FC<TranslationProps> = ({ onSpendCredits }) => {
  const [sourceText, setSourceText] = useState('');
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [targetLang, setTargetLang] = useState('BURMESE');

  const [includeDeepMeaning, setIncludeDeepMeaning] = useState(false);
  const [includeHooks, setIncludeHooks] = useState(false);

  const [isProcessing, setIsProcessing] = useState(false);
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isChecked, setIsChecked] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  const MAX_CHARS = 30000;

  // Recent-task restore: repopulate the translation inputs from a previous task
  const handleRestoreTranslation = (input: JsonValue) => {
    if (!input || typeof input !== 'object') return;
    if (typeof (input as JsonRecord).sourceText === 'string') setSourceText((input as JsonRecord).sourceText as string);
    if (typeof (input as JsonRecord).targetLang === 'string') setTargetLang((input as JsonRecord).targetLang as string);
    if ((input as JsonRecord).includeDeepMeaning === true || (input as JsonRecord).includeDeepMeaning === false) setIncludeDeepMeaning((input as JsonRecord).includeDeepMeaning as boolean);
    if ((input as JsonRecord).includeHooks === true || (input as JsonRecord).includeHooks === false) setIncludeHooks((input as JsonRecord).includeHooks as boolean);
    setTranslatedText(null);
    setIsChecked(false);
    setError(null);
  };

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

      const currentUser = auth.currentUser;
      if (currentUser) {
        await logGeneration(
          currentUser.uid,
          currentUser.email || '',
          'translation',
          { sourceText, targetLang, includeDeepMeaning, includeHooks },
          { resultLength: result?.length || 0, preview: result?.substring(0, 150) + "..." }
        );
        window.dispatchEvent(
          new CustomEvent('lumini:taskLogged', {
            detail: { module: 'translation', input: { sourceText, targetLang, includeDeepMeaning, includeHooks } },
          })
        );
        setRefreshTrigger(prev => prev + 1);
      }

    } catch (err: unknown) {
      setError((err as { message?: string })?.message || "Something went wrong during translation.");
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
    <div className="module-page max-w-4xl mx-auto pb-6">

      <div className="flex items-center gap-3 mb-4">
        <div className="p-2.5 rounded-xl bg-accent/10 flex items-center justify-center">
          <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 5h12M9 3v2m1.048 9.516a3.303 3.303 0 01-3.352-3.352c0-1.85 1.502-3.352 3.352-3.352s3.352 1.502 3.352 3.352-1.502 3.352-3.352 3.352z" />
          </svg>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white !mb-0">Localization Engine</h1>
          <p className="text-xs text-slate-500 dark:text-zinc-300 mt-1">Global Master Synchronization • {CREDIT_COSTS[ContentType.TRANSLATION]} Credits</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 space-y-4">
          <div className="rounded-2xl bg-white dark:bg-[#0c0c0e] border border-gray-200 dark:border-white/10 p-4 sm:p-5 space-y-4">
            <div className="flex justify-between items-center">
              <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-zinc-400 !mb-0">Source Master Script</label>
              <div className="flex gap-4 px-1">
                <button onClick={handlePaste} className="text-[10px] font-semibold uppercase text-accent hover:text-accent-hover transition-colors !mb-0">Paste</button>
                <button onClick={handleClear} className="text-[10px] font-semibold uppercase text-rose-500 hover:text-rose-400 transition-colors !mb-0">Clear</button>
              </div>
            </div>

            <textarea
              value={sourceText}
              onChange={(e) => {
                setSourceText(e.target.value.slice(0, MAX_CHARS));
                setIsChecked(false);
              }}
              placeholder="Paste master script for professional localization..."
              className="w-full h-64 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl p-4 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-accent outline-none transition-all resize-none leading-relaxed"
            />

            <div className="flex justify-between items-center px-1 pt-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-zinc-400 !mb-0">{sourceText.length.toLocaleString()} Chars Buffer</span>
              <div className="flex items-center gap-2">
                 <div className="w-2 h-2 bg-accent rounded-full animate-pulse shadow-[0_0_8px_rgba(225,29,72,0.4)]"></div>
                 <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-zinc-400 !mb-0">System Ready</span>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-2xl bg-white dark:bg-[#0c0c0e] border border-gray-200 dark:border-white/10 p-4 sm:p-5 space-y-4 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-accent/5 rounded-full blur-3xl pointer-events-none"></div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-zinc-400 !mb-2 px-1">Target Localization</label>
              <select
                value={targetLang}
                onChange={(e) => setTargetLang(e.target.value)}
                className="w-full bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs uppercase tracking-wide outline-none focus:ring-2 focus:ring-accent transition-all cursor-pointer !mb-0"
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
              <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-zinc-400 px-1 !mb-2">Production Modules</label>
              <div className="flex items-center gap-3 p-3 rounded-xl border border-accent/20 bg-accent/5">
                <div className="p-2 rounded-lg bg-accent flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M5 13l4 4L19 7" /></svg>
                </div>
                <div className="flex-1">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white !mb-0">Master Script</h4>
                  <p className="text-[10px] font-semibold text-accent uppercase tracking-wide !mb-0">Essential Localization</p>
                </div>
              </div>

              <button
                onClick={() => setIncludeDeepMeaning(!includeDeepMeaning)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left group ${includeDeepMeaning ? 'bg-accent border-accent text-white shadow-xl shadow-accent/20' : 'bg-gray-50 dark:bg-white/5 border-gray-200 dark:border-white/10 text-slate-500 dark:text-zinc-400 hover:border-accent/40'}`}
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${includeDeepMeaning ? 'bg-white/10' : 'bg-gray-100 dark:bg-white/5 group-hover:scale-105'}`}>
                  {includeDeepMeaning ? <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M5 13l4 4L19 7" /></svg> : <div className="w-2 h-2 bg-slate-400 dark:bg-zinc-500 rounded-full"></div>}
                </div>
                <div className="flex-1">
                  <h4 className="text-xs font-bold !mb-0">Deep Meaning</h4>
                  <p className={`text-[10px] font-semibold uppercase tracking-wide !mb-0 ${includeDeepMeaning ? 'text-white' : 'text-slate-400 dark:text-zinc-400'}`}>Neural Cultural Insights</p>
                </div>
              </button>

              <button
                onClick={() => setIncludeHooks(!includeHooks)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left group ${includeHooks ? 'bg-accent border-accent text-white shadow-xl shadow-accent/20' : 'bg-gray-50 dark:bg-white/5 border-gray-200 dark:border-white/10 text-slate-500 dark:text-zinc-400 hover:border-accent/40'}`}
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${includeHooks ? 'bg-white/10' : 'bg-gray-100 dark:bg-white/5 group-hover:scale-105'}`}>
                  {includeHooks ? <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M5 13l4 4L19 7" /></svg> : <div className="w-2 h-2 bg-slate-400 dark:bg-zinc-500 rounded-full"></div>}
                </div>
                <div className="flex-1">
                  <h4 className="text-xs font-bold !mb-0">Viral Hooks</h4>
                  <p className={`text-[10px] font-semibold uppercase tracking-wide !mb-0 ${includeHooks ? 'text-white' : 'text-slate-400 dark:text-zinc-400'}`}>CTR Optimized Titles</p>
                </div>
              </button>
            </div>

            {!isChecked ? (
              <button onClick={handleCheck} className="w-full py-2 px-4 rounded-lg bg-slate-900 dark:bg-zinc-800 text-white border border-transparent hover:bg-slate-800 dark:hover:bg-zinc-700 text-xs font-semibold uppercase tracking-wide transition-all active:scale-[0.98]">Lock Synthesis Protocol</button>
            ) : (
              <button onClick={handleTranslate} disabled={isProcessing} aria-label="ဗီဒီယိုစာသား မြန်မာဘာသာပြန်ရန်" className={`w-full py-2 px-4 rounded-lg text-xs font-semibold uppercase tracking-wide transition-all active:scale-[0.98] ${isProcessing ? 'bg-gray-100 dark:bg-white/5 text-slate-400 dark:text-zinc-400 cursor-not-allowed' : 'bg-accent hover:bg-accent-hover text-white'}`}>{isProcessing ? 'Decoding Neural Net...' : `Execute Studio Master`}</button>
            )}
          </div>
        </div>
      </div>

      {translatedText && !isProcessing && (
        <div className="mt-6 animate-in zoom-in-95 duration-500">
          <div className="rounded-2xl bg-white dark:bg-[#0c0c0e] border border-gray-200 dark:border-white/10 p-4 sm:p-5 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 flex gap-3">
                 <button onClick={handleCopy} className={`flex items-center gap-2 px-4 py-1.5 rounded-lg transition-all text-[10px] font-semibold uppercase tracking-wide !mb-0 ${copySuccess ? 'bg-emerald-600 text-white' : 'bg-accent text-white hover:bg-accent-hover active:scale-[0.98]'}`}>
                    {copySuccess ? 'Copied Master' : 'Copy All Data'}
                 </button>
            </div>
            <div className="mb-4">
               <h3 className="text-sm font-bold text-slate-900 dark:text-white !mb-1">Synthesis Complete</h3>
               <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-zinc-400 !mb-0">Broadcast Grade Output Verified</p>
            </div>
            <div className="space-y-4">
              {renderResult()}
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-rose-600 text-white px-5 py-3 rounded-xl text-[10px] font-semibold shadow-xl z-50 animate-in slide-in-from-bottom-10 uppercase tracking-wide">
          Critical Synthesis Error: {error}
        </div>
      )}

      <RecentHistory moduleName="translation" onRestore={handleRestoreTranslation} />
      <div className="mt-3" />
      <ModuleLogHistory moduleName="translation" refreshTrigger={refreshTrigger} />
    </div>
  );
};

export default Translation;
