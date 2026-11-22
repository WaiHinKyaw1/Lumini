import React, { useEffect, useMemo, useState } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import { auth } from '../services/firebase';
import toast from 'react-hot-toast';
import { Key, Eye, EyeOff, CheckCircle2, ExternalLink, ShieldCheck, Sparkles } from 'lucide-react';

interface ProfileProps {
  stats: { credits: number; totalGenerated: number };
  isDarkMode: boolean;
  onToggleTheme: () => void;
  onLogout?: () => void;
}

const Icon: React.FC<{ path: string; className?: string }> = ({ path, className = 'h-4 w-4' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={path} />
  </svg>
);

const Profile: React.FC<ProfileProps> = ({
  stats,
  isDarkMode,
  onToggleTheme,
  onLogout,
}) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);

  // Gemini API Key State
  const [geminiKey, setGeminiKey] = useState<string>(() => {
    try {
      return localStorage.getItem('VITE_GEMINI_API_KEY') || '';
    } catch {
      return '';
    }
  });
  const [geminiInput, setGeminiInput] = useState<string>(() => {
    try {
      return localStorage.getItem('VITE_GEMINI_API_KEY') || (import.meta.env.VITE_GEMINI_API_KEY as string) || '';
    } catch {
      return (import.meta.env.VITE_GEMINI_API_KEY as string) || '';
    }
  });
  const [showGeminiKey, setShowGeminiKey] = useState(false);

  // ElevenLabs Key State
  const [elevenKey, setElevenKey] = useState<string>(() => {
    try {
      return localStorage.getItem('lumini_elevenlabs_key') || '';
    } catch {
      return '';
    }
  });
  const [elevenInput, setElevenInput] = useState<string>(() => {
    try {
      return localStorage.getItem('lumini_elevenlabs_key') || '';
    } catch {
      return '';
    }
  });
  const [showElevenKey, setShowElevenKey] = useState(false);

  useEffect(() => {
    setUser(auth.currentUser);
  }, []);

  const initials = useMemo(() => {
    const source = user?.displayName || user?.email || 'U';
    return source.trim().charAt(0).toUpperCase();
  }, [user]);

  const handleSaveGeminiKey = () => {
    const trimmed = geminiInput.trim();
    setGeminiKey(trimmed);
    try {
      if (trimmed) {
        localStorage.setItem('VITE_GEMINI_API_KEY', trimmed);
        toast.success('Gemini API Key အောင်မြင်စွာ သိမ်းဆည်းပြီးပါပြီ');
      } else {
        localStorage.removeItem('VITE_GEMINI_API_KEY');
        toast('Gemini Key ကို Default သို့ ပြန်ပြောင်းလိုက်ပါသည်');
      }
    } catch {
      toast.error('Key သိမ်းဆည်း၍ မရပါ');
    }
  };

  // const handleResetGeminiKey = () => {
  //   const defaultEnv = (import.meta.env.VITE_GEMINI_API_KEY as string) || '';
  //   setGeminiKey('');
  //   setGeminiInput(defaultEnv);
  //   try {
  //     localStorage.removeItem('VITE_GEMINI_API_KEY');
  //     toast('Default Key သို့ ပြန်လည်ပြောင်းလဲလိုက်ပါသည်');
  //   } catch { }
  // };

  const handleSaveElevenKey = () => {
    const trimmed = elevenInput.trim();
    setElevenKey(trimmed);
    try {
      if (trimmed) {
        localStorage.setItem('lumini_elevenlabs_key', trimmed);
        toast.success('ElevenLabs Key အောင်မြင်စွာ သိမ်းဆည်းပြီးပါပြီ');
      } else {
        localStorage.removeItem('lumini_elevenlabs_key');
        toast('ElevenLabs Key ဖျက်လိုက်ပါပြီ');
      }
    } catch {
      toast.error('Key သိမ်းဆည်း၍ မရပါ');
    }
  };

  const handleResetGeminiKey = () => {
    const defaultEnv = (import.meta.env.VITE_GEMINI_API_KEY as string) || '';
    setGeminiKey('');
    setGeminiInput(defaultEnv);
    try {
      localStorage.removeItem('VITE_GEMINI_API_KEY');
      toast('Default Key သို့ ပြန်လည်ပြောင်းလဲလိုက်ပါသည်');
    } catch { }
  };

  // const handleSaveElevenKey = () => {
  //   const trimmed = elevenInput.trim();
  //   setElevenKey(trimmed);
  //   try {
  //     if (trimmed) {
  //       localStorage.setItem('lumini_elevenlabs_key', trimmed);
  //       toast.success('ElevenLabs Key အောင်မြင်စွာ သိမ်းဆည်းပြီးပါပြီ');
  //     } else {
  //       localStorage.removeItem('lumini_elevenlabs_key');
  //       toast('ElevenLabs Key ဖျက်လိုက်ပါပြီ');
  //     }
  //   } catch {
  //     toast.error('Key သိမ်းဆည်း၍ မရပါ');
  //   }
  // };

  return (
    <div className="module-page mx-auto w-full max-w-5xl space-y-4 pb-8 animate-in fade-in duration-300">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 dark:text-zinc-400 !mb-1">Account center</p>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white !mb-0">Profile &amp; Settings</h1>
          <p className="text-xs text-slate-500 dark:text-zinc-300 !mb-0 mt-1 max-w-xl">သင့်အကောင့်၊ credit balance နဲ့ app preferences တွေကို တစ်နေရာတည်းမှာ စီမံပါ။</p>
        </div>
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
          Account active
        </div>
      </header>

      <section className="overflow-hidden rounded-2xl bg-white dark:bg-[#0c0c0e] border border-gray-200 dark:border-white/10">
        <div className="flex flex-col gap-5 p-4 sm:p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4 sm:gap-5">
            {user?.photoURL ? (
              <img
                src={user.photoURL}
                alt="Profile avatar"
                className="h-14 w-14 shrink-0 rounded-2xl border border-orange-500/30 object-cover sm:h-16 sm:w-16"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-orange-500/15 text-2xl font-bold text-orange-600 dark:text-orange-400 sm:h-16 sm:w-16">
                {initials}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400 dark:text-zinc-400 !mb-1">Your workspace</p>
              <h2 className="truncate !mb-1 text-lg font-bold text-slate-900 dark:text-white">{user?.displayName || 'Studio Creator'}</h2>
              <p className="truncate text-xs text-slate-500 dark:text-zinc-400">{user?.email || 'No email address'}</p>
            </div>
          </div>
          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              aria-label="Sign out လုပ်ရန်"
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-2 text-xs font-bold text-red-600 transition hover:bg-red-500/10 focus:outline-none focus:ring-2 focus:ring-red-500/40 sm:w-auto"
            >
              <Icon path="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              Sign out
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 border-t border-gray-200 dark:border-white/10 sm:grid-cols-3">
          <div className="border-b border-gray-200 dark:border-white/10 px-5 py-3.5 sm:border-b-0 sm:border-r sm:px-7">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-400 !mb-1">Available credits</p>
            <p className="text-2xl font-bold tracking-tight text-orange-600 dark:text-orange-400">{stats.credits} <span className="text-xs font-semibold tracking-wide">CR</span></p>
          </div>
          <div className="border-b border-gray-200 dark:border-white/10 px-5 py-3.5 sm:border-b-0 sm:border-r sm:px-7">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-400 !mb-1">Generated assets</p>
            <p className="text-2xl font-bold tracking-tight text-slate-900 dark:text-zinc-100">{stats.totalGenerated}</p>
          </div>
          <div className="px-5 py-3.5 sm:px-7">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-400 !mb-1">Workspace</p>
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-zinc-200">
              <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
              Active
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4">
        {/* API Keys & AI Integrations Section */}
        <section className="rounded-2xl bg-white dark:bg-[#0c0c0e] border border-gray-200 dark:border-white/10 p-4 sm:p-5" aria-labelledby="apikeys-title">
          <div className="mb-4 flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
              <Key className="h-5 w-5" />
            </div>
            <div>
              <h2 id="apikeys-title" className="!mb-1 text-base font-bold text-slate-900 dark:text-white">API Keys &amp; AI Integrations</h2>

            </div>
          </div>

          <div className="space-y-4">
            {/* 1. Google Gemini API Key */}
            <div className="rounded-2xl border border-slate-200/90 dark:border-white/10 bg-slate-50/60 dark:bg-white/[0.02] p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-slate-800 dark:text-zinc-100 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    Google Gemini API Key
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {geminiKey ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                      <CheckCircle2 className="w-3 h-3" /> Custom Key Active
                    </span>
                  ) : (import.meta.env.VITE_GEMINI_API_KEY as string) ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded-full border border-indigo-500/20">
                      <ShieldCheck className="w-3 h-3" /> Vercel Default Active
                    </span>
                  ) : (
                    <span className="text-[11px] font-bold text-slate-400 dark:text-zinc-500 bg-slate-200/60 dark:bg-zinc-800 px-2.5 py-1 rounded-full">
                      Not Configured
                    </span>
                  )}
                </div>
              </div>



              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type={showGeminiKey ? 'text' : 'password'}
                    placeholder="AQ.Ab8RN... သို့မဟုတ် AIzaSy..."
                    value={geminiInput}
                    onChange={(e) => setGeminiInput(e.target.value)}
                    className="w-full pr-10 pl-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-black/30 text-xs font-mono text-slate-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowGeminiKey(!showGeminiKey)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 p-1"
                    title={showGeminiKey ? 'Hide key' : 'Show key'}
                  >
                    {showGeminiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSaveGeminiKey}
                    className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-white text-xs font-bold shadow-sm transition-all active:scale-95 cursor-pointer"
                  >
                    Save Key
                  </button>
                  {geminiKey && (
                    <button
                      type="button"
                      onClick={handleResetGeminiKey}
                      className="px-3 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 text-slate-500 hover:text-rose-500 text-xs font-bold hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-all cursor-pointer"
                      title="Reset to default"
                    >
                      Reset Default
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400 hover:underline"
                >
                  <span>Google AI Studio မှ အခမဲ့ API Key ရယူရန်</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>

            {/* 2. ElevenLabs Voice API Key */}
            <div className="rounded-2xl border border-slate-200/90 dark:border-white/10 bg-slate-50/60 dark:bg-white/[0.02] p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="font-bold text-sm text-slate-800 dark:text-zinc-100 flex items-center gap-1.5">
                  <Key className="w-4 h-4 text-purple-500" />
                  ElevenLabs API Key (Voice Clone)
                </span>
                {elevenKey ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-purple-600 dark:text-purple-400 bg-purple-500/10 px-2.5 py-1 rounded-full border border-purple-500/20">
                    <CheckCircle2 className="w-3 h-3" /> Key Active
                  </span>
                ) : (
                  <span className="text-[11px] font-bold text-slate-400 dark:text-zinc-500 bg-slate-200/60 dark:bg-zinc-800 px-2.5 py-1 rounded-full">
                    Default / Optional
                  </span>
                )}
              </div>



              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type={showElevenKey ? 'text' : 'password'}
                    placeholder="sk_..."
                    value={elevenInput}
                    onChange={(e) => setElevenInput(e.target.value)}
                    className="w-full pr-10 pl-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-black/30 text-xs font-mono text-slate-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowElevenKey(!showElevenKey)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 p-1"
                    title={showElevenKey ? 'Hide key' : 'Show key'}
                  >
                    {showElevenKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSaveElevenKey}
                    className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-sm transition-all active:scale-95 cursor-pointer"
                  >
                    Save Key
                  </button>
                  {elevenKey && (
                    <button
                      type="button"
                      onClick={() => {
                        setElevenKey('');
                        setElevenInput('');
                        try {
                          localStorage.removeItem('lumini_elevenlabs_key');
                          toast('ElevenLabs Key ဖျက်လိုက်ပါပြီ');
                        } catch { }
                      }}
                      className="px-3 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 text-slate-500 hover:text-rose-500 text-xs font-bold hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-all cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Appearance Section */}
        {/* API Keys & AI Integrations Section */}
        <section className="rounded-2xl bg-white dark:bg-[#0c0c0e] border border-gray-200 dark:border-white/10 p-4 sm:p-5" aria-labelledby="apikeys-title">
          <div className="mb-4 flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
              <Key className="h-5 w-5" />
            </div>
            <div>
              <h2 id="apikeys-title" className="!mb-1 text-base font-bold text-slate-900 dark:text-white">API Keys &amp; AI Integrations</h2>
              <p className="text-xs text-slate-500 dark:text-zinc-300 !mb-0">Gemini AI နှင့် အသံတုပမှုအတွက် ကိုယ်ပိုင် API Key များကို တစ်နေရာတည်းတွင် စီမံပါ။</p>
            </div>
          </div>

          <div className="space-y-4">
            {/* 1. Google Gemini API Key */}
            <div className="rounded-2xl border border-slate-200/90 dark:border-white/10 bg-slate-50/60 dark:bg-white/[0.02] p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-slate-800 dark:text-zinc-100 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    Google Gemini API Key
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {geminiKey ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                      <CheckCircle2 className="w-3 h-3" /> Custom Key Active
                    </span>
                  ) : (import.meta.env.VITE_GEMINI_API_KEY as string) ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded-full border border-indigo-500/20">
                      <ShieldCheck className="w-3 h-3" /> Vercel Default Active
                    </span>
                  ) : (
                    <span className="text-[11px] font-bold text-slate-400 dark:text-zinc-500 bg-slate-200/60 dark:bg-zinc-800 px-2.5 py-1 rounded-full">
                      Not Configured
                    </span>
                  )}
                </div>
              </div>

              <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">
                One Click ဗီဒီယို ဘာသာပြန်ခြင်း (AWS EC2 worker သို့ တိုက်ရိုက် ပေးပို့အသုံးပြုမည်)၊ Subtitle Studio၊ Video Insights နှင့် Thumbnail Generator တို့တွင် အသုံးပြုပါမည်။
              </p>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type={showGeminiKey ? 'text' : 'password'}
                    placeholder="AQ.Ab8RN... သို့မဟုတ် AIzaSy..."
                    value={geminiInput}
                    onChange={(e) => setGeminiInput(e.target.value)}
                    className="w-full pr-10 pl-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-black/30 text-xs font-mono text-slate-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowGeminiKey(!showGeminiKey)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 p-1"
                    title={showGeminiKey ? 'Hide key' : 'Show key'}
                  >
                    {showGeminiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSaveGeminiKey}
                    className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-white text-xs font-bold shadow-sm transition-all active:scale-95 cursor-pointer"
                  >
                    Save Key
                  </button>
                  {geminiKey && (
                    <button
                      type="button"
                      onClick={handleResetGeminiKey}
                      className="px-3 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 text-slate-500 hover:text-rose-500 text-xs font-bold hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-all cursor-pointer"
                      title="Reset to default"
                    >
                      Reset Default
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400 hover:underline"
                >
                  <span>Google AI Studio မှ အခမဲ့ API Key ရယူရန်</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>

            {/* 2. ElevenLabs Voice API Key */}
            <div className="rounded-2xl border border-slate-200/90 dark:border-white/10 bg-slate-50/60 dark:bg-white/[0.02] p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="font-bold text-sm text-slate-800 dark:text-zinc-100 flex items-center gap-1.5">
                  <Key className="w-4 h-4 text-purple-500" />
                  ElevenLabs API Key (Voice Clone)
                </span>
                {elevenKey ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-purple-600 dark:text-purple-400 bg-purple-500/10 px-2.5 py-1 rounded-full border border-purple-500/20">
                    <CheckCircle2 className="w-3 h-3" /> Key Active
                  </span>
                ) : (
                  <span className="text-[11px] font-bold text-slate-400 dark:text-zinc-500 bg-slate-200/60 dark:bg-zinc-800 px-2.5 py-1 rounded-full">
                    Default / Optional
                  </span>
                )}
              </div>

              <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">
                One Click Recap တွင် ကိုယ်ပိုင်အသံနမူနာ (Voice Sample) တင်၍ အသံတူ ကလုန်းလုပ်ရန် အသုံးပြုပါသည်။
              </p>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type={showElevenKey ? 'text' : 'password'}
                    placeholder="sk_..."
                    value={elevenInput}
                    onChange={(e) => setElevenInput(e.target.value)}
                    className="w-full pr-10 pl-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-black/30 text-xs font-mono text-slate-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowElevenKey(!showElevenKey)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 p-1"
                    title={showElevenKey ? 'Hide key' : 'Show key'}
                  >
                    {showElevenKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSaveElevenKey}
                    className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-sm transition-all active:scale-95 cursor-pointer"
                  >
                    Save Key
                  </button>
                  {elevenKey && (
                    <button
                      type="button"
                      onClick={() => {
                        setElevenKey('');
                        setElevenInput('');
                        try {
                          localStorage.removeItem('lumini_elevenlabs_key');
                          toast('ElevenLabs Key ဖျက်လိုက်ပါပြီ');
                        } catch { }
                      }}
                      className="px-3 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 text-slate-500 hover:text-rose-500 text-xs font-bold hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-all cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Appearance Section */}
        <section className="rounded-2xl bg-white dark:bg-[#0c0c0e] border border-gray-200 dark:border-white/10 p-4 sm:p-5" aria-labelledby="preferences-title">
          <div className="mb-4 flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-500/10 text-slate-600 dark:text-zinc-300">
              <Icon path="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" className="h-5 w-5" />
            </div>
            <div>
              <h2 id="preferences-title" className="!mb-1 text-base font-bold text-slate-900 dark:text-white">Appearance</h2>
              <p className="text-xs text-slate-500 dark:text-zinc-300 !mb-0">App ရဲ့ အရောင်ပုံစံကို ရွေးချယ်ပါ။</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={isDarkMode ? 'Light mode ပြောင်းရန်' : 'Dark mode ပြောင်းရန်'}
            className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white/60 px-4 py-3 text-left transition hover:border-orange-500/40 hover:bg-orange-500/5 dark:border-white/10 dark:bg-black/20 dark:hover:bg-orange-500/10"
          >
            <span>
              <span className="block text-sm font-semibold text-slate-800 dark:text-zinc-100">{isDarkMode ? 'Dark mode' : 'Light mode'}</span>
              <span className="mt-0.5 block text-xs text-slate-500 dark:text-zinc-400">သင်ရွေးထားသော theme</span>
            </span>
            <span className="rounded-lg bg-slate-100 p-2 text-orange-600 dark:bg-white/10 dark:text-orange-400">
              <Icon path={isDarkMode ? 'M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z' : 'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z'} />
            </span>
          </button>
          <div className="mt-4 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-white/[0.03]">
            <p className="text-xs font-semibold text-slate-700 dark:text-zinc-200">Privacy note</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-zinc-400">Theme preference ကို ဒီ browser မှာ သိမ်းထားပါတယ်။</p>
          </div>
        </section>
      </div>
    </div>
  );
};

export default React.memo(Profile);
