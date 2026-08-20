import React, { useEffect, useMemo, useState } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import { toast } from 'react-hot-toast';
import { auth } from '../services/firebase';
import { STORAGE_KEYS } from '../services/storage';

interface ProfileProps {
  stats: { credits: number; totalGenerated: number };
  isDarkMode: boolean;
  onToggleTheme: () => void;
  onApiKeyChange?: (hasKey: boolean) => void;
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
  onApiKeyChange,
  onLogout,
}) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    setUser(auth.currentUser);
    const storedKey = localStorage.getItem(STORAGE_KEYS.geminiApiKey) || '';
    setApiKey(storedKey);
    setIsSaved(Boolean(storedKey));
  }, []);

  const initials = useMemo(() => {
    const source = user?.displayName || user?.email || 'U';
    return source.trim().charAt(0).toUpperCase();
  }, [user]);

  const handleSaveKey = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedKey = apiKey.trim();
    if (!trimmedKey) {
      toast.error('ကျေးဇူးပြု၍ API Key ထည့်သွင်းပါ။');
      return;
    }

    try {
      localStorage.setItem(STORAGE_KEYS.geminiApiKey, trimmedKey);
      setApiKey(trimmedKey);
      setIsSaved(true);
      onApiKeyChange?.(true);
      toast.success('API Key ကို ဒီ browser ထဲမှာ သိမ်းဆည်းပြီးပါပြီ။');
    } catch {
      toast.error('API Key သိမ်းဆည်းရာမှာ အခက်အခဲရှိနေပါတယ်။');
    }
  };

  const handleClearKey = () => {
    if (!window.confirm('သိမ်းဆည်းထားသော API Key ကို ဖျက်မလား?')) {
      return;
    }

    try {
      localStorage.removeItem(STORAGE_KEYS.geminiApiKey);
      setApiKey('');
      setIsSaved(false);
      onApiKeyChange?.(false);
      toast.success('Custom API Key ကို ဖျက်ပြီးပါပြီ။');
    } catch {
      toast.error('API Key ဖျက်ရာမှာ အခက်အခဲရှိနေပါတယ်။');
    }
  };

  const handleTestKey = async () => {
    const trimmedKey = apiKey.trim();
    if (!trimmedKey) {
      toast.error('စမ်းသပ်ရန် API Key ထည့်သွင်းပါ။');
      return;
    }

    setIsTesting(true);
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(trimmedKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: 'Reply with OK.' }] }] }),
        },
      );
      const data = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        error?: { message?: string };
      };

      if (response.ok && data.candidates?.[0]?.content?.parts?.[0]?.text) {
        toast.success('API Key အလုပ်လုပ်နေပါတယ်။');
      } else {
        toast.error(data.error?.message || 'API Key ကို စစ်ဆေးလို့ မရသေးပါ။');
      }
    } catch {
      toast.error('API service ချိတ်ဆက်ရာမှာ အခက်အခဲရှိနေပါတယ်။');
    } finally {
      setIsTesting(false);
    }
  };

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
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-400 !mb-1">API access</p>
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-zinc-200">
              <span className={`h-2 w-2 rounded-full ${isSaved ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-zinc-600'}`} aria-hidden="true" />
              {isSaved ? 'Custom key active' : 'Default access'}
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(260px,0.65fr)]">
        <section className="rounded-2xl bg-white dark:bg-[#0c0c0e] border border-gray-200 dark:border-white/10 p-4 sm:p-5" aria-labelledby="api-settings-title">
          <div className="mb-4 flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400">
              <Icon path="M15.75 5.25a3 3 0 013 3m0 0a3 3 0 013 3m-3-3a3 3 0 01-3 3m3-3a3 3 0 00-3-3M12 12l-2.25 2.25m0 0L7.5 16.5m2.25-2.25l2.25 2.25m-2.25-2.25l-2.25-2.25M15 7.5l-3 3" className="h-5 w-5" />
            </div>
            <div>
              <h2 id="api-settings-title" className="!mb-1 text-base font-bold text-slate-900 dark:text-white">Gemini API Key</h2>
              <p className="text-xs text-slate-500 dark:text-zinc-300 !mb-0">Custom key အသုံးပြုလိုပါက ဒီနေရာမှာ ထည့်သွင်းနိုင်ပါတယ်။ Key ကို သင့် browser ထဲမှာပဲ သိမ်းထားပါတယ်။</p>
            </div>
          </div>

          <form className="space-y-3" onSubmit={handleSaveKey}>
            <div>
              <label htmlFor="gemini-api-key" className="mb-2 block">API key</label>
              <div className="relative">
                <input
                  id="gemini-api-key"
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  placeholder="AIzaSy..."
                  autoComplete="off"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 pr-12 font-mono text-xs outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-white/10 dark:bg-white/5"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((visible) => !visible)}
                  aria-label={showKey ? 'API key ဖျောက်ရန်' : 'API key ပြရန်'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/40 dark:hover:bg-white/10 dark:hover:text-zinc-100"
                >
                  <Icon path={showKey ? 'M3 3l18 18M10.584 10.587a2 2 0 002.829 2.829M9.88 4.24A10.4 10.4 0 0112 4c4.478 0 8.268 2.943 9.542 7a10.5 10.5 0 01-2.024 3.667M6.228 6.228C4.46 7.57 3.17 9.16 2.458 11c.946 3.015 3.554 5.42 6.543 6.88' : 'M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7zM15 12a3 3 0 11-6 0 3 3 0 016 0z'} />
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={handleTestKey}
                disabled={isTesting || !apiKey.trim()}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-white/5"
              >
                {isTesting && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />}
                {isTesting ? 'Checking...' : 'Test key'}
              </button>
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-orange-600 px-5 py-2 text-xs font-bold text-white transition hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
              >
                <Icon path="M5 13l4 4L19 7" />
                Save key
              </button>
            </div>
          </form>

          {isSaved && (
            <div className="mt-4 flex flex-col gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                <Icon path="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                Custom key is active
              </div>
              <button type="button" onClick={handleClearKey} className="text-left text-xs font-semibold text-slate-500 transition hover:text-red-600 dark:text-zinc-400 dark:hover:text-red-400 sm:text-right">
                Remove key
              </button>
            </div>
          )}
        </section>

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
            <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-zinc-400">API key နဲ့ preference တွေကို ဒီ browser ရဲ့ local storage မှာပဲ သိမ်းထားပါတယ်။</p>
          </div>
        </section>
      </div>
    </div>
  );
};

export default React.memo(Profile);
